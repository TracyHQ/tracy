import { publicOriginEnv } from './public-origin.js'
/**
 * `provision`, `attach` and `teardown` — the three jobs `app.js` wires behind `/_host/provision`,
 * `/_host/attach` and `/_host/teardown`. Ported from `tracy-hooks.contabo.py`:
 *
 *   PROVISION_FLAGS   py:91-107 (minus accessAud/accessTeamDomain — Cloudflare Access is not
 *                      carried into this migration; provision.sh's own `--access-*` flags are
 *                      already gone too, so passing either would fail the script with
 *                      "unknown argument", not merely be ignored)
 *   provision()       py:380-449
 *   run_teardown()    py:481+
 *   /site-attach      py's `_site_attach` handler — this migration replaces the bind-mount work
 *                      attach-site.sh does (Linux-only, needs root) with the lighter-weight half
 *                      that DOES translate to a Node process anywhere: make sure the site folder
 *                      exists and has its skeleton (AGENTS.md, README.md, …) written.
 *
 * `run` and `jobs` are always the caller's — this module never imports `run.js`/`jobs.js`
 * directly, matching `app.js`'s own injection so a test never spawns a real process or touches a
 * real filesystem for a job record.
 */
import { brandFromOf, copyBrand } from './brand-copy.js'
import { provisionDesign } from './provision-design.js'
import { access, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** The longest one provision may run in all (`runProvision`). */
export const PROVISION_TIMEOUT_MS = 60 * 60_000
/** The longest one provision may go without printing a line before it is stopped (`runProvision`). */
export const PROVISION_IDLE_MS = 15 * 60_000
/** Same charset as the fleet host's own `SAFE_ARG` (tracy-hooks.contabo.py) — a caller is the
 * relay/tracy-web, not a person, but an endpoint that trusts its caller unconditionally is an
 * endpoint that fails badly the first time that caller is fooled. Allows `/` on purpose:
 * `webrootKey`/`dbKey` are artifact-store keys shaped like `example.com/migrate/…/webroot.tar`.
 *
 * ⚠ `+` IS ALLOWED, AND PYTHON'S VERSION DID NOT ALLOW IT. That omission locks out every customer
 * whose address is plus-addressed (`me+tracy@example.com`) — RFC 5321 allows `+` in a local-part and
 * Gmail hands them out by the million. `ownerEmail` goes through this pattern, so such a person
 * signs in fine, sees the whole app, and then every site they try to create answers
 * `BAD_REQUEST: refused ownerEmail` — an error naming a field they never typed. Measured 11/09 on
 * the dev box with a real plus-address.
 *
 * Widening it costs nothing: argv is passed as an array (`execFile`, never a shell string), so `+`
 * reaches `provision.sh` as one ordinary character. It is not a path separator, not a docker name
 * character, and not a shell metacharacter in any position this value reaches. `SAFE_LABEL` below
 * stays as it is — a label really does become a directory and a container name. */
export const SAFE_ARG = /^[A-Za-z0-9._:/@+-]+$/

/**
 * The import archive's two signed download URLs, body field → the env name `provision.sh` reads.
 *
 * 🔒 WHY URLs AND NOT STORE KEYS. `provision.sh` used to fetch with `aws s3 cp` and four
 * `TRACY_MIGRATE_S3_*` credentials — and this image carries neither the `aws` CLI nor those
 * variables, so every import died at "fetching webroot" after the archive was already in the store
 * (measured 14/09 on the local stack; the image is the same on every host). tracy-web already
 * signs URLs for that store, so it signs two GETs and this host needs nothing but curl. The store's
 * keys stay in one process.
 */
export const ARCHIVE_URL_ENV = {
  webrootUrl: 'TRACY_ARCHIVE_WEBROOT_URL',
  dbUrl: 'TRACY_ARCHIVE_DB_URL'
}

/** An http(s) URL on one line — what may reach `curl` through the environment. */
export const SAFE_URL = /^https?:\/\/[^\s]+$/

/**
 * A label reaches a directory name (`sitesRoot/<label>`) AND a docker container name
 * (`<label>-web-1`) — never a path segment like `.`/`..`, never a `/`, and never a leading `-`
 * (an argv value starting with `-` can be read as a flag by whatever it's handed to).
 *
 * DELIBERATELY STRICTER than Python's own `label` check for `/_host/provision` — this is a
 * considered departure from "behaviour must not change", not fidelity slipping. Python's
 * `_provision` (py:714) validates `label` with the generic `SAFE_ARG`, which allows `/` and a
 * leading `-`: a label containing `/` walks `sitesRoot/<label>` into another site's directory,
 * and a leading `-` can be smuggled into `provision.sh`'s argv as a flag instead of a value.
 * Python's OWN `_site_attach` (py:566) already adds `or "/" in label` on top of `SAFE_ARG` — the
 * original author clearly knew a label needs a tighter guard than an arbitrary argument does;
 * `_provision` simply never got the same fix. `^[A-Za-z0-9][A-Za-z0-9._-]*$` is also exactly the
 * charset a Docker container name allows, and the label becomes `<label>-web-1`, so no label
 * that works today can be refused by this pattern — it closes a hole without narrowing what a
 * real caller can send.
 */
export const SAFE_LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Which flags `provision.sh` understands, in the order Python declared them (py:91-107) —
 * `accessAud`/`accessTeamDomain` dropped, everything else kept. Order matters only for a human
 * reading the argv in a log; `provision.sh` parses flags, not positions.
 */
/** The plugin's shape for a preview key (claude-cowork `SiteIdentity::PREVIEW_KEY_PATTERN`). */
const PREVIEW_KEY = /^[A-Za-z0-9_-]{32,128}$/

/**
 * The rebuilding lock a brief build's create asks for (`{previewKey, message}`), or null when there is
 * none or it is not one: a key of the plugin's shape, and plain text of 1 to 1000 characters with no
 * control character but a line break (the plugin's limit for the offline message).
 * @param {unknown} raw
 * @returns {{previewKey: string, message: string, siteName?: string} | null}
 */
export function siteLockOf(raw) {
  if (!raw || typeof raw !== 'object') return null
  const { previewKey, message, siteName } = /** @type {any} */ (raw)
  if (typeof previewKey !== 'string' || !PREVIEW_KEY.test(previewKey)) return null
  if (typeof message !== 'string') return null
  const text = message.trim()
  const control = [...text].some((ch) => {
    const code = ch.charCodeAt(0)
    return (code < 32 && code !== 10) || code === 127
  })
  if (text === '' || text.length > 1000 || control) return null
  // The offline page's title: optional, one plain line of 1 to 200 characters.
  const name = typeof siteName === 'string' ? siteName.trim() : ''
  if (siteName !== undefined && (name === '' || name.length > 200 || /[\u0000-\u001f\u007f]/.test(name)))
    return null
  return { previewKey, message: text, ...(name ? { siteName: name } : {}) }
}

export const PROVISION_FLAGS = {
  site: '--site',
  label: '--label',
  platform: '--platform',
  quickstart: '--quickstart',
  siteKey: '--site-key',
  webrootKey: '--webroot-key',
  dbKey: '--db-key',
  liveSite: '--live-site',
  ownerEmail: '--owner-email',
  // The site's own relay address (`<label>@SITE_MAIL_DOMAIN`), which tracy-web names for a site
  // nobody owns yet (a demo, a stock instance) so EmDash's mail step has a sender (#827). Its own
  // flag, because `ownerEmail` also creates an admin account: this address is never a person.
  mailSender: '--mail-sender',
  // Which design the CUSTOMER picked, and the registry revision the web process resolved it
  // against. The effective design is deliberately NOT carried: `provision.sh` resolves it again
  // from the registry the fleet scripts ship, and refuses when the revision disagrees — so the
  // two halves cannot quietly build a site from two different answers.
  design: '--design',
  designRevision: '--design-revision',
  // Where people open Tracy's copy of an imported site — AGENTS.md names it as the staging site.
  copyAddress: '--copy-address',
  // Who may frame this site — the origin the Design inspiration preview iframe lives at. DEMO-ONLY:
  // tracy-web's `provisionDemo` is the only caller that sets it, so a customer provision omits the
  // flag entirely (like every other absent value here) and its site never becomes frameable.
  frameAncestors: '--frame-ancestors',
  // The lowest Claude Cowork plugin the site may be given, read off the contract profile that seals the
  // card it is built from. Only tracy-web can answer it — the profiles are files it reads at boot
  // and the fleet scripts never see them — so it travels as a flag like everything else here.
  // Absent for a site that binds nothing; `provision.sh` refuses a value that is not a version.
  coworkMinVersion: '--cowork-min-version'
}

/**
 * Build `provision.sh`'s argv (minus the `bash provision.sh` part — that's `run`'s job) from one
 * instruction object: the request body plus `privateRoot` (config.js, not something a caller
 * should be able to override from the network).
 *
 * @param {object} instruction - `PROVISION_FLAGS`' keys (any subset), plus `fresh` (boolean) and
 *   `privateRoot` (string, required — becomes `--root`).
 * @returns {string[]}
 */
export function provisionArgs(instruction) {
  const args = []
  for (const [key, flag] of Object.entries(PROVISION_FLAGS)) {
    const value = instruction[key]
    if (value) args.push(flag, String(value))
  }
  // Flags with no value of their own live outside PROVISION_FLAGS, same split Python keeps.
  if (instruction.fresh) args.push('--fresh')
  // The address a relay hands out later, once a door stands in front of the site (ADR 0033) —
  // provision only ever builds the stack here, never publishes it.
  args.push('--no-publish', '--root', String(instruction.privateRoot))
  return args
}

/**
 * `int(body["port"])` (py:409) — raises loudly on a value that isn't a whole number, rather than
 * handing the script a meaningless one. `Number(value)` rejects the same inputs `int()` would
 * (`"abc"` -> `NaN`, not finite); a JSON float truncates instead of raising, matching `int()`'s
 * own tolerance for `8080.0`-shaped values. `String(NaN)` silently producing `HOST_PORT=NaN` was
 * the bug this closes — a bad port must fail the job, not reach the script as text.
 */
function parseHostPort(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) throw new Error(`bad port: ${JSON.stringify(value)}`)
  return Math.trunc(n)
}

