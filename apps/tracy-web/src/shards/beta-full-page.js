/**
 * What the master answers when no shard takes a new person (docs/sre/2026-10-15-shard-beta-design.md
 * §4.1, §13 S40; docs/sre/hop-dong-cua-shard.md §12b): `503 NO_SHARD_ACCEPTING`. A navigation gets a
 * page in the shell every Tracy page uses (`lib/page-shell.js`, the way `bar/pages.js` draws
 * "workspace unavailable"); a door the login page's own script calls gets `{code}`, and the script
 * says the same sentence. Nothing was made for the person — no directory row, no session — so the
 * next sign-in tries the round again, and the page promises only that.
 */
import { translator } from '../lib/i18n/index.js'
import { pageShell } from '../lib/page-shell.js'
import { pageSecurityHeaders } from '../lib/security-headers.js'

export const NO_SHARD_ACCEPTING = 'NO_SHARD_ACCEPTING'

/**
 * @param {{lang?: string, json?: boolean, cookies?: string[]}} [input] - `json`: `503 {code}` instead
 *   of the page, for the login page's own fetch; `cookies`: `Set-Cookie` lines the answer carries (a
 *   session and a pointer being taken back). Never cached.
 */
export function noShardAcceptingResponse({ lang = 'en', json = false, cookies = [] } = {}) {
  const headers = new Headers({ 'cache-control': 'no-store' })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  if (json) {
    headers.set('content-type', 'application/json; charset=utf-8')
    return new Response(JSON.stringify({ code: NO_SHARD_ACCEPTING }), { status: 503, headers })
  }
  const t = translator(lang)
  headers.set('content-type', 'text/html; charset=utf-8')
  for (const [name, value] of Object.entries(pageSecurityHeaders())) headers.set(name, value)
  return new Response(
    pageShell(
      t('shards.betaFullHeading'),
      `<h1>${t.html('shards.betaFullHeading')}</h1>
<p class="card-description">${t.html('shards.betaFullBody')}</p>`,
      '',
      { lang: t.htmlLang }
    ),
    { status: 503, headers }
  )
}
