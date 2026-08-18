/* eslint-disable @typescript-eslint/no-explicit-any -- JSX event and component boundaries are intentionally permissive. */

import {
  defineComponent,
  h,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  provide,
  ref,
  shallowRef,
  useId as vueUseId,
  type Component as VueComponent,
  type Ref,
  type VNode,
  type VNodeChild,
} from 'vue';

export type VueNode = VNodeChild;

type Cleanup = (() => void) | void;
type EffectSlot = {
  deps?: unknown[];
  effect: () => Cleanup;
  cleanup?: () => void;
  pending: boolean;
};
type MemoSlot = { deps?: unknown[]; value: unknown };
type StateSlot = { value: Ref<unknown>; setter: (next: unknown | ((previous: unknown) => unknown)) => void };

type ExternalStore = { subscribe: (listener: () => void) => () => void };

interface VueRenderContext {
  cursor: number;
  states: StateSlot[];
  refs: Ref<unknown>[];
  memos: MemoSlot[];
  effects: EffectSlot[];
  externalStores: Set<ExternalStore>;
  invalidate: Ref<number>;
  cleanups: Array<() => void>;
}

let activeContext: VueRenderContext | null = null;

const sameDeps = (previous: unknown[] | undefined, next: unknown[] | undefined): boolean => {
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((value, index) => Object.is(value, next[index]));
};

const currentVueContext = (): VueRenderContext => {
  if (!activeContext) {
      throw new Error('Vue component hooks must be called from a rendered component.');
  }
  return activeContext;
};

const scheduleEffects = (context: VueRenderContext): void => {
  void nextTick(() => {
    context.effects.forEach((slot) => {
      if (!slot.pending) return;
      slot.pending = false;
      if (slot.cleanup) {
        slot.cleanup();
        slot.cleanup = undefined;
      }
      const cleanup = slot.effect();
      if (typeof cleanup === 'function') slot.cleanup = cleanup;
    });
  });
};

const createVueComponent = (
  renderFunction: (props: Record<string, unknown>, forwardedRef?: Ref<unknown>) => unknown,
  forwardedRef = false,
): VueComponent => defineComponent({
  inheritAttrs: false,
  setup(props, { attrs, expose, slots }) {
    const context: VueRenderContext = {
      cursor: 0,
      states: [],
      refs: [],
      memos: [],
      effects: [],
      externalStores: new Set(),
      invalidate: ref(0),
      cleanups: [],
    };
    const exposedRef = shallowRef<Record<string, unknown>>({});

    context.externalStores.forEach(() => undefined);
    onBeforeUnmount(() => {
      context.effects.forEach((slot) => slot.cleanup?.());
      context.cleanups.forEach((cleanup) => cleanup());
    });

    if (forwardedRef) {
      expose({
        translate: (...args: unknown[]) => (exposedRef.value.translate as ((...values: unknown[]) => unknown) | undefined)?.(...args),
        revert: (...args: unknown[]) => (exposedRef.value.revert as ((...values: unknown[]) => unknown) | undefined)?.(...args),
        getStatus: (...args: unknown[]) => (exposedRef.value.getStatus as ((...values: unknown[]) => unknown) | undefined)?.(...args),
      });
    }

    const render = () => {
      // Reading the invalidation ref makes every store-backed component reactive in Vue.
      void context.invalidate.value;
      context.cursor = 0;
      const previousContext = activeContext;
      activeContext = context;
      const componentProps = {
        ...props,
        ...attrs,
        children: slots.default?.(),
      } as Record<string, unknown>;
      const result = renderFunction(componentProps, forwardedRef ? exposedRef : undefined);
      activeContext = previousContext;
      scheduleEffects(context);
      return result as VNode | VNode[] | string | null;
    };

    onMounted(() => {
      context.invalidate.value++;
    });

    return render;
  },
});

export const useState = <T>(initial: T | (() => T)): [T, (next: T | ((previous: T) => T)) => void] => {
  const context = currentVueContext();
  const index = context.cursor++;
  if (!context.states[index]) {
    const value = shallowRef(typeof initial === 'function' ? (initial as () => T)() : initial) as Ref<unknown>;
    const slot: StateSlot = {
      value,
      setter: (next) => {
        const resolved = typeof next === 'function'
          ? (next as (previous: unknown) => unknown)(value.value)
          : next;
        value.value = resolved;
        context.invalidate.value++;
      },
    };
    context.states[index] = slot;
  }
  const slot = context.states[index];
  return [slot.value.value as T, slot.setter as (next: T | ((previous: T) => T)) => void];
};

export function useRef<T>(): Ref<T | undefined> & { current: T | undefined };
export function useRef<T>(initial: T): Ref<T> & { current: T };
export function useRef<T>(initial: T | null): Ref<T> & { current: T };
export function useRef<T>(initial: T | null = null): Ref<T | null> & { current: T | null } {
  const context = currentVueContext();
  const index = context.cursor++;
  if (!context.refs[index]) {
    const value = shallowRef(initial) as unknown as Ref<T | null> & { current: T | null };
    Object.defineProperty(value, 'current', {
      configurable: true,
      enumerable: true,
      get: () => value.value,
      set: (next: T | null) => { value.value = next; },
    });
    context.refs[index] = value as Ref<unknown>;
  }
  return context.refs[index] as Ref<T | null> & { current: T | null };
}

