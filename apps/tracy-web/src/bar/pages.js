/**
 * The small set of HTML pages `bar/route.js` serves directly (never proxied from a customer's
 * own copy). Narrowed from the fleet-bar Worker's `pages.js` (deleted with the Worker tree on
 * 16/09/2026; 1313 lines of bar-menu markup this plan does not carry — no invite menu, no proposals
 * switcher, no account menu: those hang off features this task does not build, `/__tracy/proposals`
 * named explicitly as one of them) down to the handful this task's routes actually need.
 *
 * Task 6 (`.superpowers/sdd/2026-09-09-tracy-web-04-bar-ops-public/task-6-brief.md`) closed the
 * gap the earlier version's own comment admitted to: every page below now runs through
 * `pageShell` — the ONE copy of the Worker's `page()` token contract
 * (`docs/references/page-shell-tokens.md`), shared with `identity/route.js`'s `/login` — instead of
 * a bare `<body style="font:15px system-ui">`.
 *
 * Every word is in the reader's language (#753): each page takes `lang` (default English).
 */
import { escapeHtml, emailOff } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'
import { pageSecurityHeaders } from '../lib/security-headers.js'
import { translator } from '../lib/i18n/index.js'

export { escapeHtml }

function page(title, body, t) {
  return pageShell(title, body, '', { lang: t.htmlLang })
}

const CONTENT_TYPE = { 'content-type': 'text/html; charset=utf-8' }
/** A page answered on Tracy's own address (the workspace root): the full set, frame refused. */
const HTML_HEADERS = { ...CONTENT_TYPE, ...pageSecurityHeaders() }
/** A page answered on a CUSTOMER SITE's address, which Tracy's own preview pane shows inside a
 * frame: the same set without the frame refusal (`pageSecurityHeaders` says why that is safe). */
const SITE_HTML_HEADERS = { ...CONTENT_TYPE, ...pageSecurityHeaders({ framable: true }) }

/**
 * The way out of a page answered on an address that is NOT Tracy's own (#796): a link to the
 * deployment's configured origin. A relative link there would point at the customer's own site,
 * so the address is absolute; `target="_top"` because Tracy's preview pane shows these pages inside
 * a frame, and Tracy's own pages refuse to be framed. No link at all when the origin is not an
 * http(s) address: a page without a link is honest, a page with a bad one is not.
 */
function tracyLink(origin, t) {
  let home
  try {
    home = new URL('/', origin)
  } catch {
    return ''
  }
  if (home.protocol !== 'https:' && home.protocol !== 'http:') return ''
  return `<p class="note"><a class="back" href="${escapeHtml(home.href)}" target="_top">${t.html('bar.goToTracy')} &rarr;</a></p>`
}

/**
 * Signed in, and the seat book holds no site for this person — the one case where the workspace
 * root has nowhere to send them.
 *
 * 🔒 IT USED TO BE ONE LINE OF `text/plain`: `Open a site: /<siteKey>/`. That is the shape this
 * repo's own rule refuses — `workers/cowork-web/src/worker.js` states it outright: *"A NAVIGATION
 * GETS A PAGE, NOT A LINE OF TEXT"*, because since dsh became the shell, `/`
 * IS the page. Measured 11/09: a person finished a Google sign-in and landed on a white page
 * carrying that sentence, with nothing to click and no way to tell what had gone wrong.
 *
 * 🔒 AND IT NAMES THE ACCOUNT, WHICH IS THE WHOLE ANSWER MOST OF THE TIME. The way to arrive here
 * is almost always to sign in as a DIFFERENT person than the one holding the sites — a Google
 * account beside a mailed-code account, the same human either way. Without the address on screen
 * there is nothing to notice; with it, the fix is obvious and the sign-out button is right there.
 */
export function noSitesPage(email, { signInHref, invites = [], lang = 'en' }) {
  const t = translator(lang)
  // 🔒 AN UNANSWERED INVITATION IS NOT "NO INVITATION". `defaultSiteFor` counts only ACCEPTED
  // seats, so a person invited an hour ago arrives here looking exactly like a stranger — and
  // telling them nobody invited this address, while the invitation sits in their inbox, is worse
  // than saying nothing. `/<label>/join` is the surface that already knows how to accept
  // (`seats/pages.js`'s `joinPage`, `settled === 'invited'`).
  // One alignment for the whole page, the card's own (left), like the heading above it; the
  // waiting sites are rows (`ul.hint`, the seat pages' list), not a bare bullet list (04/10).
  const waiting =
    invites.length > 0
      ? `<p class="card-description">${t.html('bar.waitingForAnswer')}</p>
<ul class="hint">${invites
          .map(
            (i) =>
              `<li><a class="back" href="/${encodeURIComponent(i.label)}/join">${escapeHtml(i.siteKey)} &rarr;</a></li>`
          )
          .join('')}</ul>`
      : `<p class="card-description">${t.html('bar.nobodyInvited')}</p>
<p class="card-description"><a class="back" href="/design-inspiration">${t.html('bar.createFirstSite')} &rarr;</a></p>`

  return new Response(
    page(
      t('bar.noSitesTitle'),
      `<h1>${t.html(invites.length > 0 ? 'bar.invitationWaiting' : 'bar.noSitesHeading')}</h1>
<p class="card-description">${t.html('bar.signedInAs', { email: emailOff(`<strong>${escapeHtml(email)}</strong>`) })}</p>
${waiting}
<p class="card-description">${t.html('bar.otherAddress')}</p>
<form method="post" action="/auth/signout">
  <input type="hidden" name="next" value="${escapeHtml(signInHref)}">
  <button type="submit">${t.html('bar.signInAsSomeoneElse')}</button>
</form>`,
      t
    ),
    { status: 404, headers: HTML_HEADERS }
  )
}

