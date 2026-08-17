import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.min.css';
import { useAppStore } from '../store/useAppStore';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  shouldRender?: boolean;
  enableHtml?: boolean;
  baseUrl?: string;
  headingIds?: Map<string, string>;
  fontSize?: 'small' | 'medium' | 'large';
}

const resolveRelativeLinks = (html: string, baseUrl?: string, headingIds?: Map<string, string>): string => {
  if (typeof document === 'undefined') return html;
  const template = document.createElement('template');
  template.innerHTML = html;
  const usedIds = new Set<string>();

  template.content.querySelectorAll<HTMLElement>('a[href], img[src]').forEach((element) => {
    const attribute = element.tagName === 'IMG' ? 'src' : 'href';
    const value = element.getAttribute(attribute);
    if (!value || !baseUrl || /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(value)) return;
    try {
      element.setAttribute(attribute, new URL(value, baseUrl).toString());
    } catch {
      // Keep the original URL when a remote README contains an invalid link.
    }
  });

  template.content.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((link) => {
    const href = link.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    }
  });

  const languageAliases: Record<string, string> = {
    sh: 'bash', shell: 'bash', zsh: 'bash', fish: 'bash',
    yml: 'yaml', py: 'python', js: 'javascript', ts: 'typescript',
    tsx: 'typescript', jsx: 'javascript', rb: 'ruby', rs: 'rust',
  };
  template.content.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
    const languageClass = Array.from(code.classList).find((className) => className.startsWith('language-'));
    const sourceLanguage = languageClass?.slice('language-'.length);
    const normalizedLanguage = sourceLanguage ? (languageAliases[sourceLanguage] ?? sourceLanguage) : '';
    if (sourceLanguage && normalizedLanguage !== sourceLanguage) {
      code.classList.remove(`language-${sourceLanguage}`);
      code.classList.add(`language-${normalizedLanguage}`);
    }
    const lineCount = (code.textContent ?? '').replace(/\n$/, '').split('\n').length;
    if (lineCount > 3) {
      const lineNumbers = document.createElement('span');
      lineNumbers.className = 'text-gray-400 mr-3 select-none';
      lineNumbers.setAttribute('aria-hidden', 'true');
      lineNumbers.textContent = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join('\n');
      code.parentElement?.insertBefore(lineNumbers, code);
    }
  });

  template.content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6').forEach((heading) => {
    const text = heading.textContent?.trim() ?? '';
    const preferredId = headingIds?.get(text) ?? `heading-extra-${usedIds.size}`;
    if (!preferredId) return;
    let id = preferredId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${preferredId}-${suffix++}`;
    usedIds.add(id);
    heading.id = id;
  });

  return template.innerHTML;
};

const renderMarkdown = (
  content: string,
  enableHtml: boolean,
  baseUrl?: string,
  headingIds?: Map<string, string>,
): string => {
  const rawHtml = marked.parse(content, { gfm: true, breaks: true }) as string;
  const html = resolveRelativeLinks(rawHtml, baseUrl, headingIds);
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'id'],
    ...(enableHtml ? {} : { FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed'] }),
  });
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = memo(({
  content,
  className = '',
  shouldRender = true,
  enableHtml = false,
  baseUrl,
  headingIds,
  fontSize = 'medium',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomedImage, setZoomedImage] = useState<string | null>(null);
  const { language } = useAppStore();
  const html = useMemo(
    () => shouldRender ? renderMarkdown(content, enableHtml, baseUrl, headingIds) : '',
    [baseUrl, content, enableHtml, headingIds, shouldRender],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll<HTMLElement>('pre code').forEach((code) => {
      try {
        hljs.highlightElement(code);
      } catch {
        // Highlighting is optional; the code block remains readable on failure.
      }
    });

    const images = Array.from(container.querySelectorAll<HTMLImageElement>('img'));
    const handleImageClick = (event: Event) => {
      const image = event.currentTarget as HTMLImageElement;
      if (image.src) setZoomedImage(image.src);
    };
    images.forEach((image) => {
      image.classList.add('cursor-zoom-in');
      image.addEventListener('click', handleImageClick);
    });
    return () => images.forEach((image) => image.removeEventListener('click', handleImageClick));
  }, [html]);

  if (!shouldRender) {
    return <div className="markdown-body prose prose-slate max-w-none">Loading...</div>;
  }

  const fontClass = fontSize === 'small' ? 'text-sm' : fontSize === 'large' ? 'text-lg' : 'text-base';
  return (
    <>
      <div
        ref={containerRef}
        className={`markdown-body prose prose-slate max-w-none ${fontClass} ${className}`}
        data-language={language}
        innerHTML={html}
      />
      {zoomedImage ? (
        <div
          className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/80 p-6"
          role="dialog"
          aria-label={language === 'zh' ? '预览图片' : 'Image preview'}
          onClick={() => setZoomedImage(null)}
        >
          <img src={zoomedImage} alt="" className="max-h-full max-w-full object-contain" />
        </div>
      ) : null}
    </>
  );
});

export default MarkdownRenderer;
