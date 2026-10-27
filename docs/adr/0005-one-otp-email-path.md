# 0005 — One email path: magic link retired, the six-digit code remains

- Status: accepted (binding)
- Date: 2026-09-01
- Decided by: Lee
- Related: [`0003`](0003-one-sign-in-door.md) (one sign-in door — that door stays, only how it asks
  changes) · [`0004`](0004-dsh-is-the-shell.md) (dsh is the shell) · a DIFFERENT series, `tracy-infra`'s:
  `0039` (sessions do not travel through the address bar), `0040` (Google sign-in)
- Enforced in: `workers/seat-registry/src/{index,seats}.js` · `workers/cowork/src/index.js` ·
  `workers/fleet-bar/src/{pages,registry}.js` · `workers/auth-email/src/index.js` ·
  `workers/mail/` · `vendor/tracy/dsh-passwords/src/{gateway,i18n}.ts`
- Implementation plan: [`tasks/todo-mot-duong-otp.md`](../../tasks/todo-mot-duong-otp.md)

## Context

Up to 01/09 Tracy had **two email sign-in paths**, and the user received **one email doing both
jobs**: a "Sign in to Tracy" button plus a six-digit code, with the sentence *"Button and code do the
same thing. Use either."*

They were never two mechanisms. Both call **the same endpoint** `POST /auth/v1/otp` of GoTrue,
differing in exactly two parameters:

| | `sendLoginOtp` | `sendMagicLink` |
|---|---|---|
| `create_user` | `false` | `true` |
| `redirect_to` | none | `cowork.tracy.ai/verify?n=<nonce>` |

Supabase always generates **both** `token` (six digits) **and** `token_hash` in the same payload. The
`redirect_to` is the **only switch** that makes the `auth-email` hook draw an extra button. Remove it
and the two functions differ by a single word.

Magic link was born for three reasons, and by 01/09 **two were dead**:

1. **`create_user: false` blocks new people.** The OTP path goes through `/sites/:key/otp`, and that
   door calls `grantFor` — which demands an existing seat on a specific site. Someone who just signed
   up, with no seat yet, cannot get through. This reason is **still alive**, but it is only a
   parameter.
2. **`token_hash` can be verified without knowing the email**, handy for a `/verify` page that works
   for whoever clicks. No longer needed when step two happens on the very page that requested the
   code.
3. **Cross-device for Tracy Desk**: click the button on a phone while the app waits on the desktop.
   The nonce is the thread joining the two devices. This is what gave birth to the whole set of
   `nonce` + `clientSecret` + `/verify` + `signInConfirmPage`. **The `tracy-desk` repo has been
   dropped** (Lee, 01/09).

And the cost of keeping it is not hypothetical: **the email door on the web has never once
succeeded in signing anyone in.** `POST /login` stores `nonce.clientSecret` in the `tracy_login`
cookie, and **no route ever reads that cookie back** — grepping the whole repo finds exactly two
places, one that sets it and one test line that checks the header. Clicking the button in the email
makes `/verify` flip the nonce to `approved` for Desk and return the *"Go back to Tracy Desk"* page;
the browser sitting on `/login` never receives `tracy_sess`, and `next` is lost too.

## Decision

**ONE EMAIL PATH: enter email → receive a six-digit code → type the code right on the page you are
on.**

- The seat ledger opens a **new pair of doors** `POST /auth/otp/start` and `POST /auth/otp/verify`.
  They **do not ask about seats** — identity and permission are two questions, and this pair only
  answers the first; the caller still asks the seat ledger afterwards, as today. `create_user: true`:
  **signing in and signing up are one pass**.
- **No `redirect_to` at any door.** The email falls back to the code-only version that is already
  rendered.
- **The address in step two does not travel through the form.** `cowork` keeps it in an HMAC cookie
  (`tracy_otp`), the lane keeps it in process memory behind a random `ticket`. A hidden `email` field
  would let someone request a code for their own address and then submit that code with someone
  else's address, and **the seat ledger would not catch it** — it only sees an `(email, code)` pair
  sent by a party holding the secret, and it trusts that party.
- **Google/GitHub do not change.** The nonce thread lives on intact for OAuth, because there the
  problem behind reason (3) is still real: a lane on `127.0.0.1` has no public address to receive a
  redirect, so it has to wait-and-poll.

### What is retired

`/verify` · `signInConfirmPage` · the `tracy_login` cookie · `/auth/link/start` · `sendMagicLink` ·
`verifyMagicToken` · `signInUrlFor` · `startEmailLink` · `approveAuthLink` · the `tokenHash` branch of
`handleLinkApprove` · the `EMAIL_MISMATCH` check · the two `*Link` variants × 12 languages in
`OTP_HTML`.

`EMAIL_MISMATCH` goes because **there is no longer any path that produces it**: it compares the
address pre-recorded in the ledger with the address GoTrue just reported, and only a pass opened BY
EMAIL pre-records an address. The only door still opening the nonce thread is `/auth/link/browser`,
and it always records `email: ''`. A branch with no path to it looks exactly like a branch that is
guarding.

## Measured, not guessed

**The trap that looked like a trap.** For an address that does not exist yet, GoTrue runs the
**signup** flow (`confirmation_sent_at` is set, `recovery_sent_at` absent) — so the reasonable
question is whether that code must be verified with `type: 'signup'`, while `verifyLoginOtp`
hardcodes `type: 'email'` and has never had to meet a new person. Measured on the Tracy-Seats project
itself on 01/09: a code produced by the signup flow, verified with **`type: 'email'`**, returns
**200 with an `access_token`**. GoTrue treats `email` as the general OTP type.

If that changes, the symptom will be: **existing people can sign in, new people cannot** — so it is
recorded here and in the docblock of `verifyLoginOtp`.

## Consequences

- **The email states the wrong context, and is not fully fixed yet.** `copy.finish` = *"Enter this
  code in Tracy Desk to finish signing in."* Desk has been dropped. The 12-language string table
  (`otpCopy.generated.mjs`) is generated from `tracy-desk` through `scripts/export-mail-i18n.ts`, so
  it is now **orphaned**. This is known debt, recorded in the plan.
- **`/sites/:key/otp` stays.** Customer copies still need a door that demands an existing seat;
  merging it would change the rule of "who may request a code on a customer site", a separate
  decision.
- **The lane has two paths of different shapes.** Email goes straight through (no second tab, no
  polling), OAuth still waits-and-polls. Before this they shared one mechanism. This is a conscious
  trade-off: that shared mechanism is what forced the email path to detour through a tab it did not
  need.
- **The OAuth waiting screen stops swallowing errors.** It used to exit only on
  `done`/`expired`/`error`, while every other error fell into an empty `catch {}` and was retried
  after two seconds, forever, under a "Waiting…" line. Now three consecutive failures are reported,
  and there is a 15-minute ceiling.
