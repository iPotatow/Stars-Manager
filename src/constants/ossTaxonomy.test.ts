import { describe, expect, it } from 'vitest';
import {
  buildOssTaxonomyKeywords,
  getOssTaxonomyTerm,
  ossTaxonomy,
  OSS_TAXONOMY_COMMIT,
  OSS_TAXONOMY_FACETS,
} from './ossTaxonomy';

describe('bundled OSS Taxonomy snapshot', () => {
  it('keeps the pinned upstream version and complete facet counts', () => {
    expect(ossTaxonomy.version).toBe('0.1.0');
    expect(OSS_TAXONOMY_COMMIT).toBe('8d11fff9aa4d9bd3b846f6569ba72713dfe93b71');
    expect(OSS_TAXONOMY_FACETS.map(facet => facet.id)).toEqual([
      'domain', 'role', 'technology', 'audience', 'layer', 'function',
    ]);
    expect({
      domain: ossTaxonomy.domain.length,
      role: ossTaxonomy.role.length,
      technology: ossTaxonomy.technology.length,
      audience: ossTaxonomy.audience.length,
      layer: ossTaxonomy.layer.length,
      function: ossTaxonomy.function.length,
    }).toEqual({ domain: 22, role: 22, technology: 63, audience: 14, layer: 12, function: 68 });
  });

  it('uses canonical names, aliases, and tags without project examples', () => {
    const term = getOssTaxonomyTerm('domain', 'machine-learning');
    expect(term?.examples).toContain('tensorflow');

    const keywords = buildOssTaxonomyKeywords([{ facet: 'domain', terms: ['machine-learning'] }]);
    expect(keywords).toContain('machine-learning');
    expect(keywords).toContain('ai');
    expect(keywords).not.toContain('tensorflow');
  });
});
