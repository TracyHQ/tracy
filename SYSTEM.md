---
description: How the Tracy system runs today — services, entry paths, the four branches through which an agent touches a site, change records, backups, data, site building, sign-in, build and deploy, shards (beta), and what has been retired.
sources:
  - deploy/compose.yml
  - apps/tracy-web/src/app.js
  - apps/tracy-web/src/seen-hints/route.js
  - apps/tracy-web/src/db/migrations/156-account-seen-hint.sql
  - apps/tracy-web/src/seat-plan/broker.js
  - apps/tracy-web/src/seat-plan/route.js
  - packages/ui/tracy-mode-picker/src/host/account-subscriptions.mjs
  - apps/tracy-web/src/workspace/scope.js
  - apps/tracy-web/src/speech/relay.js
  - apps/tracy-web/src/lib/speech-keyterms.js
  - apps/tracy-web/src/lib/desktop-opened.js
  - apps/tracy-web/src/ops/desktop-opened.js
  - apps/tracy-web/src/speech/say.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/sites/brand-files.js
  - apps/tracy-web/src/sites/activity-v2.js
  - apps/tracy-web/src/sites/backups.js
  - apps/tracy-web/src/sites/publish.js
  - apps/tracy-web/src/sites/publish-store.js
  - apps/tracy-web/src/sites/address.js
  - apps/tracy-web/src/cron.js
  - packages/wo/website-opportunities/src/route.js
  - packages/wo/website-opportunities/src/wo-journey.js
  - packages/wo/website-opportunities/src/contact-preview.js
  - packages/wo/website-opportunities/src/social-apify.js
  - packages/wo/website-opportunities/src/social-service.js
  - packages/wo/website-opportunities/src/social-prefetch.js
  - packages/wo/website-opportunities/src/dubai-prefetch.js
  - packages/wo/website-opportunities/src/social-client.js
  - packages/wo/website-opportunities/src/social-replica.js
  - packages/wo/website-opportunities/src/wo-social-auth.js
  - packages/fleet/tracy-fleet-operation/scripts/webroot/site-demo-contact.sh
  - packages/wo/website-opportunities/src/executor.js
  - apps/tracy-web/src/lib/customize-readiness.js
  - apps/tracy-web/src/lib/design-system-readiness.js
  - apps/tracy-host/src/app.js
  - apps/tracy-host/src/jobs.js
  - packages/bundle/tracy-native/cordis.patch.yml
  - packages/fleet/tracy-fleet-operation/dsh/Dockerfile
  - packages/fleet/tracy-fleet-operation/dsh/profile/cordis.patch.yml
  - packages/tools/tracy-subprocess-docker/src/route.mjs
  - packages/tools/tracy-site-tools/src/host/index.ts
  - packages/site/tracy-site-tabs/src/host/turn-record.mjs
  - .github/workflows/build-app-images.yml
  - .github/workflows/build-dsh-image.yml
  - apps/tracy-host/Dockerfile
  - apps/tracy-web/src/lib/quickstart-releases.js
  - deploy/scripts/check-fleet-files-in-image.sh
  - packages/fleet/tracy-fleet-operation/dsh/host-dsh-init.sh
  - scripts/ci/image-context.mjs
  - apps/tracy-web/src/lib/shard-channel.js
  - apps/tracy-web/src/shards/doors.js
  - apps/tracy-web/src/shards/sign-in.js
  - apps/tracy-web/src/shards/route-cookie.js
  - apps/tracy-web/src/shards/events-inbox.js
  - apps/tracy-web/src/shards/check.js
  - apps/tracy-web/src/shard/adopt.js
  - apps/tracy-web/src/shard/handoff.js
  - deploy/compose.shard.yml
  - deploy/nginx/shard.conf
  - deploy/scripts/install-shard.sh
  - deploy/scripts/sync-fleet-files.sh
  - deploy/scripts/tracy-heartbeat.sh
  - deploy/scripts/tracy-updater.sh
---

# How the Tracy system runs

[`CONTEXT.md`](CONTEXT.md) says **what Tracy is and who it is for**. This file says **how the system runs**: every
sentence here can be checked by reading a route, a Dockerfile or a config. The rules for changing code live in
[`CLAUDE.md`](CLAUDE.md).

This file describes **the revision that is checked out**. Merged code is not necessarily running on dev or production:
to know which host runs which version, ask the container, not the file
(`docker exec tracy-dsh printenv TRACY_SOURCE_COMMIT`).

## 1. In one sentence

Each host runs one Docker stack made of **`tracy-web`** (the entry for every domain), **`tracy-host`**
(works on the host's disk and Docker) and **one `tracy-dsh`** that serves every site on that host. Each customer
site has its own web + db containers; when the agent runs a command for a site, it `docker exec`s into that site's web
container ([ADR 0014](docs/adr/0014-one-dsh-per-host-commands-in-web-container.md)).

There is no Cloudflare Worker in the running path. A blank machine can run the whole system.

## 2. Services — [`deploy/compose.yml`](deploy/compose.yml)

Seven services, plus `minio-init`, which runs once locally:

| Service | What it does |
|---|---|
| `postgres` | The app's only database |
| `tracy-web` | Hono app. Sign-in, the seat ledger, the `/api/*` doors, the `/ops` and `/docs` pages, serving customer-site hostnames, and proxying into dsh. Code: [`apps/tracy-web`](apps/tracy-web/src/app.js) |
| `tracy-host` | Everything that touches the host's disk and Docker: provisioning, attaching/detaching sites, webroot jobs, backup/restore, demo screenshots, pulling CMS admin logs. Accepts only `/_host/*` calls HMAC-signed by `tracy-web`. Code: [`apps/tracy-host`](apps/tracy-host/src/app.js); the scripts it calls live in [`packages/fleet/tracy-fleet-operation/scripts`](packages/fleet/tracy-fleet-operation/scripts) |
| `tracy-dsh` | One dsh for the whole host, loading the `native` profile. Image built from [`dsh/Dockerfile`](packages/fleet/tracy-fleet-operation/dsh/Dockerfile) |
| `docker-proxy` | HAProxy in front of the docker socket; dsh may only `exec` into `*-web-1` containers, everything else is 403 |
| `minio` (+ `minio-init`) | Local only, plays the role of R2 |
| `dns` | Local only: resolves `*.tracy.test` to `tracy-web` |
| `<label>-web-1`, `<label>-db-1` | One pair per site, built by `tracy-host`. Per-CMS web images in [`packages/fleet/tracy-fleet-operation/web`](packages/fleet/tracy-fleet-operation/web) |

Three places run this same shape:

| Place | Address | Deploy |
|---|---|---|
| Production | `cowork.tracy.ai` | push `main` |
| Dev machine | `cowork.tracy.site` | push `develop` |
| Your own machine | `<label>.tracy.test:51710` | [`running-tracy-locally.md`](docs/references/running-tracy-locally.md) |

Env and pitfalls of the dev machine: [`may-dev.md`](docs/references/may-dev.md).

The site agent's visual check can draw its before/after pictures with dsh's browser when the site's
container has none (`tracy-site-tools` `captureView`, host mode `view`). Chromium has no network
route: same-origin documents, stylesheets, images and fonts are fetched through that site's
`docker exec curl`; page scripts stay disabled and other requests fail. This fallback is used only
for visual-check captures. It cannot evaluate changes that require page scripts or external assets.

## 3. Where the browser lands

Every request reaches `tracy-web` first. [`app.js`](apps/tracy-web/src/app.js) mounts, in order:

1. **Customer-site hostnames** (`bar/`): the real site page, preview, and the Tracy bar on the site.
   A GET carrying `?tracy_ds_preview=<id>` (a Design system panel card, in an iframe) is answered with that same
   page **wearing system `<id>`**: the proxy drops the parameter before asking the site (asks anonymously), reads the
   answering template from the HTML, then injects the bytes the Design system door would write
   ([`bar/ds-preview.js`](apps/tracy-web/src/bar/ds-preview.js)); nothing is written to the site, `no-store`, `noindex`, no badge, no picker.
2. **Root doors**: `/docs` (public API docs, built from [`apps/tracy-docs`](apps/tracy-docs)),
   `/design-inspiration` (public), `/tracy-badge.js`, beta, sign-in (`identity/`), seats
   (`seats/`, `lanes/`), `/api/sites/*` (`sites/`), public REST `/v1` (`api/`), notifications,
   `/ops` (`ops/`), the AI assistant `/api/assistant/*` (`assistant/`: answers with a model, hands over to a real person via Telegram; read-only, never writes to a site).
   On the new-site screen, pressing a setup action calls `POST /api/assistant/onboarding-draft`.
   It reads only the signed-in account's current session conversation and uses the Help model to
   extract an editable draft from the canonical CMS question feeds. It never creates a site,
   reads file contents or fetches a supplied address. The latest user revision is checked before
   and after extraction and again in the browser; queued corrections prevent stale handoffs.
   The limits are 50 turns, 32,000 characters, 12 requests per minute and 50 per day, without
   silently truncating history. Tab metadata carries the draft into Add site, where untouched
   answers can update while manual edits and intentional clears win. Multilingual requests stay
   in the description because the initial build selects one language. Import and business flows
   receive only their address or search seed and retain the customer's explicit next action.
   Tracy's Discord bot calls `/api/discord/*` (`discord/`, see §9).
   Voice input in the chat box: `GET /api/speech` and WebSocket `/api/speech/stream`; reading answers aloud:
   `POST /api/speech/say`; per-turn Voice timings measured by the page: `POST /api/speech/trace` (metrics only, stored as
   `ops_signal` rows of type `voice.turn`, read by `/ops` › Agents › Voice) (`speech/`, see below).
   Website Opportunities: `/api/website-opportunities/*` (`opportunities/`, see §8 "Website Opportunities").
   Public Find of Website Opportunities: `GET /find` (the built page of `packages/web/tracy-wo-find-page`) + `/find/api/*`, **no session, master only**
   ([`public/wo-find-page.js`](apps/tracy-web/src/public/wo-find-page.js), see §8 "Website Opportunities").
   Demos for outside builders: `/v1/demos*` on the api host, Bearer **account token** with scope `demos` (not a seat key)
   ([`opportunities-build/public-demos-route.js`](apps/tracy-web/src/opportunities-build/public-demos-route.js), see §8 "Website Opportunities").
3. **Everything else → the dsh of the host holding the site** (`workspace/`): HTTP and WebSocket proxy, in three scopes
   `/<siteKey>/…`, `/new/…` and `/` ([`scope.js`](apps/tracy-web/src/workspace/scope.js)).

**Address check before import:** `GET /api/sites/import-address?siteKey=…` requires a signed-in session and
reads only the site ledger and the caller's seats; it returns `available`, `mine` or `other`, never the site owner's name/email.
`other` and the `TAKEN` error carry a `joinPath` taken from the real site label, when the label is valid. This door reserves nothing,
creates no account/seat/site and does not change the claim lifecycle. `POST /api/tracy-add-site/detect` on dsh
only GETs the public page (or the admin address entered), tells network/TLS errors apart from a platform not yet recognised,
and reports a firewall blocking or Cloudflare protecting. The admin check only reads the form and existing lock markers;
it sends no credentials and does not guess captchas or two-factor authentication.

An import claim that belongs to the caller but has no job yet returns `available`, because there is no copy to open in
My Sites yet; an address of another account still returns `other`. The claim door returns `retryable: true` only for a
`migrated` row with no job. A new wizard starts over only when the host confirms the last run of that same failed site
and has valid data; the customer may correct the platform choice before retrying. Send `retryOf`
as the id of that failed run. A running run must still match the chosen platform to be followed.
The host checks and records the new run synchronously: if one is running, it follows that same run; if `retryOf`
already has a replacement run, it returns the replacement, even if it has just finished.
The claim is not deleted on retry; a claim with no known run still does not let a new wizard send start.

When Add site is closed mid-import, the browser keeps `tracy.import.active` in localStorage with
three type-checked values `{siteKey, platform, runId}`; no password, token or admin account.
It is only a pointer to the running run: reopening must ask for the real status before following it,
it is never used as permission to start an import, and it is cleared on error, handover or completion.

**The host hands over a finished read by itself** (23/10/2026). Before, only the wizard called
`POST /api/sites/:key/provision`, so closing the tab while packaging left the run stuck at `done`/`handing_over`, with no
copy. Now the `tracy-add-site` plugin on the host calls that door itself with the site owner's session as soon as the read finishes
([`fleet-handover.ts`](packages/site/tracy-add-site/src/host/fleet-handover.ts)). The request is written to
`DSH_HOME/tracy-add-site/fleet-handovers/` (directory 0700, file 0600, with the session cookie) **before** sending,
deleted once tracy-web gives a final answer, dropped after 2 hours; a restarted lane sends at boot and every 30 seconds.
The run also carries `handover` (`pending`/`filed`/`refused`): a wizard still open follows the job the host created; it only calls
itself when the host refuses, there is no `handover`, or it has waited more than 60 seconds. Both sides calling at once still yields **one** job: the
`/provision` door is unchanged, holds an advisory lock and returns `reused` to the second request.

**An unfinished import is never opened as a workspace** (22/10/2026). An import claim creates the row and
the claimed seat *before* the read; the site folder on the host exists only when `/provision` runs at the end, and a failed read
keeps the row for Retry. One single rule, [`lib/import-pending.js`](apps/tracy-web/src/lib/import-pending.js):
row `origin='migrated'`, empty `port`, and no `provision` job since the row was written (`attached` does not
count — `/attach` sets it too). Every reading door uses that same function:
- `/` picks a ready site first (`defaultSiteFor`); when every claimed seat is an unfinished import it redirects to the
  recovery page `/new/?tab=tracy:add-site&import=<siteKey>`. A path naming that site also redirects there (fetch gets
  409 `IMPORT_NOT_FINISHED`); someone without a seat still gets the join page; a `tracy_site` pointer to it is cleared.
- `POST /api/sites/:key/agent` returns 409 `IMPORT_NOT_FINISHED` with `recovery`, without calling the host's `/attach`.
- `GET /api/sites` still lists the row, with `importPending: true`, `importRecovery` and `agent: null`; My Sites shows
  "Import not finished" with a "Finish import" link instead of Start the agent.
- The recovery page (Add site, `import-recovery.mjs`) does not read the tab's memory: it asks the host half's status door by
  `siteKey` (the run the host keeps in `runs.json`), then follows that run as after reopening — Retry through the form
  (`retryOf`) or Continue. If the host has no run, the page says so and starts nothing.

**Removing an unfinished import** (22/10/2026) — one single removal path,
[`sites/import-remove.js`](apps/tracy-web/src/sites/import-remove.js); the door `DELETE /api/sites/:key/import` (owner only;
the Remove button on the recovery page and in My Sites) and the cron both call it. In order, nothing is deleted before all three steps:
1. **Right to remove**: one conditional `update … set removing_at` (only an unfinished import per `lib/import-pending.js`,
   not held by anyone), run under the advisory lock `site-provision:<siteKey>` that `/provision` also holds when writing a job — so
   provision and Remove never both win. While `removing_at` is set, the claim door (start/retry/Continue go through
   it), `/provision` and `/agent` return 409 `IMPORT_REMOVING`. If a Remove dies midway, a later Remove can take over after 15 minutes.
2. **The host confirms there is no read and holds the site**: tracy-web mints that person's lane session for `/new` (seat door) and
   calls `POST /new/api/tracy-add-site/hold` on the default host's dsh, HMAC-signed with the seat secret like the seat door
   ([`lib/add-site-host.js`](apps/tracy-web/src/lib/add-site-host.js)); the host half only answers signed calls
   (`MCP_SEAT_SECRET`, [`hold.ts`](packages/site/tracy-add-site/src/host/hold.ts)). Checking "is a run in progress" and setting the hold
   is one synchronous step; `startRun` refuses a held site (409 `IMPORT_REMOVING`). The hold is written to
   `$DSH_HOME/tracy-add-site/holds.json` (survives restart), expires by itself after 15 minutes, and is lifted when Remove gives up. Host
   busy, not answering or unknown: drop the mark, delete nothing, report to retry later.
3. **Clean up, with the hold still standing**: seats and row first, in one transaction (`delete` carrying exactly this run's mark); then the storage
   keys that `hold` listed (abort multipart uploads, delete archives — only within the site's prefix); finally the host `forget` deletes the run
   (memory + `runs.json`), the Claude Cowork code and the upload pointer, and **keeps the hold as a tombstone** until it expires, so a
   still-open `/new/` tab that presses Start is still refused. Comment files: keys are read in the transaction, rows go with the site row, storage
   objects are deleted only after commit (a storage error is logged, Remove still succeeds). Cleanup failing midway (transaction
   rollback): keep the mark and the hold, delete nothing; a later Remove or cron continues once the mark is older than `REMOVE_MARK_STALE_MS`
   (20 minutes, longer than the 15-minute hold), retaking the mark with the same conditional statement so only one side runs. The hold is lifted only when Remove gives up before deleting anything.
   The host asked is the host recorded on the row at claim time, not the current default host; a row with no host or an unknown host:
   `HOST_UNAVAILABLE`, delete nothing (the cron too).

`DELETE /api/sites/:key` and `DELETE /api/sites/:key/claim` on an unfinished import do not delete through a separate path: both take exactly the Remove path above, with the same
answers (409 `IMPORT_RUNNING`/`IMPORT_BUSY`/`IMPORT_REMOVING`, 503 `HOST_UNAVAILABLE` = nothing deleted, retry
later — also what a dsh without the `hold` route returns). A finished import and a site built in Tracy keep the old teardown. Remove
does not send `site.deleted` to the shard master, just as `DELETE /api/sites/:key/claim` never did.

**Cron `sweepAbandonedImports`** (hourly, its own lock): an unfinished import with no activity for 6 h 30 min, or with an expired Remove
mark (regardless of age), goes through exactly the Remove path above; a fresh mark is left alone. "Activity" = the latest of: row creation and the last claim press (`import_touched_at`, seen by tracy-web),
the run's last change and the last upload part (seen by the host; Remove sends `quietForMs` to hold). Host busy/not answering/
has recent activity: keep, retry next pass. Required ordering: cron (6 h 30) ≥ `RUN_TTL_MS` (6 h) ≥ `UPLOAD_IDLE_MS`
(6 h); the host numbers are in [`import-ttl.mjs`](packages/site/tracy-add-site/src/host/import-ttl.mjs), guarded by the test
`scripts/test/import-ttl.test.mjs`. `sweepClaims` is unchanged.

**Voice input in the chat box** (15/10/2026). The microphone button next to Send belongs to `@tracy/dsh-chat-input`
([`VoiceInput.tsx`](packages/ui/tracy-chat-input/src/client/VoiceInput.tsx), dsh slot `conversation.input.activity`;
dsh's voice plugin only transcribes after recording ends and is in no Tracy bundle). The comment box of the
Browser tab (the block-picker popup and the Reply box of a thread card, in the `dsh-better-sidebar` fork) renders **that same component**: chat-input
publishes it via `window.__TRACY_VOICE_INPUT__` + the `tracy:voice-input-changed` event ([`voice-bridge.mjs`](packages/ui/tracy-chat-input/src/client/voice-bridge.mjs)),
and the fork wires its `<textarea>` to it (`CommentVoice.tsx`) without importing anything from Tracy; same socket, same switch, the language
hint is the interface language; only one box per page listens at a time (15/10/2026). The browser opens the
WebSocket `/api/speech/stream` to **tracy-web**, not to dsh: `server.js` takes the `upgrade` event of this path
before the branch that splices into dsh. [`relay.js`](apps/tracy-web/src/speech/relay.js) checks that the voice switch is on, that `Origin` (and
`Sec-Fetch-Site`) is Tracy's own + the session cookie, then opens a second connection to **ElevenLabs Scribe v2 Realtime** with
a key only tracy-web holds; the microphone goes out as 16 kHz PCM, text comes back (`partial`, `committed`,
detected language). **The chat's main language** (15/10/2026): the language of the first clear message
(`voice-language.mjs` reads it from the session's event window; with no message yet, the interface language), sent as `?language=`.
The relay passes it to the service only when it is `vi` (measured: without it, Vietnamese speech switching to English lost half or came back empty); speech heard
but no text produced, or an empty final sentence after speech (the person speaks another language) → reopen the session with no hint and replay
the segment being spoken, once. When the service restarts from the beginning at a language switch, the text already shown is kept as one sentence. The agent answers
in the main language, unless the message is entirely in another language (`chatReplyLanguage` in `@tracy/core/language`,
`replyLanguageRule` in `tracy-site-tools`). **A relay rather than handing a token to the browser**: only by sitting on the path
can the server enforce limits — one session per account, at most 5 minutes of audio per session, stop after 30 seconds with no text,
minutes/day quotas per account and for the whole host (table `rate_bucket`). Audio and text are not recorded or stored at
Tracy; logs hold only duration, first-text latency and end reason.
**On/off and the key at `/ops` › Agents › Voice** (15/10/2026; [`ops/speech.js`](apps/tracy-web/src/ops/speech.js),
[`lib/speech.js`](apps/tracy-web/src/lib/speech.js)): one shared switch for every agent — the User Interface switch
`composer-voice-input` itself, pressed through the same door `PUT /api/ops/ui`. Off means fully off: the chat box draws no microphone,
`GET /api/speech` returns `available: false` and the relay refuses every session (404; switch unreadable → 503). The
ElevenLabs key is typed on that screen (`PUT /api/ops/speech/key`, with a Test button that calls ElevenLabs), stored sealed in table
`speech_setting` (`secret-box.js`, like the Model & AI keys), effective from the next session, no restart needed;
`SPEECH_TO_TEXT_API_KEY` in env is only a fallback when no key is stored. No key or switch off → no microphone.
Browsers allow the microphone and AudioWorklet only in a secure context (https, localhost): on the local machine at `http://tracy.test:51710`
the microphone **does not show**; to try it, open Chrome with `--unsafely-treat-insecure-origin-as-secure=http://tracy.test:51710`.
The desktop app needs the entitlement `com.apple.security.device.audio-input` (from app builds released after 15/10/2026).

**Voice conversation** (16/10/2026; ADR [0033](docs/adr/0033-voice-chat-stt-agent-tts.md)).
Each chat has **two modes, Chat and Voice**, like the ChatGPT app. Chosen from the menu in the chat header (slot
`conversation.session.header.utilities`) or the waveform button next to the microphone in the chat box
([`VoiceMode.tsx`](packages/ui/tracy-chat-input/src/client/VoiceMode.tsx)). Voice is a separate `conversation.view` of
Tracy (`tracy-voice`): dsh does not draw its tab, and since dsh has no API to select a view, Tracy selects it by clicking that
tab button itself ([`voice-mode-view.mjs`](packages/ui/tracy-chat-input/src/client/voice-mode-view.mjs)).
- **In Voice:** the chat body is an orb that swells with the speaker's voice and Tracy's voice; the heard text or the sentence Tracy is
  speaking shows below it. The chat box is replaced by a bottom bar (mute, X back to Chat) via the `conversation.composer` chain, so typing is not
  possible. Leaving the view (pressing X, choosing Chat or another tab) ends voice.
- **Sending:** when the customer stops speaking, the text is sent **like a typed message** via dsh's `conversation.sendSession`: a new message
  when Tracy is idle (`'queue'`), a **steer** into the current work when Tracy is busy (`'steer'`), like a consultant who hears the customer correct
  something and acts on it at once. When a question card is pending, the customer's words answer that card via dsh's `PendingQuestion.answer`
  ([`voice-answer.mjs`](packages/ui/tracy-chat-input/src/client/voice-answer.mjs)). Tracy's own confirmation card (id
  `confirm-…`, two options) accepts only an option named aloud or a clear "yes"/"no" in eight languages ("oui",
  "ja", "不") — yes is the first option, no the second; cancel words ("annuler", "cancel", "取消") count as "no" and do not stop
  the turn; any other sentence makes Tracy reread that card and prompt "say yes or no", never sending the words as the answer
  (20/10/2026). A sentence choosing the **first** option (yes, or that exact label) counts only when it **starts after** the
  card reading has finished playing (not while reading or right after — the same fence as plan approval) and does not match the last few words
  Tracy just said: such a sentence is dropped silently and the card is asked again once after a pause; if dropped again,
  Tracy says once "I didn't catch that, please answer on the screen" and stops asking — a "yes" from Tracy's own speaker never
  opens a delete. "No"/cancel only keeps things as they are, so it is accepted at once, even while reading. Back in Chat, the spoken sentences are the
  customer's messages, steer messages or question-card answers, exactly as if typed or clicked.
- **Turn-taking like a real person** ([`voice-turn-taking.mjs`](packages/ui/tracy-chat-input/src/client/voice-turn-taking.mjs),
  ADR 0033 items 11, 13): a sentence ending in "and…" waits for the customer to think; while the customer is still speaking nothing is sent and Tracy does not
  cut in; "mhm", "genau", "okay" while Tracy speaks mean the customer is listening (Tracy keeps speaking, nothing is sent); "um" is never a message;
  on long work Tracy says "Still working."; question cards are read with their options; "stop" or the stop-work button on the bottom bar stops
  the agent's turn (dsh's `session.cancel()`, like the Stop button the bottom bar replaces).
- **The agent knows the customer is speaking** (ADR 0033 item 14): the page reports `{ sessionId, voice }` through the `/view` door of
  `tracy-site-tools`; the host adds the per-turn rule `tracy-site-tools:voice-reply` (open with one or two sentences meant to be read aloud, numbers
  written as words), and the page reads that opening aloud. A failed agent turn is spoken, not silent.
- **Voice key check** (ADR 0033 item 15): tracy-web tests the ElevenLabs key for STT and TTS every 10 minutes while voice is on and
  right after a key is saved (`speech/health.js`), plus the results of every session and every reading (`lib/speech-health.js`). If the key is
  rejected, `GET /api/speech` hides the microphone or Voice, and `/ops` › Voice shows the reason.
- **While the agent works:** Tracy says one short sentence for each new task: a sentence the agent wrote itself between tool calls, or a
  pre-translated sentence for the kind of work, or the question of a question card. It never reads tool names. Every sentence comes from the session's event window
  ([`voice-mode-turn.mjs`](packages/ui/tracy-chat-input/src/client/voice-mode-turn.mjs)); none is invented. At the end of the turn,
  Tracy reads the beginning of the answer.
- **Ears:** the microphone opens in the page but opens an STT session (the relay above) only when sound is heard locally, then replays the one second
  before it. A Voice session opens with `?turns=voice`: the relay asks ElevenLabs to commit a sentence after 0.8 s of silence (dictation keeps the default
  1.5 s), and Tracy waits only 0.3 s more. The relay's STT quota counts seconds of audio received (`speech-seconds*` in
  `rate_bucket`), not sessions. While Tracy speaks, the ears stay open with a threshold above the speaker's echo: if the customer talks over it, Tracy gets quieter, and on
  real words from the customer it stops, listens to the end, then answers that. Heard words that are the sentence Tracy just read are dropped.
- **Voice intro note:** on the site's start screen (empty session), a small note points at the waveform button
  (`conversation.input.dock`, `tracy-voice-tip`). Clicking the note enters Voice; closing it closes it until the page is reloaded.
- **Spoken audio goes through tracy-web:** [`say.js`](apps/tracy-web/src/speech/say.js) checks the voice switch (the same
  `composer-voice-input`, one switch for both), counts characters, then calls **ElevenLabs Flash v2.5** with the same voice key
  (needs the Text to Speech permission), and streams 24 kHz PCM back to the page.
  - Limits: at most 600 characters per reading, 20,000 characters/day/account, 300,000 characters/day for the whole host, counted in the same
    `rate_bucket` table (`overLimitBy`). If the service refuses, the characters are given back.
  - Text and audio are not recorded or stored; the voice the customer chose lives only in the browser.
- **Keyterms — pilot, off by default** (19/10/2026; [`lib/speech-keyterms.js`](apps/tracy-web/src/lib/speech-keyterms.js)):
  the operator lists site keys at `/ops` › Agents › Voice (`PUT /api/ops/speech/keyterms`, column
  `speech_setting.keyterm_sites`, migration 145; an empty list = off everywhere). The page sends only the site it is on
  (`?site=` on the `/api/speech/stream` socket, taken from `<base href>`); the relay asks tracy-web: the site is on the list, the
  signed-in account has a live seat on the site (`roleOnSite`), and only then reads the site's proper names — the business name the customer
  typed in Add site (`site_brief.normalized.name`) and the product titles, menu items and pages that people edited in the CMS admin
  (`site_cms_change.resource_title`). NFC-normalised, whitespace collapsed, case-insensitive dedup, HTML/addresses/
  generic labels dropped ("Home", "Startseite"), phrases over 20 characters dropped (not truncated), at most 30; cached 10 minutes per site + language.
  The phrases travel only in the handshake to ElevenLabs (`keyterms` repeated in the query, about 20% extra STT cost), never in Tracy's
  URLs or logs; logs record only the number of phrases sent and the number of `session_started` returned. Tracy **does not have** the full list of the site's
  products, menus or page titles (they live in the customer's CMS), so it uses only what the brief and the
  admin journal have brought back.
- **Approving a plan by voice — behind the `voice-plan-approval` switch, off by default, and only in locales that a native speaker has
  checked together with a real STT pass** (`PLAN_VOICE_LOCALES`, currently **empty** — 20/10/2026;
  [`voice-mode.mjs`](packages/ui/tracy-chat-input/src/client/voice-mode.mjs), [`voice-plan.mjs`](packages/ui/tracy-chat-input/src/client/voice-plan.mjs)):
  with the switch on, exactly one plan awaiting approval in the turn, no question card beside it, and dsh holding exactly that
  call (`pendingPlan`), Voice reads the plan's title and a summary of its scope, then says how to answer. Only after the reading finishes does
  **a whole sentence** of approval ("j'approuve ce plan", "approve this plan"… eight languages, `isPlanApproval`) answer the
  `plan-review` card with the Approve option, bound to the call id and the fingerprint of exactly the text that was read; if the plan changes it is read
  again, not approved. "ok", "yes", a backchannel like "mhm", a long sentence containing the approval words, words held back or sent by pressing send, or a sentence that started
  while Tracy was reading are never accepted. "Change the plan …" is feedback (Keep planning + the customer's words); saying "change the plan" with no content leaves
  the plan waiting while Tracy asks what to change, and the next sentence is the feedback. Otherwise, or with the switch off, or any
  condition missing: back to Chat as before. Plan approval only answers `exit_plan_mode` and never opens the D34 confirmation
  (`CONFIRM_FIRST` counts only `ask_user_question` answers).

Inside dsh, the customer page is the **`native`** profile with the **`@tracy/dsh-native-bundle`** bundle
([`packages/bundle/tracy-native`](packages/bundle/tracy-native/cordis.patch.yml)). This is the only bundle
that reaches a server. `packages/bundle/tracy-cowork` is used only by the two local profiles `web` and
`desktop` (`./run.sh`, `./dev.sh`). The Electron shell [`packages/desktop/tracy-desktop`](packages/desktop/tracy-desktop)
also runs only on a dev machine. Port and profile map: [`profile-map.md`](docs/references/profile-map.md).

## 4. The agent touches a site through four branches — each with its own boundary

This is **not** one straight path. Each branch has its own way of being blocked and its own way of being recorded.

> **The viewer's identity reaches the CMS by signature, not by bare header (P0, 26/10/2026).** Each site has
> its own 32-byte key, generated once at provisioning (or by `tools/issue-site-access-key.sh` for older
> sites), at `$TRACY_PRIVATE_ROOT/.site-access/<label>/key.json`. `tracy-web` signs an assertion for every
> request it proxies — canonical JSON `{v,kid,site,email,role,tier,host,method,target,iat,exp,nonce}`,
> HMAC-SHA256, valid 30 s, single-use nonce — sent in `x-tracy-assert` + `x-tracy-sig`
> ([`bar/site-access.js`](apps/tracy-web/src/bar/site-access.js)). The CMS's Tracy Access plugin
> (WordPress `tracy-access.php` 0.4.0, Joomla `plg_system_tracyaccess` 0.2.0) trusts **only** that assertion
> — constant-time signature check, site/host/method/target match, expiry, and atomic nonce recording (a unique-key
> table; storage error → refuse). The bare `x-tracy-email/tier/role` headers **are no longer read**: any
> container on the shared network could send them. **The network is split too:** each new site (and each site
> converted by `tools/secure-site-access.sh`) is only on its own `<label>_default` network; `tracy-web` joins
> it with the alias `tracy-web` (the §6b loop of `deploy/scripts/deploy-tracy-stack.sh`,
> [`lib/site-network.sh`](packages/fleet/tracy-fleet-operation/scripts/lib/site-network.sh)), so site
> A can no longer call site B's containers. Site mail goes to `http://tracy-web:8080/_site-mail` through
> that alias. Rollout is checked: `tools/resync-access-plugin.sh` (WordPress) and
> `tools/resync-joomla-access-plugin.sh` (Joomla) upgrade the plugin to strict only on sites that are **ready** (with
> a key + a `ready.json` record with the right `kid`) **and** listed in `$TRACY_PRIVATE_ROOT/.site-access/rollout.list`.

**a. Shell commands (`bash`, terminal).** The `tools/pre-execute` guard of
[`tracy-subprocess-docker`](packages/tools/tracy-subprocess-docker/README.md) refuses a `workdir`
outside the session's site; `tracy-sandbox-docker` stamps the session's mode and root; the provider reads the label from
cwd and then runs `docker exec -u www-data|nobody` into `<label>-web-1` through `docker-proxy`. Inside the
web container, the command cannot see `/desk-home`, cannot see other sites, and has no Docker.

**b. dsh file tools** (`read`, `write`, `edit`, `glob`, `grep`, `str_replace_editor`). They
run **inside the `tracy-dsh` process**, on the `/site/<label>` mount, not through `exec`. The only
block is the `FS_TOOL_ARGS` path fence in
[`route.mjs`](packages/tools/tracy-subprocess-docker/src/route.mjs): every path argument is
`realpath`ed and must lie inside `<sitesRoot>/<the session's label>`.

**c. CMS content writes through the Apply door.** The `tracy_site` tool
([`tracy-site-tools`](packages/tools/tracy-site-tools/src/host/index.ts)) calls
`POST /api/sites/:key/apply` on `tracy-web` on behalf of the person typing. This door (`applyOverHttp`
in [`sites/route.js`](apps/tracy-web/src/sites/route.js)) checks the seat, toolset and write lease, then
calls **the Claude Cowork plugin installed in the site's CMS** (endpoint and token in table `site_component`). Undo:
`apply.revert`. `apply.list` without an `apply_id` is answered by the door itself, without calling the site: recent changes
come from Tracy's ledger (the audit table and `site_write`, 30 days, at most 15 apply_ids, newest first), so the agent
can undo changes from an earlier conversation too, including `site.identity` (the site name).

**d. Writes outside Apply, reported afterwards.** Three kinds of write do not go through Apply: EmDash's own MCP
(`tracy_emdash`), look changes via file tools, and `look.revert`. `tracy-site-tools` reports each
success to `POST /api/sites/:key/changed`. Since 20/10/2026: before **every** EmDash write
(`tracy_emdash` writes, the write script of `content.replace`, `media.upload`/`media.draw`, the menu line of
`page.create`, redirect POST/DELETE, `form_words`) the host takes (or extends) the exact write lease of the Apply door through
`POST /api/sites/:key/lease/acquire` (held within the session's site by `conversationSite`, signed as the person typing,
carrying `x-tracy-session` + `x-tracy-turn`; a seat that cannot write → 403); `SITE_BUSY` is waited out as on the
Apply path (`lease-wait.mjs`, outside the flight, cut by Stop — a Stop during the wait sends nothing), and the lease is released
at the end of the turn (`/lease/release`). If tracy-web does not answer this door (older version, unreachable), the write
still goes ahead as before. Look changes (`look.set`/`look.revert`) take no lease, on all three CMSs.
The text of EmDash contact forms (plugin `emdash-forms`, stored in the plugin's own store, which no content tool reaches)
goes through the **form door** of `tracy_emdash` (25/10/2026): `form_list` reads, `form_words` changes exactly the words the customer reads (labels, hints,
option labels with the same count, submit button, thank-you message) — the host reads the form, then sends `forms/update` back with only those words changed;
fields, names, types, recipients and webhooks stay unchanged. Same in-container exec path, same agent token as the
redirect door (`FORMS_SCRIPT`, only the two routes `forms/list` and `forms/update`).

**What a stopped turn wrote.** When the customer presses Stop, dsh replaces the answer of the running call with
"aborted", while a send already in flight still runs to completion. `tracy-site-tools`
([`stopped-writes.mjs`](packages/tools/tracy-site-tools/src/host/stopped-writes.mjs)) records each
write (Apply and EmDash) of a call cut by Stop: `sent` when Stop arrives, then the result (`ok` / `refused` /
`unknown` / `not-sent`) when the answer comes back, via `POST /api/sites/:key/turn/stopped` into table
`site_stopped_write` (migration 148; names only: action, target kind/id/slot/page, outcome). The first step of
the next turn by the person typing (the original session) asks `POST /api/sites/:key/turn/stopped/take` — returning the writes of
the previous turn of the same session, same site, same person, not yet reported, and marking them reported — then inserts **one** notice
(`tracy-site-tools:stopped-writes`): which went in, which are unclear (read back before fixing, never resend
blindly). A call that returned before Stop is not recorded; survives a host restart.

**The boundary chain between two sites on the same host:** the seat's `folders` in the `dsh-passwords` seat door →
the sidebar's cwd fence → the path fence for every tool → the provider's label and `..` check → a proxy that only opens
`exec` into `<label>-web-1` → the web container's own confinement. The accepted cost (the fence is
JavaScript running in the same process as `/desk-home`): [ADR 0014](docs/adr/0014-one-dsh-per-host-commands-in-web-container.md).

## 5. How changes are recorded — the Site changes tab

Every webroot is a git repo. The sources that record:

| Table / source | Records what | Who records |
|---|---|---|
| `site_turn` + Git moment | One chat or comment turn: who, what words; the files changed in the turn become one commit | The dsh host calls `POST /api/sites/:key/turn` ([`turn-record.mjs`](packages/site/tracy-site-tabs/src/host/turn-record.mjs)); since 09/10 step 1 does not wait for this door — the first tool call that **can write** to the site waits (`writeReady`, at most 15 s), so the turn-start seal still finishes before the agent's first write; turn 2+ of a session waits at the step to learn the `undone` list; since 16/10 that list is read with `POST /api/sites/:key/turn/undone` (reads only the previous turn's `site_turn`, no host job, no seal), so the step no longer waits for the seal and the previous turn's scan — if tracy-web does not have this door yet, it falls back to the answer of `POST /turn`. Since 10/10: the answer also carries `momentsPending` — earlier turns of the same session whose moment the host is still committing (`/moment` returned 202); the new turn's first write waits until `POST /api/sites/:key/moment/wait` reports `ended` (at most 120 s, equal to the host's site-lock wait limit); on timeout it writes and reports `release` so both turns are flagged if that moment commits. Since 16/10: the Good/Bad buttons under the answer (dsh's message feedback, heard through `session/event` and `feedback/committed`) are sent by the host to `POST /api/sites/:key/turn/rating` and kept in `site_turn.rating`, `rating_categories`, `rated_at` (migration 113) — no notes kept. Since 17/10 (real-usage measurement): closing a turn carries `work` — number of steps, number of tool calls, number of failed calls, read from the turn's own events — kept in `site_turn.steps`, `calls`, `failed_calls`; the turn's visual check verdict is sent by site-tools to `POST /api/sites/:key/turn/check` and kept in `site_turn.visual`, `visual_note` (migration 114) |
| `site_write` | Every content write: through the Apply door, or reported to `POST /changed` (branch 4d) | The Apply door, the `/changed` door |
| `site_stopped_write` | Every write of a call cut off by Stop: action, target, outcome (`sent`→result); `noticed_at` once the next turn has been told (migration 148) | `POST /turn/stopped` (host), read once with `POST /turn/stopped/take` |
| `site_write` — action | The Apply door's write row for a create carries `content.create` (so Site changes shows it correctly as a create) while the `audit` row of the same statement keeps `content.update`; Undo pairs the two rows by turn + action + time, so `pairWrites` maps `content.create` of `via: apply` back to `content.update` when building the key | `recordApply`, `pairWrites` |
| `site_write` — target.title | The record's name, so the card under the answer and Site changes name a write by its title, not its id (20/10/2026). `/changed` keeps the title EmDash reports; the Apply door keeps the `x-tracy-write-title` header (`encodeURIComponent`, one line, at most 200 characters) that the dsh host reads from that very record — accepted only from the host's signed actor, never from a cookie or an API key; it is only a label and does not decide which record is written or undone | `writeTitleOf`, `writeTarget`, `writeTargetOf` |
| `site_outside` | Commits on the webroot that belong to no chat turn (someone edited outside Tracy, a deploy) | The history job, when the list is read |
| `site_cms_change` | CMS admin log lines (people editing directly in the WP/Joomla/EmDash admin) | [`cron.js`](apps/tracy-web/src/cron.js) pulls them through `tracy-host`, `cms-log-*` scripts |
| `site_operation` | Successful undo / reset | The undo/reset doors |
| `site_design_system` + `site_write` via `ds-slot` | One design system apply (or its Undo) in the **Design system** tab, opened from the **Design system** row on the site's start screen: which system replaced which, who clicked, whether it was undone | The Design system door (see below) |

The displayed list is `GET /api/sites/:key/activity?version=2`
([`activity-v2.js`](apps/tracy-web/src/sites/activity-v2.js)): one row per event, filtered by
Source, marked "undone" only when there is evidence.

Opening the tab hits two doors at once, `/activity?version=2` (the list) and `/backups` (the backup points), both
answered from **one** `webroot-history` job on the host: the second read of the same site joins the job that is
running ([`history-share.js`](apps/tracy-web/src/sites/history-share.js)) — only a running job, never an
already finished answer, and any other job of the site (backup, moment, restore, write) cuts the sharing.
Inside the job, a look where the webroot has not changed since the last commit skips the whole-tree walks
(`find -size +50M`, `add -A -f`, housekeeping scan): `webroot-git.sh` `worktree_unchanged`
proves "clean" with `write-tree` = `HEAD^{tree}`, `diff-files` and `ls-files --others` against
`info/exclude` alone; if dirty it takes the full path as before. Measured 12/10/2026 on the local stand (demo-tb-joomla, 42,650 files):
op `history` 4.5–7.9 s → 0.76–1.0 s. A network error (fetch throws) is retried once by the tab before it reports
that the site could not be reached.

**Undo by chat turn** (the card under each turn in the chat, `tracy-chat-input`): `GET /api/sites/:key/turns?session=`
reads the tables above for one session — the turn's commits (trailer `Tracy-Turn`, host op `turn-moments`), the writes with
`apply_id`, and the reason something cannot be undone; `POST /api/sites/:key/turns/undo` pre-checks a multi-moment turn (read-only host
op `undo-check`), holds the site's write lease, then reverts files through the same `/restore` path in mode `undo` (one
`site_operation` row per moment) and content through `apply.revert` (branch 4c), newest → oldest, stopping at the first failure. A turn that was undone (fully or partly) is stamped
`site_turn.undone_at` + `undo_complete` (migration 067); when the session's next turn opens with `POST /turn`, the answer
(and `POST /turn/undone`, read early since 16/10) carries `undone`, and `tracy-site-tabs` inserts a notice for the agent right after the user's message (the undo runs within that same
session, so the "site changed" notice stays silent).
The deciding logic is in [`turn-undo.js`](apps/tracy-web/src/sites/turn-undo.js). No undo on EmDash (the server
keeps no undo receipt), no Redo. The Site changes tab shares this machinery (logic in `@tracy/core/turn-undo`):
it opens by default on the `people` filter (every Source except `automatic`, filtered on the server), and a Chat row has an "Undo this
request" button that calls exactly the two doors above; turns the machinery does not list and non-chat events keep the old `/restore` door.
The third door is the Undo button on the preview toolbar (fork `dsh-better-sidebar`): the fork only draws, `tracy-chat-input` computes
the state and calls the machinery, and the two talk through `window` events (`tracy:undo-toolbar-state` / `tracy:undo-toolbar-press`).
After every undo, `undoTurn` emits `tracy:turn-undone` so the three doors re-read together; the Site changes row of an undone turn
carries the label Undone / Partly undone (the `undone` field of the V2 item).

**Design system on a running site** (11/10/2026).
The entry point is the **Design system** row on the site's start screen (the list under *"What would you like to change
today?"*, [`design-system-card.mjs`](packages/ui/tracy-chat-input/src/client/design-system-card.mjs) of
`tracy-chat-input`; the end of the row shows the name of the system the site is wearing). Clicking the row emits the event `tracy:design-system-toolbar-press`
(old name kept), and `@tracy/dsh-design-inspiration` opens the `tracy:design-system` tab. **The Design system button on the browser
toolbar was removed 12/10/2026**: fork `dsh-better-sidebar` only draws the button when someone reports state through
`tracy:design-system-toolbar-state`, and no one reports any more. The `toolbar-design-system` switch now turns the row and the tab on/off. The tab calls three
doors of [`design-system.js`](apps/tracy-web/src/sites/design-system.js) (the write in
[`design-system-write.js`](apps/tracy-web/src/sites/design-system-write.js)): `GET /api/sites/:key/design-system`
(the system being worn, read right inside the container, and whether the template can wear one), `POST …/design-system {id}` and
`POST …/design-system/undo {applyId}` (seat with toolset `code`; Viewer is read-only). No model, no rebuild,
**not through the Apply door/Claude Cowork**: `tracy-web` computes the bytes with the `@tracy/ds-slot` emitter (a copy in the image,
[`lib/ds-slot.js`](apps/tracy-web/src/lib/ds-slot.js)), then `tracy-host`'s `site-ds-slot` job
([`ds-slot.js`](apps/tracy-host/src/ds-slot.js)) writes inside `<label>-web-1`: EmDash `/app/data/ds-slot.css`; WordPress
a variation in `uploads/tracy/styles/` + the theme's `tracy_apply_inspiration()`; Joomla a `mod_custom` module "Tracy design
system". The job reads the before and after state in the same run and keeps both in
`<TRACY_PRIVATE_ROOT>/<label>/ds-slot-undo/<id>/` (outside the site folder, out of reach of the agent's tools); Undo only writes
back when the site still holds exactly what the apply wrote. `POST …/design-system {id: "template-default"}` (the Template
default card, 15/10/2026) is a job in mode `clear`: it removes the worn system back to the template's original look (EmDash deletes the sheet, Joomla
unpublishes the module, WordPress writes back the global styles + `tracy_inspiration` of the newest entry whose `before` wore no system,
keeping `tracy_nav`/`tracy_hero` as they are), and keeps an undo entry exactly like an apply, so its Undo re-applies the system just removed; a template
locked for customers can still be cleared. The door holds the site's write lease. **One click = one `docker exec`**: the panel sends
the template it read, the write script checks the template itself and returns the after state right away (WordPress read with `php -r` SHORTINIT, written with
`wp eval` with the theme loaded). Undo can be clicked in three places, all one door: the panel, **the browser toolbar's Undo** (`GET /turns` returns
`designSystem` = the site's newest apply; the toolbar picks the newer of it and the chat's newest change) and **the Site changes
row** of the apply (the `writes` item carries `designSystem`); the doors listen to each other through the `tracy:design-system-changed` event. The slot contract is `ready` only for measured releases (`minVersion`): WordPress compares against the running theme's `Version`, Joomla/EmDash against `site.quickstart_version`; older → `TEMPLATE_NEEDS_UPDATE`.
The panel's cards and preview frame wear **the site's own words**: the Build's `docs/agents/design-preview.json` file if present,
otherwise a fourth door **`GET …/design-system/words`** — tracy-web reads the home page the site is serving (the same
`siteTarget` address that `seen` reads, 10 s, no `docker exec`) through the public Design page's `wordsOf`, cached 2 minutes per site;
if it cannot be read → `{present:false}` and the cards keep each system's sample words, and the panel says which words it is using. The panel opens on the GET door's
read as before; the words arrive later and do not block.
Clicking a system card opens a popup **previewing the customer's own site wearing that system** (12/10/2026; same frame as the Add
site popup below), built only when the popup opens. A fifth door **`GET …/design-system/preview?id=<id>&template=<key>`** (any seat
on the site, Viewer included, like reading the panel): tracy-web reads the site's home page on its web container (`siteTarget`,
never an address the client sends), removes the slot the site is wearing, injects **exactly the bytes the apply would write** for the site's contract
(judged like the apply door: EmDash by quickstart tag, Joomla by the `template` the panel read plus the site's release, falling back
to one read inside the container), and returns HTML with a sandbox CSP (`PREVIEW_CSP`, see *Browsing several pages* below). The read + inject part is shared with the
demo door (`wornPageOf` in [`design-system-preview-page.js`](apps/tracy-web/src/sites/design-system-preview-page.js),
`previewShelf`, `sendPreview` in [`design-system-preview.js`](apps/tracy-web/src/sites/design-system-preview.js);
the running-site doors are in [`design-system-site-reads.js`](apps/tracy-web/src/sites/design-system-site-reads.js)). **Nothing is written to the site.** Cached
in memory by (site, release + template, newest apply, system) for 60 s, at most 24 pages; every apply/undo through these
doors forgets all pages of that site at once (edits to the site from elsewhere show within at most 60 s). A template that cannot wear
a system → 409 `DS_PREVIEW_UNAVAILABLE` (`NO_SLOT`), and the popup says it cannot preview yet; a page that cannot be read → 502
`DS_PREVIEW_FAILED`, the popup offers Try again. The main button is still **Try on <site>** (a real apply, Keep/Undo). The popup calls the site by
the name the site gives itself on its home page (`name` of the words door); `/api/sites` only has the address (`displayName` is the domain).

