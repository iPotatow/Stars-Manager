import { mount, type VueWrapper } from '@vue/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/dom';
import { nextTick, type VNode } from 'vue';
import { afterEach, vi } from 'vitest';

const mountedWrappers: VueWrapper[] = [];

export const render = (component: VNode) => {
  const wrapper = mount(component, { attachTo: document.body });
  mountedWrappers.push(wrapper);
  return {
    container: wrapper.element,
    baseElement: document.body,
    rerender: async (nextComponent: VNode) => {
      await wrapper.setProps((nextComponent.props ?? {}) as Record<string, unknown>);
      await nextTick();
    },
    unmount: () => wrapper.unmount(),
  };
};

export const act = async <T>(callback: () => T | Promise<T>): Promise<T> => {
  const result = await callback();
  await nextTick();
  await nextTick();
  await nextTick();
  if (vi.isFakeTimers()) {
    vi.advanceTimersByTime(300);
    await nextTick();
  }
  return result;
};

export const cleanup = (): void => {
  mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
};

afterEach(() => cleanup());

export { fireEvent, screen, waitFor, within };
