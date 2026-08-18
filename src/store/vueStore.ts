import { shallowReactive } from 'vue';

export type StorageValue<T> = {
  state: T;
  version?: number;
};

export interface PersistStorage<T> {
  getItem: (name: string) => StorageValue<T> | null | Promise<StorageValue<T> | null>;
  setItem: (name: string, value: StorageValue<T>) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

export interface RawStorage {
  getItem: (name: string) => string | null | Promise<string | null>;
  setItem: (name: string, value: string) => void | Promise<void>;
  removeItem: (name: string) => void | Promise<void>;
}

type StoreUpdate<T> = Partial<T> | ((state: T) => Partial<T> | void);
type StoreListener<T> = (state: T, previousState: T) => void;

export interface VueStore<T> {
  getState: () => T;
  setState: (update: StoreUpdate<T>) => void;
  subscribe: (listener: StoreListener<T>) => () => void;
  destroy: () => void;
}

export interface PersistOptions<T> {
  name: string;
  version: number;
  storage: PersistStorage<unknown>;
  partialize: (state: T) => unknown;
  migrate: (state: unknown, version: number) => unknown | Promise<unknown>;
  merge: (persistedState: unknown, currentState: T) => T;
  onRehydrateStorage?: (state: T) => ((state: T | undefined, error?: unknown) => void) | void;
}

const isPromiseLike = (value: unknown): value is Promise<unknown> => (
  Boolean(value && typeof (value as Promise<unknown>).then === 'function')
);

/**
 * A small Vue-native store with the same imperative surface used by services.
 * Components subscribe through the Vue runtime bridge, while persistence stays
 * behind the existing IndexedDB storage adapter.
 */
export const createPersistedVueStore = <T extends object>(
  creator: (set: (update: StoreUpdate<T>) => void, get: () => T) => T,
  options: PersistOptions<T>,
): VueStore<T> => {
  const listeners = new Set<StoreListener<T>>();
  let hydrating = true;
  let destroyed = false;
  const state = shallowReactive({}) as T;

  const persistState = (): void => {
    if (hydrating || destroyed) return;
    const value: StorageValue<unknown> = {
      state: options.partialize(state),
      version: options.version,
    };
    void Promise.resolve(options.storage.setItem(options.name, value)).catch(() => undefined);
  };

  const applyState = (update: StoreUpdate<T>, notify = true): void => {
    if (destroyed) return;
    const previousState = { ...state } as T;
    const patch = typeof update === 'function' ? update(state) : update;
    if (!patch) return;
    const changed = (Object.keys(patch) as Array<keyof T>).some((key) => !Object.is(state[key], patch[key]));
    if (!changed) return;
    Object.assign(state, patch);
    if (notify) listeners.forEach((listener) => listener(state, previousState));
    if (notify) persistState();
  };

  const setState = (update: StoreUpdate<T>): void => applyState(update);

  Object.assign(state, creator(setState, () => state));

  const store: VueStore<T> = {
    getState: () => state,
    setState,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    destroy: () => {
      destroyed = true;
      listeners.clear();
    },
  };

  const afterHydrate = options.onRehydrateStorage?.(state);
  const hydrate = async (): Promise<void> => {
    try {
      const persisted = await options.storage.getItem(options.name);
      let persistedState = persisted?.state;
      if (persistedState !== undefined && (persisted?.version ?? 0) !== options.version) {
        persistedState = await options.migrate(persistedState, persisted?.version ?? 0);
      }
      if (persistedState !== undefined) {
        const merged = options.merge(persistedState, state);
        applyState(merged, false);
      }
      hydrating = false;
      afterHydrate?.(state);
    } catch (error) {
      hydrating = false;
      afterHydrate?.(undefined, error);
    }
  };

  const hydrationResult = hydrate();
  if (!isPromiseLike(hydrationResult)) {
    hydrating = false;
  }

  return store;
};
