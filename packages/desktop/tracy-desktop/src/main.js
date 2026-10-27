/**
 * Tracy Cowork — the Electron shell around the `native` profile.
 *
 * IT CONTAINS NO INTERFACE. All of Tracy's face is dsh plugins running in the profile's bundle; this
 * file only does three things a web page cannot do by itself: be on the Dock, open its own window, and
 * start/clean up its own dsh process.
 *
 * ⚠ SWITCHED FROM `desktop` TO `native` ON 01/09, and that changes the app's NATURE, not a number. The
 * two profiles differ in dsh's role:
 *
 *   `desktop` → `@tracy/dsh-cowork-bundle`: dsh is a SIDECAR inside the Tracy shell, so that bundle turns
 *               off `ui-sidebar` — the shell already has its own navigation.
 *   `native`  → `@tracy/dsh-native-bundle`: dsh IS the shell. The sidebar is alive, and the Add site tab
 *               with it, because it registers through `dsh-better-sidebar`.
 *
 * So this app now wraps a full dsh, not a sidecar. The Add site tab only exists in the `native` profile —
 * not because someone forgot to add it to the other bundle, but because in the cowork lane better-sidebar
 * is off and the tab has nowhere to register.
 *
 * 🔒 THE WINDOW POINTS AT THE PASSWORD GATE, NOT AT THE dsh PORT. Pointing straight at the dsh port skips
 * sign-in — the app still runs, still looks fine, and nobody has to enter a password anymore. That is the
 * kind of breakage nobody sees. The port is NOT typed here: `gatewayPort()` reads `MCP_GATEWAY_PORT` from
 * `.env.<profile>`, the same source of truth `run.sh` uses. Each profile has its own port, which is why
 * each profile has its own env file (CLAUDE.md §5: with two profiles sharing one file the second gate dies
 * with EADDRINUSE and shuts down, while its dsh keeps serving — the browser gets 401 and it looks as if it
 * works).
 *
 * START OR REUSE. If someone already answers on the password gate, that is a dev session running
 * `./run.sh <profile>` — reuse it, don't spawn a second copy so both die with EADDRINUSE. Only when the
 * gate is silent does the app start one itself, and then the app OWNS that process: quitting the app
 * stops it.
 */

const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  Notification,
  powerMonitor,
  screen,
  session,
  shell
} = require('electron')
// FIRST, before any other module, window or session: a packaged app refuses remote-debugging switches
// (src/debug-switches.js) — with one, another process could drive the signed app with the person's session.
require('./debug-switches.js').refuseDebugSwitches(app)
// Linux: keep the cookie key out of the Secret Service, whose keyring prompt blanks the first window
// on a locked or missing keyring (src/password-store.js). macOS and Windows unchanged.
require('./password-store.js').applyPasswordStore(app, process.platform)
const { execFile, execFileSync, spawn } = require('node:child_process')
const inspector = require('node:inspector')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs')
const { createSigninHandoff } = require('./signin-handoff.js')
const { appIdentity, deviceName } = require('./platform.js')
const { bundleLayout } = require('./bundle-layout.js')
const { callbackScript, subscriptionHandoff } = require('./subscription-handoff.js')
const { planPatch, readDesktopConfig, refererToDrop } = require('./plan-profile.js')
const { externalAllowed } = require('./open-requests.js')
const { WINDOW_LIMITS, cascadeWindow, rememberWindow } = require('./window-bounds.js')
const { createWindowPool } = require('./window-pool.js')
const { runtimeRecord, secondLaunch, sourceProfile } = require('./dev-profile.js')
const { selfUpdateMode } = require('./update-plan.js')
const { readInstallId, startUpdater } = require('./updater.js')
const { createSignedFeedProvider } = require('./signed-feed-provider.js')
const { FEED_PUBLIC_KEYS } = require('./feed-key.js')
const { createPreferences } = require('./preferences.js')
const { createUpdateBridge } = require('./update-bridge.js')
const { createAgentsBridge } = require('./agents-bridge.js')
const { createOnboardingBridge } = require('./onboarding-bridge.js')
const { createWebsiteOpportunitiesMenu, hiddenFromAnswer } = require('./website-opportunities-menu.js')
const { WEBSITE_OPPORTUNITIES_CHANNELS } = require('./update-channels.js')
const { createNotifyBridge } = require('./notify-bridge.js')
const { createPermissionReader } = require('./notify-permission.js')
const { createLocaleBridge } = require('./locale-bridge.js')
const { signInDoor, firstRunLoginUrl, signInFailedUrl } = require('./signin-doors.js')
const { waitingQuery } = require('./waiting-page.js')
const { unreachableQuery, watchLoadFailure } = require('./load-failure.js')
const { createShellPathReader } = require('./shell-path.js')
const { createHeartbeat, onboardingAgain, updateTestSwitches } = require('./debug-switches.js')
const { offUpdateState } = require('./update-state.js')
const { channelFileName, readPolicy } = require('./feed-policy.js')
const { createPolicyStore } = require('./policy-store.js')
const { fetchFeedPolicy } = require('./policy-check.js')
const { createPolicyGuard } = require('./policy-guard.js')
const { blockedView, createBlockGate } = require('./blocked-screen.js')
const { createBlockedBridge } = require('./blocked-bridge.js')
const { shellLanguage, shellWords } = require('./shell-strings.js')
const { createWhatsNew } = require('./whats-new.js')
const { changelogUrl, readBundleNotes } = require('./bundle-notes.js')
const { updateQuestionPlan } = require('./update-dialog.js')
const { updateHeaders } = require('./update-plan.js')
const { createAppOpened } = require('./app-opened.js')
// dsh's desktop window shell around this window, bundled from shell/ and the dsh submodule by
// build/build-shell.mjs (`pnpm dev`, `pnpm debug` and build/package.sh run it first).
const {
  installLinks,
  installShell,
  shellWebPreferences,
  windowShellOptions
} = require('./generated/shell-main.cjs')

/**
 * TEST ONLY: `TRACY_DESKTOP_LINK_LOG=<file>` appends one JSON line per routed link and per browser
 * open to that file, and opens NOTHING in the browser — so an end-to-end run
 * (tasks/evidence/desktop-window-shell/e2e-links.mjs) can tell where each link went without
 * flooding the machine's browser. Unset (always, outside such a run): links open for real.
 */
const LINK_LOG = process.env.TRACY_DESKTOP_LINK_LOG || undefined

/** @param {Record<string, unknown>} entry */
function logLink(entry) {
  if (LINK_LOG === undefined) return
  fs.appendFileSync(LINK_LOG, `${JSON.stringify({ at: Date.now(), ...entry })}\n`)
}

/**
 * The system browser for links the window routes there.
 * @param {string} url
 * @returns {Promise<void>}
 */
function openLinkExternally(url) {
  // Only http(s) and mailto reach the operating system; a blob:, file: or app scheme stays here.
  if (!externalAllowed(url)) return Promise.resolve()
  if (LINK_LOG !== undefined) {
    logLink({ event: 'openExternal', url })
    return Promise.resolve()
  }
  return shell.openExternal(url)
}

/**
 * Where this copy's own files are (src/bundle-layout.js): the same `<resources>/app/src` on macOS,
 * Windows and Linux, so nothing below counts folders up to a bundle root.
 */
const LAYOUT = bundleLayout({ srcDir: __dirname, resourcesPath: process.resourcesPath, pathApi: path })

/** The page shown in the window while a desktop sign-in round waits for the browser. */
const WAITING_PAGE = path.join(__dirname, 'signin-waiting.html')

/** The page shown in a product window whose page could not load (src/load-failure.js). */
const UNREACHABLE_PAGE = path.join(__dirname, 'unreachable.html')

/**
 * The TCH repo root.
 *
 * NOT computed from a relative path. In the source tree `__dirname` is
 * `packages/desktop/tracy-desktop/src`, while in the packaged build it is `<resources>/app/src`
 * (`Contents/Resources/app/src` on macOS, `<install>\resources\app\src` on Windows) — going up four
 * levels gives two completely different places, and the packaged build silently points at
 * `Tracy.app/` itself (or the parent of the install directory). Symptom: the app runs, no window,
 * nobody knows why.
 *
 * So the packaged build carries `repo-path`, written by `build/package.sh` at packaging time. The source
 * tree has no such file and falls back to the relative computation, where it is correct.
 */
const REPO = readPinned('repo-path') ?? LAYOUT.sourceRepo

/** The profile this wraps. The port is read from `.env.<profile>`, not typed again here. */
const PROFILE = 'native'

/** How long to wait for dsh to come up before giving up. dsh loads ~90 plugin packages, so the first run is slow. */
const BOOT_TIMEOUT_MS = 90_000

/**
 * dsh's one-time sign-in token, written out by `run.sh`.
 *
 * dsh 0.1.2-alpha.1 requires a `dsh-auth-<host:port>` cookie on EVERY request, and only grants it when
 * `/?token=<token>` is opened. The token is random on every dsh run and printed to stdout exactly once —
 * this window cannot read that stdout when it REUSES an existing `./run.sh` session, so `run.sh` writes
 * the token to a file and this is where it is read back.
 */
const TOKEN_FILE = path.join(REPO, 'tch', 'profiles', PROFILE, '.launch-token')

/** The dsh process this app started, or null when reusing an existing session. */
let owned = null

/**
 * Read one key from the profile's env file — the same source of truth run.sh reads.
 * @param key - variable name.
 * @returns The trimmed value, or undefined when the key is absent or empty.
 */
function envValue(key) {
  for (const name of [`.env.${PROFILE}`, '.env']) {
    const file = path.join(REPO, name)
    if (!fs.existsSync(file)) continue
    const match = new RegExp(`^${key}=(.*)$`, 'm').exec(fs.readFileSync(file, 'utf8'))
    if (match) {
      const value = match[1].trim()
      if (value !== '') return value
    }
  }
  return undefined
}

/**
 * The gateway port, from the profile's env file.
 * @returns The port the sign-in door listens on.
 */
function gatewayPort() {
  const value = envValue('MCP_GATEWAY_PORT')
  if (value === undefined) {
    throw new Error(`no MCP_GATEWAY_PORT in ${REPO}/.env.${PROFILE} or .env`)
  }
  return Number(value)
}

/**
 * The REMOTE target, if one is configured — the app opens a dsh already running on the network
 * instead of standing one up locally.
 *
 * WHY AN ENV KEY AND NOT A CONSTANT. Writing `https://cowork.tracy.ai` in here cuts the local
 * development path for EVERY other session on this machine — and cuts it silently, because the
 * app still opens a window that looks normal. One line in `.env.<profile>` can be turned off
 * again, and it sits with every other runtime setting the profile already carries.
 *
 * `process.env` wins so a single run needs no file edit:
 *     TRACY_DESKTOP_ORIGIN=https://cowork.tracy.ai pnpm dev
 *
 * 🔒 WITH A REMOTE TARGET THE APP DOES NOT SPAWN, WAIT, OR READ A TOKEN. All three belong to the
 * lifecycle of a local dsh this app owns. Running them for a remote target spawns a local dsh
 * nobody uses and then points the window somewhere else — a wasted port, and a false lead the
 * next time someone diagnoses this.
 * @returns The origin with any trailing `/` removed, or undefined when running locally.
 */
