/**
 * The sign-in page, as a pure function: parameters in, one HTML document out. It knows nothing of
 * Hono, cookies or the store — `route.js` decides WHICH page to render and with what, this file
 * only draws it. Same split every other domain keeps (`seats/pages.js`, `bar/pages.js`), and the
 * reason `@tracy/design` can put the real page on the bench: a story imports this file and gets
 * the same string the server sends, without dragging the router and the store into a Vite bundle.
 */
import { escapeHtml, emailOff } from '../lib/html.js'
import { pageShell, GOOGLE_MARK, GITHUB_MARK } from '../lib/page-shell.js'
import { LINKS } from '../lib/public-links.js'
import { safePath } from '../lib/safe-path.js'
import { SOURCE_KEYS, signInSource, sourceQuery } from '../lib/sign-in-source.js'
import { translator } from '../lib/i18n/index.js'
import { CODE_TTL_MINUTES } from '../lib/policy.js'
import { SPAM_TIP_SCRIPT, spamTip } from '../lib/spam-tip.js'

const OTP_LENGTH = 6

/** The one number every sentence about a sign-in code's life prints (#794): `{minutes}`. */
const LIFETIME = Object.freeze({ minutes: CODE_TTL_MINUTES })

/** What `/login` says when a request is over its hourly cap (#664) — the form post renders it and
 * `loginScript` shows it on a 429, one sentence for both. The English text; other languages read
 * key `login.rateLimited` through `translator(lang)`.
 *
 * 🔒 The sentence takes no value and says nothing about a code (#794). The door that answers 429
 * never looks at the code table, so it cannot know whether a code was mailed, replaced by a later
 * one, used, used up or expired — it only says requests are limited and to try again later. */
export const LOGIN_RATE_LIMITED_MESSAGE = translator('en')('login.rateLimited')

/**
 * A `role="alert"` block that is ALSO real server-rendered content when there is something to
 * say — not merely a hidden shell for the client script to fill in later. Review round 2,
 * finding 2 exists because the previous version was exactly that: an empty, always-hidden div,
 * useless the moment `loginScript` fails to load. `${id}-text` stays a separate span so the
 * script can update just the message without touching the `!` icon beside it.
 */
function alertBlock(id, message) {
  const hasMessage = Boolean(message)
  return `<div class="alert destructive" role="alert" id="${id}"${hasMessage ? '' : ' hidden'}><span aria-hidden="true">!</span><span id="${id}-text">${hasMessage ? escapeHtml(message) : ''}</span></div>`
}

/**
 * Tracy's ONE sign-in door — `/login`, on tracy-web's own hostname. Rewritten for task 6
 * (`.superpowers/sdd/2026-09-09-tracy-web-04-bar-ops-public/task-6-brief.md`) to build on the
 * shared `pageShell` instead of a hand-rolled `<!doctype html><meta charset="utf-8">` string, and
 * to match `loginPage()`'s markup (`workers/fleet-bar/src/pages.js:858`) where this route's own
 * transport allows it: SIX real OTP boxes (not one text input — that shape belongs to
 * `bar/pages.js`'s `otpCodeStepPage`, which ports the Worker's *other* OTP screen, `otpPage`),
 * `autocomplete="one-time-code"` on the first box only, an email prefilled from an invite link,
 * and a `role="alert"` error block on every form.
 *
 * REVIEW ROUND 2, FINDING 2: both forms used to carry no `method`/`action`, and the OTP boxes no
 * `name` at all — the page WORKED, but only via `loginScript`'s `fetch` calls, so a visitor whose
 * script failed to load had a page with nothing to press. Both forms now post for real
 * (`POST /login`, `POST /verify` — the SAME doors `loginScript` calls, which detect a real form
 * body and answer with a rendered page instead of JSON; see `isForm` above), and `step`/`error`
 * let the SERVER decide which card is visible, the same way the Worker's own version does. The
 * six `name="code"` boxes arrive as six same-named form entries on a real submit — exactly how
 * the Worker's own `otp-slot` markup posts them — which `POST /verify` reassembles with
 * `getAll('code').join('')`.
 *
 * Script stays as an ENHANCEMENT on top of that, not the only path: it intercepts both submits to
 * call the same two doors over `fetch`/JSON instead of a full-page reload, for a visitor who has
 * it. `/login` runs on Tracy's own hostname, so ADR 0034's no-script rule (about a page proxied
 * inside a CUSTOMER's CSP) does not apply here — same exemption the Worker's own `loginPage` used
 * for its identical inline script.
 * Every word comes from `../lib/i18n/strings.js` in `lang` (#753); an `error` arrives already
 * translated by the caller (`identity/route.js` holds the request, this file does not).
 *
 * `waitlistUrl` (#796): where a person whose address is not admitted yet goes next — the
 * deployment's configured whitelist page, given only while the beta gate is on. The link is drawn
 * by the SERVER, hidden, and the script only ever shows or hides it: an answer from `/verify`
 * never supplies an address to navigate to. `showWaitlist` shows it on a form post's answer.
 * `source` (`../lib/sign-in-source.js`): where this sign-in came from, carried as hidden `utm_*`
 * fields on every form that leads to a code or a provider, so the door that finishes the sign-in
 * still has it. The page cleans it again before drawing it; the doors clean what comes back.
 * @param {{next?: string, email?: string, origin: string, oauth?: object, step?: 'email'|'code', error?: string, lang?: string, waitlistUrl?: string, showWaitlist?: boolean, source?: object|null}} params
 * @returns {string} a complete HTML document.
 */
