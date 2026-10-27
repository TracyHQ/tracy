/**
 * The plain-HTML pages `seats/route.js` serves directly on `/:label/team`, `/:label/join` and
 * `/invite/:token` — the `cowork.tracy.ai`-equivalent surface (`workers/cowork/src/index.js`)
 * that a person invited to a site lands on first, often before they have ever opened the
 * product proper. This is the file task-6's own report flagged as a gap and fix round 1 closes:
 * every page below used to render through a local, bare `<body style="font:15px system-ui">`
 * helper instead of the shared shell — same regression, different file.
 *
 * Split out of `seats/route.js` the way `bar/route.js` already splits into `bar/pages.js` — one
 * file for routing, one for markup — and built on the SAME `pageShell` those doors use
 * (`../lib/page-shell.js`), so this is not a second copy of the token contract.
 *
 * `noSeatPage` (`workers/fleet-bar/src/pages.js:971`) is this file's `joinPage`: same states
 * (default "ask to join", `requested`, `settled: invited|granted|unclaimed`), same
 * `whoamiLine` (`pages.js:955`) footer wherever the viewer's identity is known. Two real
 * differences from the Worker's version, both because this app's own doors don't carry the same
 * shape yet: `settled: 'invited'` has no `invitedBy`/`role` to name (`joinRequest`'s
 * `ALREADY_INVITED` answer in `seats/route.js` carries neither), and the "Accept invitation" and
 * "switch account" forms below post to JSON-only doors (`POST /api/sites/:key/accept`,
 * `POST /auth/signout`) rather than doors that redirect a plain form post — so both are
 * progressively enhanced by `SEATS_SCRIPT`'s generic `data-fetch` handler instead of relying on
 * a server-side redirect that does not exist here. Script is fine on this domain for the same
 * reason it is fine on `identity/route.js`'s `/login`: these pages are never proxied into a
 * customer's CSP (ADR 0034's concern), they are Tracy's own.
 */
import { escapeHtml, emailOff } from '../lib/html.js'
import { pageShell } from '../lib/page-shell.js'
import { TEAM_INVITE_TTL_DAYS } from '../lib/policy.js'
import { safePath } from '../lib/safe-path.js'
import { translator } from '../lib/i18n/index.js'
import { en } from '../lib/i18n/strings.js'
import { SPAM_TIP_SCRIPT, spamTip } from '../lib/spam-tip.js'

/**
 * Progressive enhancement, shared by every form below that posts to a JSON-only door: intercept
 * the submit, `fetch` it, and either follow `data-redirect` on success or show the sibling
 * `role="alert"` block on failure. Works with this stripped out — the form still posts, the
 * browser still shows the door's JSON response and the write still lands — just without the
 * redirect or the inline error.
 */
const SEATS_SCRIPT = `
(function(){
  document.querySelectorAll('form[data-fetch]').forEach(function (form) {
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var button = form.querySelector('button[type=submit]');
      if (button) button.disabled = true;
      fetch(form.getAttribute('action'), { method: 'POST' }).then(function (response) {
        if (response.ok) {
          window.location.href = form.dataset.redirect || location.href;
          return;
        }
        if (button) button.disabled = false;
        var alertBox = document.getElementById(form.dataset.alert || '');
        if (alertBox) alertBox.hidden = false;
      }).catch(function () {
        if (button) button.disabled = false;
        var alertBox = document.getElementById(form.dataset.alert || '');
        if (alertBox) alertBox.hidden = false;
      });
    });
  });
})();
`

function page(title, body, t) {
  return pageShell(title, body, SEATS_SCRIPT + SPAM_TIP_SCRIPT, { lang: t.htmlLang })
}

/**
 * The card every step of the invitation and join flow sits in (dev 04/10/2026: the decline confirm
 * was a card and its result was not). `heading` and `description` are HTML already; `content`, when
 * given, goes under them inside the card.
 */
function card(heading, description, content = '') {
  return `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${heading}</h1>
${description}
</div>${content ? `\n<div class="card-content">\n${content}\n</div>` : ''}
</div>`
}

/** A role or status code read through the dictionary, or shown as it is when the dictionary does
 * not know it — a new code from the store must never render as a missing key. */
function label(t, prefix, value) {
  const key = `${prefix}.${value}`
  return Object.hasOwn(en, key) ? t(key) : String(value ?? '')
}