A newly claimed fleet site with neither an attachment nor an address returns `supported: false`,
`canApply: false`, `reason: SITE_NOT_READY` without reading a container or the library. The tab explains
that the site must finish building and opens the existing site’s Build tab; this press starts no build.

**Design system library — Refero only** (12/10/2026). The Design system tab and the **Pick a design system** card of the
Add site form read the same list: the door **`GET /api/design-system/library`** (signed-in seat,
[`design-system-library-doors.js`](apps/tracy-web/src/sites/design-system-library-doors.js)) returns every Refero system in
`vendor/tracy/refero/catalog.json` that passes the quality gate, id `refero:<uuid>`, with the slot's replacement fonts, the palette
(`colors`), `theme` and the image address; a hand-picked group of systems comes first, the rest by name A→Z, and duplicate names are made
distinct (the library reader: [`lib/ds-slot.js`](apps/tracy-web/src/lib/ds-slot.js)). Each system's image is at
**`GET /api/design-system/library/refero/:uuid/screenshot.jpg`** (no sign-in needed; WebP 480 px, keeping the `.jpg` name
so cards already drawn do not break). **`GET /api/design-system/support?quickstart=<tag>&platform=<cms>`** says whether a site newly built from the
newest release of that quickstart can wear a system (`{supported, reason, need, have}`); if not, the Add site form's card says
the template does not support it yet and the site keeps the template's original look. **OpenDesign is no longer offered**: the apply door and both preview doors reject OpenDesign ids (`stripe`,
`od:stripe`) with 400 `DS_UNKNOWN`; a site already wearing an OpenDesign system still reads out its name and can still Undo. The
OpenDesign library in the image is only read to name those systems. Rights to use Refero data: see
[`vendor/tracy/refero/IMPORT-NOTE.md`](vendor/tracy/refero/IMPORT-NOTE.md).

**Design system preview in the Add site form** (12/10/2026). Clicking a system card in the *Choose a design
system* sheet opens a popup (the same Dialog frame as the Design inspiration preview) drawing **the chosen template wearing that system**, built only when
the popup opens. The door **`GET /api/design-system/preview?quickstart=<tag>&platform=<cms>&id=<id>`**
([`design-system-preview.js`](apps/tracy-web/src/sites/design-system-preview.js), signed-in seat like the library door):
tracy-web finds the quickstart's live demo (`liveDemoOf`, a `site` row with `demo` + `published`), reads its home page on the
web container (`siteTarget`, following a redirect only when it lands on that same demo, 10 s, ≤ 1.5 MB), rewrites the container name in links to
the public address (`site.address`), inserts `<base href>` at the start of `<head>` and **exactly the bytes an apply would write** (`emitFor`:
Joomla `<link>` + `<style id="tracy-ds-slot">`, EmDash like the layout inlining the slot file) at the end of `<head>`, and returns `text/html` with a
sandbox CSP (`PREVIEW_CSP`); the client puts it in a sandboxed `<iframe srcDoc>` (see *Browsing several pages* below). **Nothing is written to the demo**; it never
reads an address sent by the client. Cached in memory by (quickstart, demo version, system) for 10 minutes, at most 48 pages. A quickstart with no
demo, a demo version that cannot wear a system, or a demo that does not answer → 409 `DS_PREVIEW_UNAVAILABLE` (`NO_DEMO`/`NO_SLOT`/`DEMO_UNREADABLE`);
the popup says it cannot preview yet, and the system can still be chosen.
**Browsing several pages** (12/10/2026): both doors also accept `path=<same-site path>`; every same-site link in the returned page (same host, regardless of http/https, port, `www.`) is rewritten to that same door with the link's `path`, `target="_self"`, so clicking inside the popup shows the next page wearing the system too; links to another host open a new tab, `<form>` becomes `about:blank`, `ping` is dropped ([`design-system-preview-links.js`](apps/tracy-web/src/sites/design-system-preview-links.js)). The host is always the site/demo server already resolved; `path` is only a path (starts with a single `/`, no scheme/host, no `\`, no `.`/`..` segments, no `%2e`/`%2f`/`%5c`/`%00` in the path part, ≤ 512 characters), and redirects are followed only within the same site. With `path`, every rejection is a small HTML page with the same status (404 `PAGE_NOT_FOUND`, 409 `NOT_A_PAGE`/`LEAVES_SITE`, 400 `PATH`, 401, 429). The cache key adds `path`; the demo door's key also adds the release checksum and the demo's publish port (a redeploy with the same version number still yields a new key). The CSP of both doors and the iframe `sandbox` in both popups: `sandbox allow-same-origin allow-popups allow-popups-to-escape-sandbox; frame-ancestors 'self'` — still no script, no form; `allow-same-origin` so a click inside the frame carries the session cookie (an opaque frame sends no cookie, measured on the stand 12/10).
**Cap:** the two preview doors (this one and `GET /api/sites/:key/design-system/preview`) share one budget of 30 requests/minute per account, counting every request, in a fixed 1-minute window in `rate_bucket` (`previewRateLimiter`, `lib/rate.js`); over it → 429 `RATE_LIMITED` + `Retry-After`, and the popup shows the *could not load* state with Try again.

**The system chosen in Add site travels with the site-creation request, and the server applies it** (12/10/2026). The *Pick a design system* card of the
Add site form sends the library id in the same `POST /api/sites {designSystem}`; the create door checks the id before creating anything (`checkSystem`
in [`design-system.js`](apps/tracy-web/src/sites/design-system.js): only systems currently offered, otherwise 400 `DS_UNKNOWN`), then
keeps the choice in the `site_create_design_system` table (migration 100: creator, system, provision job, `state`
`queued → applying → applied | skipped | failed`, `reason`, `apply_id`). The runner
[`design-system-at-create.js`](apps/tracy-web/src/sites/design-system-at-create.js) in `tracy-web` waits for the host's provision
job to finish (asking the host directly, not waiting on the browser), waits for the brief to finish writing the words (the `site_brief` row is still open and still heartbeating), then
`claim`s (one statement, one replica) and applies through **exactly the Design system door's write** (`applyAs`: same bytes, holds the write
lease, same `site_design_system` row and Site changes row with source Design system, the site creator as author,
`target.at = "create"`, Undo as usual). A template that cannot wear a system → `skipped` with a reason, the site is still created; a failed write →
`failed` with a reason, no retry (site busy: asks again at most 6 times). The job poll door says `running` with the step
`applying your design system` until the row closes, then `done` with `designSystem {id, name, state, reason?, applyId?}`; the form
draws the line *Applying <name>*, and on failure keeps the ready screen with Try again. A process that dies midway: the cron tick
(`designSystemSweep`) finishes `queued` rows silent for more than 4 minutes; an `applying` row is never written again — `applied` if the door
already has a `site_design_system` row for that system, otherwise `failed`. The tab no longer applies by itself; reloading or closing the tab does not lose
the choice.

**WordPress in both preview doors** (12/10/2026: all three CMSs). WordPress does not serve the variation file that the apply
writes: it prints the variation (merged with the theme's `theme.json`) into a `<style id="global-styles-inline-css">` block and the fonts into
`<style class="wp-fonts-local">`. So the preview door does that same merge inside that block
([`design-system-preview-wordpress.js`](apps/tracy-web/src/sites/design-system-preview-wordpress.js)): it removes the theme's
`styles.css` (reading the theme's `theme.json` on the same web container, which WordPress prints verbatim) or the variation the site is wearing (opening with
`/* tracy-ds-slot:`), then writes at the end of the block the preset/custom variables, element styles (WordPress 7.1 selectors) and the variation's
`styles.css`; fonts as `@font-face` like `wp_print_font_faces`. The page must load the contract's theme, otherwise nothing is built.
Measured 12/10/2026 on JA Essence WP 1.0.17 (WordPress 7.1.3): compared with WordPress's own output for the same variation (read-only `wp eval`,
variation as user data), 4 systems (Moxie, Notion, Airbnb, Toggl Track) × 1280/390 px, 690 elements × 17 computed
properties: 0 differences. The demo door judges the WordPress contract by template like `supportForNewSite` (`quickstartContractOf`). Known remaining
difference: on a site already wearing a system, any field the new system leaves empty keeps the old system's value in the preview, while the real site goes back to the theme value.

**The chat path to design systems — exists, but is OFF** (11/10/2026: "for now, enter only through the Design system button").
The `/ops` › User Interface switch **`chat-design-system`** (off by default, same group as `toolbar-design-system`) decides
for both the page and the agent: when off, the *Use this inspiration* button of the preview box is not drawn; the host plugin reads the switch at
Tracy's `GET /api/ui` (`switchesAtTracy`, `@tracy/core/ui-switches`; unreadable = off) so
`tracy_design_propose`, the door `POST /api/tracy-design-inspiration/choose` and `tracy_site theme.style` from chat reject with
`CHAT_DESIGN_SYSTEM_OFF`, and the site context block has the line `- Design systems through the chat: OFF`; the door
`POST /api/sites/:key/design-system` rejects calls from a conversation (grant `actor` or carrying `x-tracy-session`) with 403
`CHAT_DESIGN_SYSTEM_OFF` (`uiSwitchOn`, unreadable → 503); Help and the rejection message point to the Design system row. Turning it back on = one click
(`PUT /api/ops/ui {"switches":{"chat-design-system":true}}`): when on, the agent applies through the `tracy_design_system` tool
(`tracy-site-tools`, deferred along the design path; only accepts `refero:<uuid>` ids) — **exactly the tab's door**, same bytes, same
Site changes row, same Undo.
Not covered by the switch: choosing a design when **creating a new site** (Add site, Create with), WordPress Build `style` (the loopback
door), and editing individual elements within the worn slot.

**Tokens of a chat turn on a site** (20/10/2026). `tracy-site-tabs` reads usage from the turn's own
`assistant/message` and `assistant/attempt` settlements, then sends a `usage` snapshot through the existing `/moment`
door. `door-follow-up` keeps the snapshot with the job, and `closeTurn` writes `site_turn.token_usage`; the source's event
sequence decides which snapshot is newer, so a retry does not add twice and redelivering an old snapshot does not overwrite a newer one.
dsh's `inputTokens` is uncached input; cache read/write are separate parts, and reasoning is already inside output.
`GET /api/ops/beta/customers` sums `totalTokens` by the person who opened the turn, with the same whole-history scope and demo exclusion
as Requests; it returns both the number of turns with a measurement and the number with a missing measurement. `NULL` means not measured; a 0 must come from the provider.
The Signals screen labels it `Tokens (site chat)`; it does not include site builds, the `/help` assistant, speech or secondary model calls.
History recovery: [`backfill-turn-token-usage.mjs`](apps/tracy-web/scripts/backfill-turn-token-usage.mjs)
reads copies of the active + archived V4 logs, report-only by default; only `--apply` plus a `--site` list writes.
It only matches the exact session/turn/site folder; contradictory copies, unsupported generations and live measurements already present are never overwritten.

## 6. Backup and restore

A restore point = a git tag `tracy-release/vN` on the webroot **plus** the database dump of the same job
([ADR 0024](docs/adr/0024-backup-is-a-complete-restore-point.md),
[`backups.js`](apps/tracy-web/src/sites/backups.js)). It is called `full` only when the host can prove
the dump still exists and its hash matches; "restore everything" is offered only for `full` points. Execution on the host:
`webroot-backup.sh` and `provision/restore.sh`. Artifacts live in R2; `tracy-web` only signs URLs and does not
carry bytes. The Export site as ZIP entry in the ••• menu creates a new backup point through the existing backup door, then
the host packages that point (EmDash includes the app source, SQLite and uploads) under the same site/heavy lock. The
export doors only report status; before a download link is signed, the Owner receives an OTP by email and sends it back through the
`…/code` and `…/download` doors. The 10-minute challenge lives in Postgres (`backup_export_code`, migration 120)
and is single-use. The export doors are on by default; `BACKUP_EXPORT=off` is the kill switch. A `ready` ZIP is deleted from the store after 24 hours; the ZIP of a `failed` export is deleted at the moment it fails, and an hourly sweep retries until the store answers (`backup_export.object_deleted_at`, migration 121).

**Table snapshots inside the copy's DB** (24/10/2026). `db.snapshot` of the Claude Cowork engine (Joomla) copies tables
to `_tracy_snap_<tag>__<table>` right inside the site's DB; only `db.rollback {tag}` reads them (Sync from live, backup,
export and restore all skip them; chat-turn undo uses backup points). The host cleans them up following
[`lib/copy_snapshots.py`](packages/fleet/tracy-fleet-operation/scripts/lib/copy_snapshots.py): **by tag, never
part of a tag** — tags older than `TRACY_SNAP_KEEP_DAYS` (7 days) have the whole set `DROP TABLE`d, except the `TRACY_SNAP_KEEP_NEWEST` (1)
newest tag; names whose date cannot be read are kept as they are; `_tracy_trash_*` is not touched. It runs in two places, always through the `db` container
of the stack itself (never reaching the customer's real site): the retention step of every backup (`tracy_backup_prune` →
`tracy_snap_sweep`, under the site lock + heavy lock — so also every Sync from live apply and every restore), and the daily
clock of `tracy-host` (`sync.js` → `tools/sweep-copy-snapshots.sh`, site lock taken without waiting: a busy site is skipped).

### Sync from live — an imported site takes in changes from the real site (20/10/2026)