export function loginPage({
  next,
  email = '',
  origin,
  oauth = {},
  step = 'email',
  error = '',
  localPreview = false,
  localCode = '',
  lang = 'en',
  explicitLang = null,
  waitlistUrl = '',
  showWaitlist = false,
  source = null,
  onboard = false,
  reason = null
} = {}) {
  const t = translator(lang)
  const safeNext = safePath(next, origin)
  const reasonKey = SIGN_IN_REASONS[reason] ?? null
  if (onboard) return onboardLoginPage({ t, safeNext, origin, email, oauth, reasonKey })
  if (reasonKey !== null && !error && step === 'email') error = t(reasonKey)
  const cleanSource = signInSource(sourceParams(source))
  const sourceFields = sourceInputs(cleanSource)
  const sourceLink = cleanSource ? `&amp;${escapeHtml(sourceQuery(cleanSource))}` : ''
  const waitlist = httpAddress(waitlistUrl)
  // A language asked for in the link (`?lang=`) rides along on every door this page posts to, so
  // the next page and the code mail stay in it; without one, each request resolves on its own
  // (cookie from an explicit Settings pick, then the browser's language — `../lib/i18n/index.js`).
  const langQuery = explicitLang ? `?lang=${encodeURIComponent(explicitLang)}` : ''
  const emailValue = escapeHtml(email ?? '')

  // Google leads the card (a third of first sign-ins, and no code to wait for). GitHub stays where a
  // deployment lights it up (`config.oauth.github`): whether it shows is the deployment's call.
  const providerButtons = [
    oauth?.google
      ? providerForm(
          'google',
          GOOGLE_MARK,
          t.html('login.continueWithProvider', { provider: 'Google' }),
          safeNext,
          sourceFields
        )
      : '',
    oauth?.github ? providerForm('github', GITHUB_MARK, 'GitHub', safeNext, sourceFields) : ''
  ]
    .filter(Boolean)
    .join('')

  const otpSlots = Array.from({ length: OTP_LENGTH }, (_, i) => {
    const dash = i === 2 || i === 4 ? '<span class="otp-dash" aria-hidden="true">&ndash;</span>' : ''
    const first = i === 0
    return `${dash}<input class="otp-slot" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="1" required autocomplete="${first ? 'one-time-code' : 'off'}"${first ? ' autofocus' : ''}>`
  }).join('')

  const onCodeStep = step === 'code'

  // The code step names the address and claims nothing about a letter (#811 F-S1-008). This page
  // cannot know one left: with the beta gate on, `POST /login` answers a rate-limited, a queued
  // and a refused address alike, and the script below shows this same step on that answer.
  const emailStrong = emailOff(`<strong id="code-step-email">${emailValue}</strong>`)
  const body = `${signInPitch(t)}<div class="signin-side">
<div class="card auth-card" id="email-step"${onCodeStep ? ' hidden' : ''}>
<div class="card-header">
<h2 class="card-title">${t.html('login.getStarted')}</h2>
<p class="card-description">${t.html('login.getStartedNote')}</p>
</div>
<div class="card-content">
${providerButtons ? `<div class="providers">${providerButtons}</div><p class="separator-label">${t.html('login.orUseEmail')}</p>` : ''}
<form id="email-form" method="post" action="/login${langQuery}">
<input type="hidden" name="next" value="${escapeHtml(safeNext)}">
${sourceFields}<input id="login-email" type="email" name="email" value="${emailValue}" placeholder="${t.html('login.emailPlaceholder')}" aria-label="${t.html('login.emailLabel')}" autocomplete="email" required>
<p class="email-suggest" id="email-suggest" hidden><button type="button" id="email-suggest-use"></button></p>
${alertBlock('email-error', onCodeStep ? '' : error)}
<button type="submit">${t.html('login.emailMeCode')}</button>
</form>
<p class="note">${t.html('login.codeEachTime')}</p>
</div>
</div>
<div class="card auth-card" id="code-step"${onCodeStep ? '' : ' hidden'}>
<div class="card-header">
<h1 class="card-title">${t.html(localPreview ? 'login.localTitle' : 'login.checkEmailTitle')}</h1>
<p class="card-description">${t.html('login.codeFor', { email: emailStrong })}</p>
</div>
<div class="card-content">
<form id="code-form" method="post" action="/verify${langQuery}">
<input type="hidden" name="email" value="${emailValue}">
<input type="hidden" name="next" value="${escapeHtml(safeNext)}">
${sourceFields}
${localPreview ? `<p class="note" id="local-code-note"${localCode ? '' : ' hidden'}>${t.html('login.localCode', { ...LIFETIME, code: `<strong id="local-code">${escapeHtml(localCode)}</strong>` })}</p>` : ''}
<div class="otp-boxes">${otpSlots}</div>
<p class="card-description">${t.html('login.noCodeHint')}</p>
${alertBlock('code-error', onCodeStep ? error : '')}
${waitlist ? `<p class="note" id="waitlist-note"${onCodeStep && showWaitlist ? '' : ' hidden'}><a class="back" id="waitlist-link" href="${escapeHtml(waitlist)}" rel="noopener">${t.html('mail.whitelistButton')} &rarr;</a></p>` : ''}
<button type="submit">${t.html('login.verify')}</button>
</form>
<form id="resend-form" class="resend" method="post" action="/login${langQuery}">
<input type="hidden" name="email" value="${emailValue}">
<input type="hidden" name="next" value="${escapeHtml(safeNext)}">
${sourceFields}<button type="submit">${t.html('login.resend')}</button>
</form>
<p class="note">${t.html('login.codeLifetime', LIFETIME)} <a href="/login?next=${encodeURIComponent(safeNext)}${explicitLang ? `&amp;lang=${encodeURIComponent(explicitLang)}` : ''}${sourceLink}">${t.html('login.useDifferentAddress')}</a></p>
${spamTip(t, 'spam-signin', t('login.spamTip'))}
</div>
</div>
${signInLinks()}
</div>
</div>`

  return pageShell(t('login.title'), body, loginScript(safeNext, t) + SPAM_TIP_SCRIPT + visitScript(source), {
    lang: t.htmlLang,
    style: SIGN_IN_STYLE
  })
}

/**
 * Why the desktop app came back to the sign-in page (`/login?reason=`): its sign-in round ended
 * without a session — the server refused the address, the round expired, the person pressed Deny,
 * or the redeem failed. Only these words draw a message, each from the catalogue; anything else
 * is ignored, so no text from the address is ever drawn.
 */
const SIGN_IN_REASONS = Object.freeze({
  __proto__: null,
  'not-admitted': 'login.notAdmitted',
  expired: 'onboard.signInUnfinished',
  denied: 'onboard.signInUnfinished',
  failed: 'onboard.signInUnfinished'
})

/** The four steps of the desktop app's Setup frame, in order (`@tracy/dsh-tracy-onboard` draws 2–4). */
const SETUP_STEPS = Object.freeze([
  'onboard.stepSignIn',
  'onboard.stepAi',
  'onboard.stepLook',
  'onboard.stepNotify'
])

/**
 * The Setup frame's own rules: the frame and the step rail of `packages/ui/tracy-onboard`'s
 * `onboard.css`, ported to this shell's tokens (`docs/references/page-shell-tokens.md`): the same
 * names, no new variable, no raw colour. Only the onboard page passes them to `pageShell`.
 */