/**
 * "Signed in as X · switch account" — ported from `whoamiLine` (`pages.js:955`). A real form,
 * not a link: signing out is a POST (`/auth/signout`), so a GET a crawler or a prefetch can
 * trigger must never do it. `next` is where the sign-in door should return the viewer to; this
 * app's `/auth/signout` does not itself redirect (unlike the Worker's), so `SEATS_SCRIPT`'s
 * `data-redirect` carries the viewer to `next` client-side once the cookie is cleared.
 */
export function whoamiLine(email, next = '/login', lang = 'en') {
  const t = translator(lang)
  return `<div class="whoami">${t.html('seats.signedInAs', { email: emailOff(`<strong>${escapeHtml(email)}</strong>`) })} <form method="post" action="/auth/signout" data-fetch data-redirect="${escapeHtml(next)}">(<button type="submit">${t.html('seats.switchAccount')}</button>)</form></div>`
}

/** `title` and `message` arrive already in the reader's language (the caller holds the request). */
export function messagePage(title, message, lang = 'en') {
  const t = translator(lang)
  return page(title, card(escapeHtml(title), `<p class="card-description">${escapeHtml(message)}</p>`), t)
}

export function tooManyRequestsPage(lang = 'en') {
  const t = translator(lang)
  return page(
    t('seats.tooManyTitle'),
    card(t.html('seats.tooManyTitle'), `<p class="card-description">${t.html('seats.tooManyBody')}</p>`),
    t
  )
}

/**
 * The status code a roster row is worded by (#792). A row an administrator closed is `revoked` in
 * the book whichever of the three acts closed it; `removalKind` says which, and a cancelled
 * invitation or a declined request is never printed as a revoke. A row with no kind (closed before
 * the kind was stored, or by its holder leaving) and a kind this build does not know stay `revoked`.
 */
const REMOVED_AS = Object.freeze({ cancel_invite: 'inviteCancelled', decline_request: 'requestDeclined' })
function statusCodeOf(seat) {
  if (seat.status !== 'revoked' || typeof seat.removalKind !== 'string') return seat.status
  return Object.hasOwn(REMOVED_AS, seat.removalKind) ? REMOVED_AS[seat.removalKind] : seat.status
}

export function teamPage({ siteKey, seats, viewer, lang = 'en' }) {
  const t = translator(lang)
  const rows = seats
    .map(
      (s) =>
        `<li>${s.email ? emailOff(escapeHtml(s.email)) : escapeHtml(s.displayName ?? t('seats.unknownMember'))} · ${escapeHtml(label(t, 'role', s.role))} (${escapeHtml(label(t, 'seatStatus', statusCodeOf(s)))})</li>`
    )
    .join('')
  return page(
    t('seats.teamTitle', { site: siteKey }),
    `<h1>${escapeHtml(siteKey)}</h1>
<ul class="hint">${rows || `<li>${t.html('seats.noSeats')}</li>`}</ul>
${whoamiLine(viewer, undefined, lang)}`,
    t
  )
}

/**
 * Ported from `noSeatPage` (`pages.js:971`) — same states, same order: `settled === 'invited'`
 * gets an accept form (not merely told to check their mail — an accepted invitation IS
 * actionable here, `POST /api/sites/:key/accept` already exists), then the other `settled`
 * answers (already requested/granted/unclaimed), then `requested` (just asked), then the
 * default ask-to-join form. Every branch below carries `whoamiLine` once `viewer` is known,
 * same as the Worker's version. An `error` arrives already translated by the caller.
 */
