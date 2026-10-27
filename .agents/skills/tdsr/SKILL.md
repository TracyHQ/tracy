---
name: tdsr
description: TDSR — Tracy Design System Readiness. Fix a template (Joomla, WordPress, EmDash) until it declares its design-system slot correctly, so that a customer who presses Design system gets the site dressed in that system, and a customer who doesn't gets a site identical to the template. Use when the "Design system" step on the /ops Road to live reports Must fix / Worth fixing, when /ops offers the prompt "The Design system check of the release …", when asked to "run tdsr" or "make the template declare the design system correctly", or when re-releasing a template that already has a slot contract. Not for choosing a system for a running customer site (that is the Design system button), and not for editing design-system data (DESIGN.md, vendor/tracy/refero, od-design-system).
---

# TDSR — make a template declare its design system correctly

The checker is **Template Design System Readiness**
([ADR 0031](../../../docs/adr/0031-template-design-system-readiness.md)), the twin of TCQR
(Customize your site, ADR 0029). /ops runs it on every release and scores it as the step **Design system · n/m passed** on
Road to live. This skill is **the repairer**: ask the checker which rule failed, fix exactly that, re-release, ask again until
it passes. The skill keeps no copy of the rules: they live in `apps/tracy-web/src/lib/template-design-system-readiness/` and
the `rule-severity.json` next to it.

**Every commit, push, PR, merge, template release, upload to `ja-products`, and theme/plugin release is a STOP POINT**: say
which step you are at and what is needed, then wait for whoever assigned the work to give the order.

**Design-system data is read-only:** don't edit `DESIGN.md`, `vendor/tracy/refero`, `vendor/tracy/od-design-system`. Apply a
system without a model. An empty slot = the template's original look, measured at zero difference.

**RAM** (assume a shared 16 GB machine): at most **two** Docker stands and **8** measuring Chromes at once (`--jobs 2` ×
`--concurrency 4`, §3); tear down right after measuring (`stand.mjs down`). Don't run several measuring agents in parallel.
The static part needs no Docker.

## 1. Ask the checker

```sh
# in a bootstrapped tch checkout (pnpm install done)
node scripts/template-design-system-readiness.mjs /tmp/tdsr/<tag with / as _> --tag '<tag>' --fetch
```

`--fetch` downloads only `tracy_setting.json` and **one** archive holding the template's stylesheets (`dsAssetsOf`: the Joomla
installer or webroot, the WordPress theme zip, the EmDash source zip) — no database, no old webroots. The result must
**match** the line on /ops. If it differs, stop and report: /ops is running a different image, or the contract changed
after the check (press Check again).

Several releases in one run: download each into `<cache>/<tag with / as _>/`, then
`node scripts/template-design-system-readiness.mjs --all <cache> --md-out table.md --json-out table.json`.

## 2. Rules and where to fix

| Rule | Group | A failure means | Where to fix |
|---|---|---|---|
| SLOT-1 | worth | No slot contract names the template, or `ready: false` | Write `packages/design/tracy-ds-slot/templates/<cms>-<slug>.json`: Joomla `pass-joomla.mjs`, WordPress `pass-wordpress.mjs` (§3) |
| SLOT-2 | worth | The released version is outside `[minVersion, maxVersion]`: the button refuses new sites | Check the new version still tokenizes (CSS-1, CSS-2 pass) **then** move `maxVersion` (README of `tracy-ds-slot`, section `maxVersion`). Never move it just because the number is higher |
| CSS-1 | **must** | A stylesheet paints the template palette without reading the slot: a rebuild from source that was not tokenized | `scripts/tokenize.mjs --template <contract> --write <file>` or `release-joomla.mjs`, then re-release |
| CSS-2 | worth | Palette colours still written as literals (usually in shared files, or the contract learned more colours after the release) | Tokenize again with today's contract, re-release |
| DEF-1 | **must** | A `var(--ds-…)` without the template's value as fallback: a site with no system chosen loses that value | Tokenize again instead of hand-editing; use only the 16 colour roles |
| BAND-1 | worth (becomes must once `bands` is locked into develop) | A band the template paints itself (header, hero, CTA, footer) stays the same under every system: the first screen "is still the old UI" | Declare `bands` for the band (background + every text colour measured on the released page: `discover.mjs`), or `keepWhole: {"<band>": "<reason>"}` when the band must stay |
| PLAT-1 | **must** | The template lacks its CMS's slot part: WordPress does not call `tracy_apply_inspiration`; EmDash lacks `src/lib/ds-slot.ts` or the layout does not load it; Joomla no longer has the `module.position` | Theme in `packages/cms/tracy-wordpress-theme/src`; the slot reader of the base EmDash theme; re-measure the earliest position (`pass-joomla.mjs`) |
| ROLE-1, SCREEN-1, CON-1, UNDO-1, FONT-1 | (built site only) | Cannot be scored statically | Measure with `flow.mjs` / `pass-*.mjs` (§3) |