/**
 * `==> starting database` -> `starting database`. This is the sentence the customer reads on the
 * Build screen while their site is being made, so what it strips is a user-visible decision.
 *
 * 🔒 THE `>` IS STRIPPED TOO, AND LEAVING IT OUT PUT A STRAY ARROW IN FRONT OF EVERY STAGE THE
 * CUSTOMER SAW. Python's `.strip("= \n")` — which this was ported from — matched a narration that
 * said `== starting database`. The fleet scripts say `==>`: measured 19/09/2026, **121** of their
 * narration lines carry the arrow and only 8 do not. So `^[=\s]+` removed the equals, kept the
 * arrow, and the Build screen read "> fetching webroot", "> starting database", "> importing
 * database" for the whole minute and a half a site takes to stand up.
 *
 * ⚠ IT SURVIVED BECAUSE THE ONE TEST FIXTURE WAS THE MINORITY SHAPE. `provision.test.mjs` fed
 * `'== starting database'` — no arrow — so the assertion passed on a string the script never emits.
 * A fixture that is not the producer's output is a test of nothing, and this is the second defect in
 * this file found by writing down what `provision.sh` really prints.
 */
function stepFromLine(line) {
  return line
    .replace(/^[=>\s]+/, '')
    .replace(/[=\s]+$/, '')
    .slice(0, 80)
}