export function joinPage({
  siteKey,
  viewer,
  requested = false,
  settled = null,
  error = null,
  next = null,
  origin = '',
  sender = '',
  lang = 'en'
}) {
  const t = translator(lang)
  const who = viewer ? whoamiLine(viewer, undefined, lang) : ''
  const site = `<strong>${escapeHtml(siteKey)}</strong>`
  // Review round 2, finding 3: this used to hardcode the accept button's landing spot to `/`,
  // so someone who followed a link to a specific page, hit the seat gate, and accepted, was sent
  // to the front page instead of what they actually came for. Sanitised through
  // identity/route.js's own exported `safePath` (re-exported from lib/safe-path.js, where it now
  // lives so more than one domain can share it) — never a second, locally-invented sanitizer.
  const safeNext = safePath(next, origin)

  if (settled === 'invited') {
    return page(
      t('seats.invitedTitle'),
      `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.invitedTitle')}</h1>
<p class="card-description">${t.html('seats.invitedBody', { site })}</p>
</div>
<div class="card-content">
<form method="post" action="/api/sites/${encodeURIComponent(siteKey)}/accept" data-fetch data-redirect="${escapeHtml(safeNext)}" data-alert="accept-error">
<button type="submit">${t.html('seats.acceptInvitation')}</button>
</form>
<div class="alert destructive" role="alert" id="accept-error" hidden><span aria-hidden="true">!</span>${t.html('seats.tryAgain')}</div>
<p class="note">${t.html('seats.acceptNote')}</p>
${who}
</div>
</div>`,
      t
    )
  }
  if (settled === 'granted') {
    return page(
      t('seats.grantedTitle', { site: siteKey }),
      `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.grantedTitle', { site: escapeHtml(siteKey) })}</h1>
</div>
<div class="card-content">
<form method="get" action="/${encodeURIComponent(siteKey)}" data-open-site>
<button type="submit">${t.html('seats.openSite')}</button>
</form>
${who}
</div>
</div>`,
      t
    )
  }
  if (settled === 'unclaimed') {
    return page(
      t('seats.unclaimedTitle'),
      `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.unclaimedTitle')}</h1>
<p class="card-description">${t.html('seats.unclaimedBody', { site })}</p>
</div>
<div class="card-content">
<p class="note">${t.html('seats.unclaimedNote')}</p>
${who}
</div>
</div>`,
      t
    )
  }
  if (requested) {
    return page(
      t('seats.requestedTitle'),
      `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.requestedTitle')}</h1>
<p class="card-description">${t.html('seats.requestedBody', { site })}</p>
</div>
<div class="card-content">
<p class="note">${t.html('seats.requestedNote')}</p>
${spamTip(t, 'spam-request', t('seats.requestedSpamTip', { sender: sender || 'Tracy' }))}
${who}
</div>
</div>`,
      t
    )
  }

  const errorBlock = error
    ? `<div class="alert destructive" role="alert"><span aria-hidden="true">!</span>${escapeHtml(error)}</div>`
    : ''
  return page(
    t('seats.joinTitle', { site: siteKey }),
    `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.joinHeading', { site: escapeHtml(siteKey) })}</h1>
<p class="card-description">${t.html('seats.joinBody', { site })}</p>
</div>
<div class="card-content">
<form method="post">
<button type="submit">${t.html('seats.askForAccess')}</button>
</form>
${errorBlock}
<p class="note">${t.html('seats.joinNote', { site })}</p>
${who}
</div>
</div>`,
    t
  )
}

export function invalidInvitePage(lang = 'en') {
  const t = translator(lang)
  return page(
    t('seats.invalidInviteTitle'),
    card(
      t.html('seats.invalidInviteTitle'),
      `<p class="card-description">${t.html('seats.invalidInviteBody')}</p>`
    ),
    t
  )
}

/** A link past `TEAM_INVITE_TTL_S` (#804). The number of days is the policy's, never typed here. */
export function expiredInvitePage(lang = 'en') {
  const t = translator(lang)
  return page(
    t('seats.expiredInviteTitle'),
    card(
      t.html('seats.expiredInviteTitle'),
      `<p class="card-description">${t.html('seats.expiredInviteBody', { days: String(TEAM_INVITE_TTL_DAYS) })}</p>`
    ),
    t
  )
}

export function wrongAccountPage({ email, loginHref, lang = 'en' }) {
  const t = translator(lang)
  // The `&` joining `loginHref` (already carrying its own `?next=...`) to `email=` is HTML
  // content, not just a URL separator — left raw it is a malformed attribute value (review
  // round 2, finding 4). Escaping the whole assembled href, once, after the query string is
  // built covers both.
  const href = `${loginHref}&email=${encodeURIComponent(email)}`
  // #799: a button that signs OUT first, not a link to `/login`. `/login` sends a person who
  // already holds a session straight on to `next` — here, back to this very refusal — so a link
  // was a loop with no way out. `POST /auth/signout` clears the session and then redirects a
  // form post to `next` itself (`identity/route.js`), which is why this form carries no
  // `data-fetch`: `SEATS_SCRIPT` would post without the field, and the server's redirect works
  // with JavaScript off. A POST, so opening or prefetching this page signs nobody out. The form
  // wraps the paragraph because a `<form>` may not sit inside a `<p>`.
  const button = `<button type="submit">${t.html('seats.signInAs', { email: emailOff(escapeHtml(email)) })}</button>`
  return page(
    t('seats.wrongAccountTitle'),
    card(
      t.html('seats.wrongAccountHeading', { email: emailOff(escapeHtml(email)) }),
      `<form method="post" action="/auth/signout">
<input type="hidden" name="next" value="${escapeHtml(href)}">
<p class="card-description">${t.html('seats.wrongAccountBody', { link: button })}</p>
</form>`
    ),
    t
  )
}

