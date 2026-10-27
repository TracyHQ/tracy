// The keys of upstream's gateway dictionary (`src/i18n.ts`), read from its source. Upstream keeps
// `DICT` private, so this is how the Tracy layer's tests learn the key universe the merged table
// must cover; a change to upstream's dictionary shows up here on the next upgrade.
import { readFileSync } from 'node:fs';

export function upstreamDictKeys(lang: 'zh' | 'en'): string[] {
  const source = readFileSync(new URL('../../src/i18n.ts', import.meta.url), 'utf8');
  const start = source.indexOf('const DICT');
  const end = source.indexOf('\n};', start);
  const zhAt = source.indexOf('\n  zh: {', start);
  const enAt = source.indexOf('\n  en: {', start);
  if (start < 0 || end < 0 || zhAt < 0 || enAt < 0) throw new Error('upstream DICT shape changed');
  const [from, to] = lang === 'zh' ? [zhAt, zhAt < enAt ? enAt : end] : [enAt, enAt < zhAt ? zhAt : end];
  return [...source.slice(from, to).matchAll(/^\s+'([\w.]+)':/gm)].map((m) => m[1]!);
}