/**
 * A known-harmless line that can fill the tail of a failed job. GNU tar prints one for every
 * member of an archive packed on macOS (`com.apple.provenance` is a Finder attribute GNU tar has no
 * use for); TracyHQ/tch#361's failed job opened with a screenful of them and put the real cause —
 * Docker refusing to bind the site's port — below the fold. Dropped from the reported `output`
 * only; the log keeps every line.
 */
const HARMLESS_LINE = /^tar: Ignoring unknown extended header keyword 'LIBARCHIVE\.xattr\./

/** A line that says why a step failed, in the shapes the fleet scripts and Docker print them. The
 * `[stage]` timing lines are never one (`failedProvisionOutput` reads them as boundaries): a stage
 * may be named anything, and the summary prints on every exit, failed or not. */
const ERROR_LINE = /Error response from daemon|\berror:|✗|\bfailed\b|^!! /i

/** How many lines lead the reported output. */
const LEAD_LINES = 10

/** Where one step of `provision.sh` ends and the next begins: `stage` echoes `==> <name>`, and
 * every boundary — `stage` or the silent `mark` — writes a `[stage]` cost line on stderr. */
const STEP_BOUNDARY = /^(==> |\[stage\])/

/**
 * The `output` of a failed provision: what the step that failed printed first, then the tail in
 * the order it was printed. A job record is what the Add site wizard shows, and the last thing a
 * failed provision prints is its timing summary, while the cause sits somewhere above it, often
 * under a screenful of harmless noise.
 *
 * ⚠ ONLY THE FAILING STEP'S LINES MAY LEAD. An error printed by an EARLIER step was survived — the
 * run went on past it. TracyHQ/tch#361's port retry is the case that shaped this: the first
 * `docker compose up` prints a bind error, the retry on a new port succeeds, and if a later step
 * then fails with a line no pattern recognises (Joomla's `quickstart configuration is missing`),
 * leading with every error in the tail would show the customer a port conflict that was already
 * fixed — which is why `provision.sh` writes a `mark` the moment the site is up. So the tail is
 * cut after its last step boundary (the trailing timing summary set aside first): that step's error
 * lines lead, newest first — a retry that failed again before the attempt it retried — and when it
 * printed none, its own lines lead as printed.
 *
 * Stays within `lines.length`, so the 200-line bound `run` already applied still holds. A tail with
 * no boundary and no error line comes back unchanged except for the harmless lines.
 *
 * @param {string[]} lines - `run`'s tail.
 * @returns {string}
 */
