import { describe, expect, it } from 'vitest';
import {
  defaultCategories,
  getDefaultCategoryNames,
  migrateCategoryIds,
  migrateCategoryName,
  migrateRepositoryCategory,
} from './repositoryCategories';

describe('repository categorization model', () => {
  it('uses the focused default taxonomy', () => {
    expect(defaultCategories.map(category => category.id)).toEqual([
      'all', 'ai', 'development', 'tools', 'operations', 'security', 'design', 'learning', 'creative',
    ]);
    expect(getDefaultCategoryNames('zh')).toEqual([
      '全部分类', '人工智能', '开发技术', '工具软件', '运维部署', '网络安全', '设计资源', '学习资源', '创意收藏',
    ]);
    expect(getDefaultCategoryNames('en')).toContain('Artificial Intelligence');
    expect(getDefaultCategoryNames('en')).not.toContain('Web Apps');
  });

  it('maps old sidebar preferences into the new groups', () => {
    expect(migrateCategoryIds(['frontend', 'delivery', 'learning', 'frontend'])).toEqual([
      'development', 'operations', 'learning',
    ]);
  });

  it('keeps previous repository assignments visible after the taxonomy change', () => {
    expect(migrateCategoryName('前端与界面')).toBe('开发技术');
    expect(migrateRepositoryCategory({ custom_category: '工程与交付' })).toEqual({
      custom_category: '运维部署',
    });
  });
});