/**
 * The landing for a JoomlArt template Tracy offers (`workspace/template-intent.js`): the one page
 * joomlart.com's Download button, the JoomlArt sign-in door and a Tracy Desktop that signed in
 * with a template waiting all arrive on. Two ways out — build the site here, or take the quickstart
 * away — because "free through Tracy" is only believable when the file can leave (plan B5/B8).
 * The web and the app draw the same two ways out (11/10/2026: build for the web, the app
 * inherits). The web adds one thing after them, an offer of Tracy Desktop naming the account to
 * sign in with there — words and layout only, never something the browser cannot do. Every link
 * opens in place: no `target="_blank"`, so the app keeps the download in its own window.
 * @param {{template: string, name: string, blurb: string, picture: string|null, buildHref: string, downloadHref: string|null, desktopHref: string|null}} landing
 * @param {{lang?: string, desktop?: boolean, email?: string}} [options] `desktop`: drawn for the app
 */
export function templateLandingPage(landing, { lang = 'en', desktop = false, email = '' } = {}) {
  const t = translator(lang)
  const name = escapeHtml(landing.name)
  const picture = landing.picture
    ? `<p><img src="${escapeHtml(landing.picture)}" alt="${name}" width="640" style="max-width:100%;height:auto;border:1px solid var(--border);border-radius:var(--radius)"></p>`
    : ''
  const blurb = landing.blurb ? `<p class="card-description">${escapeHtml(landing.blurb)}</p>` : ''
  const download = landing.downloadHref
    ? `<p class="card-description"><a class="back" href="${escapeHtml(landing.downloadHref)}" download>${t.html('bar.templateDownload')} &rarr;</a><br><small>${t.html('bar.templateDownloadHint')}</small></p>`
    : ''
  // The nudge toward the app: on the web only, after everything the page already offers, so the
  // browser loses nothing by not installing it. In the app, its own hint says the page follows it.
  const desktopOffer =
    !desktop && landing.desktopHref
      ? `<h2>${t.html('bar.templateDesktopTitle')}</h2>
<p class="card-description">${t.html('bar.templateDesktopBody', { email: `<strong>${escapeHtml(email)}</strong>` })}</p>
<p><a class="button" href="${escapeHtml(landing.desktopHref)}" data-template-desktop>${t.html('bar.templateDesktopGet')}</a></p>`
      : ''
  const desktopHint = desktop ? `<p class="note"><small>${t.html('bar.templateDesktopHint')}</small></p>` : ''
  return new Response(
    page(
      t('bar.templateLandingTitle', { name: landing.name }),
      `<h1>${t.html('bar.templateLandingTitle', { name: `<strong>${name}</strong>` })}</h1>
${picture}
${blurb}
<p><a class="button" href="${escapeHtml(landing.buildHref)}" data-template-build>${t.html('bar.templateBuild')}</a></p>
<p class="card-description"><small>${t.html('bar.templateBuildHint')}</small></p>
${download}
${desktopOffer}
${desktopHint}`,
      t
    ),
    { status: 200, headers: { ...HTML_HEADERS, 'cache-control': 'no-store' } }
  )
}

/**
 * A `?template=<id>` Tracy does not offer (`workspace/template-intent.js`). joomlart.com's Download
 * button sends every product here once it opts in, and a template whose quickstart has no release
 * yet must not land on a bare workspace: say so, and point back at the member download page the
 * button used to open, which still works for it.
 * @param {string} template the JoomlArt product id as it arrived
 */
export function templateNotOnTracyPage(template, { lang = 'en' } = {}) {
  const t = translator(lang)
  const id = String(template)
    .replace(/[^a-z0-9-]/gi, '')
    .slice(0, 64)
  const member = `https://www.joomlart.com/member/downloads/joomlart/joomla-templates/${encodeURIComponent(id)}`
  return new Response(
    page(
      t('bar.templateNotOnTracyTitle'),
      `<h1>${t.html('bar.templateNotOnTracyTitle')}</h1>
<p class="card-description">${t.html('bar.templateNotOnTracyBody', { template: `<strong>${escapeHtml(id)}</strong>` })}</p>
<p class="card-description"><a class="back" href="${escapeHtml(member)}">${t.html('bar.templateNotOnTracyMember')} &rarr;</a></p>`,
      t
    ),
    { status: 404, headers: HTML_HEADERS }
  )
}