export function failedProvisionOutput(lines) {
  const kept = lines.filter((line) => !HARMLESS_LINE.test(line))
  let end = kept.length
  while (end > 0 && kept[end - 1].startsWith('[stage]')) end -= 1
  let start = end
  while (start > 0 && !STEP_BOUNDARY.test(kept[start - 1])) start -= 1
  const step = kept.slice(start, end)
  const errors = step.filter((line) => ERROR_LINE.test(line))
  let lead = []
  if (errors.length > 0) lead = errors.slice(-LEAD_LINES).reverse()
  else if (start > 0) lead = step.slice(-LEAD_LINES)
  if (lead.length === 0) return kept.join('\n')
  const context = kept.slice(Math.max(0, kept.length - (lines.length - lead.length)))
  return [...lead, ...context].join('\n')
}

/**
 * Run `provision.sh` as a background job, updating `jobs` as it goes — the counterpart to
 * `python`'s `provision()` (py:380-449), called from `app.js`'s `/_host/provision` handler
 * without being awaited (the route has already answered `202 {jobId}`).
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {object} input.body - the validated request body (site, label, and the rest of
 *   `PROVISION_FLAGS`, plus `fresh`, `ownerEmail`, `gitToken`, `gitRepo`, `port`).
 * @param {object} input.config - needs `privateRoot`, `scriptsDir`, `logDir`.
 * @param {{put: Function, get: Function}} input.jobs
 * @param {Function} input.run - `run.js`'s `runScript` (or a test fake with the same shape).
 */
