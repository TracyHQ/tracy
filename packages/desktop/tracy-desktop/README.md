# `@tracy/desktop` — the Tracy Cowork app run from source

The Electron shell around the Tracy web page. The packaged builds (`Tracy Cowork.app` / `Tracy Cowork Dev.app`)
are built by `build/package.sh`; this file only covers **running from source** — for people changing the shell
and for agents driving the app. To package an app that opens your own server, see
[`docs/running-locally.md`](../../../docs/running-locally.md#the-desktop-app).

## Run

Bootstrap the repo once (submodule → `pnpm dsh:build` → `pnpm install`, see the skill
[`run-dev`](../../../.agents/skills/run-dev/SKILL.md)). Then:

```bash
cd packages/desktop/tracy-desktop
TRACY_DESKTOP_ORIGIN=http://tracy.test:51710 pnpm dev    # window opens a local stand (docs/running-locally.md)
TRACY_DESKTOP_ORIGIN=https://cowork.tracy.site pnpm dev  # opens the dev machine
pnpm dev                                                 # no origin: wraps a local dsh (see below)
pnpm debug                                               # like dev, plus a debug port for agents
```

`pnpm start` is an alias of `pnpm dev`. Both `dev` and `debug` rebuild the window shell
(`build/build-shell.mjs` → `src/generated/`) before opening.

| Variable | Meaning |
|---|---|
| `TRACY_DESKTOP_ORIGIN` | the origin the window opens. Unset (and absent from `.env.native`) → wraps a local dsh |
| `TRACY_DESKTOP_INSTANCE` | instance name, a directory name (`[A-Za-z0-9._-]`, ≤ 64). Default `default` |
| `TRACY_DESKTOP_PROFILE_ROOT` | root of the profiles, must be an absolute path other than `/`. Default `~/Library/Application Support/Tracy Cowork Source` |

A bad variable → the app prints one `tracy-desktop: …` line to stderr and exits with code **2**, without opening a window.
The packaged build **ignores** both `TRACY_DESKTOP_INSTANCE` and `TRACY_DESKTOP_PROFILE_ROOT`.

## Profile: one directory per worktree × origin × instance

A run's data (cookies, cache, window position, `runtime.json`) lives at

```
<root>/<worktree-name>-<path hash>/<origin host>-<origin hash>/<instance>
       └ or `local` when wrapping a local dsh ┘
```

for example `…/Tracy Cowork Source/desktop-release-a-e802f6bf65/tracy.test-8080-d1b093bc25/default`. The first
log line prints exactly this path (`tracy-desktop: profile …`). Consequence: two agent sessions in two worktrees, or
the same worktree with a different origin or instance, **do not share a cookie jar** — signing in on one side does not
sign in (or out) the other. Same worktree + same origin + same instance reuses the previous run's data (still
signed in). The path is computed in [`src/dev-profile.js`](src/dev-profile.js).

The app run from source always carries the variant name **`Tracy Cowork Dev`** (window, menu, user agent), even when
pointed at production: only the packaged build that pins the production origin is `Tracy Cowork`.

## App-opened signal (since 0.6.1)

A product window that is showing and receives focus records one `desktop.app_opened` signal per UTC+7 day,
for an app copy that already has an `.updaterId`. A hidden spare window, a page reload and a background update
check create no signal. The app sends only the copy ID already used for update checks, the version, the platform
and the original focus time to `POST /api/desktop/installs/opened`; the server identifies the account from the
existing session cookie, the same mechanism as `/api/desktop/installs/link`. No content, actions, page addresses
or new IDs are sent.

The queue and the days already sent live in `<userData>/app-opened.json`, written atomically, mode `0600`, kept for
at most 90 days. When offline it retries after 5 minutes, or on the next page load once the wait has passed; a copy
without an `.updaterId` waits for the updater itself to create the current ID and does not create a substitute.
Days already sent survive a restart. The server deduplicates by copy ID and UTC+7 day, even when the app loses the
response.

The existing Preferences have no telemetry switch; `autoCheck` only controls update checks, so it is not used as a
privacy choice. This minimal signal fulfils the approved statistics request, keeps identity in the current session
mechanism and adds no content tracking.

## One process per profile

Opening a second time on **the same profile**:

- `TRACY_DESKTOP_INSTANCE` **not** set (a person reopening): the running copy's window is brought to the front,
  and the new copy exits with code 0;
- `TRACY_DESKTOP_INSTANCE` **set** (an agent, E2E): the new copy prints
  `tracy-desktop: another process already runs the profile … ` to stderr and exits with code **3** — an agent never
  silently drives another agent's app. Pick a new instance, or stop the owning process (pid in `runtime.json`)
  if it is yours.

Different profiles run side by side normally. The packaged build keeps this lock too (on its own data directory):
opening the binary a second time brings the existing window forward and exits.

## `runtime.json` — how an agent finds its app

