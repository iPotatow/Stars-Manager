import { describe, expect, it } from 'vitest';
import { parseDataSnapshot } from './dataSnapshot';

describe('data snapshots', () => {
  it('accepts the app-owned envelope and strips removed integration fields', () => {
    const snapshot = parseDataSnapshot({
      kind: 'stars-manager.data',
      schemaVersion: 2,
      createdAt: '2026-08-16T00:00:00.000Z',
      appVersion: '0.7.3',
      payload: {
        repositories: [],
        webdavConfigs: [{ id: 'legacy' }],
        includeKeysInBackup: true,
      },
    });

    expect(snapshot).toMatchObject({
      kind: 'stars-manager.data',
      schemaVersion: 2,
      createdAt: '2026-08-16T00:00:00.000Z',
      payload: { repositories: [] },
    });
    expect(snapshot?.payload).not.toHaveProperty('webdavConfigs');
    expect(snapshot?.payload).not.toHaveProperty('includeKeysInBackup');
  });

  it('migrates the previous export envelope without reviving removed fields', () => {
    const snapshot = parseDataSnapshot({
      version: '1.0',
      exportDate: '2025-01-01T00:00:00.000Z',
      appVersion: '0.6.0',
      data: {
        aiConfigs: [{ id: 'ai-1', apiKey: '***' }],
        webdavConfigs: [{ id: 'legacy' }],
      },
    });

    expect(snapshot).toEqual({
      kind: 'stars-manager.data',
      schemaVersion: 2,
      createdAt: '2025-01-01T00:00:00.000Z',
      appVersion: '0.6.0',
      payload: { aiConfigs: [{ id: 'ai-1', apiKey: '***' }] },
    });
  });

  it('rejects unrelated JSON values', () => {
    expect(parseDataSnapshot(null)).toBeNull();
    expect(parseDataSnapshot({ data: {} })).toBeNull();
    expect(parseDataSnapshot({ kind: 'stars-manager.data', schemaVersion: 1 })).toBeNull();
  });
});