export async function runProvisionJob({ jobId, body, config, jobs, run }) {
  const label = body.label
  const logPath = path.join(config.logDir, `provision-${label}.log`)

  await jobs.put(jobId, { state: 'running', step: 'starting', label })

  let port = null
  try {
    const args = provisionArgs({ ...body, privateRoot: config.privateRoot })
    const env = publicOriginEnv(body)
    // A caller may pin a port (re-provisioning an existing label) — py:408-409. Parsed INSIDE
    // this try: a bad value must fail this job loudly (the same way Python's own unguarded
    // `int(...)` raises), not silently hand the script a `HOST_PORT=NaN`.
    if (body.port) env.HOST_PORT = String(parseHostPort(body.port))
    // Git push token for the webroot publish (ADR 0050 B), passed through the environment, not
    // the command line, so it never shows in `ps` — py:413-414. Absent = the publish step is
    // skipped.
    if (body.gitToken) env.GIT_PUSH_TOKEN = String(body.gitToken)
    if (body.gitRepo) env.GIT_REPO = String(body.gitRepo)
    // `template`: install the release as it is — no design plan, no contract — even when the entry
    // carries no card. A public demo is exactly that (tasks/todo-demo-tu-quickstart.md); the door
    // validated the value, and provision.sh keeps a preset BUILD_WORKFLOW instead of deriving one.
    if (body.workflow === 'template') env.BUILD_WORKFLOW = 'template'
    // A demo runs with a small Apache pool and small MariaDB buffers (render-compose.sh, "a demo
    // site is lean"): fleet01 swapped with ~22 demos at the image defaults (12/10/2026).
    if (body.demo === true) env.TRACY_DEMO_SITE = '1'
    // The token that lets `quickstart.py` download a private release's assets by id. Minted by
    // tracy-web for this one provision (an App installation token, an hour long) and handed over
    // in the body: never written to a host's env, never in argv, never in a log line.
    if (body.releasesToken) env.TRACY_RELEASES_GITHUB_TOKEN = String(body.releasesToken)
    // The copy's own Claude Cowork token (provision.sh step 4b): environment only, like the above.
    if (body.copyToken) env.TRACY_COPY_COWORK_TOKEN = String(body.copyToken)
    // The rebuilding lock of a brief build, written into the restored site before it first serves
    // (`offline_lock.py`): environment only, like the tokens above; the key opens the locked site.
    const siteLock = siteLockOf(body.siteLock)
    if (siteLock) {
      env.TRACY_SITE_LOCK_PREVIEW_KEY = siteLock.previewKey
      env.TRACY_SITE_LOCK_MESSAGE = siteLock.message
      if (siteLock.siteName) env.TRACY_SITE_LOCK_SITENAME = siteLock.siteName
    }
    // Signed GET URLs for the import archive, minted by tracy-web — the only process holding the
    // artifact store's keys. Same road as the git token and for the same reason: a signed URL is
    // a bearer credential for its lifetime, so it goes through the environment, never argv.
    for (const [field, name] of Object.entries(ARCHIVE_URL_ENV)) {
      if (body[field]) env[name] = String(body[field])
    }
    // The quickstart as tracy-web resolved it from the release (ADR 0017): the files, their
    // checksums and where to fetch them. Written to a file of this job's own and pointed at with
    // `TRACY_QUICKSTARTS_JSON`, which `quickstart.py` already reads — so no host keeps a copy of
    // the catalogue, and the fleet installs exactly what the process that read GitHub decided.
    if (body.quickstartEntry && body.quickstart) {
      const file = path.join(config.logDir, `quickstart-${label}.json`)
      // 🔒 THE DIRECTORY IS MADE HERE, BECAUSE THIS IS THE FIRST THING THAT WRITES INTO IT.
      // `runScript` makes it too — and it is the only reason this ever worked: on a host whose
      // jobs volume already carried `logs/` from some earlier provision, the write below found a
      // directory somebody else had made. On a NEW volume it does not, and the very first
      // quickstart install on that host dies before the script is even spawned, with an `ENOENT`
      // naming a file nobody asked for. Measured 17/09 on a freshly wiped local stand: every
      // `Install demo` answered `Failed at provision` with
      // "ENOENT: no such file or directory, open '…/logs/quickstart-ja-trip-joomla.json'",
      // and the same is true of a server on its first day.
      await mkdir(config.logDir, { recursive: true })
      await writeFile(file, `${JSON.stringify({ [body.quickstart]: body.quickstartEntry }, null, 2)}\n`)
      env.TRACY_QUICKSTARTS_JSON = file
    }

    const { code, tail, timedOut, idle } = await run({
      script: 'bash',
      args: [path.join(config.scriptsDir, 'provision/provision.sh'), ...args],
      env,
      logPath,
      // 🔒 A BUILD THAT HANGS ENDS (16/10/2026). It had no limit at any layer: a stuck step left the
      // customer's spinner turning for good (measured on the local stand: "fetching webroot" 1110 s,
      // EmDash `docker build` runs sitting 29 and 49 minutes until the host restarted). The silence
      // limit does the real work; the total one is the last net, above the longest healthy run seen
      // (EmDash's first image build, ~23 minutes in all).
      timeoutMs: PROVISION_TIMEOUT_MS,
      idleMs: PROVISION_IDLE_MS,
      onLine: async (line) => {
        // The script narrates its own progress; this is what a Migrate/Build screen shows a
        // customer while it waits — py:436-437.
        if (line.startsWith('==')) await jobs.put(jobId, { step: stepFromLine(line) })
        // py:438-439.
        if (line.startsWith('TRACY_RESULT port=')) {
          const rest = line.slice('TRACY_RESULT port='.length).trim()
          const parsed = Number.parseInt(rest.split(/\s+/)[0], 10)
          if (Number.isFinite(parsed)) port = parsed
        }
      }
    })
    if (code === 0 && port) {
      // The brand the site is created from, copied from the site the viewer extracted it in
      // (tracy-web checked the seat; `brand-copy.js` says why this process does it). Before `done`,
      // because `done` is what starts the Build. A copy that cannot happen does not fail a good
      // provision: the job says why, and the Build's `style` stage says what is missing.
      const from = brandFromOf(body.brandFrom, label)
      let brand = null
      if (from) {
        try {
          const out = await copyBrand({
            sitesRoot: config.sitesRoot,
            from: from.label,
            to: label,
            host: from.host
          })
          brand = { from: from.label, host: from.host, ...out }
        } catch (error) {
          brand = {
            from: from.label,
            host: from.host,
            copied: 0,
            reason: String(error?.message ?? error).slice(0, 200)
          }
        }
      }
      const design = await provisionDesign({ body, run })
      await jobs.put(jobId, {
        state: 'done',
        step: 'ready',
        port,
        ...(brand ? { brand } : {}),
        ...(design ? { design } : {})
      })
    } else {
      await jobs.put(jobId, {
        state: 'failed',
        step: 'provision',
        exitCode: code,
        ...(timedOut ? { reason: idle ? 'idle' : 'timeout' } : {}),
        detail: timedOut
          ? `${idle ? `no progress for ${PROVISION_IDLE_MS / 60_000} minutes` : `over ${PROVISION_TIMEOUT_MS / 60_000} minutes`}; see ${logPath}`
          : `see ${logPath}`,
        // The last up-to-200 lines `run` already capped `tail` to — never the whole log. An
        // unbounded tail is a memory leak on a job that streams for minutes. Led by the error
        // lines, because this is what the Add site wizard shows (TracyHQ/tch#361).
        output: failedProvisionOutput(tail)
      })
    }
  } catch (error) {
    // A job failing must never take the whole process down with it — py:446-447.
    await jobs.put(jobId, {
      state: 'failed',
      step: 'provision',
      detail: String(error?.message ?? error).slice(0, 200)
    })
  }
}

