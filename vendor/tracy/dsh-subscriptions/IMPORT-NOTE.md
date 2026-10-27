# Tracy import: dsh-subscriptions

Imported 2026-09-24 as a git subtree with `--squash` (merge `1f9d0b1fd`, squash `fd57f15e87`).
Raised 2026-10-07 to upstream `v0.6.60` (commit `66983f8`, "sanitized tree from 2d6fc72d"); Tracy version `0.6.60-tracy.6`.

- Upstream: https://github.com/GooDAnDReaDY/dsh-subscriptions (npm `@goodandready/dsh-subscriptions`)
- Pinned: tag `v0.6.60`, commit `66983f8` (before: `v0.6.21`, `0f4872471`)
- License: MIT; the upstream `LICENSE` and notices are retained.
- Role: dsh plugin, pnpm workspace member, loaded by the fleet image profile and both local profiles
  (`dsh.profile.bundles`). The package ships hand-written `lib/` only (no `src/`, no build step): the
  image copies this directory as-is.
- Rule: ADR 0006 §2 and CLAUDE.md RULE #5 — Tracy changes are version-bumped `-tracy.N` and listed
  below; never an unrecorded in-place edit. Upstream stays the home of everything else.

## Tracy patches

### 0.6.60-tracy.6 — the dev pin of `@deepseek-ai/dsh-llm` follows the fork (09/10/2026, branch `fix/harness-survey-followup-2`)

`devDependencies` pinned `@deepseek-ai/dsh-llm` exactly at `0.2.0-rc.2-tracy.26`. Since the fork moved to
`tracy.27`, no workspace member has that version, so any `pnpm install` that re-resolves (a new
dependency, `--no-frozen-lockfile`) failed with `ERR_PNPM_NO_MATCHING_VERSION_INSIDE_WORKSPACE`; frozen
installs hid it. It is now `^0.2.0-rc.2-tracy.26`, like this package's other `@deepseek-ai/*` ranges,
which every later `-tracy.N` of the fork satisfies. No code change.

### 0.6.60-tracy.5 — 32-byte OAuth state (08/10/2026, branch `feat/desktop-llm`)

With the loopback redirect of `-tracy.4`, Connect Claude still ended on "Invalid request format".
The one parameter left that differed from pi-ai 0.87.1 and Claude Code was `state`: upstream sends
16 random bytes (22 characters), they send 43 characters. Measured 08/10: we opened a hand-built
authorize URL identical to the plugin's except a 43-character `state`, clicked Authorize, and
Anthropic redirected to `localhost:53692/callback` with a code (the plugin's loopback then answered
"Login failed" only because it never issued that state). So `lib/pkce.js` now draws 32 bytes for
`state` too (still independent of the verifier). Test: `test/pkce-state.test.mjs` (red on `-tracy.4`).
Applies to every vendor; no vendor checks the length beyond accepting it.

### 0.6.60-tracy.4 — Claude signs in through the loopback redirect (08/10/2026, branch `feat/desktop-llm`)

Connect Claude always ended on Anthropic's page with "Authorization failed / Invalid request format",
before any code was shown (by hand, several times in the desktop app). Upstream's default
`redirectUri` for Claude is still the old code-paste address `https://console.anthropic.com/oauth/code/callback`
(also in upstream 0.6.60, the latest on npm on 08/10). Compared parameter by parameter with
`@earendil-works/pi-ai` 0.87.1 (`dist/auth/oauth/anthropic.js`, the flow dsh itself ships): same
authorize URL, client id, scope, `code=true`, PKCE S256 and token URL; the redirect differs —
pi-ai uses `http://localhost:53692/callback` (the current Claude CLI flow). `lib/vendors/claude.js`
`defaults().redirectUri` is now that loopback address, so the existing `autoLoopback` (on by default)
catches the callback like Codex `:1455` and Grok `:56121` — no code to paste — and the code exchange
sends the same `redirect_uri` (it reads the redirect stored with the pending login). Not changed:
`state` stays the plugin's own random value (pi-ai reuses the verifier; OAuth treats state as opaque).
A host that sets `claudeRedirectUri` or `useWebCallback` still wins. New test
`test/claude-oauth-loopback.test.mjs` (whole plugin through `apply()`, real `/oauth/start`, real
loopback on :53692, token body captured); suite 637 tests, 632 pass, the same 5 known failures.
That Anthropic accepts the new redirect is not machine-checked: it needs a person to sign in.

### 0.6.60-tracy.3 — `cardPlacement: none` (08/10/2026, branch `feat/desktop-llm`)

