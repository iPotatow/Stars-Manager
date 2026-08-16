import { backend } from './backendAdapter';

export interface TranslateResult {
  translatedText: string;
  detectedLanguage: string;
}

export interface TranslateOptions {
  from?: string;
  to: string;
  text: string;
  signal?: AbortSignal;
  textType?: 'html' | 'plain';
}

const MAX_CHARS_PER_ITEM = 4500;
const MAX_ITEMS_PER_BATCH = 100;
const MAX_CHARS_PER_BATCH = 45000;

function splitTextIntoChunks(text: string, maxChars = MAX_CHARS_PER_ITEM): string[] {
  if (text.length <= maxChars) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const paragraph = remaining.lastIndexOf('\n', maxChars);
    const sentence = remaining.lastIndexOf(' ', maxChars);
    const splitAt = Math.max(paragraph, sentence, 1);
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export const translateText = async (options: TranslateOptions): Promise<TranslateResult> => {
  const [result] = await translateBatch(
    [options.text],
    options.to,
    options.from,
    options.signal,
    options.textType,
  );
  return result;
};

export const translateBatch = async (
  texts: string[],
  to: string,
  from?: string,
  signal?: AbortSignal,
  textType: 'html' | 'plain' = 'plain',
): Promise<TranslateResult[]> => {
  if (texts.length === 0) return [];

  const output: TranslateResult[] = new Array(texts.length);
  const chunks = texts.flatMap((text, sourceIndex) =>
    splitTextIntoChunks(text).map((value, chunkIndex) => ({ sourceIndex, chunkIndex, value })),
  );
  const translatedChunks = new Map<number, TranslateResult[]>();

  for (let offset = 0; offset < chunks.length;) {
    const batch: typeof chunks = [];
    let charCount = 0;
    while (offset < chunks.length && batch.length < MAX_ITEMS_PER_BATCH) {
      const candidate = chunks[offset];
      if (batch.length > 0 && charCount + candidate.value.length > MAX_CHARS_PER_BATCH) break;
      batch.push(candidate);
      charCount += candidate.value.length;
      offset += 1;
    }
    const results = await backend.proxyTranslation(batch.map((item) => item.value), to, from, textType, signal);
    batch.forEach((item, index) => {
      const list = translatedChunks.get(item.sourceIndex) ?? [];
      list[item.chunkIndex] = results[index] ?? { translatedText: item.value, detectedLanguage: '' };
      translatedChunks.set(item.sourceIndex, list);
    });
  }

  texts.forEach((text, index) => {
    const parts = translatedChunks.get(index) ?? [];
    output[index] = {
      translatedText: parts.map((part) => part.translatedText).join('') || text,
      detectedLanguage: parts.find((part) => part.detectedLanguage)?.detectedLanguage ?? '',
    };
  });
  return output;
};

export const clearTranslateCache = (): void => {};