/**
 * Run `teardown.sh` as a background job — the counterpart to Python's `run_teardown()` (py:481+).
 *
 * @param {object} input
 * @param {string} input.jobId
 * @param {object} input.body - `{label, site?}`.
 * @param {object} input.config - needs `privateRoot`, `scriptsDir`, `logDir`, `jobsDir`; `cloudflare` when this host has a tunnel.
 * @param {{put: Function, get: Function}} input.jobs
 * @param {Function} input.run
 */
export async function runTeardownJob({ jobId, body, config, jobs, run }) {
  const label = body.label
  const logPath = path.join(config.logDir, `teardown-${label}.log`)

  await jobs.put(jobId, { state: 'running', step: 'teardown', label })

  const args = ['--label', String(label)]
  // Same asymmetry as Python: an invalid `site` is silently dropped, not a 400 — the door has
  // already answered 202 by the time this runs, and `site` is a nicety for the log line, not
  // something the teardown needs to succeed.
  if (body.site && SAFE_ARG.test(String(body.site))) args.push('--site', String(body.site))
  args.push('--root', String(config.privateRoot))

  // 🔒 THE SAME THREE NAMES `runIngressUpdate` AND `go-live` TRANSLATE. `teardown.sh` removes the
  // site's tunnel rule through `ingress_api.py`, which reads `TRACY_CF_API_TOKEN`,
  // `TRACY_CF_ACCOUNT_ID` and `TRACY_TUNNEL_ID`; this host's config spells them `CLOUDFLARE_*`.
  // With a bare `process.env` the removal was skipped on every teardown, and the rule outlived its
  // site: measured 21/09 on the dev host, `business-joomla.tracy.site` still pointed at
  // 127.0.0.1:52007 after `base-joomla` had been provisioned onto that port, so the Tracy Business
  // demo served Tracy Base. Unlike go-live, a teardown must still run on a host with no tunnel
  // (a local box), so the names are only added when `config.cloudflare` is set.
  const env = { ...process.env }
  if (config.cloudflare) {
    env.TRACY_CF_API_TOKEN = config.cloudflare.token
    env.TRACY_CF_ACCOUNT_ID = config.cloudflare.account
    env.TRACY_TUNNEL_ID = config.cloudflare.tunnel
  } else {
    // 🔒 "NO TUNNEL" IS SAID, NOT LEFT TO BE INFERRED. `teardown.sh` refuses a host on which it finds
    // no road to the tunnel unless it is told there is none: a script that merely was not handed the
    // credentials used to take that for a host with nothing to remove, and deleted the site with its
    // rule standing. This host's config is what decides — the same absence that makes
    // `/_host/address` answer NOT_CONFIGURED, so no rule was added through this host either. A shard
    // host says what it has instead: a tunnel that sends every name to tracy-web, with no rule of
    // this site in it.
    env.TRACY_TUNNEL = config.tunnelMode === 'catch-all' ? 'catch-all' : 'none'
  }
  // 🔒 WHERE THIS HOST KEEPS WHAT IT WROTE ABOUT THE SITE. Step 5 of `teardown.sh` drops the site's
  // finished job records (whole slabs of its content in `output`) and its provision log, and keeps
  // the teardown log when something failed. Unset, it falls back to the Python hooks' paths
  // (`/var/lib/tracy-jobs`, `/var/log/tracy-hooks`), which this container does not have — measured
  // 05/10/2026 on the local stand: nothing was ever pruned, and "keeping …/teardown-<label>.log"
  // named a file that did not exist. The log directory is the one `logPath` above is written into.
  env.JOBS_DIR = config.jobsDir
  env.HOOK_LOG_DIR = config.logDir

  try {
    const { code, tail } = await run({
      script: 'bash',
      args: [path.join(config.scriptsDir, 'provision/teardown.sh'), ...args],
      env,
      logPath
    })
    await jobs.put(jobId, {
      state: code === 0 ? 'done' : 'failed',
      step: 'teardown',
      exitCode: code,
      output: tail.join('\n')
    })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: 'teardown',
      detail: String(error?.message ?? error).slice(0, 200)
    })
  }
}

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

