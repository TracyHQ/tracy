# One visual system, measured before repeating

> **Cross-phase packet.** Read at Phase 2 (drawing up the contract), at Phase 6 before repeating a layout onto other pages, and at
> Phase 8/8b before acceptance. `design-spec.md` explains the **intent**; `design-contract.json` holds the
> **executable expectations**. `theme.json` + CSS implement them. The content contract holds the business facts.

## Run-root, canonical contract, attempts, stale — invariant 11

A site has **one** run-root (`tasks/<site>/`) and in it **one** canonical `design-contract.json`
(and one `visual.contract.json` for Phase 8b). The adapter writes `<spec>/design-contract.json` — that is a measurement,
not yet a gate: **adopt** it as canonical, then every validate/audit/release reads the canonical one:

```bash
node scripts/design-contract.mjs adopt --run-root tasks/<site> --from tasks/<site>/spec/design-contract.json
node scripts/design-contract.mjs validate --run-root tasks/<site> --spec tasks/<site>/spec        # canonical, checks stale
node scripts/design-contract.mjs audit    --run-root tasks/<site> observations.json               # gate
node scripts/design-contract.mjs pilot    --contract tasks/<site>/attempts/p1/design-contract.json obs.json   # trial, not a gate
```

- `attempts/<id>/` holds every trial copy; `--contract <path>` may point into it, but the result records `canonical:false`
  with the note "not a gate input". No tool scans a folder and picks one: a missing canonical → fail listing the candidates;
  a second file next to the canonical one (`design-contract-v2.json`) → fail, move it into `attempts/`.
- `bindings` (hashes of spec-pack, page-map, seed report, artifact) are recorded at adopt/init; validate with
  `--spec/--routes/--artifact` compares them again — a mismatch is **stale**: `ok:false`, `stale:[…]`, release refuses.
- A new adopt **supersedes** the old one into `attempts/superseded-<stamp>/` with `SUPERSEDED.json`; nothing is deleted.
- Every result/report carries `identity`: `contractPath`, `contractHash` (unchanged when rebinding),
  `sourceHash`, `artifactHash`, `capturedAt`, `stale`.

Reason (14/09): another run left several contract copies in a scratchpad and a tool picked the wrong one — the gate
was green on a contract that was not the site's. This invariant turns that error into a named error before measuring.

## Setting the baseline (Phase 2)

1. Identify the authoritative style guide and the source/version. For a running site, **measure** its accepted
   style guide first (Tracy Base run: `etc/site/default.json` + `etc/theme/base.json` +
   `css/styles/base.css` of the j6 template — D3 in `tasks/tracy-base-wp7/DECISIONS.md`). Record the time and
   version/hash. A library preview is not an authority to override a site's approved typography.
