# Visual review — shots + interaction + computed px, on four axes

> Read before running `visual-qa.mjs`, and before concluding "matches the source" in P3/P7. The method
> is carried over from the JoomlArt T4 skill (`review-verify-method.md`, `recurring-defects.md`, the scanner set
> `scripts/review/`) into this kit: the same lessons already paid for there, the same rules, only the tools differ. This file
> says **how to measure**; the process (tiers, roles, notes, Fast Gate, pass conditions) is in
> [qa-lenses.md](qa-lenses.md) — nobody **signs** `visual-review`, `qa.mjs` checks five things from files.

**The most expensive lesson:** every defect that ever slipped through a "verified" run was **invisible to a computed-style
probe** — only looking at the shot or touching the element showed it. A green probe on a broken render is a **FAIL**.
Conversely, a shot that "looks right" with drifting measurements is also a defect — find out which side is lying before fixing.

## Four tiers, fixed order, no tier skipped

```
1. light-desktop  →  2. light-responsive (768; narrowest)  →  3. dark-desktop  →  4. dark-responsive
```

Light passing does not imply dark; desktop does not imply mobile; mobile-light does not imply mobile-dark.
Tier 4 is the one most often skipped — never skip it. The order is that of `visual.stages` in the contract
(qa-lenses.md §2); within a tier `tools/visual-qa.mjs` orders `variants[]` widest first, light before dark.
A source without a frame for a tier (no mobile, no dark) **does not exempt** that tier: the tier is a
requirement of the output; only the comparison basis changes (table below).

## List components BEFORE measuring

Before checking a page, list **every** component top to bottom: logo, each nav item, **each button**,
eyebrow, heading, body, each card, icon, badge, input, divider, footer column. One verify line per
component. No sampling: an earlier run reported "every section PASS" while **every button** was
wrong — because the buttons had never been listed. In the contract this list is `design.rules[]`; the
"forgot a component" hole is plugged by the machine with `design.coverage[]`: every visible element matching a coverage selector
that no rule measures on all required properties → `unclassified-element`, exit 1.

## Each axis = three checks, in order

- **A. Shot (perception).** `visual-qa` captures `shots/<page>--<variant>.png`; the lens looks at it next to the source render
  at the same size (`evidence/source/`). Look for: overlays/seams/bars covering content; logos/images/icons **not
  changed** in dark; colour bleeding; clipping; misalignment; transparency where a surface should be; full-width strips **cut**
  on both sides; double/thick dividers; sections shorter/taller than the design; mockups/panels of the wrong size; odd borders/shadows around
  images exported from the design; halo/gradient bleeding outside a CTA card; an empty strip between a sticky header and the masthead;
  unreadable `<pre>` in dark; double ticks in a checklist.
- **B. Interaction.** Hover/focus/click **every** interactive element. Hover must not **jump** position/size
  (`scan:hover-jump` measures `getBoundingClientRect` at rest vs hover — only bg/colour may change). The focus ring
  must be drawn by a **real click** (a synthetic `el.focus()` hides the shorthand/longhand trap). **Open every
  reveal state and check it in dark**: off-canvas at every level, mega panel, accordion, tab, dropdown,
  modal. **Mega-menu travel test** (`tools/mega-hover.mjs`): hover the trigger → move **straight down** in
  4 px steps into the panel → across to a link → the click must navigate; Escape closes and **returns focus** to the
  trigger; clicking outside closes. A panel opened by forcing a class only proves *style*, not that
  the mouse *can get in* — Northgate 13/09: a 26 px gap; image local.5: Radix anchor 0 px.
- **C. Computed-px certification.** Only now read computed style + box model and compare: colour
  (exact rgb, ±8/255 when comparing **two-sided** with the source because of antialiasing/webfonts), spacing/border/radius
  ±0 (sub-pixel 71.99 vs 72 is fine; > 1 px is a FAIL), typography (family — **mono** included — size,
  weight, line-height, letter-spacing), icons (right glyph, inline SVG, not replaced by an icon font),
  `scrollWidth == clientWidth` (no horizontal overflow).

A component is ✅ only when **A + B + C pass on all four tiers.**

## Comparison basis by source type — measure two-sided when possible, don't hand-write expectations

The contract separates **what the source provides** (`source.kind`, `source.parity`) from **what the output must meet**
(`variants` + `visual.stages`, `locales`, `pages` including the 404 page, `states`, `designSystem`). A missing
reference never becomes `not-applicable`; it only changes the comparison basis and is recorded in the report
(`axis.parity.basis`):