/**
 * The catalogue could not be read while answering a `?template=`. Distinct from the page above on
 * purpose: "not on Tracy" sends a person away to the member area, and that is the wrong answer for
 * a template Tracy may well offer once the database answers again.
 */
export function templateLookupFailedPage({ lang = 'en' } = {}) {
  const t = translator(lang)
  return new Response(
    page(
      t('bar.templateLookupFailedTitle'),
      `<h1>${t.html('bar.templateLookupFailedTitle')}</h1>
<p class="card-description">${t.html('bar.templateLookupFailedBody')}</p>`,
      t
    ),
    { status: 503, headers: { ...HTML_HEADERS, 'retry-after': '60' } }
  )
}

/**
 * Signed in, and the workspace asked for could not be provided — the seat door refused, the host's
 * dsh is not configured, or it is not answering. The creation workspace and a site's own workspace
 * both answer a navigation with this page (#796). Named as what it is, with the SAME address to
 * press again, so a build intent in that address (`?inspiration=…`) survives the retry.
 * `workspace/route.js` used to fall through to the "no sites" page here, which is a different
 * sentence about a different situation; a person reading it would go looking for an invitation
 * that was never the problem.
 *
 * WHY the cause is not on the page: the caller knows it as an internal sentence ("no host is
 * configured"), which names nothing a customer can act on and was shown in English in every
 * language. The machine answer (`{code, reason}` for a fetch) still carries it.
 *
 * `kept: false` is a refused form POST: its body is not in `retryHref`, and a link would repeat it
 * as a GET of an address that may only take a POST. That page says what was sent was not saved and
 * leads back to Tracy; the browser's Back button is where the filled form still is.
 *
 * `origin` is the deployment's own (`config.origin`). This page is also answered on a customer
 * site's address, where `/` is that site's workspace — the thing that just refused — so the way
 * back to Tracy is an absolute link (`tracyLink`), or no link when no origin is configured.
 */
export function workspaceUnavailablePage(email, { retryHref, kept = true, lang = 'en', origin = '' }) {
  const t = translator(lang)
  // A retry link is written only for a path on the page's own origin: one slash, then anything
  // but a second slash or a backslash (`//host` and `/\host` are another host to a browser).
  const local = typeof retryHref === 'string' && /^\/(?![/\\])/.test(retryHref)
  const action =
    kept && local
      ? `<p class="note"><a class="back" href="${escapeHtml(retryHref)}">${t.html('bar.tryAgain')} &rarr;</a></p>`
      : tracyLink(origin, t)
  return new Response(
    page(
      t('bar.workspaceUnavailableTitle'),
      `<h1>${t.html('bar.workspaceUnavailableHeading')}</h1>
<p class="card-description">${t.html('bar.signedInAs', { email: emailOff(`<strong>${escapeHtml(email)}</strong>`) })}</p>
<p class="note">${t.html(kept ? 'bar.workspaceUnavailableBody' : 'bar.workspaceUnavailableUnsavedBody')}</p>
${action}`,
      t
    ),
    { status: 503, headers: { ...HTML_HEADERS, 'retry-after': '5' } }
  )
}

/** A hostname that names no site this deployment knows — ported from the same-named branch of
 * `messagePage('Unknown site', ...)` call sites in the Worker (`index.js:502`, `:892`, `:756`).
 * `origin` is the deployment's own (`config.origin`): where the link out leads (`tracyLink`). */
export function unknownSitePage(hostname, lang = 'en', origin = '') {
  const t = translator(lang)
  return new Response(
    page(
      t('bar.unknownSiteTitle'),
      `<h1>${t.html('bar.unknownSiteTitle')}</h1><p class="card-description">${t.html('bar.unknownSiteBody', { host: escapeHtml(hostname) })}</p>${tracyLink(origin, t)}`,
      t
    ),
    { status: 404, headers: SITE_HTML_HEADERS }
  )
}

/** The 404 for a hostname the routing rules refuse outright — a `--` label (proposals are not
 * carried; that shape now means nothing) or a hostname naming no domain this deployment owns.
 * A page in the shared shell with a link to Tracy; until #796 it was one line of `text/plain`. */
export function refusedHostPage({ lang = 'en', origin = '' } = {}) {
  const t = translator(lang)
  return new Response(
    page(
      t('bar.notFoundTitle'),
      `<h1>${t.html('bar.notFoundTitle')}</h1><p class="card-description">${t.html('bar.refusedHostBody')}</p>${tracyLink(origin, t)}`,
      t
    ),
    { status: 404, headers: SITE_HTML_HEADERS }
  )
}

/** A generic message page — ported narrowly from `messagePage` (pages.js:1306), for the small
 * number of `/__tracy/*` doors this task builds that need one (method-not-allowed, bad input).
 * `title` and `body` arrive already in the reader's language; `lang` sets `<html lang>`. */
export function messagePage(title, body, status = 200, lang = 'en') {
  const t = translator(lang)
  return new Response(
    page(title, `<h1>${escapeHtml(title)}</h1><p class="card-description">${escapeHtml(body)}</p>`, t),
    { status, headers: SITE_HTML_HEADERS }
  )
}