### Guidelines when writing or fixing a template (wearing a system must look good and balanced, not just have the right colours)

- **The text hierarchy belongs to the template.** The slot ranks the template's four text roles (`--fg`, `--fg-2`, `--muted`,
  `--meta`) by legibility on the template's own background (`textOrder`, `src/tokens56.mjs`), then gives the system's
  strongest text to the strongest role, and so on. A template that uses `--fg-2` as heading ink and a lighter `--fg` for
  body text (most JA templates) keeps headings darker than body text under every system. If a text role is not legible on
  its own background (under 2:1), the slot re-ranks nothing: give that role a colour legible on `--bg`; don't borrow a text
  role for a band colour.
- **Both halves of `light-dark()` are the same role.** If the light half reads the slot (`var(--ds-c-<role>, <light>)`), the
  dark half must too (`var(--ds-c-<role>, <dark>)`): a dark system sets `color-scheme: dark` on the page, and a literal dark
  half shows the template's dark colour among the system's colours (JA Essence: the active menu link #7d93ff under Spotify).
  `tokenize.mjs` does this (`darkArms`); CSS-2 reports releases that still miss it.
- **Sketch bands (`bands`) on a page that ran every stylesheet.** `bands.mjs` reads the colours being painted: sketching on a
  broken release (JA Vega 1.1.16 printed PHP to the page, no CSS ran) makes the contract record a white background for the
  night band, and buttons in the band get scored on the wrong background. After sketching, open the default screenshot and
  check each band's background matches what the eye sees; colours the template hard-codes in CSS (`--jv-night`) are taken
  from the CSS.
- **The template's own accent colours must follow the system.** Coloured words in headings (`.jn-accent` of JA Nova), a rating
  row painted with `warn`, a hard-coded gradient glow (`rgba(163, 230, 53, .12)` of JA Kinetic) left unchanged under every
  system means two accents fighting: declare `followRules` (outside bands), the band's `paint` (inside bands) or `sideRules`
  (compound values such as gradients). `cardLike`/`pill` are never layout classes (`.wp-block-group`): that rounds a
  full-width band like a card.
- **Literal colours outside `color`/`background-color` don't follow the system on their own:**
  - decorative outlined text (`-webkit-text-fill-color`, `-webkit-text-stroke-color`: the marquee text of GK Compact) →
    `sideRules` light/dark, fill with `--ds-c-bg`, stroke with a translucent `--ds-c-fg`;
  - `::before`/`::after` overlays carrying template palette colours (GK Restly's purple gradient at 0.5 opacity turns the
    system background into muddy khaki) → `sideRules` that switch the overlay off or move it to a system colour;
  - dark-ink icons/images on a dark header → `selectors.inkImages`; a `#000` menu rule under a two-id selector →
    `followRules` with a `!` role (`"fg-2!"`), because the slot's ordinary rules lose to two ids.
- **Declare `discovered.displayPhone`** (the template's display size at 390px). Without it, the system's headline on a phone
  is only capped at 10vw, so a 20px template heading becomes 40px and seven lines tall (JA Aiga). With it, the display on a
  phone is at most 1.25 times the template's own size.
- **Declare `discovered.displayFace`** (`"<font family> <weight>, tracking <n>em"`, the font of the display line on the
  release; `discover.mjs` writes it). The 1.25 cap preserves **line width**, not just font size: the wider the system font
  is than the template font (average glyph width in `src/font-widths.json`, tracking included), the lower the cap, but never
  below the template size divided by 1.25. Without this line, an 80px Inter 600 stays within the size cap yet sets the hero
  heading of Tracy Business (Newsreader 400, 64px) six lines tall in a half-page column. A font missing from the table gets
  only the size cap.
- **Header buttons keep the template's size:** the slot changes only the corner radius and weight of buttons in `header`/
  `nav`/`#t4-header`/`#gkHeader`. The system's padding pushed a phone header onto two rows (iJoomla Guru Pro). Don't add
  your own button-size rule for headers.
- **A button on a band that keeps the template colour must stand out at ≥ 3:1 against the band:** declare the band's
  `keptButtons` (band background + button selector). The slot flips the system's colour pair or keeps the template's button
  when the system accent sinks into the band.
- **Colours that encode content are kept, and recorded as deliberate** (the five-colour category bar of JA Comics: one colour
  per category). Write the reason into the contract's `literalsNote`, so a reviewer does not take it for a missed colour.
- **Six structures common across a review of 84 Joomla templates, declared in the contract:**
  - *Undeclared template colour blocks* (bands, cards, buttons keeping the template colour next to the system): run
    `scripts/bands.mjs --draft --fills` on the running page, inner pages too (`--page`); it adds missing bands/fills, the
    reviewer drops the wrong sketches.
  - *Hard-coded white text on a background that became the accent*: under a light accent (yellow, lime) the white text
    vanishes. Declare that block as a `fill` with `words`, or `selectors.onAccent`, so the text takes `accent-on`.
  - *Hard-coded light background, text following the system* (or the reverse): under a dark system that becomes pale text
    on a light background. Give background and text one source (`followRules` on both `background-color` and `color`), or
    keep the whole block (`keepScopes`).
  - *Text on images* (sub-page mastheads, hero slides, fixed-colour header bars): declare the band `picture: true` (or
    `keepScopes`), text keeps the template colour; don't let text follow the system text colour on a background the system
    does not repaint.
  - *Round images with baked-in white corners* (square images, circle inside): under a dark system the white corners show.
    `sideRules.dark` `border-radius: 50%` for that image.
  - *Single-colour decorative images* (a flat orange CTA background): take the system hue while keeping the image's light and
    dark with `background-color: var(--ds-c-accent)` + `background-blend-mode: luminosity`. Not for photos of people or
    products.
- **General band rules (built in; nothing to declare unless stated):**
  - *A panel separated from the page*: a light band the template sets apart from the page background (a grey masthead on a
    white page) keeps a 1.05–1.2 step against the system's page background; when no system colour reaches that step with
    legible text, the band gets a 1px system border. Before this, systems whose surface equals the page (Mailchimp) made
    the panel disappear (1080/6486 panel × system pairs).
  - *Nested bands*: buttons and accent text belong to the innermost band; an outer band's rules do not reach into the inner
    one.
  - *Page accent text inside a band*: `followRules` painting `accent-text` stop at each band's edge, so inside a band they
    take the band's own accent (scored on the band background). A band that `paint`s that text itself wins. Before this, the
    orange eyebrow of T4 Blank kept the template colour on a cream panel, 2.22:1.
  - *Large accent text on images*: declare `accentLarge` (`true`, or `"(min-width: 768px)"` when it is only large from that
    width) to use the 3:1 accent and keep the system hue; phones still use 4.5:1 (JA Rent).
  - *A band whose background is a flat single-colour image* (a texture over the background colour): `dropPicture: true`,
    otherwise the image hides the system background (JA Impact).
  - *A light panel under a dark system* becomes a light island (the system's light colour, the template's dark text):
    legible, and the default. To make the panel follow the system's dark background, declare `repaint: true` (JA Intranet),
    and check that nested cards still separate from the panel.
  - *A band only at some widths* (`media`, a solid header on phones): buttons in it wear the system button pair on the band
    background, only within that media. Before this no rule painted them: JA Mood's green buttons sat on Spotify's green
    header.
  - *Cards inside a band*: paint them with the `card` role in `paint` (the band background moved one tenth away from the
    band's text); don't mix the background towards the text: JA Kidscorner mixed 10% towards white text, leaving white text
    on the card at 3.91:1.
- **The automatic palette (`templates/palette/<name>.json`) runs on top of the contract:**
  - `paletteKeep` matches substrings of the selectors in the palette file. Before declaring it, grep the palette file to make
    sure the string is in the rule it should block: JA Vega declared `.tracy-header` while the palette rule says
    `.jv-header`, so the header was still painted.
  - Check the file's `page`: a palette read from a dark demo (JA Kinetic Joomla, `#0a0d0c`) treats every raised surface as a
    band, and under a light system the whole content area turns dark grey. Keep those parts out of the palette; the contract
    already handles them.
  - The palette's `vars` (overriding the template's root variables, such as `--jv-amber`) are not blocked by `paletteKeep`.
    In a band that stays unchanged, restore that variable with `sideRules` on the band and record it in `literalsNote`.
  - Palette bands wear `--ds-c-ink`, the system's darkest ink, whichever template role holds it (`textOrder`). `.h1`–`.h6`
    are headings like h1–h6: their rules cover the whole page, so they never take a band's text colour.
- **The button probe scores only buttons the page shows:** a button outside a slider's clipping frame (`overflow: hidden`) is
  another slide and is not scored (JA Gamex, looping owl).
- **A Joomla module lives in a TEXT column (65,535 bytes):** the slot throws when its CSS exceeds 60,000 bytes
  (`MODULE_MAX_BYTES`), and `matrix.mjs` checks every contract × every system. Contracts with many bands hit the ceiling
  easily: merge bands, don't multiply selectors.
- **A template header must leave room for a wider font:** header buttons keep the template padding (Joomla and EmDash), but
  the system's text is still wider. The phone header of EmDash Tracy Base 0.5.4 had only 16px spare at 390px, so under
  JetBrains Mono (MotherDuck) it overflowed by 7px and the page scrolled sideways. A phone header should leave at least 15%
  of the row width free, or move the CTA button into the menu below about 400px.
- **Measure sliders at rest:** `measureStill` stops Swiper, Bootstrap, Owl v1/v2 and slick at the first slide. A probe that
  scrolls (`scrollIntoView`) must return every scrolled frame to where it was, otherwise the slider is captured between two
  slides (JA Rent).
- **Fix by property, not by system** (the library has over 1000 systems; fixing for 15 of them is overfitting).
  - Right: a rule in the emitter keyed on a property of the system (light/dark, achromatic accent, mid-tone accent, a mono
    font or one only for headings, type scale, corner radius), or a declaration of the template's structure in the contract
    (bands, picture bands, roles in `followRules`, `sideRules` using `var(--ds-c-…)` or a mix of one role).
  - Wrong: a hard-coded colour chosen to look good under one system; a system's name or id in a rule.
  - A hard-coded colour is allowed only when it belongs to the template itself, recorded in `literalsNote`: text on images,
    status colours, content colour codes.
  - After every fix run `node packages/design/tracy-ds-slot/scripts/matrix.mjs`: every contract × every system passes the
    library's gate (1334 systems), no stand needed. The package's tests run 1/9 of the systems.
- **The set of systems to measure on a stand is the 15 featured systems** (`FEATURED_REFERO_SYSTEMS`,
  `apps/tracy-web/src/lib/ds-slot.js`), at both 1440 and 390, and **look at the screenshots**: 12/12 passing with headings
  paler than body text, mis-sized buttons or broken whitespace rhythm is not a pass.
  - Add a few held-out systems chosen for extreme properties, outside the 15: a coloured background, a white accent on a
    white page, a mid-tone accent, a dark page with a neon accent, a mono font, an achromatic accent. They check the fix
    holds beyond the set you looked at.
  - Also measure inner pages (`--inner`), not just the home page.

Owner of a failure (`owner` in the report): `template` = the template must be **re-released**; `contract` = **a PR into the
tch `develop`**, no new release needed — /ops re-scores after CI deploys (the checker re-checks by itself when that
template's contract changes).

A failure that slips past the checker (seen on a built site while the checker says pass) → **add a rule that catches it
first**, with a test that is red on real data, and only then fix the template (ADR 0029 §7, kept in ADR 0031).

## 3. Measure on a built site (find new rules, accept a fix)

```sh
cd packages/design/tracy-ds-slot
node scripts/pass-joomla.mjs <slug> --port 52091            # Joomla: build · draft contract · tokenize · measure 4 systems + control · tear down
node scripts/pass-wordpress.mjs <slug> --port 52091         # WordPress
node scripts/flow.mjs --cms emdash|wordpress|joomla ...     # running site: default → each system → drop system, screenshots at 1440 + 390
node scripts/stand.mjs down --name <name>                   # always tear the stand down after measuring
```

### Re-measure the preview / a whole released version

`preview-check.mjs` and `preview-parity.mjs` read several pages at once, each in its own Chrome (`--concurrency`, default 4);
the output is byte-identical to a sequential run except for timestamps. `preview-check.mjs --scheme light,dark` measures both
schemes in one run. With `--write`, an incomplete run (preview-check: a system with no page measured, or a page that could not
be read; preview-parity: views still not compared) writes nothing and exits 1; a page that could not be read is still
written, and /ops leaves it unmeasured. Several releases at once, one stand each; release i takes the three ports `--port`+3i
(stand), +1, +2 (probes) — check they are free before building:

```sh
node packages/design/tracy-ds-slot/scripts/release-measure.mjs [--jobs 2] [--concurrency 4] [--preview-only] \
  quickstart/ja-sensei/j6@1.0.6 quickstart/ja-prodex/j6@1.0.4
```

Per release: build a stand → `flow.mjs` (baseline + the 15 featured systems; skipped with `--preview-only`) → preview-check
light+dark → preview-parity (Joomla, skip with `--no-parity`) → tear the stand down whichever step failed; a teardown that does
not finish (containers left) counts the release as failed. Each release logs to `<work>/<name>.log`; measurement files stay in
the tree, uncommitted. Measured on a 16 GB Mac with another session's stand running (ja-prodex 1.0.4, 15 pages × 2 preview
systems):

| | before | `--concurrency 4` | `--concurrency 6` |
|---|---|---|---|
| preview-check light + dark | 658 s | 176 s | 189 s |
| preview-parity | 592 s | 172 s | 147 s |

Above 4 is not faster: the site in the stand is the bottleneck. `--jobs 2 --preview-only` for two releases: 553 s for both
(one release 416 s), lowest free memory 25%. One page still takes ~20 s per pass because each open has fixed waits against
short measurements in `cdp.mjs` (`openPage`); don't cut them until you have proved the results don't change.

Chrome on macOS: add `--proxy-server=direct://` (the Mac's PAC hangs every connection). Keep the evidence (a screenshot per
step, measurement JSON) in a dated evidence folder for the template, e.g. `evidence/tdsr-<slug>-<date>/`.

## 4. Re-release and close the loop

1. Joomla template: `release-joomla.mjs` builds the next version **locally** (tokenized webroot/zip, same DB, manifest,
   SHA256SUMS, a new content contract when the CSS hash changes). WordPress theme: bump `Version`, sync to the Claude Cowork
   plugin repo, release the theme. EmDash: follow the `tracy-emdash-template` skill.
2. Version number: take the next free number — several lines of work release in parallel. If the script stops because the
   asset already exists, fix the contract before anything else.
3. Slot contract: `minVersion`/`maxVersion` = the version just built; `maxVersionNote` records what was checked.
4. **STOP POINT**: give whoever assigned the work one single command (the upload, the tch PR, the final switch), and wait for
   them to run it.
5. Once the new version is on `ja-products` (or the contract PR is deployed): ask whoever assigned the work to press **Check
   again** on the Design system step of Road to live, or run §1 again until no must-fix remains.

## 5. When it is not the template's job

- /ops reports `Could not check` (download error, timeout): Tracy's job, not the template's — report it with the reason,
  don't touch the template.
- The emitter (`@tracy/ds-slot` `src/`) is wrong for every template: a separate tch PR, with a regression case; every release
  is re-checked automatically because the rules version changes.