/**
 * `POST /_host/attach`'s synchronous body: make sure `sitesRoot/<label>` exists, and top it up
 * with the site-folder skeleton (`ensure-site-folder.mjs`) if `AGENTS.md` is missing — a real
 * provision already writes it (`provision.sh` calls the same script), so this is the safety net
 * for a folder that reaches this host some other way (an import, a migration).
 *
 * No bind-mounting here (that's `attach-site.sh`'s job — Linux-only, needs root, unchanged):
 * ADR 0014's one-dsh-per-host already sees `sitesRoot` directly, so making the folder exist and
 * be readable is the whole of what this door needs to do.
 *
 * @param {object} input
 * @param {string} input.label - already validated by the caller (`SAFE_LABEL`).
 * @param {object} input.config - needs `sitesRoot`, `scriptsDir`.
 * @returns {Promise<{ok: true, label: string, path: string}>}
 */
export async function attachSite({ label, config }) {
  const sitePath = path.join(config.sitesRoot, label)
  await mkdir(sitePath, { recursive: true })

  const agentsPath = path.join(sitePath, 'AGENTS.md')
  if (!(await exists(agentsPath))) {
    const modulePath = path.join(config.scriptsDir, 'provision', 'ensure-site-folder.mjs')
    const { ensureSiteFolder } = await import(pathToFileURL(modulePath).href)
    // No siteKey/platform reaches this door (`{label}` only) — the label stands in for siteKey.
    // A real provision already wrote the real AGENTS.md with the real siteKey; this only ever
    // runs for a folder provision never touched.
    await ensureSiteFolder(sitePath, label)
  }

  return { ok: true, label, path: `/site/${label}` }
}

