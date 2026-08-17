import 'vue';

declare module 'vue' {
  interface SVGAttributes {
    className?: string;
  }
}

declare module 'react' {
  // React's declaration requires the generic even though this augmentation only adds one prop.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    innerHTML?: string;
    onCompositionstart?: (event: CompositionEvent) => void;
    onCompositionend?: (event: CompositionEvent) => void;
  }
}
