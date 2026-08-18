import type { RawStorage } from '../store/vueStore';

// Keep the IndexedDB database name stable so existing browser data remains available.
export const DB_NAME = 'github-stars-manager-db';
export const PERSISTENCE_KEY = 'stars-manager';
export const LEGACY_PERSISTENCE_KEY = 'github-stars-manager';
const STORE_NAME = 'app_state';
const DB_VERSION = 1;

const legacyKeysFor = (name: string): string[] => (
  name === PERSISTENCE_KEY ? [LEGACY_PERSISTENCE_KEY] : []
);

const canUseIndexedDB = () => typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const sanitizePersistedSnapshot = (value: string): string => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const strip = (items: unknown): unknown => Array.isArray(items)
      ? items.map((item) => {
        if (!item || typeof item !== 'object') return item;
        const safe = { ...(item as Record<string, unknown>) };
        delete safe.apiKey;
        delete safe.password;
        delete safe.token;
        return safe;
      })
      : items;
    parsed.aiConfigs = strip(parsed.aiConfigs);
    parsed.embeddingConfigs = strip(parsed.embeddingConfigs);
    if (parsed.mcpConfig && typeof parsed.mcpConfig === 'object') {
      const mcp = { ...(parsed.mcpConfig as Record<string, unknown>) };
      delete mcp.token;
      parsed.mcpConfig = mcp;
    }
    return JSON.stringify(parsed);
  } catch {
    return value;
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs = 2000): Promise<T> => {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('IndexedDB timeout')), timeoutMs)),
  ]);
};

const safeLocalStorageGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeLocalStorageSet = (key: string, value: string): boolean => {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota/security errors are expected in some environments; report failure to caller.
    return false;
  }
};

const safeLocalStorageRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
};

const openDb = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const idbGet = async (key: string): Promise<string | null> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);

    req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const idbSet = async (key: string, value: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

const idbDelete = async (key: string): Promise<void> => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
};

/**
 * IndexedDB-backed Vue store persistence with seamless migration:
 * - First read from IndexedDB
 * - If empty, migrate an existing localStorage snapshot to IndexedDB and then remove it
 * - Normal writes go to IndexedDB and clear any legacy localStorage snapshot.
 * - localStorage is only kept as the current snapshot when IndexedDB is unavailable or a write fails.
 *   This avoids stale fallback rollbacks while preserving persistence in constrained environments.
 */
export const indexedDBStorage: RawStorage = {
  getItem: async (name: string): Promise<string | null> => {
    if (typeof window === 'undefined') return null;

    // Hard fallback for environments without IndexedDB
    if (!canUseIndexedDB()) {
      return safeLocalStorageGet(name) ?? safeLocalStorageGet(legacyKeysFor(name)[0] ?? '');
    }

    try {
      const idbValue = await withTimeout(idbGet(name));
      if (idbValue !== null) {
        const sanitized = sanitizePersistedSnapshot(idbValue);
        if (sanitized !== idbValue) await withTimeout(idbSet(name, sanitized));
        return sanitized;
      }

      for (const legacyKey of legacyKeysFor(name)) {
        const legacyIdbValue = await withTimeout(idbGet(legacyKey));
        if (legacyIdbValue !== null) {
          const sanitized = sanitizePersistedSnapshot(legacyIdbValue);
          await withTimeout(idbSet(name, sanitized));
          await withTimeout(idbDelete(legacyKey));
          console.info('[storage] migrated state to the Stars Manager persistence key');
          return sanitized;
        }
      }

      // Migration path: restore existing localStorage snapshot into IndexedDB
      for (const storageKey of [name, ...legacyKeysFor(name)]) {
        const legacyValue = safeLocalStorageGet(storageKey);
        if (legacyValue !== null) {
          const sanitized = sanitizePersistedSnapshot(legacyValue);
          await withTimeout(idbSet(name, sanitized));
          safeLocalStorageRemove(storageKey);
          if (storageKey !== name) console.info('[storage] migrated state to the Stars Manager persistence key');
          else console.info('[storage] migrated state from localStorage to IndexedDB');
          return sanitized;
        }
      }
      return null;
    } catch (error) {
      console.warn('[storage] IndexedDB get failed, fallback to localStorage:', error);
      return safeLocalStorageGet(name) ?? safeLocalStorageGet(legacyKeysFor(name)[0] ?? '');
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    if (typeof window === 'undefined') return;

    // Primary path: IndexedDB first (large data friendly)
    if (canUseIndexedDB()) {
      try {
        await withTimeout(idbSet(name, sanitizePersistedSnapshot(value)));
        safeLocalStorageRemove(name);
        for (const legacyKey of legacyKeysFor(name)) {
          safeLocalStorageRemove(legacyKey);
          await withTimeout(idbDelete(legacyKey));
        }
        return;
      } catch (error) {
        console.warn('[storage] IndexedDB set failed, fallback to localStorage:', error);
      }
    }

    if (!safeLocalStorageSet(name, sanitizePersistedSnapshot(value))) {
      throw new Error('[storage] localStorage fallback write failed');
    }
    for (const legacyKey of legacyKeysFor(name)) safeLocalStorageRemove(legacyKey);
  },

  removeItem: async (name: string): Promise<void> => {
    if (typeof window === 'undefined') return;

    safeLocalStorageRemove(name);
    for (const legacyKey of legacyKeysFor(name)) safeLocalStorageRemove(legacyKey);

    if (!canUseIndexedDB()) return;

    try {
      await withTimeout(idbDelete(name));
      for (const legacyKey of legacyKeysFor(name)) await withTimeout(idbDelete(legacyKey));
    } catch (error) {
      console.warn('[storage] IndexedDB remove failed:', error);
    }
  },
};
