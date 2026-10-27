# Beta access and Operation signal

PR scope: the backend of specs 73 and 74, plus the landing integration of spec 76, landing in develop first. The landing's UI and WordPress plugin are owned by the landing team. The default URL is `https://tracy.ai/whitelist/`. This PR has no landing form or plugin.

## Feasibility and implementation decisions

- aMember has a check-access/by-email door, but it can answer HTTP 200 for a wrong key. The parser checks the JSON body, accepts a subscriptions object or an empty array, excludes exactly 18/19/35 and compares dates in UTC+7. No name or login is kept from aMember.
- The network path from the tracy-web container on DEV and PROD was measured: HTTP 200, API Error 10001 when no key is sent. No dedicated key is in the runtime yet, so neither a real membership result nor the key's permissions is proven. PROD has moved hosts; the address in the spec is stale.
- Only an account with `last_seen_at` is exempt. An account pre-created by a seat invitation that never signed in is not exempt once the invitation is revoked. Google/GitHub and the lane's OTP share the same decision.
- Login stores a PostgreSQL queue entry and then answers the browser. Each worker checks at most four emails concurrently, then sends mail, with retry after a restart. A successful decision is cached for 10 minutes; errors are not cached. Limit: 5 mails/email/hour; with the gate on, going over the limit still returns the same code-entry screen.
- Telegram uses a PostgreSQL outbox and a lease, never an HTTP call inside login or site creation. An analytics failure does not break the main transaction; analytics write queries are capped at 500 ms. Exactly-once HTTP delivery cannot be promised if the process dies after Telegram received the message but before the database confirmed it; events and the daily report are deduplicated in the database.
- The plan printed in a site signal is a snapshot taken when the site was accepted, not a subscription asked again. The two scripts (balance and server) keep their cadence, thresholds and content.
- Import has two stages: the plugin finishes exporting data, and the fleet finishes building the copy. The export is recorded as `site.result` with outcome `exported`; the finished copy records `done`. Daily Ready counts only `done`, so nothing is counted twice. The plugin keeps the terminal result in its own outbox, mode 0600, retrying when web fails or restarts. The file holds a cookie for resending and is deleted once web confirms.
- `from_comment` relies on Apply's existing comment parameter. With no marker it records null; it never guesses from chat content.

## Current flow: WordPress per spec 76

`BETA_WAITLIST_MODE=wordpress` is the default. Mail from the membership gate links to `BETA_WAITLIST_URL?email=<email>`; the email is only a prefill the visitor can edit, not proof of identity or sign-in rights. No signed token goes to this landing. A blocked OAuth sign-in is sent to the same form with the email prefilled. Visitor-facing copy says whitelist and promises no free access, opening date or entry.

The page calls POST `https://tracy.ai/wp-json/tracy/v1/whitelist`. Applications and UTM are stored in `wp_tracy_whitelist`; requesting an OTP does not create an application. The plugin prepared in this PR at `deploy/wordpress/tracy-whitelist.php` keeps the landing team's UI, email template and new honeypot, and replaces the mail sending with tracy-web's own relay. The WordPress backend sends the HTML/text template and Reply-To to the relay; the relay fixes subject, recipient and sender. There is no admin mail; the `beta.waitlist_form` signal currently applies only to the Tracy door below.

### Confirmation through the existing mail service

The old Supabase Worker is not restored: `auth-mail.tracy.ai` is now answered by tracy-web. The relay uses the same `MAIL=resend:...` and `MAIL_FROM` that send OTPs, so WordPress needs no Resend key.

- tracy-web: set `WHITELIST_CONFIRMATION_SECRET` to a random value of at least 32 characters and `WHITELIST_CONFIRMATION_DAILY=80` in the right environment's env. The secret is empty by default and the door answers 401. Migration 044 creates the snapshot and the table holding the UTC budget. Compose already reads the whole env_file.
- WordPress: set `TRACY_WL_RELAY_URL` to the HTTPS `/internal/beta/confirmation` URL on the right environment's cowork host, together with `TRACY_WL_RELAY_SECRET` in wp-config.php. DEV and PROD secrets differ. Never put the secret in JS, a shortcode, docs or git.
- Replace the MU-plugin with the PR's artifact after backing up the live version. The artifact keeps the existing shortcode/assets; the landing's JS/CSS files still need to be in place. This is prepared code; it has not replaced the plugin on tracy.ai.
- Enable a real hourly WordPress cron on staging instead of relying on traffic. Run `wp eval 'tracy_wl_send_queued(20);'` in the right site/container to send the old queue after configuring, then check Tools > Whitelist. No need to paste a Resend key into the legacy field; From comes from tracy-web. WordPress still honours Reply-To and a lower cap; the hard cap for the whole relay lives in env.