const SETUP_STYLE = `main:has(.setup){max-width:47.5rem}
.setup{display:flex;flex-direction:column;gap:1.125rem;border-radius:0.75rem;border:1px solid var(--border);
background:var(--card);color:var(--card-foreground);padding:1.125rem 1.5rem 1rem;box-shadow:var(--shadow-sm)}
.setup-eyebrow{margin:0;font-size:0.75rem;color:var(--muted-foreground)}
.setup-columns{display:grid;grid-template-columns:11.5rem minmax(0,1fr);gap:1.375rem}
.setup-rail{display:flex;flex-direction:column;gap:2px;min-width:0}
.setup-rail-head{display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0 2px 0.5rem}
.setup-rail-title,.setup-rail-count{font-size:0.6875rem;color:var(--muted-foreground);font-variant-numeric:tabular-nums}
.setup-rail-title{font-weight:600;text-transform:uppercase;letter-spacing:.05em}
button.setup-step{justify-content:flex-start;gap:0.625rem;width:100%;height:auto;padding:0.4375rem 0.5rem;
border:0;border-radius:var(--radius-md);background:transparent;color:var(--foreground);box-shadow:none;
font-size:0.8125rem;font-weight:400;line-height:1.3;text-align:left;white-space:normal}
button.setup-step[aria-current="step"],button.setup-step[aria-current="step"]:hover{background:var(--accent);font-weight:500}
button.setup-step:disabled{opacity:.55}
button.setup-step:disabled:hover{background:transparent}
.setup-mark{width:1.25rem;height:1.25rem;flex:none;display:grid;place-items:center;border-radius:50%;
border:1px solid var(--border);color:var(--muted-foreground);font-size:0.6875rem;font-variant-numeric:tabular-nums}
.setup-pane{min-width:0;display:flex;flex-direction:column;padding-left:1.375rem;border-left:1px solid var(--border)}
.setup-title-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}
.setup-title{font-size:1.25rem;font-weight:600;line-height:1.25}
.setup-chip{flex:none;padding:0.1875rem 0.625rem;border-radius:999px;font-size:0.75rem;font-weight:500;
border:1px solid var(--border);color:var(--muted-foreground)}
.setup-subtitle{margin:0.375rem 0 0;font-size:0.8125rem;line-height:1.5;color:var(--muted-foreground)}
.setup-body{margin-top:1.125rem;display:flex;flex-direction:column;gap:0.75rem;max-width:22.5rem}
.setup-body form{gap:0.75rem}
.setup-note{margin:0;font-size:0.75rem;line-height:1.5;color:var(--muted-foreground)}
.setup-foot{margin:0;padding-top:0.75rem;border-top:1px solid var(--border);font-size:0.75rem;color:var(--muted-foreground)}
@media (max-width:40rem){.setup-columns{grid-template-columns:1fr}.setup-pane{padding-left:0;border-left:0}}
`

/**
 * The left half of `/login`: what Tracy is, in the words tracy.ai and joomlart.com open with, so a
 * person who clicked through from either reads the same promise here. The two pictures are real
 * template cards this server already serves (`/api/templates/:id/shots/:file?w=720`, public, same
 * origin, so the page's `img-src 'self'` allows them); when a deployment lacks a card, `loginScript`
 * hides the pictures and the words stand alone. Decorative: the pictures and the example chat are hidden from screen readers.
 * @param {(key: string, values?: object) => string & {html: Function}} t
 */
function signInPitch(t) {
  const frame = (id, cls) =>
    `<div class="signin-frame ${cls}"><div class="signin-frame-bar"><i></i><i></i><i></i></div><img src="/api/templates/${id}/shots/${id}-home-1440.png?w=720" alt="" decoding="async"></div>`
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&amp;display=swap">
<div class="signin-split">
<section class="signin-pitch">
<p class="signin-eyebrow">${t.html('login.heroTitle')}</p>
<h1 class="signin-title">${t.html('login.pitchTitle')}</h1>
<p class="signin-lede">${t.html('login.pitchLede')}</p>
<div class="signin-stage" aria-hidden="true">
${frame('ja-voyara', 'signin-frame-back')}
${frame('ja-kinetic', 'signin-frame-front')}
<p class="signin-ask"><span>&#10042;</span>${t.html('login.exampleAsk')}</p>
<p class="signin-done">${t.html('login.exampleDone')}</p>
</div>
<p class="signin-works"><span>${t.html('login.worksWith')}</span> Joomla <span aria-hidden="true">&middot;</span> WordPress <span aria-hidden="true">&middot;</span> EmDash</p>
</section>`
}

/** tracy.ai, Discord and X under the sign-in card, from the one list the public pages link to (`LINKS`). */
function signInLinks() {
  const link = (href, label, mark) =>
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${mark}${escapeHtml(label)}</a>`
  return `<nav class="signin-links">
${link(LINKS.home, 'tracy.ai', GLOBE_MARK)}
${link(LINKS.discord, 'Discord', DISCORD_MARK)}
${link(LINKS.x, '@tracydotai', X_MARK)}
</nav>`
}

const GLOBE_MARK =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/></svg>'
const DISCORD_MARK =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true"><path d="M20.3 4.4A19.6 19.6 0 0 0 15.4 3l-.6 1.3a18 18 0 0 0-5.6 0L8.6 3a19.6 19.6 0 0 0-4.9 1.4C.6 9-.3 13.6.1 18.1A19.8 19.8 0 0 0 6.1 21l1.3-2a12.8 12.8 0 0 1-2-1l.5-.4a14 14 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2a19.7 19.7 0 0 0 6-2.9c.5-5.2-.8-9.7-3.6-13.7ZM8 15.4c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.6 8 10.6s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"/></svg>'
const X_MARK =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M18.2 2h3.4l-7.4 8.5L23 22h-6.8l-5.3-6.9L4.8 22H1.4l7.9-9L1 2h7l4.8 6.3L18.2 2Zm-1.2 18h1.9L7.1 4H5.1l11.9 16Z"/></svg>'

/**
 * The two-column `/login` (pitch left, sign-in right; stacked under 52rem, pictures dropped).
 * Page-shell tokens only (docs/references/page-shell-tokens.md): the warm wash is `--primary` mixed
 * into `--background`, so dark mode gets a dark wash, never a light one.
 */
