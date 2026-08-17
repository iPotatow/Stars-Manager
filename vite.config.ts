import { defineConfig } from 'vite';
import vueJsx from '@vitejs/plugin-vue-jsx';
import legacy from '@vitejs/plugin-legacy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const wrapReactFunctionComponents = {
  name: 'wrap-react-components-for-vue',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (!id.includes('/src/') || !id.endsWith('.tsx') || id.includes('.test.')) return null;

    const sourceFile = ts.createSourceFile(id, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const transformed = ts.transform(sourceFile, [context => {
      const visit: ts.Visitor = node => {
        if (ts.isVariableDeclaration(node) && node.type && node.initializer) {
          const declaredType = node.type.getText(sourceFile);
          const initializer = node.initializer;
          const alreadyWrapped = ts.isCallExpression(initializer)
            && (initializer.expression.getText(sourceFile) === 'memo' || initializer.expression.getText(sourceFile) === 'React.memo');
          const isFunctionComponent = /^React\.FC(?:<|$)/.test(declaredType)
            && (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));

          if (isFunctionComponent && !alreadyWrapped) {
            return context.factory.updateVariableDeclaration(
              node,
              node.name,
              node.exclamationToken,
              node.type,
              context.factory.createCallExpression(
                context.factory.createPropertyAccessExpression(context.factory.createIdentifier('React'), 'memo'),
                undefined,
                [initializer],
              ),
            );
          }
        }
        return ts.visitEachChild(node, visit, context);
      };
      return root => ts.visitNode(root, visit) as ts.SourceFile;
    }]).transformed[0] as ts.SourceFile;

    const output = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(transformed);
    return { code: output, map: null };
  },
};

export default defineConfig({
  base: '/',
  plugins: [
    wrapReactFunctionComponents,
    vueJsx(),
    legacy({
      targets: ['defaults', 'not IE 11', 'Chrome >= 60', 'Firefox >= 60', 'Safari >= 12', 'Edge >= 79'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true,
      // The production CSP intentionally excludes data: scripts. Legacy
      // chunks are no longer served, so avoid Vite's data: module guard.
      renderLegacyChunks: false,
    }),
  ],
  resolve: {
    alias: [{
      find: /^react$/,
      replacement: path.resolve(projectRoot, 'src/vue-compat.ts'),
    }, {
      find: /^react-dom$/,
      replacement: path.resolve(projectRoot, 'src/vue-dom-compat.ts'),
    }, {
      find: /^@testing-library\/react$/,
      replacement: path.resolve(projectRoot, 'src/vue-testing-library-compat.ts'),
    }],
  },
  build: {
    // The app intentionally ships as a single-screen SPA with legacy browser support.
    // Keep the warning threshold aligned with the current split chunks so Vite still
    // reports genuinely outsized future bundles without flagging the expected entry.
    chunkSizeWarningLimit: 2500,
    rolldownOptions: {
      checks: {
        // The legacy plugin dominates production build time by design; this build
        // is useful when profiling, but too noisy for normal release builds.
        pluginTimings: false,
      },
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/vue')) {
            return 'vue-vendor';
          }
          if (id.includes('node_modules/@lucide/vue')) {
            return 'ui-vendor';
          }
        },
      },
    },
  },
});