| Source | `source.kind` / `parity` | Comparison basis | Recorded in the report |
|---|---|---|---|
| Static HTML, Claude Design canvas, renderable URL | `html` · `canvas` · `url` / `two-sided` | source shot at the same size **+** two-sided computed measurements (`design.parity`, `--source-site`) at the same viewport/theme/query/state | `basis: two-sided`, number of pairs compared |
| Frames/images/spec exported from Figma, Pencil, or another source | `frames` / `declared` | frame shot (`--source-dir`, file hashed in `source.files`, disposition `reference`) **+** numbers/tokens declared in `design.rules` / `visual-contract.md` with provenance | `basis: declared`, frame name |
| Output state without a reference (derived page, 404, tier without a frame, open state) | — | output requirements + design system (`designSystem`, coverage, scanner) | `basis: requirements-only`, the lens writes "no source to compare" |

`design.parity` + `--source-site`: `visual-qa` reads **the same logical element** on the source render and on the
site, then `diffSnapshots` (visual-lib) with tolerance. Hand-writing `design.rules` from the source is where
contract-authoring errors come from (Business 13/09: the `btn-primary` rule caught the band buttons too, the `h1` clamp inverted, the language
prefix) — numbers measured from the source are not. With `frames`, the numbers in `design.rules` **are** the reference: record their provenance
(which frame, which token) in `visual-contract.md`, and the report states that the comparison is against declared numbers, not two-
sided. **There is no adapter reading live Figma/Pencil yet**: frames must be exported to files and listed in
`source.files` — anything more is new work, declare it rather than pretend it was compared.

## Mechanical scanners (`tools/visual-scan.mjs`) — run on every page, every theme

| Command | Catches the defect class | Notes |
|---|---|---|
| `white` (dark) | `[DARK-STUCK-LIGHT]` surface/card/badge/input still white in dark | frosted glass over an image may be right — look before repainting |
| `darktext` (dark) | near-black text on a dark background (meta, mega heading, byline `<strong>`) | |
| `contrast` | text below the WCAG threshold (default 3.0) | filter the "by design" set (accent buttons, coloured badges) — same in light means not a defect |
| `border` (dark) | borders brighter than luma 80 on a dark page | |
| `seam` | two 1 px lines of two elements ≤ 2 px apart → read as a thick/double seam | |
| `hover` | hover moves the box; hover in dark noticeably less visible than in light | dark **mirrors** light: equally bad in light = by design |
| `toggle` | the real switch changes the surface, keeps the choice across reload, can switch back | don't force the theme here |
| `probe`/`snapshot`/`diff` | read numbers, take a snapshot, two-sided diff | |

**A scanner printing OK may not have looked at anything.** Every command prints `examined` and **fails** when < 20 elements —
a page that did not render giving a "clean" result proves nothing. Read `examined` before trusting it.

**Flip-and-read returns the old value** for properties with a transition (`border-color` often) — the library
waits 120 ms after forcing the theme; when in doubt, read again.

## Recurring defect classes — check on EVERY component, how to probe included

