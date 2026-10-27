---
description: Mail sent by customer sites (PHP mail()/wp_mail()) goes through tracy-web's POST /_site-mail door — the token, the four refusal layers, the five per-site modes, limits counted before calling Resend, and the APIs for /ops and the site admin.
sources:
  - apps/tracy-web/src/mail/site-mail/route.js
  - apps/tracy-web/src/mail/site-mail/relay.js
  - apps/tracy-web/src/mail/site-mail/message.js
  - apps/tracy-web/src/mail/site-mail/smtp.js
  - apps/tracy-web/src/mail/site-mail/policy.js
  - apps/tracy-web/src/mail/site-mail/store.js
  - apps/tracy-web/src/mail/site-mail/token.js
  - apps/tracy-web/src/mail/site-mail/resend-domains.js
  - apps/tracy-web/src/mail/site-mail/domains.js
  - apps/tracy-web/src/db/migrations/028-site-mail.sql
  - apps/tracy-web/src/db/migrations/029-site-mail-domain-lifecycle.sql
  - apps/tracy-web/src/cron.js
  - apps/tracy-web/src/config.js
  - deploy/.env.example
---

# Customer-site mail — the `tracy-web` side

The plan and the contract between the three parts (fleet, tracy-web, interface):
[`tasks/todo-mail-site-khach.md`](../../tasks/todo-mail-site-khach.md). This document describes how the
`tracy-web` part **is running**, so the next person does not have to reread the code to learn why a message
was refused.

## The path

```
PHP mail() / wp_mail()
  → /usr/local/bin/tracy-sendmail (a shim in the web image, holding no key)
  → POST http://172.30.0.10:8080/_site-mail   (the `tracy` network, Host is the IP address)
       x-tracy-site: <label>   x-tracy-token: <token>   body: the raw RFC 822 message
  → tracy-web: token → site → policy → rewrite headers → count limits → SMTP
  → smtp.resend.com:465 (user `resend`, password = key)  or the customer's SMTP (own-smtp)
```

## The order of refusals (and why it is this order)

| Step | Returns | Logged? |
|---|---|---|
| `SITE_MAIL=off` | `503 SITE_MAIL_DISABLED` | no |
| Host is a public Tracy hostname, or there are Cloudflare headers (`cf-ray`/`cf-connecting-ip`) | an empty `404` | no |
| Wrong token / no such label | `401 SITE_MAIL_TOKEN` — **before reading the body**, so strangers cannot push 10 MB into memory | no (the site is unknown) |
| Site not yet `publish='published'` | `403 SITE_MAIL_DRAFT` | `refused` |
| Mode `off` / `own-cms` | `403 SITE_MAIL_OFF` | `refused` |
| Over 10 MB | `413 SITE_MAIL_TOO_LARGE` | `refused` |
| No blank line separating header/body, a broken header line, no recipient, a broken address | `400 SITE_MAIL_MALFORMED` | `refused` |
| Over the site's hourly / daily limit / the global daily ceiling | `429 SITE_MAIL_LIMIT` + `scope` | `refused` |
| SMTP refuses / does not answer | `502 SITE_MAIL_UPSTREAM` | `failed` + the error |
| Sent | `200 {ok, id}` (`id` = the log row id) | `sent` (or `logged` in log mode) |

A request whose Host is **a site's** hostname never reaches this door: `app.js` moves it to the
site's proxy before any other route. The token is still the real gate; checking Host only keeps the door off
the public surface.

## The token

`hex(HMAC-SHA256(HOST_SECRET of the host holding the site, "site-mail:v1:" + label))` — the fleet computes it with
`openssl dgst -hmac`, `tracy-web` recomputes it from `config.hosts.get(site.host).hostSecret` and compares with
`timingSafeEqual`. Stored nowhere. Changing `HOST_<name>_SECRET` revokes the tokens of every site on
that host at once. The test `site-mail-token.test.mjs` runs exactly the contract's `openssl` line and compares it with
the Node code.

## Header rewriting (the body is kept byte for byte)

- `From` → `"<the original display name or the label>" <label@SITE_MAIL_DOMAIN>`; `Reply-To` = the original `From` if
  the site has not set `Reply-To`.
