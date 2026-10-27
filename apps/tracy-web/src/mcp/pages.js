/** The consent page uses the existing Tracy sign-in card and its tokens. */
import { escapeHtml as e, emailOff } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'
import { translator } from '../lib/i18n/index.js'

export function consentPage({
  email,
  sites,
  request,
  signature,
  lang,
  clientName = 'ChatGPT',
  clientHost = 'chatgpt.com'
}) {
  const t = translator(lang)
  const words = (key) => t(key, { app: clientName })
  const choices = sites
    .map((site) => `<option value="${e(site.site_key)}">${e(site.display_name || site.site_key)}</option>`)
    .join('')
  return pageShell(
    words('mcp.title'),
    `<section class="card auth-card" data-mcp-consent>
    <div class="card-header"><h1>${e(words('mcp.title'))}</h1><p class="card-description">${e(words('mcp.description'))}<br><code data-mcp-client-host>${e(clientHost)}</code></p></div>
    <div class="card-content"><p>${e(words('mcp.permissions'))}</p><p class="hint">${e(words('mcp.revoke'))}</p>
    <form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${e(request)}"><input type="hidden" name="signature" value="${e(signature)}">
    <label for="mcp-site">${e(t('mcp.site'))}</label><select id="mcp-site" name="siteKey" required${sites.length ? '' : ' disabled'}>${choices}</select>${sites.length ? '' : `<p>${e(t('mcp.noSites'))}</p>`}
    <button type="submit" name="decision" value="allow"${sites.length ? '' : ' disabled'}>${e(t('mcp.allow'))}</button>
    <button type="submit" class="outline" name="decision" value="deny" formnovalidate>${e(t('mcp.deny'))}</button></form>
    <p class="whoami">${emailOff(e(email))}</p></div></section>`,
    '',
    { lang: t.htmlLang }
  )
}

/** `/connect`: the account, the app, one line on what it may do, and the code to compare. Never approves by itself. */
export function connectPage({ email, clientName, code, error, request, signature, lang }) {
  const t = translator(lang)
  const words = (key, extra = {}) => t(key, { app: clientName, ...extra })
  return pageShell(
    words('connect.title'),
    `<section class="card auth-card" data-device-connect>
    <div class="card-header"><h1>${e(words('connect.title'))}</h1><p class="card-description">${e(words('connect.account'))}<br><code data-connect-account>${emailOff(e(email))}</code></p></div>
    <div class="card-content"><p>${e(words('connect.permissions'))}</p>
    ${error ? `<p class="error" role="alert" data-connect-error="${e(error)}">${e(words(`connect.${error}`))}</p>` : ''}
    <form method="post" action="/connect"><input type="hidden" name="request" value="${e(request)}"><input type="hidden" name="signature" value="${e(signature)}">
    <label for="connect-code">${e(t('connect.code'))}</label><input id="connect-code" name="user_code" value="${e(code)}" required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9">
    <p class="hint">${e(words('connect.compare'))}</p>
    <button type="submit" name="decision" value="allow">${e(t('connect.allow'))}</button>
    <button type="submit" class="outline" name="decision" value="deny">${e(t('connect.deny'))}</button></form></div></section>`,
    '',
    { lang: t.htmlLang }
  )
}

/** After the decision: where to go next. */
export function connectResultPage({ clientName, allowed, lang }) {
  const t = translator(lang)
  const words = (key) => t(key, { app: clientName })
  const state = allowed ? 'allowed' : 'denied'
  return pageShell(
    words(`connect.${state}Title`),
    `<section class="card auth-card" data-device-connect-result="${state}">
    <div class="card-header"><h1>${e(words(`connect.${state}Title`))}</h1><p class="card-description">${e(words(`connect.${state}Body`))}</p></div></section>`,
    '',
    { lang: t.htmlLang }
  )
}
