/**
 * The numbers this deployment enforces on people — session length, how long a mailed code lives,
 * how many writes an hour, how big one invitation may be.
 *
 * WHY THEY MOVED HERE. Each was a `const` at the top of the one module that applied it:
 * `SESSION_TTL_S` in `lib/session.js`, `CODE_TTL_MS`/`MAX_ATTEMPTS` in `identity/route.js`,
 * `WRITE_LIMIT_PER_HOUR`/`TEAM_MAX_*` in `seats/route.js`, `READ_LIMIT_PER_DAY` in
 * `public/design-page.js`. That was fine while nothing else had to KNOW them. The Settings screen
 * (`ops/general.js`) has to state them, and `ops/` may import only `lib/` and `db/`
 * (`test/module-graph.test.mjs`) — so the alternative was a second copy of every number inside the
 * screen.
 *
 * 🔒 A SECOND COPY OF A LIMIT IS THE WORST SHAPE THIS REPO HAS. It does not fail: the door keeps
 * enforcing its own number and the screen keeps printing the other one, so the page is confidently
 * wrong about the rule it exists to explain, forever, with nothing red anywhere. One definition,
 * imported by both the door that enforces it and the screen that reports it, is the only
 * arrangement where the screen cannot lie.
 *
 * ⚠ THESE ARE STILL CODE, NOT SETTINGS. Reporting them is layer A; making them editable needs a
 * `system_setting` row, a validator with hard floors and ceilings, and a door — none of which
 * exists yet. Until then the Settings screen shows them as read-only and says where they live.
 */

/**
 * How long a signed-in session stays valid without being used. Seven days since 25/10/2026 (
 * a week; it was seventy-two hours from 24/09, twelve before that). Since 24/09 it slides:
 * `/auth/me` re-mints a session older than `SESSION_RENEW_AFTER_S`, so a person who opens a page at
 * least once a week is never signed out by the clock. A sign-out row (`session-revocation.js`) now
 * lives seven days too, and a preview continuation is capped at the same length.
 */
export const SESSION_TTL_S = 7 * 24 * 60 * 60

/**
 * How old a session must be before `/auth/me` re-mints it. An hour, so the many `/auth/me` calls a
 * single page makes do not each write a cookie.
 *
 * WHY IT SLIDES (#294). A token minted once at sign-in ends at a fixed hour, and a workspace tab
 * that stays open over its WebSocket does not notice. The next request after that hour, usually the
 * reconnect after a deploy restarts `tracy-web`, lands on `/login`. Measured 23-24/09 on dev: two
 * QC accounts were "signed out by the deploy" twelve hours after they signed in. `SESSION_SECRET`
 * had not changed, and the cookie was simply past its `Max-Age`.
 */
export const SESSION_RENEW_AFTER_S = 60 * 60

/** How long a mailed sign-in code is accepted. */
export const CODE_TTL_MS = 10 * 60 * 1000

/**
 * The same lifetime in whole minutes — the number every page and mail PRINTS (`{minutes}` in
 * `lib/i18n/strings.js`). Derived, never typed: until #794 the login page said "a few minutes", the
 * mail said "10 minutes" and the lane's own page said "one hour", three copies of one rule.
 */
export const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60_000)

/** Wrong codes accepted for one address before the code is spent. */
export const MAX_ATTEMPTS = 5

/**
 * Sign-in codes `POST /login` may mail in one hour, counted twice (#664): per ADDRESS, so nobody
 * can bury one inbox in codes from many machines, and per CLIENT ADDRESS, so one machine cannot
 * walk a list of inboxes. Until 30/09/2026 the door had no cap at all — fifty calls sent fifty
 * mails to any address. Five an hour per inbox is several "send a new code" presses more than a
 * person needs; thirty per client address leaves room for an office behind one NAT. Kept apart
 * from `WRITE_LIMIT_PER_HOUR` on purpose: six hundred mails an hour is not a brake.
 */
