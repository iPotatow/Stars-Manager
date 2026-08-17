import { h, Teleport, type VNode } from 'vue';

export const createPortal = (children: VNode | VNode[] | string, container: Element): VNode => h(
  Teleport,
  { to: container },
  () => children,
);
