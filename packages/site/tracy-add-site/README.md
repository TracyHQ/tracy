# `@tracy/dsh-add-site`

Add a site to Tracy, right inside dsh. One `dsh-better-sidebar` tab, one wizard, **two
sources**: create a new site on the fleet, or import a site that already runs.

Full plan: [`tasks/todo-tracy-add-site.md`](../../../tasks/todo-tracy-add-site.md).

## Status — read before assuming it is done

| Done | Not yet |
|---|---|
| Tab registered in better-sidebar (`order: 60`, `single`) | The `POST /api/sites` door of `cowork-web` |
| Three platform switches in the tab's gear | Progress console, Ready screen |
| First screen: pick a source · pick a platform · name it | The `import` branch (only a "coming soon" label so far) |
| The three name refusals computed in place | The fourth refusal (`taken`) — only the server knows |

The **Create site** button is OFF, and the screen says why. That is deliberate: `CLAUDE.md` §0.3 — a missing
endpoint is declared, not invented; users trust the button.

## Why ONE plugin for both sources

ADR 0088 §1 measured that create and import *"really differ in only one step"* — the content source.
`tracy-desk` once split them into two dialogs behind a two-verb menu and **dropped that** on
24/08, because it made people answer before either door could say anything about itself. The fleet also has
only one door: `POST /provision`, the branch chosen by the body.

## Four things that break easily, each silently in its own way

1. **`store.getSnapshot()`, not `getState()`.** Guessing the wrong name opens the tab with a red line
   instead of content. And `pluginSettings` lives in `prefs`, not in `state` — put it in the wrong place and
   every switch quietly reads as "not configured".
2. **Tab registration must be wrapped in `ctx.effect`.** Unwrapped, HMR leaves the old registration and the
   next one throws `tab type already registered`.
3. **`dsh-better-sidebar` is an `optional: true` peerDependency, and the source `import`s nothing from it.**
   A value import would drag a second copy of that plugin into this bundle.
4. **Comments inside the CSS template must be English.** They are *strings* — esbuild bundles them verbatim
   into `lib/client.js` and the customer's download can read them. `check-language` catches exactly that, and rightly.

## Where the site-name rule lives

[`src/client/site-label.mjs`](src/client/site-label.mjs) — **plain JavaScript, on purpose.** This rule
will have a second copy in `workers/seat-registry` (the real gate, which cannot be argued with), and the Worker
cannot reach `packages/`. Writing it in JS from the start turns the copy into the Worker into a verbatim copy
instead of a translation — and a translation is a chance for the two to drift, a drift that shows up as a
button lighting up on exactly the name the relay will refuse.

[`test/site-label.test.mjs`](test/site-label.test.mjs) runs in `pnpm test`. When the Worker copy
exists, **the same test suite must run against both**.

`fleetLabel()`, on the other hand, has **no** copy here, and that comes from reading the source: its first
branch matches `^<label>.tracy.ai$` and returns `<label>` as is. For a fleet-born site, the name **is**
the label.