- `tracy-domain`: keeps the customer's `From` **only when** its domain matches the domain `verified` on
  Resend; verified but `From` on another domain → `noreply@<customer domain>`; not verified → the Tracy
  address as in `tracy` mode. *(The last two branches are the implementation's choice; the contract does not say.)*
- `own-smtp`: keeps the site's `From`.
- Every mode: drops `Bcc` (recipients still receive through the envelope), `Sender`, `Return-Path`; adds
  `Message-ID`, `Date` when missing.
- When sending DATA, bare LF line endings become CRLF and leading dots are doubled — that is
  SMTP transfer framing, it does not change the message content (PHP on Linux hands bare LF to `sendmail`).

## Five modes (`site_mail.mode`, no row = `tracy`)

| Mode | Sent through | Tracy limits |
|---|---|---|
| `tracy` | Tracy's Resend, `label@SITE_MAIL_DOMAIN` | yes |
| `tracy-domain` | Tracy's Resend, the customer's domain (Tracy creates the domain through the Resend API, the customer adds DNS) | yes |
| `own-smtp` | the customer's SMTP (host/port/user, the password sealed with `lib/secret-box.js`) | no |
| `own-cms` | the site sends by itself with its CMS configuration; the relay refuses | — |
| `off` | does not send | — |

🔒 **The customer's SMTP host is somewhere `tracy-web` will dial**, on the same network as postgres and every
site container. So: at save time only domain names with a dot or public IPs are accepted, ports 25/465/587/2525;
at send time the name is resolved again and refused if it yields a private address (10/8, 172.16/12, 192.168/16, 127/8,
169.254/16, 100.64/10, ULA, link-local), then exactly the checked address is dialled (SNI is still the host name).
465 = TLS from the start; other ports = STARTTLS required (if the server does not offer STARTTLS, no password
is sent).

## Customers' own domains on the shared Resend account

Tracy's Resend account is **shared** by every site; the Free plan holds 3 domains and two of them are
Tracy's own sending domains. Measured on the dev machine 24/09: before the fix, Save created the domain at once (to have DNS records to show) and
nothing deleted it — one person trying two domains filled it, and every later creation was refused by Resend ("You have reached the domain
limit of your plan") while the screen said "no response, try again". Now (`domains.js`, migration `029`):

| When | Tracy does |
|---|---|
| Switching to another domain | checks the plan first (counting the old domain's slot about to be freed), deletes the old domain, then creates/reuses the new one |
| Leaving `tracy-domain` (admin or ops), clicking Remove domain, ops clicking Release | deletes the domain on Resend, clears the domain columns, `tracy-domain` → `tracy` |
| The name already exists on the account | reuses that id, **does not** create another; `domain_owned` = false |
| Another site holds that name | `409 SITE_MAIL_DOMAIN_TAKEN` (plus a unique index blocking two concurrent saves) |
| The plan is full | `409 SITE_MAIL_DOMAIN_LIMIT` before creating/deleting anything (`SITE_MAIL_DOMAIN_LIMIT`, default 3) — and the same code if Resend refuses by itself |
| Resend returns 404 for the stored id | treated as gone: deleting = done; "Check again" = request that name again |
| Not verified after `SITE_MAIL_DOMAIN_PENDING_DAYS` (3) | an hourly cron asks Resend (kept if verified), then deletes it, marks `expired`, writes `audit` |

🔒 **Tracy only deletes what Tracy created.** `domain_owned` = true only when Tracy's POST /domains created that domain for that
site. Never deleted: a pre-existing domain (reused by name), `SITE_MAIL_DOMAIN`/`SITE_DOMAIN` and every name under
them, ids another row still points to. Rows from before `029` carry `domain_owned` = false — nothing proves
Tracy created them — so the clock does not touch them; ops removes them by hand on the Resend dashboard if needed.

The error code only says "no response" (`502 SITE_MAIL_UPSTREAM`) when Resend is really silent (over 15 s, connection lost, 5xx).
A key that cannot manage domains (a **Sending access** key returns 401 `restricted_api_key`) → `503
SITE_MAIL_DOMAIN_UNAVAILABLE`: this mode needs a **Full access** key. The /ops/mail screen shows slots used/the limit
(counted from Resend itself), when each pending domain will be removed, and the Release button.

## Limits

- Per site: the number of messages in **the last 60 minutes** (`SITE_MAIL_SITE_HOURLY`, default 10) and in
  **the UTC day** (`SITE_MAIL_SITE_DAILY`, 20); ops overrides per site (`null` = back to the default).
- A global UTC daily ceiling for all `tracy`/`tracy-domain` mode messages (`SITE_MAIL_GLOBAL_DAILY`, 50).
- Counting and reserving happen in **one transaction with an advisory lock**: a `sending` row is written before calling
  SMTP and counted as a sent message, so two concurrent sends cannot both read "9 of 10". A
  `sending` row living over 2 minutes (the process died midway) shows in the log as `failed` / "interrupted".
- Hitting a ceiling: one `warn` line per scope per day in `tracy-web`'s log (no ops notification email yet).

## Env

`SITE_MAIL` (`off` · `log` · `smtp`), `SITE_MAIL_DOMAIN` (required unless `off`),
`SITE_MAIL_KEY` (empty = the key of `MAIL=resend:`; `smtp` with no key at all → does not boot),
`SITE_MAIL_SMTP_HOST`/`_PORT`, `SITE_MAIL_GLOBAL_DAILY`, `SITE_MAIL_SITE_HOURLY`,
`SITE_MAIL_SITE_DAILY`, `SITE_MAIL_DOMAIN_LIMIT`, `SITE_MAIL_DOMAIN_PENDING_DAYS`. Each key is annotated in `deploy/.env.example`.

`SITE_MAIL=log`: every check exactly as in a real send, but instead of SMTP there is one log line (headers only,
no body — a body can be 10 MB of personal data) and the `site_mail_log` row carries `logged`.

## APIs for the interface

The JSON shapes are settled in the contract in `tasks/todo-mail-site-khach.md`. A summary of what the implementation
added or chose:

- Ops (`admit()` like every `/ops` door; writes need `owner`/`admin` and `origin` = `TRACY_ORIGIN`):
  `GET /api/ops/mail` always answers even when `SITE_MAIL=off` (`enabled:false`); the site list = published
  sites + sites with a `site_mail` row + sites with a log today. `GET /api/ops/mail/log` (recipients and subjects,
  no message bodies) is readable by **every** staff role, and `site_mail_log` rows are kept until
  someone deletes them: that was a decision in #804, not an oversight.
- Site admin (an accepted `owner`/`admin` seat): not signed in `401 NOT_SIGNED_IN`, no seat
  `403 SEAT_NOT_AUTHORIZED`, a seat but not an admin `403 NOT_SITE_ADMIN`, `SITE_MAIL=off`
  `503 SITE_MAIL_DISABLED` (after the seat check).
- Every bad body: `400 {code:'INVALID_REQUEST', reason}` — `reason` ∈ `NOT_JSON`, `INVALID_MODE`,
  `INVALID_LIMIT`, `NOTHING_TO_CHANGE`, `DOMAIN_INVALID`, `DOMAIN_NOT_ALLOWED` (Tracy's own
  domain), `DOMAIN_REQUIRED`, `SMTP_REQUIRED`, `SMTP_HOST_INVALID`, `SMTP_PORT_INVALID`,
  `SMTP_USER_INVALID`, `SMTP_PASSWORD_INVALID`, `SMTP_PASSWORD_REQUIRED`.
- The SMTP password is **never** returned, not even in sealed form — only `hasPassword`. Saving again without
  `password` keeps the old password.
- Changing `SESSION_SECRET` makes every sealed SMTP password unopenable: an `own-smtp` send returns 502 with the error
  "cannot be opened; set it again" in the log, until the admin enters it again.

## Still open

- Sites on a host other than `tracy-web`'s: the shim must reach `tracy-web` through that host's `tracy-host` — today
  every site is on prod1.
- Not yet measured on the dev machine: a go-live site sending real mail to a test mailbox, reading the DKIM/SPF headers.
