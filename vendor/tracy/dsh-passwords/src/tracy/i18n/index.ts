// The gateway's words in Tracy's eight languages (invariants I1–I3): upstream's zh/en dictionary
// (`src/i18n.ts`, read through its own `t`), Tracy's additions and rebrands over it
// (`strings.ts`), and six catalogues (`locales/*.json`). Upstream keeps its dictionary private,
// so the merged table is built over a key list the caller supplies — `src/i18n.ts` itself, once
// hook H9 wires this module in (phase 2).
//
// Lookup: the language's own string; a key it lacks reads in English; an unknown key reads as
// itself (a page would rather show a key than nothing).
import { t as upstreamT } from '../../i18n.js';
import de from './locales/de.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };
import fr from './locales/fr.json' with { type: 'json' };
import it from './locales/it.json' with { type: 'json' };
import nl from './locales/nl.json' with { type: 'json' };
import vi from './locales/vi.json' with { type: 'json' };
import { GATEWAY_LANGS, type Lang } from './gateway-langs.js';
import { TRACY_STRINGS } from './strings.js';

export { GATEWAY_LANGS, LANG_LABELS, gatewayLang, htmlLangOf, resolveGatewayLang, type Lang } from './gateway-langs.js';
export { TRACY_STRINGS } from './strings.js';
export { CLIENT_BRAND, CLIENT_KEPT_TERMS, CLIENT_STRINGS } from './client-brand.js';

type Params = Record<string, string | number>;

/** The six catalogue languages: sentences an existing catalogue already translates, word for word. */
export const CATALOGUES: Readonly<Record<Exclude<Lang, 'zh' | 'en'>, Readonly<Record<string, string>>>> = {
  vi,
  de,
  it,
  fr,
  nl,
  es,
};

/** A non-empty string own to `table`, or undefined. */
function own(table: Readonly<Record<string, unknown>> | undefined, key: string): string | undefined {
  const value = table && Object.hasOwn(table, key) ? table[key] : undefined;
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Upstream's string, or undefined where upstream's `t` would echo the key back. */
function upstream(lang: 'zh' | 'en', key: string): string | undefined {
  const value = upstreamT(lang, key);
  return value === key ? undefined : value;
}

/** The template for one key in one language, before parameters are filled. */
function template(lang: Lang, key: string): string {
  if (lang === 'zh' || lang === 'en') {
    const found = own(TRACY_STRINGS[lang], key) ?? upstream(lang, key);
    if (found !== undefined) return found;
  } else {
    const found = own(CATALOGUES[lang], key);
    if (found !== undefined) return found;
  }
  return own(TRACY_STRINGS.en, key) ?? upstream('en', key) ?? key;
}

/** One string in `lang`. A key the language lacks reads in English; an unknown key reads as itself. */
export function t(lang: Lang, key: string, params?: Params): string {
  const text = template(lang, key);
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Upstream's keys plus Tracy's, once each, upstream's order first. */
function allKeys(upstreamKeys: Iterable<string>): string[] {
  return [...new Set([...upstreamKeys, ...Object.keys(TRACY_STRINGS.en), ...Object.keys(TRACY_STRINGS.zh)])];
}

/**
 * The merged table: every key of upstream's dictionary and of Tracy's, in each of the eight
 * languages, as `t` reads it.
 * @param upstreamKeys - the keys of upstream's dictionary (`Object.keys(DICT.en)` in `src/i18n.ts`).
 */
export function gatewayStrings(upstreamKeys: Iterable<string>): Record<Lang, Record<string, string>> {
  const keys = allKeys(upstreamKeys);
  return Object.fromEntries(
    GATEWAY_LANGS.map((lang) => [lang, Object.fromEntries(keys.map((key) => [key, t(lang, key)]))]),
  ) as Record<Lang, Record<string, string>>;
}

/**
 * Every key a gateway PAGE can show (`err.*`, `gw.*`, `tracy.*`). The CLI's own keys are left
 * out: the CLI speaks zh and en only (upstream `resolveCliLang`).
 * @param upstreamKeys - as for `gatewayStrings`.
 */
export function gatewayPageKeys(upstreamKeys: Iterable<string>): string[] {
  return allKeys(upstreamKeys).filter((key) => /^(?:err|gw|tracy)\./.test(key));
}