const SIGN_IN_STYLE = `
main:has(.signin-split){max-width:68rem}
body:has(.signin-split){background:
radial-gradient(70rem 36rem at 15% -10%,color-mix(in oklab,var(--primary) 14%,var(--background)) 0%,transparent 70%),
var(--background)}
.signin-split{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,26rem);gap:3.5rem;align-items:center}
.signin-pitch{display:flex;flex-direction:column;gap:0.875rem;min-width:0}
.signin-eyebrow{align-self:flex-start;margin:0;padding:0.3rem 0.75rem;border-radius:999px;font-size:0.8125rem;font-weight:600;
background:color-mix(in oklab,var(--primary) 16%,var(--background));color:color-mix(in oklab,var(--primary) 80%,var(--foreground))}
.signin-title{font-family:Fraunces,Newsreader,Georgia,serif;font-size:2.625rem;font-weight:600;line-height:1.08;
letter-spacing:-0.015em;margin:0;text-wrap:balance;color:color-mix(in oklab,var(--primary) 22%,var(--foreground))}
.signin-lede{margin:0;font-size:1.0625rem;line-height:1.55;color:color-mix(in oklab,var(--foreground) 72%,transparent);max-width:32rem}
.signin-stage{position:relative;height:15.5rem;max-width:32.5rem;margin:0.5rem 0 0.25rem}
.signin-frame{position:absolute;overflow:hidden;border-radius:0.75rem;background:var(--card);
border:1px solid color-mix(in oklab,var(--foreground) 10%,transparent);box-shadow:0 18px 40px color-mix(in oklab,var(--foreground) 14%,transparent)}
.signin-frame-bar{height:1.375rem;display:flex;align-items:center;gap:0.3rem;padding:0 0.55rem;
background:color-mix(in oklab,var(--foreground) 5%,var(--card))}
.signin-frame-bar i{width:0.45rem;height:0.45rem;border-radius:50%;background:color-mix(in oklab,var(--foreground) 16%,var(--card))}
.signin-frame img{display:block;width:100%;height:calc(100% - 1.375rem);object-fit:cover;object-position:top}
.signin-frame-front{left:0;top:1.1rem;width:24rem;height:13.75rem;z-index:2}
.signin-frame-back{left:9.5rem;top:0;width:21rem;height:12.5rem;transform:rotate(2deg);opacity:.9}
.signin-ask,.signin-done{position:absolute;z-index:3;margin:0;border-radius:999px;font-size:0.8125rem;line-height:1.35}
.signin-ask{left:12.5rem;top:9.25rem;max-width:18rem;display:flex;gap:0.5rem;align-items:center;padding:0.55rem 0.9rem 0.55rem 0.65rem;
background:var(--card);color:var(--foreground);border:1px solid color-mix(in oklab,var(--foreground) 10%,transparent);
box-shadow:0 10px 26px color-mix(in oklab,var(--foreground) 16%,transparent)}
.signin-ask span{color:var(--primary);font-size:0.9375rem}
.signin-done{right:0.5rem;top:12.6rem;padding:0.35rem 0.75rem;white-space:nowrap;background:var(--foreground);color:var(--background);font-size:0.75rem}
.signin-works{margin:0;padding-top:0.875rem;font-size:0.875rem;border-top:1px solid color-mix(in oklab,var(--foreground) 10%,transparent);max-width:32.5rem}
.signin-works span:first-child{display:block;margin-bottom:0.375rem;font-size:0.6875rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted-foreground)}
.signin-side{display:flex;flex-direction:column;gap:1rem;min-width:0}
.signin-side .card-title{font-size:1.125rem}
.signin-side .providers{grid-template-columns:repeat(auto-fit,minmax(0,1fr))}
.signin-side .providers button{height:2.75rem}
.email-suggest{margin:-0.25rem 0 0;font-size:0.8125rem;color:var(--muted-foreground)}
.email-suggest button{all:unset;cursor:pointer;color:inherit}
.email-suggest button strong{color:var(--primary);font-weight:500;text-decoration:underline;text-underline-offset:0.15em}
.email-suggest button:focus-visible{outline:1px solid var(--ring);outline-offset:2px;border-radius:2px}
.signin-links{display:flex;justify-content:center;flex-wrap:wrap;gap:0.5rem 1.25rem;font-size:0.8125rem}
.signin-links a{display:inline-flex;align-items:center;gap:0.375rem;color:var(--muted-foreground);text-decoration:none}
.signin-links a:hover{color:var(--foreground)}
@media (max-width:52rem){
  main:has(.signin-split){max-width:26rem}
  .signin-split{grid-template-columns:minmax(0,1fr);gap:1.75rem}
  .signin-title{font-size:1.875rem}
  .signin-stage{display:none}
}
`

/**
 * `/login?onboard=1`: the desktop app's first run (`tasks/todo-desktop-onboard-v2.md`, contract
 * item 1). The same two ways in as the plain page, inside the app's four-step Setup frame: step 1
 * open, steps 2–4 shown and disabled, no Skip or Continue — there is nothing to skip to before a
 * sign-in. Both ways open the person's browser, so they end up signed in on the web too:
 *
 *   - the email form is a plain GET to `/signin/email?email=…`, which the app catches and turns into
 *     a desktop round carrying the address (a browser that is not the app lands on `/login?email=`);
 *   - Google is the same `/signin/google` form the plain page has. GitHub is left out on purpose
 *     (11/10/2026: two choices, no more).
 *
 * No script: the app watches the navigation, so nothing on the page may intercept the form.
 */
function onboardLoginPage({ t, safeNext, origin, email, oauth, reasonKey = null }) {
  const nextField =
    safeNext === safePath(undefined, origin)
      ? ''
      : `<input type="hidden" name="next" value="${escapeHtml(safeNext.slice(origin.length))}">\n`
  const rail = SETUP_STEPS.map((key, i) => {
    const state = i === 0 ? ' aria-current="step"' : ` disabled title="${t.html('onboard.locked')}"`
    return `<button class="setup-step" type="button"${state}><span class="setup-mark">${i + 1}</span><span>${t.html(key)}</span></button>`
  }).join('\n')
  const google = oauth?.google ? providerForm('google', GOOGLE_MARK, 'Google', safeNext) : ''
  const body = `<div class="setup">
<p class="setup-eyebrow">${t.html('onboard.eyebrow')}</p>
<div class="setup-columns">
<nav class="setup-rail" aria-label="${t.html('onboard.rail')}">
<div class="setup-rail-head"><span class="setup-rail-title">${t.html('onboard.rail')}</span><span class="setup-rail-count">0/${SETUP_STEPS.length}</span></div>
${rail}
</nav>
<section class="setup-pane">
<div class="setup-title-row"><h1 class="setup-title">${t.html('onboard.stepSignIn')}</h1><span class="setup-chip">${t.html('onboard.notDone')}</span></div>
<p class="setup-subtitle">${t.html('onboard.signInSubtitle')}</p>
<div class="setup-body">
${reasonKey === null ? '' : `${alertBlock('email-error', t(reasonKey))}\n`}<form id="email-form" method="get" action="/signin/email">
${nextField}<input id="login-email" type="email" name="email" value="${escapeHtml(email ?? '')}" placeholder="${t.html('login.emailPlaceholder')}" aria-label="${t.html('login.emailLabel')}" autocomplete="email" required>
<button type="submit">${t.html('login.continueWithEmail')}</button>
</form>
${google ? `<p class="separator-label">${t.html('login.orContinueWith')}</p><div class="providers">${google}</div>` : ''}
<p class="setup-note">${t.html('onboard.emailNote')}</p>
</div>
</section>
</div>
<p class="setup-foot">${t.html('onboard.locked')}</p>
</div>`
  return pageShell(t('login.title'), body, '', { lang: t.htmlLang, style: SETUP_STYLE })
}

/**
 * Tell `POST /login/visit` that this page was opened from a link with a source (usage: visits per
 * source, beside the first sign-ins). Once per tab, so a reload or the code step's re-render is one
 * visit; never waited on, and nothing on the page depends on it. `''` when the link carried no source.
 * The values were cleaned by `signInSource` (a-z, 0-9, `-`, `_`, `.`), and `<` is escaped regardless.
 */
function visitScript(source) {
  const params = sourceParams(source)
  if (!params) return ''
  const body = JSON.stringify(params).replace(/</g, '\\u003c')
  return `
(function(){
  try {
    if (sessionStorage.getItem('tracy-login-visit')) return;
    sessionStorage.setItem('tracy-login-visit', '1');
  } catch (e) {}
  try {
    fetch('/login/visit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(${body}), keepalive: true }).catch(function(){});
  } catch (e) {}
})();`
}

/** A source object as the `utm_*` shape `signInSource` reads, so the page cleans it once more. */
function sourceParams(source) {
  if (!source || typeof source !== 'object') return null
  return Object.fromEntries(SOURCE_KEYS.map((key) => [`utm_${key}`, source[key]]))
}

