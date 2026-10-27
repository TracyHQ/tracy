# better-locale Developer Guide

[中文](README.zh-CN.md) | **English**

For **third-party plugin authors**: how to make your plugin's UI copy available in better-locale's 19 bundled third languages (ja / ko / fr / ...).

> **DSH ≥ v0.1.2-alpha.1 required.** Since that release the plugin is a pure language pack on DSH's native language-pack API. The 0.1.x integration (the `ctx.betterLocale` service, the activation-order-safe pattern around it, and the "switch DSH to English first" constraint) is gone.

## Scope and boundary

- **better-locale translates DSH's own built-in namespaces only** (`common`, `conversation`, `settings.*`, ... — everything merged into DSH's `LocaleNamespaceMap`), in 19 languages. Its dictionary scope is machine-locked to that table at compile time.
- **Your plugin's namespaces belong to you.** Register their third-language dictionaries yourself through the native `ctx.locale` API (this guide).
- The two never collide: better-locale registers `(built-in ns, third language)` slots; you register `(your ns, locale)` slots. One `(ns, locale)` dictionary has exactly one owner, enforced by DSH (duplicate `register` throws). Never register a built-in namespace for a third language — those slots are occupied by better-locale and the later registration fails at load.

## Contents

- [How it works now](#how-it-works-now)
- [Behavior of unmigrated plugins](#behavior-of-unmigrated-plugins)
- [Adding third-language dictionaries to your plugin](#adding-third-language-dictionaries-to-your-plugin)
- [Adding a language better-locale does not ship](#adding-a-language-better-locale-does-not-ship)
- [Testing your integration](#testing-your-integration)

---

## How it works now

better-locale registers, once at client activation:

```
ctx.locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })   // catalog entry
ctx.locale.register('common', 'ja', {...})                             // dictionaries, per ns
ctx.locale.register('conversation', 'ja', {...})
...
```

Everything else is DSH's own locale service: the language shows up in the native Language settings row, picking it writes the durable `locale.preference` setting, `<html lang>` follows, and translation lookups walk the per-key fallback chain (`ja` → `en`; the Traditional Chinese variants declare `zh-HK/zh-TW/zh-MO` → `zh` → `en`). There is no `ctx.betterLocale` service, no monkey-patching, no localStorage, and no dependence on the active locale being `en`.

To make **your plugin** speak a third language, register dictionaries for the same locale id through `ctx.locale` — exactly like you already do for zh/en.

---

## Behavior of unmigrated plugins

A plugin that never registers anything beyond its own zh/en dictionaries coexists with better-locale **with zero configuration and zero errors**:

- Your `(your-ns, 'zh'/'en')` registrations and better-locale's `(built-in ns, 19 third languages)` registrations share no slot, so nothing throws.
- When the user picks e.g. 日本語, DSH chrome switches via better-locale's dictionaries; **your plugin's copy falls back along the per-key chain to English** — unchanged behavior, readable, no breakage.
- The Language row, `locale.preference` persistence, and `<html lang>` sync are all native DSH behavior — they apply to your plugin for free whether or not you migrate.

Migrating (below) is purely additive: your namespace's keys start resolving in the selected language instead of English.

---

## Adding third-language dictionaries to your plugin

### 1. Declare the locale peer

`package.json`:

```jsonc
{
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-client-locale": "^0.1.2-alpha.1"
  },
  "peerDependenciesMeta": {
    "@deepseek-ai/dsh-client-locale": { "optional": true }
  }
}
```

### 2. Prepare the dictionaries

One flat dict per language, keyed like your zh/en dicts:

```ts
// src/client/dictionaries.ts
export const dicts: Record<string, Record<string, string>> = {
  ja: {
    'tab.title': 'サブエージェント',
    'settings.title': 'サブエージェント設定',
    // ... your keys
  },
  ko: {
    'tab.title': '서브에이전트',
    'settings.title': '서브에이전트 설정',
  },
  // ... other languages
}
```

### 3. Register in your client `apply`

```ts
import { dicts } from './dictionaries.ts'
import { en, NS, zh } from './locales.ts'

export const inject = ['locale']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'my-plugin: zh/en')
  ctx.effect(() => {
    const disposers = Object.entries(dicts).map(([locale, dict]) => ctx.locale.register(NS, locale, dict))
    return () => { for (const dispose of disposers) dispose() }
  }, 'my-plugin: third-language dicts')
}
```

Done. When the user picks the language in Settings → General → Language, your plugin's `t(key)` returns your dictionary text; keys you did not translate fall back along the chain (your dict → en), and other plugins' copy falls back independently.

Notes:

- Registering a dictionary for a locale does **not** require the language to be registered yet ("dictionaries may register before or after the definition"), but the language must be in the catalog before the user can select it — better-locale ships the 19 common ones, so for `ja` / `ko` / ... you only register dictionaries.
- Keep each contribution inside `ctx.effect` so HMR / fiber disposal removes exactly what was added.

---

## Adding a language better-locale does not ship

If your plugin wants a language better-locale does not bundle (e.g. `eo` Esperanto), register the catalog entry yourself — `addLanguage` is a plain public API, not owned by better-locale:

```ts
ctx.effect(() => {
  const disposeLanguage = ctx.locale.addLanguage({ id: 'eo', label: 'Esperanto', fallback: 'en' })
  const disposeDict = ctx.locale.register(NS, 'eo', { 'tab.title': 'Mia kromaĵo' })
  return () => { disposeLanguage(); disposeDict() }
}, 'my-plugin: eo')
```

Rules enforced by the locale service: the id must match the BCP 47-style `LOCALE_ID_PATTERN`, the fallback must already be registered, and following fallback definitions must terminate at `en`. Duplicate catalog ids and duplicate `(ns, locale)` dictionaries throw.

If you want a full DSH-shipped language (dictionaries for DSH's own namespaces), prefer contributing it to better-locale's `src/client/dictionaries/<lang>.ts` — see [Adding translations for better-locale itself](#adding-translations-for-better-locale-itself) in the 0.1.x guide's spirit: add the file, add an entry to `BUNDLED_LANGUAGES` in `src/client/languages.ts`, run `pnpm run gen:translations`, rebuild.

---

## Testing your integration

### Unit tests

Assert your dictionary key sets against your en dict:

```ts
// tests/dictionaries.spec.ts
import { describe, it, expect } from 'vitest'
import { en } from '../src/client/locales.ts'
import { dicts } from '../src/client/dictionaries.ts'

describe('dictionaries key-set integrity', () => {
  const enKeys = Object.keys(en).sort()
  for (const [lang, dict] of Object.entries(dicts)) {
    it(`${lang} has the same key set as en`, () => {
      expect(Object.keys(dict).sort()).toEqual(enKeys)
    })
  }
})
```

(Strict key parity is a choice, not a runtime requirement — missing keys fall back to English at lookup.)

### Manual verification

1. Install better-locale + your plugin into the profile; start `dsh web`, hard-refresh.
2. Settings → General → Language → pick the target language.
3. Your plugin's UI copy switches; DSH chrome switches where better-locale covers it.
4. Switch back to 中文 / English — your plugin follows.

### Troubleshooting

| Symptom | Cause |
|---|---|
| Language missing from the Language row | Its catalog entry was not registered (for the 19 bundled ids: better-locale not installed / not activated) |
| UI shows English for your keys | Your dictionary lacks the keys, or your register call did not run (check the console for duplicate-`register` throws) |
| `locale namespace "X" already has locale "ja"` | Another registration owns that pair; one `(ns, locale)` dictionary has exactly one owner. If `X` is a **DSH built-in namespace** (`common`, `conversation`, ...), the owner is better-locale — register only your own namespaces |
| Selection lost after restart | DSH's `locale.preference` write failed (check the settings service) — selection no longer lives in localStorage |
