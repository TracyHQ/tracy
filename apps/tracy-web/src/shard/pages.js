// apps/tracy-web/src/shard/pages.js
/** The one page a shard draws about signing in: it does not sign anyone in, the master does. */
import { escapeHtml } from '../lib/html.js'
import { translator } from '../lib/i18n/index.js'
import { pageShell } from '../lib/page-shell.js'

/**
 * @param {{ masterOrigin: string, next: string, lang?: string }} input - `next`: the absolute URL
 *   on this shard to come back to.
 */
export function signInAtMasterPage({ masterOrigin, next, lang = 'en' }) {
  const t = translator(lang)
  const host = new URL(masterOrigin).host
  const body = `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('login.title')}</h1>
<p class="card-description">${t.html('shard.signInBody', { host: `<strong>${escapeHtml(host)}</strong>` })}</p>
</div>
<div class="card-content">
<form method="get" action="${escapeHtml(`${masterOrigin}/login`)}">
<input type="hidden" name="next" value="${escapeHtml(next)}">
<button type="submit">${t.html('shard.signInButton')}</button>
</form>
</div>
</div>`
  return pageShell(t('login.title'), body, '', { lang: t.htmlLang })
}
