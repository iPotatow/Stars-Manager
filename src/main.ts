import './polyfills.ts';

import { createApp, defineComponent, h } from 'vue';
import App from './App.tsx';
import './index.css';
import { DialogProvider } from './hooks/useDialog';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

const Root = defineComponent({
  setup() {
    return () => h(DialogProvider, null, { default: () => h(App) });
  },
});

createApp(Root).mount(rootElement);