export const LOGIN_MAIL_LIMIT_PER_EMAIL_PER_HOUR = 5
export const LOGIN_MAIL_LIMIT_PER_IP_PER_HOUR = 30

/**
 * Sign-in codes a lane's `POST /auth/otp/start` may mail in one hour from one CALLING address
 * (#805), on top of the per-inbox five above, which that door shares with `/login`. The address
 * here is the LANE HOST's, never a person's: a lane reaches the door through the public origin, so
 * the address Cloudflare reports is the fleet host, and one host serves every site on it (ADR
 * 0014). That is why the door does not count in `/login`'s thirty — every customer site on a host
 * would share thirty sign-in mails an hour. ⚠ Three hundred is a CEILING AGAINST A RUNAWAY CALLER,
 * not a measured demand: nobody has measured how many codes a busy host asks for in an hour.
 */
export const LANE_MAIL_LIMIT_PER_HOST_PER_HOUR = 300

/**
 * Codes Tracy's Discord bot may ask `POST /api/discord/link/start` to mail for ONE Discord member
 * in one hour (08/10/2026), on top of the per-inbox five above, which that door shares with
 * `/login` and the lane door. The bot itself calls from one address, so a per-address bucket would
 * be every member's at once; counting per member stops one account from walking a list of inboxes.
 */
export const DISCORD_MAIL_LIMIT_PER_MEMBER_PER_HOUR = 5

/**
 * Attempts at `POST /auth/link/:nonce/session` (the desktop app trading an approved round for a
 * session) from one client address in one hour, counted before anything is read. An honest app
 * calls it once per sign-in; the cap is room for an office behind one NAT plus retries, and a
 * brake on anyone walking nonces and secrets. Not a measured demand.
 */
export const DESKTOP_LINK_SESSION_LIMIT_PER_IP_PER_HOUR = 60

/**
 * The most `POST /login/visit` records (a signed-out visit to `/login`) one
 * client address leaves in an hour. A person sends one per tab; the cap is room for an office behind
 * one NAT, and a brake on a script filling `ops_signal`. Not a measured demand.
 */
export const LOGIN_VISITS_PER_IP_PER_HOUR = 30

/**
 * Quickstart zips one account may ask `GET /api/quickstarts/:template/:cms/quickstart.zip` for in
 * one hour, counted in the database BEFORE the stream opens (10/10/2026) — and, per process, how
 * many of those streams may be open at once. A person downloads a template once, maybe twice; a
 * fifty-megabyte zip ten times an hour is a script, and two at a time is all a browser does. Each
 * stream holds the GitHub token's bandwidth on this server, so both caps protect the server more
 * than the repository. Not a measured demand.
 */
export const QUICKSTART_DOWNLOADS_PER_ACCOUNT_PER_HOUR = 10
export const QUICKSTART_STREAMS_PER_ACCOUNT = 2

/**
 * A site's backup downloaded by its Owner (`sites/backup-export.js`, plan todo-backup-export,
 * 11/10/2026). Each request makes the host pack the whole site — files and database — under the
 * locks every backup and restore on that machine wait for, so the caps protect the host first:
 * ten requests an hour per account, at most two packing at once per account (and one per site,
 * which the table's own index enforces). A package lives in the store for a day and is deleted by
 * the sweep after; a download link lives five minutes and is signed anew on every ask; the host
 * refuses to pack past a gibibyte. Not measured demands — the plan's open questions for the product owner.
 */
export const BACKUP_EXPORTS_PER_ACCOUNT_PER_HOUR = 10
export const BACKUP_EXPORTS_IN_FLIGHT_PER_ACCOUNT = 2
export const BACKUP_EXPORT_TTL_HOURS = 24
export const BACKUP_EXPORT_LINK_TTL_S = 300
export const BACKUP_EXPORT_MAX_BYTES = 1024 ** 3