| Tag | Probe |
|---|---|
| `[DARK-STUCK-LIGHT]` | `visual-scan white --theme dark`; don't trust "there is a dark rule" — read the real `background-color` |
| `[NESTED-STATE-NOT-DARKED]` | **open** the panel/drawer/accordion with a real click before probing dark; the closed state passes while the open panel is a white box |
| `[DARK-LOGO/IMG-NOT-FLIPPED]` | **shoot** every logo/mark in dark — a colour probe does not look inside `<img>` |
| `[DARK-ACCENT-NOT-FLIPPED]` | diff the light `:root` tokens vs the dark block; probe one accent element in dark |
| `[FULL-BLEED-CUT]` | `getBoundingClientRect` of the band strip: `left==0 && right==innerWidth`; shot in dark |
| `[CANVAS-CONTENT-CAP-LOST]` | a left-aligned heading on a canvas page has `left ≈ 0` (not the ~150 reading margin) → clip; band-edge probe PASSes while the render is broken |
| `[SECTION-PADDING-WRONG]` | computed padding-top/bottom vs the source, not by eye; a module that pads itself inside a padded section = double padding |
| `[GAP-WRONG]` / `[CARDS-TOUCHING]` | measure the **real** gap between two adjacent items, don't trust the value in the CSS |
| `[BORDER-DOUBLED/CUT/WRONG]` | `visual-scan seam`; walk the element + ancestors + next sibling; compare thickness/length with the source |
| `[FIELD-WIDTH-COLLAPSE]` | `getBoundingClientRect().width` of the form/card/input on form pages — card ≪ container or input = 240 |
| `[SEAM/OVERLAY-MASK]` | shot; check z-index/stacking after a position change |
| `[STICKY-HEADER-CONTENT-GAP]` | a page opening with a full-bleed masthead: probe the main region's padding-top (want 0); shot the header↔masthead seam |
| `[ICONFONT-NOT-VECTOR]` | grep `fa-`/icon font in the rendered HTML; every icon must be an inline SVG with the right glyph |
| `[FONT-MONO-MISSING]` | computed `font-family` on the eyebrow/meta/code/badge the design sets in mono |
| `[MUTED-COLOR-LEAK]` | probe exact rgb on caption/sub/meta — not "looks grey" |
| `[PRIMARY-LINK-LEAK]` | secondary links must not carry the brand colour unless the source says so |
| `[HOVER-JUMP]` | `visual-scan hover` / axis B |
| `[MEGAMENU-HOVER-DEADZONE]` | `elementFromPoint` on the panel rect returns the hero → compositing (`will-change`/`transform` on the header); `gapPx > 0` with no bridge → geometry. `mega-hover.mjs` prints both |
| `[DEAD/MALFORMED-LINK]` | click the real link; the URL must be a clean route |
| `[DESKTOP-RULE-LEAKS-MOBILE]` | at 390 probe the properties set for desktop; desktop rules must be wrapped in `@media (min-width:…)` |
| `[STRICT-PER-FRAME-MOBILE]` | diff the **structure** of the mobile render against the source's mobile frame (count/shape of nodes), not just "fits the frame" |

## Images: count from the rendered source, not `<img>` in the HTML

Lesson of 14/09: six images on three kit pages (newsletter, slides, style guide) were missing from the site, and the all-pages gate run did not see it —
the browser gate only checks images that **are** in the DOM (decode, MIME, origin), the contract did not say which images must be present, and the Claude
Design source draws images with `<image-slot src>` inside a shadow root, so the source-side `<img>` count was 0; the only signal was the
placeholder text graded as "low contrast". From now on `design.images = {scope, sourceSlot, placeholder}`: `visual-qa` counts **decoded**
images on the rendered source page (custom slots included) and on the site; fewer on the site → `image-missing` with the slot id;
every `.photo-placeholder` still visible → `image-placeholder`. Images are content: a missing one is a seed/media-map defect, not a CSS defect.

## Exceptions must cite a decision

`design.exceptions[]` in the contract: `{kind, match (regex over element/rule/selector/state), reason, decision}`.
Only with **both** `reason` and `decision` (pointing at an existing decision: `visual-contract.md §…`, a DECISIONS
line, Lee's words) does a finding move to the "Accepted exceptions" section of `VISUAL.md`; a bare reason is not
an approval, and no exception is written just because a test is red. An exception never drops coverage or turns off a page.
Scanners deliberately ignore: borders the same colour as the text (underline), the background of a decoded `<img>` (the image pixels cover the background).

## Verify-the-verifier

Subagents often report a false "PASS". The run owner re-shoots + re-probes 1–2 components of each unit themselves (and opens
one reveal state in dark) before trusting a lens. Nobody signs `visual-review`: `qa.mjs`
rereads each tier's last run and checks five things (qa-lenses.md §7) — every shot with a consumer is in the
right lens's `## Opened`, no open todo, no machine finding, closer ≠ fixer, files
unchanged since the receipt was written. A Fast Gate run (`scope: fast-gate`) may not be cited as the last run
of any tier.

## Red flags — not done

- Verified light, then "assumed" dark/mobile are the same. → Measure every tier.
- The source has no mobile/dark frame, so that tier is "exempt". → The tier is an output requirement; change the comparison basis, don't drop the tier.
- Read computed values without shooting, without hovering. → A + B before C.
- Probed an accordion/drawer/dropdown closed, never opened it in dark. → Open every reveal state.
- Ticked ✅ from a subagent's summary. → Re-probe yourself.
- Lee sees a visible defect after you said "done". → The sweep lacked perception/interaction; widen it.