function remoteOrigin() {
  const raw = pinnedOrigin() ?? process.env.TRACY_DESKTOP_ORIGIN ?? envValue('TRACY_DESKTOP_ORIGIN')
  return raw === undefined ? undefined : raw.replace(/\/+$/, '')
}

/**
 * The origin a PACKAGED app was built for, written by `build/package.sh` into the bundle.
 *
 * Read BEFORE the environment and the repo: a packaged app pointed at `cowork.tracy.ai` must run
 * on a machine that has no TCH checkout at all, so it cannot depend on `.env.<profile>` or on the
 * `repo-path` stamp. The source tree has no such file and falls through to the env lookup, which
 * keeps every dev session's local path exactly as it was.
 * @returns The pinned origin, or undefined when the bundle carries none.
 */
function pinnedOrigin() {
  return readPinned('origin')
}

/**
 * One file `build/package.sh` wrote next to `src/` in the bundle (`origin`, `update-channel`).
 * @param {string} name
 * @returns {string | undefined} its trimmed content, or undefined when absent or empty.
 */
function readPinned(name) {
  const file = LAYOUT.pinnedFile(name)
  if (!fs.existsSync(file)) return undefined
  const value = fs.readFileSync(file, 'utf8').trim()
  return value === '' ? undefined : value
}

/**
 * Whether anyone answers on the port yet.
 * @param port - the port to try.
 * @returns True on any HTTP response.
 */
async function answering(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual', signal: AbortSignal.timeout(1500) })
    return true
  } catch {
    return false
  }
}

/**
 * Read the sign-in token, if any.
 * @returns The token, or undefined when the file does not exist yet.
 */
function readToken() {
  if (!fs.existsSync(TOKEN_FILE)) return undefined
  const value = fs.readFileSync(TOKEN_FILE, 'utf8').trim()
  return value === '' ? undefined : value
}

/**
 * Wait for `run.sh` to finish writing the token.
 *
 * Only called on the START branch. `run.sh` deletes the file before running, so on that branch the
 * file appearing is the signal "dsh has printed the token" — it needs its own wait because the password
 * gate is a separate process that comes up before dsh, so an open gate does NOT mean the token exists.
 * @returns The token, or undefined on timeout.
 */
async function waitForToken() {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    const token = readToken()
    if (token !== undefined) return token
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return undefined
}

/**
 * Wait for the port to come up, or throw on timeout.
 * @param port - the port to wait for.
 */
async function waitFor(port) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await answering(port)) return
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`port ${port} did not come up within ${BOOT_TIMEOUT_MS / 1000}s — check the run.sh log`)
}

/**
 * The deployment whose `/ops` › Desktop App settings this app follows while it runs its OWN dsh.
 *
 * Its own key, not `TRACY_DESKTOP_ORIGIN`: that one switches the app to the remote mode (a dsh on the
 * network, no local dsh at all), while this one only names where the local dsh's plan settings come
 * from. `process.env` wins, then `.env.<profile>`; unset means the local dsh starts as it always did,
 * with no plan connection.
 * @returns {string | undefined}
 */
function configOrigin() {
  const raw = process.env.TRACY_DESKTOP_CONFIG_ORIGIN ?? envValue('TRACY_DESKTOP_CONFIG_ORIGIN')
  return raw === undefined || raw === '' ? undefined : raw.replace(/\/+$/, '')
}

/**
 * Write the plan patch for the local dsh (`plan-profile.js`), or remove a stale one.
 * @returns {Promise<string | undefined>} the patch file to pass to `run.sh … --patch`, if any.
 */
