# dsh-plugin-better-locale — Agent Guide

## Plugin overview

Bundle-style DSH plugin that ships bundled third-language dictionaries (ja / ko / fr / ... — 19 languages) for **DSH's own built-in namespaces only** (scope locked at compile time, see the drift engine below). Since the `dsh-v0.1.2-alpha.1` adaptation the plugin is a **pure language pack on DSH's native language-pack API**: at client-apply time it registers each language's catalog entry through `ctx.locale.addLanguage({ id, label, fallback })` and its dictionaries through the single-locale form `ctx.locale.register(ns, locale, dict)`, one `ctx.effect` per language (HMR-safe: disposal removes exactly what was added).

Everything user-facing is owned by DSH's locale service since the native API: added languages appear in DSH's own Language settings row, selection persists in the durable `locale.preference` setting, `<html lang>` follows the active locale, `locale/change` is emitted on switches, and translation lookups walk DSH's per-key fallback chain (selected language → declared fallback → `en`; the Traditional Chinese variants declare `zh`). The plugin publishes no service, registers no UI, and holds no mutable state.

The plugin is **client-only** (host `apply` is empty).

## Key conventions

- **Bundle form**: `cordis.patch.yml` inserts one plugin row with no config; `package.json` has `dsh.bundle.patch`. No source patches to DSH staging.
- **Client-only**: the host half (`src/index.ts`) has an empty `apply`.
- **Pre-built `lib/` strategy**: `lib/` is committed (not in `.gitignore`); no `prepare` script; `github:` install works out of the box.
- **Minimal deps**: peer deps are `@deepseek-ai/cordis` + `@deepseek-ai/dsh-client-locale` + `@deepseek-ai/dsh-invariants` (all optional peers). No React, no ui-* packages, zero runtime imports of any DSH module — the `@deepseek-ai/dsh-client-locale/client` reference in `src/client/index.ts` is type-only (erased at build), so the client bundle is pure dictionary data + the apply function.
- **Alpha deps are not on npm**: `@deepseek-ai/*` packages appear in `peerDependencies` (`^0.1.2-alpha.1`, declaration only) but NOT in `devDependencies`; `autoInstallPeers: false` in `pnpm-workspace.yaml`. Typecheck resolves the DSH graph through absolute `paths` in `tsconfig.json` pointing at the built dsh checkout (`C:/Users/Administrator/.dsh/source/current`, symlinked to `D:\Projects\deepseek-harness\dsh`). Tests need no DSH module resolution (see below).
- **No settings row**: 0.1.x registered a custom `settings.general.item` row because the override borrowed DSH's English slot. The native catalog makes DSH's own Language row list every registered language, so the row, its slot store, and the plugin's own copy namespace were removed.
- **Scope is machine-locked**: `src/client/upstream-coverage.ts` (typecheck-only, never bundled) asserts the dictionaries cover exactly the upstream `LocaleNamespaceMap` table — missing ns/key (drift) or extra ns/key (trespassing a third-party plugin's slot) is a compile error. `pnpm typecheck` also runs `scripts/check-upstream-merges.mjs`, which fails when a new upstream merge module is not imported by the assertion file. Workflow after a DSH upgrade (pull + install + build the checkout): `pnpm typecheck` red = gap, translate until green.

## File responsibilities

| File | Role |
|------|------|
| `src/index.ts` | Host entry: `name`, empty `apply` (client-only plugin) |
| `src/invariant.ts` | `./invariant` companion (empty installer: every contribution is a `ctx.effect`, proven by `tests/apply.spec.ts`) |
| `src/client/index.ts` | Client entry: `inject = ['locale']`; one `ctx.effect` per language registering the catalog entry + all namespace dicts, returning a combined disposer |
| `src/client/languages.ts` | `BUNDLED_LANGUAGES`: 19 entries of `{ id, label, fallback: 'en' \| 'zh', dicts }`; the single place to add a language |
| `src/client/dictionaries/<lang>.ts` | One file per language: `dicts = {...} satisfies Record<string, Record<string, string>>` (literal key types preserved for the coverage assertion) covering every DSH built-in namespace (27 ns / 893 keys at current upstream). Adding a language = one file + one `BUNDLED_LANGUAGES` entry |
| `src/client/upstream-coverage.ts` | Typecheck-only drift guard (imported by no entry → never bundled): pulls all upstream `LocaleNamespaceMap` merges and asserts dictionary coverage in both directions (missing ns/key = drift, extra ns/key = trespass). Keep its import list in sync with the upstream tree — `scripts/check-upstream-merges.mjs` enforces it |
| `tests/languages.spec.ts` | Catalog invariants: ids unique + BCP 47-style (mirror of upstream `LOCALE_ID_PATTERN`), labels non-empty, fallback `zh` for zh-* variants / `en` otherwise, well-shaped dicts, `common`/`settings.locale` covered everywhere |
| `tests/apply.spec.ts` | Apply wiring against a fake cordis ctx + fake LocaleRuntime (upstream duplicate guards + fallback-chain walk): 19 catalog entries, every (ns, lang) dict pair with identity preserved, disposal clears everything, re-apply after disposal works, double-apply throws; coexistence suite pins the third-party boundary (unmigrated plugin → English fallback, migrated → own dict, built-in ns registration → throw) |
| `scripts/generate-translation-md.mjs` | Regenerates `TRANSLATION.md` (translation coverage table) from `src/client/dictionaries/*.ts` |
| `scripts/check-upstream-merges.mjs` | Diffs `upstream-coverage.ts`'s import list against the merge modules discovered in the DSH checkout (root overridable via `DSH_SOURCE_ROOT`); runs as part of `pnpm typecheck` |
| `docs/developer-guide/README.md` | Third-party plugin author guide (EN + zh-CN): register your plugin's own third-language dicts through the native `ctx.locale` API |
| `docs/plans/2026-08-23-better-locale-design.md` | Original design document for the 0.1.x monkey-patch mechanism (historical) |
| `docs/plans/2026-08-28-native-scope-and-drift-design.md` | Design for the scope lock + drift engine + zh fallback (this version) |

## Commands

```sh
pnpm run typecheck       # tsc --noEmit (four-way coverage assertion + DSH types via tsconfig paths → source/current)
                          # && node scripts/check-upstream-merges.mjs (assertion imports in lockstep with upstream)
pnpm test                # vitest run (pure-function unit tests, no module mocks)
pnpm run build           # tsdown + tsc → lib/index.js, lib/invariant.js, lib/client.js + lib/types
pnpm run bundle:client   # tsdown only (fast client rebuild)
pnpm run gen:translations # regenerate TRANSLATION.md from dictionaries/*.ts
```

## Data flow

### Activation

1. `apply(ctx)` runs with `inject = ['locale']` (the locale service provides `ctx.locale`).
2. For each of the 19 `BUNDLED_LANGUAGES` entries, one `ctx.effect`:
   - `ctx.locale.addLanguage({ id, label, fallback })` — catalog entry; appears in the native Language row. Throws on duplicate id (guarded by effect disposal on HMR).
   - `ctx.locale.register(ns, lang, dict)` per namespace — single-locale untyped form; publishes a revision bump so mounted outlets pick up late-arriving dictionaries.
   - Returns a combined disposer (catalog entry + all dicts), released on fiber disposal.
3. No subscriptions: every re-render trigger (revision bumps from `register`/`addLanguage`, `locale/change` from user switches) is emitted by the locale service itself.

### Language switch (all native)

1. User picks 日本語 in Settings → General → Language (DSH's own row).
2. `locale.setLocale('ja')` — persists `locale.preference` via the settings scope, publishes a new snapshot with `active: 'ja'`, emits `locale/change`.
3. Every `t(key)` walks the declared fallback chain: `ja` → `en` (plugin dict hit → Japanese; miss → English); `zh-TW` → `zh` → `en` (miss → Simplified → English). Missing namespaces resolve the same way.

## Gotchas

- **Dictionary objects must keep stable identity**: `register`'s disposer removes by object identity, so dicts stay module-level constants; `apply` passes them through `Object.entries` without cloning.
- **Duplicate registration throws** (single occupant for both catalog ids and `(ns, locale)` pairs) — this is why every contribution lives in exactly one `ctx.effect`; never re-register outside a disposed effect. The same rule backs the plugin's scope boundary: registering a built-in namespace for a third language collides with this plugin (proven by the coexistence suite in `tests/apply.spec.ts`).
- **Fallback is `en` for every language except the Traditional Chinese variants**, which declare `zh` (chain `zh-TW` → `zh` → `en`; upstream requires the chain to terminate at `en` and `zh` is built-in, so this is legal). `addLanguage` requires the fallback to already be registered.
- **Dictionaries must stay in lockstep with the upstream merge table**: `upstream-coverage.ts` fails compilation on any missing or extra ns/key, and `check-upstream-merges.mjs` fails when a new upstream merge module is missing from its import list. After translating a gap, run `pnpm run gen:translations` to refresh `TRANSLATION.md`. The dictionary files keep `satisfies` (not a wide annotation) so literal key types reach the assertion — do not re-widen them.
- **`source/current` must be built** for typecheck: the assertion resolves upstream merge types through the checkout's `lib/types` (pull + install + build per the upgrade SOP); an unbuilt checkout produces module-not-found errors that look like type errors.
- **`upstream-coverage.ts` must never be imported by an entry**: it exists for `tsc` only; if it ever reaches the entry graph, its `ALL` aggregate would duplicate every dictionary into `lib/client.js`.
- **`bumpRevision` / `probeLocaleRuntime` / the store are gone**: the 0.1.x helpers (private `publish` cast, `lookup` prototype patch, localStorage persistence) have no counterpart in the native flow — do not reintroduce them.