export const useMemo = <T>(factory: () => T, deps: unknown[]): T => {
  const context = currentVueContext();
  const index = context.cursor++;
  const previous = context.memos[index];
  if (!previous || !sameDeps(previous.deps, deps)) {
    context.memos[index] = { deps: [...deps], value: factory() };
  }
  return context.memos[index].value as T;
};

export const useCallback = <T extends (...args: never[]) => unknown>(callback: T, deps: unknown[]): T => useMemo(() => callback, deps);

export const useEffect = (effect: () => Cleanup, deps?: unknown[]): void => {
  const context = currentVueContext();
  const index = context.cursor++;
  const previous = context.effects[index];
  if (!previous || deps === undefined || !sameDeps(previous.deps, deps)) {
    context.effects[index] = {
      deps: deps ? [...deps] : undefined,
      effect,
      cleanup: previous?.cleanup,
      pending: true,
    };
  }
};

export const useLayoutEffect = useEffect;

export const useId = (): string => vueUseId();

export const useImperativeHandle = <T>(target: Ref<unknown> & { current?: unknown } | undefined, factory: () => T, deps?: unknown[]): void => {
  void deps;
  const value = factory();
  if (target) target.current = value;
};

export const registerExternalStore = (store: ExternalStore): void => {
  if (!activeContext || activeContext.externalStores.has(store)) return;
  const ownerContext = activeContext;
  ownerContext.externalStores.add(store);
  const unsubscribe = store.subscribe(() => {
    ownerContext.invalidate.value++;
  });
  ownerContext.cleanups.push(unsubscribe);
};

export const createContext = <T>(defaultValue: T) => {
  const key = Symbol('vue-context');
  const Provider = defineComponent({
    inheritAttrs: false,
    props: { value: { type: null as unknown as undefined, default: defaultValue } },
    setup(props, { slots }) {
      provide(key, (props as unknown as { value: T }).value);
      return () => slots.default?.();
    },
  });
  return { key, Provider, defaultValue };
};

export const useContext = <T>(context: { key: symbol; defaultValue: T }): T => inject(context.key, context.defaultValue) as T;

export function memo<P = Record<string, unknown>>(
  component: (props: P) => unknown,
  compare?: (previous: P, next: P) => boolean,
): Vue.FC<P> {
  void compare;
  if (typeof component !== 'function') return component as unknown as Vue.FC<P>;
  return createVueComponent(component as (props: Record<string, unknown>) => unknown) as unknown as Vue.FC<P>;
}

export const forwardRef = <T, P>(renderFunction: (props: P, ref: Ref<T | null>) => unknown): Vue.FC<P> => createVueComponent(
  (props, forwardedRef) => renderFunction(props as P, forwardedRef as Ref<T>),
  true,
  ) as unknown as Vue.FC<P>;

export const createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => h(
  type as VueComponent,
  { ...(props ?? {}), ...(children.length ? { children } : {}) },
);

export const cloneElement = (element: VNode, props: Record<string, unknown>) => h(element, props);

export const isValidElement = (value: unknown): value is VNode => Boolean(value && typeof value === 'object' && '__v_isVNode' in value);

export const Children = {
  toArray: (children: unknown): unknown[] => Array.isArray(children) ? children.flat(Infinity).filter(Boolean) : children ? [children] : [],
};

export const Component = defineComponent;

/**
 * Small Vue JSX runtime used by the migrated TSX components.
 *
 * The application is rendered by Vue. This object only groups the Vue-backed
 * helpers that the existing JSX components use while they are being moved to
 * native Vue composition patterns.
 */
export const Vue = {
  memo,
  createElement,
  cloneElement,
  isValidElement,
  Children,
  forwardRef,
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Vue {
  export type Node = import('vue').VNodeChild;
  export type FC<P = Record<string, unknown>> = ((props: P) => any) & { displayName?: string };
  export type ComponentType<P = Record<string, unknown>> = FC<P> & any;
  export type ElementType = any;
  export type RefObject<T> = { current: T | null };
  export type MouseEvent<T extends Element = Element> = globalThis.MouseEvent & { currentTarget: T | null | any };
  export type KeyboardEvent<T extends Element = Element> = globalThis.KeyboardEvent & { target: any; currentTarget: T | null | any; nativeEvent: globalThis.KeyboardEvent };
  export type ChangeEvent<T extends Element = Element> = globalThis.Event & { target: any; currentTarget: T | null | any };
  export type CompositionEvent<T extends Element = Element> = globalThis.CompositionEvent & { target: any; currentTarget: T | null | any };
  export type DragEvent<T extends Element = Element> = globalThis.DragEvent & { currentTarget: T | null | any; dataTransfer: any };
  export type TouchEvent<T extends Element = Element> = globalThis.TouchEvent & { currentTarget: T | null | any };
  export type FocusEvent<T extends Element = Element> = globalThis.FocusEvent & { target: any; currentTarget: T | null | any };
  export type WheelEvent<T extends Element = Element> = globalThis.WheelEvent & { target: any; currentTarget: T | null | any };
  export type ButtonHTMLAttributes<T extends Element = HTMLButtonElement> = Record<string, any> & { currentTarget?: T; onClick?: any; disabled?: boolean };
  export interface ErrorInfo { componentStack: string; }
}

export default Vue;