export function inviteLandingPage({ summary, role, sites, email, lang = 'en' }) {
  const t = translator(lang)
  const roleLabel =
    Object.hasOwn(en, `role.${role}`) && role !== 'member' ? t(`role.${role}`) : t('role.member')
  const rows = sites
    .map((s) => `<li>${escapeHtml(s.siteKey)} — ${escapeHtml(label(t, 'seats.outcome', s.outcome))}</li>`)
    .join('')
  const openMySites = `<p class="note"><a class="back" href="/">${t.html('seats.openMySites')}</a></p>`
  if (summary === 'revoked') {
    return page(
      t('seats.revokedTitle'),
      card(
        t.html('seats.revokedTitle'),
        `<p class="card-description">${t.html('seats.revokedBody')}</p>`,
        `<ul class="hint">${rows}</ul>`
      ),
      t
    )
  }
  if (summary === 'already') {
    return page(
      t('seats.alreadyTitle'),
      card(
        t.html('seats.alreadyTitle'),
        `<p class="card-description">${t.html('seats.alreadyBody')}</p>`,
        `<ul class="hint">${rows}</ul>${openMySites}`
      ),
      t
    )
  }
  const landed = t(sites.length === 1 ? 'seats.landedTitleOne' : 'seats.landedTitleMany', {
    count: sites.length
  })
  return page(
    landed,
    card(
      escapeHtml(landed),
      `<p class="card-description">${t.html('seats.landedBody', { role: escapeHtml(roleLabel), email: emailOff(escapeHtml(email)) })}</p>`,
      `<ul class="hint">${rows}</ul>${openMySites}`
    ),
    t
  )
}

/**
 * The page behind "Not for you? Decline" in the invitation mail (#809 case T6). Opening the link
 * never declines anything (a mail scanner or a link preview opens links too): `state: 'confirm'`
 * shows the sites still open and one button that posts to the same address; `state: 'declined'`
 * is what the page reads once every invitation it named is declined. An invitation already
 * accepted, or withdrawn, reuses the landing page's own words for those two outcomes.
 * @param {{state: 'confirm'|'declined'|'already'|'revoked', siteKeys: string[], action?: string, lang?: string}} input
 */
export function declineInvitePage({ state, siteKeys, action = '', lang = 'en' }) {
  const t = translator(lang)
  const sites = siteKeys.map((key) => `<strong>${escapeHtml(key)}</strong>`).join(', ')
  if (state === 'already') {
    return page(
      t('seats.alreadyTitle'),
      card(
        t.html('seats.alreadyTitle'),
        `<p class="card-description">${t.html('seats.alreadyBody')}</p>`,
        `<p class="note"><a class="back" href="/">${t.html('seats.openMySites')}</a></p>`
      ),
      t
    )
  }
  if (state === 'revoked') {
    return page(
      t('seats.revokedTitle'),
      card(t.html('seats.revokedTitle'), `<p class="card-description">${t.html('seats.revokedBody')}</p>`),
      t
    )
  }
  if (state === 'declined') {
    return page(
      t('seats.declinedTitle'),
      card(
        t.html('seats.declinedTitle'),
        `<p class="card-description">${t.html('seats.declinedBody', { sites })}</p>`
      ),
      t
    )
  }
  return page(
    t('seats.declineTitle'),
    `<div class="card auth-card">
<div class="card-header">
<h1 class="card-title">${t.html('seats.declineTitle')}</h1>
<p class="card-description">${t.html('seats.declineBody', { sites })}</p>
</div>
<div class="card-content">
<form method="post" action="${escapeHtml(action)}" data-fetch data-redirect="${escapeHtml(action)}" data-alert="decline-error">
<button type="submit">${t.html('seats.declineButton')}</button>
</form>
<div class="alert destructive" role="alert" id="decline-error" hidden><span aria-hidden="true">!</span>${t.html('seats.tryAgain')}</div>
</div>
</div>`,
    t
  )
}
