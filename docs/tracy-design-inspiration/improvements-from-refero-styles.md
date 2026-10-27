# Improving the Tracy design library from Refero Styles

Refero is worth using to add layout, imagery and typography rules to the Tracy library. The first priority is keeping design decisions intact when Tracy generates a preview; expanding the catalogue comes second. A trial crawl on 08/10/2026 fetched all 20 styles on the initial Popular page and indexed 1,342 URLs from the sitemap. This is a survey sample, not a full copy of Refero nor a measurement of generated-site quality.

After the survey, the library import was assigned first, with confirmation that a separate licence agreement had been handled. The snapshot of 1,342 public styles is stored at [vendor/tracy/refero](../../vendor/tracy/refero/README.md), keeping the raw data and exports before integration. The quality conclusions below still rest on the initial survey sample and must not be read as a visual assessment of the whole new snapshot.

## Data scope

The [Popular page](https://styles.refero.design/?sort=popular) advertises more than 2,000 systems. The [styles sitemap](https://styles.refero.design/sitemaps/styles.xml) had 1,342 URLs at fetch time; the two numbers are not treated as the same set. The initial HTML page had 20 style links, not counting further loads on scroll.

The sample has 13 light styles and 7 dark styles. Each has 9–15 component entries in its DESIGN.md. The compressed raw HTML, the DESIGN.md extracted from the page's built-in export, fetch time, SHA-256, source URL and preview image paths are in the [evidence set](../../tasks/evidence/refero-styles-2026-10-08/README.md). Beyond these 20, no sitemap URL has had its detail page fetched.

Four brands in the sample match the Tracy library: Apple, Linear, ElevenLabs and Notion. Apple has two Refero entries, one pointing at the MacBook Neo page; so there are five reference entries for four brands, not five independent systems. Matching was by name for survey purposes and is not a data-merge rule.

The Tracy catalogue on disk currently has **154 systems**: the set usually called the 152 systems plus two extra JA systems. The upstream README says 151, which does not match the packaged catalogue; the counts here use the real manifest and the existing catalog.

## What Tracy should improve first

### The brand engine adapter drops design decisions

In [library-brand.mjs](../../packages/design/tracy-design-inspiration/src/host/library-brand.mjs), `brandFromSystem` takes some colours, the first font and one radius. But it sets display/body weights to `[400, 700]` for every system, replaces fallbacks with a generic list, leaves `imagery` empty, leaves `postureRules` empty, and sets spacing to `8px baseline grid`.

[build-assets.mjs](../../packages/web/tracy-design-page/scripts/build-assets.mjs) calls this same adapter to build the artifacts. So a DESIGN.md with image rules, characteristic weights or section rhythm can still lose those rules before reaching the engine. This is data loss at the engine's input; how much the engine actually uses each field, and the visual impact, must be measured in the implementation pass.

Linear has weight 510 and OpenType features in its raw data, yet the adapter returns 400/700 to the engine. Apple describes product imagery and a light/dark section rhythm in its DESIGN.md, yet the adapter returns empty imagery. Importing thousands more systems while keeping this adapter keeps the same bottleneck.

**Priority:** add a Tracy-managed structural description holding fonts by role, weights, fallbacks, image rules and layout per page type. The adapter reads that description; fields not yet proven stay empty. Do not force one radius or one spacing rhythm on every component.

### Dark and responsive are not a clear enough contract in the tokens

A static scan of 154 `tokens.css` files gave:

| Signal | Systems | Interpretation |
| --- | ---: | --- |
| Dark selector in tokens | 3 | `cloudflare-kumo`, `ja-kinetic`, `ja-voyara` |
| Media query in tokens | 1 | `cloudflare-kumo` |
| Keyword imagery or photography in DESIGN.md | 59 | Text signal only; does not prove the rule is applied |
| Keyword substitute in DESIGN.md | 20 | Text signal only; font loading not checked |

The [results and method](../../tasks/evidence/refero-styles-2026-10-08/tracy-audit.json) only scan tokens and prose. A dark-native system needs no theme-switch selector; components may also have their own responsive rules. So **do not conclude that 151 systems lack dark support or that 153 are not responsive** from these numbers.

The gap is the ability to declare clearly: light only, dark only, or two verified themes; and how typography and spacing change with the viewport. The auto-generated `kit.dark.html` and the `dark.json` flag do not replace an author-defined dark token set. Refero records the theme for each style explicitly, but the current sample also does not prove two themes or a complete mobile type scale.

**Priority:** define the supported themes and the mobile type scale for three trial systems; measure at 390, 768 and 1440px. Keep the distinction between dark-native, inferred dark and measured dark. The font, narrow-column and empty-image issues are already recorded in the [earlier Apple build](four-improvements-from-one-template-build.md).

## What Refero adds

| Part | Value from the Refero sample | How Tracy uses it |
| --- | --- | --- |
| Layout and imagery | Separate Imagery, Layout, Surfaces; describes image type, density and page rhythm | Feed into the structural contract and fixtures with real content |
| Typography | By role, with weight, tracking, leading, OpenType and substitute fonts | Keep role and context; measure the real font instead of only changing the family |
| Component | Specific descriptions of 9–15 types in each surveyed entry | Use as a brief for building fixtures; do not treat prose as a working component |
| Search | Short description, theme, Similar Brands; queries by design feel | Add attributes such as density, imagery, hero and layout to filter, then read 1–3 entries |
| Source | URL of the reference page and preview image | Record page URL, fetch date, viewport and observed scope for each decision |

Tracy already has `tokens.css`, Design Tokens JSON, Tailwind mapping, components manifest, preview and evidence. Refero's similar export buttons are not a capability Tracy lacks. The improvement lies in content, traceability, and keeping decisions intact through the artifact-generation steps.

The sample also has Mercury, Steep, monopo and many directions not in the current catalogue. They are worth surveying for dark banking, serif analytics on warm paper, or motion-led portfolios; no measurement yet shows that adding them improves the sites Tracy generates.

## Refero data to verify before importing

The [Linear entry](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1) itself says the values are normalised, the roles are interpretations and the HTML is a reconstruction. Three concrete points in the sample show why the raw data must be kept and the conversion reviewed:

1. **Linear's accent differs.** Refero picks `#e4f222` for the primary action; Tracy uses `#5e6ad2`. The saved Refero preview image only shows a white Sign up button at the top of the page and yellow inside a product screenshot — not enough to confirm a lime rule for CTAs site-wide. Measure the original page before choosing a new value.
2. **Linear's radius contradicts itself within one export.** The component table says card 12px and the prose forbids cards from 16px up, yet the Quick Start still declares `--radius-2xl: 16px` and a 22px step. There is no role mapping saying where that step is used. Do not map radius names directly onto the Tracy schema.
3. **Apple MacBook Neo mixes a gradient into text colour.** The [Apple España](https://styles.refero.design/style/c9cabb96-32fa-4896-837a-f2497ce1c856) entry puts `linear-gradient(...)` in the Primary Ink row with a foreground role. A gradient value cannot be used for the `color` property; the adapter must separate text colour from the decorative background layer.

Refero's overall Apple also has canvas `#f5f5f7`, max-width 1440px and section gap 64px; Tracy has a white canvas, max-width 1024px and desktop section spacing 100px. Different page scopes may explain part of the difference; there is no basis to declare one source right for every Apple page. ElevenLabs and Notion also differ on canvas, though their action colours partly overlap.

The crawls are kept as research evidence. The next full import rests on the separately confirmed agreement; its basis and scope are recorded in [IMPORT-NOTE.md](../../vendor/tracy/refero/IMPORT-NOTE.md). Do not apply OpenDesign's Apache licence to Refero data. The snapshot is not yet wired into the product or distributed with the Tracy image.

## Proposed improvement trial

Pick **Apple, Linear and ElevenLabs** for the trial: all three have a current Tracy entry and a Refero entry in the sample. Build each system from the same brief, the same content and the same licensed images, to separate design effects from content.

1. Keep the OpenDesign raw data intact. Create a Tracy-owned supplement with a source URL and measurement status per field; do it through the upstream/fork path or a Tracy-managed library source per [ADR 0012](../adr/0012-design-systems-served-from-one-place.md) and [ADR 0013](../adr/0013-community-brand-store.md).
2. Add typography by role, image rules, section rhythm and component radius to the adapter. Only change the schema when the engine actually consumes a field; do not add fields that are stored and then ignored.
3. Build a fixture with hero, feature, pricing, testimonial, form and footer; state which components were invented to complete the brief. Compare before/after at 390, 768 and 1440px, on the themes declared as supported.
4. Check real font loading, horizontal overflow, text/background colour, focus and hover states; review by eye section variety, light/dark rhythm, image ratios and radius consistency. Confirm through a real build that the agent reads and uses the image/layout rules.
5. Expand the catalogue only after the three samples improve quality over the baseline. Keep the step of shortlisting from the catalog and then reading 1–3 systems, so the whole library never goes into the prompt.

The output of this survey is crawl data and improvement proposals. No token, adapter, customer theme, UI switch or deployment has been changed.
