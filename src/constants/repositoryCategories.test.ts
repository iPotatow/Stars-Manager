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
    expect(defaultCategories).toHaveLength(12);
    expect(defaultCategories[0].id).toBe('all');
    expect(defaultCategories.map(category => category.id)).toEqual([
      'all', 'web', 'mobile', 'desktop', 'database', 'ai', 'devtools',
      'security', 'game', 'design', 'productivity', 'analytics',
    ]);
    expect(getDefaultCategoryNames('zh')).toContain('Web应用');
    expect(getDefaultCategoryNames('en')).toContain('Web Apps');
    expect(getDefaultCategoryNames('zh')).toContain('人工智能');
    expect(getDefaultCategoryNames('en')).toContain('Artificial Intelligence');
    expect(getDefaultCategoryNames('zh')).not.toContain('教育学习');
    expect(getDefaultCategoryNames('zh')).not.toContain('社交网络');
    expect(getDefaultCategoryNames('zh')).not.toContain('全部分类');
  });

  it('maps old sidebar preferences into the fixed category ids', () => {
    expect(migrateCategoryIds(['frontend', 'delivery', 'learning', 'frontend'])).toEqual([
      'web', 'devtools',
    ]);
  });

  it('keeps previous repository assignments visible after the category change', () => {
    expect(migrateCategoryName('前端与界面')).toBe('Web应用');
    expect(migrateRepositoryCategory({ custom_category: '工程与交付' })).toEqual({
      custom_category: '开发工具',
    });
    expect(migrateCategoryName('AI/机器学习')).toBe('人工智能');
    expect(migrateCategoryName('教育学习')).toBeUndefined();
    expect(migrateCategoryName('社交网络')).toBeUndefined();
    expect(migrateRepositoryCategory({ custom_category: '社交网络' })).toEqual({
      custom_category: undefined,
    });
  });
});
