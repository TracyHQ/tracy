# tracy-locale — Vietnamese for TRACY'S OWN namespaces

A dsh plugin that registers the Vietnamese translations of the namespaces Tracy itself owns.

**SCOPE NARROWED (settled 30/08/2026).** This package used to translate 727 strings across 30 of dsh's own
namespaces. No longer: dsh's namespaces are translated by the community (`dsh-locale-vi`), and that package also
OWNS the `vi` language — it is the only place that calls `addLanguage`. Calling it again here is a duplicate id
and brings down the whole plugin tree. The `en/` folder and `extract-dsh-en.mjs` went with the old scope: the
source of truth for a Tracy namespace is the `en` text in the **plugin that owns** it, and
`scripts/check-dsh-locale.ts` imports that module directly.

```
vi/          translations, one file per namespace
terms.ts     terms the `vi` text keeps verbatim — the only list, read by the `dsh-locale` gate
lib/client.js   GENERATED from vi/*.json — do not edit by hand
lib/index.js    the Node half, contributes nothing (translation is the browser's business)
cordis.patch.yml  the `- insert:` row that adds the plugin to a profile
```

## This package does ONE half, and the other half no longer exists

`register(ns, locale, dict)` checks duplicates **per locale**: `if (locales.has(locale)) throw`. A namespace
that already has `zh`/`en` accepts `vi` normally → **nothing to patch**. That is all this package does.

The other half — adding `vi` to the locale list — used to require patching the installed dsh, because on
**rc.2** `LOCALES` was an `Object.freeze` constant and `setLocale(id)` **threw** when it was missing. On
**0.1.2-alpha.1**, the version TCH runs, there is `ctx.locale.addLanguage()` and `vendor/tracy/dsh-locale-vi`
calls it — that package OWNS the `vi` language. So when alpha.1 was settled (30/08/2026),
`patch-dsh-locale.mjs` was removed from the Dockerfile and the repo, together with the test guarding it.

Do not go looking for that script. Details, and how things break if the other half disappears:
[`docs/references/i18n.md`](../../../docs/references/i18n.md) §3.

🔒 **Calling `addLanguage` a second time is a duplicate id and brings down the whole plugin tree.** This
package does not call it.

## Translations are DATA, not code

`vi/*.json` is the source; `lib/client.js` is generated from it. Two reasons, and the second is the real one:

1. `pnpm build:check` scans every string in `packages/` — Vietnamese in a `.js` file is a violation. That
   script itself advises: *"third-party data goes into a data file, do not embed it in code"*.
2. A readable diff. One line per key, sorted — on the next dsh upgrade, which strings are new and which are
   gone is **visible**, instead of being discovered as an English screen in the middle of a Vietnamese UI.

`lib/client.js` is **committed**, not gitignored: the fleet copies this folder as-is into
`$DESK_HOME/profiles/node_modules/` and runs no build step there.

## Commands

```
pnpm dsh-locale:build    # vi/*.json → lib/client.js
pnpm dsh-locale:check    # bundle matches its source + four translation checks (in build:check)

node scripts/verify-against-dsh.mjs    # end-to-end check against the dsh installed on the machine
```

`verify-against-dsh.mjs` copies `dsh-client-locale` to a temporary folder, patches the copy, then runs dsh's
**real** `LocaleRuntime` — the machine's install is not touched. It is not in `build:check`, but **the old
reason has expired**: "because CI has no dsh" was written before TCH had CI. TCH's CI runs on self-hosted
runners that have dsh — `check-boot-graph` boots a real dsh — so this is a candidate to wire in, not done yet.

It **draws no pixel**. You still have to look, per the
[`tch-dev`](../../../.claude/skills/tch-dev/SKILL.md) skill.

## Vocabulary

Order of authority, never reversed:

1. [`docs/references/vocabulary.md`](../../../docs/references/vocabulary.md) — the canonical vocabulary and
   the list of **terms kept in English**, enforced by [`terms.ts`](terms.ts) next to this file.
2. `vi/*.json` in this package — a word already used for a concept is reused; never give the same thing a
   second word.
3. `tracy-desk/src/renderer/i18n/locales/vi-vn.json` — **reference only, never copy**. That file is mostly
   machine translation and contradicts itself: `Agent` became the Vietnamese word for a spy, and one entry
   still holds a whole sentence in **French**. `vocabulary.md` records this very mistake.

**Exceptions allowed to equal the English verbatim** live in `KEPT_VERBATIM` of
[`scripts/check-dsh-locale.ts`](../../../scripts/check-dsh-locale.ts), each with a written reason. There are
two today (`tracy-view.permission.fullAccess`, `tracy-dev-mockup.nav`), both for the same principle: **match
the word `dsh-locale-vi` already uses right next to it**, or keep the link between an on-screen label and its
name in code. Adding one means writing down why — if you cannot, the gate becomes a place to look away.

(An older section here covered `vi/settings.agentPreset.json` and two words dsh bans. That file belonged to
the old scope — when this package still translated 30 dsh namespaces — and no longer exists.)

## What is out of reach

Besides the dictionaries, dsh has **74 display strings hard-coded in JSX** (the upstream locale package's
README itself says *"other packages still own static text directly"*). A plugin cannot reach them —
translating them means patching each bundle, once per dsh upgrade.

- **59** in a single package, `ui-trajectory` (the trajectory inspector — an operator screen, not a
  customer's): "Tool Call", "System Prompt", "Throughput"…
- **15** spread over the rest, and these are what customers see: `Think`, `Deep diving...`, `Plan`,
  `Inspect`, `Skill`, `Session log`, `DSH Local Build`.

Ironically one of them is `Session log` — exactly a word `vocabulary.md` **bans**. It lives in dsh, so it is
out of reach; noted here so a reviewer knows it is not our bug.

## Upgrading dsh

dsh's namespaces are no longer this package's job, so a dsh upgrade brings no translation round here — that is
`dsh-locale-vi`'s job. What needs another look is TRACY'S namespaces:

1. Read `en` in each owning plugin's `strings.ts`. Changing a source string makes
   `scripts/check-dsh-locale.ts` demand a retranslation by itself — nobody has to remember.
2. Translate what is new into `vi/`, run `pnpm dsh-locale:build`.
3. `pnpm dsh-locale:check`, then `node scripts/verify-against-dsh.mjs`.

**The whole system runs one dsh version: `0.1.2-alpha.1`** (settled 30/08/2026, rc.2 removed from every
machine). Do not add code paths for a version nobody runs — no machine can prove them.