/**
 * Every write door in the seats/workspaces cluster shares this cap — ported from the Worker's own
 * `IP_LIMIT_PER_HOUR`, one bucket per door. The Worker keyed each by client IP; this app keys by
 * whatever identifies the CALLER, a deliberate narrowing recorded at each call site.
 */
export const WRITE_LIMIT_PER_HOUR = 600

/**
 * Reads an hour one seat key may make through the Apply door on the api host (bucket
 * `key:<id>:read`; writes share `WRITE_LIMIT_PER_HOUR` under `key:<id>:write`). Ten times the write
 * cap: a partner's agent reads a page for every line it changes, and classification is by
 * `changesSite(action, params)` — a `content.contract` inspect is a read, its apply a write — not by
 * HTTP method (`tasks/todo-api-public.md` Q8).
 */
export const KEY_READ_LIMIT_PER_HOUR = 6000

/**
 * "Rewrite with AI" in the Add site popup (`POST /api/sites/brief/rewrite`), per signed-in person per
 * hour. Each press spends the deployment's text-model budget, and a person polishing one sentence
 * presses a handful of times — thirty is generous for that and a brake on a loop.
 */
/** Turns and moments one seat may open on one site in a minute: each one wakes a job on the host. */
export const TURNS_PER_MINUTE_PER_SEAT = 30
/**
 * Asks one seat may make on one site in a minute of whether an earlier turn's moment has ended
 * (`POST /api/sites/:key/moment/wait`). Each one waits up to about 10 s and only reads the host's job,
 * so a dsh holding one write asks at most six times a minute; the rest is room for several
 * conversations on one site.
 */
export const MOMENT_WAITS_PER_MINUTE_PER_SEAT = 60
export const BRIEF_REWRITE_LIMIT_PER_HOUR = 30
/** Every person together: the model budget is the deployment's, not each account's. */
export const BRIEF_REWRITE_LIMIT_ALL_PER_HOUR = 600

/**
 * Design system previews one signed-in account may ask for in a minute, both preview doors together
 * (`GET /api/design-system/preview` and `GET /api/sites/:key/design-system/preview`,
 * 12/10/2026). Each ask the shelf has not kept reads a live site and emits a system; thirty is a
 * person clicking through cards fast, not a script walking the library.
 */
export const DS_PREVIEW_PER_MINUTE_PER_ACCOUNT = 30

/**
 * The public Design inspiration page's three unauthenticated doors, each with its own daily cap
 * per client address. They differ because what they SPEND differs: a read is a page fetch, words
 * spend `MODEL_API_KEY` on every call, and a brand run triggers a shared Chromium job.
 */
export const DESIGN_READ_LIMIT_PER_DAY = 30
export const DESIGN_WORDS_LIMIT_PER_DAY = 20
export const DESIGN_BRAND_LIMIT_PER_DAY = 10

/** How many addresses one invitation may carry, and how many sites it may cover. */
export const TEAM_MAX_EMAILS = 20
export const TEAM_MAX_SITES = 50

/**
 * How long the link in a team invitation mail is accepted, counted from the token's own `iat`
 * (#804). Seven days. Until 04/10/2026 a link never expired: it died only when an admin cancelled
 * the invitation. `GET /invite/:token` (`seats/route.js`) refuses an older link and changes
 * nothing; the pending seat row stays, so the person can be invited again.
 */
export const TEAM_INVITE_TTL_S = 7 * 24 * 60 * 60

/** The same lifetime in whole days — the number the mail and the expired page PRINT (`{days}`). */
export const TEAM_INVITE_TTL_DAYS = Math.round(TEAM_INVITE_TTL_S / (24 * 60 * 60))

/**
 * How long the one-click unsubscribe link of a notification mail works, counted from the token's
 * own `iat` (spam hints C1-B, 05/10/2026). Ninety days: a reader often finds an old mail before
 * pressing Unsubscribe, and the link only ever turns one email switch OFF, which the reader can
 * turn back on in Settings › Notifications, so a long life costs little.
 */
export const UNSUBSCRIBE_TTL_S = 90 * 24 * 60 * 60
