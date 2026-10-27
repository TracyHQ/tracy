<p align="center">
  <a href="https://dshfind.com/zh/plugins/huanlinoto/dsh-plugin-better-locale"><img src="https://dshfind.com/api/card/huanlinoto/dsh-plugin-better-locale?lang=zh" alt="dsh-plugin-better-locale card"></a>
</p>

# dsh-plugin-better-locale

[中文](README.zh-CN.md) | **English**

A DSH web plugin that ships bundled third-language dictionaries (Japanese / Korean / French / German / ... — 19 languages) for DSH's own built-in UI namespaces, plus a compile-time **drift engine** that keeps the dictionaries tracking every DSH release. Languages are registered through DSH v0.1.2-alpha.1's native language-pack API (`locale.addLanguage` + `locale.register(ns, locale, dict)`), so they appear directly in DSH's own Language settings row; uncovered copy falls back along DSH's per-key fallback chain.

| | |
|---|---|
| **Package** | `@huanlin/dsh-plugin-better-locale` |
| **Repo** | `huanlinoto/dsh-plugin-better-locale` |
| **Requires** | DSH `dsh-v0.1.2-alpha.1` or newer |
| **License** | AGPL-3.0 |

## Supported languages

| Language | id | Label |
|---|---|---|
| Japanese | `ja` | 日本語 |
| Korean | `ko` | 한국어 |
| French | `fr` | Français |
| German | `de` | Deutsch |
| Portuguese | `pt` | Português |
| Arabic | `ar` | العربية |
| Hindi | `hi` | हिन्दी |
| Indonesian | `id` | Bahasa Indonesia |
| Turkish | `tr` | Türkçe |
| Vietnamese | `vi` | Tiếng Việt |
| Thai | `th` | ไทย |
| Russian | `ru` | Русский |
| Italian | `it` | Italiano |
| Dutch | `nl` | Nederlands |
| Swedish | `sv` | Svenska |
| Polish | `pl` | Polski |
| Traditional Chinese (HK) | `zh-HK` | 繁體中文（香港） |
| Traditional Chinese (TW) | `zh-TW` | 繁體中文（台灣） |
| Traditional Chinese (MO) | `zh-MO` | 繁體中文（澳門） |

## Install

```sh
# npm registry
dsh plugin --profile web add "@huanlin/dsh-plugin-better-locale"

# or github ref
dsh plugin --profile web add "github:huanlinoto/dsh-plugin-better-locale"
```

After install, restart `dsh web` and hard-refresh the browser (`Ctrl+Shift+R`).

## Usage

Open **Settings → General → Language**: every bundled language is listed alongside DSH's built-in 中文 / English. Pick one and the whole UI switches immediately — the selection persists in DSH's durable `locale.preference` setting (survives browsers and devices sharing the same DSH home), and `<html lang>` follows.

Uncovered namespaces / keys fall back through DSH's per-key fallback chain (selected language → declared fallback → `en`; the Traditional Chinese variants declare `zh`, so their gaps show Simplified Chinese rather than English). Coverage table: `TRANSLATION.md` (regenerate with `pnpm run gen:translations`).

## Coverage & scope

- **DSH itself only:** the dictionaries translate DSH's built-in namespaces (`common` / `settings.locale` / `command` / ... — every namespace merged into DSH's `LocaleNamespaceMap`, 27 namespaces / 893 keys × 19 languages at current coverage). The scope is **machine-locked at compile time**: `pnpm typecheck` fails if the dictionaries miss an upstream namespace/key (drift) or carry one upstream does not own (trespass).
- **The drift engine:** after upgrading the DSH checkout, run `pnpm typecheck` — red means upstream added or renamed copy; translate until green. `scripts/check-upstream-merges.mjs` (part of the same command) fails when a new upstream merge module is not yet imported by the assertion file, so new namespaces can never slip in unnoticed.
- **Third-party plugins are out of scope by design:** a plugin's own namespaces belong to that plugin. Unmigrated plugins coexist with zero errors (their copy falls back to English); migration is a few lines of native API — see the [Developer Guide](docs/developer-guide/README.md).

## Migration from 0.1.x (v0.1.2-alpha.1 adaptation)

0.1.x injected third languages by monkey-patching `LocaleRuntime.prototype.lookup` and borrowing DSH's English slot (selection in a custom settings row, persisted to localStorage, English-only activation). DSH v0.1.2-alpha.1 made all of that native, and the plugin dropped the hack:

- the custom "Language override" settings row is gone — use DSH's native Language row;
- persistence moved from browser localStorage to DSH's `locale.preference` setting;
- the override now works with any DSH active locale (no "switch to English first" step);
- the `ctx.betterLocale` service was removed — register plugin dictionaries through `ctx.locale` directly.

## Known limitations

- **Coverage is a process, not a promise:** the dictionaries track the upstream merge table exactly at each release of this plugin (currently 27 namespaces / 893 keys × 19 languages); between a DSH upgrade and a better-locale update, new upstream copy falls back along the fallback chain. Run `pnpm typecheck` in the repo to see any gap.
- **Traditional Chinese variants fall back to Simplified Chinese:** `zh-HK` / `zh-TW` / `zh-MO` declare `fallback: 'zh'` — missing keys show the Simplified dictionary (chain `zh-TW` → `zh` → `en`), not English.
- **Third-party plugin copy is not translated here:** those namespaces belong to their plugins (see the Developer Guide); expect English for unmigrated plugins while a third language is active.
- **Web only:** the client bundle targets the browser; it does not run in Node.

## License

AGPL-3.0