The relay checks the shared secret with a constant-time comparison, limits the body, validates the data and keeps the first payload per email immutable. A PostgreSQL lease prevents concurrent sends; each provider call takes one budget slot atomically. A per-record UUID avoids DEV/PROD collisions on the same account. Retries reuse the same payload and Idempotency-Key; a record is marked sent only when the provider returns an id. WordPress keeps the entry queued when the relay is slow/failing/over cap, and cron retries without the old three-attempt limit. An HTTP 409 review moves the WordPress entry to failed for an operator to check, with no automatic resend. Resend keeps keys for 24 hours (https://resend.com/changelog/idempotency-keys); the relay stops retrying from the 23rd hour after the first send if there is still no acknowledgement.

The cap of 80 counts attempts per UTC day; it does not reserve quota for OTPs on the same account. Settle the real quota before enabling. Do not delete snapshots or change MAIL_FROM during the retry window, as that breaks the stability of a send. The live plugin before this change still sends directly with its own key and lacks lease/snapshot; since this is not deployed, the public form is not yet confirmed to work end to end.

## Read-only check on 01/10/2026

Read the whole plugin 1.0.2 in the landing's web container and the public JS. This is the production landing although it currently sits on the DEV host. No files changed, no form submitted, no real mail sent.

- The database holds 0 applications and 0 settings rows: the plugin uses defaults, has no Resend key, a cap of 80/UTC day and an empty Reply-To. Submitting the form now would store the application and queue an email.
- Already present: HTML/text, an optional website row, CSV protected from formula injection, capability/nonce for admin, one row per email, and a resubmit that sends no new confirmation.
- Decision: share the Resend account with OTP. Create a separate Sending key restricted to the tracy.ai domain; never reuse the OTP key. The real plan/quota and whether the domain is verified are not yet confirmed. A separate Sending key does not create separate quota within the same account. The cap of 80 is the whitelist's cap, not a hard reservation for OTP. On Free (100/day), at most 20 remain for all other mail, before concurrency. Do not raise the cap or set it to 0 before the total budget is settled.
- No lease/lock for send and the daily cap yet: submit, cron and the admin button running concurrently can exceed the cap. The transient IP rate limit also reads then writes, not atomically.
- The idempotency key is per application id, but the payload is built from a row that may be updated, or settings may change between retries: Resend can answer 409 because the payload differs. Keys are kept only 24 hours; a timeout after the provider accepted the mail, followed by a retry past that window, can still duplicate. Snapshot the payload, lock the claim and handle unknown send outcomes before promoting widely.
- The `tracy_wl_retry` hook is in the cron option; wp-config does not set DISABLE_WP_CRON and the root crontab has no wp-cron/wp cron. No other external scheduler is proven, so an hourly retry without traffic is not guaranteed. After three failures an application moves to failed; the Send queued button only picks queued and does not rescue failed — a deliberate requeue mechanism is needed after fixing configuration.
- The resubmit form currently ignores the DB update result; a write error still returns ok. Check the write result before reporting success.

These plugin fixes must go into the landing team's managed source and be tried on a local/staging copy. This PR does not replace the production plugin over SSH. Do not use `/_site-mail` for confirmations. Before launch: verify account/domain quota; configure the sending key + Reply-To; accept queue/retry/concurrency on staging; then send a test to a designated inbox and check Gmail/Outlook in one assigned pass.

Quota source: https://resend.com/pricing. Idempotency source: https://resend.com/docs/dashboard/emails/idempotency-keys.

## Tracy contract for the stage where applications move to Tracy

Only used when `BETA_WAITLIST_MODE=tracy` and the UI is wired; does not apply to the current WordPress landing.

Mail link: `BETA_WAITLIST_URL?t=<token>`. The token is HMAC-signed, holds the email and a 7-day expiry, and is for the waitlist only. It is not a session or access to a site. A blocked OAuth sign-in is sent to `BETA_WAITLIST_URL?check=1`; the UI shows Check your email in that case.

1. Read `t` from the query. Call GET `/api/beta/waitlist` on the cowork origin with header `Authorization: Bearer <token>`, fetch `credentials: omit`. Success returns `{email}`; the UI locks the email.
2. POST to the same door with the same token, `Content-Type: application/json`. Body:

```json
{
  "name": "Visitor",
  "website": "example.com",
  "platforms": ["Joomla", "WordPress"],
  "role": "own",
  "site_count": "2-10"
}
```

Name is required, at most 200 characters. Website is optional; a bare domain is accepted and https is added. Platforms: at least one of WordPress/Joomla/EmDash/Other. Role is own or clients. Site count is none/one/2-10/11-50/50+. An email in the body is ignored; the email comes only from the token.

Success is `{ok:true}`; resubmitting updates the one application. Errors: LINK_INVALID 401, INVALID_REQUEST 400/413/415, ORIGIN_REFUSED 403, RATE_LIMITED 429. CORS allows only BETA_WAITLIST_URL's origin and the cowork origin itself. No credentials are sent. The UI keeps the data on error and shows success only after HTTP 200.

The landing should send `Referrer-Policy: no-referrer` and never log the query token or pass it to the landing's analytics. DEV uses a staging landing or configures the origin of the landing team's test page; never change the production origin to test locally.

## Fallback list

The dedicated by-email key cannot export the customer list. Dev needs an export produced by someone with access, each record `{email,subscriptions:{"10":"2027-03-14"}}`. Do not use an unverified marketing CSV of 1,342 people.

```sh
DATABASE_URL='<the environment database>' node scripts/import-beta-fallback.mjs 2026-10-01 < /path/to/private-export.json
```

The script checks the whole file, filters by the rules, stores the SHA-256 of the normalized email and the source date, then replaces the list in one transaction. Bad data, or no valid person, is rejected and the old list kept. The export and key never go into git. Update monthly. The fallback is used only when aMember fails; it never overrides a valid negative decision from aMember.

## Enable order: DEV, then PROD

1. Merge develop, build the web and dsh images with the new reporter; migration 043 runs itself when web starts. BETA_GATE defaults to off.
2. Create a dedicated DEV key, check-access × by-email only, in the aMember admin and put it straight into the server env. Never use a personal key. Check authenticated responses for a member, expired, excluded-only and unknown email from the right container.
3. Import the verified fallback. The count check prints only numbers, no emails.
4. Keep BETA_WAITLIST_MODE=wordpress and the /whitelist/ URL while using the current landing. Check the prefilled email from mail/OAuth and the confirmation queue on staging. Switch to tracy only once the landing has wired the token contract and the data-migration plan is settled.
5. Configure bot/chat/topic/ALERT_LABEL=DEV in `/etc/tracy/tracy-web.env` on the server (local uses `deploy/.env`). Without Telegram the app still runs and records analytics. Confirm that the Operation signal topic name matches thread ID 12 currently seen on both hosts; the ID does not tell the topic's name.
6. With the right to change that environment's env, change the topic of the two scripts if needed and run each with --test. Do not change cadence, thresholds or content. Never fire real messages from unit tests.
7. Turn BETA_GATE=on on DEV; check first sign-in, Google, invitation, warm/cold/import, retry, the daily report at 9:00 Vietnam time. DEV and PROD are separate databases.
8. Only after DEV acceptance comes the pass to main/PROD: a dedicated PROD key, fallback and landing ready, ALERT_LABEL=PROD. This PR does not deploy production.

Gate rollback: BETA_GATE=off, then recreate web. Migrations add tables/columns; no data needs deleting. Turn Telegram off by removing the bot configuration; analytics still records and the outbox keeps messages to send once re-enabled. Never roll back a migration by dropping tables in production.

## Local check results

The dsh build and the add-site bundle succeeded. Source/API gates green. The full gate ran with a private Docker PostgreSQL and TRACY_TEST_REAL_PROCS=1 so the DNS fixture does not use the socket carrier that has a framing bug on this machine. Worker tests: 10,520 pass, 2 skipped by suite; interop 204 pass; E2E 41/44 pass.

The three E2E still red are all in `packages/ui/tracy-mode-picker/test/e2e/model-policy-runtime.test.mjs`: the agent preset reports waiting for shell/subprocess. All of the PR's changes were stashed, the suite re-ran on the original HEAD 22b01fc7f in the same checkout, and the stash was restored; all three failures appeared unchanged. This PR neither fixes nor skips that test. Linux CI on commit 96b59446a ran everything green, including E2E and the three EmDash suites. The spec 76 follow-up must get a CI run on the new commit before merging.
