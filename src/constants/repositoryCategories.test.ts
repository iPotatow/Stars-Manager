import { describe, expect, it } from 'vitest';
import {
  defaultCategories,
  getDefaultCategoryNames,
  migrateCategoryIds,
  migrateCategoryName,
  migrateRepositoryCategory,
} from './repositoryCategories';

describe('repository categorization model', () => {
  it('uses the complete six-facet OSS Taxonomy snapshot', () => {
    expect(defaultCategories).toHaveLength(202);
    expect(defaultCategories[0].id).toBe('all');
    expect(new Set(defaultCategories.slice(1).map(category => category.facet))).toEqual(new Set([
      'domain', 'role', 'technology', 'audience', 'layer', 'function',
    ]));
    expect(defaultCategories.some(category => category.id === 'oss:domain:machine-learning')).toBe(true);
    expect(defaultCategories.some(category => category.id === 'oss:role:cli-tool')).toBe(true);
    expect(defaultCategories.some(category => category.id === 'ai')).toBe(false);
    expect(getDefaultCategoryNames('zh')).toContain('machine-learning');
    expect(getDefaultCategoryNames('en')).toContain('cli-tool');
    expect(getDefaultCategoryNames('zh')).not.toContain('全部分类');
  });

  it('maps old sidebar preferences into specific taxonomy terms', () => {
    expect(migrateCategoryIds(['frontend', 'delivery', 'learning', 'frontend'])).toEqual([
      'oss:layer:frontend', 'oss:domain:devops', 'oss:domain:education',
    ]);
  });

  it('keeps previous repository assignments visible after the taxonomy change', () => {
    expect(migrateCategoryName('前端与界面')).toBe('Developer');
    expect(migrateRepositoryCategory({ custom_category: '工程与交付' })).toEqual({
      custom_category: 'DevOps',
    });
  });
});