Every run from source writes `<profile>/runtime.json` as soon as the first window is created (the page may still be
loading — wait for the page with CDP/Playwright, don't treat the file as a "ready" signal), and deletes it when the
app quits:

```json
{
  "pid": 96096,
  "sha": "2017abb3aa644eae150081d476b19b0fd3862511",
  "origin": "http://tracy.test:8080",
  "profile": "/Users/…/Tracy Cowork Source/…/default",
  "cdp": "http://127.0.0.1:56622",
  "inspect": "ws://127.0.0.1:56619/c0b77540-…"
}
```

- `pid` — the main Electron process. **Only stop your own pid** (`kill -TERM <pid>`; the app quits cleanly and
  deletes `runtime.json`). If the app dies abnormally (crash, `kill -9`) the file stays until the next run on the same
  profile (which deletes it as soon as it holds the lock) — so always check `kill -0 <pid>` before trusting it.
- `sha` — `git rev-parse HEAD` of the checkout, `null` when git does not answer.
- `cdp` — present when running `pnpm debug`: Chromium picks the port itself (`--remote-debugging-port=0`), listens only
  on `127.0.0.1`, and is **never** `9222` (that belongs to `chrome-watch`). `null` with `pnpm dev`.
  `curl "$(jq -r .cdp runtime.json)/json/version"` returns the Electron version; `/json/list` lists the pages.
- `inspect` — the Node inspector URL of the main process (`--inspect=0`), `null` with `pnpm dev`.

Check that it listens only on loopback: `lsof -nP -iTCP -sTCP:LISTEN -a -p <pid>` — every line must be `127.0.0.1:…`.

## Driving the app with Playwright (E2E)

[`test/e2e/launch.mjs`](test/e2e/launch.mjs) opens the app from source through `@playwright/test`'s `_electron`, each
time with a new instance `e2e-<random>` (set explicitly, so a profile clash is a clear error rather than driving the
wrong app):

```js
import { launchFromSource } from './test/e2e/launch.mjs'
const { app, window, profileDir } = await launchFromSource({ origin: 'http://tracy.test:8080' })
// … window is a Playwright Page
await app.close() // only closes the app you opened
```

The smoke case ([`test/e2e/smoke.mjs`](test/e2e/smoke.mjs)): open the app, wait for the window to reach
`<origin>/login`, check the variant name (`Tracy Cowork Dev`), close the app, delete the profile directory it created:

```bash
node packages/desktop/tracy-desktop/test/e2e/smoke.mjs                                       # stand tracy.test:8080
TRACY_E2E_ORIGIN=https://cowork.tracy.site node packages/desktop/tracy-desktop/test/e2e/smoke.mjs
```

Native dialogs and the sign-in handed over through the browser (`src/signin-handoff.js`) cannot be tested here.

### Attaching to a running app (`pnpm attach`)

With a `pnpm debug` run of your own already up (explicit instance), attach Playwright to it instead of opening a new
app — [`test/e2e/attach.mjs`](test/e2e/attach.mjs) reads that profile's `runtime.json` and attaches only when: the pid is
alive, `origin` is the origin you asked for, `cdp` is `http://127.0.0.1:<port>` and that very pid listens on that port
(`lsof`). If any condition fails it refuses and says which — a stale file from a dead run or another session's app is
never driven by mistake.

```bash
cd packages/desktop/tracy-desktop
TRACY_DESKTOP_INSTANCE=me TRACY_DESKTOP_ORIGIN=http://tracy.test:8080 pnpm debug     # your own run
pnpm attach --origin http://tracy.test:8080 --instance me                          # prints pid, cdp, open pages
pnpm attach --origin http://tracy.test:8080 --runtime <profile>/runtime.json       # or point at the file directly
```

```js
import { attachToRunning } from './test/e2e/attach.mjs'
const { browser, pid } = await attachToRunning({ origin: 'http://tracy.test:8080', instance: 'me' })
const page = browser.contexts()[0].pages()[0]
```

Attaching does not close the app: when the script exits Playwright disconnects and the app keeps running. Stop the app
with `kill <pid from runtime.json>`, and only a run you opened yourself.

## No origin: wrap a local dsh, borrowing `./run.sh native`

With no `TRACY_DESKTOP_ORIGIN` (in `.env.native` either), the app wraps the dsh profile **`native`**: the window points
at the password gate `MCP_GATEWAY_PORT` of `.env.native` (51731 per
[`profile-map.md`](../../../docs/references/profile-map.md) §2), never at the bare dsh port.

- That port **already answers** → it is a running `./run.sh native` session: the app **borrows** it, and quitting the
  app does **not** stop dsh.
- The port is silent → the app runs `run.sh native` itself and owns that process: quitting the app stops it. The app
  only kills what it spawned.

With neither `.env.native` nor `.env`, the window shows the error `no MCP_GATEWAY_PORT …` — as designed, not broken.

## Test

```bash
node --test packages/desktop/tracy-desktop/test/*.test.mjs   # unit, does not open Electron
```

`test/notify-permission-addon.test.mjs` builds the real addon (needs macOS + `clang++`) and is skipped elsewhere.
`node test/e2e/onboard-v2-smoke.mjs [origin]` runs the app from source against a stand: the first visit goes to
`/login?onboard=1`, the `/signin/email` door becomes the desktop round trip, the waiting page has the Setup frame, and
`__DSH_LOCALE__` returns the machine's language.

## Notification permission addon (macOS)

Electron 44 cannot read the notification permission, so `native/notify-permission/` is a small Objective-C++ N-API
addon that calls `UNUserNotificationCenter.getNotificationSettings` **in the main process**: read-only, no `requestAuthorization`, does not touch Electron's delegate.

- Build: `bash build/build-native.sh <arm64|x64|universal> [output file]` → default `src/native/notify-permission.node`
  (gitignored). Only `clang++` + the running Node's N-API headers: N-API has the same ABI in Node and Electron, so no
  node-gyp, Electron headers or new packages are needed.
- `build/package.sh` builds it for the right chip of each half; the universal build joins the two halves with lipo
  (`build/make-universal.mjs`); `build/sign.sh` step 1 signs it like every `.node`. The Windows/Linux builds do not
  carry it.
- Running from source without the addon built → the permission is `unknown` (one log line), not an error.

## Text of the sign-in waiting page

`src/signin-waiting-strings.json` is **generated** by `node build/waiting-strings.mjs` from tracy-web's translation
source (`apps/tracy-web/src/lib/i18n`); keys tracy-web does not have yet come from `build/waiting-strings.source.json`.
Don't edit the JSON file by hand: the `waiting-strings` test compares it with the generator's output.