Only for `origin='migrated'` sites on Joomla (WordPress waits for its own adapter; EmDash has no Import). The Owner clicks
**Sync from live** (the site's ••• menu) or **Sync from live, then export** (the Export dialog). The
`site-sync-from-live` switch in `/ops` › User Interface hides both.

- **Door:** `GET|POST /api/sites/:key/sync` (toolset
  `lifecycle`). One `site_sync` row per run (migration 143) — it keeps neither the token nor the address of the real site.
- **Token:** since 20/10 the copy has its **own** Claude Cowork token — tracy-web generates a token for each import, provision writes
  it into the copy's DB right after loading the DB (step 4b), and when attaching the door `site_component` keeps `liveEndpoint` + `liveToken` separate
  from the copy's `token`. The real site's token only travels to the host in the job body, then into the script through an environment variable.
  Copies imported earlier (still holding the real token) get their token changed before their first Sync (`webroot-sync.sh --op copy-token`).
- **Host:** the `webroot-sync` job runs `webroot/webroot-sync.sh`: reads the real site with `lib/live-pull.mjs` (the
  Import protocol, inline tar part, straight to the host disk, **outside** the heavy lock; the tables the merge never takes —
  `live_sync.py never-taken`, Tracy's own and the ignored ones — keep the last read's part and are not read again; the dump is
  one gzip member per table with `<dump>.index.json`, so an unmoved table is copied as it is, 2026-10-27; a big table
  keeps its range checksums in `<dump>.ranges.json`, and when it moves only the ranges that moved are read again —
  claude-cowork `db.range_checksums` + `db.dump_after`, 2026-10-28) → normalizes the read the way provision did for the copy
  → three-way merge with `lib/live_sync.py` (base = the previous read at `refs/tracy/live` + `sync/live-base.sql.gz`,
  otherwise the import archive, otherwise `tracy-baseline` + v1) → the result becomes a backup point
  (`webroot-backup.sh --op create-from`, trailer `Tracy-Backup: sync`) → **Restore everything** to that point (the
  "Before restore" point is the way back) → rebuild the nested set, assign content identity, clear cache, copy files > 50 MB.
  The sync's restore runs `--only-tables` (23/10/2026): it only loads and swaps tables whose `CHECKSUM TABLE` differs between the point and the
  copy (cutting the dump with `lib/dump_tables.py`, loading in parallel with the "Before restore" copy); other tables, their triggers and
  the session table stay as they are. The Restore button in the Backups tab still swaps the whole DB. Live reads load into
  scratch schemas over several connections (`tracy_db_load_dump`, `dump_sections.py split`: 2 + 2 in the merge, 4 for the
  preview's base; 2026-10-27). The two reads load beside the copy's dump (`load_reads`, in the background), not after it. A machine runs
  `TRACY_HEAVY_SLOTS` heavy webroot jobs at once (default 2; `lib/heavy-slots.sh`, slot 0 the old lock file).
- **Conflicts: Tracy's version wins** (20/10/2026). Where both sites edited the same thing differently, the copy's version is kept —
  files with `git merge-file --ours` (colliding hunks take Tracy's, the rest of the live file still comes over), DB with
  the copy's value/row — and listed in `kept` with the live-side value; the Export dialog shows that list once
  done. No one has to choose.
- **Both sides created new records with the same id:** in core Joomla tables (articles, categories, menus, modules, users, tags, assets,
  `history` versions, the 404 log `redirect_links`) the customer's record gets a **new id** and everything pointing to it follows —
  including text columns such as `fields_values.item_id` (filtered by `fields.context`) and `history.item_id`
  (`com_content.article.<id>`); renumbered tables are remembered in `sync/id-map.json` for later runs. In extension tables the merge cannot renumber, or when an extension table points to an id just changed: the sync run
  **stops before applying** (`needs_resolution`, list `held`), and only after a person reviews and clicks "Sync anyway" (`allowHeld`) is
  Tracy's version kept there.
- **First run after import (22/10/2026):** at import, dsh takes the live `site.fingerprint` right before reading and
  sends it with provision; tracy-web keeps it at `site_component.config.importFingerprint` (next to the live token), and hands it to the first
  sync run (`baseFingerprint` → the host writes `base-fingerprint.json` next to the run); while no run has applied yet, comparison is
  against it. Tracy's files on live (`TRACY_ONLY`: the engine, its plugin, Tracy sign-in) are never
  read — the merge always keeps the copy's version. `apply` compares the copy by **substantive checksum** (`live_sync.py checksums`:
  ignoring self-changing columns, ignoring session/log tables), so someone viewing the copy during a sync does not cause `COPY_CHANGED`.
- **Quick check first (Claude Cowork Joomla 0.24.51+, 21/10/2026):** `site.fingerprint` — a size+mtime digest of the
  webroot over a fixed set of pages + `CHECKSUM TABLE` per table — is compared with the fingerprint taken before the last applied read
  (`sync/live-fingerprint.json`). All match (except the `session` table) → returns **applied, nothing new** at once: no
  read, no lock, no merge, no backup point, no restore; audit `site.sync.unchanged`, no write stamp.
- **Reading the real site:** the DB is read with `db.dump_many` (many tables in one request) when the engine has it. Engine with checksums: read
  **once**, and any table whose checksum changed during the read is re-read on its own; without: read **twice** and compare
  **row by row** (tuple digest, independent of how INSERTs are batched), except the `session` table; still changing → stop with `LIVE_BUSY`.
  The webroot is read in full on the first run (`files.pack`); later runs compare against the previous run's manifest (`sync/live-manifest.json`):
  engine 0.24.51 lists size+mtime (`files.list {hash:false}`) and hashes only changed files (`files.hash`), older engines
  list the sha1 of every file; only new/changed files are read (`file.read`, hash re-checked), a missing file means deleted, and the list is taken a
  second time to catch files changed during the read. If a protected file (`configuration.php`) changed, the whole tree is read; `configuration.php`
  is always merged setting by setting. An older engine whose read shows every DB table and file unchanged from the previous run → also returns "nothing new".
- **Joomla's append-only log tables** (`action_logs`, Joomla 3's `ucm_history`, `messages`, `scheduler_logs`): when both sides added
  the same id, the copy's row is kept and the sync does not stop; the run timestamps of `scheduler_tasks` are self-changing columns.
- **While running:** the site's write lease belongs to the sync (`sync:<id>`), and the agent's Apply is told someone is writing;
  if the copy changes outside the door between merge and apply → `COPY_CHANGED`. Every click and result is written to `audit` (`site.sync*`, without
  any of the site's values). Files written by sync (and Restore everything in general, `restore-reset`) are chowned back to the
  webroot's `uid:gid` like `webroot-push.sh`. A real site that keeps changing during the read → `LIVE_BUSY`, not wrapped as
  `LIVE_READ_FAILED`.
- **Cut off by a deploy:** a tracy-host restart marks the job `orphanedAt`; tracy-web records
  `SYNC_INTERRUPTED` ("the server was updated, sync again"), and the lease is released at once. Around the step that sets the result,
  `webroot-sync.sh` writes `sync/applying.json` (the commit and DB checksum of the copy when the merge read it, the commit and DB checksum of the
  point about to be set). The next merge/apply/sync run cleans up **first** — under the same lock, before scanning the run folders and before
  reading the real site — and only on evidence: nothing of the point reached the copy → drop the marker, leave the copy as is (including edits after
  that); only the sync's writes are there → Restore everything back to the "Before restore" point; the copy was edited further after the cut → write
  nothing, report `APPLY_INTERRUPTED_KEPT` once (the "Before restore" point is in Backups); fully set → finish the base part
  and the Joomla work that must be redone, copying large files only where the copy does not have them yet. Sync is never re-run automatically.
- **Retention:** the host keeps the last read of the real site (`sync/live-base.sql.gz` 0600, `live-manifest.json`,
  `live-fingerprint.json`, `refs/tracy/live`) as the base for the next run; each run's folder is deleted after apply, and swept after 24 hours. A site not synced for **30
  days**: tracy-web's hourly cron tells the host to delete that read as well (`webroot-sync.sh --op forget`,
  `site_sync.forgotten_at`); the next run reads from scratch, with the import archive or the build as base. Host disk encryption is an
  infrastructure job, not covered here.

### Sync to live — pushing Tracy's changes on the copy back to the real site (phases 1 + 2)

The host part; job contract: [`scripts/webroot/LIVE-PUSH-CONTRACT.md`](packages/fleet/tracy-fleet-operation/scripts/webroot/LIVE-PUSH-CONTRACT.md).

- **Writes only through engine actions** (`content.update`, Joomla `content.batch`, `content.delete`,
  `media.upload`, Joomla `media.delete`; `site.identity` and Joomla `template.siteSettings` `operation: set`;
  `template.files.write`/`undo` when the engine has them — also reading `info.template_files` and `template.files.status`; reads via
  `content.get`, `file.read` and `operation: read` of those two doors): no new actions, no raw row writes. The kinds and fields
  that can be pushed are the engine writer's whitelist, kept in `lib/live_push.py`.
- **Phase 2 — files and settings:** files under directories `media.upload` can write (Joomla `images/`, `media/templates/` — J4/J5 template
  CSS/JS lives in `media/templates/site/<tpl>/`; WordPress only existing Media Library images), CAS by blob (the live file
  must be exactly the base blob); PHP files only after `php -l` on the real site's PHP (image `joomla:php<ver>-apache`, `--network
  none`) and a separate owner tick (`confirm.php`). **Template/theme files** (Joomla `templates/<tpl>/` and
  `media/templates/site/<tpl>/` of the installed site template, WordPress running theme + parent theme) go through the engine's template door
  `template.files.write` (in batches within the `info.template_files` limits, CAS by base blob, all or nothing;
  Undo `template.files.undo`, new files are removed) when the engine on the real site has that door and the owner turned it on; PHP only when the owner
  turned on "Allow PHP in template files" (WordPress "Allow PHP in theme files"), otherwise listed as `php-disabled`. Engine
  without the door → `engine-has-no-file-write`; owner turned it off → `template-files-off`. Settings: Joomla site name/description
  (`site.identity`), template style params (`content.update templateStyle`), T4 profile / favicon file
  (`template.siteSettings`); WordPress: options (including site icon, timezone, comments…), theme mods of the running theme
  (writing the whole option, CAS on the whole option), Additional CSS (post `custom_css`). Permalinks are never pushed. Places where sync kept
  Tracy's version for **files and configuration settings** also go into `sync/kept.json` (names only) and become `changed-on-both`.
  `sync/pushed.json` adds `files`/`settings`: the file merge takes the live version of a file just pushed (`ours`), and keeps the copy's version after Undo
  (`theirs`) — `live_sync.py files --pushed`. Deleted files are recorded with `ours: null`; Undo restores live while the copy keeps its deletion, so the next preview offers that deletion again.
- **Jobs** `webroot-live-push-{preview,apply,undo}` run `webroot/webroot-live-push.sh`; the live endpoint + token travel only through
  environment variables, as in sync. **preview** runs Sync from live first (stopping with `SYNC_NEEDS_ATTENTION` when the sync is held), then
  under the site lock computes changeset = copy − base (`sync/live-base.sql.gz` loaded raw into a temporary schema + `refs/tracy/live`),
  ids translated through `sync/id-map.json`, WordPress addresses changed from copy to live; what cannot be pushed is listed as
  `unsupported`. **apply** checks that the copy/base/id map have not changed since preview (`PREVIEW_STALE`), then `lib/live-write.mjs`
  writes item by item: `content.get` first, writing only when every field still holds the base value (CAS; Joomla in batches via
  `content.batch` with `expected`), otherwise `conflict`; at most 200 items; deletes only when the owner confirms. Places where a
  sync run kept Tracy's version even though the customer also edited (`sync/kept.json`, names only, no values) are
  `changed-on-both`, never overwritten. A whole table kept after a schema change holds every push item whose seeds write that table, including creates and deletes, while unrelated tables remain available.
- **WordPress menu addresses:** existing menu-item updates and deletions retain the base menu slug as their CMS key alongside the mapped live item ID, so subsequent writes and Undo use the native menu writer address.
- **Replacement addresses:** a WordPress delete that frees the same slug in the same post type/parent scope is a prerequisite of its replacement. Unconfirmed or conflicting deletes block that create. Undo removes the replacement first and restores the original slug; a customer-edited replacement holds both records. Joomla trash keeps aliases occupied, so both sides of a same-alias replacement are held before writing.
- **After pushing:** live ids of newly created records go into the id map, and the places written go into `sync/pushed.json`; Sync from live runs again
  and the merge takes those places as base before comparing (`live_sync.py --pushed`, `DbMerge.seed_pushed`), so a record Tracy
  just created is not copied back to the copy twice. `pushed.json` is dropped when a sync run puts its read in place (`remember_read`).
- **Optional CMS schema:** dependent-row rules are used only when their parent key, parent reference and dependent column exist in both schemas. Stock Joomla contacts and banners do not need an asset_id column. The Live Sync Integration workflow runs the real MariaDB sync/push suites on an isolated GitHub-hosted Docker VM; skipped cases fail that job.
- **Live access refusals:** both sync directions distinguish HTTP password protection (401), firewall/non-engine responses (403 or non-engine HTTP 200), rate limits (429), and an engine-refused token. Read retries respect numeric or HTTP-date Retry-After; rate limits never trigger an alternate-door request. Mutations retain the durable receipt rule and do not resend an uncertain response.
- **Retention:** `<private>/<label>/push/previews/<id>/` (changeset; swept after 24 hours), `<private>/<label>/push/<id>/`
  (`before.json` 0600 = the live values at write time + a re-read after writing, `journal.jsonl` to resume when cut off; 30 days).
  Before each mutation, `requests.json` durably stores its item identity and preimage, then stores the engine ACK before
  read-back. Resume recovers acknowledged writes and their Undo evidence without sending them again. A lost answer,
  interrupted write or incomplete rollback is `WRITE_OUTCOME_UNKNOWN`: no automatic resend and dependent items stay held.
  Only an explicit `writer_busy` refusal retries a mutation; transient reads still retry. Apply and Undo share an OS lock
  per push directory; Undo keeps separate receipts in `undo-requests.json`. Receipts and snapshots are private (0600).
  A stopped apply drains in-flight writes before saving its complete partial result in `written.json`. The shell still records
  acknowledged live IDs and reports the written/conflict/failed/skipped lists with the error, so the failed push remains undoable.
  **undo** is a reverse CAS: it restores "before" only where live still holds exactly the value the push left; the copy keeps Tracy's changes.
- The web door, lease `push:<id>`, owner-only, switch `site-sync-to-live`, audit: on the tracy-web side.
- Screen (25/10/2026): one flow of the Publish tab (`@tracy/core` `site-tabs/publish/PushStep.tsx`, Review › Send), opened from the Sync to live row of the ••• menu or by choosing "Send changes to your live site" in the tab; the old My Sites dialog was removed.

## 7. Where data lives

- **Postgres**: every app table, migrations in
  [`apps/tracy-web/src/db/migrations`](apps/tracy-web/src/db/migrations). Main groups: identity
  (`identity`, `otp_code`), seats and workspaces (`seat`, `workspace`, `invite`), sites (`site`,
  `site_component`, `site_build`, `site_design`), changes and comments (§5, `site_comment*`),
  `quickstart_releases`, `template_readiness` (results of the Customize your site check for each release, §8),
  `template_ds_readiness` (results of the Design system check, same shape, §8),
  `ui_setting`, `speech_setting` (the ElevenLabs key for voice input, sealed with `secret-box.js`), `notification*`, `audit`, `site_brand_upload` (logo/favicon customers upload before a site exists, §8).
  `account_seen_hint` keeps the seen marks for step 2 of the tour (`site-tour`) and the voice hint (`voice-tip`), primary
  key `(account_id, hint)`, first time `seen_at`, deleted automatically when the account is deleted; the closed list of names
  is checked at the write door and by an SQL constraint. The existing `assistant_tip_seen` still keeps the separate `/help` hint.
  Website Opportunities (migration 125, §8): `wo_preference`, `wo_opportunity`, `wo_job`, `wo_job_attempt`,
  `wo_source`, `wo_media`, `wo_profile`, `wo_revision` (immutable, a trigger blocks UPDATE), `wo_build`. Migration 126: `wo_media.caption/alt/dhash/labels`, `wo_build.pictures` (immutable picture plan + receipts).
  Migration 175 (`/v1/demos`): `wo_public_demo` (one request: `Idempotency-Key`, fingerprint of the whole body, body snapshot, opportunity + demo action, `sponsored`/`reserved_cents`, cancellation), `wo_sponsor_setting` (one row: number of live demos per account, model budget), `wo_demo_usage.kind` adds `external`.
  Migration 134 (shared research, P1): `wo_place` (one real place, `current_snapshot_id`),
  `wo_place_identity` (google/osm/url/merge/tripadvisor → place), `wo_place_link` (the place's sources with evidence: identity, Google `websiteUri`,
  social links the place's own website points to — URLs sent by the client do NOT go here), `wo_place_job` (one research run per place, lease/fence like
  `wo_job`; at most one running + one queued), `wo_place_snapshot` (preparing → published atomically in a transaction that checks the lease |
  failed | superseded) + `_source` (`collected_at` = last successful collection, `attempted_at`, `last_error`) + `_media` + `_profile`,
  `wo_place_media` (key `places/<place>/<sha>.<ext>`, provenance, immutable except `revoked_at`/`revoke_reason`, never deleted),
  `wo_media_analysis` (vision labels by sha+model+key, claimed before the call). New columns: `wo_opportunity.place_id`,
  `wo_job.place_job_id`/`result_snapshot_id` (the account's request, state mirrored from the place job), `wo_revision.place_snapshot_id`/
  `profile_effective` (the manifest points to `wo_place_media` by id+sha, `origin: 'place'`; older revisions read `wo_media` as before).
  Migration 168 (Research again): `wo_place_job.again_plan` — a run only revisits the parts
  that failed on our side / are older than 30 days / were never tried / whose rules changed; the scope is computed by [`website-opportunities/src/research-again.js`](packages/wo/website-opportunities/src/research-again.js)
  (one function for the three preview doors: the place card, /ops, `/find`, and for the run) and then frozen into the job; the run only drops parts that have
  expired, never adds. The step that searches Facebook/Instagram via web search is the `facebook-search`/`instagram-search` part with its own `_source`
  row and runs on `sourceDue` like every source. A partial run that finds nothing new (snapshot `superseded`) still copies the attempt
  info to the current snapshot.
  Migration 170 (Menu): `menu-file` (a menu file/page read as text) and `menu-photos` (menu photos
  read with a vision model) are two research parts with their own `_source` row, version and Try again, only for food and drink places
  (Google type, or a place that already has dishes). One photo-reading rule for every door ([`menu-photo-reading.js`](packages/wo/website-opportunities/src/menu-photo-reading.js)):
  at most `menuPhotosPerPlace` photos per place (`/ops/wo` › Settings, default 24, 0 = off), results keyed by the SHA-256 of the photo bytes
  so a photo already read is not read or paid for again, and the version follows the reading method (prompt + model), not the limit. Dishes from a file
  win over duplicate dishes from photos. Place details (customer and /ops) return `menu`; the three Research again doors accept `parts` (Read menu again =
  the two menu parts).
  Migration 135: `wo_cost_ledger` — the research costs Tracy pays (`opportunities/cost-ledger.js`): every billable call reserves against the cap before calling, a Tracy-wide UTC daily cap + a per-job cap (`/ops/wo` › `researchDailyCapCents`/`researchJobCapCents`), failed calls kept as `unreconciled`.
  Migration 152 adds nullable account/action/build to link the editorial phase, without adding another money ledger.
  `reserve(spec,{onAdmitted})` keeps the receipt checkpoint and the reservation in the same transaction/monetary lock;
  it keeps campaign kill/budget/attribution and checks the real lease before/after the hook, including on replay. The frozen account/day cap
  and job cap can tighten further; `minRemainingCents` checks headroom under the same lock and does not reserve money
  for the future. The factory scope only limits ledger mutations by account/job; total spend is still deployment-wide;
  it is not isolation for the DB/runtime. The `headroom()` forecast is read-only. The schema is additively compatible when
  editorial migration 148 has already added the columns; check the upgrade in both directions before wiring the runtime.
  `opportunities-build/snapshot-media.js` is the core reader for immutable snapshot exports, with no HTTP/token
  or runtime wiring yet: the factory takes export bytes/hash, authority/binding, a trusted grant resolver and the
  existing DB/objects; `check(mediaId)` returns receipt metadata/cache validation, `read(mediaId)` returns
  bytes only after the checks. A grant is bound to the actual account/opportunity UUID and the exact export/place/snapshot/media/sha/
  expiry; it re-reads canonical membership/status/revocation/hash before and after the object read. Byte limits,
  MIME/sha and image decode/dimensions at most 8192; it exposes no object key/URL and does not require the current pointer,
  so an older superseded published snapshot can still be read while the grant is valid. Default timeout 15 seconds, maxBytes
  no more than 25 MiB; an abort fence blocks later stages, but the DB/object dependencies cannot yet physically cancel
  an in-flight call. The gateway owner must account for concurrency by real in-flight calls, not only the caller timeout.
  The consumer owns auth/grant/gateway/cache/import; this core grants nothing, activates no runtime,
  and does not deploy canonical 8443 or build another ledger/collector.
  Migrations 136–137 (P3/P4): `wo_place_merge_candidate` (place URL ↔ Google pairs; certain = the URL or the URL after redirect is the only Google link → `approved`, applied automatically when both are idle; several Google entries with the same domain → `pending`, waiting for an operator; `applied_at`), `wo_place_ops_event` (who did what to a place), `wo_place_backfill` (backfilling old research by place: done/skipped/retry + source opportunity/account), `wo_place_media_legacy` (`wo_media` → `wo_place_media`, old key kept). A merge = the losing place becomes a tombstone (`merged_into`, keeping identity/snapshot/media), done in one place: [`website-opportunities/src/place-merge.js`](packages/wo/website-opportunities/src/place-merge.js); backfill + the merge queue run in the WO tick ([`place-maintenance.js`](packages/wo/website-opportunities/src/place-maintenance.js)), copying objects, never deleting.
  Discord members who have proven their email (`discord_link`, `discord_link_code`, §9).
  **Real-usage measurement** (17/10/2026, [`ops/usage.js`](apps/tracy-web/src/ops/usage.js)):
  no table of its own. `/ops` › User Data Analytics › Usage (`GET /api/ops/usage`) reads `site_turn` (plus `steps`, `calls`,
  `failed_calls`, `visual`, `visual_note`, migration 114), `site_write`, `site_operation`, `site_brief` and two new kinds
  of `ops_signal`: `site.entered` (the workspace door serves a site's page, once per person per site per half hour) and
  `wizard.opened` (the Add site wizard opens, `POST /api/sites/wizard`; Create carries the same `wizardId` into `site.create`).
  Customers' verbatim words are only read through `GET /api/ops/usage/turns`, for addresses in `USAGE_TEXT_READERS`, one
  `audit` row per read.
  Since 22/10/2026, Usage shares the UTC+7 day period with User Growth, with a previous period of the same observed length,
  a daily series and per-customer totals (metadata only; no added chat text). The CMS, staff/customer and demo filters
  apply the same cohort to requests, customers and new sites. The form opens before CMS/demo is known, so the form-open count and
  conversion to Create follow only the day period and the people group, with their own declared scope. `closed_at` is the end
  mark for duration, follow-up, rework and undo; `close_filed_at` is only when the job was filed, never used
  in its place. The immutable `site_demo`/incarnation separates the history of deleted demos and reused hostnames; missing
  classification is excluded from the default and reported as an unknown count. Undo from Site changes is only attributed to a request in the same
  incarnation and SHA; a single-row restore/undo is counted independently of new requests in the period. Write outcome
  unknown and answers that hit a limit are separated from completion with no confirmed change. Returning
  needs two different visit days; a missing build duration is not read as instantly ready. No new store,
  telemetry or write action; the chat-text read door is still only USAGE_TEXT_READERS and writes audit as before.
- **New-customer growth analysis** (`GET /api/ops/beta/customers`, 22/10/2026): `growth` reads the whole
  filtered first-sign-in cohort, before the 200-row limit of the customer list. It excludes staff, demos and history
  that cannot prove its demo classification. `ops-signal-growth.js` links milestones by the exact person and site
  incarnation: sign-in → self-created/imported site → ready result `done` → that person's own chat request on the same
  incarnation → `site_write.outcome=ok` with the exact `turn_id` or the committed files of the closed turn. A deleted site keeps its
  historical milestones; a matching hostname alone is not enough to link a request. Follow-up time runs to `readAt`, not cut at
  the end of the acquisition period; median time is shown only when at least 20 people have completed, nearest rank
  as in Usage. Cohorts by Monday week in UTC+7; week 1–4 retention uses day windows 7–13, 14–20, 21–27,
  28–34 counted from each person's sign-in date, and only people with the full window enter the denominator. Two definitions
  of return are kept separate: page presence (`ops_active_day`, does not prove work) and non-demo chat request
  (`site_turn.actor`, including sites the person does not own). Channel/source/campaign comparison uses the attribution
  of the first sign-in, the same unlimited cohort and the same funnel milestones; recipient attribution is not inferred.
- **Aggregate desktop analysis** (`GET /api/ops/app-statistic`, 22/10/2026): `analytics.desktopGrowth`
  of `app-statistic-growth.js` uses the same read snapshot. The funnel keeps one unit: app copies connecting to the
  updater in the filtered set → copies currently linked to an account → an immutable app-open proving that exact linked
  account. Downloads are not linked to copies because the download recorder stores no join key. Platform/
  version distribution covers all filtered copies (users/installs) or download requests (downloads), before pagination,
  keeping Unknown in the denominator. `first_seen` gives new copies per day, with current attributes, separate from the
  latest connection window. Adoption takes the version recorded right on `desktop.app_opened`, the first matching open
  of each copy per UTC+7 day; it is not backfilled from the current updater version. Unmeasured days, days with no
  events, the collection start date and the current channel limit are all explained. Quickstarts returns
  `desktopGrowth: null` because it is not the same desktop dataset.
- **Desktop opens by user action** (version 0.6.1 onward, 22/10/2026): when the app window opens/gets focus it
  sends `POST /api/desktop/installs/opened` through the app's own session, at most once per install per
  UTC+7 day. A queue on the machine keeps unsent signals while offline for up to 90 days; retries keep the original
  open time. The server only accepts the existing install UUID, version, platform and time (512-byte cap), and takes
  `account_id` from a valid session cookie if there is an account; it accepts no identity from the body, and does not attribute an anonymous open to
  someone who once linked the install. One `ops_signal` row of kind `desktop.app_opened`,
  `occurred_at` is the open time, `data` holds only `installId/version/platform`; a unique `dedupe_key` by UUID
  and UTC+7 day prevents duplicates even with concurrent sends. No new table, no content, plans or email stored,
  no Telegram notification. `rate_bucket` uses the same fail-closed mechanism as the desktop doors: at most
  120 requests/install/hour and 600 requests/client-address hash/hour, keeping no raw IP. Timestamps older
  than 90 days or more than 5 minutes in the future are rejected; a failed DB write returns 503 so the app retries. The background
  update check is still only `desktop_install.last_seen`, which does not prove the app was opened. The desktop has no separate
  telemetry opt-out switch yet; the signal follows the data limits above and adds no identifiers.
- **Site folders** on the host (`TRACY_SITES_ROOT`): each webroot is a git repo, mounted into
  `tracy-dsh` at `/site/<label>`.
- **Site notes** (what the customer asks the agent to remember for later conversations): `<TRACY_SITES_ROOT>/.site-notes/<label>/`
  (`notes.md` + `log.md`), next to `.site-facts` and `.content-contracts`, **outside** `<TRACY_SITES_ROOT>/<label>` so
  the agent's file tools (path fence `FS_TOOL_ARGS`) cannot reach them. **The agent has no tool to write them**: the dsh host
  writes ([`site-notes.mjs`](packages/tools/tracy-site-tools/src/host/site-notes.mjs) `captureWishes`). When the customer's
  message shows signs of a lasting instruction, `tracy-site-tools` makes **one secondary LLM call** on the same model as the
  conversation (thinking off, ≤ 400 output tokens), in parallel, without blocking the agent's step. A suggestion is kept only when it
  quotes exactly a sentence the customer typed (words from a page the customer points to are excluded). The secondary LLM's tokens are logged in the store's `log.md`.
  The notice sent back to the agent is read from here, one store per site. There is no copy in the site folder. It is not site
  content: content is still read live from the CMS (ADR 0021).
- **R2** (local: MinIO): artifacts, webroot tarballs, comment attachments (`comments/<label>/`), logos/favicons
  customers upload (`brand/<account>/`, outside the `sites/<label>/` prefix that the artifact door lets seats read/delete).
  Downloaded Website Opportunities images/videos: `opportunities/<account>/<opportunity>/<sha256>.<ext>` (owner-only read, through the media door);
  from shared research: `places/<place>/<sha256>.<ext>` (kept by Tracy, belonging to no account; read through the media door when the account
  has an opportunity for that place, built through the revision's manifest; `revoked` images are not read, not built, not handed off).
  Since 23/10/2026 (`PLACE_MEDIA_S3_*` set): new place images are written to an **R2 bucket shared by all deployments**
  `tracy-google-place-media`, content-addressed `media/google|other/<sha[0:2]>/<sha256>.<ext>` (`google/` = Google
  Places/Maps, including via SerpApi; `other/` = websites, social networks…). The media door picks the store by **key prefix**
  ([`place-media-store.js`](packages/wo/website-opportunities/src/place-media-store.js)): `media/` → the shared bucket, everything else → the artifact store;
  WO code never deletes in the shared bucket. Old `places/…` images are moved with
  `scripts/copy-place-media-to-shared-bucket.mjs` (copy, never deleting the source; old keys in `wo_place_media_rekey`).
- **Design system undo receipts**: `<TRACY_PRIVATE_ROOT>/<label>/ds-slot-undo/<id>/` (`before`, `after`, `manifest.json`) on
  the host holding the site, written by `tracy-host`'s `site-ds-slot` job (§5).
- **`/desk-home`** in `tracy-dsh`: dsh state, the seat door's ledger, model keys.
- **`tracy-host` jobs**: JSON files on the `tracy-host-jobs` volume; go-live jobs with a caller's
  key also have an acceptance marker `<id>.accepted` next to the record (§8, publishing a site). Provision jobs
  also take a key but have only the JSON record, no acceptance marker.

No more Supabase: OTPs live in Postgres, and mail goes through Resend
([`mail/transport.js`](apps/tracy-web/src/mail/transport.js)).

**Mail sender of an EmDash site at build time** (11/10/2026): the mail step of `platform/emdash.sh`
(`emdash/configure-mail.mjs`) fills `fromEmail` when the site has none. Order: the seat's email
(`ownerEmail` → `--owner-email` → `TRACY_OWNER_EMAIL`), otherwise **the site's own relay address**
`<label>@SITE_MAIL_DOMAIN` (`mailSender` → `--mail-sender` → `TRACY_MAIL_SENDER`). The relay address is
built in only one place, [`lib/site-relay-sender.js`](apps/tracy-web/src/lib/site-relay-sender.js) (also the
`fromAddress` of `/api/ops/mail`), and only the two paths with no buyer send it: demos
(`provisionDemo`) and the pre-built site inventory (`inventory/prepare.js`). It travels in its own field because `ownerEmail`
also creates the EmDash admin account (`mint-agent-admin.cjs`): a relay address is never a person.
Without `SITE_MAIL_DOMAIN` nothing is sent; the helper rejects with `NO_SENDER` rather than making one up.

**EmDash site forms mail no one** (25/10/2026): right after the mail step, `platform/emdash.sh` runs
`emdash/quiet-forms.mjs` (same conditions: on the host, the site's own address, PAT from a protected file). The template's forms
carry the template's recipients (`tracy-business`: `sales@northgate-ind.ru` on all 80 forms), so the helper removes the recipients,
turns off digests, drops the webhooks of every form, then reads back; submissions are still stored in the site for the owner to read. A site with no form plugin
has nothing to do; any other error means the site is not marked ready.

### Invitations: sandbox and real campaigns kept separate in Ops, no real mail sent yet

The real-customer campaign path has its own API `/api/ops/invitations/real`, mounted before the sandbox at the
composition root, using the same Ops admission and re-reading permissions on every request. Owner/admin read/edit PII;
after an upload or a wait for the campaign lock, permissions are re-checked inside the transaction; the seat's SHARE lock is held until
publish to serialize with revoke, and PII responses are re-checked before returning. No lock is held while reading the upload body.
Developers see only aggregates, without campaign names. The real UI lives in
[`RealCampaign.tsx`](packages/web/tracy-harness/src/invitations/RealCampaign.tsx), chosen separately from the
sandbox at `/ops/invitations`; the sender is not wired yet. Import preview/confirm keeps the five source groups and all
original columns; the paginated/searchable table uses a POST body; each customer's detail shows the raw source and draft.
Owner/admin configure manual text fields/column mappings, import five ZIPs by group and customize/approve
drafts. Changing a dependency/template/image drops approval but keeps customized text, and does not change eligibility.
A saved manual override is kept but not used when the field switches to a column; switching back to manual
restores the value, and a dependency change still drops approval. A new override input for a column is rejected.
Saving content keeps the pending state across both POST and GET refresh; responses are tagged with generation/group.
Replacing drafts runs in batches of 100 with a cursor and confirms each batch, not just replacing the first 100 people.
The HTML preview uses an empty sandboxed iframe, with a CSP blocking script/form/navigation/external resources; images already
checked on the server are loaded through an authenticated API and turned into in-RAM data images, with no persistence.
When permission is revoked, expires or the vault fails, customer data and previews are removed from the UI; late requests
are never mixed across campaigns/groups and never overwrite unsaved changes. This is code on a branch, not evidence
that it has been deployed or that real data has been imported.
CSV and ZIP go through two binary preview doors limited to 10 MiB; UTF-8 JSON metadata is URI-encoded
in the `x-invitations-input` header limited to 4 KiB, keeping PII out of URLs. The write doors still check
Origin/Fetch Metadata/session, JSON at most 1 MiB. Images are read only after permission/key/expiry checks, with `no-store`
and `nosniff`; unknown/send/simulate real all return 404, never falling through to the sandbox or a transport.
Migration `090-invitations-real-campaign.sql` adds the `invitations_real_*` tables
for campaigns, recipients, per-campaign HMAC identity, preview/receipt, templates, assets, drafts,
retention settings and a PII-free audit. Name/raw source/content/images live only in an AES-GCM envelope with AAD
campaign/record/purpose/version; no sign-in or Gmail secret is used.
[`real-store.js`](apps/tracy-web/src/invitations/real-store.js) locks the campaign, takes `clock_timestamp()`
after the lock and checks expiry/revision before the callback and before commit. Default setting 30 days,
1–365 days for new imports; an explicit extension before expiry cannot exceed 365 days from the first import.
An extension also checks the old DB/ledger expiry after vault IO before commit; if expired it rolls back/revokes.
CSV preview also holds the campaign lock, and its TTL never exceeds the DB/ledger expiry; expiry/revoke midway
rolls back rows and revokes the preview key. A new campaign's preview has its own 30-minute TTL.

The key store and ledger/tombstones of [`real-keys.js`](apps/tracy-web/src/invitations/real-keys.js)
live on a separate volume `invitations-real-keys`, mounted only into tracy-web at
`/var/lib/tracy/invitations-real-keys` (0700, files 0600); not in the image, R2, dsh or the PostgreSQL backup.
`INVITATIONS_REAL_KEY_DIR` is a non-secret path. Local needs a valid environment/origin;
the server override does not turn itself on, dev must be configured explicitly with `https://cowork.tracy.site`, staging/prod
are closed. Missing configuration does not block boot. The effective expiry is the earlier of the DB expiry and the out-of-DB ledger.
The hourly cron uses [`real-retention.js`](apps/tracy-web/src/invitations/real-retention.js), at most
20 campaigns per run; reads/writes reject expired data immediately, without waiting for the cron. Revoke/tombstone is durable before
the ciphertext is purged; an old DB backup does not bring back a revoked key. Losing the vault/key means losing the ability to open
PII, with no automatic regeneration or plaintext fallback; source CSV files are not changed/cleaned up per campaign.
An error on one vault UUID does not block sweeping the others; the DB audit records only error codes, no PII, and a check
timestamp helps the next round move on. Stale locks are never removed or recovered automatically by file age.

**Test sends (12/10/2026, part 1 of the mail-sending machinery).** [`real-send.js`](apps/tracy-web/src/invitations/real-send.js)
sends one customer's approved draft to **one address on the server's test list**
(`INVITATIONS_SENDING=test`, `INVITATIONS_TEST_RECIPIENTS`, `INVITATIONS_TEST_DAILY_LIMIT` default 50/24 hours;
outside local/dev it always reads as off). No door sends to customers. Order: check the list, approval, mailbox,
quota under the campaign lock; write an `invitations_real_send` row in state `sending` and commit; call Gmail
`messages.send` exactly once (a separate session advisory lock `724308098`, holding no transaction); write `sent`,
`failed` (Google clearly refused, or the call could not be made) or `send_unknown`. `send_unknown` is only reconciled
by searching for the Message-ID in Gmail (cron every minute, at the 1/5/15-minute marks, and the Check Gmail again button), never
re-sent; a `sending` row whose lock is free means the process stopped midway, and it becomes `send_unknown`. The mail
is built in [`real-mime.js`](apps/tracy-web/src/invitations/real-mime.js): From `ceo@tracy.ai`,
a subject prefixed with `[Test] `, CID-embedded images, header `X-Tracy-Test: yes`. The recipient and subject live in a `payload`
encrypted with the campaign key; the row is deleted with the campaign when it expires.

**Campaign lock in the vault (12/10/2026).** The file `<campaignId>.lock` records the holder
`{v, host, pid, boot, at}`. A tracy-web run removes a lock by itself only when it can prove the old owner is
gone: same `host` and different `boot` (a previous run), with `pid` equal to its own pid (container
restarted) or a `pid` that no longer exists. A removed lock is renamed to `<campaignId>.lock.abandoned-<uuid>`,
not deleted, to leave a trace. A lock recording a different `host` (container rebuilt on deploy), an empty lock or one that cannot
be read is left as is. On SIGTERM/SIGINT, the server closes its port and waits for every vault operation
holding a lock to finish (at most 8 s, cut at 9 s) before exiting, so a normal deploy leaves no lock behind.
The hourly cron logs `[cron] invitations campaign <id> key REAL_KEY_BUSY` (plus "expired data not yet
erased" when the campaign is past expiry) on every run until it is removed.

Removing a lock by hand (only when the log above repeats): (1) `docker exec <tracy-web> cat
/var/lib/tracy/invitations-real-keys/<id>.lock` to read the lock holder; (2) check that no other tracy-web process
uses this volume (`docker ps`, only one tracy-web container); (3) `mv <id>.lock
<id>.lock.abandoned-manual-<date>` in that folder, never delete; (4) the next cron run re-reads the lock and,
if the campaign is past expiry, revokes and purges as usual. Never edit `key.json` or `ledger.json`.

[`invitations/import.js`](apps/tracy-web/src/invitations/import.js) (`previewRows`) checks and merges
the parsed rows; [`eligibility.js`](apps/tracy-web/src/invitations/eligibility.js)
(`evaluateEligibility`) evaluates facts at a clock/policy supplied by the caller;
[`render.js`](apps/tracy-web/src/invitations/render.js) (`renderTemplate`) produces the text content.
[`csv.js`](apps/tracy-web/src/invitations/csv.js) (`parseCsv`/`previewCsv`) adds bounded UTF-8 CSV reading,
a lexical preflight before PapaParse and a checksum of the raw bytes; the outer digest binds the parser/adapter
version to the row helper's digest. Baseline flag normalization is an explicit choice; blank/unknown
still needs review. `previewRows` projects the serialized preview + canonical hash payload, and rejects any preview
over 16 MiB before expansion/serialization; this is not a guarantee on heap/RSS limits.
The helpers are all pure. The sandbox at `/ops/invitations` calls
[`invitations/route.js`](apps/tracy-web/src/invitations/route.js) through `/api/ops/invitations`;
Ops admission is injected from the composition root. Migration `080-invitations-sandbox.sql` stores campaigns,
previews, approval snapshots, simulated attempts, conversations, identity aliases and STOP suppression in PostgreSQL.
Mutations lock the transaction per program and check the campaign revision; a preview commit binds actor/digest/TTL,
and a retry returns the old commit snapshot. Owner/admin read and edit contacts; developers see only aggregates.
In a sandbox campaign, `POST /:id/content` stores a separate template version for one of the five groups
in `data.content` of the same campaign table (no new migration). `POST /:id/content-preview`
renders the saved version for one recipient of the right group, without bumping revision/audit. `POST /:id/generate`
uses the same renderer and by default only creates missing drafts; only `replaceExisting: true` recreates drafts
with no attempt and drops approval. Templates accept only `{{first_name}}` and `{{group}}` and render plain text;
the template version is recorded on the draft. Changing a template does not replace old drafts automatically. The create/edit/approve doors
all check suppression through linked identities, not only the campaign's local state.
The UI separates Content / Templates, Review emails and Conversations; CSV only imports recipients. The Ops router
cancels navigation away from a screen with unsaved content, including Back/Forward, through the
`tracy:before-ops-navigation` event; leaving the document uses the browser's `beforeunload` warning.
`INVITATIONS_SANDBOX_ENABLED=1` only accepts an explicit local/dev deployment and the matching origin.
The sandbox only accepts `.test`/`.invalid` emails and `sandbox-` member IDs, and replaces imported names with fake names;
it has no email transport. Operators enter only fictional text. `ready` in the sandbox is not
real eligibility. Migration `081-invitations-mailbox.sql` keeps the Gmail OAuth state separately, the connection
generation, single-use state and audit; [`invitations/gmail.js`](apps/tracy-web/src/invitations/gmail.js)
only offers Connect/Reconnect/Disconnect on local/dev, checks the mailbox `ceo@tracy.ai` and the two read/send
scopes. The refresh token is encrypted with AES-GCM using its own key `INVITATIONS_GMAIL_KEY`, never
`SESSION_SECRET`; the key must live outside the PostgreSQL backup. This connection has no send/sync adapter yet
and does not open the sender by itself. aMember/Sendy are still not wired for Invitations, and real sending is still closed.
The local stand owns its own DB.
The transactional mail above is unchanged.

## 8. Building a new site

**Design system measurements of an EmDash template** (20/10/2026): when a template site already has a system name
in `site_design` but no tokens yet, `tracy-host` reads `tokens.css`, `fonts.json` and the real `<html>` tag
in the container just before writing the provision job as `done`. The snapshot is stored with the job record;
`tracy-web` uses the pure reader of the Build EmDash plugin (Docker copies the exact source file) to fill in the tokens
when polling: right site, right `site_creation` job, right writer `provision:<buildId>`, tokens still
null. The system name keeps `source: catalog`; `tokensFrom: site:/app/src/styles/tokens.css` only names the source of the measurements.
It never overwrites a Build or a later system change, and never re-reads the site while polling. If a source cannot be read or is over 64 KB,
the measurements stay unknown; the same for old jobs without a snapshot. A template that declares no system (the current Business
EmDash) never gets a record created for it.

- **Quickstarts** are read from releases of `JoomlArt-Products/ja-products` into the `quickstart_releases` table
  ([ADR 0017](docs/adr/0017-github-release-is-quickstart-source-of-truth.md)). There is no catalogue
  file in the repo. (`apps/tracy-web/src/quickstarts.json` only pins the Claude
  Cowork plugin version.)
- **The Customize your site check runs in the background on tracy-web** ([ADR 0029](docs/adr/0029-template-customization-question-readiness.md) §4,
  [`customize-readiness.js`](apps/tracy-web/src/lib/customize-readiness.js)). After each read of releases (every 10 minutes
  and at boot in `cron.js`, the Sync GitHub button, the release webhook, a write of `tracy_setting.json`), every release that has no
  result for that exact version, or has a result scored with **different inputs** from the running machine, is checked
  **once**. Each result records five input versions (column `inputs`, [`readiness-inputs.js`](apps/tracy-web/src/lib/readiness-inputs.js)):
  the release's files, the rule set (checker code + `rule-severity.json`; a change rechecks every release), the `template-profiles.json` row
  of that template only (rechecks only that template), the contract sealing that release together with the `quickstarts.json` pin, and the
  Claude Cowork plugin a new site receives ([`cowork-install.js`](apps/tracy-web/src/lib/cowork-install.js), same order as
  `resolveInstall`; the fleet path reads `<platform>/update.json` of `claude-cowork` at the start of each scan, so a newly released plugin
  triggers a recheck with no deploy). Before running the checker, the parent process reads that plugin's real bytes
  ([`cowork-contract-evidence.js`](apps/tracy-web/src/lib/cowork-contract-evidence.js): GitHub release asset, bounded in
  bytes and time, cached by sha256 in `<TRACY_READINESS_DIR>/cowork`) and passes the evidence to the child process;
  STAB-1 fails when the plugin lacks the contract map, and is "Not checked" when it cannot be read (re-read after 30 minutes; blocks a new Publish,
  only warns for a release already published). Road to live treats a passing result scored against a plugin other than the current one as "Not checked"
  until the recheck finishes (`readinessForRoad`). While
  rechecking, the old result is still shown with "Rechecking…" (`rechecking_since`) and the Publish door keeps reading the old result until
  the new one arrives; only a never-checked release shows "Checking". How it checks: download the assets the checker needs
  (demo database, webroot for Joomla, install package, theme zip or source) with the release-read token into a temporary folder
  (`TRACY_READINESS_DIR`, default the system temp folder), run the checker in a **child process**
  (`check-runner.mjs`), store the report in `template_readiness`, then delete the folder. One release at a time, time-bounded
  (download 5 minutes, check 3 minutes); a failure records `error` and never hangs at "checking". The `customize` step of Road to live and the
  Publish door (`CUSTOMIZE_NOT_READY`) read this table; which rules block Publish is read at answer time from
  `rule-severity.json`. The Check again button (`POST /api/ops/quickstart/customize/check`) rechecks one release immediately.
  Measured 11/10: one EmDash release 4 seconds, one Joomla release (58 MB webroot) 10 seconds.
- **The Design system check runs in the background on tracy-web, same pattern** ([ADR 0031](docs/adr/0031-template-design-system-readiness.md),
  [`design-system-readiness.js`](apps/tracy-web/src/lib/design-system-readiness.js)): its own scan, its own table
  `template_ds_readiness`, inputs `{ files, rules, slot }` (release files; checker code + `rule-severity.json` + the
  `@tracy/ds-slot` `src/` code; that template's own slot contract). It downloads only **one** archive containing the stylesheets (Joomla
  installer/webroot, WordPress theme zip, EmDash source zip), no database, into `TRACY_READINESS_DIR/design-system`. The
  `design-system` step of Road to live (after `customize`, waits for the install file) and the Publish door (`DESIGN_SYSTEM_NOT_READY`, only for
  releases not yet live) read this table. Check again: `POST /api/ops/quickstart/design-system/check`.
- **Content coverage does not run in the background; it only reads a file** (24/10/2026, decided): `content-coverage.json` sits next to
  the contract in the profile folder (enters the image through the same COPY as the contract), committed by whoever measures it after running
  [`content-coverage/cli.mjs`](packages/cms/tracy-quickstart-tools/README.md) on a site built from the package (skill
  `quickstart-contract` section 7, K8). [`lib/content-coverage/`](apps/tracy-web/src/lib/content-coverage/reader.js) reads it
  (must match the sha256 of `content-map.json` + `presentation-lock.json`; a mismatch counts as not measured) and scores it against `policy.json`;
  the `content-coverage` step of Road to live (after `contract`, waits for the contract) and the Publish door (`CONTENT_COVERAGE_NOT_READY`,
  only for releases not yet live; a live release only warns). No DB table, no Check again. The same scan measures **page hygiene**
  (the `hygiene` list: raw language constants, PHP error text, unfilled tokens), which holds Publish as a gap (audit 1.1.0).
- **Three CMSs**: WordPress, Joomla, EmDash — build plugins
  [`tracy-site-build-wordpress`](packages/site/tracy-site-build-wordpress),
  [`-joomla`](packages/site/tracy-site-build-joomla),
  [`-emdash`](packages/site/tracy-site-build-emdash), shared core
  [`tracy-site-build-core`](packages/site/tracy-site-build-core).
- **Site build questions** (`GET /api/sites/questions`, `resolveQuestions` in
  [`apps/tracy-web/src/lib/build-questions.js`](apps/tracy-web/src/lib/build-questions.js)): since
  07/10/2026 (D11) it always returns **the CMS standard file** shipped in the image
  (`apps/tracy-web/src/questions/<cms>.json`, 7 default questions), with no on/off switch. The quickstart's own set
  (`tracy_site_question.json` → table `question_set`: `released`/`custom`/`generated`), the
  `question_choice` selection and the CMS default set chosen in `/ops` (`build_questions`) all remain in
  Postgres but are **not read**; `/ops` says "not served this round". The question-set editor and the question-set
  generator on `/ops` were removed on 10/10/2026 (data kept, read-only); the preview of the questions a customer
  is asked for one release is `GET /api/ops/quickstart/customer-questions` (same
  `resolveQuestions`, does not write `question_snapshot`). The language list of the capability snapshot also
  comes from the standard set. Per-template questions are a later round.
- **The design system chosen in Add site** travels in `POST /api/sites {designSystem}`, is kept in `site_create_design_system`, and
  `tracy-web` applies it itself after provision + brief (§5, *The system chosen in Add site travels with the site creation*).
- `tracy-host` runs `provision/provision.sh` to build the container pair; `tracy-web` also has a stock of
  pre-built sites (`inventory/`) and the brief-driven content writing flow (`sites/brief-build.js`).
- **Logo + favicon of the "Customize your site" sheet**: the browser uploads each PNG file to
  `POST /api/sites/brand-files` (multipart `file` + `role`;
  [`sites/brand-files.js`](apps/tracy-web/src/sites/brand-files.js)) **before the site exists**, so the file belongs to the uploading
  **account**, not to a seat. The server checks strictly (`brief-engines/brand-images.js`: PNG only by magic
  bytes, ≤ 8 MB, logo long edge ≥ 500, favicon square ≥ 512), stores the bytes in R2 + one `site_brand_upload` row, and returns
  `{id, width, height}`. The `POST /api/sites` call names the ids in `brief.answers.logo`/`favicon`; `briefOfPress` keeps only ids
  belonging to the person who pressed, attaches them to the new site and turns them into `brief.brand` (an unknown id is dropped with a note, the creation does not fail).
  Both the door and the ids sit behind the `/ops` switch `site-brand-uploads` (off by default) and need an artifact store. Unclaimed files
  are deleted after 24 hours, claimed files after 30 days (sweep after each upload).
- **The "set branding" step writes to the site** (`setSiteBrand`,
  [`sites/brief-engines/brand.js`](apps/tracy-web/src/sites/brief-engines/brand.js)): runs in `brief-build.js`
  after the engine writes the text, before the build becomes `applied`; every command carries `apply_id` `brand-<ts>` (written through
  `recordedDoor`, so undoing the build undoes it too). WordPress: `media.upload` + options `site_logo`/`site_icon`
  (Tracy Business also `tracy_site_identity`). Joomla: `site.identity` (`sitename`, plugin ≥ 0.22.0); T3 writes
  `templateStyle.params`, T4 writes the profile file via the `template.siteSettings` action (plugin ≥ 0.23.0), the footer image slot via
  `content.contract apply` (`apply_id` `contract-<ts>`). EmDash **has no Apply door**: this step runs the template's own
  `tools/personalize.mjs --brand-only` tool from tracy-web (`brand-emdash.js`), writing `settings.logo`,
  `settings.favicon` and the `logo_dark` field of the chrome entry; the tool's undo journal lives in the run's temporary
  folder, so it cannot yet be undone inside Tracy (pre-existing). Each release's profile (number of logo slots, `brandReady`,
  `faviconReady`, image frame) is in [`lib/template-profiles.json`](apps/tracy-web/src/lib/template-profiles.json).
- **A site written in the chosen language makes the CMS speak that language too** (D10). Single-language Joomla: after writing
  the text, Apply calls `content.contract siteLanguage.set` (`apply_id` `slang-brief-<ts>`, plugin ≥ 0.16.10) — the plugin installs
  the approved language pack and sets it as default for both site and admin, so `<html lang>` follows the text
  ([`joomla-languages.js`](apps/tracy-web/src/sites/brief-engines/joomla-languages.js)). EmDash: the personalize tool
  decides the tag (`report.displayLocale`, e.g. `{ "en": "vi-VN" }`) but runs outside the container, so its file lands in a temporary
  folder; tracy-web sends the tag via `POST /_host/display-locale {label, locales}` and `tracy-host` writes
  `<privateRoot>/<label>/data/display-locale.json` (= the site's `/app/data`, where the template reads it;
  [`display-locale.js`](apps/tracy-host/src/display-locale.js)). EmDash sites only, language-tag map only, does not follow
  links.
- **Updating a live demo: download first, tear down after** (25/10/2026, [`demo-update.js`](apps/tracy-web/src/lib/demo-update.js)).
  Pressing Update/Redeploy/Move on a `published` demo makes tracy-web **not** tear down the old version right away; instead it calls
  `POST /_host/prefetch {label, quickstart, quickstartEntry, releasesToken, jobKey}` on the host that will run the new version
  ([`prefetch.js`](apps/tracy-host/src/prefetch.js) runs `quickstart.py --prefetch`): downloads each part, checks size + sha256,
  stores it in the cache `$TRACY_PRIVATE_ROOT/_quickstarts`. The `site` row is untouched and the old version keeps serving. Only once the `prefetch` job is done does
  poll/cron call `/teardown` (keyed by the prefetch job id) and then go down the old teardown → provision path; provision reads the checked
  files from the cache and does not ask GitHub a second time. If prefetch fails (403, checksum, missing asset, a newer release just appeared) it stops there,
  the demo stays live, and `/ops` shows the reason; pressing again retries. Not yet covered: a provision failing **after** teardown for a reason other than download
  (restore, installer, mail) still leaves the address empty until the retry. `quickstart.py` reads 403/429 with `Retry-After` or
  `x-ratelimit-remaining: 0`: waits if ≤ 120 s (`TRACY_QUICKSTART_RATE_WAIT_S`), otherwise reports when the quota reopens.

### Publishing a site and sending it back to draft

A finished site starts as a draft. An Owner/Admin presses **Publish** or **Back to draft** on the site screen
(the site's **Publish** tab, opened from the `Publish` row in the `⋯` menu in My Sites —
[`PublishView.tsx`](packages/core/tracy-core/src/site-tabs/PublishView.tsx), [`SiteDomains.tsx`](packages/core/tracy-core/src/site-tabs/SiteDomains.tsx));
other roles can only read the state. A site is always published on its **Tracy address**; a customer's
**own domain** (section below) goes along with the publish when DNS, re-read at the moment of the press, proves
it. The caller does not name domains itself: a body with a `domains` field is refused
(`400 DOMAINS_NOT_SUPPORTED`) before the host is asked.

```
site screen ──POST /api/sites/:key/go-live {op: live | draft}──▶ tracy-web
  tracy-web     reserve: one site_publish_op row (state starting, new ref) — if the site already has an
                unfinished operation, return 409 PUBLISH_BUSY
  tracy-web ──POST /_host/go-live {label, op, jobKey: publish:<ref>, domains?, routingTarget?, routeGen?, attempt?}──▶ tracy-host
  tracy-host    write the acceptance mark <id>.accepted (id derived from the key) → write the job record → hand the job to go-live.sh,
                do not wait for it → return 202 {jobId}
  tracy-web     receive the job id: job row + site_job_follow_up + site_publish_op.state = running; return 202
  tracy-web     reconcile when someone reads AND on the background sweep: fetch the job result, or resend the SAME key
```

The path lives in [`publish.js`](apps/tracy-web/src/sites/publish.js) (door and reconciliation),
[`publish-store.js`](apps/tracy-web/src/sites/publish-store.js) (ledger) and `goLiveRoute` in
[`tracy-host`](apps/tracy-host/src/app.js). Each state has exactly one home:

| State | Where it lives | Who writes it |
|---|---|---|
| Whether the site is draft or published | Postgres, column `site.publish` | `tracy-web`: set **after** a `live` job ends well; cleared **before** asking the host in the `draft` direction — in the same transaction as the reservation in `site_publish_op` — and never set back by itself |
| The operation holding the site (`op` = `live` · `draft` · `drop-domain` · `delete`, `state` = `starting` · `running` · `done` · `failed`, `ref`, `job_id`, `code`, `domains`, `target`, `attempt`, `sweep_at`) | Postgres, table `site_publish_op` — one row per site, so that row is the hold itself (migrations `069-site-publish-op.sql`, `070-site-own-domain.sql`) | `tracy-web`; every write is conditional on `ref`, so a late answer to an earlier operation cannot write over a later one |
| Whether the host has accepted this key | File `<id>.accepted` on the `tracy-host-jobs` volume, written once and synced to disk before writing the job record, running the script or returning 202 ([`jobs.js`](apps/tracy-host/src/jobs.js) `acceptJob`) | `tracy-host` |
| How far the job has run, the script's exit code, the last lines | The job's JSON file on the same volume, same `id` | `tracy-host` |
| Work the door still owes the job (poll) | Postgres, tables `job` and `site_job_follow_up` (door `go-live`) | `tracy-web`, in the same transaction as `site_publish_op` |

- **Same key, same job.** The job `id` is a hash of `jobKey`, so asking the host again with the old key
  returns the existing job, never a second job next to one waiting or running.
- **The acceptance mark is separate from the job record** because the record is rewritten throughout the run and may be lost or
  unreadable. Only the `/_host/go-live` door writes this mark. `accepted` only accompanies a **refusal** of a keyed request
  (`BAD_REQUEST`, `NOT_CONFIGURED`, `NOT_FOUND`): `true` (mark or record present), `false` (looked and found
  neither mark nor record), or no such field when the mark could not be looked at. A `202`
  answer carries only `jobId` (and `reused` when it is an existing job); `409 GO_LIVE_BUSY` and
  `503 JOB_STORE_UNAVAILABLE` carry no `accepted` either.
- **Only two things end an operation and release the site:** a job record carrying the script's own exit code
  (`done` also needs the closing line `TRACY_RESULT go_live=<op> label=<label>` of
  [`go-live.sh`](packages/fleet/tracy-fleet-operation/scripts/provision/go-live.sh)), or the host refusing
  with its own code plus `accepted: false`. Every other answer — silence, job 404, a job orphaned
  after the host restarts, busy — leaves the operation unconfirmed and still holding the site;
  no timer releases it.
- **Reconcile on read, and on the background sweep.** `GET /api/sites/:key/state`, `GET
  /api/sites/:key/settings`, polling `GET /api/sites/:key/jobs/:id` and the next press all go through
  `refresh` in `publish.js`. `GET /api/sites` (My Sites) only reads the ledger and does not ask the host. Operations no one
  reads — a door that died after reserving (`starting`, no job yet, nothing in `site_job_follow_up`),
  a host that lost the record, a customer who closed the tab — are re-asked by `sweepPublishOps` ([`cron.js`](apps/tracy-web/src/cron.js),
  every 15 seconds) through that same `refresh`, under the operation's own key. The sweep takes at most 20
  due rows (`sweep_at`, `for update skip locked` so two replicas never take the same row), and each
  time without a result it backs off the next look from 15 seconds up to at most 10 minutes, using the Postgres
  clock. It only asks: it does not end, release or drop any operation by age. The
  `site_job_follow_up` row of the `go-live` door is no longer dropped after one day either.
- **A host without a tunnel can still publish.** `tracy-host` only requires Cloudflare configuration when the request
  has `domains` (`501 NOT_CONFIGURED`); `live`/`draft` on the Tracy address do not need it.
- **A script killed by a signal is not a failed script.** [`run.js`](apps/tracy-host/src/run.js)
  returns `code: null` with `signal` (or `spawnError`); the go-live job records `unobserved` with `signal` /
  `timedOut` and no exit code — so the web does not release the hold, and the same key reruns the job.
- `POST /api/sites/:key/state` only changes `plan`, not the publish state.
- **Deleting a site is a site operation (`op` = `delete`), and the site row goes last.**
  `DELETE /api/sites/:key` takes the `site_publish_op` row under the same lock publish takes — once taken,
  no other operation can start, and if another operation holds it the delete is refused with
  `409 PUBLISH_BUSY`. The host runs `teardown.sh` through the `POST /_host/go-live` door with `op: 'teardown'`,
  under the key `publish:<ref>` like every operation. The `site` row, seats, repo and attachments are removed only after
  the script prints the closing line `TRACY_RESULT torn_down=1 label=<label>`: the web writes the mark `code = TORN_DOWN` on the holding
  row, then `closeDeletedSite` ([`route.js`](apps/tracy-web/src/sites/route.js)) closes the books — called by the delete
  door, a site read, or the background sweep. Teardown fails → `409 TEARDOWN_FAILED`, the site row
  stays intact, and pressing delete again is the same operation with `attempt` increased by one. Host not done within 45 seconds →
  `202 DELETE_PENDING`, My Sites shows "Deleting…" until the host finishes.

### A customer's own domain (Connect domain)

An Owner adds a domain of their own in the site's Publish tab (Domains section); each site holds at most **one** own domain.
The name must be a **subdomain** of a registrable name (`www.example.com`); the registrable name itself
(`example.com`, `example.co.uk` — judged by the ICANN part of the public suffix list in `tldts`) is refused with
`400 DOMAIN_APEX_UNSUPPORTED` plus a `suggestion`, because a zone apex cannot carry a CNAME.
A `pending` row held from before that is now refused (an apex name, or `INVALID_SITE_KEY` for an unknown list
suffix) carries that code in `problem`, has no `routing` record, and can only be removed.
The `site-connect-domain` switch in `/ops` › User Interface hides the entry button **and** closes the start doors on the server:
when off, holding a name and looking up DNS return `403 OWN_DOMAIN_DISABLED` (a switch read error → `503
UI_SETTING_UNREADABLE`, never treated as on — `uiSwitchOn` in
[`ui-setting.js`](apps/tracy-web/src/lib/ui-setting.js)); existing names still show, still work and can still be removed.

```
PUT    /api/sites/:key/address {name, kind: custom}   hold the name (site_name, state pending, new token) → 202,
                                                       returns the two DNS records to create
POST   /api/sites/:key/address/verify {name}          read DNS RIGHT THEN, record the reading → 202
POST   /api/sites/:key/go-live {op: live}             re-read DNS; names that prove OWNERSHIP (TXT) travel with the job
tracy-host: go-live.sh → ingress_api.py               rule `name → tracy-web` + owner record (site label, generation);
                                                       prints `==> ingress: <name> → tracy-web <service>`
tracy-web ──GET https://<name>/__tracy/domain-probe──▶ (public DNS, HTTPS) ──▶ tracy-web
                                                       answers with exactly this row's proof → `active` (connected)
DELETE /api/sites/:key/address/domain {name}          remove: only a hold → delete the row (200);
                                                       connected → check the Tracy address first, then a drop-domain operation (202)
tracy-web ──POST /_host/routing-target──▶ tracy-host  the host's tunnel identity (<tunnel-id>.cfargotunnel.com)
```

#### How a request on an own domain travels (08/10/2026)

```
browser ──https://www.customer.example/…──▶ Cloudflare ──tunnel──▶ cloudflared on the host
  ingress rule  `www.customer.example → http://127.0.0.1:<tracy-web port>`   (NO longer `→ the site's port`)
  tracy-web     app.js: EVERY public hostname that is not Tracy's → bar/route.js `serveOwnDomain`
                  (closed exception, `localHostName`: IPs, single-label names like `localhost`/`tracy-web`,
                  `*.localhost`/`*.test`/`*.internal`/`*.local` — in-machine addresses — fall through to Tracy's app)
                  the site_name row (kind custom) for EXACTLY that name decides; no lookup by label, no fall-through to another site
                  not yet `active`, site in draft, released name, unheld name → 404 refusal page, the CMS is not asked
                  (only the exact page the prober is asking for — GET, exact path, within the window recorded on the row, `probePage` —
                  is opened for a `pending` name whose route is installed; that request carries nothing of the probe)
                  GET /wp-admin · /administrator · /_emdash/admin        → 302 to the Tracy address
                  everything else → bar/site-proxy.js with `canonical` = origin of site.address
  to the CMS    x-forwarded-host/proto = the Tracy address; every `x-tracy-*` header and Tracy cookie from the client is dropped;
                Origin/Referer/query naming the own domain are rewritten to the Tracy address; the Tracy session is not read
  back to the browser every URL with exactly the Tracy address origin in headers and in text bodies (HTML, CSS, JS, JSON, XML,
                text) is rewritten to the own domain — plain form, `\/` in JSON, `%2F` in query; binaries are not read
```

- **Two origins, one canonical.** The CMS only knows its **Tracy address**; connecting a domain does **not** run a
  `site-address` job and does not change `home`/`siteurl`, `$live_site` or `EMDASH_SITE_URL`. To the CMS, a request on
  the own domain is identical to a request on the Tracy address, so WordPress no longer `301`s back to the Tracy address, and
  the same mechanism is correct for WordPress, Joomla and EmDash. The renaming lives in
  [`own-domain.js`](apps/tracy-web/src/bar/own-domain.js), and **there is no find-and-replace on text**: a
  URL is rewritten only when it is **a complete value handed out by the parser of the format containing it** —
  parse5 for HTML (attributes, `<base>`, inline `<script>`/`<style>`), acorn for JavaScript (static
  strings), `JSON.parse` + acorn for JSON (only the string's exact bytes change, numbers are not rewritten), css-tree for
  `url()`/`@import`, saxes for XML/SVG (attributes, elements containing only a URL, `<?xml-stylesheet?>`),
  and each header's own syntax (`Location`, each `<URI>` of `Link`, each source of CSP). That value
  must pass **both**: the standard URL parser (`new URL`) says the origin is the site's, with no user/password;
  and it is written exactly as `[scheme:]//host[:port]` followed by `/`, `?`, `#` or the end of the value.
  `https://a.b@other.example/`, `a.b&u@other`, `a.b+u@other`, an `@` at any distance, `&commat;`, `@`,
  `a.b.evil.example`, `a.b:8443` are all **left as is**. Percent-encoding is decoded in only **one** place:
  a value in the query of a URL parsed as above (`?redirect_to=…`, share links `?url=…`);
  encoded strings elsewhere (`decodeURIComponent('https%3A%2F%2Fa.b&u%40other')`) are not touched. In
  scripts, a string is rewritten only when the authority ends inside the string (`https://a.b/…`); the right-hand side of
  `+`, bare origin strings, templates with expressions, keys and comments are left as is — except a comment the parser hands out
  consisting only of a source directive (`# sourceURL=<url>`, `# sourceMappingURL=<url>`, which WordPress places at the end of
  each inline block): the value after `=` is a URL by the directive's definition. The four parsers are runtime
  dependencies of `apps/tracy-web` (`package.json` + the `apps/tracy-web/pnpm-lock.yaml` the image installs).
  The body is **read whole** (5 MiB ceiling) before rewriting; a text body cut by `Range` (206) is re-requested
  whole; a redirect back to the very address just requested returns `502` instead of handing the loop to the browser.
- **What cannot be told whole under the own domain is REFUSED, never sent half and half.** XHTML pages,
  bodies not in UTF-8 (by BOM, header, `<meta>` or the bytes themselves), bodies over 5 MiB, a CSP allowing
  the site's own scripts by hash (CSP3), and a body — or an inline `<script>`/`<style>`/JSON/
  import map block, an `on…` handler, a `style` attribute — **that names the site** where the format's parser
  refuses or leaves part of it unparsed (css-tree keeps that part as `Raw`): the proxy returns `502` with
  `x-tracy-own-domain-projection: refused; reason=xhtml|charset|size|parse|csp-external-hash` and one
  log line; no byte of the body and no header of the site (CSP, cookie, ETag) goes out. Reason: headers
  are rewritten in the same pass as the body, so the original body under rewritten headers is a page mixing two names (CSP blocks its own
  assets, canonical names the other, SRI mismatches). If the home page is refused, the probe's page signature is that of the
  `502` — the domain does **not** become connected. `parse` only considers text naming the site's host: unusual
  syntax that does not mention the site has nothing to rewrite and goes out normally. Kept as is by design, not
  a bug: strings built at runtime (templates with expressions, concatenation) and `<script>` types the browser does not
  run are not read as JSON either.
- **Admin and sign-in stay on the Tracy address.** `Open admin` (Settings, My Sites, bar) is built from
  `site.address`, unchanged. The `tracy_sess` cookie belongs to Tracy's domain so it never reaches the own domain;
  the router does not read a session there and never sends `x-tracy-email`/`x-tracy-tier`. EmDash passkeys have an RP ID
  that is the Tracy address hostname, so they are not stranded.
- **Things carrying a hash of the body are kept correct** ([`own-domain-integrity.js`](apps/tracy-web/src/bar/own-domain-integrity.js)).
  A body with rewritten URLs is no longer the body the CMS hashed, so there are three rules: (1) `integrity=` on `<script src>`/
  `<link href>` and the import map's `integrity` table are **dropped** when the file is the site's own (CDNs untouched);
  (2) for CSP source hashes `'sha256-…'` (header, report-only variant, `<meta>`) of an inline block that was rewritten, the
  hash of the rewritten block is **added**; (3) `Content-MD5`/`Digest`/`Content-Digest`/`Repr-Digest`
  are dropped on every body that may be rewritten, a strong `ETag` becomes `W/…`, `Accept-Ranges` is dropped. The page is read with
  **parse5** (a standards-conformant HTML parser): tags in comments, script strings and textareas are not
  tags; attribute values are the values the parser decoded (`https&colon;//…` is that very address); whether an asset is
  "the site's" is decided by that value resolved against `<base>` with `new URL`. Each edit overwrites
  exactly the byte range the parser reports for one attribute or one inline block; everything else is the site's bytes.
  The hash added to the CSP is the hash of **the block exactly as sent**. Not covered: `integrity` set by JS at
  runtime; the cases in the "say it, don't guess" item above.
- **CMS cookies become host-only on the own domain** for any `Domain` covering the Tracy address (exact name
  or a parent such as `.tracy.site`); a `Domain` that does not cover it is left for the browser to reject.
- **Hole closed.** Before 08/10/2026 the ingress rule pointed straight at the site port: an `x-tracy-tier: editor` header
  sent by the client itself reached the Tracy Access plugin directly and was granted an admin session. The related hole over the network shared between
  sites was closed in P0 (26/10/2026, §4): the Tracy Access plugin from 0.4.0/0.2.0 trusts only assertions signed with the site's own
  key, and each site's network is isolated from the others. Both are reproduced in
  [`wordpress-access.test.mjs`](packages/fleet/tracy-fleet-operation/test/wordpress-access.test.mjs).

| State | Where it lives | Who writes it |
|---|---|---|
| The site's domain (`pending` · `active`), TXT token | Postgres, `site_name` (kind `custom`) | `tracy-web` ([`address.js`](apps/tracy-web/src/sites/address.js)); `active` only when an HTTPS probe to the domain itself returns this row's proof (`confirmOwnDomains`). The card reports `connected` only when the row is `active` **and** has `connected_at` (first passing probe); rows `active` from before 08/10/2026 read as `pending` |
| Whether the host has installed the route for the name; the current connection attempt; the latest HTTPS probe result | `site_name.routed_at`, `connected_at`, `probe_secret`, `probe_reading`, `probed_at`, `probe_next_at`, `probe_tries`, `migrate_next_at` ([`082-site-domain-probe.sql`](apps/tracy-web/src/db/migrations/082-site-domain-probe.sql)) | `tracy-web`: `routed_at` when the script prints `==> ingress: <name> → tracy-web …`; a new `probe_secret` on each `live` carrying the name; probe results written conditionally on name + site + secret |
| Route generation of a run | `site_publish_op.route_gen` (sequence `site_route_gen`, shared across the deployment) | `tracy-web`, at reservation; sent to the host as `routeGen` when the request has `domains` |
| A released site name | `site_name_released` | `tracy-web`: written on removal, deleted when the name is held again; the router returns the refusal page for this name |
| Hold expiry for an unproven name (72 hours) and the mark that it was once proven | `site_name.hold_until`, `site_name.ownership_proven_at` | `tracy-web`, with the Postgres clock at row-write time (`clock_timestamp()`, not transaction start), judged AFTER locking the row (`lockNames`: a session that only `for update`s and releases after expiry cannot let a late proof slip in); `ownership_proven_at` is set on the first `ok` TXT read — including one arriving after a later lookup — and no later read clears it |
| Notice that a site's hold expired | `site_name_lapse` | `tracy-web`: `releaseLapsed` (the hold door, and `sweepExpired` every hour) — deletes the `site_name` row and writes the notice in **one** statement |
| Latest DNS reading: each record `ok` · `wrong` · `missing` · `unknown`, value found, error; lookup time | `site_name.dns_reading`, `checked_at`, `routing_target` | `tracy-web`, with the Postgres clock; tied to the token and target at measurement time, so a response arriving after the name is removed/re-saved cannot be written |
| The host may already have a rule for this name | `site_name.carried_at` (set when reserving a `live` run carrying the name, cleared when the host says it has removed it) | `tracy-web` |
| Ingress rule `name → tracy-web` (the site's Tracy address is still `name → the site's port`) | Tunnel configuration at Cloudflare | `tracy-host`, through [`ingress_api.py`](packages/fleet/tracy-fleet-operation/scripts/provision/ingress_api.py): one lock per tunnel, re-read after writing, no write when already correct |
| Which site and generation the rule belongs to | File `<tunnel lock folder>/.own-domain-routes-<tunnel>/<name>` on the host (`{label, gen, service}`; an unfinished write adds `state: writing` and `previous`: the services the rule may still point to) | `ingress_api.py`, under the tunnel lock: written **before** writing the rule (`state: writing`, with `previous`) then settled (drop `previous`) after re-reading the rule, deleted after the rule is removed; opened without following links, a broken record or one missing `service` is an error, not "absent" |
| The names the script has added for the site | File `.golive-domains` in the site's private folder on the host | [`go-live.sh`](packages/fleet/tracy-fleet-operation/scripts/provision/go-live.sh): writes the name **before** adding the rule, deletes the name **after** the provider confirms removal |

- **Only say what was measured.** Ownership = TXT record `_tracy.<name>` carrying the token; routing = a CNAME
  chain leading to the exact host target named at measurement time. Address records are not looked up, so a flattened CNAME reads
  as `missing`, never guessed to be right. Lookup errors (timeout, SERVFAIL) read as `unknown`. The token
  is only sent to the Owner. DNS is read with the machine's resolver, or the resolver named in `TRACY_DNS_RESOLVER`.
- **Domains follow the publish operation model**: same hold, same job key, same release rules.
  `live` carries the names that have proven **ownership** (TXT) plus `routingTarget`; the CNAME record is now only
  a diagnostic on the card, no longer a condition (it is not assumed the customer points a CNAME at
  `<tunnel-id>.cfargotunnel.com`). The host refuses with `409 ROUTING_TARGET_CHANGED` if the measured target is no
  longer its tunnel. `draft` removes every name the host may be routing. `drop-domain` removes one name,
  without touching mail or noindex.
- **"Connected" means it actually opened.** The line `==> ingress: <name> → tracy-web …` only says the route is installed
  (`routed_at`); the old-style line `→ 127.0.0.1:<site port>` from a host not yet updated does **not** count
  (`DOMAIN_NOT_ROUTED`). Then `tracy-web` itself calls `https://<name>/__tracy/domain-probe` over public
  DNS ([`domain-probe.js`](apps/tracy-web/src/sites/domain-probe.js)): sends a random challenge and
  accepts only the answer `HMAC(probe_secret, name, site, challenge)`; **then it fetches that name's home page
  like an ordinary visitor** — the request carries no challenge, key or Tracy header,
  so whatever stands at the domain cannot answer the probe one way and visitors another. The proof lives on
  Tracy's side: before each request, the prober writes a nonce and the path it is about to request on the `site_name` row
  (`probe_page_nonce/path/until`, 15-second window); the proxy reads that row for every own-domain request and
  **reads the whole body it is about to send before signing** `nonce, path, status, content-type, Location, SHA-256
  of all body bytes` into the header `x-tracy-domain-probe-page` (a body not read whole gets no
  signature; that response carries `cache-control: no-store, no-transform`). The prober reads the answer **to the end**
  (20-second limit, 5 MiB ceiling both on the wire and after decompression, must end cleanly), hashes the bytes it read itself and
  checks the signature against that digest — so a machine at the domain that forwards the request to Tracy, keeps the header and then
  sends its own body fails (`PAGE_NOT_SITE`); a body that starts with `<html>` then breaks, hangs, never ends, or has
  broken gzip is `PAGE_INCOMPLETE`/`PAGE_TOO_LARGE`. That window is also
  the only thing that lets a `pending` name show exactly one page (GET, exact path). Only when the route proof
  passes **and a whole page is served** — status 200, the body an HTML document read to
  the end (`servedPage`), directly or through at most 3 redirects staying on the domain's https origin, each
  hop signed separately — is it
  `connected`. 204, 206, empty body, non-HTML is `PAGE_EMPTY`; `/` → `/` or a loop is
  `PAGE_REDIRECT`. Echo, another site, an old connection
  attempt, a parked page, a redirect, non-200, empty/oversized body, bad TLS, DNS errors, a page not served by the site
  (`PAGE_NOT_SITE`), a broken/stopped CMS (`SITE_NOT_ANSWERING`), a home page jumping to another host
  (`PAGE_REDIRECT`) all keep `pending` with a reason
  (`addressChange.pending.connection = {status, error, checkedAt}`, `readiness.tls`). Only public addresses are
  dialled, and only the exact address checked (anti-SSRF/DNS rebinding; IPv6 is judged by bytes so
  `::ffff:7f00:1`, 6to4, NAT64, Teredo do not slip through); a local stand opens this with
  `TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE=1` (refused when `NODE_ENV=production`). Probing happens outside any
  transaction; results are written under the site's name lock, only when no operation holds the site and the site is still
  published. Who probes: a `GET /state` read (waits at most 1.5 seconds), the Check DNS button (`POST /address/verify`),
  and `sweepOwnDomainProbes` in [`cron.js`](apps/tracy-web/src/cron.js) (every 15 seconds, backing off up to 30
  minutes, never dropped by age) — so a restart midway still carries on. A name already `active` that misses a probe stays
  `active` (visitors are being served), only the result is recorded; the card stays `connected` if the name has ever passed.
- **Remove in order, and each failing step reports itself.** (1) For **every** name the host may be routing
  (`active` or already `carried`), ask the site at the Tracy address **through Tracy's own proxy**
  (`addressStanding` calls `proxySite` with the Tracy address as authority, no one signed in — exactly what a
  visitor of the Tracy address receives): only the site's own page **served whole** — status 200,
  the body an HTML document **read to the end without error** (same `readWhole` + `servedPage` as the probe, 20-second
  limit per hop), directly or following at most 5 redirects staying on the exact **origin** (scheme + host +
  port, no credentials) of the Tracy address — is `ok`; 404/403/5xx, 204, 206, empty body, a body
  that starts then breaks/hangs/never ends, non-HTML, a looping redirect (`/` → `/`) is
  `unreachable`; a redirect to another host, to `http` when the address is `https`, to another port or to a URL
  with credentials is `elsewhere`; a site with no copy on the host or no address is refused
  (`SITE_NOT_READY`). If the CMS is redirecting the Tracy address to the domain (someone changed it by hand), a
  `site-address` job is run to bring it back and it asks again — on failure `502 DOMAIN_REMOVE_FAILED` with `step: verify-address |
  restore-address`, and `rollback-address` (`uncertain: true`, `changeId`, audit record
  `site.domain.restore.uncertain`) when even the rollback cannot be confirmed; nothing removed yet. (2) Reserve `drop-domain`: the row goes back to `pending`, `probe_secret` is cleared — **the web stops serving the name immediately**.
  (3) The host removes the rule, then removes the name from `.golive-domains`. (4) The `site_name` row is deleted, the name goes into
  `site_name_released`. A door that cannot start step 3 returns `step: remove-route`.
- **The newer generation wins, and ownership is the whole record.** `ingress_api.py` leaves things as they are (exit 3) when the owner
  record has a higher generation than the running pass, or when removing and the record belongs to another label; teardown names
  no generation, so it removes every route of its own label. A rule is recognised as "the record's" by the **service written in the
  record** (not by today's `tracy-web` address): when `tracy-web` changes address, the next publish replaces its own old rule,
  and removal does not need to know the service. A service change the provider refuses leaves
  a record naming **both ends** (`service` to be written + `previous` where the rule still stands): a rule at either end
  belongs to the record, so a retry can replace it and a removal can remove it. A rule to `tracy-web` with **no
  record** can be removed by no one (exit 3; it opens nothing, because the web only serves names a site holds); the next
  connection of that name adopts it and writes the record. An old-style rule `→ the site's port` belongs to the site by port: `live` replaces it with the new rule
  (`--takeover-port`), `draft`/`drop-domain`/teardown remove it (`--only-port`; the port is only evidence when the name has no owner record — once there is a record, a rule pointing straight at the port must also match label and generation).
- **Sites connected the old way are migrated automatically, through the normal publish path.** `sweepLegacyOwnDomains`
  in [`cron.js`](apps/tracy-web/src/cron.js) (same 15-second beat) takes every `active` name without
  `routed_at` of a published site, reserves a `live` run carrying that name (without reading DNS) and hands it to the
  host: the host replaces the old rule (`--takeover-port`), the web probes again. A site currently held is left for the next pass; a host not yet
  updated (prints the old-style line) is retried after 10 minutes (`migrate_next_at`). No one has to press anything; an Owner
  pressing **Publish** goes down the same path. Until the name answers through the new route, the card shows `pending` with
  `connection: {status: waiting, route: direct}` and the site keeps being served.
- **The host knows where `tracy-web` is** through `TRACY_OWN_DOMAIN_SERVICE` (`http://host:port`), or
  `TRACY_WEB_ORIGIN` when it is loopback (`http://127.0.0.1:<port>` as in `deploy/compose.yml`). Without either,
  `live` adds no name, writes no ledger entry and prints no route line.
- **Unfinished cleanup is recorded as unfinished.** `go-live.sh` goes through all names before exiting non-zero for names
  it could not remove; the web records what was done (the name back to `pending`, or the row gone for `drop-domain`) and leaves
  the operation `failed` with `DOMAIN_STILL_ROUTED`. Pressing again is **the same operation, same key**, with `attempt`
  increased by one; the host only reruns a failed `draft`/`drop-domain`/`teardown` job when `attempt` is higher than
  the run already done. The background sweep does not rerun a `failed` operation by itself.
  `go-live.sh` prints `==> ingress: removed <name>` (or `… is not routed to this site`) only after **both** the
  rule is removed **and** the name is out of `.golive-domains`; if the ledger write fails it prints nothing, exits non-zero,
  and the web keeps the `site_name` row so it can be pressed again.
- **`ingress_api.py` never takes over someone else's rule and never guesses from an incomplete answer.** Adding a name
  that already has a rule pointing at another port → leave it, exit 3; only `--replace` (the Tracy address generated from the site's
  own label: `provision.sh`, `deploy-quickstart.sh`, `POST /_host/address`) replaces it. An answer
  with no `config`/`ingress`, or with a malformed rule, is an error — never read as an empty list;
  only a fresh add treats an unconfigured tunnel (`config: null`) as having no rules.
- **An unproven name is held for only 72 hours** ([`077-site-own-domain-hold.sql`](apps/tracy-web/src/db/migrations/077-site-own-domain-hold.sql)).
  A `pending` row never carried to the host (`carried_at` null), never read with an `ok` TXT, past
  `hold_until` is treated by every read as released; the hold door calls `releaseLapsed` for that exact name before
  `insert … on conflict do nothing`, so when two sites race for it only one wins (row lock from the
  `delete`, then the `site_name.name` primary key). Re-saving the same name before expiry does not extend it; holding again after expiry
  means a new token and a new expiry. A DNS lookup arriving after expiry cannot be written (`RESERVATION_LAPSED`). Rows that are connected,
  carried to the host or proven never expire. The migration leaves **no expiry** on old rows that
  were once looked up but no longer have proof (earlier code cleared `ownership_verified_at` on a failed lookup), because
  they cannot be told apart from rows that were once proven.
- **DNS lookups are ordered.** Each lookup takes a number from sequence `site_name_dns_turn` **before** asking DNS;
  a result only overwrites an older turn (`site_name.dns_turn`), and `checked_at` is the time of asking. A CNAME
  answer must be exactly one valid name; multiple CNAMEs read as `unknown` (`MALFORMED`).
- **One lifecycle lock per site on the host**: `go-live.sh` (all three directions) and `teardown.sh` share the
  lock `.go-live-<label>.lock` ([`site-lifecycle.sh`](packages/fleet/tracy-fleet-operation/scripts/lib/site-lifecycle.sh));
  whoever comes second exits 75 and changes nothing. The lock, the `.golive-domains` ledger and the ledger's temp file are all opened
  **once**, without following links (`O_NOFOLLOW`, `O_NONBLOCK`), judged by descriptor (`fstat`) — the lock is opened by
  python3, which then re-runs the script itself with the lock on fd 8. `teardown.sh` removes the rule of the Tracy address and of every name in
  `.golive-domains` (only when the rule is the site's: pointing at the site's exact port, `--only-port`, or pointing at
  `tracy-web` with an owner record carrying the site's label, `--owner`) **before** deleting data, and stops if it
  cannot remove them.

#### Cloudflare for SaaS: a customer's name gets a certificate and reaches Tracy (09/10/2026)

```
customer: CNAME www.<name> → <CLOUDFLARE_SAAS_CONNECT_LABEL>.<SITE_DOMAIN>   (default connect.<zone>, proxied)
          TXT   _tracy.www.<name> = token                                     (proof of ownership, as in the previous section)
tracy-web ──HTTPS──▶ api.cloudflare.com /zones/{zone_id}/custom_hostnames
          POST (after the TXT is right) · GET {id} (name + certificate status) · DELETE {id} (when the name no longer belongs to the site)
visitor ──▶ Cloudflare (the custom hostname's certificate) ──▶ fallback origin <ORIGIN_LABEL>.<zone>
          ──▶ the host's tunnel ──rule by Host `<name> → tracy-web` (still written by go-live.sh)──▶ tracy-web
```

- **A new way out of `tracy-web`: the Cloudflare API**, with a token scoped to that zone only (SSL and
  Certificates: Edit), sent only in the `authorization` header; never logged, never written to a row, never
  in the checklist ([`site-domain-provider.js`](apps/tracy-web/src/sites/site-domain-provider.js)). Each
  call has a 10-second limit and returns a closed set of results, never throws.
- **Not configured means no new names start.** Missing zone id/token configuration
  (both, or one — the server still starts, the release checklist names the missing variable): holding a name, checking availability and Check DNS of an own name return `503 OWN_DOMAIN_UNAVAILABLE`; names that existed before
  keep the earlier path (CNAME target = the host's tunnel, no Cloudflare gate).
- **The hostname is created only after the `_tracy` TXT is right** (`ownership_proven_at`): a name merely typed in costs no
  quota, and no one is registered on behalf of someone who cannot prove ownership. Certificate DCV is `http` (Cloudflare serves it itself
  once the CNAME points into the zone), so the customer adds only two records; any DNS record Cloudflare still demands (TXT/CNAME
  in `ssl.validation_records`) is shown verbatim on the card (`checks[].record = "validation"`).
- **"Connected" needs three things**: hostname `active`, certificate `active` (read from Cloudflare just before
  probing, and re-read in the writing transaction), then the HTTPS probe from the previous section. Until all hold there is no probe, and
  `connection.error` carries the reason: `HOSTNAME_PREPARING` · `HOSTNAME_UNCONFIRMED` · `HOSTNAME_CONFLICT` ·
  `HOSTNAME_PENDING` · `HOSTNAME_FAILED` · `CERT_PENDING` · `CERT_FAILED` · `HOSTNAME_UNREAD` (the card translates
  all of them into eight languages). **One rule for both the probe and the card** (`gateOf`): only the latest read, and only if
  it succeeded — a failed read or one returning another name means the old state is not trusted (`HOSTNAME_UNREAD`); a name
  already `connected` whose hostname is later no longer `active` or unreadable goes back to `pending` on the card with a
  reason. Serving requests does not read this rule: a request for the name only reaches `tracy-web` through Cloudflare, and
  Cloudflare only answers for the name while the hostname is active.
- **One pass per row at a time** (`claimed_until`, `claim_id` = the pass's generation), including
  forced passes (Check DNS, the probe): every write of a pass is conditional on its own `claim_id`, so
  a pass outliving its claim does not overwrite a later pass, and only releases its own claim; the create
  call's answer is only written to that exact create pass (`attempt`). **A hostname Tracy was told it
  created is never forgotten**: a pass that can no longer write to the row keeps the id in table `site_custom_hostname_orphan`, and the sweep deletes
  by id until Cloudflare says it is deleted (that name meanwhile returns `DOMAIN_RELEASING`). Hostname
  identity (id, name) is read separately from the displayed list of validation records: when the list is too long to show whole
  the hostname still keeps its id, it is just not ready while those records are still needed (`READ_RECORDS` → `HOSTNAME_UNREAD`);
  **only the answer to the question asked is read**: a create must return exactly the name sent, a read must return exactly the id
  asked for (`READ_MISMATCH` otherwise), a lookup by name must consist entirely of that name's entries — an unreadable entry or
  one for another name makes the whole answer an error, never "nothing there"; the id on a row is never
  replaced. Deletion counts only
  when Cloudflare says it succeeded (`success: true` or 204); for a name removed while the create call was in flight, the returned
  id is kept and its delete becomes due immediately.
- **The probe only runs on its own FRESH hostname read**: a refresh pass that cannot read the name's
  hostname (another pass holds the row, or an error) does not probe and writes nothing; the name falls due again after
  `PROBE_CLAIM`. The card uses the same rule: old HTTPS proof does not show as `ok` when the hostname is no longer
  ready — `connection` carries the gate's reason.
- **A published site connects by itself, no one has to press anything** (`cron.js` `sweepOwnDomainStarts`, 15-second beat, each name
  once every 2 minutes, 10 minutes if an earlier publish carried it but the host has not installed the route): reads DNS like the publish door,
  and names whose TXT is right go along with an ordinary `live` operation. Publish in SaaS mode does **not** send
  `routingTarget` to the host (`connect.<zone>` is not the host's tunnel). A draft site is not published.
- **Per-name ingress rules on the host are kept**: cloudflared picks a rule by the request's Host, so
  a request for a customer name arriving through the fallback origin would land on the catch-all rule (404) if there were no rule for
  that name. Every name still goes to `tracy-web`, never straight to the CMS — the protection against forged `x-tracy-*`
  headers from the previous section still holds.
- **The `connect`/`origin` labels (as configured) are forbidden as site labels** at the site creation door, the claim door and the Tracy
  address change ([`label.js`](apps/tracy-web/src/sites/label.js) `zoneLabelRefusal`, judging the full label including
  `SITE_ADDRESS_PREFIX`): a customer holding `connect.<zone>` would receive the traffic of every own name.

| Data | Where | Who writes it |
|---|---|---|
| A name's custom hostname (`name`, `zone_id`, `site_key`, the hold's `token`, `provider_id`, `state` = `creating` · `posting` · `created` · `conflict` · `deleting`, `hostname_status`, `ssl_status`, `records`, `reason`, `next_at`, `claimed_until`, `claim_id`, `attempt`; and `site_custom_hostname_orphan`: ids of created hostnames no row can carry any more) | Postgres, table `site_custom_hostname` ([`083-site-custom-hostname.sql`](apps/tracy-web/src/db/migrations/083-site-custom-hostname.sql)) — **no** foreign key to `site`/`site_name`, so deleting a site or a hold still leaves the row to do the cleanup | `tracy-web`: `reconcileHostnames` (15-second sweep, Check DNS door, removal door); every write after a network call is conditional on `name` + `token` |
| When to next read DNS for a waiting name on a published site | `site_name.dns_next_at` | `sweepOwnDomainStarts` |

- **Take nothing from anyone.** A `POST` that meets a name Cloudflare already has (code 1406) → `conflict`, never adopted
  or deleted. A `POST` with no answer → `posting`: the next pass looks it up by name; if nothing is found it creates again,
  if found it does **not** adopt it (Cloudflare does not record who created it; `custom_metadata` is an Enterprise feature) but leaves it
  for a person to handle. Only an id returned by the create pass's own answer may be read/deleted.
- **Remove in the same order as the previous section**: the name stops being served (the `site_name` row goes when the host says the rule is removed, or the hold
  is deleted/expires/the site is deleted), **then** the hostname row becomes `deleting` and is `DELETE`d at Cloudflare
  (404 = already gone, counts as done; an error keeps the row, retried later). While that row exists no one can hold the name again
  (`409 DOMAIN_RELEASING`); the hold door tries one immediate cleanup before refusing.

### Website Opportunities (18/10/2026, Phase 1)

**Place profile 1.0.0** (26/10/2026, [ADR 0037](docs/adr/0037-place-profile-is-template-independent.md)):
`website-opportunities/src/place-profile-read.js` has the reader `readPlaceProfile(db, {opportunityId | placeId})`;
the opportunity path uses `placeViewOf` to keep the account's own overlay, the place path reads the current snapshot.
The function keeps all source rows and collector state, drops revoked media, then calls the pure converter
`domain/place-profile-from-research.mjs`. The result follows `domain/place-profile-schema.json`; every fact
has an ID and evidence references; `validatePlaceProfile` checks the shape and the reference graph.
The converters `place-profile-from-brief.mjs` and `place-profile-from-demo-request.mjs` accept the two older
shapes; a sender's statement without provenance carries the source `sender-statement`, never a fake source URL.
The standalone builder sends `demo-request/v2` only when the host announces `accepts: ["profile/1", …]`; it feeds
the research it has read into the pure converter and does not take editorial sentences from the brief as facts. V2 carries
profile 1.0.0 and a list of at most 24 picture URLs to download (logo included), at most 512 KiB of JSON in total,
200 offerings, 50 people, 100 quotes; any `assessment`/`verified` key anywhere in the profile is rejected.
A host that has not announced it still receives the old v1 path. If the host rejects schema v2 (`SCHEMA_UNSUPPORTED`, HTTP 422),
the sender projects the frozen profile down to v1, writes the body and a **new idempotency key** into the same
`wo_tracy_demo` row by CAS, then resends once, with a log line. A retry after a timeout keeps the stored body/key.
The host accepts v2 and announces `profile/1`; v1 keeps its import path unchanged. Migration 177 adds one column
`wo_revision.place_profile` (nullable JSONB, protected by the existing immutability trigger), no new table.
The envelope holds `profile`, `profileSchemaVersion`, `converterVersion`, `profileHash` (SHA-256 of the
canonical JSON of the whole profile), `origin`, and `assessment: {profileHash, evaluatedAt, seenAt, facts}`.
Each assessment has `factId`, `status`, `reasonCodes`, `policyVersion: demo-evidence/1`. Internal research
is converted from exactly the frozen read; v1 goes through an adapter; v2 keeps the sender's profile as is. A public request
is pinned into `selection.researchInput.demoRequest` in the transaction that accepts the action; pictures are downloaded only from
`photos[]` (a v2 logo sits under the same cap and is downloaded once). Refreshing a public opportunity looks up exactly
`provider_id` + opportunity + account, so a sender's statements never turn into internal research.
The policy (`domain/fact-assessment.mjs`, one copy for the host and the temporary read path) trusts the origin the host recorded, not
the source label the sender declares: identity/contact/offerings/hours are accepted, people/claims/testimonials are held back.
Reviews, Google/Tripadvisor ratings and review counts, customer photos and reviewer avatars go onto the demo (decided 26/10/2026):
research accepts them like any sourced fact; a sender may only pass on reviews/ratings when every source is a
Google/Tripadvisor page with an https URL (`platform-cited`); reviews the sender wrote themselves are still held back. Facts that still carry
`not-on-demo` (profiles frozen before that date) never enter any slot; past 365 days,
counted from the fact/source time or from the `seenAt` of old provenance, a fact is stale. Quotes not yet assessed
are not projected into legacy content; links without evidence/stale and restricted/stale pictures do not enter
the build source. Valid media, brand and booking remain unverified observations, as on the v1 import path.
The reuse key adds the profile snapshot version and the full request hash;
a new acceptance never reuses an old revision without a profile by mistake, a retry naming an old revision keeps it.
An assessment is always created fresh with the profile snapshot, never carried over from another hash. Integrators read `offerings[].value`,
`quotes[].value`, `media[].value`; how much was found is in `coverage[]`.

**Place profile door and slots (26/10/2026, ADR 0037).** `GET /api/website-opportunities/:id/place-profile` (WO package,
`src/route.js`) returns the 1.0.0 profile of the current research, read-only, with no provider call; the Details page reads it.
Each release may ship a sidecar `contracts/**/slot-roles.json` next to its contract (Joomla/WordPress in the
`tracy-*-quickstart/contracts` tree, EmDash in `tracy-emdash-theme-*/contracts`), which enters the tracy-web image in the same
`COPY …/contracts` pass as the contract; `planSlotFill` (`domain/slot-fill.mjs`) locks each slot group to one
accepted entity. Slot roles are the third group of the **Content coverage** step of Road to live
(`lib/content-coverage/roles.js`, ADR 0038): it reports text and image slots without a role and a stale or invalid
declaration, holds Publish for a release not yet shown on Design inspiration and only warns for one that is; the `slot-roles` gate (`scripts/slot-roles/check.mjs`)
guards every committed sidecar. A revision reads the profile + assessment frozen in `wo_revision.place_profile`; if building
the profile fails, the revision is still created with a null column (logged) and is read like an old revision.

**Code layout (24/10/2026, [ADR 0036](docs/adr/0036-website-opportunities-independent-public-repo.md)) — read before every paragraph below; older paragraphs that mention `opportunities/…` describe the path before this date.**

| Layer | Where | Used by |
|---|---|---|
| Open: find, assess, outreach, seller pipeline, place store, bundle `tracy-wo-place-bundle/v1`, cost ledger, own schema | `packages/wo/website-opportunities/` (package `website-opportunities`): `src/` (server), `domain/`, `src/schema/` (`0001-baseline.sql`, `migrate`, `verifyWoSchema`, `adoptWoSchema`) | `tracy-web` imports by package name `website-opportunities/src/…`; a public repo later |
| Tracy's demo build: revision, build, demo action, handoff, retention, QA, quality, quickstart, own-site | `apps/tracy-web/src/opportunities-build/` | Tracy only |
| Public contract `website-opportunities/demo-request/v1` (validator + small builder) | `packages/wo/website-opportunities/domain/demo-request.mjs` | sent by the `tracy` builder of the open repo; checked by `/v1/demos` |
| Standalone run (single-operator host, principal `wo_principal` kind `operator`, picture store on disk `DATA_DIR`, web page mount point `serveUi`; no Tracy imports) | `packages/wo/website-opportunities/src/standalone/`, `Dockerfile` + `docker-compose.yml` at the package root | the "stranger" test |
| dsh client | `packages/site/tracy-website-opportunities/` (`@tracy/dsh-website-opportunities`, `lib/client.js` committed) | bundle `tracy-native` |

- **`/v1/demos` — an outside builder asks for a demo** (24/10/2026): a third door into the demo build flow, only on the api host, Bearer account token with scope `demos` (part A; seat key → 403 `ACCOUNT_TOKEN_REQUIRED`). Body `website-opportunities/demo-request/v1` or `/v2` ≤ 512 KiB; unknown fields (`accountId`, `ownSite`, `verified`, `objectKey`…) → 422. Each request is an immutable snapshot: a `wo_opportunity` of the account's own (provider `external:website-opportunities`, `place_id` null, writing only its own `wo_profile`/`wo_source`/`wo_media` — never the shared place tables), then it calls exactly `acceptDemoActions` (counts `wo_demo_usage` kind `external`, does not use up the daily quota of the Build demo button). Pictures: Tracy downloads them itself through `fetchLimited` + pinned fetch (every hop, IPv4/IPv6 separately, metadata), ≤ 24 pictures, 5 MiB/picture, 48 MiB/request, 40 MP, 60 s; a non-public URL → 422 before anything is downloaded or written. **One transaction** holds the account lock, checks replay by key (same body → same receipt, different body → 409), checks the `liveDemosPerAccount` cap (default 20 live demo sites through this door; deleting frees a place; expired but not deleted still counts; cancelled before the build starts does not) → 409 `DEMO_LIMIT_REACHED`, the model budget (only for demos of accounts without a connected AI account: holds `sponsoredDemoMaxCents`, monthly total `sponsoredMonthlyBudgetCents`) → 503 `SPONSOR_BUDGET_EXHAUSTED`, imports the snapshot and accepts the job. The numbers are set in `/ops/wo` › Settings › Demos for outside builders (`GET|PUT /api/ops/wo/public-demos`, table `wo_sponsor_setting`, not in the open package's settings). Status `queued|building|needs-review|ready|failed|cancelled`; `ready` only when QA `passed`; `retention` reads the WO demo clock, and reading does not extend it.
- The open layer touches Tracy through exactly two doors: `deps.host` (contract `src/host.js`, 15 functions `HOST_MEMBERS`, including `principalOf`/`displayNameOf` instead of reading the `account` table; Tracy adapter `apps/tracy-web/src/wo-host.js`) and `deps.builder` (`opportunities-build/route.js` `createWebsiteBuilder`: `routes`, `settingsOf`, `saveSettings`, `listedDemoOf`, `detailOf`, `demoFactsOf`, `demoJourneySql`, `templateChoicesOf`). No builder → no demo fields; stage is computed from research only.
- The open layer does **not** import `opportunities-build/` and does **not** read the `wo_revision`/`wo_build`/`wo_demo_action` tables in SQL; stage/attention get the demo half through `demoJourneySql`. Tests: `packages/wo/website-opportunities/test/package-boundary.test.mjs` (no import escapes the package root, only declared deps), `apps/tracy-web/test/website-opportunities-open-journey.test.mjs` (a DB without the build tables), `scripts/test/tracy-web-wo-package-image.test.mjs` (image layout).
- `tracy-web` image: the package is COPYed into `/opt/tracy-web/node_modules/website-opportunities` (the image's own lockfile cannot resolve `workspace:`); dev machine: the root `package.json` links the package with `workspace:*`.
- The `wo_principal` switch (7 FKs `account` → `wo_principal`, two triggers on `account`) is **in the deploy chain**: `171-wo-principal.sql` (non-locking backfill, then lock child tables before `account`, FK `NOT VALID`) + `172-wo-principal-validate.sql` (VALIDATE without blocking writes). Lock measurements and reasons in `packages/wo/website-opportunities/src/schema/transition/README.md`. `migrate()`/adopt is not yet wired into Tracy's boot.

**Find by name/address** (21/10/2026): the unified Find box sends free text with
`intent: place` to Google Places Text Search, at most one page of 20 results, not through Nominatim,
never replacing the query with a place type or bounding it in a circle. Picking a business suggestion reads exactly that
Place ID and ends the autocomplete session with Place Details; picking a city/area keeps the
explore-around-an-area flow. Old clients that send no intent work as before. Only a single result that
Google confirms as a geographic type switches to explore-around; no result returns an empty list.
Labels/translations and search memory keep the intent; a place name does not turn into nearby when
the tab is reopened. A Search action never calls Research or creates a site.

**Pictures configuration** (21/10/2026; since 24/10 captured into `wo_build.choice.picturePolicy` when the build is written): the four `/ops/wo` options
are read through `brief.picturePolicy` of the revision with choices applied, before every build/editing step; a retry keeps the snapshot, an old revision without a policy
reads the compatible default. `site-pictures.js` turns curation on/off and caps a Vision shortlist that is stable
across retries; the model comes from the **Read pictures** assignment, env only when no job is assigned. Agent
handoff takes `handoffMaxPictures` from the revision; `shapeReal` only allows the image generation kinds that
`missingHeroMode` permits (real-only calls no model and no generated-image cache). Editorial caps
pictures with `min(maxVisionPictures, 24)`, always reads pixels as evidence and uses only real pictures;
the curation, handoff and imagegen switches do not change this contract. Changing settings does not change sites already built.

**Editorial pilot on localhost** (`opportunities-build/editorial-pilot.js`, 20/10/2026): an internal CLI that only accepts
a `tracy.test` stand, test accounts `@example.test` and owned sites prefixed `wo-editorial-` on the same
host. It reads the revision with the website snapshot, checks the real archive/version/seed, then closes the input hash.
A reasoning pass picks sourced passages for hero/About; the validator and compiler fetch the verbatim text again
and accept no CMS command generated by the model. `apply` goes through the lease, the existing EmDash writer, readback,
`wo_build.content.writes` and Site changes; it does not change the revision or the shared profile. Input, decision
and usage files live in an evidence folder the operator names. `prepare` calls no model;
`plan` makes at most one call per folder, and a started marker blocks a retry that could be billed twice. `inspect` only reads.
`resume` only reruns a failed brief of the same demo, using the stored normalization and the existing EmDash
engine; it does not sweep other sites for recovery and calls no further model. The pilot is not yet wired to the worker or the ordinary
create-demo button, has no model role or new run table, and does not yet edit the whole site or pictures automatically.

**Foundation for the seven WO quality parts, not enabled in the normal flow** (20/10/2026,
`opportunities/quality-*.js`): the dossier keeps predicate/branch/time/source spans, the manifest reads from the
capability snapshot and the seed of the exact release, the validator compiles decisions into a finite set of
operations; observations/placement and the reviewer have their own contracts. Migration 148 stores immutable input/policy
in `wo_quality_run`, each attempt with its reservation in `wo_quality_attempt`, intent
and before/after in `wo_quality_operation`; `wo_cost_ledger` adds account/action/build and checks the
account cap under the same reserve lock. Dispatch is recorded before the call; a lost receipt stays uncertain with
money held, and is never blindly called again. Migration 150 moves the shared limits into `wo_quality_intent`: generation
and semantic input are immutable; repair counter, deadline and job budget are shared across revisions.
`wo_quality_run.intent_id` is an append-only binding to exactly one account/opportunity; attempts are cached by
intent/stage/input+model fingerprint. Changing config/keys does not grant new limits; A→B→A accepted by the user
counts as 3 generations, there is no unique semantic hash across all history. The adapter reads the existing
assignments, verifies reasoning/vision and a bounded price table; it keeps no key or reasoning content in the receipt.
`createRevision` accepts an optional internal preparer: short prepare transaction → model outside the transaction
→ finalize with the same input hash; **no ordinary caller passes this preparer yet**. No model call
or new demo has gone through this foundation yet. The executor refuses a receiver without evidence of conditional write/
publish/restore; a synthetic measurement on the installed EmDash 1.1.0 module reproduced the `_rev` race, so
there is no production apply adapter yet and it is **still NO_UNDO_ON_EMDASH**.

Migration 151 adds `wo_preference.quality_mode` (off by default, shadow = artifact only, apply), a
server-held protocol on the action and an immutable action→run binding. The `quality-*-v1` namespace keeps terminal states too;
a DB constraint refuses a downgrade to legacy queued/failed. A separate queue only accepts accounts that the composition
root enables. The create door checks build/revision/run, fence,
mode and release/archive before claiming; `site_brief` carries the quality marker before provisioning and the receipts are
idempotent; it runs neither the normalizer nor an open handoff. The frozen revision envelope/root is stored in one
transaction before the model; a restart reads the stored envelope, and finalize checks the reference. This is still a line being
wired: composition A–D is not complete, there is no live candidate; migration 151 has only been verified on a scratch database.

The preparer `quality-editorial.js` reads inputs through `quality-inputs.js`, closes Site questions and the
language policy from the standard door, then runs A/B/C1/C2 with a headroom callback before every call; tests use
a fake provider and real PNG pixels. `quality-budget.js` estimates the global review and two repair rounds too, reconciles
paid slots with attempts/ledger, and does not accept a single artifact as proof of spending. The cost ledger checks
the remaining required amount under the same reserve lock; this is admission, it does not hold money for the future.
Usage receipts use a verified peak upper-bound price; the ledger still rounds up to the cent. Policy `/3` allows at most 64
attempts; no live A–D model, composition apply, screenshot reviewer or new demo has passed acceptance yet.
The normalizer has an internal seam `seedModelFetchFor(input, door)` to meter each HTTP attempt on a separate
stand; the original provider URL is unchanged, so the policy that turns off thinking by the seed model's hostname does not change.
Without the seam, the `seedText` request/assignment and draw-image work as before.

The composition `quality-pipeline.js` requires an explicit deployment adapter and account allowlist: preparer,
finite CMS fill, browser capture/mechanical checks and blind vision review share one root/ledger. Review
keeps full captures/slices, the CMS content hash and the exact-revision precondition before repair; a later human
edit or a replaced installed ID is a conflict. The owner-only evidence route is
`/website-opportunities/quality/runs/:id`, JSON/Stop at `/api/website-opportunities/quality/runs/:id`.
There is no generic EmDash Undo; only native conditional compensation with verified receipts.

An experimental local stand has its own web/host/DSH and its own roots/home/session, and does not tick the global collector or
maintenance. The legacy meter keeps the real upstream URL/payload; normalizer execution binds to the
logical action/build/brief/provision job, native binds session ancestry/site/seat, so a queue releasing a
lease does not cut a valid background execution. A new retry fences the old worker; a dispatched request
must settle the usage it knows about; Stop/unknown grant no new call. Migration 152 durably binds the two comparison arms,
minting no root when switching arm or restarting. The local run source has a content manifest including
dirty code, never Git HEAD alone as evidence. This is a pilot composition under measurement,
not a claim that all of W1–W7 pass live or that the shared adapter is enabled on the fleet.

Legacy Retry QA may only start a new round when acceptance has locked the exact build and stored
`qa.acceptedRetry` (action/build, hash of the failed QA and generation) in the transaction that creates the action.
Resume does CAS on the exact failed snapshot/generation; a lost reply resends the same request ID without resetting the counter.
A retry that only rescues fill/handoff does not gain the Retry QA right; failure of the action itself is terminal.
Acceptance metadata does not leave through `qaShape`. No migration added and no right inferred from `retry_of`.

The legacy meter only measures image/file blocks at Messages protocol positions (`messages[].content`,
`tool_result.content`, system blocks). `dsh_session_log`, attachment refs and tool JSON stay unchanged
on the wire, count toward the bytes/text bound, but are never taken as pixels or Files access. So replayed
metadata does not cause a real image request to be refused, and image metadata does not replace vision evidence.

Core `snapshot-media.js` is a dependency for reading the public media of a frozen snapshot; it has no HTTP door
and grants nothing itself. The caller provides a trusted resolver; core checks manifest hash/membership, grant and
canonical revocation before/after the object read, bounds time/bytes and decodes real pixels. Each cache
use must be re-checked through the authority; an old receipt is never a permanent right. The Dubai consumer is wired to a
trusted finite grant and its own cache; 174 pictures were verified by SHA/decode from canonical through the authority closure.
The consumer never receives a canonical object key or secret.

The Dubai pilot integration has its own database and schema. Metadata import checks immutable export/sidecar/DDL provenance and
keeps source IDs/hashes/dates; operating jobs are initialised separately by policy, with no fake collection date.
Normal account/opportunity and the Ops switch are created through the existing doors on the separate DB. It does not boot
collector/maintenance/mail. The two arms use the same snapshot and Business 1.7.23; no credentials are copied.

The internal editorial bridge can replace the whole paid executor and model-config reader with a capability
in the same process. The app consumer receives no authority pool/key. The authority reuses the existing quality
root/run/attempt and ledger, binding the consumer's actual UUID through an external binding; it creates no
fake action/build. Every writer of the billing group goes through the same cap of 400 cents/day under the ledger lock.
Readback/evidence and Stop have internal seams; Stop only returns acknowledged after both authority and consumer.
These seams default to the local path. The private authority reads the
registry/key store through the DB and config of the same canonical container, without booting web/cron or resuming the
canonical queue. The consumer still has no canonical pool/key.

To build a candidate for manual testing first, the own composition has a flag
`--candidate-first`: the baseline keeps its partial/queued state and every receipt/input/cost; it never records
the baseline as complete. The own app drops the legacy runner/QA ticks/listener, and the authority blocks new paid dispatch
for the baseline. The candidate still goes through normal WO and the quality pipeline with two immutable arms/inputs. The accept door
has an internal callback that by default grants no exemption from the active-action block; only the Dubai composition grants it when
this flag is on, inside the account lock, for exactly one received baseline action/run/comparison and one pinned candidate
request/label/account/opportunity/protocol. The callback must return strict true; outside the binding it
stays 409. It accepts no concurrency policy over HTTP, opens no allowance and creates no new root. The candidate
receipt records `baselineGate.state=not-complete`, awaiting manual acceptance; it is not a comparison PASS.

An A pass that truncates with reasoning only has its usage settled; the cost is not erased.
The next own composition picks a frozen `manual-review-v1` for new actions/revisions, with the same candidate
intent and old parent run: A/C1/schema 32000 output, C2 at most 8 calls × 22000, provider timeout 600 s and
attempt lease 660 s, all inside profile/config/budget/receipt. V1–V3 are unchanged. The forecast drops D and
automatic patching as required for manual testing, keeps 24 observation pictures and one initial schema repair; dispatch also
refuses D/patch for this profile. After finite fill/readback, the pipeline checks the receipt matches the plan/build and then
records awaiting-human-review/needs-attention; it never records QA passed/completed or confirms human acceptance.

The facts wire keeps the old form when preflight fits the limit, to keep the paid cache. Only when the pure preflight refuses with
`QUALITY_INPUT_LIMIT` does it use a column/row table and a dictionary of exactly duplicated paragraphs; it keeps every
span/offset/provenance and the raw frozen input. It neither merges sources nor drops conditions. The new revision profile
`bounded-v3` allows A 12000 output/70000 input, forecast 200 cents/44 calls; legacy-v1/bounded-v2 keep their
hash and the A 4000 limit. A v2 run that already truncated with a receipt is not reset or automatically re-called with v3.

The consumer takes exactly the producer closure: `executor.mergeProfile` and `place-view` together.
A warm Google Search seed only adds public name/phone/address after checking the source is complete, the ref/externalId
and the Google identity of the exact snapshot/place. Contacts are not echoed into the account candidate to replace the source;
normalized Details are never recorded as the origin of these contacts.

**WO model roles in Model & AI** (`/ops/model`, 20/10/2026): `woEditorial`
(WO editorial) serves dossier reading and the planner, with `reasoning_effort` stored on the assignment;
`vision` (Read pictures) serves observations and screenshot review. Both use `llm_provider`/
`llm_assignment` and the existing sealed keys. `seedText` and `seedImage` are unchanged; draws and vision are
two independent capabilities. Migration 149 adds door/effort and `llm_model_test`: intent/fence,
fingerprint, input hash, reservation, result/receipt; no credential or reasoning content.
The owner/admin door `POST /api/ops/llm/doors/vision/test` takes only a requestKey, uses the stored assignment,
sends pixels through the same bounded adapter/effort/JSON profile as WO and checks the answer in code. The test
spends from the existing cost ledger; a crash/timeout is not retried automatically. The proof expires when config/endpoint/key/
metadata/profile changes or after 7 days. The quality reader refuses a missing capability, proof, effort or
verified price. DeepSeek effort uses the canonical levels that `/models` declares; for other providers without a verified adapter,
no fake effort is sent. The UI keeps unavailable/untested/passed states and
never treats a provider's text test as proof that it reads images. The legacy pictures caller still keeps its earlier
env path; only observations/review consume this assignment/proof once wired into normal WO.

Ops and My Opportunities share the step SQL Research → Demo → Outreach, Cancelled and Attention
in `opportunities/wo-journey.js`. A customer reads only their own account; Ops states explicitly its all-accounts scope at a
permission-checked door, and keeps technical lifecycle fields separate. Tabs and the Step/Status labels on Ops follow the customer's steps;
execution details still keep stage, worker, lease and errors for operations. Ops currently reads at most the 250 most recently
updated opportunities; the counters and filters on screen apply only to the loaded set.


**Contact form of Joomla Tracy Business demos** (19/10/2026). Before sending the handoff prompt, the WO door
checks the build's site against the revision, then calls the internal job `site-demo-contact` on the same host. The job
takes a Backup of all files and the database before installing the system plugin `tracydemocontact`, then fixes exactly two
points of the installed contact override; an unknown layout is refused, no replacement form is built. Without
`email_to` or a receiving account the original form still shows, the send button is locked and a preview notice is shown;
the plugin blocks `contact.submit` with HTTP 409 before the contact/mailer plugin. With a recipient the form
works like stock Joomla. It writes no email and never takes the Tracy account's email; sites created through Add site
and other quickstarts do not go through the job. The next build needs new tracy-web and tracy-host images.


Find restaurants, collect website/social/media, write a brief, then build a demo site, **before a site exists**. Turned on/off by the
`website-opportunities` switch in `/ops` › User Interface (off by default). Off: every door that starts work (settings, capabilities,
search, create, research, resume, revision, build) returns 404 `FEATURE_OFF`; the person's own list/detail/media/revision/build
can still be read, running jobs stop at the next checkpoint with `paused` + `FEATURE_OFF`, nothing is deleted.
- **Public Find** ([`public/wo-find-page.js`](apps/tracy-web/src/public/wo-find-page.js), 23/10/2026): **no session,
  master only**. `GET /find` returns the prebuilt page of [`packages/web/tracy-wo-find-page`](packages/web/tracy-wo-find-page)
  (Vite, mode A; image `COPY …/dist ./static/find`), i.e. **the WO plugin's own Find component** in public mode
  (`packages/site/tracy-website-opportunities/src/client/find-entry.ts`): searches only when the person clicks, reads/writes no history, does not
  geolocate, no pictures, no map, no per-row buttons, at most 10 places, a Continue button. Files `GET /find/find-assets/*`
  (never fall back to HTML), `GET /find/api/capabilities` (read-only), `POST /find/api/search` (the row shape of the session
  search, `status: 'new'`, no pictures). A signed-in person, or one with a shard pointer, visiting `/find` → 302 to
  `/new/?tab=tracy:website-opportunities&wo-view=find` keeping `wo-at|wo-radius|wo-pick|utm_*` (the routing cookie of `/new/`
  sends shard users onward). It answers only when both switches `website-opportunities` and `website-opportunities-public-find`
  are on (the API doors check themselves; off → `/find` redirects to `/login?next=` of the session Find); a shard returns 404, because the Google key and the
  "system-wide" budget (the `rate_bucket` table of the master DB) belong to the master. One search = **one Google request**: the first page (≤ 20 places,
  `maxPages: 1`) of exactly the default Text Search query that the session Find sends, hiding the string as it does; no Apify/OSM, no
  page 2; the budget is held before the call and not refunded; **every number is an operating setting** in `/ops/settings/wo` (`opportunities/wo-settings.js`
  `PUBLIC_FIND_RANGES`, read on every search): default per address 10/minute + 60/hour (IPv6 by /64, reads `cf-connecting-ip`), system-wide
  60/minute + 500/UTC day (0 = closed) — at the list price of ~$35/1,000 Text Search calls with the website field, the daily cap limits
  spend to ~$17/day before the free quota. The location box has suggestions like the session Find: `GET /find/api/places/suggest[/:placeId]`
  (Autocomplete, then Place Details on pick, the same code `opportunities/place-suggest.js` as the session door), with its own fence, also a setting:
  per address 60/minute + 300/hour, system-wide 60/minute + 5,000/day (~$2.83/1,000, ~$14/day); picking a suggestion searches by coordinates.
  Rows of places with **published shared research** show status `researched`, website check and social networks
  (`findResearchOf(pool, …, null)` + `withResearch` injected from `app.js`, one SQL read); nothing of an account
  (`findAction`, opportunity, build, demo) leaks. `wo_place` stores no coordinates, so only places among the 20 Google results can be decorated. Text geocoding goes through
  Nominatim, 1 request/second app-wide, cached in process memory. **Google answers are kept** in `wo_places_cache` for **both the session Find and the public Find** (`opportunities/places-cache.js`, key = hash of the request without the API key and session token; decided 23/10/2026: Google bills per call and allows storing; `placesCacheDays` default 183, 0 = off): the search centre is rounded to the centre of a cell (radius/5, or `placesCacheCellMeters`); a cache hit calls no Google and does not use the system-wide quota; distance is recomputed from where the person searched. Nothing of an account is kept. The picked place travels
  in the URL (`/new/?tab=tracy:website-opportunities&wo-view=find&wo-at=…&wo-radius=…&wo-pick=…`); the WO tab reads it once, runs
  the session search, fetches a missing place again by place id through `places/suggest/:placeId` + search `intent: 'place'`, marks it
  as picked, and does not research it automatically.
  **Research and profile (23/10/2026 evening):** a stranger clicking Research on `/find` → `POST /find/api/research` (Google place id only; the server fetches every fact itself) is queued into a **shared per-place job** (`place-jobs.js`, table `wo_place_public_request`): a published place costs nothing, a running job is joined, a new place only goes through the quota (`publicResearchNewPlacesPerAddressDay` 50, `publicResearchNewPlacesPerDay` 1,000, budget `researchPublicDailyCapCents`); `GET /find/api/research` only reads progress and creates no job. **Build demo** is the first step that requires sign-in (`wo-build=<placeId>` through `/login`). Place profile: social networks follow `providerOrder` in `/ops/wo` › Settings (`domain/capabilities.mjs`; ScrapeCreators first); a place without a website gets its social pages found by web search, kept only with evidence of the branch (`wo_place_link.verified_by='search'`, never leads to merging places); menu links are read into `profile.menuItems` (only dishes with a price on the same line are `verified`; Build uses only `verified` dishes).
  **Wired provider order (24/10/2026):** besides the 4 social network groups, research now reads the order in `/ops/wo` › Settings › Provider order for **Tripadvisor** (SerpApi → RapidAPI → LiteScrape by default), **Web search** (default ScrapeCreators Google search — what research ran before; plus Jina Search, Firecrawl Search; DeepSeek removed from the group because it has no search API), **Menu links** (default website only; plus finding menu links with SerpApi/ScrapeCreators Google search — dishes read from a found link are always `verified:false` because it may be another branch), **Menu photos** (SerpApi, `[]` = turns off just the `menu` call), **Menu dishes** (PDF/page readers only; no vision model yet), **Website content** (default direct crawl → Apify browser as before; plus Jina Reader, Firecrawl scrape, reading the rendered HTML with the same `extractPage`; DeepSeek removed). The default order = the old behaviour. **Not wired yet:** Google reviews (Places Details is the place-facts call and always runs first; SerpApi only supplements) and Find places in an area (the Google → Apify → OSM chain with its own cost fence for both Finds).
- **Doors** ([`website-opportunities/src/route.js`](packages/wo/website-opportunities/src/route.js)): `/api/website-opportunities/…`, every door
  reads the account from the session and filters by account (someone else's = 404). Default CMS per account (`wo_preference`, no
  row = joomla); a CMS is "available" only when `GET /api/templates` has a template for it.
- **Open package** `website-opportunities` ([`packages/wo/website-opportunities`](packages/wo/website-opportunities/README.md), ADR 0036,
  since 24/10/2026): the open server layer in `src/` (doors, executor, place store, `wo_*` schema) and the **domain** (OSM discovery, crawler,
  connectors, media, observed brand, brief) in `domain/`. `apps/tracy-web` imports by package name (`website-opportunities/src/…`,
  `website-opportunities/domain`; root `package.json` links `workspace:*`); the image copies the whole package into
  `/opt/tracy-web/node_modules/website-opportunities` (without `test/`, `docs/`); the package's npm deps live in tracy-web's own
  lockfile. The domain loads through [`src/domain-loader.js`](packages/wo/website-opportunities/src/domain-loader.js) (checks `CONTRACT.version`).
  Tracy's demo build layer stays in `apps/tracy-web/src/opportunities-build/`; the standalone server is in `packages/wo/website-opportunities/src/standalone/`
  (since 24/10/2026 it imports nothing from Tracy; its image builds from the package folder alone).
  Crawling uses address-pinned `fetch` ([`pinned-fetch.js`](packages/wo/website-opportunities/src/pinned-fetch.js)): the connection's own
  lookup refuses private/loopback/metadata addresses (against DNS rebinding). Only the home-page read of site checks
  (`site-checks.js`, 25/10/2026) has a second tier behind the `WO_SITE_READ_TLS` switch (default OFF): a page that returns 403 or a real
  challenge page is read again once with `impit` (Chrome's TLS fingerprint,
  [`escalating-fetch.js`](packages/wo/website-opportunities/src/escalating-fetch.js)), always through a loopback proxy
  inside the same process ([`guarded-connect-proxy.js`](packages/wo/website-opportunities/src/guarded-connect-proxy.js),
  random port, per-process token) — the proxy resolves DNS once, refuses every `isBlockedAddress` address, then connects to
  exactly the approved IP; no extra service. `wo_site_check.read_via`/`read_attempts` record which tier did the read. Social stats prefer ScrapeCreators for
  Facebook, Instagram, TikTok; RapidAPI and Apify are fallbacks. Each network has its own daily cap in `/ops/wo`; TikTok
  via ScrapeCreators reports partial coverage because the API may miss videos. X/Twitter and Reddit have provider endpoints but
  are not yet in the WO schema/collector.
- **Executor** ([`website-opportunities/src/executor.js`](packages/wo/website-opportunities/src/executor.js)): `cron.js` calls it every 5 s; it claims one
  `wo_job` (`queued` or with an expired lease) under advisory lock 7_243_040, 60 s lease with `lease_token` (fencing: every write runs
  in a transaction that locks the job row and compares the token), 15 s heartbeat, `wo_job_attempt` records each claim. Stages:
  discovery → collection (website, then the social accounts found) → media → profile → brand. A source stopped by timeout/rate
  limit/quota → job `paused` keeping its cursor; resume continues. Brand: observations from picture colours (sharp) + bio (`brandFromSocial`,
  origin `website`/`social`); it does **not yet** call the Brand Engine before a site exists (`engine.status: not_integrated`).
- **TripAdvisor reviews and pictures: SerpApi → OneAPI → Litescrape** (21/10/2026): migration 149 adds
  `litescrape_key_cipher`/namespace `tripadvisor`; migration 150 adds `serpapi_key_cipher`. `/ops/wo` Settings
  Save/Clear/Test use the same provider API; a stored override takes priority over env `SERPAPI_API_KEY`/`RAPIDAPI_KEY`/
  `LITESCRAPE_API_KEY`. The SerpApi Test only reads `account.json`, the Litescrape Test only reads `/api/keys/status`; no paid
  search runs. `tripadvisorReviews` is on by default when any of the three keys exists; off means no provider call.
  SerpApi host is fixed to `serpapi.com/search.json`, engines `tripadvisor` → `tripadvisor_place` →
  `tripadvisor_reviews`, search at most 4 candidates/details at most 3/the 20 most recent reviews. Details keeps the ID from the
  matched `search_parameters.place_id`, takes coordinates from the `maps.google.com` link returned with it, calls no geocoder.
  OneAPI uses the stored RapidAPI key, host `tripadvisor-api1.p.rapidapi.com`: `autocomplete` → `details_byid` →
  `reviews_byid` (Restaurants/RESTAURANT, page 1, at most 10, Newest). Litescrape is the last step.
  [`tripadvisor-research.js`](packages/wo/website-opportunities/src/tripadvisor-research.js) runs in the **same**
  place executor/lease/ledger. Fallback is per step: search/match, reviews, gallery; after a match it reads only the one
  pinned TA ID, and never searches again to switch branch when reviews fail. Auth/quota/network/schema/application
  errors or missing branch evidence move on to the next provider; a valid empty/no-match, a contradiction, ambiguity,
  identity conflict and budget/lease/cancel never call the fallback. HTTP 200 with an error is still an error. A valid gallery `[]`
  is complete; only a missing capability tries the next source. Good reviews are kept even when pictures fail, and vice versa.
  Each HTTP attempt is reserved first: SerpApi 3 cents (Starter $25/1000, checked 21/10/2026 at serpapi.com/pricing),
  RapidAPI 1 cent (Pro overage 0.4 cents/request, bandwidth not yet reconciled), Litescrape 1 cent (price $0.15/1000).
  These are reservation ceilings, not actual invoices or costs allocated from a free quota. Checkpoints are split by provider/
  operation/job; a restart reuses results; a timeout with an unknown outcome does not resend the same step. A new job does not
  inherit an old failed checkpoint, but keeps a verified identity pin across refreshes, and a global identity collision
  does not merge. Server-owned Google facts are the seed; no candidate overlay is used. The branch tier keeps phone/
  address/location strict to verify identity. If the branch differs, an exact core restaurant name + the same city from
  Serp search.location, or the same official domain, is enough for an association `scope: brand`, `branchVerified: false`;
  a website is not required. Different names are never joined just because they share a group website; several businesses that cannot
  be told apart stay ambiguous. Only branchVerified writes the global identity; a brand association does not change an existing identity
  or merge Google places. The query uses the restaurant name without the locality suffix already in the Google address,
  keeps lat/lon, and does not stuff in the full street address. City is never inferred from an address chunk or from distance alone.
  Capability `tripadvisor-5` raises reviews to 20 and backfills old sources without forcing fresh Google/social to run again.
  A refresh reuses a matched association that still fits the Google facts and skips search; it still calls Place by ID and
  re-verifies before fetching reviews. An ID pinned only by a failed pass is not enough to skip search.
  The full cron passes the same `reviewSourcesRequired(runtime)` into `joinPlace`; website-only makes no paid call.
  Reviews/aggregates are kept in the source snapshot → `profile.reviewSources.tripadvisor` → place view/revision/
  handoff/QA. Reviews keep verbatim text, name, authorUrl, authorAvatarUrl and photos with reviewId/sourceUrl/mediaId;
  a refresh that switches provider keeps the good optional metadata of the same review ID. An avatar is only the reviewer's identity,
  never business media. Gallery and review pictures go through the standard media ingest (SSRF/size/type/image checks,
  object store, lease fencing), at most 10 pictures; pictures attached to reviews come first. `wo_place_media.credit` keeps the TA place ID,
  review ID(s), source URL, gallery/review kind and provider; the photographer is never inferred from the reviewer. No
  brand colours/business facts are taken from customer photos. Brief assets/manifest keep credit/sourceURL/postId; the demo build
  reads exactly the pinned ID+sha and drops revoked media.
  The brief keeps the actual TA name/address/url and scope; brand reviews/ratings/photos are not separate evidence for the
  Google branch. The customer screen `/new/?tab=tracy:website-opportunities` → Details shows the actual listing name/link/
  address before the reviews, with profile/avatar and the pictures
  attached to each review; Google keeps its own section/attribution. No data means no section and no error banner;
  quota/provider diagnostics only in admin/logs. `tripadvisor` is not in the social collectors enum.
- **Google Maps menu pictures in Research** (22/10/2026): users and admins run the same place job,
  source `google-maps` through SerpApi, independent of the official Google Places. When metadata is missing, it resolves
  Google place ID → photos overview, takes the Menu category actually returned → at most 20 menu pictures; no hard-coded
  category ID and no self-pagination. Data ID/category is cached per place; a refresh with valid metadata
  only calls menu, a still-fresh snapshot is reused without calling the provider. Each step goes through lease/checkpoint/charge ledger.
  Reviews and pictures returned along with it are used; Google reviews duplicating the official source are conservatively dropped, avatars
  are only used for reviewer identity. `profile.reviewSources.googleMaps` keeps provenance, metadata and pictures;
  menus go through the existing media ingest, keep the menu category and the Google credit, and enter the brief/handoff as source
  pictures to read before writing content. A picture is never taken as the current dish/price list, nor used as the hero.
  "No menu found" is cached; an optional error keeps good data and shows no quota/provider error to the user.
- **Shared research** (19/10/2026, `WO_SHARED_RESEARCH`, on by default; `=0` off): an opportunity of a recognisable place
  (`places.js identityOf`: google-places/google-maps, osm, url) runs no research of its own — the request (`wo_job` with `place_job_id`,
  [`place-requests.js`](packages/wo/website-opportunities/src/place-requests.js)) waits on **one** shared `wo_place_job`
  ([`place-jobs.js`](packages/wo/website-opportunities/src/place-jobs.js), [`place-executor.js`](packages/wo/website-opportunities/src/place-executor.js)):
  a fresh place (every source collected < 30 days ago) → returns the current snapshot at once; running → waits; Cancel only cancels one's own request (the place job
  stops when no one is waiting any more); Force drops the freshness condition, at most one pass after the running one. The shared run only reads the place's
  identity + links (Place Details `websiteUri`, social from the website), never the candidate; a candidate's own sources become `wo_source` of
  that opportunity and run in their own pass after the place answers. Every paid call of the shared run goes through `cost-ledger.js`; over the ceiling →
  `paused` with reason `budget`; a new place counts toward the per-account abuse limit (`newPlacesPerAccountPerDay`). Reads: detail,
  brief = current snapshot + the account's overlay ([`place-view.js`](packages/wo/website-opportunities/src/place-view.js)); a place
  without a snapshot → reads its own row as before. Flag off: new requests run the private path, place jobs are not claimed, published snapshots
  are still read; a shared request that is Resumed while the flag is off reruns on the private path.
- **Place research across deployments** (23/10/2026, slice 1, migration 166):
  a sending deployment pushes the published research of a place to the **master**, which receives it through
  `POST /api/internal/wo-places/v1/ingest` ([`place-ingest-door.js`](packages/wo/website-opportunities/src/place-ingest-door.js)),
  header `x-tracy-wo-places-secret` = `WO_PLACES_INGEST_SECRET` (unset or shard → 404; constant-time compare before reading the
  body; body ≤ 4 MB). Only DB rows travel; picture bytes are already in the shared bucket (the receiver HEADs each object; a wrong size/missing → nothing
  is published, `media_missing`). Sending: [`place-export.js`](packages/wo/website-opportunities/src/place-export.js) reads named columns
  of the place tables (no opportunity/job/brief/private source/cost ledger/account; link evidence keeps only `from`; `operator`
  links do not travel; only `published` + `full` snapshots; pictures still under `places/…` are refused) — command
  `scripts/push-wo-places.mjs`. Receiving: [`place-import.js`](packages/wo/website-opportunities/src/place-import.js) only writes tables
  in `IMPORT_TABLES`, unknown fields → `invalid`; it only fills places **without a snapshot** (already present `skipped_existing`, being researched
  `retry_later`, identity pointing at two places `conflict`), one transaction, ids generated by the receiver. Each POST that passes the secret and the size cap writes one
  `wo_place_import` row; its `origin` is the **sender's self-declared name**. Snapshot provenance: `wo_place_snapshot_import`.
- **Shared social across deployments (opt-in, migration 146):** `WO_SOCIAL_ROLE=standalone|central|client`, default standalone for compatibility. Central is still the existing web app: `wo_social_stat`/alias are canonical, the same collector/runner/credential store/quota/cost ledger, plus an immutable `wo_social_snapshot` and an authority UUID. An alias has a revision independent of the snapshot version (bigint sent as a string, not a commit cursor). `social-service.js` writes the receipt `(deployment_id,operation_id)` and enqueues in one transaction with a binding/generation fence; a retry with the same UUID does not force again even if the handle changed owner.
  The server-to-server API `/api/internal/wo-social/v1/{lookup,refresh,operations/:id}` uses Bearer `wos_...`, HMAC with its own `WO_SOCIAL_KEY_PEPPER`, scopes read/refresh only; no seat cookie, seat key, shard key or session secret. A deployment has reads/minute, refreshes/day and forces/day (UTC), default 0; key rotation keeps the deployment ID and quota. Ops owner/admin with the same Origin provision deployments/keys through `/api/ops/wo/social/...`; a key is returned once, revocation is permanent.
  A client configures a fixed HTTPS `WO_SOCIAL_ORIGIN` and `WO_SOCIAL_TOKEN`, and initialises no provider collector. `wo_social_outbox` keeps the operation UUID across HTTP calls with unknown outcome; `wo_social_replica_{authority,identity,alias}` pin the authority and store version, binding revision, original fetchedAt and a separate syncedAt. Offline returns the old snapshot as `stale` + an error; no provider fallback. Missing config or a changed authority fails closed. While legacy queued/active/uncertain attempts remain, refresh/outbox is blocked to avoid a cutover that pays in two places; reconcile before changing role, never delete ledger/attempts.
  `wo_place` and the research catalogue stay local. `wo_place_social_link` only references identities verified from local links the server proved; an owner change/negative binding revokes the mapping and never moves the business to the new owner automatically. Rich social collection has no shared contract yet: on a client it reports blocked `shared_social_required`, stored data can still be read; website/discovery keep the old behaviour. No claim is made that rich content is synchronised.
  **Deployment status 20/10:** code and test fixtures exist, not active across environments. The intended topology is `https://tracy.test:8443`, `https://cowork.tracy.site`, `https://cowork.tracy.ai`; authority origin/credentials/allocation are not yet provisioned. Direct acceptance is required before ready/merge/deploy.
- **Pre-enrichment by city:** `social-prefetch.js` keeps a read-only planner. The Dubai pilot in `dubai-prefetch.js` runs ahead on **the same Research workflow as customers**, with no separate collector. Migration 147 keeps campaign/seed stopped by default; 148 keeps the discovery receipt; 149 adds mode/full, priority independent of the billing campaign, and the rich social receipt. Only `central` + shared research + the WO switch has a 15 s cron; no OS crontab and no cron per environment.
  An owner/admin with the same Origin imports a fixed Google Places Text Search list (at most 3 pages of 60 results, within 10 km around Burj Khalifa); OSM is not used as a production source. Migration 151 keeps the full candidate pool and Find's admission response. It shares `find-ranking.js` with Find: dedupe before markChains, drop identified chains, keep places without a website and temporarily closed ones; score with the same Opportunity score, descending, ties keep source order. It picks at most 50 from this pool, with no claim to be the top 50 of all Dubai. Each tick updates scores from cache and steers the order of not-yet-claimed jobs; job/snapshot history is kept. A score without a website check is provisional. It stores request/response hashes, page receipts and original fetchedAt. Reservation+starting is atomic before the POST; unknown is never POSTed again; upgrading an imported list only reads received receipts, and stops if a receipt is missing. No discovery on every tick; a source older than 30 days stops.
  Continuation through a cursor keeps the first profile field that has a value and unions social links; a new collection pass starts empty.
  A rich source receipt stores known terminal `failed/not_found` as received/settled, never turned into success
  and never revoking identity (an HTTP 404 from an actor endpoint does not prove the profile is gone). Negative refresh TTL 1 hour;
  the same job consumes the pinned terminal receipt with the original fetchedAt, a new job follows the existing TTL/force policy.
  Transport/provider error/timeout stays starting/unreconciled and does not expire on its own to POST again.
  The same `joinPlace`/`wo_place_job`/executor runs discovery→collection→media→profile→brand, using Research's keys/settings. Migration 150 adds a choice of 1–3 global background jobs (default 1); local with 3 chosen has 4 slots per process in total and keeps 1 admission slot for users. A mutex covers capacity→claim→running.add; a transaction advisory lock keeps the background cap across several executors, counting promoted campaign jobs too. Lowering the cap waits for active jobs to drain and cancels no paid receipt. Users claim first; a customer joining a full job uses the same job/snapshot and promotes its priority, keeping the billing campaign. Cancelling a request does not delete campaign demand; stopping the campaign does not cancel real user demand. Historical website-only jobs keep scope `prefetch`; new jobs use `full`. Full means exactly the workflow, not a promise that every place has complete data or that the Brand Engine is integrated.
  Every paid call of the campaign goes into the existing ledger, default lifetime ceiling 100 USD, plus day/job caps in Ops; admission reads kill/user demand/real leases. Rich social and browser fallback use the same existing collector through a receipt before a paid start; unknown keeps the ceiling and blocks retry even with force/job replacement/place merge. A received response is stored before publishing, keeps its original age, and gets a new generation when the source is due; quota/rate-limited/blocked cool down for 1 hour. Google Details/photos/PageSpeed keep the existing Research path. Legacy website-only still has no credentials/media/provider calls.
  `/ops/wo#dubai-pilot` tracks name/score/reason/source/job/error/fetchedAt, stored pictures, links that open source/media records, and Research's real committed cost ceiling. Preview pictures in the profile use GET `/api/ops/wo/prefetch/dubai/places/:id/media/:mediaId`, staff auth, only stored/current pictures of that seed, revocation re-read, private no-store; no provider call. The Find part before Research uses the existing site-checks/social-stats queues, batch 60/40 and an auto-limit in Ops; no force. It persists `not_queued`, terminal and deferredUntil so admission responses are not forgotten on each tick. Central uses account:null and does not fake a customer account; stats still fall under their own quota/provider ledger and are not wrongly added to the Research campaign ceiling. Stop blocks new Find admission; shared checks already accepted keep their existing receipt/lifecycle. `wo_place` stays local; the full place profile is not yet distributed across environments. Enabled only for Dubai on a local stand; not yet for other cities, nor on dev/production.

- **Shared social status** (`social-stats.js`, `social-apify.js`, migrations 144–145): cache `wo_social_stat`, TTL 7 days,
  shared between accounts. ScrapeCreators is the first tier for Facebook (`/v1/facebook/profile` + `/v1/facebook/profile/posts`),
  Instagram (`/v1/instagram/profile`) and TikTok (`/v1/tiktok/profile` + `/v3/tiktok/profile/videos`); each endpoint usually
  costs 1 credit, cached reads may be free. TikTok via ScrapeCreators always reports coverage `partial`: the provider states it may
  miss posts even after pagination. Default caps 10 endpoint calls/day/network; 0 turns the tier off. Facebook continues through
  RapidAPI → Apify TopAPI 0.1.9 (20 posts/$0.03); Instagram Looter2 → Stable →
  Apify official profile 0.0.649 (12 posts/$0.01, no about-account); TikTok api23 → Apify mu0i 0.1.16
  (10 videos/$0.03). Each network has only one actor with a pinned build; the Apify tiers are off by default in `/ops/wo`.
  ScrapeCreators has X/Twitter and Reddit endpoints but WO does not yet support these two networks in its schema/collector.
  An async runner holds money through `wo_cost_ledger`, checkpoints before the POST, stores late receipts and resumes by run ID;
  unknown is never POSTed again, even with force; polling does not count as a new start. The ceiling stays after terminal because fees may be provisional.
  Provider/account admission happens before the call; if the DB quota or settings cannot be read, the whole chain stops. RapidAPI must have
  a `socialStatsProviderCycle` granted for the exact cycle, including limit + usage before the grant point; missing/exhausted → deferred,
  never routed around to a paid fallback. The official Google API reads channels + uploads (Shorts included), with its own grant
  `socialStatsYouTubeDailyQuota` per Pacific day (default 0), separate from the UTC abuse cap; a timeout still counts the units sent.
  RapidAPI headers only keep the quota numbers for reconciliation in `provider_quota`; allocation is never raised automatically. A key shared by several machines
  needs the operator to split it within the same subscription; one machine's DB does not guarantee the quota of the whole provider account.
  `wo_social_alias` keeps URL key → owner `network:id:platform_id`, provider source, observation date and verification; past the TTL the
  handle is re-verified. Snapshot/binding publish is atomic with a lease fence, locking owner/alias in a fixed order; admission
  re-reads the binding just before `starting`. Forcing known aliases uses one generation. A handle that changes owner is published to the new
  owner, without modifying the old owner's identity/snapshot. Legacy active/uncertain attempts stay where they are; a paid result waits in
  `apify_attempt.phase=publishing` if the target owner is still busy, converging after terminal with no further provider call. Two aliases whose
  ID is unknown may have paid twice; both receipts/ledger entries are kept. Never merge by place name or client-declared links.
  Unreadable data keeps null/partial and the old snapshot; all-zero TikTok does not prove the account is empty, yt-api Videos is always
  partial for the whole channel; `/c/` is not guessed from a handle/username with the same text. The research collector is unchanged.
- **Warm profile from snapshot** (`place-view.js`, `executor.js`): the account candidate still has priority;
  the Google Places Search seed of the snapshot itself comes before website/social when aggregating evidence/conflicts.
  The seed must be complete, its ref equal to externalId and its Google identity still belonging to the same place; the latest seed
  is never read from a campaign or stuffed into a private candidate. Reading never modifies a public snapshot
  and never infers the seed as Google Details. Detail and brief/revision use the same view.
- **Revision = site brief** ([`revisions.js`](apps/tracy-web/src/opportunities-build/revisions.js), migration 165, 24/10/2026):
  an immutable snapshot of research, carrying NO CMS or template (`buildBrief` takes `madeAt`). One brief per read of
  research: `wo_revision.research_hash` (unique per opportunity) hashes exactly the brief object read; a build whose research is unchanged
  reuses the brief, and `wo_demo_action.revision_id` moves to it in the same transaction. The build's choices (CMS,
  template, workflow, `picturePolicy`, rendered markdown) live in `wo_build.choice` + `choice_key`, settled when the
  build row is written ([`build-choice.js`](apps/tracy-web/src/opportunities-build/build-choice.js) `withBuildChoice` overlays the revision for
  every read at build time). One live build per (brief, `choice_key`). Exception: quality-v1 keeps a brief per template,
  one brief per build, never reused. The door `POST /revisions/:id/build` is removed; `POST /:id/revisions` is Refresh.
- **Build v3 — accept the intent before doing the work** ([`demo-actions.js`](apps/tracy-web/src/opportunities-build/demo-actions.js),
  [`demo-runner.js`](apps/tracy-web/src/opportunities-build/demo-runner.js), migration 143): one transaction locks the account,
  dedupes `requestId`, holds a `wo_demo_usage` slot per UTC day and writes `wo_demo_action`, then returns **202**. A bulk request is accepted only when
  there is room for the whole batch; default 20 actions/account/day (`/ops/wo` › `demoBuildsPerAccountPerDay`), 0 removes the cap
  but still counts; 429 `DEMO_BUILD_DAILY_LIMIT` with `usage: {used, limit, resetsAt}`. The manual path and rebuilds go through here too.
  The worker uses the shared `durable-queue` (lease/heartbeat/fencing, four concurrent jobs); the WO tick runs with the research executor,
  and stops when the switch is off. Revision, build request, session and prompt have ids fixed by the intent, so a lost receipt or
  restart picks up the same site/chat. Internal retries add no usage; the Retry button writes a new action with `retry_of` and keeps the
  ids of the old work. An intent older than two hours stops with an error. The worker cookie is re-signed per account, no browser cookie is stored;
  the build still goes through `POST /api/sites` itself, keeping that door's permission/quota/template/site_design checks.
  The build receipt keeps `demoActionId`: an accepted failure of the current action does not re-provision on its own because of
  app/DB clock drift. Fill Retry keeps `timings.woRetryActionId` in the same `failed → queued` transaction; the same action does not
  restart a fill that just failed, and does not create a brief for a site that has been replaced. A recovery that interrupted
  `applying` records `timings.lostFrom`; Create and Retry leave that row stopped even when no apply ID was saved,
  because a write may have reached the site before its receipt was recorded. A lost provision receipt may
  replay the same `buildId` within the attempt limit; it is the same site, with no promise of exactly one POST. Dying after
  the fill is queued still follows the brief runner's lost-worker detection and needs a new Retry once failed.
  EmDash recognises WO through the link `site_creation.build_id` → `wo_build` before picking a model (callback
  `site-content.isOpportunity` injected into the engine): generic personalize uses `--no-model --no-images`, skipping
  model warm-up/menu; the sourced writer continues after the tool, unsourced parts are left for the agent to write. It does not rely on
  posts or a page plan existing. Errors reading identity/sources and write errors stop the fill; missing sources is a separate result. Ordinary sites
  keep the existing model flow. No second door or data store.
- **Handoff and QA v3** ([`handoff-service.js`](apps/tracy-web/src/opportunities-build/handoff-service.js)) shared by the manual button
  and the worker: provisioned → `site_brief` applied → prepare pictures/contact → hold the session → take a baseline → send the prompt.
  Web re-checks the accepted owner grant in the seat ledger, then asks for a `siteSession` at the gateway's existing HMAC door; folder,
  CMS/preset and ID come from the stored build/site. The gateway registers the workspace, asks native to create/reclaim the same ID, then writes an
  exclusive grant; a revocation while waiting returns no token. Each handoff pass reconciles even IDs that already have a receipt so native
  reloads a blank chat into the workspace after a restart. The browser cannot pick a new ID and there is no random-chat fallback.
  Before prompt/repair, web reads `workspace/follow` with the same seat token; the filtered baseline must contain exactly the chat
  in exactly the site folder so the gateway knows the cwd. No session, baseline or prompt receipt → it reports an error and does not let the page send instead. QA keeps `sessionId` and
  `expectedRequestIds` matching `site_turn.rpc_id` (dsh assigns them from the prompt requestId); the lease token increases on every claim; an old worker
  cannot write results after its lease expires. The watchdog covers both the first prompt and repairs: it wakes once, then stops needing a check if
  there is no matching turn. Only QA PASS moves into Outreach; a successful provision is never taken as a ready demo.
- **Reviews in the demo** (21/10/2026): the Markdown brief by default hands up to five collected Google reviews
  to the agent to fill testimonials/a review page; it keeps the customer's words, real name, rating and Google source verbatim,
  with `googleMapsUri` or `authorUri` when present. Customer opinions are never taken as business information.
  `briefOf` sends `googleReviewTestimonials` (`text`, `author`, `url`) separately to `/_host/demo-qa`,
  outside the true-facts store `briefText`. The browser reads the visible source links (`reviewLinks`); QA accepts
  verbatim quotes when the page shows the author, the Google source and the supplied link. Prices/hours inside a quote
  do not become evidence for business content. The check id `no-google-review-quoted` is kept for
  compatibility with old receipts; what it checks now is attribution. No provider or data store added.
- **Outreach v3** ([`outreach.js`](packages/wo/website-opportunities/src/outreach.js)): reads `placeViewOf` with the same snapshot/overlay
  as Details and the revision; calls no provider. `tinyld` lives in tracy-web, not in the domain package; a caption above the threshold
  beats the Google country/dialling code; multilingual countries or ones without a template use English. Templates in 12 languages are JSON data;
  the signature `account.display_name` appears once at the end of the message. The client only copies/opens the mail/chat app/QR/share;
  language choice and message edits live within one opening of the Inspector. No Sent event is stored or emitted.
- **Real pictures before text** (21/10/2026):
  the three brief engines have a `pictures(ctx)` function that runs separately without calling the text planner. Joomla/WordPress use
  `contract-real-pictures.js`: read the contract → the `real-pictures.js` picker/cropper → upload through Apply →
  the CMS's own contract writer → inspect/readback. When applying a brief that already has real pictures, this step runs
  before the text writes; Joomla keeps the step that pins article order before the writes. No menu/layout changes in the picture step.
  EmDash uses `emdash-real-pictures.js`: derives the inventory from media-map/seed/schema, keeps logo/icon/staff
  pictures and unsupported pictures; a source reader injected from `app.js` reads the real pictures instead of only checking that pictures exist.
  Upload goes through the existing Apply, native PUT/publish with revision, mutation receipt, schema/draft and readback
  fence; a backend without conditional writes is refused, never downgraded to unconditional writes.
  Plan/receipts are in `wo_build.pictures`, no second store/source map. A picture that does not fit gets a neutral placeholder
  and reports a gap; the real-picture step uses no outpaint/scene generation. An unchecked render is not
  counted as passing. The old quality pipeline and account preferences have not moved to the three-step flow automatically.
  The source reader keeps the account/build/manifest/hash/revocation fence and returns all valid pictures to the matcher.
  Vision only considers pictures missing a cache for the right version, picks a shortlist rotating by aspect ratio (or landscape/square/portrait),
  drops near-duplicates, then calls in batches under its own cap; it does not cut the candidate pool by handoff 24. Stop is passed
  into vision, with a strict read for the independent picture step. New revisions freeze `brief.picturePolicy`;
  the runtime uses this snapshot. The UI in this tree does not yet expose the Pictures controls. Ordinary site builds outside WO keep the existing picture mechanism.
  Handoff still uses the receipts to avoid handing over pictures already placed and to name the gaps/out-of-map spots.

- **Finite WO workflow rooted in the quickstart** (21/10/2026, integration being verified): new ordinary revisions
  get the server stamp `quickstartWorkflow=quickstart-first/1`; Add site and historical revisions keep the old engine.
  The wrapper `quickstart-first.js` reads the native CMS, replaces pictures with real ones, then fixes exactly the text regions, keeping the quickstart's records,
  publication, HTML layer and relations. Joomla only reads text params declared in the contract;
  WordPress keeps block/picture/srcset markup; EmDash writes through native revision and publish/readback.
  Prose uses the admin `woEditorial`, observation uses the admin `vision`; `quickstart-model.js` uses durable
  intent/attempt/reservation and checks permission, frozen sources, and Stop before every write/model/cache boundary.
  The reader takes per-invocation overrides, keeps the frozen cap/switch and does not bill generic usage twice.
  The native pipeline currently uses only real pictures; a generation policy does not switch on an implementation that does not exist.
  EmDash checks `write-capabilities` before upload; it needs conditional write/publish/discard and a mutation receipt
  for the write, and never uses an old `_rev` instead. The agent tools layer of every EmDash 1.1.0 quickstart installs
  receiver 22eef37 from a packaged artifact with SHA/manifest/license, then rebuilds exactly that template; no other CMS changes.
  Artifact and recipe are in `packages/fleet/tracy-fleet-operation/web/emdash-conditional-core.*` and
  `install-emdash-receiver.mjs`. COPY inputs take part in the hash so the host does not use an old tools image.
  A card renderer that does not support source links may only be switched to visiting information when the descriptor has
  checked the source proves there is no rating/Review structured data; the code takes real facts, keeps every card,
  changes headings/labels consistently and writes with native CAS/readback. No patches by place name.
  The visual baseline is checkpointed before mutation and reused on Retry. An old pass without a baseline only
  restores the native picture part when the URL comes from the original inventory and the bytes match the seed media of the exact
  release version; the receipt states the picture scope and does not accept the current CSS/text as the old baseline.
  EmDash taxonomy reads terms from the seed and edits label/description through the same model door, writing metadata with CAS
  and a receipt; it keeps slug, locale, order and post relations unchanged. A retry after filled reconciles copyHash,
  every key/structure and the written identity, then only continues metadata/QA; pictures still re-check the real bytes.
  A mutation that is verified but not yet recorded as filled may only be reconciled if the exact after/revision/refs
  and the beforeData projection fully match the filled baseline; changes from the editor are never accepted as a new source.
  A retry after the picture step reconciles the snapshot/revision of every written record and the structure of unwritten records;
  the picture part is skipped only when every picture has a verified receipt. The EmDash logo uses the declared optional
  personalization field, removing the demo picture so the template shows the name as text when there is no real logo.
  Each canonical demo asset + role + aspect + output size is one group, every reference kept in aliases;
  one derivative is uploaded but each alias must be patched/read back. Routes come from the CMS/contract render graph
  and observation; an unknown route conflicts with every route. DHash ≤ 6 still groups similar source pictures.
  When the strict plan lacks pictures, QS alone uses `quickstart-picture-plan.js` to re-pick sources that pass the
  subject/crop/resolution checks, preferring sources less used on the same page, then across the site. Sharp creates derivatives per
  frame; it keeps the source colours and the template's CSS, storing source/hash/cluster/recipe. A derivative is never treated as an independent source
  picture; files with the same SHA are uploaded once. This branch marks `quickstart-source-variants/1`
  and `needs-review` after machine checks; it never assumes the user has approved. Without a passing source it still stops.
  Editorial keeps the bytes of parsed core/shortcodes and zero-padded ordinals 01..N when the full group of siblings
  shares the DOM path; no ordinal is inferred for metrics/numeric storage/quantitative captions. Non-enumerable evidence
  keeps the paid-cache wire/hash. A phone heading without a tel-link is only accepted with a nearby contact label and a value
  matching the source business.phone exactly; phone numbers are never used as statistics.
  Editorial preflights all batches with exactly qualityExecutionInput/qualityCallBudget before the worker.
  A batch that fits keeps its wire/hash to use the paid cache; only an oversized batch is split in half deterministically.
  A single field still too large stops before the model call; repair also checks the whole request including acceptedContext.
  No budget is raised and no source/field is cut to fit the request.
  The WP template/templatePart writer sends content/title and the existing area together when there is a real change,
  because the native writer defaults the title to the slug if it is missing. Filled Retry only restores the title when the raw/body revision
  matches the verified copy receipt, the original title matches beforeData+baseline and the whole projected structure/copyHash
  matches before the first write. A separate fix receipt keeps sourceReceiptHash; the title is never skipped or casefolded.
  WP Retry reconciles the whole raw/body revision with the verified picture checkpoint. Old snapshots only normalise
  post_modified/post_modified_gmt from the recorded raw; the synthesised featured image must match the upload receipt and the current
  REST featured_media. The original snapshot is not modified; a versioned resume-proof is written. New snapshots add
  recordsSemanticHash, stable across JSONB key order. Retry has a fixed window of at most 25 minutes from accepted,
  even when accepted lands right before the original deadline; no budget is raised and no attempt history is deleted.
  WO's pure navigation links may be switched to the verified website, also changing the text/aria/Gutenberg
  to the source hostname; this is re-applied after editorial so a misleading demo label does not survive. Forms, controls, widgets,
  downloads and unclear attribution stay blocked. Pure software licence sentences and declared attribution anchors
  keep both text and URL out of editorial; a sentence mixing demo facts is not locked as a whole paragraph.
  Only for horizontal decorative frames that cannot be cropped, the fallback `sharp-source-canvas/1` composes the real foreground
  on a blurred background from the same picture: vision must confirm the subject, good quality and no text; no posters,
  logos or collages. The crop keeps at least 50% of the source, the sharp foreground fills at least 50% of the canvas, no upscaling;
  resolution is re-checked on real pixels after EXIF, keeping recipe/source hash and the needs-review state.
  A plan with unfilled slots stops before upload and can be re-planned after baseline proof; each upload has a sending checkpoint
  before dispatch and verified after readback. A planned receipt without unfilled slots is not taken as proof of nothing written.

  The reader resolves public assets through the site's `siteReadOrigin` on the same host, keeping path/query; it never calls the
  host machine's public loopback from a container. The port follows the target origin: PHP uses default HTTP, EmDash uses
  4321; a custom public port is removed when moving the URL to the container, not keeping the stand's `8443`.
  Retry uses the latest action of the same account/build request,
  still checking the revision and the queued/cancel fence. A retry accepted after the root deadline has a fixed window
  per action (`accepted_at + frozen maxRunMs`, at most 25 minutes), pinned from the caller through BriefContext;
  it neither modifies the root deadline nor recreates the intent/budget. One resolver is shared by cache/native guard,
  claim, dispatch and repair; cancelled/failed/uncertain always block, a live sibling of the same action is kept.
  The receipt `retry-window:<actionId>` sits in the quality run artifacts.
  Receipts are in `wo_build.content.writes` with prefix `quickstart:`; the full snapshot after pictures/before
  editing is in `quickstart:editorial-baseline` with its hash. Repair only sends the faulty occurrences, keeping the original
  indexes and the already valid parts, then checks the whole batch before writing; no new content store.
  When a previous pass's inventory exists, a retry stops to reconcile and never takes the current CMS state as
  a new baseline. After brand, both modes re-read the native structure, CMS name, coverage,
  links and picture receipts. The CMS name is written/read back independently of the theme's logo or own identity.
  Automatic mode also runs host QA; manual acceptance
  mode is frozen on the server (`brief.reviewMode=manual`), records a `needs-review` receipt,
  `humanAccepted:false`, runs no browser QA and never records `passed`. Only with fill + a receipt
  matching the workflow/mode and `machineChecks.version=1` covering identity/structure/coverage/pictures/links/demoResidue
  does the runner complete with `needs-review`, without handing off to the agent or moving to Outreach on its own.
  WordPress discovers post types from REST, reads template/templatePart through the native door (theme files included),
  paginates posts, reads blogname/blogdescription and the declared option/widget text paths; it does not send
  the whole configuration object to the model. Real numerics keep their type; a string with numeric meaning is only turned into text when the
  descriptor confirms a text renderer; ordinals come from the declared role, not from array/template names. The one-off patch
  for the Investors table and the exact-sentence terms exception have been removed. Reviews keep provider/author/url/language
  from the source; host QA receives `reviewTestimonials`, still compatible with the old Google payload.
  The picture set reads picture/srcset/lazy/inline CSS/style blocks with a parser; uploads read the bytes/hash back.
  The logo never accepts a place picture as a substitute: the demo logo is removed only when the contract proves a text-name fallback;
  without evidence it is blocked. External links are switched only with a clear source/role; ambiguous links are unresolved.
  Coverage is not counted as passing while `required-unresolved` remains; support for the whole quickstart is not inferred
  just because the inventoried regions were written successfully. The list of the three existing EmDash templates is unchanged.
  Backend checks/CMS reads do not replace paid E2E or acceptance of the three demos.

## 9. Sign-in, seats, permissions

### Credentials for external programs: seat key, MCP OAuth, account token (24/10/2026)

Three kinds of Bearer, each behind its own fence; none opens the doors of another:

- **Seat key** `trk_<id>.<secret>` (`lib/api-key.js`, table `api_key`, migration 034): one account + **one site**,
  minted by the seat holder at `POST /api/me/keys`. Used for `/v1/sites/*` and the Apply door; permissions = the seat's toolset ∩ scopes.
- **MCP OAuth** (`mcp/oauth.js`, migration 111): authorization code + PKCE for ChatGPT/Claude/Cursor/Codex; each
  consent picks one site and mints a seat key of the same `trk_` shape, scope `content`.
- **Account token** `tra_<id>.<secret>` (`lib/account-token.js`, tables `account_grant`/`account_token`/
  `account_refresh`/`oauth_device_code`, migration 174): issued to **the whole account**, not tied to a site, only through the OAuth device
  flow (RFC 8628) for the pre-registered client `website-opportunities`, scope `demos`. The "Connect Tracy" button of a self-hosted Website
  Opportunities: `POST /oauth/device/code` → the user opens `/connect` (a Tracy page: sign in, compare the code,
  Allow/Deny) → the app polls `POST /oauth/token` (grant `device_code`). Access lasts 1 hour, refresh 30 days from the last
  use, rotated like MCP; reusing a spent refresh token or device code revokes the whole grant. Only hashes are stored. It can read
  `/v1/me` (email, name); **403 `ACCOUNT_TOKEN_NOT_ALLOWED`** on every `/v1/sites/*`; account-level doors
  (`/v1/demos*`, part B) attach to `requireAccountToken(c, 'demos')` (`app.requireAccountToken`), and those doors return
  **403 `ACCOUNT_TOKEN_REQUIRED`** to a seat key. Revocation: `/oauth/revoke`, or Settings › Connected apps
  (`GET/DELETE /api/me/connected-apps`). Limits: 30 codes/hour/IP, 10 code entries/hour/(account, IP); polling faster
  than the interval → `slow_down` +5 s.

### /ops › View as user — an admin sees Tracy as the customer does (23/10/2026)

- An eye icon next to a customer's email in `/ops` (Signals, Usage, Stuck, App Statistic, WO) → a new tab immediately opens Tracy as the customer sees it, for 30′ (no dialog, no reason required: admins are a trained team). Only an owner/admin of `tracy_admin` (`GET /api/ops/me` → `writable`); the target must be a real account, not staff, not oneself.
- **Writes are not locked in code** (admins are a trained team; the view is for looking). A small bar in the bottom-right corner (email + Exit; tooltip "Viewing as …") on every HTML page reminds that this is someone else's account; whatever the admin does in the view is stored on the customer's account as if the customer did it.
- **A separate cookie `tracy_view`** (HttpOnly, 30′, not extended), takes precedence over `tracy_sess` — the admin's session is untouched, `/ops` stays admin. The token has the same `v1` shape plus an `act` claim (the admin's email); `lib/session.js` (`mintViewSession`, `sessionWithExpiry` returns `act`). Reading the view cookie is enabled only inside the `withViewAs` scope (OFF by default: scripts and tests never impersonate anyone); `lib/view-as-guard.js` enables it for every door except `/ops`, `/api/ops`, and injects the banner. The dsh websocket (`workspace/upgrade.js`) opens inside the view scope, so it uses the same customer identity as the seat cookie.
- Uses **the customer's real seat** (same email + site + role): minted idempotently, never overwrites permissions; the dsh proxy forwards the view token instead of the admin session (`proxiedSessionToken`), so dsh plugins calling back carry `act`.
- Does not pollute the numbers: a session with `act` is never extended into a real session, and writes no `signal.active`, language (`/auth/me`, Inbox poll), `site.entered`, and pre-builds no creation session.
- Doors: `POST /api/ops/view-as` (`ops/view-as.js`; strict Origin) and `POST /auth/view-as/exit` (revokes the `jti`, clears the cookie). Signing out also ends the view. Each open/close is one `audit` row (`view_as.start` with admin, customer, time, and `reason` if one was sent; `view_as.end`). Opening a second view closes the first.

### Design system assets loaded on use (opt-in on the open-source branch)

`scripts/build-design-assets.mjs <directory>` generates an index from `referoLibrary()` **itself** and blobs
by SHA-256: one JSON per system made of `design-system.json` + `manifest.json`, one blob per thumbnail.
The index keeps the library's order, names, fallback fonts, palettes and filter results. A fingerprint of the
normalisation/font/metadata code forces the index to be regenerated when the algorithm changes.

Three variables together enable this read path: `TRACY_DESIGN_ASSET_INDEX` (absolute index file),
`TRACY_DESIGN_ASSET_ORIGIN` (HTTPS origin serving `blobs/<sha256>`; HTTP only for loopback),
`TRACY_DESIGN_ASSET_CACHE` (absolute, persistent directory). Without configuration the vendored source is still used.
Listing loads no blobs; images load when the screenshot door is called; preview/apply load exactly the profile,
normalise it with the existing `fromRefero`, then check quality before emitting. A load error does not switch to another system.

`lib/asset-cache.js` checks hash and bytes on download and on cache read, coalesces concurrent requests within the process,
15-second timeout, at most 16 MiB/blob, refuses redirects, writes to a temp file then renames. Default cache 256 MiB,
evicting old blobs by read; files not named by SHA-256 are not cleaned. No public distribution URL has been
published yet; the opt-in configuration and lazy-load tests do **not** mean a public repo clones clean.

- **Local mode, in progress**: enabled only with `TRACY_MODE=local`,
  `TRACY_ENVIRONMENT=local`, a loopback HTTP origin, `SITE_DOMAIN=localhost`, no `SESSION_DOMAIN`.
  The launcher keeps `LOCAL_ACCESS_SECRET` separate from `SESSION_SECRET`; a UUID v4 `LOCAL_INSTALLATION_ID`
  fixes the installation identity. [`open-local.mjs`](scripts/open-local.mjs) gets a one-time code via
  `POST /auth/local/launch`, opens the fragment of `/auth/local/open`; the browser clears the fragment then exchanges
  the code via `POST /auth/local/exchange`. The installation secret never reaches the browser. Table `local_launch`
  stores only hashes, expires after 60 seconds, consumed atomically through PostgreSQL; Host/Origin are checked
  separately before a session exists. The session uses a host-only cookie and the existing revocation mechanism; a local account
  still needs a site seat and gets no ops rights by itself. OTP/OAuth doors are not opened in this mode.
  This is only the local-session foundation, **not yet** a clean-clone bootstrap or Publish from a laptop.
- **Sign-in**: a six-digit OTP code by email, or Google/GitHub OAuth (`identity/`). One session cookie
  for every surface ([`session.js`](apps/tracy-web/src/lib/session.js)).
- **Beta gate**: when `BETA_GATE` is on, only people with a JoomlArt subscription plan get in
  ([`beta-access.js`](apps/tracy-web/src/lib/beta-access.js)).
- **Seat** = who may work on which site, in what role ([ADR 0001](docs/adr/0001-seat-door-and-enforcement-boundary.md)).
  The seat ledger is in `seats/`; the doors of the former `seats.tracy.ai` are in [`lanes/route.js`](apps/tracy-web/src/lanes/route.js).
- **Discord membership** (08/10/2026): Tracy's Discord bot calls three doors in
  [`discord/route.js`](apps/tracy-web/src/discord/route.js), authenticated by the header
  `x-tracy-discord-secret` = `DISCORD_LINK_SECRET` (unset → all three return 404). `/verify email`
  sends a sign-in code email (the code is kept separately in `discord_link_code`, `otp_code` is not touched) if the beta gate
  lets that email in; a correct code writes `discord_link` and the signal `discord.linked`. New posts in
  #bug-reports and a linked person leaving the server become `discord.bug_report`, `discord.left`.
  Leaving the server removes the link (coming back requires verifying again). Counted in `/ops` › User Data Analytics › Signals.
  No session, no seat is granted. The bot runs on the production host; its container only makes outbound calls.
- **Inside dsh**: the seat door is the fork [`vendor/tracy/dsh-passwords`](vendor/tracy/dsh-passwords). Each
  (email, site) is a separate account with its own `folders`; revoking a seat on one site only disables that account.
  The native guard `seat-tool-guard.ts` re-reads SQLite permissions before every `write/edit/bash/pwsh`, after the
  approval step. The actor is taken only from input already in the turn; a child with real ownership keeps the actor of whoever
  assigned the work and still checks current permissions. Permissions of CMS doors or sandboxes already granted are unchanged.
- **Showing/hiding individual UI pieces**: switches in
  [`catalogue.json`](packages/core/tracy-core/src/ui-switches/catalogue.json), pressed by the operator at
  `/ops/ui`.

### Welcome tour for new customers

`packages/ui/tracy-onboard` uses the account's `GET /api/onboarding` to go straight to stage 1 of the tour on both web
and desktop; Getting started in the menu still opens the old setup dialog. Skipping or finishing stage 1 is written through the
existing `POST /api/onboarding`; desktop still writes a per-device dismissed mark for older readers, but the decision
to auto-open the tour follows the account. Stage 2 and the voice hint read account marks via `GET /api/seen-hints`, written
once with `POST /api/seen-hints` with `{hint: "site-tour" | "voice-tip" | "welcome"}`. Both doors use the signed-in session;
the write door uses the same origin/JSON guard as onboarding. Old browser marks are moved to the account once;
a failed read shows no hint, a failed write does not block the action in progress. Sample prompts go through `inputActions.setDraft` and `submit`
of the dsh composer in the right session; there is no second chat-send door.

The "Welcome to Tracy" popup (8 scenes, `Welcome.tsx`) shows once for an account that has not finished onboarding and has no
`welcome` mark, before stage 1 of the tour. × or Esc writes the mark and the tour continues; the last button writes the mark, marks
onboarding finished and opens Add site. The scenes are a small static site served by tracy-web at `GET /welcome/scenes/*`
(signed-in users only, `frame-ancestors 'self'`, [`welcome/route.js`](apps/tracy-web/src/welcome/route.js));
design system cards are read directly from `refero-thumbs/` of `@tracy/ds-slot`, not copied a second time.

### User Data Analytics

**Read-only Signals** (`/ops/signals`, 22/10/2026): the two doors `/api/ops/beta/signals` and
`/api/ops/beta/customers` take a 7/14/30-day period or `start/end` by Vietnam date. Day counts,
the previous period and deltas read the same `ops_signal`; the failed-site count distinguishes each site creation, failure turns count
events. All six filters medium/source/campaign/content/CMS/status apply to new sign-ins,
sources, new sites and failed sites, the two day series of both periods and the two people tables. A site's source is the
first sign-in source of the person who created the site, even when that sign-in is before the selected period. CMS and
status must match on the same site; status folds the whole history (`pending`, a `done` result
becomes `built`, a failure `stuck`, a deletion `deleted`, taking the last decisive event). New
sign-ins select people with at least one matching non-demo site; `no-site` selects people who have not created a
non-demo site, so combined with CMS it has no results. New/failed sites select the event's own site.
Waitlist and Discord follow only the period because there is no reliable source/site link yet; the screen states which filters
do not affect them. Customer activity still accumulates over the full history, excluding staff and demos
in the customer table as before; the sign-in KPI still includes staff as the baseline number. Source options are taken from both
periods before filtering, keeping the selected value even when its result is 0. Filters live in the screen's URL query,
creating no new table or write path.

**Customer sites currently stuck** (`/ops/stuck`, 22/10/2026): the same GET door `/api/ops/beta/stuck`
reads the whole history still kept in `ops_signal`, and does not let unclosed cases expire after 30 days.
`lib/ops-stuck.js` separates the kind of work (`build`/`import`/unknown) from the failed step; the site
creation has higher authority than the step name. The current queue keeps one row per site address; episode
and activity history carries a separate `lifetimeKey` per creation so a reused domain does not merge rates.
CMS/work-kind/step/reason/status filters live in the URL and are applied in the client; the date period only filters
closed cases and history numbers, it never hides currently stuck cases. The response states `availability`; a snapshot with only
current rows returns `history: null`, inferring no trend or recovery time. Mark-as-handled and
reopen still use the old POST door; no new write path or chat reply is added, `USAGE_TEXT_READERS` is unchanged.

**Statistics history does not depend on the site still existing** (22/10/2026): migration 154 adds
`site_instance` (immutable creation mark) and `site_demo` to `ops_signal` and `site_turn`. A trigger on
INSERT captures both values from the exact existing site creation; deletion events send an explicit snapshot
because the registry has already been deleted. The backfill only uses live sites whose `created_at` is not after the event;
vanished sites are not guessed to be customers. The customer table excludes history with unknown demo status, and the screen carries a
limitation note. A reused domain does not merge owner/CMS/status across creations. An undo counts as complete only
when `ok === true`; failures and old unknown results are kept apart, never inferred back as success.

**Recording beta-block decisions** (22/10/2026): the sign-in queue keeps each `request_id`, not
overwriting turns for the same email (migration 155). The worker writes `beta.waitlist` as soon as it gets a block decision,
before the mail-sending limit, code deletion and mail delivery; retries use the same dedupe key so nothing doubles.
This changes the product-event write path, and also affects the Waitlist's Turned away/Times numbers
and readers of the same event type. Old turns that were merged, or not written when mail failed, cannot be recovered.
A request limit before the beta check is not a beta-block decision. The current public sign-in
policy is unchanged.
`beta_login_latest` keeps the newest request per email with the same 10-minute expiry, updated atomically with
enqueue and cleaned up on expiry. Only the newest request gets mail delivered or replaces/deletes the OTP; an older
request still records the block decision, but its retry does not invalidate the code of a newer request that has completed.

## 10. Build and deploy

| Workflow | When | What it does |
|---|---|---|
| [`build-app-images.yml`](.github/workflows/build-app-images.yml) | push `main` / `develop` | Builds the `tracy-web` + `tracy-host` images, deploys production / dev / staging |
| [`build-dsh-image.yml`](.github/workflows/build-dsh-image.yml) | push `main` / `develop` | Builds the `tracy-dsh` image, deploys production / dev |
| [`tracy-ci.yml`](.github/workflows/tracy-ci.yml) | PR into `main`/`develop`, nightly, manual run | Every gate in [`check-all.ts`](scripts/check-all.ts) |
| [`regression-check.yml`](.github/workflows/regression-check.yml) | `fix`/`feat` PR | Requires a case in [`tests/regression/cases`](tests/regression/cases) to PASS on the branch |

Images are built on a runner and pushed to GHCR; the `mirror-to-ecr` job copies that run's tags to AWS ECR
(since 20/10/2026). The deploy job runs **on the target host itself** and pulls, from GHCR
or ECR according to the environment variable `PULL_REGISTRY` (absent = GHCR). An image
is rebuilt only when its inputs change ([`build-only-on-change.md`](docs/references/build-only-on-change.md)).
Code in `packages/` reaches customers only when the `tracy-dsh` image is rebuilt and deployed. Runners and gates:
[`gates-ci-runners.md`](docs/references/gates-ci-runners.md).

**The `tracy-host` image carries the host's deploy files (opening the way for the beta shard, 17/10/2026).** Besides the fleet scripts
(`/opt/tracy-fleet/{lib,provision,tools,webroot,…}`) and `/opt/tracy-fleet/web`, the image copies **33 files**,
flat, one `COPY` line per file in [`apps/tracy-host/Dockerfile`](apps/tracy-host/Dockerfile) (no glob,
not the whole of `deploy/`): 26 files in `/opt/tracy-fleet/stack/` and seven files in `/opt/tracy-fleet/dsh/`
(the dsh host files). Eight of the `stack/` files are the fleet set (two compose files, five deploy scripts, and
`deploy/.env.example` renamed to `tracy-web.env.example`); the other eighteen belong to the shard: nine scripts
(`install-shard.sh`, `install-shard-steps.sh`, `tracy-heartbeat.sh`, `tracy-updater.sh`, `tracy-pgdump-r2.sh`,
`check-shard.sh`, `shard-sign.sh`, `shard-env-check.sh`, `sync-fleet-files.sh`), `compose.shard.yml`,
`nginx-shard.conf` (source `deploy/nginx/shard.conf`), `shard.env.example` and six systemd units. Thirteen of the
fleet files are exactly the set the two deploy actions (`deploy-tracy-stack`, `deploy-host-dsh`) install from the checkout; the two extra files are
`prune-old-images.sh` (both actions run it from the checkout) and `.env.example` (template for the installer). Purpose: a host
without a checkout, such as the shard's updater, syncs `/opt/tracy-fleet/{stack,dsh}` from the image it is about to run
(`deploy/scripts/sync-fleet-files.sh`). The production and dev hosts still install from a checkout; no program in the image
reads those copies.

- **Editing one of those 33 files** (only them, not the whole of `deploy/`, and even editing only `deploy/.env.example`)
  changes the `hctx` fingerprint of `tracy-host` ([`image-context.mjs`](scripts/ci/image-context.mjs)), and so changes the
  `app-…` tag shared by `tracy-web` and `tracy-host`. A push to `develop` redeploys both on the dev host (deploy waits for the
  `tracy-host` job to drain), a push to `main` does the same on the production host, and once the shard updater is in, every shard sees the new tag on its
  next query and updates itself. The list and the places that must stay in step with it: the `CARRIED` table in
  `scripts/test/tracy-host-fleet-files-image.test.mjs`, the `FILES` table in the check script below, and the
  `sync-fleet-files.sh --list` list (one test holds all three against the Dockerfile).
- The `deploy-dev` job compares the copies in the image with the checkout byte by byte using
  [`check-fleet-files-in-image.sh`](deploy/scripts/check-fleet-files-in-image.sh); a mismatch turns the job red (the deploy has already finished
  before this step). The first run on a real image is the first `deploy-dev` run after the merge.
- The image records `TRACY_SOURCE_COMMIT` (env and label `org.opencontainers.image.revision`) = the commit of the build run that produced
  it. A reused image keeps the old commit, so compare versions by tag, not by this commit.

**`host-dsh-init.sh` no longer has a fixed host list.**
[`host-dsh-init.sh`](packages/fleet/tracy-fleet-operation/dsh/host-dsh-init.sh) accepts any label matching
`^[a-z][a-z0-9]{0,15}$` (the label goes into env variable names, the shard name and the hostname `<label>-agent.tracy.ai`). It takes
`--tracy-origin <bare https origin>` (writes `MCP_TRACY_ORIGIN`; missing → uses `https://cowork.tracy.ai` and
warns) and `--seat-secret-out <path>` (hands `MCP_SEAT_SECRET` to the installer through a 0600 file instead of a banner). Every host
needs `--actor-secret-file` or `--template-lane` when writing a new `dsh-passwords.env`; the script generates no actor
secret for any host, `dev` included. `HOST_DSH_GATEWAY` and `HOST_DSH_CONTAINER` change the gateway port and the container name
it waits for; a second, prefixed dsh on the same machine must set all five variables `HOST_DSH_HOME`, `HOST_SITES_ROOT`,
`HOST_DSH_ENV_FILE`, `HOST_DSH_GATEWAY`, `HOST_DSH_CONTAINER`, otherwise it keeps the first dsh's `dsh-passwords.env`.
Details of each flag and the order for setting up a host: `packages/fleet/tracy-fleet-operation/dsh/HOST-DSH.md` §3.

**Reading `ja-products` when the host's App is not installed there.** `releasesToken` in
[`quickstart-releases.js`](apps/tracy-web/src/lib/quickstart-releases.js) still mints a token from the GitHub App when the App
is installed on `ja-products` (production). Only when GitHub returns 404 for the installation query (`installationIdFor` returns
`null`: the App is configured but not installed on that repo, like a shard's own App) and
`TRACY_RELEASES_GITHUB_TOKEN` is set, does it use that read-only token. GitHub 5xx, network errors, or an installed App whose token
GitHub refuses to issue are still errors, and do not fall back to the token. Consequence worth knowing: if someone removes the App from `ja-products` on
production while the token variable is set, tracy-web silently reads with the token. How to set up a shard's own App
(permissions, org, the four GitHub variables, key rotation) is in the runbook
[`shard-github-app.md`](docs/references/shard-github-app.md).

### Shard (beta): a self-installing, self-updating VM

- **Install:** [`install-shard.sh`](deploy/scripts/install-shard.sh) `--inputs <0600 file>` on a blank Ubuntu 24.04,
  steps 0–17 described at the top of the script; the steps live in `install-shard-steps.sh` next to it (the two files go together).
  Fleet files come from the `tracy-host` image via [`sync-fleet-files.sh`](deploy/scripts/sync-fleet-files.sh)
  (`--from-image`), or from a directory rsynced out of a worktree (`--from-dir`). The shard's secrets are generated
  once in `/etc/tracy/shard-secrets.env`; re-running does not change them, and a missing line stops the run. The last step prints two ways to
  register with the master: the fields of `/ops` › Shards › Add and the env block `SHARDS` / `SHARD_<name>_*`.
- **Way in:** cloudflared (one catch-all rule) → nginx `127.0.0.1:80`
  ([`compose.shard.yml`](deploy/compose.shard.yml), [`shard.conf`](deploy/nginx/shard.conf)) → `tracy-web:8080`.
  The inbound firewall is the `TRACY-INPUT` chain (ssh only from `SSH_ALLOW_FROM`, `51720` open to the docker network).
- **Heartbeat and updates:** [`tracy-heartbeat.sh`](deploy/scripts/tracy-heartbeat.sh) every 60 s signs with
  `SHARD_SECRET`, calls `GET /_shard/status` then the master's `POST /api/shards/<name>/check` and writes the answer verbatim
  to `/var/lib/tracy/desired.json`. [`tracy-updater.sh`](deploy/scripts/tracy-updater.sh) every 5 minutes
  (`flock`) replaces the image when the master runs a different tag: it does nothing on `hold`, when the answer is older than 15 minutes,
  when there is no slot (`granted_until`) or when it failed within the past hour; on failure it backs off 60 minutes and reports
  `last_update.ok = false`.
- **Backup:** `tracy-backup-postgres.timer` runs `backup-postgres.sh`, then `tracy-pgdump-r2.sh` encrypts with
  `age` and pushes to the shard's own R2 (kept 14 days); the heartbeat sends `last_backup`.
- **Checks:** `check-server.sh` then `check-shard.sh` (forbidden variables, nginx, tunnel, heartbeat, firewall, chrony).
  `shard-env-check.sh` refuses on a shard every master-only variable.

## 11. Retired — don't trust old text that mentions these

| Thing | Replaced by |
|---|---|
| Cloudflare Worker (`workers/`, `cowork-web`, `seat-registry`) — retired 16/09/2026 | `apps/tracy-web` |
| One dsh container per site ("lane") | One dsh per host (ADR 0014) |
| Private npm registry | Workspace member in `vendor/` |
| Approve door / `proposal/<slug>` branch | No approval step beforehand; review and undo afterwards |
| Supabase for seats and OTP | Postgres + Resend |
| Earlier production and secondary servers at a previous provider | AWS (29/09 and 28/09/2026) |
| Tracy-shell SPA (`tracy-frontend`, `tracy-shell-routes`) | dsh is the shell ([ADR 0004](docs/adr/0004-dsh-is-the-shell.md)); both packages deleted |

The migration history is in `git log`.

## 12. Shard (beta): master and shard

A shard is the full tch stack on its own VM, same image, `TRACY_DEPLOYMENT_ROLE=shard` (`master` is the default;
`config.deploymentRole`). The master `cowork.tracy.ai` keeps identity and the **directory** for shards `s1…sN`; new
people are sent to a shard, existing people stay on `s0` (the master). With an empty `shard` table the master runs exactly as before. The signed
channel between the two sides is one file, [`lib/shard-channel.js`](apps/tracy-web/src/lib/shard-channel.js).

- **Data.** Migration `122-shard-master.sql` (master): `shard`, `directory_email`, `directory_site`,
  `directory_domain`, `label_registry` (holds a label for 30 minutes), `shard_event`. Migration `123-shard-node.sql`
  (shard): `shard_mirror`, `shard_handoff`, `shard_event_outbox`. A shard is added via env `SHARDS` + `SHARD_<name>_*`
  or `/ops` › Shards › Add (the secret is sealed immediately, never read back).
- **Signed channel.** Headers `x-shard-timestamp|nonce|signature`; the signed string is `timestamp, nonce, real METHOD, path
  without query, sha256(body)`; 120 s window, a nonce is never reused. A refusal is `403 SIGNATURE_INVALID {why}` with
  `why` being `clock`, `replay`, `signature` or `unknown_shard`. `heartbeat` signs the same string with openssl.
- **New people → shard.** `afterSignIn` ([`shards/sign-in.js`](apps/tracy-web/src/shards/sign-in.js)) runs
  **before** the session is minted, on every path that has proven the address: email code (`/verify`, `/signin/verify`), Google/GitHub
  OAuth, JoomlArt, and the desktop round trip. It picks a shard and sets the pointer `__Host-tracy_shard` (only the master sets it,
  host-only, no `Domain`; the unprefixed `tracy_shard` only on an HTTP stand; survives sign-out, `?stay=1`
  clears it). The next master page that person opens (`GET` HTML only, only paths in the allowlist of
  [`shards/route-cookie.js`](apps/tracy-web/src/shards/route-cookie.js)) goes through `GET /login?next=<shard URL>`:
  the **only** door that calls `POST <shard>/_shard/adopt` (signed, body carries `nonceHash`), sets `tracy_handoff` (32-hex nonce,
  60 seconds, `Path=/`, `Domain` = the session domain) and returns `302 <shard>/handoff?t=<ticket>`. `POST /login` checks nothing:
  the code is sent to every address, as before.
- **No shard accepting.** A new person for whom adopt is enabled and whom no shard passes the filter gets `503 NO_SHARD_ACCEPTING`
  **after** the code / OAuth callback, with no `tracy_sess` and no directory row. For `/verify` via `fetch` it returns
  JSON `{code}`. `s0` people and people holding a seat on the master are never moved; adopt applies only to `SHARD_ADOPT_ALLOW`.
- **Desktop (known gap).** `POST /signin/verify` runs the full hook. `POST /auth/link/:nonce/session` runs
  the S40 block and the directory decision but does **not** set the pointer, because the app cannot follow a shard URL (ADR 0030:
  the app has not changed yet): a person living on a shard who uses the desktop app still sees the master's workspace until the app changes.
- **Shard side** ([`shard/adopt.js`](apps/tracy-web/src/shard/adopt.js),
  [`shard/handoff.js`](apps/tracy-web/src/shard/handoff.js)). `POST /_shard/adopt` creates a mirror account (sends no
  code) and returns a one-time 60-second ticket; `GET /handoff?t=` exchanges ticket + `tracy_handoff` for a `tracy_sess_<name>` session
  (on failure → `<master>/login?next=`); `GET /_shard/status` (signed `GET`) for the heartbeat. A shard does **not** sign people in
  locally: every sign-in page goes to the master, every code door returns `403 SIGN_IN_AT_MASTER`; config refuses on a shard
  `CLOUDFLARE_SAAS_*` and the OAuth/SSO keys. Creating a site: only people with a mirror, reserving the label at the master first
  (`labels/reserve`), `site.created` goes into the outbox in the same transaction; a full shard returns `503 SHARD_FULL {createAt}`. Custom
  domains go through the master. tracy-host on a shard runs `TRACY_TUNNEL=catch-all`.
- **Doors the shard calls on the master** ([`shards/doors.js`](apps/tracy-web/src/shards/doors.js)):
  `POST /api/shards/:name/{labels/reserve,events,custom-hostname,check}`, signed with the shard's own secret,
  reading no session; each shard can speak only for its own sites (`403 SCOPE`). Events are the closed set `site.created`,
  `site.deleted`, `site.renamed`, `account.created`, idempotent by `eventId`; invitation-type `account.created`
  is limited to 50 per hour per shard. Only the master writes DNS `<label>.<SITE_DOMAIN>`; a cron reconciles the zone every hour.
- **Updates with slots.** `check` ([`shards/check.js`](apps/tracy-web/src/shards/check.js)) returns the target tag (pinned,
  set individually in `/ops`, or the master's tag), `hold` and `granted_until`: at most two shards update at once, a slot lasts
  15 minutes, a shard that just failed gets no slot for 60 minutes, and a shard whose schema is ahead of the master's is held.
- **Tracy's cookies are never set by a customer site.** [`bar/site-proxy.js`](apps/tracy-web/src/bar/site-proxy.js)
  drops every `Set-Cookie: tracy_*` (and `__Host-tracy_*`) from a customer site on both the Tracy address and a custom domain.
- **Alerts** (`ops_signal`): eleven `shard.*` kinds (`silent`, `update_failed`, `dns_conflict`, `none`,
  `degraded`, `closed`, `label_conflict`, `backup_stale`, `web_images_missing`, `adopt_failed`, `invitation_flood`).
- **Add site** (dsh plugin `packages/site/tracy-add-site`, in the **dsh image**): `409 USE_SHARD {redirect}` and
  `503 SHARD_FULL {createAt}` make the form go to the absolute `https:` URL the door returns; a host that has not received the new dsh image still
  prints a generic error for those two codes.

## AI accounts per account (08/10/2026; formerly "Model Subscription", renamed 09/10/2026)

`apps/tracy-web/src/seat-plan/` keeps Claude/ChatGPT OAuth connections and the routing order by `account.id`,
not by site or team. Migration `078-account-subscriptions.sql` creates connection, attempt, routing
and conversation pin. Secrets are envelope-encrypted with AES-256-GCM using `SEAT_PLAN_KEK` (32 bytes base64, separate from
`SESSION_SECRET`), bound to account + connection + provider. Without the key a subscription cannot be connected/used;
the key must be kept together with data backups and must not change when containers are rebuilt.

The `/api/seat-plan/*` doors take the account cookie; `/internal/seat-plan/pin|run` take an assertion of the person
speaking and the site label, and re-check the seat and the pin owner. `tracy-mode-picker.accountSubscriptions` is on in the
fleet: it takes identity from the turn's claimed message, subagents use the root pin, and an adapter turns NDJSON
into a dsh stream. It only picks another connection of the same account, in the allowed order; it never
replays once output has started. A transient error is retried at most once; an authentication error asks for reconnection.
When none of the allowed connections can answer, the fallback to the default Tracy AI is on per account,
and can be switched off separately. The broker verifies permission and then hands back to the normal Tracy runtime; it does not keep trying
when Tracy AI refuses. The chip and prompt reflect the actual source. A site-creation workspace
that has no site seat yet keeps using the default model.

Settings › **AI accounts** (the same AI accounts row in the avatar menu) and the switch of the same name in `/ops/ui` are shared by web and remote desktop.
The master/per-provider switches block connecting and use, keeping data and order; Disconnect deletes the secret, keeps the id.
Desktop receives the loopback callback back to the right window/attempt; web has a paste-the-callback-URL path. Credentials
never enter dsh, the renderer or the transcript. The table/API names `desktop_setting`, `/api/ops/desktop` are kept
for compatibility; this is server policy for both surfaces.


### Website Opportunities: choosing a quickstart when building a demo (22/10/2026)

The Build demo button calls the Design templates plugin's picker through `@tracy/core/template-picker`.
The popup reuses Gallery and PreviewDialog, showing only released quickstarts; choosing a CMS in the preview
returns `{cms,design,quickstart}` to WO, without opening Add site, writing a design choice or sending a chat.
Cancelling the popup does not call the build door. Bulk build freezes the selected list before opening the popup.

`POST /api/website-opportunities/:id/demo/build` and `…/demo/builds/bulk` require an explicit selection
for new turns. Within the transaction that accepts the action, the server checks the exact combination against the catalogue and stores
`wo_demo_action.selection` (migration 153), including the version and checksum of each archive for that exact CMS.
The fingerprint keeps the old algorithm for historical actions; a matching replay is resolved before the new catalogue is considered.
The two runners pass the selection into the revision, ignoring WO's default preference/pin; the revision keeps the release.
The build door checks that the release is still offered; the site-creation door re-checks version/checksum before claim/provision,
and the fleet receives exactly the checked install entry. If the release changes, it refuses rather than silently swapping the template.
A retry takes no new selection and inherits the original selection, even when the revision has not finished being created.
Revisions and historical actions are not moved and their snapshots are not edited.

Joomla quickstart native bindings use column + nestedJson + jsonPath uniformly for text, images and links. A contract entity missing from the published inventory may be removed from coverage only after content.get confirms native unpublished (0) or trash (-2); other missing states still block. The compiler `quickstart-contract-plan.js` matches path/type and keeps empty native cells; no check is waived based on samples. Metadata XPath applies per occurrence, re-resolved on the copy after images; metadata blocks distinguish text from attributes. The `quickstart:preflight` receipt gathers coverage and the image inventory before vision/upload; it does not replace the Stop/budget/hash guards or replay an old snapshot by itself.

The new build-demo button on the WO brief page also goes through the template-picker bridge and the place demo/build door, like the table, card, inspector, detail and bulk; it no longer builds anew through revision/build. Retrying an old build keeps the original revision and snapshot. The WO bundle and the Design templates listener must be deployed together with the backend that requires a selection.

### WO: handing the demo to the regular agent (`agent-demo/1`, local candidate 22/10/2026)

The new flow is chosen explicitly with `workflow: agent-demo/1` at the door that accepts the action. The server keeps CMS,
quickstart/version and all research input at acceptance time in `wo_demo_action.selection`;
a retry inherits the old action/revision/site/session. `wo_revision.brief.agentDemoSnapshot` keeps the canonical
bundle with its hash, source IDs/hash, counts and the full media catalogue. This is existing private JSONB,
no new store, and no raw research is placed in the webroot. A missing snapshot is reported as a missing capability.

`POST /api/sites` matches the build/revision/account/action reserved earlier before accepting provision-only;
this flow passes no brief, runs no old brief engine, and borrows no quality protocol. The runner waits for
provision/handover, connection and design system, then keeps the live Content describe/contract snapshot,
the full native inventory across all statuses/all locales and its hash in `wo_build.content.agentDemo`. One session and one idempotent prompt request still use
the regular handoff service; the old engine's page-type pagePlan does not go into the new prompt.

The `tracy_demo` tool in site-tools uses the same relay actor/session and the site's Apply door through the action
`demo.research`. Reading catalogue/parts has totals, offset and a per-page limit; the catalogue is not cut
at 24 images. The plan must keep source/asset references and the exact structure hash before a content write. WP/Joomla
still write through the Content API/contract; EmDash still writes through native entry tools. The import bridge accepts only asset
IDs in the frozen manifest and the plan, checking grant/account/site/session, hash and revocation before reading bytes
and right before upload. It accepts no arbitrary URL/key; no cookies/bytes go into the prompt. The import receipt
keeps provenance; a sending/unknown state blocks replay until the native receipt can be reconciled.

Turn Stop/budget/provider failure is held by `site_turn.end_reason` of the exact RPC/action and acceptance
time. QA does not wake/repair an action already closed or a turn already stopped; an agent reporting done only triggers independent
QA. A pilot that passes the machine checks is still `needs-review`, `humanAccepted:false`. Model and budget are still managed by the runtime/admin
of the regular agent; there is no new WO model/key/cost ledger. The frozen image recipe allows bounded crop/canvas
through the existing cutForPlace/extendForPlace: no upscaling or generating new scenes, and the blurred canvas only uses the source image.
The import tool picks the plan's rowIndex, keeping the parent hash and separate derivative provenance/receipt for replay.

The native inventory is re-read independently before QA to compare IDs/counts/publication/routes/row identities/relations;
object hashes are canonical through JSONB, arrays keep their order. Joomla reads assignment/association getters; WP reads native
post fields and a separate hash/count of the term_relationships table through db.tables/db.dump with site permissions, keeping no raw
dump. EmDash discovers collections/schema/content in every locale/status and the real menu, not filtering by seed.
Lost permissions or missing relation evidence fail closed; EmDash trash missing storageless references is still reported as
unresolved. The agent reads the frozen inventory through paginated structure.read; the plan keeps only the hash and summary.

This is a candidate whose agent runtime has not yet been accepted on a stand; building the source/bundle does not prove
the agent can read through a real workspace. Both tracy-web and the native site-tools/WO/locale bundles must be deployed,
measured through the site chat itself before a paid pilot. The semantics of the old quickstart-first action/retry are unchanged.

WO Ask Tracy opens the demo's chat after a template is chosen: the client follows exactly the action it just got accepted via
`GET /api/website-opportunities/demo/actions/:actionId`, not by probing the place's newest action. The backend
returns `chat:{siteKey,sessionId,href}` only after `sessionAhead` has created the session and written the receipt into the handoff;
the ID reserved at acceptance time is not yet a navigation target. Each demo has a new session; Retry keeps site/session.
The client opens the existing workspace/session in the chat panel; leaving the screen or choosing another tab cancels the intent to auto-
switch. Bulk auto-opens only one chat; the other actions keep running in the queue. Model/prompt still go through the regular chat
runtime, with no new door calling a model directly.

The QA reader through Docker keeps the public address via Host and X-Forwarded-Host/Proto/Port at each redirect
hop. This lets the HTTP backend read the WordPress HTTPS site correctly, avoiding a canonical redirect loop; no site's
configuration or data is changed to serve this read.

An explicitly accepted retry may try to read the initial baseline again when there has never been a baseline, prompt or turn in the session. CAS holds the exact action/marker/hash/generation/handoff and queue rights; then the original brief is sent in the same chat. An existing baseline is not re-taken. The repair branch uses its own retryMode to recover the receipt without reopening the baseline round.

Since 22/10/2026, new Ask Tracy actions keep `selection.chatMode=client-send/1`. The flow above now applies only to old actions. In the new mode, the browser calls POST `/api/website-opportunities/demo/actions/:id/chat/prepare` to claim the exact workspace and session before installing the CMS, then navigates to that session. The browser uses the native composer to send the brief as a user message; POST `.../chat/send` only keeps the first winning native request ID and sends no prompt. A reload or two tabs reuse the same ID. Brief/hash and research stay on the server; sessionStorage keeps only the navigation ID.

The agent reads research before a container exists through the `_conversation` context, calls `tracy_demo` provision.start/status/wait itself, reads the structure/baseline snapshot and saves a grouped plan before writing, then checks in the same turn. The backend only reconciles the job; it sends no initial/continuation/repair/wake prompt in the new mode. Site/session/native-turn permissions, Stop and write readiness are checked on the server. Retry keeps marker/site/session. Bulk opens each action's session in turn to send the user messages. The Open demo chat button restores navigation without creating a new build.

QA takes publicOrigin from the server-managed site address, checking that the hostname matches the site before using an alias. The origin keeps the real scheme/port, including Joomla force_ssl without canonical HTML; the port is not inferred from the template nor hard-coded per stand.

In client-send mode, the user can continue the demo with a new message in the same chat after every accepted turn has finished normally. The new permission must come from an authenticated turn book: actor owner, source panel, open native prompt message ID/RPC, owner seat still present; CAS keeps one winning turn and accepts the same proof again on parallel/replay. Deadline/budget/baseline/research/plan are not reset. Any Stop/error/stale in the chain blocks continuation and requires an explicit Retry. Catalogue/plan.read/structure.read return a planGuide with canonical sources leading to the frozen bundle, field paths and native target samples; a wrong plan returns diagnostics, with no CMS write.

### WO: the person picks CMS and template; Tracy checks the demo is complete and good-looking (23/10/2026)

The Ask Tracy to build a demo button on the detail page has two selects, CMS and Template; the default is the template
pinned in `/ops/wo` for that CMS (`capabilities.templates`, `templateChoices` in `lib/wo-revision-choice.js`).
The build buttons in the table, card, inspector, Find and bulk open the Design templates popup as before. The server no longer has
"Tracy picks for you" for any regular build: `selection:{auto:true}` is refused with `DEMO_TEMPLATE_REQUIRED`; a
`selection` with only `cms` (no `design`/`quickstart`) takes that CMS's pinned template (`pins`, `pinsOf`).
`autoTemplate` remains only as the suggestion for Build from my business (`ownSite`): there too the customer is the one who chooses
(decided 24/10/2026: the template and CMS choice is left to the human); `{auto:true}` is still accepted for `ownSite`
through the API but the UI always sends the customer's choice.
The choice is fixed into `wo_demo_action.selection`; Retry and replay keep it.

`tracy_demo check` in client-send mode also sends the host's demo QA `collected` and `placed`
(`agentDemoCollected`): name, phone, email, address, opening hours from `brief.business`, every collected review,
the number of the place's photos and the paths of images the agent imported. The host's `collected-used` check fails when a fact
does not appear on a readable page, when no review is quoted verbatim, when the home page has no photo of the place,
or when fewer than min(collected photos, 3) of the place's photos appear on the site. The plan must have a `part:reviews` quote row and a
`replace-image` row at save time; only when the template has nowhere for a testimonial does the plan write
`unplaced:[{item:"reviews",reason}]`, and the reason goes into the check result for the reviewer.

After demo QA, `opportunities-build/demo-look.js` captures every page QA read (up to 165) at 1440 and 390 via
`POST /_host/capture`, cutting each image from top to bottom (footer included). Ordinary captures keep their JSON response;
vision uses the opt-in `vision-tiles/1` NDJSON stream. At most two routes travel in a capture request, while rendering and model calls
run one page at a time. The vision path bounds each model request to four images and 4 MiB, acknowledges tiles only after a valid
verdict, and stops at the run budget with unread pages reported. Cancelling a request aborts capture and releases its browser context
before another page starts. A page and viewport count as inspected only when their complete image was decoded and included in a
successful model call; partial coverage can retain real findings but cannot pass. The calls use the same vision door and research cost
ledger as WO image labels.
The model only names visible defects from a closed list (hard-to-read text, broken/badly cropped images, duplicated images, template
leftovers, broken layout, mixed languages); it does not judge aesthetics. The result is the `looks-finished` check returned to the agent
along with the other checks. With no model, over budget or a failed capture, the check records `looked:false` (or `partly` with `unlooked`
per page and viewport) and the reason, without failing the build; the build is still `needs-review`.

The check runs in the background so the agent does not hold one request for minutes (24/10/2026): dsh calls the Apply door through the public
origin, and Cloudflare cuts at ~100 s (524), while a whole-site check runs for several minutes. dsh's `tracy_demo check` sends
`check.start` (returns at once, writes `wo_build.qa.clientCheck` = `running`; calling again while it runs joins the running
turn) then polls `check.status` every 5 s within the same tool call, for at most 10 minutes (`demo-lifecycle.mjs`); after
10 minutes it returns `DEMO_CHECK_RUNNING`, and the agent calls check again to keep waiting. The result is counted as a turn and stored when
the check finishes, whether or not the agent is still listening. If the tracy-web process restarts midway, that turn is
`DEMO_CHECK_LOST` and is not counted. An older tracy-web without `check.start` makes dsh fall back to the old synchronous `check`; an older dsh
still calls the synchronous `check` (the rule "a check nobody listens to does not count" holds on that path).

### Add site: Build from my business (`site-from-business`, 23/10/2026)

A third way in at the source step of Add site, behind its own switch `site-from-business` (off by default). The customer types
name + city (Google Places Text Search, **any trade**, `searchNamedPlaces({anyKind:true})`, trades from
`domain/trades.mjs`) and picks, or pastes a website/Google Maps link. The field's label and hint are the `business` question
(kind `business`, feed `site.business`) in the standard question set of all three CMSs; the regular Customize sheet skips
this kind (`SHEET_KINDS`).

Doors (`apps/tracy-web/src/opportunities-build/own-site.js`, registered in the WO app): `GET /api/sites/from-business/find`,
`POST /api/sites/from-business` (stores the business as the account's own opportunity, `candidate.ownSite` +
`trade`, runs the shared research), `GET /api/sites/from-business/:id` (when research is `completed`, phase `choose`
with `recommended`: the `autoTemplate` template suggested by trade), `POST /api/sites/from-business/:id/build`
(`{selection:{cms,design,quickstart}}` chosen by the customer — keep the suggestion or pick another in the Design templates popup, which
opens with a "Tracy's pick" frame from `requestTemplatePick(…, {recommended})`; accepts exactly one `agent-demo/1` +
`client-send/1` action with `ownSite:true` and `suggested.taken`; quota `ownSiteBuildsPerAccountPerDay`, default 3, in
`/ops` WO). The browser calls WO's `chat/prepare` then opens `/<site>/s/<session>?wo-demo-chat=<action>`; the WO plugin on
the destination page sends the brief as with a demo. On an http stand (no `crypto.subtle`) the plugin does not re-hash the brief itself; the
`chat/send` door still matches `briefHash`.

The customer's site is not a demo: no retention clock (`startDemoClock` skips `ownSite` actions), not shown
in the WO list (`stagedSql`), no outreach. The message shown in chat is a single sentence; the steps are in
`instructions` of the `tracy_demo read` catalogue (`ownSiteInstructions`). `autoTemplate` chooses by trade: a card for the exact
trade, then a small-business/multipurpose/business template; cards for other trades (or blog/music/CV) are excluded. This switch
opens the doors above, the chat door of `ownSite` actions, the demo runner and the research executor (`woWorkOn`); site checks,
social stats and prefetch still follow only the WO switch.

### Find reuses Research — 22/10/2026

The Reviews column keeps the `google` key to preserve saved options. `find-research.js` takes rating/reviewCount separately from the Tripadvisor source of the current snapshot, only when match/Place ID/URL point to the same branch; brand-only, failed or ambiguous sources are not shown as branch reviews. The client shows each source separately, does not add review counts together and does not change the Opportunity formula.

`opportunities/find-research.js` reads in batches canonical identity → current place (by tombstone) →
published/full snapshot and profile, calling no collector and creating no opportunity. Find merges the
public fields with the website/social cache; keeps the Google data being searched and scores with the existing
scorer. `research.researchedAt` is the time the profile was published, not the freshness of every source.
`findAction` only reads opportunity/build/action of the signed-in account. The Action column sits after
Website; Status shows Researched + profile age in the table/cards. `POST /api/website-opportunities/find/refresh`
re-checks the list saved in the browser against the store, without searching Google again; it drops the client's permission
metadata. Building from Find creates an opportunity if needed, then uses the existing demo/build door with fromFind;
the server checks the observable profile before accepting the work, and the runner still creates/checks the brief and pins the snapshot as before.
View demo opens only the current account's site; it never uses another person's site or overlay.


### Public origin and site embedding permissions — 22/10/2026

Web takes the public origin from `config.origin` and attaches `publicOrigin` to the HMAC-signed body of
`/_host/provision`, `/_host/go-live` and `/_host/frame-policy`. The host checks the origin before accepting work and
passes `TRACY_ORIGIN` per job; it does not use the internal URL `TRACY_WEB_ORIGIN` or change the shared
environment. Scheme and port belong to the origin; there is no exception list per stand/port.

Apache, EmDash and the EmDash quickstart deploy path share `scripts/lib/frame-policy.sh`.
The configuration receipt `.frame-policy.json` in the private site records the policy/origin managed by Tracy.
Before an authenticated document preview with a ticket/continuation or a design-system ticket, web calls
the HMAC door `/_host/frame-policy` (label/origin only, takes no path), coalescing requests and caching success
for 30 seconds. The helper uses the same lifecycle lock as publish/teardown and only syncs the managed policy:
Apache checks the configuration then does a graceful reload; EmDash recreates web to pick up the new env. Provision is not
re-run, and content, mail and publish state are unchanged. Custom policies and `'none'` are never
loosened. A sync error returns a pre-translated, embeddable notice page before reading the CMS; the next turn
retries. Regular visitors and hosts outside the system cause no configuration writes.



### Foreign keys during Sync from live and database restore

The merge disables foreign-key checks only in its scratch SQL session and copies foreign-key
metadata when taking a whole table. Restore captures outgoing constraints of replaced tables and
incoming constraints from retained tables before the atomic rename. It temporarily drops that
subset and recreates it in the site database with checks enabled. Cross-schema outgoing references
keep their original target; inbound references from other databases are outside the site contract.
The private site folder holds `.restore-foreign-keys.json` before any live FK DDL; interrupted-sync
recovery and the next restore repair that graph before interpreting row checksums. A failed graph
validation invokes the existing database/files rollback, and an incomplete rollback keeps its plan.
