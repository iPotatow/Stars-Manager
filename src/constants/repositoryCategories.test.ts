import { describe, expect, it } from 'vitest';
import {
  defaultCategories,
  getDefaultCategoryNames,
  migrateCategoryIds,
  migrateCategoryName,
  migrateRepositoryCategory,
} from './repositoryCategories';

describe('repository categorization model', () => {
  it('uses the fixed Chinese application categories', () => {
    expect(defaultCategories).toHaveLength(14);
    expect(defaultCategories[0].id).toBe('all');
    expect(defaultCategories.map(category => category.id)).toEqual([
      'all', 'web', 'mobile', 'desktop', 'database', 'ai', 'devtools',
      'security', 'game', 'design', 'productivity', 'education', 'social', 'analytics',
    ]);
    expect(getDefaultCategoryNames('zh')).toContain('Web应用');
    expect(getDefaultCategoryNames('en')).toContain('Web Apps');
    expect(getDefaultCategoryNames('zh')).not.toContain('全部分类');
  });

  it('maps old sidebar preferences into the fixed category ids', () => {
    expect(migrateCategoryIds(['frontend', 'delivery', 'learning', 'frontend'])).toEqual([
      'web', 'devtools', 'education',
    ]);
  });

  it('keeps previous repository assignments visible after the category change', () => {
    expect(migrateCategoryName('前端与界面')).toBe('Web应用');
    expect(migrateRepositoryCategory({ custom_category: '工程与交付' })).toEqual({
      custom_category: '开发工具',
    });
  });
});
