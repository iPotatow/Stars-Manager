import { h, Teleport, type VNodeChild, type VNode } from 'vue';

export const createPortal = (children: VNodeChild, container: Element): VNode => h(
  Teleport,
  { to: container },
  () => children,
);
