import taxonomySnapshot from '../data/oss-taxonomy.json';

export type OssTaxonomyFacet =
  | 'domain'
  | 'role'
  | 'technology'
  | 'audience'
  | 'layer'
  | 'function';

export interface OssTaxonomyTerm {
  name: string;
  description: string;
  examples?: string[];
  related?: string[];
  aliases?: string[];
  ecosystems?: string[];
  tags?: string[];
}

interface OssTaxonomySnapshot {
  version: string;
  generated_at: string;
  domain: OssTaxonomyTerm[];
  role: OssTaxonomyTerm[];
  technology: OssTaxonomyTerm[];
  audience: OssTaxonomyTerm[];
  layer: OssTaxonomyTerm[];
  function: OssTaxonomyTerm[];
}

export interface OssTaxonomySelection {
  facet: OssTaxonomyFacet;
  terms: string[];
}

export const OSS_TAXONOMY_FACETS: ReadonlyArray<{
  id: OssTaxonomyFacet;
  label: string;
  labelZh: string;
  icon: string;
}> = [
  { id: 'domain', label: 'Domain', labelZh: '领域', icon: '🌐' },
  { id: 'role', label: 'Role', labelZh: '角色', icon: '🧩' },
  { id: 'technology', label: 'Technology', labelZh: '技术', icon: '⚙️' },
  { id: 'audience', label: 'Audience', labelZh: '受众', icon: '👥' },
  { id: 'layer', label: 'Layer', labelZh: '层级', icon: '🗂️' },
  { id: 'function', label: 'Function', labelZh: '功能', icon: '🎯' },
];

const TERM_LABEL_OVERRIDES: Record<string, string> = {
  api: 'API',
  ci: 'CI',
  cli: 'CLI',
  css: 'CSS',
  devops: 'DevOps',
  ffi: 'FFI',
  html: 'HTML',
  http: 'HTTP',
  rpc: 'RPC',
  sbom: 'SBOM',
  sdk: 'SDK',
  tui: 'TUI',
  wasm: 'Wasm',
};

export const formatOssTaxonomyTermName = (name: string): string => (
  name
    .split('-')
    .map(part => TERM_LABEL_OVERRIDES[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ')
);

export const OSS_TAXONOMY_SOURCE = 'https://github.com/ecosyste-ms/oss-taxonomy';
export const OSS_TAXONOMY_COMMIT = '8d11fff9aa4d9bd3b846f6569ba72713dfe93b71';

export const ossTaxonomy = taxonomySnapshot as OssTaxonomySnapshot;

const taxonomyTermIndex = new Map<string, OssTaxonomyTerm>();

for (const facet of ['domain', 'role', 'technology', 'audience', 'layer', 'function'] as const) {
  for (const term of ossTaxonomy[facet]) {
    taxonomyTermIndex.set(`${facet}:${term.name}`, term);
  }
}

export const getOssTaxonomyTerm = (
  facet: OssTaxonomyFacet,
  name: string,
): OssTaxonomyTerm | undefined => taxonomyTermIndex.get(`${facet}:${name}`);

/**
 * Resolve upstream taxonomy selections into stable matching terms.
 *
 * Related terms and examples are intentionally excluded: they are useful for
 * browsing, but make poor classifier signals because they cross facets or name
 * individual projects. Names, aliases, and tags remain directly traceable to
 * the bundled OSS Taxonomy snapshot.
 */
export const buildOssTaxonomyKeywords = (
  selections: OssTaxonomySelection[],
  supplementalKeywords: string[] = [],
): string[] => {
  const keywords = new Set<string>();

  for (const selection of selections) {
    for (const termName of selection.terms) {
      const term = getOssTaxonomyTerm(selection.facet, termName);
      if (!term) {
        throw new Error(`Unknown OSS Taxonomy term: ${selection.facet}:${termName}`);
      }
      [term.name, ...(term.aliases ?? []), ...(term.tags ?? [])]
        .map(keyword => keyword.trim())
        .filter(Boolean)
        .forEach(keyword => keywords.add(keyword));
    }
  }

  supplementalKeywords
    .map(keyword => keyword.trim())
    .filter(Boolean)
    .forEach(keyword => keywords.add(keyword));

  return [...keywords];
};
