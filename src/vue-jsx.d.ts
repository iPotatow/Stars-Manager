/* eslint-disable @typescript-eslint/no-explicit-any -- Vue JSX event handlers need React-style bivariant compatibility during the TSX migration. */

import 'vue';

type VueJsxEventHandler = (...args: any[]) => any;

declare module 'vue' {
  interface HTMLAttributes {
    className?: string;
    onClick?: VueJsxEventHandler;
    onDblclick?: VueJsxEventHandler;
    onMousedown?: VueJsxEventHandler;
    onMouseDown?: VueJsxEventHandler;
    onMouseenter?: VueJsxEventHandler;
    onMouseleave?: VueJsxEventHandler;
    onMousemove?: VueJsxEventHandler;
    onMouseup?: VueJsxEventHandler;
    onInput?: VueJsxEventHandler;
    onChange?: VueJsxEventHandler;
    onKeydown?: VueJsxEventHandler;
    onKeyDown?: VueJsxEventHandler;
    onKeyup?: VueJsxEventHandler;
    onKeyUp?: VueJsxEventHandler;
    onCompositionstart?: VueJsxEventHandler;
    onCompositionStart?: VueJsxEventHandler;
    onCompositionend?: VueJsxEventHandler;
    onCompositionEnd?: VueJsxEventHandler;
    onDragstart?: VueJsxEventHandler;
    onDragStart?: VueJsxEventHandler;
    onDragover?: VueJsxEventHandler;
    onDragOver?: VueJsxEventHandler;
    onDragleave?: VueJsxEventHandler;
    onDragLeave?: VueJsxEventHandler;
    onDrop?: VueJsxEventHandler;
    onFocus?: VueJsxEventHandler;
    onBlur?: VueJsxEventHandler;
    onWheel?: VueJsxEventHandler;
    onTouchstart?: VueJsxEventHandler;
    onTouchmove?: VueJsxEventHandler;
    onTouchend?: VueJsxEventHandler;
    [key: string]: unknown;
  }

  interface ButtonHTMLAttributes {
    className?: string;
    onClick?: VueJsxEventHandler;
    onMouseDown?: VueJsxEventHandler;
    [key: string]: unknown;
  }

  interface InputHTMLAttributes {
    onInput?: VueJsxEventHandler;
    onChange?: VueJsxEventHandler;
    onKeyDown?: VueJsxEventHandler;
    onBlur?: VueJsxEventHandler;
    onWheel?: VueJsxEventHandler;
  }

  interface SelectHTMLAttributes {
    onChange?: VueJsxEventHandler;
  }

  interface TextareaHTMLAttributes {
    onInput?: VueJsxEventHandler;
    onChange?: VueJsxEventHandler;
  }

  interface AnchorHTMLAttributes {
    className?: string;
    [key: string]: unknown;
  }

  interface SVGAttributes {
    className?: string;
    [key: string]: unknown;
  }
}