async function preparePlanPatch() {
  const dir = app.getPath('userData')
  const file = path.join(dir, 'plan.patch.yml')
  const origin = configOrigin()
  const { config, source } = await readDesktopConfig({
    origin,
    fetch: (url, init) => fetch(url, init),
    cacheFile: path.join(dir, 'desktop-config.json')
  })
  const patch = planPatch(config)
  if (patch === null) {
    fs.rmSync(file, { force: true })
    process.stdout.write(
      `tracy-desktop: no model plan connection (config ${source}${origin ? ` from ${origin}` : ''})\n`
    )
    return undefined
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(file, patch)
  process.stdout.write(
    `tracy-desktop: model plan connection on (config ${source} from ${origin}), patch ${file}\n`
  )
  return file
}

/**
 * Start dsh for this profile, and remember that the app owns that process.
 * @param {string | undefined} patch - the plan patch (`preparePlanPatch`), passed as `--patch`.
 */
function launch(patch) {
  const child = spawn('bash', [path.join(REPO, 'run.sh'), PROFILE, ...(patch ? ['--patch', patch] : [])], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  // Don't swallow logs: when boot fails, the line explaining why is here and nowhere else.
  child.stdout.on('data', (data) => process.stdout.write(`[dsh] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[dsh] ${data}`))
  // No `bash` on this machine (a source run on Windows without Git Bash or WSL): say so instead of
  // crashing the main process on an unhandled 'error' event.
  child.on('error', (error) => {
    if (owned === child) owned = null
    process.stderr.write(`[dsh] could not start run.sh: ${error.message}\n`)
  })
  child.on('exit', (code) => {
    if (owned === child) owned = null
    if (code !== 0 && code !== null) process.stderr.write(`[dsh] exited with code ${code}\n`)
  })
  owned = child
}

/**
 * Is this navigation still inside the surface the app opened?
 *
 * 🔒 COMPARED AGAINST THE ORIGIN THE APP WAS GIVEN, never against the page currently loaded.
 * Reading `webContents.getURL()` looks equivalent and is not: on the FIRST navigation it is
 * `about:blank` or empty, whose host is `''`, so nothing matches, the guard sends the app's own
 * first page to the browser, and the window loops until Chromium gives up with
 * ERR_TOO_MANY_REDIRECTS. Measured 01/09, on the first run after the guard was added.
 * @param target - where the window is being asked to go.
 * @param home - the origin this window was opened on.
 * @returns True when the navigation may proceed in the app.
 */
function staysHome(target, home) {
  let url
  try {
    url = new URL(target, home)
  } catch {
    // Unparseable is not a reason to hand it to the browser; let the window deal with it.
    return true
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return true
  return url.host === new URL(home).host
}

/**
 * Whether this is a first run: the first-run screen was never closed on this device (or
 * TRACY_DESKTOP_ONBOARDING=again asks for it this run). Read live, at every navigation.
 */
function firstRun() {
  if (onboardingBridge !== undefined) return onboardingBridge.firstRun()
  return appPreferences().read().onboarding.closedAt === null
}

/** The operating system's languages, most preferred first; none when the system cannot say. */
function systemLanguages() {
  try {
    return app.getPreferredSystemLanguages()
  } catch {
    return []
  }
}

/** Sessions whose sign-in page requests already get `onboard=1` on a first run (one hook each). */
const markedSessions = new WeakSet()

/**
 * FIRST RUN: EVERY REQUEST FOR THE SIGN-IN PAGE CARRIES `onboard=1` (tasks/todo-desktop-onboard-v2.md,
 * contract 5), so tracy-web draws it inside the Setup frame. One hook on the session catches all the
 * ways a window gets there — the 302 from `/`, a sign-out, the waiting page's Cancel, a failed round —
 * where a `will-navigate`/`will-redirect` pair would miss `loadURL` and could lose a redirect's
 * cookies. Main frames only; the other query parameters keep their exact text. An older server
 * ignores the parameter.
 * @param {Electron.Session} ses
 * @param {string} origin
 */
function markFirstRunSignIn(ses, origin) {
  if (markedSessions.has(ses)) return
  markedSessions.add(ses)
  ses.webRequest.onBeforeRequest(
    { urls: [`${origin}/login*`], types: ['mainFrame'] },
    (details, callback) => {
      const marked =
        details.resourceType === 'mainFrame' && firstRun() ? firstRunLoginUrl(details.url, origin) : null
      callback(marked === null ? {} : { redirectURL: marked })
    }
  )
}

/** Headers that force the main document fresh (see the comment at the end of `openWindow`). */
const NO_CACHE = { extraHeaders: 'pragma: no-cache\ncache-control: no-cache\n' }

/**
 * THE PRODUCT WINDOWS: the main window and every second window (Cmd+click on another site, File ›
 * New Window — tasks/todo-desktop-multi-window.md). Never the spare (src/window-pool.js) until it is
 * used, never the failure window. Counted here, not with `BrowserWindow.getAllWindows()`, so a hidden
 * spare neither blocks reopening from the Dock nor counts as a window the person has.
 */
const products = new Set()
/** The product window focused last. */
let lastFocused
const productWindows = {
  /** The window in use: the focused product window, else the one focused last. */
  current() {
    const focused = BrowserWindow.getFocusedWindow()
    if (focused !== null && products.has(focused)) return focused
    return lastFocused !== undefined && products.has(lastFocused) ? lastFocused : undefined
  },
  all: () => products
}
/** The shell, installed once for the origin of the first product window. */
let windowShell
/**
 * Where second windows open and how, set by the main window: Tracy's origin, whether it is a remote
 * target, whether to watch the first boot.
 * @type {{ origin: string, remote: boolean, watch: boolean } | undefined}
 */
let product
/** A signed-in Tracy page has answered in some window, and nobody has signed out since. */
let signedIn = false
let quitting = false

/** The spare window's local waiting page (no script, no request). */
const SPARE_PAGE = path.join(__dirname, 'window-waiting.html')

/** Sign-out and sign-in doors: a product window arriving on one means nobody is signed in. */
const SIGNED_OUT = /^\/(?:login|logout|signin)(?:[/?#]|$)/

/**
 * The spare window: a hidden second window with the waiting page painted, prepared once a signed-in
 * Tracy page has answered, so a Cmd+click shows a painted window at once.
 */
const pool = createWindowPool({
  canPrepare: () =>
    signedIn && !quitting && product !== undefined && products.size > 0 && !blockGate.isBlocked(),
  create: () => {
    const window = createWindow(`${product.origin}/`, {
      remote: product.remote,
      role: 'secondary',
      show: false
    })
    const ready = new Promise((resolve, reject) => {
      window.once('ready-to-show', resolve)
      window.webContents.once('did-fail-load', () =>
        reject(new Error('the spare window could not load its page'))
      )
    })
    window.loadFile(SPARE_PAGE).catch(() => {})
    logLink({ event: 'spare-prepared' })
    ready.then(() => logLink({ event: 'spare-ready' })).catch(() => {})
    return { window, ready }
  }
})

/**
 * Count a window as a product window from now on.
 * @param {BrowserWindow} window
 */
function addProduct(window) {
  products.add(window)
  lastFocused ??= window
  window.on('focus', () => {
    lastFocused = window
    recordAppOpened(window)
    // Back from System Settings, perhaps: the notification permission is read again, and the first-run
    // screen hears of a change (src/notify-bridge.js).
    void notifyBridge?.refresh().catch(() => {})
    void opportunitiesMenu?.refresh()
  })
  // A shown first window may already have focused before it was registered here.
  if (window.isFocused()) recordAppOpened(window)
  window.on('closed', () => {
    products.delete(window)
    if (lastFocused === window) lastFocused = undefined
    // No window left: no spare either, until the next window's page answers.
    if (products.size === 0) pool.discard()
    // Hidden at once; read again for the window that is left, if any.
    opportunitiesMenu?.reset()
    opportunitiesMenu?.windowsChanged()
    void opportunitiesMenu?.refresh()
  })
  window.webContents.on('render-process-gone', () => opportunitiesMenu?.reset())
  opportunitiesMenu?.windowsChanged()
  window.webContents.on('did-navigate', (_event, url) => {
    if (product === undefined) return
    try {
      const at = new URL(url)
      if (at.origin !== product.origin || !SIGNED_OUT.test(at.pathname)) return
    } catch {
      return
    }
    // Signed out (or the session ended): the spare goes; the next signed-in page prepares a new one.
    signedIn = false
    pool.discard()
    opportunitiesMenu?.reset()
  })
}

/**
 * Whether the app's session is signed in right now, asked of Tracy itself (`/auth/me`) through the
 * windows' own session. A page registering is not proof: a stale page (loaded before a sign-out,
 * reloaded from cache) registers too — measured in the E2E, it brought a spare back after sign-out.
 * Local target (a dsh behind the password gate): there is no Tracy session; the page answering is it.
 * @returns {Promise<boolean>}
 */
async function signedInNow() {
  if (product === undefined) return false
  if (!product.remote) return true
  try {
    const answer = await session.defaultSession.fetch(`${product.origin}/auth/me`, { cache: 'no-store' })
    if (!answer.ok) return false
    const body = await answer.json()
    return typeof body?.email === 'string' && body.email !== ''
  } catch {
    return false
  }
}

/**
 * A page in a product window registered its link router. If it can open windows and the app is
 * signed in, prepare the spare.
 * @param {boolean} ready
 * @param {boolean} windows
 */
function pageReady(ready, windows) {
  if (!ready || !windows) return
  void signedInNow().then((yes) => {
    if (!yes) return
    signedIn = true
    pool.prepare()
    void opportunitiesMenu?.refresh()
  })
}

/**
 * Open a SECOND product window on `url` (a Tracy address the link router checked, or the home page
 * for File › New Window): the painted spare when there is one, otherwise a plain new window. Placed
 * next to the window in use; nothing about it is remembered.
 * @param {string} url
 */
function openSecondWindow(url) {
  if (product === undefined || quitting) return
  // Below the minimum version: File › New Window and Cmd+click bring the blocked screen instead.
  if (!blockGate.admit('new-window')) return
  // Taken before anything else, synchronously: a second Cmd+click right after cannot get it too.
  const spare = pool.take()
  const via = spare === undefined ? 'new' : 'spare'
  logLink({ event: 'second-window', via, url })
  const from = productWindows.current()
  const bounds = cascadeWindow(from?.getNormalBounds(), screen.getAllDisplays(), WINDOW_LIMITS)
  const window =
    spare ??
    createWindow(`${product.origin}/`, { remote: product.remote, role: 'secondary', show: false, bounds })
  if (spare !== undefined) {
    if (bounds.x === undefined) window.setSize(bounds.width, bounds.height)
    else window.setBounds(bounds)
  }
  addProduct(window)
  window.once('show', () => logLink({ event: 'second-window-shown', via }))
  window.show()
  window.loadURL(url, NO_CACHE)
  if (product.watch) watchFirstBoot(window)
}

/**
 * Open the MAIN window (or the failure window, on `about:blank`).
 * @param url - the sign-in door address.
 * @param watch - whether to watch the first boot. Off for a REMOTE target: `watchFirstBoot`
 *   decides "the interface did not mount" from an empty `#root`, and `#root` belongs to the dsh
 *   SPA — the cloud sign-in door is served by a Worker and has no such node. Leaving it on there
 *   reloads once on every launch, for a condition that does not apply to the page on screen.
 * @param remote - true for a REMOTE target: provider sign-in then runs as a desktop round
 *   (`signin-handoff.js`) instead of being handed to the browser outright.
 */
function openWindow(url, watch = true, remote = false) {
  const http = url.startsWith('http')
  // The main window comes back where it was left (src/window-bounds.js); the failure window does not.
  const place = http
    ? rememberWindow(path.join(app.getPath('userData'), 'window-state.json'), WINDOW_LIMITS, screen)
    : undefined
  const window = createWindow(url, { remote, role: 'primary', show: true, options: place?.options })
  place?.attach(window)
  if (http) {
    product ??= { origin: new URL(url).origin, remote, watch }
    addProduct(window)
  }
  window.loadURL(url, NO_CACHE)
  if (watch) watchFirstBoot(window)
  return window
}

/**
 * Make one app window and wire it — the frame, the shell, link routing, sign-in hand-off and the
 * navigation guards — without loading anything.
 * @param {string} url - the address the window belongs to (`home`): its origin is Tracy's.
 * @param {{ remote: boolean, role: 'primary' | 'secondary', show: boolean,
 *   options?: Electron.BrowserWindowConstructorOptions, bounds?: Partial<Electron.Rectangle> }} how
 *   `show: false` makes a hidden window that still paints (the spare).
 * @returns {BrowserWindow}
 */
function createWindow(url, { remote, role, show, options, bounds }) {
  const home = url
  // `about:blank` (the failure window) has no origin to trust; it gets the frame, not the bridge.
  const shellOrigin = url.startsWith('http') ? new URL(url).origin : undefined
  const window = new BrowserWindow({
    ...(options ?? bounds ?? { width: WINDOW_LIMITS.width, height: WINDOW_LIMITS.height }),
    minWidth: WINDOW_LIMITS.minWidth,
    minHeight: WINDOW_LIMITS.minHeight,
    show,
    ...(show ? {} : { paintWhenInitiallyHidden: true }),
    // The packaged name: `Tracy Cowork`, or `Tracy Cowork Dev` for any origin but production. A source
    // run is always `Tracy Cowork Dev` (src/dev-profile.js).
    title: app.getName(),
    backgroundColor: '#1b1f23',
    // dsh's desktop chrome per platform (src/window-chrome.js) — macOS: no title bar, traffic lights
    // inset, sidebar material behind a transparent page; Windows: hidden title bar, system buttons as
    // an overlay in the theme's colours; Linux: the system frame, menu bar hidden until Alt. Overrides
    // the background above on macOS and Windows.
    ...windowShellOptions(),
    webPreferences: {
      // Marks the page as inside dsh's desktop shell (window drag, traffic-light clearance) and gives
      // it the shortcut bridge dsh then requires; names the window's role. Read shell/preload.ts
      // before removing it.
      ...(shellOrigin === undefined ? {} : shellWebPreferences(shellOrigin, role)),
      // This shell has no API of its own to expose, so close everything. A `nodeIntegration: true` here
      // turns every XSS hole in the interface into the power to run code on the user's machine.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })
  // Each part wired to this window (pool, bounds, shell, sign-in hand-off, links, and the four
  // `tracyDesktop.app` bridges) listens for `closed` once: a fixed count, not a leak, but above
  // Node's default warning limit of 10 since the first-run bridges.
  window.setMaxListeners(Math.max(window.getMaxListeners(), 24))

  // Links to other places open in the real browser; this window is not a second-rate one.
  const subscriptions = subscriptionHandoff({
    home: url,
    currentUrl: () => window.webContents.getURL(),
    openExternal: (target) => openLinkExternally(target),
    log: (line) => process.stdout.write(`tracy-desktop: ${line}\n`),
    // The handoff has just checked the window still shows a page on `home`'s origin.
    deliver: (callback) => {
      if (window.isDestroyed()) return
      window.webContents.executeJavaScript(callbackScript(callback)).catch((error) => {
        process.stderr.write(`tracy-desktop: could not deliver a subscription callback: ${error.message}\n`)
      })
      // The person is in the browser tab that just said "return to Tracy Cowork".
      if (window.isMinimized()) window.restore()
      window.show()
      window.focus()
    }
  })
  window.on('closed', () => subscriptions.close())
  if (shellOrigin !== undefined) {
    // Before the shell, so its first menu already carries the (hidden) item.
    opportunitiesMenu ??= createOpportunitiesMenu(shellOrigin)
    windowShell ??= installShell(
      productWindows,
      app.getPath('userData'),
      shellOrigin,
      updateMenuItems,
      () => openSecondWindow(`${shellOrigin}/`),
      // Help › Getting started with Tracy Cowork (src/app-menu.js).
      () => void onboardingBridge?.openOnboarding(),
      // Help › What's New… — Settings › Help & about (tasks/todo-desktop-update-policy.md D6).
      () => openHelpAbout('menu'),
      // Help › Find Website Opportunities… while the operator's switch is on.
      () =>
        opportunitiesMenu === undefined
          ? undefined
          : { visible: opportunitiesMenu.visible(), open: () => void opportunitiesMenu?.click() }
    )
    windowShell.attach(window)
    // Settings › Help & about reads the version and the update state through this (src/update-bridge.js).
    updateBridge ??= createUpdateBridge({ ipcMain, origin: shellOrigin, face: updateFace, log: logUpdate })
    updateBridge.attach(window)
    // The first-run screen's three bridges, same origin, same rule (see "First-run screen" below).
    firstRunBridges ??= createFirstRunBridges(shellOrigin)
    for (const bridge of firstRunBridges) bridge.attach(window)
  }
  // Links the page asks to open in a new window: a site's front page opens in the side card's
  // Browser tab, another site or Tracy screen in this window — or, on Cmd+click, in a second window —
  // the rest in the browser. The page decides, `installLinks` checks and carries it out once
  // (src/open-requests.js).
  const links =
    shellOrigin === undefined
      ? undefined
      : installLinks(window, shellOrigin, {
          // A subscription sign-in the page opens itself (Getting started, Settings › AI accounts)
          // must start the callback catcher too, not only one that comes through `window.open`.
          openExternal: (target) =>
            void subscriptions
              .openOrBrowse(target)
              .catch((error) =>
                process.stderr.write(`tracy-desktop: could not open a link: ${error.message}\n`)
              ),
          log: logLink,
          openWindow: openSecondWindow,
          onReady: pageReady
        })
  // 🔒 Denied SYNCHRONOUSLY, always: Electron reads the return value right away, and the window this
  // app wants never comes from here. What happens instead runs after, starting with a subscription
  // sign-in, whose callback must come back to this window (subscription-handoff.js).
  window.webContents.setWindowOpenHandler((details) => {
    void subscriptions
      .open(details.url)
      .then((handled) => {
        if (handled) return
        if (links === undefined) return openLinkExternally(details.url)
        links.open({ url: details.url, disposition: details.disposition })
      })
      .catch((error) => process.stderr.write(`tracy-desktop: could not open a link: ${error.message}\n`))
    return { action: 'deny' }
  })

  /**
   * THE APP AND THE BROWSER HOLD TWO DIFFERENT COOKIE JARS.
   *
   * A session cookie set in the browser never reaches this window, even when both point at the
   * same origin: Electron keeps its own cookie store under the app's user-data folder. So a
   * Google/GitHub sign-in that simply finishes in the browser leaves the person signed in THERE
   * and still on the sign-in page HERE (measured 07/10 against cowork.tracy.ai).
   *
   * REMOTE target: provider sign-in runs as a desktop round instead (`startSignIn` below). The
   * browser is used only to approve the round; the app then redeems the round through THIS
   * window's session, so the `Set-Cookie` of that answer lands in the app's jar.
   *
   * LOCAL target (a dsh on 127.0.0.1): unchanged — the browser opens Tracy's sign-in page and the
   * person signs in there. That session stays in the browser; the app's own sign-in is the email
   * code (or the dsh token) inside this window.
   *
   * Either way, why the provider never opens INSIDE the app: here the person has none of the
   * cookies their browser already holds, and no address bar or padlock to judge whether a sign-in
   * page is real.
   */
  const origin = new URL(home).origin
  const ses = window.webContents.session
  const waitingUrl = pathToFileURL(WAITING_PAGE).href
  const handoff = remote
    ? createSigninHandoff({
        home: origin,
        // Every request of the round goes through the WINDOW's session, so its cookies — above
        // all the Set-Cookie of the redeem — are this window's cookies.
        fetch: (target, init) => ses.fetch(target, init),
        openExternal: (target) => shell.openExternal(target),
        log: (line) => process.stdout.write(`tracy-desktop: ${line}\n`),
        // The approve page says which computer asks: `Tracy Cowork for Mac`, `… for Windows`, `… for Linux`.
        device: deviceName(process.platform)
      })
    : null

  /**
   * Run one desktop sign-in round and land the window wherever it ends.
   * @param {string} [email] - the address typed on the sign-in page (the email door); the round sends
   *   it in a request body and the waiting page names it.
   */
  const startSignIn = async (email) => {
    const result = await handoff.start({
      email,
      onCode: ({ matchCode }) => {
        if (window.isDestroyed()) return
        const query = waitingQuery({
          code: matchCode,
          home: origin,
          email,
          setup: firstRun(),
          languages: systemLanguages()
        })
        window.loadFile(WAITING_PAGE, { query }).catch(() => {})
      }
    })
    // Cancelled = the person navigated away or a newer round replaced this one; whoever did that
    // already decided where the window goes.
    if (result.outcome === 'cancelled' || window.isDestroyed()) return
    if (result.outcome === 'signed-in') {
      // Write the new session to disk now, so a quit right after sign-in does not lose it.
      await ses.cookies.flushStore().catch(() => {})
      if (!window.isDestroyed()) window.loadURL(home, NO_CACHE)
      return
    }
    if (result.reason) process.stderr.write(`tracy-desktop: desktop sign-in failed: ${result.reason}\n`)
    // Back on the sign-in page WITH the reason (refused, expired, denied, failed): the browser may
    // already have said "You're signed in", so a silent return here reads as a broken app.
    window.loadURL(signInFailedUrl(origin, result), NO_CACHE)
  }

  if (handoff) {
    // Leaving the waiting page — its Cancel link back to /login, or anything else — ends the round.
    // Navigations the round itself makes (the waiting page) do not count.
    window.webContents.on('did-start-navigation', (details) => {
      if (!handoff.active || !details.isMainFrame || details.isSameDocument) return
      if (details.url.split('?')[0] === waitingUrl) return
      process.stdout.write(`tracy-desktop: desktop sign-in: left for ${details.url.split('?')[0]}\n`)
      handoff.cancel()
    })
    window.on('closed', () => handoff.cancel())
  }

  // On a first run every sign-in page this window asks for carries `onboard=1` (see markFirstRunSignIn).
  if (handoff) markFirstRunSignIn(ses, origin)

  const leaveToBrowser = (event, target) => {
    const door = handoff ? signInDoor(target, home) : null
    if (door !== null) {
      event.preventDefault()
      startSignIn(door.email)
      return
    }
    if (staysHome(target, home)) return
    event.preventDefault()
    shell.openExternal(target)
  }

  window.webContents.on('will-navigate', leaveToBrowser)

  // A page that could not load (offline, the server down) shows the shell's "can't reach" page with
  // Retry instead of Chromium's blank error page: main frame only, never for ERR_ABORTED, never for
  // a local page (src/load-failure.js). The failure window (`about:blank`) has no home to retry.
  if (shellOrigin !== undefined)
    watchLoadFailure(window.webContents, {
      home,
      show: ({ retry, detail }) => {
        if (window.isDestroyed()) return
        process.stdout.write(
          `tracy-desktop: page could not load (${detail || 'unknown error'}); showing Retry\n`
        )
        const query = unreachableQuery({ retry, detail, app: app.getName(), languages: systemLanguages() })
        window.loadFile(UNREACHABLE_PAGE, { query }).catch(() => {})
      }
    })

  // The signed-in app tells tracy-web which install it is (`desktop_install`, see `linkInstall`).
  if (remote)
    window.webContents.on('did-finish-load', () => {
      void linkInstall(window, origin)
      void appOpened?.flush()
    })

  // A LOCAL dsh behind the password gate: the plan card's requests go without a Referer
  // (`refererToDrop` says why). A remote target is served by its own proxy chain and is left alone.
  if (!remote && origin.startsWith('http')) {
    ses.webRequest.onBeforeSendHeaders({ urls: [`${origin}/dsh-subscriptions/*`] }, (details, callback) => {
      if (!refererToDrop(details.url, origin)) return callback({ requestHeaders: details.requestHeaders })
      const requestHeaders = { ...details.requestHeaders }
      for (const name of Object.keys(requestHeaders))
        if (name.toLowerCase() === 'referer') delete requestHeaders[name]
      callback({ requestHeaders })
    })
  }

  /**
   * A REDIRECT OFF OUR ORIGIN IS A FLOW LEAVING, NOT A LINK BEING FOLLOWED — SO HAND OVER THE
   * WHOLE FLOW, NOT THE STEP IT IS ON.
   *
   * `will-navigate` misses it when the provider step is a redirect answering a request to Tracy's
   * OWN origin: that request is allowed, and the hand-off happens one step later in the answer.
   *
   * Sign-in with a provider is PKCE: the request to Tracy's own origin answers with a cookie holding
   * the verifier, and only then redirects to the provider. Both halves must live in ONE cookie
   * jar. Sending just the redirect to the browser splits them - the verifier stays in the app, the
   * provider hands back to `/signin?code=...` in the browser, and Tracy correctly answers "Link not
   * valid". Measured 01/09, immediately after the redirect guard started working.
   *
   * So the whole flow is handed over: on a REMOTE target as a desktop round (the browser approves,
   * the app redeems into its own jar); on a LOCAL target by opening Tracy's own sign-in page in the
   * browser, where the session then stays.
   */
  window.webContents.on('will-redirect', (event, target) => {
    // A site preview redirect is not an app sign-in.
    if (event.isMainFrame === false || staysHome(target, home)) return
    event.preventDefault()
    if (handoff) {
      startSignIn()
      return
    }
    const door = new URL('/login', home)
    door.searchParams.set('next', '/')
    shell.openExternal(door.toString())
  })

  // THE HOME PAGE MUST ALWAYS BE FRESH, NEVER TAKEN FROM CACHE (callers load with NO_CACHE).
  //
  // dsh serves `/` WITHOUT `cache-control` (measured 30/08, both directly and through the password gate),
  // so Chromium caches it on its own heuristic. But `index.html` is NOT a static page: it embeds
  // `__DSH_BOOT__`, the list of plugin bundles with a content-hashed `rev`; the bundles are keyed by
  // `rev` and marked `immutable`. Old HTML + immutable bundles = a window asking for a `rev` the server
  // no longer serves.
  //
  // Only the MAIN DOCUMENT is forced fresh. Bundles are still cached — they are immutable per `rev`, and
  // forcing a 4.8 MB reload on every app launch is a pointless cost.
  return window
}

/** How long after the document loads before concluding the interface could not mount. */
const MOUNT_GRACE_MS = 2_500

/**
 * Reload EXACTLY ONCE when the first boot fails to mount the interface.
 *
 * A STARTUP TIMING RACE, not a cache bug. Measured with CDP on 30/08: the window held the SAME `rev` as
 * the server (`3b2f9cbd80a6`, 49 entries), so the HTML was not stale — yet the `/plugins/??…` bundle of
 * the first load still failed, and right after, fetching that same URL from inside the page returned
 * 200 with all 4,805,093 bytes. A plain reload and the interface shows in full.
 *
 * Why the race: `run.sh` writes the token AS SOON AS dsh prints the URL, while the password gate is a
 * separate process that binds AFTER that (the order is plain in the log). The app waits for the gate to
 * answer and opens the window at once, so the first burst of requests hits a gateway that just bound
 * but cannot serve yet.
 *
 * Do NOT wait longer with a `sleep`: no number is right for every machine, and guessing long slows every
 * app launch for a bug that only happens now and then. Do NOT probe `/gateway/readyz` either — it only
 * checks SQLite and says nothing about whether the proxy can serve yet.
 *
 * The reload condition is an empty `#root`, NOT a search for the string "Failed to load plugins": that
 * string may be translated, while "the interface did not mount" is exactly what needs knowing.
 *
 * Exactly once. A real failure must leave the error screen in place for the user to read; a reload loop
 * is a window flickering forever that nobody can diagnose.
 * @param window - the window just opened.
 */
function watchFirstBoot(window) {
  let retried = false
  window.webContents.on('did-finish-load', () => {
    if (retried || !window.webContents.getURL().startsWith('http')) return
    setTimeout(() => {
      if (retried || window.isDestroyed()) return
      window.webContents
        .executeJavaScript('document.getElementById("root")?.children.length ?? 0', true)
        .then((mounted) => {
          if (retried || mounted > 0 || window.isDestroyed()) return
          retried = true
          // English because this is a LOG outsiders can read, not a comment — `check-language`
          // caught exactly this line on 30/08.
          process.stdout.write('tracy-desktop: interface did not mount on first boot — reloading once\n')
          window.webContents.reload()
        })
        .catch(() => {})
    }, MOUNT_GRACE_MS)
  })
}

/**
 * Open a window that states the error.
 *
 * Any error before a window exists must become a window. A silently rejected promise leaves an app
 * running with nothing on screen — the user sees the icon bounce and that is it, and the reason sits in
 * a log nobody opens.
 * @param error - the error to show.
 */
async function showFailure(error) {
  const window = openWindow('about:blank')
  await window.webContents.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<body style="font:14px -apple-system;padding:2rem;background:#1b1f23;color:#eee">` +
          `<h2>${app.getName()} could not start</h2><pre style="white-space:pre-wrap">${String(error.message)}</pre>` +
          `<p>Usually one of two things: the registry is not running ` +
          `(<code>pnpm registry</code>), or the repository has moved away from ` +
          `<code>${REPO}</code>.</p></body>`
      )
  )
}

/**
 * Tell Tracy's pages they run inside the app: the default user agent plus `TracyCowork/<version>`.
 * Nothing reads it today: the per-surface switch column it was added for was dropped (07/10;
 * every `/ops` › User Interface area applies to the app as it is). It stays so a page or a log line
 * can tell the app apart, and for part B of tasks/todo-desktop-surface.md.
 *
 * 🔒 IT ONLY IDENTIFIES, NEVER WHAT IS ALLOWED. Anyone can type this string into any
 * browser, and all it changes is their own view of a public answer. Never read it to turn on a
 * sign-in, choose a profile, set `ownsHost`, unlock a model or skip a seat check.
 *
 * Set before the first window: `userAgentFallback` applies to every session and webContents that
 * does not set its own user agent (none here does).
 */
function markUserAgent() {
  const token = `TracyCowork/${app.getVersion()}`
  if (!app.userAgentFallback.includes(token)) app.userAgentFallback = `${app.userAgentFallback} ${token}`
}

// ── Self-update (src/updater.js) ─────────────────────────────────────────────────────────────────

/** The running self-update, once started; null in a build with no update channel. */
let updater = null

/** The update bridge for the product window (src/update-bridge.js), once a window opened. */
let updateBridge

// ── First-run screen (tasks/todo-desktop-onboard-agent.md) ───────────────────────────────────────
//
// Three more halves of `window.tracyDesktop.app` (protocol 2), made with the update bridge for the
// first product window and attached to every product window, under the same sender rule
// (src/bridge-guard.js): `agents` tells which agent CLIs are installed, searching the login shell's
// PATH too (src/shell-path.js — read into a list of its own, never into `process.env.PATH`, so no
// other child process changes); `onboarding` keeps whether this device closed the screen; and
// `notifications` shows a system notification when a turn ends while no Tracy window is in front.
// The last two keep their state in the one `preferences.json` document (`appPreferences()`).
// First-run v2 (tasks/todo-desktop-onboard-v2.md) adds the locale bridge: the OS languages for dsh's
// `__DSH_LOCALE__` (src/locale-bridge.js), and the macOS notification permission (src/notify-permission.js).

/** The first-run bridges (agents, onboarding, notify, locale), once a product window opened. */
let firstRunBridges
/** The onboarding one of them: Help › Getting started asks it to open the screen. */
let onboardingBridge
/** The notify one of them: a product window gaining focus has it read the permission again. */
let notifyBridge

/** The app's preferences document (src/preferences.js): one instance, so writes queue in one line. */
let appPrefs
function appPreferences() {
  appPrefs ??= createPreferences({
    file: path.join(app.getPath('userData'), 'preferences.json'),
    log: logUpdate
  })
  return appPrefs
}

/** @param {string} origin - the pinned origin of the product windows. */
function createFirstRunBridges(origin) {
  const log = (line) => process.stdout.write(`tracy-desktop: ${line}\n`)
  const bridges = [
    createAgentsBridge({
      ipcMain,
      origin,
      reader: createShellPathReader({ spawn, platform: process.platform, env: process.env }),
      platform: process.platform,
      env: process.env,
      home: app.getPath('home'),
      log
    }),
    (onboardingBridge = createOnboardingBridge({
      ipcMain,
      origin,
      prefs: appPreferences(),
      again: onboardingAgain({ packaged: app.isPackaged, env: process.env }),
      log
    })),
    (notifyBridge = createNotifyBridge({
      ipcMain,
      origin,
      Notification,
      windows: () => BrowserWindow.getAllWindows(),
      prefs: appPreferences(),
      platform: process.platform,
      openExternal: (target) => shell.openExternal(target),
      // macOS: the permission, from the native addon (src/notify-permission.js); elsewhere unknown.
      permission: createPermissionReader({ platform: process.platform, log }),
      log
    })),
    // dsh's `__DSH_LOCALE__` asks for the OS languages through this (shell/preload.ts).
    createLocaleBridge({ ipcMain, origin, systemLanguages, log })
  ]
  // Read the permission once now, so the first status the page asks for is already the system's.
  void notifyBridge.refresh().catch(() => {})
  return bridges
}

/** Who watches the update state through `updateFace`; the updater starts after the first window. */
const updateWatchers = new Set()

/** The running build's own notes (src/bundle-notes.js), read once: they never change while it runs. */
let bundleNotes
const ownNotes = () => (bundleNotes ??= readBundleNotes(app.isPackaged ? process.resourcesPath : undefined))

/**
 * Every push moves this forward: the state the page gets is the updater's, the minimum version
 * verdict and What's new together, so one counter orders all three (the page drops an older revision).
 */
let faceRevision = 0
const faceState = () => ({
  ...(updater ? updater.getState() : offUpdateState()),
  revision: faceRevision,
  policy: policyGuard ? policyGuard.current() : null,
  whatsNew: whatsNew ? whatsNew.current() : null
})
/** Push the composed state to every watcher (the update bridge's product windows). */
function publishFace() {
  faceRevision++
  const state = faceState()
  for (const watcher of updateWatchers) watcher(state)
}

/**
 * What the update bridge talks to: the running updater, or — in a copy that never updates itself
 * (not packaged, Preview, no channel) — an updater that is off and does nothing; plus What's new and
 * the changelog link (tasks/todo-desktop-update-policy.md D4–D6).
 */
const updateFace = {
  info: () => ({
    version: app.getVersion(),
    arch: process.arch,
    channel: readPinned('update-channel') ?? null,
    updates: updater !== null,
    installMode: updater ? updater.installMode() : null,
    releaseNotes: ownNotes().releaseNotes,
    notesPage: ownNotes().page,
    docsOrigin: ownNotes().docsOrigin
  }),
  getState: faceState,
  onState: (watcher) => {
    updateWatchers.add(watcher)
    return () => updateWatchers.delete(watcher)
  },
  check: async () => updater?.check(),
  restart: async () => (updater ? updater.restart() : false),
  download: () => (updater ? updater.download() : false),
  setAutoCheck: async (on) => {
    if (!updater) throw new Error('this copy does not update itself')
    await updater.setAutoCheck(on)
  },
  seen: async () => {
    await whatsNew?.seen()
  },
  setNotify: async (on) => {
    if (!whatsNew) throw new Error('this copy keeps no What’s new state')
    await whatsNew.setNotify(on)
  },
  openChangelog: () => {
    const url = changelogUrl(ownNotes())
    if (url === null) {
      logUpdate('changelog: this build names no changelog page; nothing opened')
      return
    }
    void openLinkExternally(url)
  }
}

/** The app menu's "Check for Updates…", present only while the updater runs. */
function updateMenuItems() {
  return updater ? [{ label: 'Check for Updates…', click: () => void updater.checkNow() }] : []
}

/**
 * Updater log lines, to stdout and to `<userData>/updater.log` (a packaged app's stdout goes
 * nowhere anyone reads). Kept under ~1 MB by rolling to `updater.log.1`.
 * @param {string} line
 */
function logUpdate(line) {
  const text = `${new Date().toISOString()} ${line}\n`
  process.stdout.write(`tracy-desktop: ${line}\n`)
  try {
    const file = path.join(app.getPath('userData'), 'updater.log')
    if ((fs.statSync(file, { throwIfNoEntry: false })?.size ?? 0) > 1_000_000)
      fs.renameSync(file, `${file}.1`)
    fs.appendFileSync(file, text)
  } catch {}
}

/**
 * TEST ONLY: `TRACY_DESKTOP_UPDATE_ANSWER=restart|later|download` answers the update questions
 * without a dialog, so an end-to-end run (tasks/evidence/desktop-auto-update/) can press "Restart"
 * or "Later" on a machine with no one at the screen. A comma list answers the questions in order and
 * repeats its last answer (`later,restart`: Later to the first, Restart to every one after it — the
 * Help & about run, tasks/evidence/desktop-help-about/). Unset (always, outside such a run): a dialog.
 */
const UPDATE_ANSWERS = (process.env.TRACY_DESKTOP_UPDATE_ANSWER || '').split(',').filter(Boolean)
const UPDATE_ANSWER = UPDATE_ANSWERS.length > 0 ? UPDATE_ANSWERS : undefined

/**
 * Ask the person about an update — a SHEET on the product window in use, never a free-floating dialog:
 * without a parent, macOS runs the dialog modally on the main thread and every timer stops while it is
 * open (tasks/evidence/desktop-update-policy/dialog-timer/CONCLUSION.md). No window → a system
 * notification and the quiet answer (src/update-dialog.js, A4).
 * @param {{ kind: string, version?: string, reason?: string }} question
 * @returns {Promise<string>} the answer `src/updater.js` expects.
 */
async function askAboutUpdate(question) {
  const current = productWindows.current()
  const plan = updateQuestionPlan({
    question,
    parent: current,
    appName: app.getName(),
    platform: process.platform,
    installMode: updater ? updater.installMode() : 'manual'
  })
  logUpdate(`asking: ${question.kind}${question.version ? ` ${question.version}` : ''}`)
  if (UPDATE_ANSWER !== undefined) {
    const wanted = UPDATE_ANSWER.length > 1 ? UPDATE_ANSWER.shift() : UPDATE_ANSWER[0]
    const answer = plan.answers.includes(wanted) ? wanted : plan.answers.at(-1)
    logUpdate(`answered (TRACY_DESKTOP_UPDATE_ANSWER): ${answer}`)
    return answer
  }
  if (plan.show === 'notification') {
    logUpdate(`dialog not opened: ${question.kind}, no product window — a notification instead`)
    showNotification({ title: plan.title, body: plan.body, onClick: () => openHelpAbout('notification') })
    return plan.answer
  }
  logUpdate(`dialog open: ${question.kind}, sheet on a product window`)
  const openedAt = Date.now()
  const { response } = await dialog.showMessageBox(plan.parent, {
    type: 'info',
    message: plan.message,
    detail: plan.detail,
    buttons: plan.buttons,
    defaultId: 0,
    cancelId: plan.buttons.length - 1
  })
  const answer = plan.answers[response] ?? plan.answers.at(-1)
  logUpdate(`answered: ${answer} (dialog open ${Date.now() - openedAt} ms)`)
  return answer
}

/**
 * A system notification from the shell itself (update reminder, What's new, minimum version warning,
 * an update answer with no window). Nothing when the system has none.
 * @param {{ title: string, body: string, onClick?: () => void }} input
 */
function showNotification({ title, body, onClick }) {
  // TEST ONLY (src/debug-switches.js TRACY_DESKTOP_NOTIFY_LOG): recorded and pressed, not shown.
  notifyLog ??=
    updateTestSwitches({ channel: readPinned('update-channel') ?? 'stable', env: process.env }).notifyLog ??
    ''
  if (notifyLog !== '') {
    try {
      fs.appendFileSync(notifyLog, `${JSON.stringify({ at: new Date().toISOString(), title, body })}\n`)
    } catch {}
    logUpdate(`notification (test log, pressed): ${title}`)
    onClick?.()
    return
  }
  if (!Notification.isSupported()) {
    logUpdate(`notification not supported here: ${title}`)
    return
  }
  const notice = new Notification({ title, body, silent: false })
  if (onClick) notice.on('click', () => onClick())
  notice.show()
  logUpdate(`notification: ${title}`)
}

/** TRACY_DESKTOP_NOTIFY_LOG, read once: '' when unset (always, outside a test run). */
let notifyLog

/** The shell's words, in the system's language (src/shell-strings.js). */
let words
const t = (key, params) => {
  words ??= shellWords(shellLanguage(app.getPreferredSystemLanguages?.() ?? [app.getLocale()]))
  // (`app.getPreferredSystemLanguages` exists since Electron 21; the fallback is for safety only.)
  return words(key, { app: app.getName(), ...params })
}

/**
 * Bring Settings › Help & about forward (a notification pressed, Help › What's New…): in the product
 * window in use; with none, a new main window opened on `?settings=help`, which the Settings plugin
 * reads on load (packages/ui/tracy-settings settings-link.ts). Below the minimum: the blocked screen.
 * @param {string} why - for the log.
 */
function openHelpAbout(why) {
  if (!blockGate.admit('help')) return
  const window = productWindows.current() ?? [...products][0]
  logUpdate(`help & about asked for (${why})`)
  if (window !== undefined && !window.isDestroyed()) {
    // A window whose page is not Tracy's (still loading, signed out) cannot take the request: it comes
    // forward as it is — never a second window for it.
    if (!updateBridge?.openHelp(window))
      logUpdate('help & about: the window shows no Tracy page yet; focused only')
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    return
  }
  if (productTarget === undefined) return
  const target = new URL(productTarget.url)
  target.searchParams.set('settings', 'help')
  openWindow(target.href, productTarget.watch, productTarget.remote)
}

// ── Help › Find Website Opportunities… (tasks/spec-website-opportunities-contracts.md §6) ──────

/** Whether the item shows, from Tracy's `/api/ui` (src/website-opportunities-menu.js). */
let opportunitiesMenu

/**
 * The product window to act on: the one in use, else any — while its page is on `origin`.
 * @param {string} origin - the pinned origin.
 */
function opportunityWindow(origin) {
  for (const window of [productWindows.current(), ...products]) {
    if (window === undefined || window.isDestroyed()) continue
    try {
      if (new URL(window.webContents.getURL()).origin === origin) return window
    } catch {
      // Not loaded yet, or a local page: not on the origin.
    }
  }
  return undefined
}

/** @param {string} origin - the pinned origin of the product windows. */
function createOpportunitiesMenu(origin) {
  return createWebsiteOpportunitiesMenu({
    currentOrigin: () => (opportunityWindow(origin) === undefined ? undefined : origin),
    hasWindows: () => products.size > 0,
    signedIn: () => signedIn,
    // The windows' own session, so the cookie goes along; no answer in 5 s is no answer.
    readHidden: async (at) => {
      try {
        const answer = await session.defaultSession.fetch(`${at}/api/ui`, {
          cache: 'no-store',
          headers: { accept: 'application/json' },
          signal: AbortSignal.timeout(5000)
        })
        return answer.ok ? hiddenFromAnswer(await answer.json()) : null
      } catch {
        return null
      }
    },
    onChange: () => windowShell?.refreshMenu(),
    open: () => openWebsiteOpportunities(origin),
    log: (line) => process.stdout.write(`tracy-desktop: ${line}\n`)
  })
}

/**
 * Ask the product page to open the Website Opportunities tab (it registered `onOpen`), bringing its
 * window forward. With no window on Tracy's page: a new main window on the tab's address.
 * @param {string} origin - the pinned origin.
 */
function openWebsiteOpportunities(origin) {
  if (!blockGate.admit('website-opportunities')) return
  const window = opportunityWindow(origin)
  if (window !== undefined) {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
    window.webContents.send(WEBSITE_OPPORTUNITIES_CHANNELS.open)
    return
  }
  if (productTarget === undefined) return
  const target = new URL('/new/', productTarget.url)
  target.searchParams.set('tab', 'tracy:website-opportunities')
  openWindow(target.href, productTarget.watch, productTarget.remote)
}

// ── Minimum version (tasks/todo-desktop-update-policy.md C4–C7) ─────────────────────────────────

/** The guard, in a packaged build with an update channel; null otherwise (nothing is ever blocked). */
let policyGuard = null
/** What the person last pressed on the blocked screen, and how it went (src/blocked-screen.js). */
let blockedAttempt = null
/** The blocked window, while one exists. */
let blockedWindow = null
/** Where the main window opens again when the block lifts. */
let productTarget
const BLOCKED_PAGE = path.join(__dirname, 'blocked.html')
const BLOCKED_PRELOAD = path.join(__dirname, 'blocked-preload.js')

const currentBlockedView = () => ({
  lang: shellLanguage(app.getPreferredSystemLanguages?.() ?? [app.getLocale()]),
  ...blockedView({
    t,
    app: app.getName(),
    running: app.getVersion(),
    verdict: policyGuard?.current() ?? { level: 'blocked', minimumVersion: null, offline: false },
    installMode: updater ? updater.installMode() : 'manual',
    attempt: blockedAttempt
  })
})

let blockedBridge
function blockedBridgeNow() {
  blockedBridge ??= createBlockedBridge({
    ipcMain,
    pageUrl: pathToFileURL(BLOCKED_PAGE).href,
    view: () => {
      // The page itself asked: the screen is up (an E2E run reads this line).
      logUpdate('blocked screen: the page read its view')
      testPress()
      return currentBlockedView()
    },
    act: blockedAct,
    log: logUpdate
  })
  return blockedBridge
}

/** TEST ONLY (src/debug-switches.js TRACY_DESKTOP_TEST_BLOCKED_PRESS): the presses left to make. */
let testPresses
let testPressPending = false
function testPress() {
  testPresses ??= [
    ...(updateTestSwitches({ channel: readPinned('update-channel') ?? 'stable', env: process.env })
      .blockedPress ?? [])
  ]
  if (testPressPending || testPresses.length === 0 || !blockGate.isBlocked()) return
  if (blockedAttempt !== null && ('phase' in blockedAttempt || blockedAttempt.outcome === 'installing'))
    return
  const next = testPresses[0]
  if (!currentBlockedView().buttons.some((button) => button.action === next)) return
  testPresses.shift()
  testPressPending = true
  // A pause, as a person reads the screen before pressing.
  setTimeout(() => {
    testPressPending = false
    logUpdate(`blocked screen: ${next} pressed (TRACY_DESKTOP_TEST_BLOCKED_PRESS)`)
    void blockedAct(next)
  }, 3_000)
}
/** What the blocked screen last showed, for the log: one line each time it changes. */
let blockedShown = ''
function pushBlocked() {
  if (!blockedBridge) return
  const view = currentBlockedView()
  const shown = `${view.status ? `${view.status.tone}: ${view.status.text}` : 'no status'} · buttons ${view.buttons.map((b) => b.action).join(', ') || 'none'}`
  if (shown !== blockedShown) logUpdate(`blocked screen shows: ${(blockedShown = shown)}`)
  blockedBridge.push(view)
}

/** One press on the blocked screen: Update (install now), Retry (check the policy), Download (link). */
async function blockedAct(action) {
  const minimumVersion = policyGuard?.current().minimumVersion ?? null
  if (action === 'download') {
    updater?.openDownload(blockedAttempt?.version ?? minimumVersion)
    testPress()
    return
  }
  if (action === 'retry') {
    blockedAttempt = null
    pushBlocked()
    await policyGuard?.retry()
    pushBlocked()
    testPress()
    return
  }
  if (!updater) {
    blockedAttempt = { outcome: 'unavailable', version: null }
    pushBlocked()
    return
  }
  blockedAttempt = { phase: 'working' }
  pushBlocked()
  blockedAttempt = await updater.updateNow({ minimumVersion })
  logUpdate(`blocked screen: update ${JSON.stringify(blockedAttempt)}`)
  pushBlocked()
  testPress()
}

/** The ONE place deciding whether a product window may open (src/blocked-screen.js). */
const blockGate = createBlockGate({
  showBlocked() {
    if (blockedWindow && !blockedWindow.isDestroyed()) {
      if (blockedWindow.isMinimized()) blockedWindow.restore()
      blockedWindow.show()
      blockedWindow.focus()
      return
    }
    const window = new BrowserWindow({
      width: 560,
      height: 440,
      minWidth: 420,
      minHeight: 360,
      title: app.getName(),
      backgroundColor: '#1b1f23',
      show: true,
      webPreferences: {
        preload: BLOCKED_PRELOAD,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    })
    blockedWindow = window
    // A local page with three buttons: it goes nowhere and opens nothing.
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.on('closed', () => {
      if (blockedWindow === window) blockedWindow = null
    })
    blockedBridgeNow().attach(window)
    window.loadFile(BLOCKED_PAGE).catch(() => {})
  },
  closeBlocked() {
    const window = blockedWindow
    blockedWindow = null
    if (window && !window.isDestroyed()) window.close()
  },
  closeProducts() {
    pool.discard()
    // `close()` emits `closed` later, so the set does not change under this loop.
    for (const window of products) if (!window.isDestroyed()) window.close()
  },
  openProduct() {
    if (productTarget !== undefined) openWindow(productTarget.url, productTarget.watch, productTarget.remote)
  },
  productCount: () => products.size,
  log: logUpdate
})

/** Settled once the first product page has loaded (or no product window opened at start). */
let markFirstPage
const firstPageReady = new Promise((resolve) => {
  markFirstPage = resolve
})

/** The last "this version stops working on …" notification, at most one a day (C7 `warn`). */
let lastWarnAt = null
let warnTimer = null
function warnDaily(verdict) {
  if (warnTimer !== null) clearTimeout(warnTimer)
  warnTimer = null
  if (verdict.level !== 'warn') return
  const DAY = 24 * 60 * 60 * 1000
  if (lastWarnAt === null || Date.now() - lastWarnAt >= DAY) {
    lastWarnAt = Date.now()
    const date = new Intl.DateTimeFormat(app.getLocale(), { dateStyle: 'medium' }).format(
      new Date(verdict.after)
    )
    // After the first page has loaded, as What's new: pressing it then finds a page to ask.
    void firstPageReady.then(() =>
      showNotification({
        title: t('notify.warn.title'),
        body: t('notify.warn.body', { date, minimum: verdict.minimumVersion ?? '' }),
        onClick: () => openHelpAbout('minimum version warning')
      })
    )
  }
  warnTimer = setTimeout(
    () => warnDaily(policyGuard?.current() ?? verdict),
    Math.max(60_000, lastWarnAt + DAY - Date.now())
  )
}

/**
 * The guard of a packaged build with an update channel, started: it reads `<userData>/policy.json`
 * at once and checks the feed with a 1.5 s wait (C6). Null in any other build. Independent of
 * automatic update checks (C12): a policy check downloads nothing.
 * @returns {{ guard: ReturnType<typeof createPolicyGuard>, started: Promise<unknown> } | null}
 */
function startPolicyGuard() {
  if (!app.isPackaged) return null
  const channel = readPinned('update-channel')
  let feedUrl
  try {
    feedUrl = /^url:\s*(\S+)\s*$/m.exec(fs.readFileSync(LAYOUT.appUpdateYml, 'utf8'))?.[1]
  } catch {}
  const channelFile = channel
    ? channelFileName({ channel, platform: process.platform, arch: process.arch })
    : null
  if (!channel || !feedUrl || channelFile === null) return null
  const testSwitches = updateTestSwitches({ channel, env: process.env })
  const headers = () => {
    const id = readInstallId(app.getPath('userData'))
    return {
      ...updateHeaders({
        version: app.getVersion(),
        channel,
        arch: process.arch,
        osVersion: process.getSystemVersion()
      }),
      ...(id ? { 'x-user-staging-id': id } : {})
    }
  }
  const guard = createPolicyGuard({
    running: app.getVersion(),
    store: createPolicyStore({ file: path.join(app.getPath('userData'), 'policy.json'), log: logUpdate }),
    check: () =>
      fetchFeedPolicy({
        fetch: (url, init) => net.fetch(url, { ...init, headers: { ...headers(), ...init.headers } }),
        feedUrl,
        channelFile,
        publicKeys: FEED_PUBLIC_KEYS
      }),
    now: Date.now,
    timers: { setTimeout, clearTimeout },
    log: logUpdate,
    recheckMs: testSwitches.intervalMs ?? undefined,
    onVerdict: (verdict) => {
      blockGate.set(verdict.level === 'blocked')
      if (verdict.level !== 'blocked') blockedAttempt = null
      warnDaily(verdict)
      pushBlocked()
      publishFace()
      testPress()
    }
  })
  policyGuard = guard
  powerMonitor.on('resume', () => guard.resume())
  return { guard, started: guard.start() }
}

// ── What's new (tasks/todo-desktop-update-policy.md D2–D4) ──────────────────────────────────────

/** App-level, one per main process; packaged builds only (a source run is not an update). */
let whatsNew = null
async function startWhatsNew() {
  if (!app.isPackaged) return
  const userData = app.getPath('userData')
  // Ran here before, from before `lastRunVersion` existed: electron-updater's id or the preferences file.
  const earlierRun = ['.updaterId', 'preferences.json'].some((name) =>
    fs.existsSync(path.join(userData, name))
  )
  whatsNew = createWhatsNew({
    prefs: appPreferences(),
    running: app.getVersion(),
    earlierRun,
    log: logUpdate
  })
  whatsNew.onChange(() => publishFace())
  await whatsNew.start()
}

/** The one What's new notification of this main process, once a product window is up. */
function announceWhatsNew() {
  whatsNew?.notifyOnce((pending) =>
    showNotification({
      title: t('notify.whatsNew.title', { version: pending.to }),
      body: t('notify.whatsNew.body'),
      onClick: () => openHelpAbout('what’s new notification')
    })
  )
}

/**
 * Start the self-update — only in a packaged build (macOS, Windows, Linux) whose bundle carries an
 * `update-channel` (written by the packaging for the two origins that have a feed). A stand, a laptop
 * build or `pnpm start` never updates itself. Every channel file is read through the signed provider
 * (src/signed-feed-provider.js): one whose Ed25519 signature does not verify against FEED_PUBLIC_KEYS
 * is a failed check — the app keeps running, it just does not update.
 */
async function startSelfUpdate(origin) {
  if (!app.isPackaged) return
  const channel = readPinned('update-channel')
  if (channel === undefined) {
    // A Preview, a stand or a test build: said once, so "why did it not update" has an answer.
    logUpdate('no update-channel in the bundle; self-update stays off')
    return
  }
  let feedUrl
  try {
    feedUrl = /^url:\s*(\S+)\s*$/m.exec(fs.readFileSync(LAYOUT.appUpdateYml, 'utf8'))?.[1]
  } catch {}
  if (!feedUrl) {
    logUpdate('no app-update.yml in the bundle; self-update stays off')
    return
  }
  let codesignOutput = ''
  if (process.platform === 'darwin') {
    // `<app>.app/Contents/MacOS/<name>` → `<app>.app`.
    const bundle = path.resolve(path.dirname(process.execPath), '..', '..')
    codesignOutput = await new Promise((resolve) =>
      execFile('codesign', ['-dv', '--verbose=2', bundle], (_error, _stdout, stderr) =>
        resolve(String(stderr))
      )
    )
  }
  const mode = selfUpdateMode({ platform: process.platform, env: process.env, codesignOutput })
  if (mode === null) {
    logUpdate(`no self-update on ${process.platform}`)
    return
  }
  const { inPlace } = mode
  if (FEED_PUBLIC_KEYS.length === 0)
    logUpdate('no feed key is pinned in this build: every update will be refused')
  const testSwitches = updateTestSwitches({ channel, env: process.env })
  for (const line of testSwitches.ignored) logUpdate(`test switch ignored: ${line}`)
  logUpdate(
    `updater process: pid ${process.pid}, version ${app.getVersion()}${testSwitches.intervalMs ? `, test interval ${testSwitches.intervalMs} ms` : ''}${testSwitches.heartbeatMs ? ', heartbeat on' : ''}${testSwitches.remindMs ? `, test reminder ${testSwitches.remindMs} ms` : ''}`
  )
  // Sleep and wake, in the same log: a check that came hours late across a suspend is the machine,
  // not the updater.
  for (const event of ['suspend', 'resume', 'lock-screen', 'unlock-screen'])
    powerMonitor.on(event, () => logUpdate(`power: ${event}`))
  if (testSwitches.heartbeatMs)
    createHeartbeat({
      everyMs: testSwitches.heartbeatMs,
      timers: { setTimeout, clearTimeout },
      now: Date.now,
      log: logUpdate,
      pid: process.pid
    })
  const kit = require('./generated/electron-updater.cjs')
  const autoUpdater = new kit[mode.updater]()
  autoUpdater.logger = {
    info: (m) => logUpdate(String(m)),
    warn: (m) => logUpdate(`warn: ${m}`),
    error: (m) => logUpdate(`error: ${m}`),
    debug: () => {}
  }
  updater = startUpdater({
    autoUpdater,
    channel,
    feedUrl,
    // Every verified channel file also carries the minimum version policy (C5): the guard takes it.
    feedProvider: createSignedFeedProvider(kit, {
      publicKeys: FEED_PUBLIC_KEYS,
      onVerified: ({ text }) => {
        if (policyGuard === null) return
        try {
          policyGuard.accept(readPolicy(text))
        } catch (error) {
          logUpdate(`policy: not taken from the update check: ${error.message}`)
        }
      }
    }),
    platform: process.platform,
    version: app.getVersion(),
    arch: process.arch,
    // The OS version (macOS 27.0.1), not the Darwin kernel release `os.release()` gives.
    osVersion: process.getSystemVersion(),
    inPlace,
    timers: { setTimeout, clearTimeout },
    random: Math.random,
    intervalMs: testSwitches.intervalMs ?? undefined,
    ask: askAboutUpdate,
    // (A3) A version ready for three days: one reminder a day; pressing it opens Help & about.
    remind: (version) =>
      showNotification({
        title: t('notify.remind.title'),
        body: t(
          updater?.installMode() === 'restart' ? 'notify.remind.bodyRestart' : 'notify.remind.bodyQuit',
          {
            version
          }
        ),
        onClick: () => openHelpAbout('restart reminder')
      }),
    remindAfterMs: testSwitches.remindMs ?? undefined,
    remindEveryMs: testSwitches.remindMs ?? undefined,
    // The checked download address (src/updater.js `downloadUrl`), through the same opener as every link, so a
    // test run's TRACY_DESKTOP_LINK_LOG records it instead of opening a browser.
    openExternal: (url) => void openLinkExternally(url),
    log: logUpdate,
    // The updater owns one part of the shared document: it changes `autoCheck` and leaves the rest.
    prefs: {
      read: () => appPreferences().read(),
      write: async ({ autoCheck }) => {
        await appPreferences().update({ autoCheck })
      }
    },
    now: Date.now
  })
  updater.onState(() => publishFace())
  // The page may already be open on "off": tell it the updater now runs.
  publishFace()
  // A blocked screen shown before the updater existed offered Download (nothing could install yet):
  // now that it runs, it offers what this copy can do — Update where it installs in place.
  pushBlocked()
  testPress()
  // The feed has just recorded this install (and electron-updater has written its id): link it now
  // rather than wait for a page load, which a single-page app may not have for days.
  for (const event of ['update-available', 'update-not-available'])
    autoUpdater.on(event, () => {
      const current = productWindows.current()
      if (current) void linkInstall(current, origin)
      // An updater check can supply the existing id, but can never create an opened event.
      void appOpened?.flush()
    })
  logUpdate(
    `self-update on: ${mode.updater}, channel ${channel}, feed ${feedUrl}, ${inPlace ? 'installs in place' : 'notify only (cannot replace itself)'}`
  )
  windowShell?.refreshMenu()
}

/** Whether this run already told tracy-web which install it is. */
let installLinked = false

/** Foreground activity only, independent of whether automatic update checks are enabled. */
let appOpened

/** @param {BrowserWindow} window */
function recordAppOpened(window) {
  if (!product?.remote || window.isDestroyed() || !window.isVisible() || !window.isFocused()) return
  appOpened ??= createAppOpened({
    file: path.join(app.getPath('userData'), 'app-opened.json'),
    version: app.getVersion(),
    platform: { darwin: 'mac', win32: 'win', linux: 'linux' }[process.platform],
    installId: () => readInstallId(app.getPath('userData')),
    send: sendAppOpened,
    log: logUpdate
  })
  void appOpened.opened()
}

/**
 * Same page fetch and existing cookie as install linking. An offline/local waiting page cannot
 * send; its saved focus is retried after the Tracy page returns. Nothing identifies page contents.
 * @param {import('./app-opened.js').OpenedEvent & {installId: string}} event
 */
async function sendAppOpened(event) {
  const origin = product?.origin
  if (origin === undefined || quitting) return false
  const window = [...products].find(
    (candidate) => !candidate.isDestroyed() && candidate.webContents.getURL().startsWith(`${origin}/`)
  )
  if (!window) return false
  const status = await window.webContents
    .executeJavaScript(
      `fetch('/api/desktop/installs/opened', { method: 'POST', credentials: 'same-origin', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(event))} }).then((r) => r.status, () => 0)`,
      true
    )
    .catch(() => 0)
  return status === 204
}

/**
 * Tell tracy-web which install this is, once the person is signed in (tasks/todo-desktop-auto-update.md
 * "Who is using the app"). Sent FROM THE PAGE, not from here: a same-origin request carrying the session
 * cookie, which the cross-site guard accepts like any other door. A signed-out page answers 401 and
 * the next load tries again; so does 404 (the feed has not seen this id yet).
 * @param {BrowserWindow} window
 * @param {string} origin
 */
async function linkInstall(window, origin) {
  if (installLinked || updater === null || window.isDestroyed()) return
  if (!window.webContents.getURL().startsWith(`${origin}/`)) return
  const installId = readInstallId(app.getPath('userData'))
  if (installId === null) return
  const status = await window.webContents
    .executeJavaScript(
      `fetch('/api/desktop/installs/link', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: ${JSON.stringify(
        JSON.stringify({ installId })
      )} }).then((r) => r.status, () => 0)`,
      true
    )
    .catch(() => 0)
  if (status === 204) {
    installLinked = true
    logUpdate(`install ${installId} linked to the signed-in person`)
  }
}

/**
 * A SOURCE RUN GETS ITS OWN PROFILE FOLDER, set before anything reads `userData`.
 *
 * `src/dev-profile.js` says where and why: one folder per worktree, origin and instance, so two
 * agent sessions never share a cookie jar. `userData` and `sessionData` must move before `ready`:
 * Chromium takes its data folder (cookies, the single-instance lock, `DevToolsActivePort`) from
 * there when the browser process starts. A packaged app returns undefined and is left alone.
 * @returns {{ origin: string, profile: ReturnType<typeof sourceProfile> } | undefined} undefined when
 *   an environment variable is invalid; the process is then already exiting.
 */
function chooseProfile() {
  const origin = remoteOrigin() ?? 'local'
  let profile
  try {
    profile = sourceProfile({
      packaged: app.isPackaged,
      repo: REPO,
      origin,
      env: process.env,
      appData: app.getPath('appData')
    })
  } catch (error) {
    process.stderr.write(`tracy-desktop: ${error.message}\n`)
    app.exit(2)
    return undefined
  }
  if (profile !== undefined) {
    app.setName(profile.name)
    fs.mkdirSync(profile.dir, { recursive: true })
    app.setPath('userData', profile.dir)
    app.setPath('sessionData', profile.dir)
    process.stdout.write(`tracy-desktop: profile ${profile.dir}\n`)
  }
  return { origin, profile }
}

/**
 * Bring this process's window to the front, for a second launch on the same profile.
 * @param {unknown} data - what the second process passed to `requestSingleInstanceLock`.
 */
function focusForSecondLaunch(data) {
  // A second process that named its instance explicitly fails on its own side (`secondLaunch`); it
  // is an agent that got the wrong profile, not a person asking for this window.
  if (data !== null && typeof data === 'object' && data.explicitInstance === true) {
    process.stdout.write('tracy-desktop: refused a second process that asked for this profile explicitly\n')
    return
  }
  if (!blockGate.admit('second-launch')) return
  const window = productWindows.current() ?? [...products][0]
  if (window === undefined || window.isDestroyed()) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  app.focus({ steal: true })
}

/**
 * Write `<profile>/runtime.json` for the agent that started this source run (`runtimeRecord` lists
 * the fields). Called once the first window exists — its page may still be loading; `DevToolsActivePort`
 * is written at browser start, so it is there by then when the run has a debug port.
 * @param {string} origin - the origin the window opened, or `local`.
 * @param {string} dir - the profile folder.
 * @returns {string} the file written.
 */
function writeRuntimeFile(origin, dir) {
  let sha = null
  try {
    sha = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    // Not a checkout, or no git: the field says so with null.
  }
  const activePortFile = path.join(dir, 'DevToolsActivePort')
  const activePort = fs.existsSync(activePortFile) ? fs.readFileSync(activePortFile, 'utf8') : undefined
  const record = runtimeRecord({
    pid: process.pid,
    sha,
    origin,
    profile: dir,
    activePort,
    inspect: inspector.url()
  })
  const file = path.join(dir, 'runtime.json')
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  process.stdout.write(`tracy-desktop: runtime ${file}${record.cdp ? ` cdp ${record.cdp}` : ''}\n`)
  return file
}

const sourceRun = chooseProfile()

// Windows groups windows, taskbar pins and notifications by this id; it must be the id the installer's
// shortcut carries (src/platform.js), set before the first window. After `chooseProfile`, which names
// a source run `Tracy Cowork Dev`.
if (process.platform === 'win32') {
  const { appUserModelId } = appIdentity(app.getName())
  if (appUserModelId !== null) app.setAppUserModelId(appUserModelId)
}
/** Explicit TRACY_DESKTOP_INSTANCE: a second launch on this profile fails instead of handing over. */
const explicitInstance = sourceRun?.profile?.explicitInstance === true

/**
 * ONE PROCESS PER PROFILE. Chromium keys this lock by the data folder, so after `chooseProfile` it is
 * a lock per profile: different worktrees, origins or instances run side by side, while a second
 * launch on the same profile either hands over to the first window or, with an explicit instance,
 * fails (`secondLaunch`). Two processes on one profile would fight over one cookie database.
 *
 * A packaged app takes the lock too, on Electron's own folder: a second `Tracy Cowork` process (the
 * binary started twice, outside Launch Services) hands over to the first window the same way.
 */
const ownsProfile = sourceRun !== undefined && app.requestSingleInstanceLock({ explicitInstance })

if (sourceRun !== undefined && !ownsProfile) {
  const { code, message } = secondLaunch({ explicitInstance, dir: app.getPath('userData') })
  if (message !== undefined) process.stderr.write(`${message}\n`)
  app.exit(code)
}

if (ownsProfile) {
  app.on('second-instance', (_event, _argv, _cwd, data) => focusForSecondLaunch(data))
  if (sourceRun.profile !== undefined) {
    const { origin, profile } = sourceRun
    const runtimeFile = path.join(profile.dir, 'runtime.json')
    // A file left by a run that crashed points at a dead pid; the lock says that run is gone.
    fs.rmSync(runtimeFile, { force: true })
    app.once('browser-window-created', () => {
      try {
        writeRuntimeFile(origin, profile.dir)
      } catch (error) {
        process.stderr.write(`tracy-desktop: could not write runtime.json: ${error.message}\n`)
      }
    })
    app.on('will-quit', () => fs.rmSync(runtimeFile, { force: true }))
  }
  app.whenReady().then(start)
}

async function start() {
  markUserAgent()

  // Remote target: open it directly and skip the whole local dsh lifecycle. The sign-in door
  // belongs to that surface (`cowork.tracy.ai` 302s to `/login`), so there is no token to attach.
  const remote = remoteOrigin()
  if (remote !== undefined) {
    const target = `${remote}/`
    productTarget = { url: target, watch: false, remote: true }
    // (C6) The stored minimum version decides at once; the feed gets at most 1.5 s before the first
    // window opens. A late answer still moves the verdict (the guard's onVerdict → the gate).
    const policy = startPolicyGuard()
    const whatsNewReady = startWhatsNew().catch((error) =>
      logUpdate(`what's new did not start: ${error.message}`)
    )
    if (policy !== null) {
      const { outcome, verdict } = await policy.started
      logUpdate(`start: policy ${outcome}, ${verdict.level}`)
    }
    const first = blockGate.admit('start') ? openWindow(target, false, true) : undefined
    void startSelfUpdate(remote).catch((error) => logUpdate(`self-update did not start: ${error.message}`))
    // What's new is announced once the first page has loaded, so pressing it finds a page to ask.
    const firstLoaded = new Promise((resolve) => {
      if (first === undefined) resolve()
      else first.webContents.once('did-finish-load', () => resolve())
    })
    void firstLoaded.then(() => markFirstPage())
    void Promise.all([whatsNewReady, firstLoaded]).then(() => {
      publishFace()
      if (!blockGate.isBlocked()) announceWhatsNew()
    })
    app.on('activate', () => {
      if (products.size === 0 && blockGate.admit('dock')) openWindow(target, false, true)
    })
    return
  }

  let port
  try {
    port = gatewayPort()
  } catch (error) {
    await showFailure(error)
    return
  }
  const url = `http://127.0.0.1:${port}/`

  const reusing = await answering(port)
  if (reusing) {
    // A dsh someone else started keeps the patches it was started with; say so rather than let the
    // Settings dialog look as if the deployment's plan settings were ignored.
    process.stdout.write(
      'tracy-desktop: reusing a running dsh — the model plan settings apply only to a dsh this app starts\n'
    )
  } else {
    launch(await preparePlanPatch())
  }

  try {
    await waitFor(port)
  } catch (error) {
    await showFailure(error)
    return
  }

  // Open with the token so dsh grants the cookie, then dsh itself 303s back to `/` — so the token does
  // NOT stay in the address bar or the history. The cookie lives 30 days and the signing key is fixed, so
  // later a spare token is harmless too: dsh sees a valid cookie and still 303s to `/`.
  //
  // With no token, open bare `/` — the window then shows dsh's own 401, which is real information,
  // better than a white screen that says nothing.
  const token = reusing ? readToken() : await waitForToken()
  openWindow(token === undefined ? url : `${url}?token=${encodeURIComponent(token)}`)

  app.on('activate', () => {
    if (products.size === 0) openWindow(url)
  })
}

// macOS: closing the window does not quit the app (Windows, Linux: closing the last window quits). But if
// the app started dsh itself, keep it alive with the app, not with the window — closing the window and
// reopening from the Dock is normal.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  appOpened?.stop()
  updater?.stop()
  policyGuard?.stop()
  blockedBridge?.dispose()
  updateBridge?.dispose()
  for (const bridge of firstRunBridges ?? []) bridge.dispose()
  opportunitiesMenu?.dispose()
  windowShell?.dispose()
})

// Only kill what we spawned. Someone else's `./run.sh native` session must keep living.
app.on('before-quit', () => {
  // The spare never outlives the app, and no refill starts while quitting.
  quitting = true
  pool.dispose()
  if (owned) {
    owned.kill('SIGTERM')
    owned = null
  }
})