2. Fill in `<spec>/design-contract.json` following the **format** of `examples/design-contract.json`, without taking its values
   as defaults. Map text roles (display, page title, section, card, body, caption), colours, spacing/
   container/breakpoints, and the general rules of header/menu/footer/button/form/card. Read the real computed style
   in light/dark × desktop/mobile. Values must be resolved CSS numbers/strings — `var(...)`, `calc(...)`
   are not computed evidence (the validator refuses them).
   Two readings the per-element roles miss (#37): the `body`'s `-webkit-font-smoothing` and `text-rendering`
   (they change the drawn weight of every line; the visual contract compares them as `design.parity.body`), and
   the source's **container breakpoints** — every `@media (min-width: …)` step of its container's `max-width`,
   with the file and rule it was read from. They go to the dossier's `review.config.json` `"containers"`
   (`breakpoints`, `evidence`, `items`), which the visual contract measures between the 1440 and 390 axes
   ([`visual-qa.md`](visual-qa.md) §Container widths).
3. Inventory every page, pagination variant, system/account state. A page declares the `rules` that apply,
   and `requiredRules` must match at least one visible element. `{mode}` in the URL picks the light/dark version of
   the artifact. An intentional redirect is recorded in `expectedUrl`; a private state needs an observation while signed in
   or stays "not checked".
4. Declare `coverage` (selectors + properties that must be classified). Every visible element matching coverage must be
   covered by an applicable rule for those properties. List every heading and body role, not just the easy selectors. Exclude
   third-party plugin overlays with the theme's scope selector. Review coverage against the full DOM: the schema does not
   detect by itself a component the author forgot in both rules and coverage.
5. Run the validator, then the spec-pack gate. Every author receives the same contract path + hash. When the source or contract
   changes, all old render evidence expires — re-measure the reference and the affected pages.

```bash
node scripts/design-contract.mjs validate <spec>/design-contract.json
node scripts/ingest/spec-pack.mjs --validate <spec>
```

An old package must add a measured contract before continuing. The spec-pack's `--init` creates an **incomplete** skeleton with
`pending`; `--force` keeps a contract already written. `pending` must be resolved before the gate passes.

## Theme hook — `html[data-theme]`, and the "absent = auto" trap

`DEFAULT_THEME_HOOK` of `scripts/ingest/spec-pack.mjs` writes into the skeleton:

```json
"theme": { "selector": "html", "attribute": "data-theme", "lightValue": "light", "darkValue": "dark" }
```

This is exactly the hook `tracy-base` uses ([`dark-light-mode.md`](dark-light-mode.md)): `data-theme="light"` or
`"dark"` on `<html>`; **an absent attribute is the `auto` state** (following `prefers-color-scheme`). Consequences for
measuring:

- `scripts/design-probe.mjs` (`captureDesign`) reads the attribute and returns `mode: 'unknown'` when it is absent — and
  `design-contract.mjs audit` refuses an observation in the wrong mode. So **before capturing, set the state
  explicitly**: the cookie `tracy_theme=light|dark` before loading the page (the script in `<head>` reads it and sets the
  attribute before paint), or set the attribute after loading. An observation in `auto` is **not** a hook
  error — it is a measurement whose condition was not set. Do not "fix" the theme so the attribute is always present just because the probe
  did not see it.
- The contract holds exactly the two values `light`/`dark`; `auto` is not a variant, it is a way to reach one of the two.

An import from static HTML must declare that document's **real** hook, not a guessed label.

## Format (schemaVersion 1)

- `source`: `reference`, `inspiration`, `version`, `capturedAt` (ISO) — all four, all strings. Record provenance;
  keep the CSS/source snapshot next to the evidence. A self-declared hash is not a live check.
- `theme`: as above.
- `variants`: unique ids, `mode` light|dark, `width`/`height` positive integers. Desktop (≥ 1280)
  and mobile (≤ 430) in both modes are **required** → at least 4. `tokens` maps each variant → the root custom property strings
  (names starting with `--`); the number of variants must match.
- `rules`: unique ids, `category` ∈ `typography | color | layout | component` (**each category must have at least
  one**), `selector`, `styles` for **every** variant. Properties in CSSOM camelCase or custom properties.
- `pages`: `id` = `pages[].file` of the page-map, `url`, `expectedUrl`, `identity` selector, `rules`,
  `requiredRules`. The Joomla adapter writes `identity` from the template framework's selector profile
  (`scripts/lib/framework-selectors.mjs`, #66): `main` on T4; on T3, which has no `<main>`, `main, .t3-mainbody,
  .t3-section, .t3-sl, .t3-masthead, .t3-hero, .t3-slideshow` (an article's main body, or the section bands of a
  home page built of sections); for a framework with no profile the generic `main, [role="main"]`, with a
  provenance note naming the gap.
- `coverage`: selectors + required properties. `pilotPages` are the representative pages that must pass before repeating.
- `exceptions`: exact page/rule/variant, replacement style, reason, **decision reference** (a
  `DECISIONS.md` entry). An exception overrides a declared property; it does not drop coverage or switch off a page. A reason is not
  an approval; do not write an exception just because a test is red.

A poster/slide may deviate in typography when the brief says so — a local exception for that artifact. The HTML tag does not
decide the role: a template label and a section heading are both `h2` yet expected differently. Keep the site's
header/menu/footer; scope the artifact's reset out of the site shell.

## Capture and pilot (before repeating pages)

```bash
node scripts/design-contract.mjs request <contract.json> <page-id> <variant-id>
```

Open the page in a browser (Playwright/CDP), set the right viewport, set the **real** theme and confirm it, wait for fonts
and layout to settle, then evaluate the `captureDesign` callback of `scripts/design-probe.mjs` with that request as
its argument. The callback only reads: geometry, CSS, tokens, theme, coverage; it sets no style and does not navigate.
Capture after lazy content has rendered. Repeated cards are measured **all**, not cut at the first match. Save each object
into a JSON array of observations, with screenshots and source/CSS hashes.

```bash
node scripts/design-contract.mjs pilot <contract.json> <pilot-observations.json>
```

Pilot pass = every pilot page in every variant, 0 findings, 0 missing cases, plus an eye review of the representative
components. The pilot report states `scope: pilot`; it is never whole-site acceptance. Only after the pilot passes are approved
components/tokens repeated onto other pages.

### Measuring on a site other than the source — target map (#69)

The contract is measured on the **source** (the source's URLs and selectors); pilot/audit measure the **port**. Do not edit the contract: use
`--target-map <file>` (`schemaVersion 1`, `contractHash` required = the contract's hash → an old map is refused):
`origin` replaces the origin of every `url`/`expectedUrl`; `pages.<id>.{url,expectedUrl,identity}`, `rules.<id>` (selector),
`coverage.<source selector>` (port selector), `theme.{selector,attribute,darkValue,lightValue}`, `tokens.<source token name>` = the token name on the port,
`tokenRoot` (selector of the element the tokens are read from, default `html`). The expectations (tokens, styles)
stay unchanged. `request` carries `targetMapHash`, `captureDesign` copies it into the observation, `audit` refuses an observation with a missing/different hash.
CLI: `--run-root DIR` or `--contract FILE` (every positional after the command is the command's argument), or the old form `CMD CONTRACT …`;
unknown, repeated or value-less flags are refused. `tokens.<variant>` may be `{}` (a LESS/T3 template declares no `:root`).

## Full acceptance (Phase 8/8b)

```bash
node scripts/design-contract.mjs audit <contract.json> <all-observations.json> --out <dossier>/design-audit.json
```

Stdout by default is a one-line summary (`ok=… missing=… findings=…`) plus the path of the full result file; `--out` sets that file (never the contract or the observations file), `--json` prints everything to stdout. Keep `--out` as the checkpoint's evidence; exit 1 when `ok` is false, as before.

A pass requires the full page × variant matrix, the right URL/theme/viewport, fonts loaded, identity matched, required selectors
matched, coverage classified, no horizontal overflow. Every expected property is checked; a missing one fails. CSS
colours include alpha, channel tolerance **zero**; px allow 0.1px rounding. Empty, stale, duplicate observations all fail.
The report states the counts of expected/observed cases, elements, properties, missing cases, findings.

A computed `font-family` proves the configured stack, not which font drew which glyph. Eye review:
fonts, images, line breaks, alignment, responsive navigation, interactions, light/dark switching. Hover/focus/error/open menu are
separate cases when needed; the default matrix is the static state. Screenshots and the toggle test are separate requirements.

**Do not** generate observations from expected values, loosen tolerances, shrink coverage, or change the style guide to legitimise
an accidental override. Fix the implementation, or settle an intentional design change with Lee and then edit the contract.
Record the contract/pilot/full report in the checkpoint (`scripts/checkpoint.mjs complete <file> <phase> <evidence…>`).