/** The source as hidden fields, one per key it has; `''` when there is none. */
function sourceInputs(source) {
  if (!source) return ''
  return SOURCE_KEYS.filter((key) => source[key])
    .map((key) => `<input type="hidden" name="utm_${key}" value="${escapeHtml(source[key])}">`)
    .join('\n')
}

/** `value` when it is an absolute http(s) address, else `''` — the only kind of address this page
 * will draw a link to that is not its own. */
function httpAddress(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return ''
  try {
    return new URL(value).href === '' ? '' : value
  } catch {
    return ''
  }
}

/** A provider button that also works with no script: a real GET form, so pressing it navigates
 * straight to `/signin/:provider?next=...` (`app.get('/signin/:provider', ...)` above) even if
 * `loginScript` never ran. */
function providerForm(key, mark, label, safeNext, sourceFields = '') {
  return `<form method="get" action="/signin/${key}">
<input type="hidden" name="next" value="${escapeHtml(safeNext)}">
${sourceFields}<button type="submit">${mark}${label}</button>
</form>`
}

/**
 * Progressive enhancement for `/login`'s two steps. Ported in spirit from the Worker's
 * `LOGIN_SCRIPT` (`pages.js:786`) — same spread/backspace/paste behaviour across the six boxes —
 * adapted to call this app's own `/login` and `/verify` doors over `fetch`/JSON instead of
 * letting the browser's own full-page form post carry the round trip. Both forms already work
 * with this entire script removed (review round 2, finding 2): they have real `method`, `action`
 * and `name` attributes, and the two doors below answer a real form post with a rendered page
 * (`isForm`, `loginPage`'s `step`/`error`), not JSON. Everything below is ONLY about avoiding the
 * reload for a visitor who has script.
 *
 * 🔒 THE SUCCESS REDIRECT IS `location.href=${JSON.stringify(...)}` INLINE, NOT A VARIABLE.
 * `oauth.test.mjs`'s open-redirect sweep greps the rendered page for the literal pattern
 * `location.href="..."` to check every vector this function is handed actually stays sanitized
 * (`safePath`, never a raw `next`) — a `var SAFE_NEXT = ...; location.href = SAFE_NEXT;` split
 * across two statements passes every runtime check but fails that grep silently, since nothing
 * about it is wrong at runtime. Caught 2026-09-10 only because a local Postgres happened to be
 * up for once; every prior run of this suite skipped the DB-gated test that would have failed.
 */