/** The one file a reserved folder holds until its provision: who claimed it, and when. */
const CLAIM_MARKER = '.tracy-claimed.json'

/**
 * `POST /_host/reserve`: make `sitesRoot/<label>` exist with the claim marker and nothing else, so
 * a claimed site's workspace opens before the provision runs (dsh registers a seat's folder only
 * when it exists). Idempotent: a folder that already holds a site is left exactly as it is —
 * `attachSite`'s skeleton, or `provision.sh`'s own AGENTS.md, would be the wrong thing to write
 * here (write-if-missing on their side: an AGENTS.md from this door would outlive the provision).
 * @param {{ label: string, config: { sitesRoot: string } }} input
 * @returns {Promise<{ ok: true, label: string, path: string, reserved: boolean }>}
 */
export async function reserveSite({ label, config }) {
  const sitePath = path.join(config.sitesRoot, label)
  await mkdir(sitePath, { recursive: true })
  const entries = await readdir(sitePath)
  const bare = entries.length === 0 || (entries.length === 1 && entries[0] === CLAIM_MARKER)
  if (entries.length === 0)
    await writeFile(
      path.join(sitePath, CLAIM_MARKER),
      `${JSON.stringify({ label, claimedAt: new Date().toISOString() })}\n`
    )
  return { ok: true, label, path: `/site/${label}`, reserved: bare }
}

/**
 * `POST /_host/unreserve`: the way back for a claim nobody followed up on. Removes the folder only
 * when it holds the marker alone (or nothing) — anything else means a provision or a person wrote
 * there, and the folder is a site.
 * @param {{ label: string, config: { sitesRoot: string } }} input
 * @returns {Promise<{ ok: true, label: string, removed: boolean, reason?: string }>}
 */
export async function unreserveSite({ label, config }) {
  const sitePath = path.join(config.sitesRoot, label)
  if (!(await exists(sitePath))) return { ok: true, label, removed: false, reason: 'no such folder' }
  const entries = await readdir(sitePath)
  const bare = entries.length === 0 || (entries.length === 1 && entries[0] === CLAIM_MARKER)
  if (!bare) return { ok: true, label, removed: false, reason: 'the folder holds a site' }
  await rm(sitePath, { recursive: true, force: true })
  return { ok: true, label, removed: true }
}