One more value for `cardPlacement`: `none` registers the card nowhere (no Settings entry, no Plugins
seats). The host routes are unchanged, so an embedding host can draw its own, smaller surface over
them: the desktop app sets it and shows Tracy's Settings › Model plan (`@tracy/dsh-model-plan`)
instead of this card (decided 07/10/2026). `lib/config-schema.js` (the union), `lib/ui-options.js`
(the accepted list), `lib/client.js` (`registerSettings` returns before the Plugins seats). Two new
tests (`test/ui-options.test.mjs`, `test/client-surfaces.test.mjs`); suite 636 tests, 631 pass,
the same 5 known failures as `-tracy.2`. Default and fleet behaviour unchanged.

### 0.6.60-tracy.2 — Settings placement, chat extras off, vendor allowlist (07/10/2026, branch `feat/desktop-llm`)

Three patches written against upstream v0.6.60 in a separate clone (notes and the drafted upstream PR:
the integrator's `dsub-patch-out/PATCH-NOTES.md`; NOT sent upstream), applied here with `git apply`:
- `0001` restores upstream's v0.6.57 test harness (`test/`, `eslint.config.js`, `tsconfig.checkjs.json`):
  the published v0.6.58+ trees omit it. Tracy-only, never for upstream.
- `0002` four flat `Config` options, every default = upstream behaviour: `cardPlacement`
  (`plugins|settings|both`; `settings` registers the card as a `settings.section` entry right below
  Account), `headerPill`, `slashCommands`, `allowedVendors` (empty = all; otherwise the card lists only
  these and the host answers 403 `vendor_not_allowed` at OAuth start, device start/poll, token and CLI
  import, skips them in vault imports, refuses them in `completeOAuth` BEFORE the code exchange, and
  `store.saveBlob` never stores a new credential for them). New same-origin `GET /dsh-subscriptions/ui`
  the client reads before registering its slots (a host without it gets upstream's surfaces). New
  string `vendorNotAllowed` (en, zh here; vi in `dsh-locale-vi` 0.1.0-tracy.10, de/it/fr/nl/es in
  `@tracy/dsh-tracy-locales`).
- `0003` the Settings entry styled like dsh's own sections, focus a single 1px line (DESIGN.md §5),
  all scoped under `.dsub-settings`.

Suite (`node --import ./test/_setup.mjs --test test/*.test.mjs`, eslint not run — not a devDependency
here): 634 tests, 629 pass, 5 fail, all five known: two `#252` (antigravityClientSecret), "no orphan
exports" (upstream), plus two caused by Tracy's own patches — "INSTRUCTIONS has stepsEn and stepsZh"
(the steps are dictionary keys since `-tracy.3`) and "plugin metadata declares the cordis contract"
(`inject` without `settings` since `-tracy.1`).

On the fleet nothing changes: the rows set none of the four options, and the seat gateway refuses
`GET /dsh-subscriptions/ui` like every other route but `status|config`, so the client falls back to
upstream's surfaces there. Only the desktop app's own dsh sets them (`packages/desktop/tracy-desktop/src/plan-profile.js`).

### 0.6.60-tracy.1 — upstream v0.6.60, every Tracy patch re-applied (07/10/2026, branch `feat/desktop-llm`)

How: NOT `git subtree pull`. Upstream republishes each release as a "sanitized tree" commit, so the
`v0.6.21` commit is not an ancestor of `v0.6.60` and a subtree merge conflicts on files Tracy never
touched. Done in a scratch clone instead: `git diff v0.6.21 <tree at 0.6.21-tracy.4> -- lib package.json
cordis.patch.yml | git apply -3` on a branch from `v0.6.60`, conflicts resolved by hand, then
`rsync --delete` back here (keeping this note). Upstream's tree no longer carries `test/`, `docs/`,
`scripts/`, `eslint.config.js`, `tsconfig.checkjs.json` or `pnpm-lock.yaml`, so neither did `-tracy.1`
(`-tracy.2` restores the v0.6.57 test harness).

Patches carried, and what happened to each:
- `-tracy.1` (settings not a hard dependency): upstream now reads settings through a nested
  `ctx.inject(['settings'])` itself and listens to `loader/volatile-update`, so `config-schema.js`,
  `routes/status.js`, `routes/accounts.js` are upstream's verbatim. Still carried in `lib/index.js`:
  `inject` without `'settings'` (upstream lists it, and the fleet turns `settings` off — the plugin
  would never activate there) and `settings.configure({ auto: false })` (this plugin draws its own card).
- `-tracy.2` (branding): `modelsCatalogDesc` (en, zh), the modal footer "Tracy Subscriptions", the
  Grok model note, the updater timeout message ("normal Tracy update flow") and, new in 0.6.60, the
  OAuth success page ("return to Tracy Cowork").
- `-tracy.3` (dsh 0.2.0 admission): DROPPED. Upstream's peer ranges now admit
  `^0.2.0-rc.2`, which `0.2.0-rc.2-tracy.23` satisfies; `pnpm install` links every peer to the
  workspace (lockfile importer unchanged apart from the specifiers) and `check-boot-graph`
  composes both profiles; the real activation is measured on the native profile and the stand image. `devDependencies` stay Tracy's three (upstream adds eslint and five dsh packages that
  only its unpublished tests use).
- `-tracy.3` (every visible string through the dictionaries): re-applied onto the new
  `INSTRUCTIONS` table (keyed steps), plus a new `copilot` entry (`helpCopilot1..4`) for the steps
  upstream added in English and Chinese only; `helpGrok1` follows upstream's new wording. Three new
  call sites of `formatRelativeReset(…, t('lang'), …)` take the translator, and the second usage
  window's `'<label> window'` goes through `subsWindowNamed`. Upstream's 31 new keys (backup/vault,
  quarantine park/release, warm-up probe, countdown, toasts, cache metrics) plus the four Copilot steps
  and `helpGrok1` are translated in vi (`dsh-locale-vi` 0.1.0-tracy.9), de/it/fr/nl/es
  (`@tracy/dsh-tracy-locales`); zh is upstream's (Copilot steps added here).

Upstream behaviour worth knowing, not changed here (decided 07/10: keep):
- 0.6.57: every Claude request carries the system prompt prefix "You are Claude Code, Anthropic's
  official CLI for Claude." and, as the first system block, an `x-anthropic-billing-header:` line
  (`cc_version`, `cc_entrypoint=sdk-cli`, a random per-process `cch`, a turn counter) —
  `lib/vendors/claude.js` `applyClaudeBillingHeader`. `CLAUDE_CODE_ATTRIBUTION_HEADER=0` in the dsh
  environment turns the header off.
- 0.6.55: path traversal fixes in the static and export handlers, constant-time token comparison,
  OAuth redirect trust no longer taken from request headers. 0.6.25: `isTrustedSettingsRequest` on
  the read routes and `/analyze-session` (cross-site callers get 403).
- Measured 07/10 on the `tracy-rc2` stand (0.6.21-tracy.4 image, before this raise): through the seat
  gateway, an owner seat and an editor seat get 403 "This feature is only available to the owner
  account" on every `/dsh-subscriptions/*` route except `GET status|config` (the gate's route table,
  `vendor/tracy/dsh-passwords/src/tracy/routes.ts`). The plugin registers no dsh RPC.

