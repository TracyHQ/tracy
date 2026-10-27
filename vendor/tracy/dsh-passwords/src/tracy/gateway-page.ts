// H9 (I1, K5): what Tracy changes on upstream's own gateway pages — the password sign-in page, the
// first-run setup page and the refusal page — through small calls from gateway.ts:
//
//   - eight languages instead of two, English as the fallback (`./i18n`);
//   - a language switch that wraps inside the card instead of running off a phone screen;
//   - every path the page hands the browser (form action, switch link, cookie path) under the
//     mount the request arrived at (`./mount.ts`).
import { GATEWAY_LANGS, LANG_LABELS, gatewayLang, htmlLangOf, type Lang } from './i18n/index.js';
import { currentMount } from './mount.js';

/** Upstream's language cookie (`LANG_COOKIE` in gateway.ts), read by the Tracy door too. */
export const LANG_COOKIE = 'dshpw_lang';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** `<html lang>` for a page language (`zh` as dsh writes it, `zh-CN`). */
export const tracyHtmlLang = htmlLangOf;

/** The mount of the request being rendered (`''` at the root). */
export const tracyMount = currentMount;

/**
 * The language switch: all eight, in the product's order, each link in its own language, the
 * current one marked. The first thing in the card, so the rows it wraps onto push the form down.
 * @param next - where the sign-in goes afterwards; carried by each link ('' carries none).
 */
export function tracyLangSwitch(lang: Lang, next: string): string {
  const query = next === '' ? '' : `?next=${encodeURIComponent(next)}`;
  const link = (id: Lang): string =>
    `<a${lang === id ? ' class="on" aria-current="true"' : ''} href="${currentMount()}/gateway/login${query}${query === '' ? '?' : '&'}lang=${id}" lang="${htmlLangOf(id)}" hreflang="${htmlLangOf(id)}">${escapeHtml(LANG_LABELS[id])}</a>`;
  return `<div class="lang-switch">${GATEWAY_LANGS.map(link).join('')}</div>`;
}

/**
 * The three `PAGE_STYLE` rules Tracy replaces. Eight labels are wider than the card, so the switch
 * wraps in the card's flow; and a card taller than a phone screen must scroll, so `body` neither
 * clips nor fixes its height.
 */
export const TRACY_PAGE_CSS = {
  html: 'html{height:100%}',
  body: "body{min-height:100%;background:var(--bg);color:var(--txt);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Hiragino Sans GB','Microsoft YaHei','Helvetica Neue',Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;overflow-x:hidden;-webkit-font-smoothing:antialiased}",
  langSwitch: '.lang-switch{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 12px;margin:-18px -16px 14px;font-size:12px}',
} as const;

/**
 * The cookie that remembers an EXPLICIT language choice (a switch link's `?lang=`), or null when
 * the query named none of the eight exactly: a bad, repeated or regional value is not a choice.
 */
export function tracyLangCookie(queryLang: unknown, tls: boolean): string | null {
  const lang = gatewayLang(queryLang);
  if (lang === null) return null;
  return `${LANG_COOKIE}=${lang}; Path=${currentMount()}/gateway; SameSite=Lax; Max-Age=31536000${tls ? '; Secure' : ''}`;
}