function loginScript(safeNext, t) {
  const sendFailed = JSON.stringify(t('login.sendFailed'))
  const codeInvalid = JSON.stringify(t('login.codeInvalid'))
  const invalidEmail = JSON.stringify(t('login.invalidEmail'))
  const rateLimited = JSON.stringify(t('login.rateLimited'))
  const notAdmitted = JSON.stringify(t('login.notAdmitted'))
  const accessUnavailable = JSON.stringify(t('login.accessUnavailable'))
  const suggestEmail = JSON.stringify(t('login.suggestEmail'))
  // S40: the sentence of the `503 NO_SHARD_ACCEPTING` page, for the verify door this script calls.
  const betaFull = JSON.stringify(`${t('shards.betaFullHeading')}. ${t('shards.betaFullBody')}`)
  return `
(function(){
  var emailStep = document.getElementById('email-step');
  var codeStep = document.getElementById('code-step');
  var emailForm = document.getElementById('email-form');
  var codeForm = document.getElementById('code-form');
  var emailInput = document.getElementById('login-email');
  var emailError = document.getElementById('email-error');
  var emailErrorText = document.getElementById('email-error-text');
  var codeError = document.getElementById('code-error');
  var codeErrorText = document.getElementById('code-error-text');
  var codeStepEmail = document.getElementById('code-step-email');
  var codeFormEmail = codeForm.querySelector('input[name=email]');
  var slots = Array.prototype.slice.call(document.querySelectorAll('.otp-slot'));
  var waitlistNote = document.getElementById('waitlist-note');
  // A template card this deployment does not serve hides the pictures; the words stand alone.
  Array.prototype.forEach.call(document.querySelectorAll('.signin-stage img'), function (img) {
    function drop() { img.closest('.signin-stage').hidden = true; }
    if (img.complete && !img.naturalWidth) drop();
    else img.addEventListener('error', drop);
  });
  // A mistyped domain of a big mailbox ("gmail.con", "hotmial.com") would send the code nowhere: offer
  // the likely address under the field, never change it unasked. A provider's own country domains
  // ("hotmail.fr", "gmx.at") are left alone: only a typo of the ".com" is read as one.
  var suggestBox = document.getElementById('email-suggest');
  var suggestUse = document.getElementById('email-suggest-use');
  var MAILBOXES = ['gmail', 'yahoo', 'hotmail', 'outlook', 'icloud', 'live', 'aol', 'msn'];
  var COM_TYPOS = ['con', 'cmo', 'cpm', 'comm', 'coom', 'om', 'cm', 'vom', 'xom', 'cim'];
  // Edits between two names, a swap of two neighbours counting as one ("hotmial").
  function editDistance(a, b) {
    var d = [];
    for (var i = 0; i <= a.length; i++) {
      d[i] = [i];
      for (var j = 1; j <= b.length; j++) {
        if (i === 0) {
          d[i][j] = j;
          continue;
        }
        var cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[a.length][b.length];
  }
  function likelyAddress(value) {
    var at = value.lastIndexOf('@');
    if (at < 1) return null;
    var domain = value.slice(at + 1).toLowerCase();
    var dot = domain.indexOf('.');
    if (dot < 1) return null;
    var name = domain.slice(0, dot);
    var tld = domain.slice(dot + 1);
    var comLike = tld === 'com' || COM_TYPOS.indexOf(tld) >= 0 || (name === 'gmail' && tld === 'co');
    if (!comLike) return null;
    for (var m = 0; m < MAILBOXES.length; m++) {
      var box = MAILBOXES[m];
      var close = name === box || (name.length >= 4 && editDistance(name, box) === 1);
      if (close && (name !== box || tld !== 'com')) return value.slice(0, at + 1) + box + '.com';
    }
    return null;
  }
  function offerAddress() {
    if (!suggestBox) return;
    var likely = likelyAddress(emailInput.value.trim());
    if (!likely) {
      suggestBox.hidden = true;
      return;
    }
    var parts = ${suggestEmail}.split('{email}');
    var strong = document.createElement('strong');
    strong.textContent = likely;
    suggestUse.textContent = '';
    suggestUse.append(parts[0], strong, parts.slice(1).join(''));
    suggestUse.dataset.address = likely;
    suggestBox.hidden = false;
  }
  if (suggestBox) {
    emailInput.addEventListener('blur', offerAddress);
    emailInput.addEventListener('input', function () { if (!suggestBox.hidden) offerAddress(); });
    suggestUse.addEventListener('click', function () {
      emailInput.value = suggestUse.dataset.address;
      suggestBox.hidden = true;
      emailInput.focus();
    });
  }

  // What a refusal said, or null: a body that is not JSON (a gateway's page) is no answer at all.
  function refusalOf(response){
    return response.json().then(function (body) {
      return body && typeof body === 'object' ? body : null;
    }, function () { return null; });
  }

  function showError(box, text, message){
    text.textContent = message;
    box.hidden = false;
  }
  function hideError(box, text){
    box.hidden = true;
    text.textContent = '';
  }

  function requestCode(event) {
    event.preventDefault();
    hideError(emailError, emailErrorText);
    var resending = event.currentTarget.id === 'resend-form';
    var email = resending ? codeFormEmail.value : emailInput.value.trim();
    var button = event.currentTarget.querySelector('button[type=submit]');
    // The form's hidden utm_* fields ride along, so a sign-in asked for over fetch keeps its source.
    var sent = { email: email };
    Array.prototype.forEach.call(event.currentTarget.querySelectorAll('input[type=hidden][name^="utm_"]'), function (input) {
      sent[input.name] = input.value;
    });
    button.disabled = true;
    fetch(event.currentTarget.getAttribute('action'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sent)
    }).then(async function (response) {
      button.disabled = false;
      if (!response.ok) {
        // Each refusal has its own sentence (#796): the server's address check is stricter than
        // the browser's own type=email, so INVALID_EMAIL does reach here. It is read only on the
        // 400 the door sends it with: the body of a failed answer (a 5xx) names nothing.
        var refusal = await refusalOf(response);
        var badAddress = response.status === 400 && refusal && refusal.code === 'INVALID_EMAIL';
        showError(resending ? codeError : emailError, resending ? codeErrorText : emailErrorText, response.status === 429 ? ${rateLimited} : badAddress ? ${invalidEmail} : ${sendFailed});
        return;
      }
      var payload = await response.json();
      var localCode = document.getElementById('local-code');
      if (localCode) {
        localCode.textContent = payload.localCode || '';
        document.getElementById('local-code-note').hidden = !payload.localCode;
      }
      slots.forEach(function (s) { s.value = ''; });
      hideError(codeError, codeErrorText);
      document.querySelector('#resend-form input[name=email]').value = email;
      codeStepEmail.textContent = email;
      codeFormEmail.value = email;
      emailStep.hidden = true;
      codeStep.hidden = false;
      slots[0].focus();
      fillLocalCode(payload.localCode);
    }).catch(function () {
      button.disabled = false;
      showError(resending ? codeError : emailError, resending ? codeErrorText : emailErrorText, ${sendFailed});
    });
  }
  emailForm.addEventListener('submit', requestCode);
  document.getElementById('resend-form').addEventListener('submit', requestCode);

  function submitCode(){
    var code = slots.map(function (s) { return s.value; }).join('');
    if (code.length !== slots.length) return;
    hideError(codeError, codeErrorText);
    if (waitlistNote) waitlistNote.hidden = true;
    var button = codeForm.querySelector('button[type=submit]');
    button.disabled = true;
    fetch(codeForm.getAttribute('action'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: codeFormEmail.value, code: code })
    }).then(async function (response) {
      if (!response.ok) {
        // A correct code refused by admission is not a wrong code (#796). Only the two reasons
        // the server names are read, and only on the 401 it sends them with; the whitelist link
        // is the page's own, shown or hidden.
        var refusal = await refusalOf(response);
        if (response.status === 503 && refusal && refusal.code === 'NO_SHARD_ACCEPTING') {
          button.disabled = false;
          showError(codeError, codeErrorText, ${betaFull});
          return;
        }
        var reason = response.status === 401 && refusal ? refusal.reason : null;
        button.disabled = false;
        showError(codeError, codeErrorText, reason === 'NOT_ADMITTED' ? ${notAdmitted}
          : reason === 'ACCESS_UNAVAILABLE' ? ${accessUnavailable}
          : ${codeInvalid});
        if (waitlistNote) waitlistNote.hidden = reason !== 'NOT_ADMITTED';
        slots.forEach(function (s) { s.value = ''; });
        slots[0].focus();
        return;
      }
      location.href=${JSON.stringify(safeNext)};
    }).catch(function () {
      button.disabled = false;
      showError(codeError, codeErrorText, ${codeInvalid});
    });
  }

  codeForm.addEventListener('submit', function (event) {
    event.preventDefault();
    submitCode();
  });

  // Local stand only (LOCAL_LOGIN_PREVIEW): the code is already on the page, so fill it and sign in.
  function fillLocalCode(code){
    // spread() sends the code once every box is filled, as a pasted code is.
    if (/^[0-9]{6}$/.test(code || '')) spread(0, code.split(''));
  }
  var shownLocalCode = document.getElementById('local-code');
  if (shownLocalCode && !codeStep.hidden) fillLocalCode(shownLocalCode.textContent.trim());

  function spread(from, digits){
    for (var i = 0; i < digits.length && from + i < slots.length; i++) {
      slots[from + i].value = digits[i];
    }
    var last = Math.min(from + digits.length, slots.length) - 1;
    if (last >= 0) slots[Math.min(last + 1, slots.length - 1)].focus();
    if (slots.every(function (s) { return s.value; })) submitCode();
  }

  slots.forEach(function (slot, index) {
    slot.addEventListener('input', function () {
      var digits = slot.value.replace(/[^0-9]/g, '');
      slot.value = '';
      if (!digits) return;
      spread(index, digits);
    });
    slot.addEventListener('keydown', function (event) {
      if (event.key === 'Backspace' && !slot.value && index > 0) {
        event.preventDefault();
        slots[index - 1].value = '';
        slots[index - 1].focus();
      }
      if (event.key === 'ArrowLeft' && index > 0) slots[index - 1].focus();
      if (event.key === 'ArrowRight' && index < slots.length - 1) slots[index + 1].focus();
    });
    slot.addEventListener('paste', function (event) {
      var text = (event.clipboardData || window.clipboardData).getData('text') || '';
      var digits = text.replace(/[^0-9]/g, '').slice(0, slots.length - index);
      if (!digits) return;
      event.preventDefault();
      spread(index, digits);
    });
  });
})();
`
}

/**
 * The question a person answers before a lane's sign-in round is approved (#661) — `GET /signin`
 * renders it, and only its button (`POST /signin/approve`) approves. Before 30/09/2026 opening the
 * link WAS the approval, so any page that could make a signed-in browser load it signed its owner
 * into a stranger's lane.
 *
 * 🔒 NO SCRIPT, NO AUTO-SUBMIT. A page that pressed its own button would put the bug back. The
 * form is plain HTML and works with script off.
 *
 * `device` is what the lane said about itself when it opened the round (`POST /auth/link/browser`),
 * shown as that — its own description, not a name Tracy checked. Lanes that send none (every one in
 * the field on 30/09/2026) get a sentence saying so, never a guess from anything else on the request.
 * @param {{email: string, nonce: string, device?: string}} params
 * @returns {string} a complete HTML document.
 */
