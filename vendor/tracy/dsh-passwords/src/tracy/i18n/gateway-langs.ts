// The language of the gateway's own pages (invariant I1, TCH #797): the eight interface languages
// of the product, falling back to English. Upstream speaks zh and en and falls back to Chinese;
// the CLI keeps upstream's `resolveCliLang` (zh/en), only the pages a browser reads use this.
//
// Precedence: `?lang` > cookie > the dsh language setting > `Accept-Language` > English.
import { readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseDocument } from 'yaml';

/** Same ids, same order as `INTERFACE_LANGUAGES` in `@tracy/core/interface-languages`. */
export const GATEWAY_LANGS = ['en', 'vi', 'de', 'it', 'fr', 'nl', 'zh', 'es'] as const;

export type Lang = (typeof GATEWAY_LANGS)[number];

/** What each language calls itself, for the language switch (the labels of the Language menu). */
export const LANG_LABELS: Record<Lang, string> = {
  en: 'English',
  vi: 'Tiếng Việt',
  de: 'Deutsch',
  it: 'Italiano',
  fr: 'Français',
  nl: 'Nederlands',
  zh: '中文',
  es: 'Español',
};

/** One of the eight ids, exactly as written, or null. Anything else is not a choice. */
export function gatewayLang(value: unknown): Lang | null {
  return typeof value === 'string' && (GATEWAY_LANGS as readonly string[]).includes(value) ? (value as Lang) : null;
}

/** `<html lang>` for a page language: BCP 47, `zh` written the way dsh writes it. */
export function htmlLangOf(lang: Lang): string {
  return lang === 'zh' ? 'zh-CN' : lang;
}

/**
 * The dsh language setting (`locale.preference` of `<dsh home>/settings.yaml`, written by dsh's
 * General → Language), cached five seconds per candidate list: every gateway request resolves a
 * language, and a synchronous read per request is disk work for nothing.
 */
let localePreferenceCache: { value: Lang | null; at: number; source: string } | null = null;
const LOCALE_CACHE_TTL_MS = 5_000;
/** A settings file is a few kilobytes; anything far larger is not one, and is not read. */
const SETTINGS_MAX_BYTES = 1024 * 1024;

/**
 * `locale.preference` of one settings text, or null. The text is parsed as the YAML it is, the
 * way dsh itself reads it, so only the `preference` directly under the top-level `locale` map is
 * the language: the same word deeper down, under another namespace, in a comment or inside a
 * block of text is not. A document the parser reports any error in (a write caught half-way, a
 * duplicated key, a second document) is not trusted at all. A value that is not one of the eight
 * ids (`system`, a language Tracy does not ship) is no answer.
 */
function localePreferenceIn(text: string): Lang | null {
  const isMap = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  try {
    const doc = parseDocument(text);
    if (doc.errors.length > 0) return null;
    const root: unknown = doc.toJS();
    if (!isMap(root) || !Object.hasOwn(root, 'locale')) return null;
    const locale = root.locale;
    if (!isMap(locale) || !Object.hasOwn(locale, 'preference')) return null;
    return gatewayLang(locale.preference);
  } catch {
    // An alias the parser refuses to expand, or any other failure to build the value.
    return null;
  }
}

function readDshLocalePreference(): Lang | null {
  const explicit = process.env.MCP_DSH_SETTINGS_FILE?.trim();
  const dshHome = process.env.DSH_HOME?.trim();
  const bases: string[] = explicit
    ? [explicit]
    : [
        ...(dshHome ? [path.join(dshHome, 'settings.yaml')] : []),
        path.join(os.homedir(), '.dsh', 'settings.yaml'),
      ];
  // dsh 0.1.7's first migration renames settings.yaml to settings.yaml.imported; like upstream,
  // each place is read as settings.yaml first, then as the imported copy beside it.
  const candidates: string[] = bases.flatMap((base) => [base, `${base}.imported`]);
  // The cache belongs to the files it was read from: a different list is a different answer.
  const source = candidates.join('\0');
  const now = Date.now();
  if (
    localePreferenceCache !== null &&
    localePreferenceCache.source === source &&
    now - localePreferenceCache.at < LOCALE_CACHE_TTL_MS
  ) {
    return localePreferenceCache.value;
  }
  let value: Lang | null = null;
  for (const file of candidates) {
    try {
      // Only a regular file of a sane size is read. A folder throws anyway, but a named pipe
      // would BLOCK this synchronous read (and every request behind it) until somebody writes.
      const stat = statSync(file);
      if (!stat.isFile() || stat.size > SETTINGS_MAX_BYTES) continue;
      const hit = localePreferenceIn(readFileSync(file, 'utf8'));
      if (hit) {
        value = hit;
        break;
      }
    } catch {
      // Missing or unreadable: try the next candidate.
    }
  }
  localePreferenceCache = { value, at: now, source };
  return value;
}

/** Traditional-script Chinese: the region or the script subtag says so. Never served as `zh`. */
const TRADITIONAL_CHINESE = /^zh-(?:.*-)?(?:tw|hk|mo|hant)(?:-|$)/;

/**
 * One `Accept-Language` tag as a page language: the id itself, or its primary subtag. `zh` is
 * Simplified Chinese only, as on tracy-web (`docs/references/i18n.md`): `zh-TW`, `zh-HK`, `zh-MO`
 * and any `Hant` tag are no answer, so the reader's next tag decides, or English.
 */
function langOfTag(tag: string): Lang | null {
  const lower = tag.trim().toLowerCase().replace(/_/g, '-');
  if (lower === '' || lower.length > 35) return null;
  const exact = gatewayLang(lower);
  if (exact !== null) return exact;
  if (TRADITIONAL_CHINESE.test(lower)) return null;
  return gatewayLang(lower.split('-')[0]);
}

/**
 * The first language of the header the gate serves, in the browser's own order of preference
 * (`q` descending, ties keep the header order). An entry with `q=0`, with a `q` that is not a
 * number between 0 and 1, or with no tag is not a choice and is dropped.
 */
function parseAcceptLanguage(header: unknown): Lang | null {
  if (typeof header !== 'string' || header.length > 1000) return null;
  const candidates: Array<{ lang: Lang; q: number; index: number }> = [];
  header.split(',').forEach((part, index) => {
    const [tag, ...params] = part.trim().split(';');
    const lang = langOfTag(tag ?? '');
    if (lang === null) return;
    let q = 1;
    for (const p of params) {
      const m = /^\s*q\s*=(.*)$/i.exec(p);
      if (!m) continue;
      const raw = m[1].trim();
      q = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(raw) ? Number(raw) : 0;
    }
    if (q > 0) candidates.push({ lang, q, index });
  });
  candidates.sort((a, b) => b.q - a.q || a.index - b.index);
  return candidates[0]?.lang ?? null;
}

/** The page language: `?lang` → cookie → dsh setting → browser → English. */
export function resolveGatewayLang(input: { queryLang?: unknown; cookieLang?: unknown; acceptLanguage?: unknown }): Lang {
  return (
    gatewayLang(input.queryLang) ??
    gatewayLang(input.cookieLang) ??
    readDshLocalePreference() ??
    parseAcceptLanguage(input.acceptLanguage) ??
    'en'
  );
}