Not measured in `-tracy.1`: upstream ships no tests in the published tree (the v0.6.57 harness came
back in `-tracy.2`, see above).

### 0.6.21-tracy.4 — merge of the two `-tracy.3` lines (04/10/2026)

The two changes below both carried the number `-tracy.3` on two branches (dsh 0.2.0 admission on `chore/upgrade-dsh-0.2.0-rc.2-impl`, dictionaries on `develop`); the merged tree is `-tracy.4` and contains both.

### 0.6.21-tracy.3 — dsh 0.2.0-rc.2 admission (01/10/2026)

Raised the four DSH peers and the `dsh-llm` test dependency to `0.2.0-rc.2-tracy.12`. With
`-tracy.2` the new compatibility check rejected the whole bundle before loading; no change to OAuth logic
or account policy. Gates to measure: the fork's suite and booting the native/web profiles.

### 0.6.21-tracy.3 — every visible string through the dictionaries (2026-10-02, branch `fix/locale-final-sweep`)

Tracy shows this card in eight interface languages (spec TracyHQ/tch#730); upstream wrote parts of it
in English and Chinese only, outside the `en`/`zh` dictionaries. `lib/client.js`:
- `INSTRUCTIONS` keeps titles and links; its steps are dictionary keys (`help*`), rendered with the
  translated labels of the buttons they name (`{fromCli}`, `{saveToken}`, `{deviceLogin}`,
  `{connect}`). The language sniffing (`isZh`) is gone, and so are `stepsEn`/`stepsZh`.
- The client's `formatRelativeReset` takes the translator (`resetIn`, `resetDays`…); it used to call
  `t('lang')`, a key that never existed, so even Chinese readers got "in 2h 15m".
- `'<label> window'`, "Open provider console" and the `/login status` composer text
  (`'Connected: ' … 'none'`) are keys too (`subsWindowNamed`, `helpOpenConsole`, `loginStatus`,
  `loginStatusNone`). New keys appended to `en` and `zh`; vi/de/it/fr/nl/es live in Tracy's locale
  packages (`dsh-locale-vi`, `@tracy/dsh-tracy-locales`).
- Not changed: usage-window names the server sends (`lib/usage.js` `WINDOW_LABELS`, `en`/`zh` only).
- `test/locale-zh.test.mjs` checks the step keys instead of the old arrays. 427/427 pass.

### 0.6.21-tracy.2 — Tracy branding (2026-09-28, branch `feat/tracy-branding`)

User-visible text that named the product "DeepSeek Harness"/"DSH"/"Harness" now says "Tracy Cowork"/"Tracy":
`lib/client.js` `modelsCatalogDesc` (en, zh) and the modal footer "Tracy Subscriptions";
`lib/vendors/grok.js` model description ("Chat only in Tracy until…"); `lib/updater.js` update timeout
message. Model names (Cursor "DeepSeek R1/V3") are the provider's and stay. `package.json` — version
`0.6.21-tracy.2`.

### 0.6.21-tracy.1 — dsh 0.1.7 settings model (2026-09-26, branch `chore/dsh-0.1.7-rc.2`)

dsh `0.1.7-rc.2` (commit `601d6761e4`) removed host-side `settings.register()` / `get()`: a plugin
declares live-configurable values in its own Cordis `Config` with `.volatile()`, dsh's settings forms
enumerate those fields by **profile entry id**, and a write lands in the profile's `cordis.patch.yml`
(upstream notes `2026-09-18-volatile-config-references.md`, `2026-09-19-profile-owned-live-configuration.md`).
v0.6.21 — and v0.6.22 / v0.6.23, checked with `npm pack` on 2026-09-26 — still call
`sctx.settings.register(NS, Config, { base })` and declare `settings` as a hard dependency.

- `lib/index.js` — `inject` drops `'settings'` (cordis has no optional injection: on a profile with
  dsh's settings service turned off, as on the Tracy fleet, the whole plugin would never activate).
  Settings is taken through the existing nested `ctx.inject(['settings'])`; writes use
  `sctx.settings.replace('dsh-subscriptions', section)` (entry id = `NS`, the row id in
  `cordis.patch.yml`); `settings.configure({ auto: false })` stops dsh generating a second page next to
  the plugin's own card. The `settings/document-updated` listener is gone; the snapshot is re-read on
  the instance-local `loader/volatile-update` event. Without settings, config is read-only and the
  write routes answer 503 `settings not ready` (unchanged behaviour of the existing guard).
- `lib/config-schema.js` — `PlainConfig` is the former schema (ordinary values, used by every internal
  normalisation); `Config` is the same fields each `.volatile()` (what the Loader resolves);
  `plainConfig(cfg)` unwraps volatile references into ordinary values.
- `lib/routes/status.js`, `lib/routes/accounts.js` — parse payloads with `PlainConfig`.
- `package.json` — version `0.6.21-tracy.1`; peer `@deepseek-ai/schemastery` `^3.18.3` (first release
  with `.volatile()`).
- Client (`lib/client.js`) unchanged: `plugins.item`, `plugins.row.config` and `settings.plugin.item`
  registrations stay (`slots.inject` waits for a declaration that may never come, harmlessly).
- Tests adapted: `config-snapshot`, `index-apply`, `sync-adapter-reconcile`, `timers`,
  `entry-import`, `oauth-validation-guard`. Measured 2026-09-26 in a scratch copy with
  `@deepseek-ai/schemastery` built from the `dsh-v0.1.7-rc.2` tag: 427/427 pass (baseline v0.6.21 on
  the 0.1.6 dependencies: 426/426). `eslint lib/` (part of the package `test` script) not run.

## Updating

Do not `git subtree pull` (see 0.6.60-tracy.1: upstream's history is republished per release).
Clone upstream into a scratch folder, branch from the new tag, apply
`git diff <old tag> <this tree> -- lib package.json cordis.patch.yml` with `git apply -3`, resolve,
`rsync --delete --exclude node_modules --exclude IMPORT-NOTE.md` back here. Then: `inject` without
`'settings'`; every new English key translated (gate `interface-languages`, vi in `dsh-locale-vi`
with its `-tracy.N` bump and pins); `pnpm install --lockfile-only`; gates `boot-graph`, `bundles`,
`image-profile`. Record the new pin and the surviving patches here.