export function deviceConfirmPage({ email, nonce, device = '', lang = 'en' }) {
  const t = translator(lang)
  const who = device
    ? `<p class="card-description">${t.html('device.requesting', { device: `<strong>${escapeHtml(device)}</strong>` })}</p>`
    : `<p class="card-description">${t.html('device.unknown')}</p>`
  const body = textCard(
    `<h1 class="card-title">${t.html('device.heading')}</h1>
<p class="card-description">${t.html('device.asking', { email: emailOff(`<strong>${escapeHtml(email)}</strong>`) })}</p>`,
    `${who}
<p class="card-description">${t.html('device.warning')}</p>
<form method="post" action="/signin/approve">
<input type="hidden" name="n" value="${escapeHtml(nonce)}">
<button type="submit">${t.html('device.approve')}</button>
</form>`
  )
  return pageShell(t('device.confirmTitle'), body, '', { lang: t.htmlLang })
}

/**
 * A page that is one card of text: a heading with the sentence under it, then whatever follows.
 *
 * 🔒 EVERY WORD GOES INSIDE A CARD PART. `.card` in `lib/page-shell.js` pads top and bottom only;
 * the side padding lives on `.card-header`, `.card-content` and `.card-footer`. Until 07/10/2026
 * the pages that use this put `<h1>` and `<p>` straight into the card, so their text began
 * on its border (#993), and they wrapped it in a `<main>` of their own inside the shell's `<main>`.
 * @param {string} header rendered markup of the heading and the sentence under it.
 * @param {string} [content] rendered markup of what follows; no part is drawn when empty.
 * @returns {string} the card, for `pageShell`'s body.
 */
function textCard(header, content = '') {
  return `<div class="card auth-card">
<div class="card-header">
${header}
</div>${content ? `\n<div class="card-content">\n${content}\n</div>` : ''}
</div>`
}

/**
 * The question for a DESKTOP round (the Mac app's sign-in, `tasks/todo-desktop-signin-package.md`):
 * the same rules as `deviceConfirmPage` — no script, nothing pressed by itself — plus the two things
 * a desktop round adds. The match code (`lib/match-code.js`, the one the app's own window shows)
 * lets the person see this page belongs to the round THEIR app opened; and a Deny button, because
 * the app is waiting on an answer and should hear "no" rather than wait out fifteen minutes.
 * `device` is the app's own description of the machine, shown as that, escaped.
 * @param {{email: string, nonce: string, device?: string, code: string, lang?: string}} params
 * @returns {string} a complete HTML document.
 */
export function desktopConfirmPage({ email, nonce, device = '', code, lang = 'en' }) {
  const t = translator(lang)
  const who = deviceLine(t, device)
  // `email` rides along so `POST /signin/approve` can refuse when the browser's session changed to
  // somebody else between this page and the press (council (b)): the page approves the account it
  // NAMED, or nothing.
  const nonceField = `<input type="hidden" name="n" value="${escapeHtml(nonce)}">
<input type="hidden" name="email" value="${escapeHtml(email)}">`
  const body = textCard(
    `<h1 class="card-title">${t.html('device.heading')}</h1>
<p class="card-description">${t.html('device.desktopAsking', { email: emailOff(`<strong>${escapeHtml(email)}</strong>`) })}</p>`,
    `${who}
<p class="card-description">${t.html('device.matchCode')}</p>
<p><strong>${escapeHtml(code)}</strong></p>
<p class="card-description">${t.html('device.desktopWarning')}</p>
<form method="post" action="/signin/approve">
${nonceField}
<button type="submit">${t.html('device.approve')}</button>
</form>
<form method="post" action="/signin/deny">
${nonceField}
<button type="submit" class="ghost">${t.html('device.deny')}</button>
</form>`
  )
  return pageShell(t('device.confirmTitle'), body, '', { lang: t.htmlLang })
}

/** After Deny: nothing was signed in, and the app has been told. */
export function deviceDeniedPage({ lang = 'en' } = {}) {
  const t = translator(lang)
  const body = textCard(`<h1 class="card-title">${t.html('device.deniedHeading')}</h1>
<p class="card-description">${t.html('device.deniedBody')}</p>`)
  return pageShell(t('device.deniedTitle'), body, '', { lang: t.htmlLang })
}

/**
 * What a person sees after they approve a lane's sign-in round — the last page of a flow that
 * started on a machine with no browser session of its own (`lanes/route.js`'s header has the whole
 * round). There is nothing to press: the lane is already polling and will let them in where they
 * started. Saying which site, and which address, is the point — this is the screen where somebody
 * would notice that a round they did not start is asking for approval. An `error` arrives already
 * translated by the caller.
 */
export function deviceApprovedPage({ email = '', error = '', lang = 'en', desktop = false }) {
  const t = translator(lang)
  const body = error
    ? textCard(
        `<h1 class="card-title">${t.html('device.linkInvalidHeading')}</h1>
<p class="card-description">${escapeHtml(error)}</p>`,
        `<p class="card-description">${t.html('device.startAgain')}</p>`
      )
    : textCard(`<h1 class="card-title">${t.html('device.signedInHeading')}</h1>
<p class="card-description">${t.html(desktop ? 'device.desktopApprovedAs' : 'device.approvedAs', { email: emailOff(escapeHtml(email)) })}</p>`)
  return pageShell(t('device.approvedTitle'), body, '', { lang: t.htmlLang })
}

const PROVIDER_LABELS = Object.freeze({ google: 'Google', github: 'GitHub', joomlart: 'JoomlArt' })

/** Which sentence each failed sign-in shows (`../lib/i18n/strings.js`). */
const SIGN_IN_FAILURES = Object.freeze({
  state: 'signin.stateBody',
  cancelled: 'signin.cancelledBody',
  exchange: 'signin.exchangeBody',
  email: 'signin.emailBody',
  // aMember has no "verify it there" page to point at by name; the person confirms their address on
  // joomlart.com, so the sentence says where (plan tasks/todo-tai-joomlart-qua-tracy.md, B3).
  joomlartEmail: 'signin.joomlartEmailBody',
  link: 'signin.linkBody',
  provider: 'signin.providerBody'
})

/**
 * A sign-in that did not finish, as a page (#796). Until 03/10/2026 a browser sent back from
 * Google or GitHub with a stale state, a refused code or an unverified address was answered
 * `{"code":"OAUTH_STATE_INVALID"}` as `application/json`, and a malformed `/signin` link or a
 * provider this deployment does not offer got the framework's bare `404 Not Found`: nothing to
 * read, nothing to press.
 *
 * `reason` picks the sentence; nothing the provider said is ever shown. `cancelled` is the person
 * refusing at the provider (#993): until 07/10/2026 it was told as `state`, "took too long, or
 * started in another browser", which is false for someone who pressed Cancel. The one link leads
 * back to `/login`, carrying `next` (run through `safePath`, like every other `next` here) so a
 * retry ends where the person was going. `provider` is shown by its brand name, never as it
 * arrived.
 * @param {{reason?: 'state'|'cancelled'|'exchange'|'email'|'joomlartEmail'|'link'|'provider', provider?: string, next?: string, origin: string, lang?: string}} params
 * @returns {string} a complete HTML document.
 */
export function signInFailedPage({ reason = 'state', provider = '', next, origin, lang = 'en' }) {
  const t = translator(lang)
  const key = Object.hasOwn(SIGN_IN_FAILURES, reason) ? SIGN_IN_FAILURES[reason] : SIGN_IN_FAILURES.state
  const label = Object.hasOwn(PROVIDER_LABELS, provider) ? PROVIDER_LABELS[provider] : ''
  const safeNext = safePath(next, origin)
  // `safePath` answers an address on this origin; its answer for "nowhere in particular" is the
  // root, and a way back to the root needs no `next` at all.
  const href =
    safeNext === safePath(undefined, origin) ? '/login' : `/login?next=${encodeURIComponent(safeNext)}`
  const body = textCard(
    `<h1 class="card-title">${t.html('signin.failedHeading')}</h1>
<p class="card-description">${t.html(key, { provider: escapeHtml(label) })}</p>`,
    `<p class="note"><a class="back" href="${escapeHtml(href)}">${t.html('signin.backToSignIn')} &rarr;</a></p>`
  )
  return pageShell(t('signin.failedTitle'), body, '', { lang: t.htmlLang })
}

/** Which device asked, in its own words (escaped), or the sentence saying it did not say. */
function deviceLine(t, device) {
  return device
    ? `<p class="card-description">${t.html('device.requesting', { device: `<strong>${escapeHtml(device)}</strong>` })}</p>`
    : `<p class="card-description">${t.html('device.unknown')}</p>`
}

/** The match code block every desktop round page shows: the sentence, then the code itself. */
function matchBlock(t, code) {
  return `<p class="card-description">${t.html('device.matchCode')}</p>
<p><strong>${escapeHtml(code)}</strong></p>`
}

/** The two hidden fields every pre-sign-in form of a desktop round posts: the round and its token. */
function roundFields(nonce, token) {
  return `<input type="hidden" name="n" value="${escapeHtml(nonce)}">
<input type="hidden" name="t" value="${escapeHtml(token)}">`
}

/**
 * The desktop round's own sign-in, for the address the person typed in the app (council (a);
 * `tasks/todo-desktop-onboard-v2.md`, contract item 3). Two steps on one page:
 *
 *   - `send`: names the address, the purpose and the match code, and offers to mail a code. The GET
 *     that renders it sends nothing; only the button (`POST /signin/code`) does.
 *   - `code`: the consent and the code together. One press of "Verify and sign in to the app"
 *     (`POST /signin/verify`) proves the inbox AND approves this round, so the page says exactly
 *     what the press does: which address, what for, and the code the app shows.
 *
 * 🔒 NO SCRIPT, SO NOTHING SUBMITS BY ITSELF. The plain login page posts on the sixth digit; here
 * the person must press the button after reading the page (council (a) point 1). One text field,
 * not six boxes: six boxes need a script to move between them.
 *
 * `token` is the round's pre-sign-in form token (`./signin-guard.js`). `otherWay` adds a link to
 * the ordinary sign-in page (Google, another address) that comes back to this round afterwards.
 * `error` arrives already translated.
 * @param {{email: string, nonce: string, device?: string, code: string, token: string, step?: 'send'|'code', error?: string, lang?: string, otherWay?: string, localCode?: string}} params
 * @returns {string} a complete HTML document.
 */
export function desktopCodePage({
  email,
  nonce,
  device = '',
  code,
  token,
  step = 'send',
  error = '',
  lang = 'en',
  otherWay = '',
  localCode = ''
}) {
  const t = translator(lang)
  const address = emailOff(`<strong>${escapeHtml(email)}</strong>`)
  const fields = roundFields(nonce, token)
  const sendStep = `<p class="card-description">${t.html('device.sendCodeHint')}</p>
${alertBlock('code-error', error)}
<form method="post" action="/signin/code">
${fields}
<button type="submit">${t.html('device.sendCode')}</button>
</form>`
  const codeStep = `<p class="card-description">${t.html('login.codeFor', { email: address })}</p>
${localCode ? `<p class="note">${t.html('login.localCode', { ...LIFETIME, code: `<strong>${escapeHtml(localCode)}</strong>` })}</p>` : ''}
<form method="post" action="/signin/verify">
${fields}
<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autocomplete="one-time-code" aria-label="${t.html('device.codeLabel')}" placeholder="${t.html('device.codeLabel')}">
${alertBlock('code-error', error)}
<button type="submit">${t.html('device.verifyAndSignIn')}</button>
</form>
<form class="resend" method="post" action="/signin/code">
${fields}
<button type="submit">${t.html('login.resend')}</button>
</form>
<p class="note">${t.html('login.codeLifetime', LIFETIME)}</p>`
  const body = textCard(
    `<h1 class="card-title">${t.html('device.appHeading')}</h1>
<p class="card-description">${t.html('device.desktopPurpose', { email: address })}</p>`,
    `${deviceLine(t, device)}
${matchBlock(t, code)}
<p class="card-description">${t.html('device.warning')}</p>
${step === 'code' ? codeStep : sendStep}
${otherWay ? `<p class="note"><a href="${escapeHtml(otherWay)}">${t.html('device.otherWay')}</a></p>` : ''}`
  )
  return pageShell(t('device.appTitle'), body, '', { lang: t.htmlLang })
}

/**
 * The browser is signed in as one address and the app asked for another (council (b)). Neither
 * account is used silently: "Use <typed>" mails a code to the typed address and leaves this browser
 * signed in as it is until that code is verified; "Use <current>" leads to the ordinary approve
 * page for the account this browser holds — a deliberate choice, made on a page that names both.
 *
 * The sentence about Google is there because signing out of Tracy does not sign out of Google:
 * somebody who signs out and presses Google again may well land on the same account.
 * @param {{current: string, typed: string, nonce: string, device?: string, code: string, token: string, lang?: string}} params
 * @returns {string} a complete HTML document.
 */
export function desktopMismatchPage({ current, typed, nonce, device = '', code, token, lang = 'en' }) {
  const t = translator(lang)
  const currentHtml = emailOff(`<strong>${escapeHtml(current)}</strong>`)
  const typedHtml = emailOff(`<strong>${escapeHtml(typed)}</strong>`)
  const body = textCard(
    `<h1 class="card-title">${t.html('device.mismatchHeading')}</h1>
<p class="card-description">${t.html('device.mismatchBody', { current: currentHtml, typed: typedHtml })}</p>`,
    `${deviceLine(t, device)}
${matchBlock(t, code)}
<form method="post" action="/signin/code">
${roundFields(nonce, token)}
<button type="submit">${t.html('device.useAddress', { email: escapeHtml(typed) })}</button>
</form>
<p class="card-description">${t.html('device.useTypedHint', { typed: typedHtml, current: currentHtml })}</p>
<form method="get" action="/signin">
<input type="hidden" name="n" value="${escapeHtml(nonce)}">
<input type="hidden" name="use" value="session">
<button type="submit" class="outline">${t.html('device.useAddress', { email: escapeHtml(current) })}</button>
</form>
<p class="note">${t.html('device.googleNote', { current: currentHtml })}</p>`
  )
  return pageShell(t('device.appTitle'), body, '', { lang: t.htmlLang })
}
