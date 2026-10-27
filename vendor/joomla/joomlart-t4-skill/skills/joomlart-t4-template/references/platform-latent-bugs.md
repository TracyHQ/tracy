# T4 / Joomla / Bootstrap — Platform-Level Latent Bugs (self-improving knowledge base)

> **Cross-cutting KB — pre-flighted in P0d, consulted in P1 & P3.** Render-time forensics (symptom ·
> root cause · fix · pre-flight). Build-time *prevention* of the same mechanisms lives in the builder
> skill's `references/gotchas.md` (cross-referenced per entry — a build-trap and its QA-detection point
> at each other). Grows per `review.md` §"Feed the catalogs forward".

> **What this is.** A portable catalog of bugs that originate NOT in any one template's design work but in
> the **platform layer** — the JoomlArt **T4 builder**, **Joomla core** component output, **Bootstrap 5**
> defaults, the **js-offcanvas** vendor, **FontAwesome** (T4's default icon font), and common **extensions**
> (mod_menu, mod_ja_acm, com_content/com_tags/com_finder/com_users overrides). Because they live in the
> platform, **every new T4 template will hit the same bugs** unless you pre-empt them. This file is the seed
> for a future dedicated **review skill**: lift it in wholesale, and have the skill check every entry on each
> new build.
>
> **Self-improvement protocol (how this file grows):**
> 1. While reviewing any template, when you find a bug, ask: *is the root cause in the design/template work,
>    or in a base rule / vendor default / extension output that ships the same on every T4 site?*
> 2. If platform-level → add/ә update an entry here (not just the per-template findings log). Mark
>    **Confidence: CONFIRMED** (seen + root-caused in ≥1 build) or **SUSPECTED** (looks systemic, verify next time).
> 3. Each entry carries a **fix recipe** and a **pre-flight check** (probe to run on a fresh template before
>    you even start, so the bug never reaches review).
> 4. Next template: run all CONFIRMED entries' pre-flight checks first → fix proactively → far fewer review cycles.
>
> First harvested during the **JA Stratum** Pencil→T4 review (2026-06). Cross-reference: per-bug evidence in
> `build-docs/REVIEW-FINDINGS.md`; recurring-pattern tags (e.g. `[DARK-STUCK-LIGHT]`) are shared between files.
>
> **SUBAGENT INSTRUCTION (orchestrator includes this in every dispatch):** when you fix a bug, judge whether
> its root cause is **platform-level** (a base T4/Joomla/Bootstrap rule, a vendor default like js-offcanvas
> or FontAwesome, or extension output that ships identically on every T4 site) vs design/template-specific.
> If platform-level **and likely to recur on other templates → ALSO append/update an entry in THIS file**
> (not only `REVIEW-FINDINGS.md`): layer · symptom · root cause · fix recipe · pre-flight check · CONFIRMED/
> SUSPECTED. **Prioritise the HARD-TO-DETECT, easily-missed ones** (only-visible-in-dark, only-on-a-nested/
> hover state, silent tooling fallbacks, specificity battles) — those are exactly the ones a future build
> will re-ship if they aren't written down. Keep entries terse and portable (cite the base rule, not just the
> Stratum file). This is how the catalog pays for itself: next template, run the pre-flight checks first.

Layers: **CORE**=Joomla · **T4**=template framework · **BS**=Bootstrap 5 · **OC**=js-offcanvas vendor ·
**FA**=FontAwesome · **EXT**=extension (mod_menu/ACM/com_*). Severity: 🔴 breaks design · 🟠 visible-off · 🟡 subtle.

---

## Index (unique Pn → title)

> Numbers are unique and stable. During the Stratum review several agents independently reused
> P19–P23 for DIFFERENT bugs; those collisions were resolved in the final consolidation pass by
> renumbering the LATER duplicate of each to P31–P36 (content unchanged). The **Old #** column
> records the pre-consolidation number a duplicate used to carry, so older `REVIEW-FINDINGS.md`
> prose that cites e.g. "P19 literal-`\n`" or "[PLATFORM P23]" still resolves. The FIRST holder of
> each colliding number kept it.

| Pn | Section | Title (short) | Old # |
|----|---------|---------------|-------|
| P1  | A | Base CSS specificity beats darkmode.css → dark surfaces stuck light | — |
| P2  | A | Reveal-on-interaction children never dark-checked | — |
| P3  | A | site_logo is an `<img>` with hardcoded fill → never recolors in dark | — |
| P4  | A | Section band rhythm via `color_pattern`; module css bg can defeat it | — |
| P5  | B | `.text-muted` leaks where design wants a specific grey | — |
| P6  | B | `.font-mono` utility does not exist → mono eyebrows fall back to sans | — |
| P7  | B | Stray BS spacing utilities break designed gaps | — |
| P8  | B | Card-grid gutter is `--t4-gutter-x` (32px), NOT `--bs-gutter-x` | — |
| P9  | C | Push-mode transform hardcoded to -300px, independent of drawer width | — |
| P10 | C | Drawer side is `oc_rightside` in nav JSON, not CSS | — |
| P11 | C | Base `.close span` boxes the × off-centre | — |
| P12 | C | Base drilldown rules outrank overrides; `.btn-toggle` floats chevrons | — |
| P13 | D | FontAwesome default; lucide-spec'd icons get fa-* glyphs | — |
| P14 | D | `.c-button:hover .c-button__text` 180° matrix → hover-jump | — |
| P15 | E | `mod_menu` default markup is plain links, not designed icon-box rows | — |
| P16 | E | Megamenu renders from the DB, not files | — |
| P17 | E | T4 bundles CSS/JS into `media/t4/optimize/<hash>` | — |
| P18 | E | Pencil MCP silently falls back to active editor on a bad path | — |
| P19 | A | darkmode.css targets class names T4 never renders → dark bands not full-bleed | — |
| P20 | A | Section padding DOUBLES (self-padded ACM inside `sec-spacing-lg` section) | — |
| P21 | A | A band's FILL differs desktop vs mobile → needs scss + darkmode mobile override | — |
| P22 | A | Design DOC (.md skeleton) can contradict resolved `.pen` → trust the .pen | — |
| P23 | A | Dark token block omits accent companions → accents render light shade in dark | — |
| P24 | D | Inverted-button band guard targets `color-blue` + only `.btn-primary` | — |
| P25 | D | `.t4-palette-*` hijacks plain HEADING tags (h1–h4), not just anchors | — |
| P26 | E | Hand-built "Home" crumb via `Route::_('index.php')` → current view's URL | — |
| P27 | E | `com_finder` search FORM submit lands on Home — broken search | — |
| P28 | E | `com_finder` autosuggest wraps input in `.awesomplete` → flex bar collapses | — |
| P29 | E | Component views render inside `.t4-section-inner.container` → not full-bleed | — |
| P30 | E | DB/HTML inline `style="font-size"` can't be eased responsively by stylesheet | — |
| P31 | E | Editing article/module HTML via `mysql -N` round-trip corrupts newlines to `\n` | was P19 |
| P32 | E | T4/JA license guard fatals whole site on default HTTP port (:80) under DDEV | was P20 |
| P33 | E | `mod_breadcrumbs` labels active MENU ITEM, not page — mislabels list views | was P21 |
| P34 | E | `.t4-palette-{color} a` (0,2,0) hijacks every anchor inside a palette band | was P22 |
| P35 | E | Archive month/year filter queries a DIFFERENT date column than override groups | was P23 |
| P36 | E | `com_contact`/`com_users` form-field rendering ships 4 latent layout/dark bugs | was P21 |
| P42 | E | `plg_system_privacyconsent` force-redirects un-consented logged-in users to profile-edit on EVERY request → profile DISPLAY unreachable | — |
| P43 | A | T4 `.t4-masthead-title{padding:0 284px;font-weight:400!important}` collapses/de-emphasises canvas page headings | — |
| P44 | D | Bootstrap bare `.btn-secondary` leaks BS grey/indigo on standalone/auth pages | — |
| P45 | E | T4 author router: `view=author` needs an `id` (else 404) + Authors-index link needs `layout=list` AND **`gid[]=<group>` IN THE LINK** (else `implode()` fatals — see the P45b addendum) | — |
| P46 | E | MySQL `#__content.fulltext` is a reserved word → must backtick in all PDO writes | — |
| P47 | E | `com_finder` highlighter: removing `#highlighter-start/end` markers → `highlight.min.js` null-deref | — |
| P48 | E | `com_tags` derived joins need `content_item_id` not `core_content_id` (0 for un-synced) + don't load `tag(s)-default` JS when filter form removed | — |
| P49 | E | `com_content` categories index self-links categories lacking a menu item (`getCategoryRoute` fallback) | — |
| P50 | E | A pagination layout-override PHP parse error fatals EVERY list view → always `php -l` it | — |
| P51 | E | `display_offline_message=1` (default) makes `offline_message` truthy → `$msg ?: $branded` never shows branded copy | — |
| P52 | E | J6 enhances selects with Choices.js (not Chosen); `.choices__inner`/`--dropdown` need explicit dark overrides | — |
| P53 | A | `:first-of-type`/`:last-of-type` never match the first/last GROUP on a mixed-`<section>` page (pseudo keys on element type) | — |
| P54 | E | Header CTA links render as BARE children of `.t4-header-r` (no `.custom`/`.mod-custom` wrapper) → standard mobile-hide rule misses → overflow/overlap logo at ≤mobile | — |
| P55 | E | `Text::_('KEY') ?: $fallback` never falls back — a MISSING lang key returns the truthy UPPERCASE key, so raw `TPL_*` keys render on screen | — |
| P56 | E | Persistent `will-change`/transform on the HEADER composites it so its dropdown can't paint/hit-test over later sections → mega items vanish/unclickable (detect via `elementFromPoint`, NOT a hover bug) | — |
| P57 | E | T4 module-chrome class draws a full-width band gradient + white radial `::before` glow behind a CARD-style CTA → stray glow leaks onto the dark page | — |
| P58 | T4 | T4 base `.t4-main-body{padding-top:Npx}` leaves a blank band between the sticky header and a full-width masthead on inner pages | — |
| P59 | T4 | `{loadposition}` ACM stacks on marketing pages get faint seam borders/margins from T4 base `.moduletable` unless the token uses `,none` chrome | — |
| P60 | BS | Bootstrap `<pre>` stays near-white under `data-bs-theme=dark` → article code blocks unreadable gray-on-white in dark | — |
| P61 | — | Doubled check glyph: inline lucide `<svg>` tick AND CSS `li::before{content:"✓"}` both render | — |
| P62 | T4 | Canvas article with `layout=fullwidth` in menu link renders fullwidth.php regardless of `tsid=0` (no blob) | — |
| P63 | T4 | `tsid=0` list view: `layout=` link picks the override (no blob) but sidebar/CTA POSITIONS come from the style's layout JSON → silently missing sidebar/bands | — |
| P64 | EXT | `mod_tagspopular` renders chips on `<li>` w/ class `.tagspopular`/`.mod-tagspopular` (NOT `.mod-tags-popular`) → dark overrides keyed to `.mod-tags-popular a` are DEAD → light chips in dark | — |
| P65 | EXT | `mod_menu`/module `showtitle=1` footer column leaks admin title (`[Tpl] Footer – Product Links`) as visible heading | — |
| P66 | T4 | Dark bg override for social/icon-tile targets one class variant but ACM renders another → tiles stuck white in dark | — |
| P67 | CORE | `str_ucm_content.core_catid` stale when SQL-seeded → `getTagItemsQuery()` category-published check returns 0 items for ALL tags | — |
| P68 | T4 | T4 standalone page (offline.php/error.php) crashes "undefined method stdClass::get()" on onBeforeRender — typelist Registries never initialized | — |
| P69 | T4 | Per-page auth.css bundled BEFORE template.css in T4 optimize → same-spec overrides lose cascade (use !important) | was P65 |
| P70 | EXT | Blog sub-category article-count: #__content.catid is the CHILD; a parent `catid=N` count query returns 0 | was P66 |
| P71 | CORE | `publish_down='0000-00-00 00:00:00'` (not NULL) fails J6 archive model IS NULL/>=NOW filter → seeded archived articles invisible | was P67 |
| P79 | EXT | ACM comparison-table dark thead selector `.acm-cmp-thead tr` is dead — `.acm-cmp-thead` IS the `<tr>`, not an ancestor; thead bg never flips in dark | — |
| P81 | T4 | `tmpl=component` / com_wrapper embed renders via `component.php` which SKIPS index.php's dark-resolver + template.css → embedded body stays light & body-bg flips white in dark | — |
| P82 | T4 | Stock `.t4-header`/`.t4-footer` SECTION (min-height + `align-items:center` + light `.bg-light`) shows a 1px+ LIGHT seam above/below a permanently-DARK chrome block nested inside it | — |
| P37 | T4 | T4 "Site Settings" live in `etc/site/<layout>.json` per layout, NOT `#__template_styles.params` | — |
| P38 | EXT | `com_users.user` custom fields render on the PUBLIC registration form | — |
| P39 | EXT | `htmlspecialchars($item->title)` double-encodes menu titles (`&` → `&amp;amp;`) | — |
| P40 | OC | Drilldown `.sub-menu-back` row paints near-white in dark (js-offcanvas default) → white-on-white back-bar | — |
| P41 | CORE | Joomla `Email Cloaking` plugin wraps a designed FORM's input/button → button label dropped, control collapses | — |
| P73 | T4 | Megamenu COLUMN order + item membership render from the TYPELIST nav JSON `mega_settings`, NOT DB `navigation_mega_settings` | — |
| P74 | T4 | Block `.html` layouts are `file_get_contents`'d → inline `<?php ?>` does NOT execute (only `<jdoc:include>` is parsed) | — |
| P75 | T4 | Module chrome style must be the PLAIN chrome name (`JAxhtml`), not `<tpl>-JAxhtml` — ⚠️ CONFLICTS with builder gotcha #22; verify per build | — |
| P76 | T4 | Layout breadcrumb row ships `device:"xs"` (mobile-only) + matches the module by TITLE → breadcrumbs invisible on desktop / break on rename | — |
| P77 | T4 | Mega/dropdown panel links use `--mainnav-link-color` (literal, never flips) → near-black items on the dark panel | — |
| P78 | EXT | JA ACM `helper->getRows('items.title')` collides with a sibling scalar of the same leaf name → empty list reports 1 PHANTOM row | — |
| P80 | T4 | Hidden menu items for component views default to `tsid=0` → use home ACM layout → component output silently discarded | — |
| P83 | T4 | `site-settings` is a stub `stdClass` at index.php/standalone time + GUI saves to `local/etc/site/` → dark settings read the wrong source | — |
| P84 | CORE | Joomla admin loads the SITE-LEVEL `language/.../tpl_<name>.ini` BEFORE the template's own → admin shows raw dark constants | — |
| P85 | T4 | Template-shipped `params/typelist-site.xml` omitting the `site-other` legend hides the merged dark fields in admin | — |
| P86 | G | T4 ships a non-empty default `site_logo` → an override honouring it renders a placeholder logo | was P36 (dup) |
| P87 | EXT | JA ACM `helper.php` SILENTLY falls back to `tmpl/style-1.php` when the configured layout file is missing → the WRONG design renders, with no warning | — |
| P88 | EXT | JA ACM layout picker scans `tmpl/*.php` → any helper/partial left in `tmpl/` becomes a selectable "layout" | — |

---

## A. Dark-mode / theming (the biggest recurring class)

### P1 — Base CSS specificity beats `darkmode.css` → dark surfaces stuck light  🔴 CONFIRMED  `[DARK-STUCK-LIGHT]`
- **Layer:** T4 + BS. **Where:** any surface (cards, drawers, dropdown/mega panels, form cards, modals).
- **Symptom:** element has a darkmode.css rule but renders `#fff`/`#F8F9FA` in dark anyway.
- **Root cause:** base T4/BS selectors (often `body .x`, component classes, or `!important`) outrank the
  darkmode overlay's plainer selector. The overlay "exists" but never wins the cascade.
- **Fix recipe:** scope the dark rule at least as specifically (`body.dark …` / `[data-bs-theme=dark] …`),
  or token-drive the value so it flips automatically; verify with a **computed bg probe in dark**, not by
  "a rule exists". Tokenise borders too (`$border-color`→`var(--token)`) — high-specificity base border rules won't flip.
- **Pre-flight check:** in dark, sweep `getComputedStyle(el).backgroundColor` on every surface type; any
  `rgb(255,255,255)`/`#F8F9FA` = fail.

### P2 — Reveal-on-interaction children never dark-checked  🔴 CONFIRMED  `[NESTED-STATE-NOT-DARKED]`
- **Layer:** OC + BS. **Where:** off-canvas drill sub-levels, megamenu flyout panels, accordion bodies, tab
  panels, dropdown menus, modals, tooltips/popovers, select option lists, date pickers.
- **Symptom:** top-level container is dark, but the nested/expanded state is a white box in dark.
- **Root cause:** the dark fix scoped only the closed/top container; the nested panel (e.g. js-offcanvas
  drilldown is a BS `.dropdown-menu{background:#fff}` with `.sub-menu-back{background:$gray-100}` + `#374151`
  rows + light dividers) was never opened, so never styled.
- **Fix recipe:** re-skin every nested panel with the same theme tokens; **MANDATORY:** open each nested
  state with a **real trusted click** (programmatic `el.click()` on a vendor-JS toggle only navigates — use
  Playwright `browser_click` on the actual toggle/chevron), screenshot the OPEN state in dark, then probe.
- **Pre-flight check:** enumerate every reveal-on-interaction widget; open & dark-probe each.

### P3 — `site_logo` is an `<img>` with a hardcoded fill → never recolors in dark  🟠 CONFIRMED  `[DARK-LOGO-NOT-WHITE]`
- **Layer:** T4. **Symptom:** wordmark/logo stays dark-navy in dark mode.
- **Root cause:** logo shipped as `<img src=…svg>` whose `<text fill="#0A0E1A">` is baked in; CSS can't recolor an img.
- **Fix recipe:** render the brand as **inline SVG + a `<span>` wordmark** coloured by a token (the header
  `element/logo.php` pattern), so the wordmark uses `--heading` and flips. Apply to header, footer, off-canvas logos.
- **Pre-flight check:** in dark, screenshot every logo instance; a colour-probe won't catch an `<img>` — must look.
- **That fixes the template's OWN mark only.** An owner's bitmap logo (a PNG from the admin or from Tracy's
  "Customize your site") cannot be recoloured: it comes as the `site_logo` / `site_logo_dark` pair in
  `.d-light` / `.d-dark`, the name as text when no dark logo is set — never a CSS `filter` or `content: url()`
  (`customize-your-site.md`, `quickstart/brand-ready.mjs`).

### P4 — Section band rhythm driven by `color_pattern` in `etc/layout/<style>.json`; module css bg can defeat it  🟠 CONFIRMED  `[LIGHT-BAND-ALLWHITE]`
- **Layer:** T4 + ACM/module css. **Symptom:** light sections all white where design alternates bg↔elevated;
  or a band that's elevated in light stays `bg` in dark.
- **Root cause:** band colour = `color_pattern` ('gray'=elevated, 'blue'=primary, ''=bg) per section in the
  layout JSON — easy to assign to the wrong section. AND a module's own css `background` can override the
  `.t4-palette-*` class, especially in dark.
- **Fix recipe:** set `color_pattern` per the design's bg→elevated rhythm; ensure each module's css bg uses
  the matching token in BOTH themes. Sweep computed band bg top-to-bottom vs the design in light AND dark.

### P19 — `darkmode.css` written against class names T4 NEVER renders → dark bands not full-bleed  🔴 CONFIRMED  `[DARK-PALETTE-WRONG-SELECTOR]`/`[DARK-SIDE-CUTOFF]`

- **Build-time:** builder gotcha #58 (palette wrappers hardcode band colors) — author full-bleed dark band selectors at build.
- **Layer:** T4. **Where:** every full-width section band (any page using section color bands).
- **Symptom:** in DARK, a colored band paints only on the centered container (~1288px) with dark **side gaps**
  (~76px each edge) / a mid-page seam; light looks fine (T4 core paints the full-width palette in light).
- **Root cause:** T4 emits section band classes as **`t4-palette-gray` / `t4-palette-blue` / `t4-palette-dark`**,
  but the darkmode overlay targeted guessed names like `.t4-section.color-gray` / `.color-blue` — which never
  match — so the dark bg never applied to the full-bleed section element; only an inner container got colour.
- **Fix recipe:** target the ACTUAL classes `.t4-palette-{gray,blue,dark}` (with `!important` vs core) so the
  full-width section element flips in dark. **Verify by measuring the band's `getBoundingClientRect()` left≈0
  / right≈viewport in dark** + a screenshot — a colour probe on an inner node won't reveal the side gaps.
- **Pre-flight check:** in dark, for every band: `rect.left==0 && rect.right==innerWidth` and `scrollWidth==innerWidth`.

### P20 — Section padding DOUBLES: self-padded `.acm-*` module inside a section that also carries `sec-spacing-lg`  🟠 CONFIRMED  `[SECTION-HEIGHT-SHORT]`(inverse: too tall)
- **Layer:** T4 + ACM. **Symptom:** content sections ~2× too tall (e.g. 160–194px top offset where design is 80).
- **Root cause:** the ACM module already ships `padding:80px 0`, and the layout JSON wraps it in a section
  ALSO carrying `sec-spacing-lg` (=`$spacer*6`=96px) → the two stack.
- **Fix recipe:** pick ONE owner of the vertical rhythm — drop the redundant `sec-spacing-lg` from sections
  whose ACM module is already self-padded (keep it only where the module isn't). Verify computed section
  padding == design (e.g. 80/64/88 desktop, 40/36/48 mobile). Also: `sec-spacing-lg` is a SHARED token — if
  you retune it, re-check every page/home-layout that uses it.

### P21 — A band's FILL differs between desktop and mobile frames → needs a scss override AND a darkmode.css mobile override  🟠 CONFIRMED  `[LIGHT-BAND-ALLWHITE]`/`[DARK-STUCK-LIGHT]`
- **Layer:** design-reproduction + T4. **Where:** any section whose `.pen` DESKTOP frame and MOBILE frame have
  different `fill` (e.g. Stratum stats band: desktop `$elevated` grey, mobile `$primary` blue — confirmed on
  BOTH About and Features). Easy to miss because reviewers check desktop OR mobile, rarely both for band color.
- **Symptom:** you fix the band color for desktop (e.g. elevated), and the mobile frame's different color (primary)
  silently disappears — OR vice-versa. In dark it's worse: the blanket dark band rule (`[data-bs-theme=dark]
  .stratum-band--elevated{#0F1525}`) repaints the mobile band, so the mobile-primary override must ALSO be added
  to darkmode.css at the same breakpoint, or the mobile band goes dark-elevated in dark instead of staying blue.
- **Root cause:** band color is one class (`--elevated`/`--primary`) applied at all widths; the design wants it to
  flip at the mobile breakpoint. A single class can't express "elevated desktop, primary mobile" — you need a
  `@media (max-width:767.98px){ background-color: primary }` override, plus a matching dark override (because the
  generic dark band rule has equal-or-higher specificity and loads in a different file).
- **Fix recipe:** scope `@media(max-width:767.98px){ .stratum-<band>{ background-color:var(--primary); KPI/text→white } }`
  in the page scss block; AND add `@media(max-width:767.98px){ [data-bs-theme=dark]/html.t4-dark .page--x .<band>{
  background-color:#0062FF !important; …white text } }` to darkmode.css. Verify the band's computed bg at 390px in
  BOTH light AND dark equals the primary, not the elevated dark.
- **Pre-flight check:** for every band, compare the desktop `.pen` frame `fill` to the mobile `.pen` frame `fill`;
  if they differ, you owe a mobile scss override + a mobile darkmode override. Also re-probe at 390px in dark.

### P22 — Design DOC (page .md skeleton) can contradict the resolved `.pen` frame → trust the `.pen`  🟡 CONFIRMED (process)
- **Layer:** process / design-reproduction. **Symptom:** the page's prose skeleton (`pages/<x>.md` §"Skeleton")
  says one thing (e.g. "Stats band — primary") while the actual resolved `.pen` frame node says another (fill
  `$elevated`). The builder follows the doc; review against the `.pen` flags it as a "bug".
- **Root cause:** the `.md` design docs are hand-written summaries that drift from the canonical `.pen` document;
  the `.pen` (read via `batch_get`/`get_screenshot` on the proven file) is the single source of truth.
- **Fix recipe:** when doc and `.pen` disagree on a measurable property (color/size/pad/fill), follow the `.pen`
  and record the conflict + decision in the findings log so the orchestrator can reconcile. (Mirrors the earlier
  Stratum "GRANULAR-PLAN ERRATA" where the granular plan's eyebrow/value sizes were wrong vs the `.pen`.)
- **Pre-flight check:** never edit purely from the `.md`; always confirm the property on the resolved `.pen` node.

### P23 — Dark token block flips surfaces/text/borders but SILENTLY OMITS the accent companions → accents render their LIGHT shade in dark  🟡 CONFIRMED  `[DARK-PALETTE-WRONG-SELECTOR]` (token variant)
- **Layer:** T4 / design-tokens (the hand-authored `html.t4-dark { --token: … }` block). **Where:** any CSS
  custom-property whose design system defines a *different dark value* but which the dark block forgot to
  re-declare — typically the **secondary/success accent, primary-hover, and tertiary accent** (NOT bg/surface/
  text/border, which authors always remember).
- **Symptom:** dark mode looks right at a glance (surfaces/cards/text all flipped), but secondary-colored
  elements — checklist ticks, comparison-table ✓, "operational"/success dots, FAQ-page checks, billing "−20%"
  labels, the 3rd timeline/chart dot, and primary-hover button states — render the **light** hex in dark
  (e.g. secondary `#0B9E8A` instead of dark `#19C9B0`; primary-hover `#0049C4` instead of `#3B82F6`).
  Slightly-too-dark/muddy on the dark background; very easy to miss because the element IS colored, just the
  wrong shade.
- **Why it slips past review:** a computed probe of `background-color`/`color` returns a *non-white, on-brand*
  value, so a "did it flip to dark?" check PASSES. The defect is only visible by comparing the *exact rgb*
  against the dark-frame token (`.pen` dark icon `fill`), not by "is it still green/blue?".
- **Root cause:** the `html.t4-dark` override block is authored by hand and enumerates only the tokens the
  author was thinking about (surfaces, text, borders). The accent tokens keep their `:root` (light) value
  because nothing re-declares them under the dark scope.
- **Fix recipe:** in the dark scope, re-declare **every** token the design system marks with a distinct dark
  value — not just surfaces. For Stratum: `--stratum-secondary:#19C9B0; --stratum-primary-hover:#3B82F6;
  --stratum-accent:#A78BFA;`. Keep `--primary` itself if the system says the hue is theme-independent.
- **Pre-flight check:** diff the light `:root` token list against the `html.t4-dark` block — **every** token
  the design-system table gives a separate Dark column for MUST appear in the dark block. Then in dark, probe
  the exact rgb of one secondary-accented element (a check/tick) and assert it equals the dark accent hex, not
  the light one.

---

## B. Bootstrap defaults leaking into the design

### P5 — `.text-muted` = `rgba(33,37,41,.75)` leaks where design wants a specific grey  🟠 CONFIRMED  `[BS-TEXT-MUTED-LEAK]`

- **Build-time:** builder gotcha #18 (BS utility classes leak light colors on dark) — prevent at build.
- **Layer:** BS. **Fix recipe:** never rely on `.text-muted`; set the exact token (`#6B7280` etc.). Probe
  exact rgb on every caption/sub/meta — "looks grey" is not verification.

### P6 — `.font-mono` utility does not exist → mono eyebrows fall back to sans  🟠 CONFIRMED  `[FONT-MONO-MISSING]`
- **Layer:** BS/T4. **Symptom:** eyebrows/meta/badges render Geist (sans) at 11.2/12.8/13/14 instead of mono 12.
- **Fix recipe:** define a real mono utility/class or set `font-family` explicitly on every mono element;
  confirm computed `font-family` is the mono stack.

### P7 — Stray BS spacing utilities break designed gaps  🟠 CONFIRMED  `[GAP-MARGIN-STRAY]`
- **Layer:** BS/T4. **Symptom:** flex clusters (header right cluster, button rows, footer social, card
  actions) have wrong gap from a stray `margin-left:1rem` / `.gap-2 !important`.
- **Fix recipe:** probe computed gap vs design on every flex cluster; zero/override the stray rule.

### P8 — T4 card-grid gutter is driven by `--t4-gutter-x` (default 2rem=32px), NOT `--bs-gutter-x`  🟠 CONFIRMED  `[CARDS-TOUCHING]`
- **Layer:** T4. **Symptom:** card grids have the WRONG gap (often 32px — too wide — not "touching"); your
  scss gap is ignored.
- **Root cause:** T4 grid columns read **`--t4-gutter-x`** (defaults to `2rem` = 32px), which overrides
  `--bs-gutter-x` and your scss. Confirmed on Stratum Home: features/pricing/testimonials all rendered 32px
  until `--t4-gutter-x` was set.
- **Fix recipe:** set `--t4-gutter-x: <design gap>px` (e.g. 20) on the specific grid `.row`. ALWAYS measure
  the REAL card-to-card gap live — don't trust scss, and don't assume "≈0/touching" (it was 32, too wide).

---

## C. js-offcanvas (mobile drawer) vendor

### P9 — Push-mode transform hardcoded to `-300px`, independent of drawer width  🔴 CONFIRMED  `[OVERLAY-SEAM-MASK]`
- **Layer:** OC. **Symptom:** with a drawer wider than 300px, the backdrop ends *inside* the drawer, dimming/
  clipping the first letters of menu labels.
- **Fix recipe:** template-scope-override the content-wrap + backdrop push transforms to the actual drawer
  width (e.g. `-340px`); add an SCSS comment so a later width change updates it. Verify `bgEdge − drawerEdge == 0`.

### P10 — Drawer side is `oc_rightside` in `etc/navigation/default.json`, not CSS  🟡 CONFIRMED
- **Layer:** T4/OC. **Symptom:** drawer docks on the wrong side. **Fix:** set `oc_rightside:true/false` in
  the nav JSON (DB `navigation-settings` is usually empty and loaded from this file). NEVER fix by flipping
  CSS only — the JS id/modifiers (`off-canvas-right-push`) must match.

### P11 — Base `.close span{display:block;line-height:28px;width/height:32px}` boxes the × off-centre  🟠 CONFIRMED
- **Layer:** T4. **Fix:** collapse the glyph span to `display:flex;align-items/justify-content:center;
  width/height:auto!important;line-height:1!important` so the char centres on both axes.

### P12 — Base drilldown rules outrank overrides; `.btn-toggle{margin-top:8px}` floats chevrons  🟠 CONFIRMED
- **Layer:** OC/T4. **Root cause:** `.navbar.drilldown-effect .navbar-nav .btn-toggle{margin-top:8px}` (0,6,0)
  and `:hover/:active` (0,6,0), `.navbar.drilldown-effect…nav-item` (0,8,1) outrank plain overrides.
- **Fix:** `align-self:center;margin-top:0!important;top:0!important` (or deeper selector). Expect to need
  `!important` against these specific high-specificity base rules.

### P40 — Drilldown `.sub-menu-back` row paints NEAR-WHITE in dark (js-offcanvas vendor default) → white-on-white back-bar  🔴 CONFIRMED (Nexora)  `[NESTED-STATE-NOT-DARKED]`  HARD-TO-DETECT
- **Layer:** OC (js-offcanvas vendor css). **Where:** the "‹ PARENT" back-row at the top of EVERY mobile
  drilldown sub-panel (`.t4-offcanvas .sub-menu-back`), any T4 site using `oc_menu_effect:drill`.
- **Symptom:** you open the drawer (dark OK) and drill into a parent — the **back-bar renders a near-white
  bg (`#F2F4F6`)** while its label is white → the back affordance is effectively invisible in dark. The panel
  body itself is dark, so a "did the drill panel flip?" check PASSES; only the back-row is light.
- **Root cause:** the js-offcanvas vendor css sets `.sub-menu-back{background:#f2f4f6}` (a light grey) at a
  specificity that beats a plain darkmode `.t4-offcanvas .sub-menu-back{background:transparent}` (the
  `transparent` rule "exists" but loses the cascade — classic P1). It only shows after a real drill click, so
  a closed-drawer probe never sees it.
- **Fix recipe:** pin it — `html[dark] .t4-offcanvas.c-offcanvas .sub-menu-back{background:<page-bg>!important;
  color:<heading>!important}` (add the `.c-offcanvas`/`.dropdown-menu .sub-menu-back` variants to clear the
  vendor specificity). Verify by **drilling in dark** and reading the back-row computed `background-color`.
- **Pre-flight check:** open the off-canvas, click a parent's `.sub-menu-toggle.btn-toggle` (NOT the `<a>` — the
  link just navigates), then in dark probe `getComputedStyle('.sub-menu-back').backgroundColor` ≠ near-white.

### P42 — `plg_system_privacyconsent` force-redirects un-consented logged-in users to profile-edit on EVERY request → the profile DISPLAY view is unreachable  🔴 CONFIRMED (Nexora)  HARD-TO-DETECT

- **Build-time:** builder gotcha #53 (consent/privacy plugins break reg/profile — purge demo 500s).
- **Layer:** EXT (`plg_system_privacyconsent`, ships+enabled in standard Joomla 4/5/6 + most JA quickstarts).
  **Where:** ANY logged-in user who lacks a `#__privacy_consents` row with `state=1` — i.e. every demo/seeded
  user, and any account created before consent was required.
- **Symptom:** while reviewing the **com_users Profile (display) view** you can never see it — every request
  (profile, profile-edit, even unrelated pages while logged in) **303-redirects to `view=profile&layout=edit`**.
  Looks like the profile override is broken or loops; the *edit* page renders fine, the *display* page is ghost.
- **Why HARD-TO-DETECT:** it's a runtime `$app->redirect()` from the plugin's `onAfterRoute`/`onAfterDispatch`
  (`plugins/system/privacyconsent/src/Extension/PrivacyConsent.php` ~line 320: `$link='index.php?option=com_users&view=profile&layout=edit'`),
  NOT a `#__redirect_links` row and NOT in com_users core (the core `Profile/HtmlView` only redirects guests to
  *login*). There's no obvious culprit; guest-facing pages render normally so a logged-out review never sees it.
- **Root cause:** the plugin enforces privacy-policy acceptance by trapping un-consented logged-in users on the
  profile-edit form until they tick consent. Demo users seeded via SQL/PDO have no consent record.
- **Fix recipe (review/demo, quickstart-reproducible — do NOT disable the plugin):** seed a consent row for the
  demo user via PDO: `INSERT INTO #__privacy_consents (user_id,state,created,subject,body,remind,token)
  VALUES (<uid>,1,NOW(),'PLG_SYSTEM_PRIVACYCONSENT_SUBJECT','Consent granted (demo seed).',0,'')`. Then
  `view=profile` returns 200 and renders the display layout. (Also fill any `profile-require_*` empty fields if
  the plugin/profile-plugin still nags, though consent is the primary trap.)
- **Pre-flight check:** to review the com_users profile DISPLAY view, log in as the demo user and hit
  `index.php?option=com_users&view=profile&Itemid=<n>`; if it 303s to `…&layout=edit`, seed the consent row
  before assuming the override is broken.

---

## D. Icons & buttons

### P13 — FontAwesome is the default; designs spec'd in lucide get fa-* glyphs  🟠 CONFIRMED  `[ICONFONT-NOT-LUCIDE]`
- **Layer:** FA/T4. **Symptom:** `fa-bolt`/`fa-check`/`fa-arrow-right` icon-font glyphs where the design uses
  lucide (sparkles/check/circle-check). Setting the *colour* doesn't fix the *glyph*.
- **Fix recipe:** replace `<i class="fa …">` with **inline lucide SVG** (`stroke=currentColor` so it inherits
  the surrounding colour); keep a fa-class→lucide-svg map helper for ACM templates. Verify 0 `fa-*` remain.
- **Recurs in canvas-article value/feature cards (HIGH FREQUENCY):** the FA→lucide gap shipped *again* in the
  Card/Feature value grids on About (`fa-quote-left`), Solutions (use-cases) and **Team** (`fa-compass`/
  `fa-globe`/`fa-shield-halved` → lucide compass/globe/shield). Any canvas page with a `.stratum-value-card__ico`
  is suspect. **Pre-flight on EVERY canvas page:** grep the article body for `fa fa-`/`class="fa`; assert 0; the
  SCSS `.stratum-value-card__ico svg{22px}` rule is inert until the content actually contains an `<svg>`.

### P14 — `.c-button:hover .c-button__text` applies a 180° matrix transform → hover-jump  🟠 CONFIRMED  `[HOVER-JUMP]`
- **Layer:** T4. **Symptom:** a button/close glyph spins or jumps on hover.
- **Fix:** pin the glyph span `transform:none!important;transition:none!important`; keep only a bg/colour hover.
- **Pre-flight check:** hover every interactive element; assert `getBoundingClientRect` identical rest vs hover.

### P24 — Inverted-button band guard targets `color-blue` (wrong) + only `.btn-primary`; `.btn-light` blends blue-on-blue  🔴 CONFIRMED  `[PALETTE-A-LEAK]`(button variant)
- **Layer:** T4 + template button system. **Symptom:** the PRIMARY CTA button on a blue (`palette-blue`) band
  renders **blue fill on a blue band** (white label on blue button on blue band ≈ invisible), instead of the
  inverted **white-fill + primary-text** the design shows. Found on JA Stratum single-article CTA (module 190
  "Subscribe free"), but the band-scoped inverted-button guard is SHARED → affects **every** `t4-palette-blue`
  CTA band site-wide (blog/home/article). A computed probe of the band bg + heading "passes" while the button
  is invisible — exactly the kind missed by a band-only verify (cf REVIEW-FINDINGS #123 passed the band but not
  its button).
- **Root cause — TWO compounding misses:** (1) T4 emits the band class as **`t4-palette-blue`**, but the
  template's inverted-button guard was scoped to `.t4-section.color-blue` (a class T4 NEVER renders — same root
  as P19). (2) Even when scoped right, the guard only inverted `.btn-primary`; the CTA modules use **`.btn-light`**,
  and the template maps `.btn.btn-light{background:var(--primary)}` (correct on WHITE bands) → on a blue band it
  stays blue-on-blue.
- **Fix recipe:** add `.t4-palette-blue` (+`.t4-section.t4-palette-blue`) to the inverted-band selector list AND
  cover `.btn.btn-light:not(.btn-white):not(.btn-outline-white)` → `background:#fff!important;color:var(--primary)!important`
  (the `.btn-light`→primary map is 0,2,0, so `!important` or ≥0,3,0 is required). Outline btns on the band stay
  white-outline.
- **Pre-flight check:** on EVERY `t4-palette-blue`/primary CTA band, probe the COMPUTED `background-color` of each
  button — assert the filled one is `#FFFFFF` (not the band's blue) and its text is primary; don't trust that the
  band bg + heading pass.

### P25 — `.t4-palette-{gray,blue,dark}` hijacks plain HEADING tags (`h1–h4`), not just anchors  🟠 CONFIRMED  `[PALETTE-A-LEAK]`(heading variant)

- **Build-time:** builder gotchas #38 (`.item-page a` repaints buttons) / #60 (`page_heading` masthead) / #61 (canvas-body pattern).
- **Layer:** T4. **Symptom:** card titles / section headings inside a `color_pattern` band render the band's
  hardcoded grey `#374151` instead of the heading token — even when the element has its own colour rule. Found
  on JA Stratum single-article Related band (`palette-gray`): the `<h3>` post-card titles AND the `<h2>` "Keep
  reading" heading both went muted grey in LIGHT (and would mis-shade in dark).
- **Root cause:** beyond the documented `.t4-palette-* a{color:#374151}` (0,2,0) anchor leak, T4 ALSO emits
  **`.t4-palette-gray h1, .t4-palette-gray h2, .t4-palette-gray h3, .t4-palette-gray h4 {color:#374151}`** (0,2,0)
  — this beats a component's own `.card__title`/`.section-title` rule (0,1,0). A computed probe of the
  component's own rule "passes" while the palette-heading rule wins.
- **Fix recipe:** out-specify with the palette class — `.t4-palette-gray .my-card__title{,a}{color:var(--heading)}`
  (≥0,2,0 and later in cascade, or self-double to 0,3,0). Token-driven so it flips to #F5F7FA in dark.
- **Pre-flight check:** on EVERY `t4-palette-*` band, probe the COMPUTED colour of headings/titles inside (not
  just links/buttons) — assert heading-token, not #374151. Extend the existing PALETTE-A-LEAK sweep from `a` to
  `h1–h4`.

---

## E. Extension output shapes (override, don't patch the extension)

### P15 — `mod_menu` default markup is plain links, not designed icon-box rows  🟠 CONFIRMED
- **Layer:** EXT (mod_menu). **Fix:** override `html/mod_menu/default_url.php`/`default_component.php` to emit
  the designed rows (icon-box + title + sub-text), keyed off existing menu item ids. **NEVER** change a menu
  item's `menutype`/`published` via raw SQL — it corrupts the nested-set and collapses the megamenu. Hide
  items via `params.menu_show=0`.

### P26 — A hand-built "Home" crumb via `Route::_('index.php')` resolves to the CURRENT view's URL, not the front page  🔴 CONFIRMED (Stratum Tag)
- **Layer:** Joomla SiteRouter, in any **component-view override** (`com_tags/tag`, `com_tags/tags`, custom
  list overrides) where you hand-build a breadcrumb instead of using `mod_breadcrumbs`. **Symptom:** the
  breadcrumb "Home" link *renders* and *looks* correct, but clicking it stays on / loops back to the current
  page. On the Tag page, `Route::_('index.php')` produced `/all-tags/kubernetes?parent_id=1` (the tag's own
  route) for the "Home" crumb.
- **Root cause:** with no `Itemid`, `Route::_('index.php')` is resolved **relative to the currently active
  menu item** (here the All-Tags Itemid that hosts the tag view), so it inherits that item's route segments
  instead of pointing at the site default/home menu item.
- **Recurs on:** EVERY view that hand-builds a Home link — **Tags Index** (same com_tags default markup),
  any custom search/profile/component override with a manual breadcrumb. HARD-TO-DETECT: present in the DOM,
  passes every visual + computed probe (it's a styled `<a>` with an href); only an **href assertion or a real
  click** exposes it. A screenshot review NEVER catches it.
- **Fix recipe:** resolve the front page explicitly via the default menu item —
  `$home = (int) ($app->getMenu()->getDefault()?->id ?? <fallback Itemid>); Route::_('index.php?Itemid='.$home)`.
  Then assert the rendered href equals `/` or `/index.php` (HTTP 200), not the current view's path. Prefer
  `mod_breadcrumbs` (whose first crumb is already the correct Home) when the trail labels are acceptable.

### P36 — `com_contact` / `com_users` form-field rendering ships 4 latent layout/dark bugs  🔴 CONFIRMED  `[DARK-STUCK-LIGHT]`
<!-- renumbered from the duplicate "P21" (forms variant); REVIEW-FINDINGS prose that cites "P21" for the auth/contact form/checkbox/label/focus traps refers to THIS entry (P36). -->

- **Layer:** Joomla core (`FormField` → `$field->label`/`$field->input`) + Bootstrap + form.validate. These bugs
  recur on **every template's Contact page AND every auth form** (login/register/profile/reset/remind —
  com_users uses the identical field-rendering pattern). HARD-TO-DETECT: a computed probe of a single text
  input "passes" while labels are white-on-dark, the consent checkbox is a full-width empty box, labels are
  double-wrapped, and the focus ring never paints. Found on JA Stratum Contact (REVIEW-FINDINGS #114).
  1. **`$field->label` is ALREADY a complete `<label>` element.** The common override pattern
     `<label for="…"><?php echo $field->label; ?></label>` produces an **invalid nested `<label><label>…`**.
     Output `$field->label` **directly** (no wrapping `<label>`); style via `.stratum-field label[id$="-lbl"]`.
  2. **Checkbox/consent fields (`consentbox`, any `Checkboxes`) carry their own inline `<label>` on the control.**
     A blanket `.field input{width:100%!important}` (added to force text inputs full-width) blows the checkbox
     up to a full-width empty box with the policy text floating beside it. Detect the type and render checkbox
     fields as a **compact horizontal check row** (18px box + inline label), and DON'T emit a duplicate stacked
     label. Pin `.form-check-input{width:18px!important}` with enough specificity to beat the blanket rule.
  3. **Dark mode: field labels + input text/bg/border do NOT flip unless explicitly handled.** A naive
     darkmode rule that colors `.field label` to the heading/white token leaves labels white where the design
     wants muted; inputs left on the light `surface`/`bg` token can stay light. Prefer **token-driven** input
     fill (`bg` flips #FFF→#0A0E1A) + `border-strong` (#CBD2DC→#323C52) so they auto-flip; only pin
     label→muted-dark + input text→`text`-dark (#C7CEDB) where a base/darkmode rule wrongly forces white.
  4. **Focus ring: Bootstrap `.form-control:focus` (0,2,0) + validated `.form-control.is-valid:focus` /
     `.was-validated .form-control:valid:focus` (form.validate adds `valid`/`is-valid`) OUTRANK a plain
     `.field input:focus` (0,2,0, source-order tie/lost).** The designed primary border + ring silently never
     applies. Pin the focus look with `input.form-control:focus` + the validated-state selectors and
     `!important`. NOTE: a JS `el.focus()` may not paint `:focus` styles in headless Chromium — verify the ring
     with a **trusted Playwright click**, not a scripted focus.
- **Pre-flight check (every Contact + auth page):** render the form in **dark**, **click** an input (trusted)
  and confirm the primary focus ring paints; confirm labels are muted-not-white; confirm any checkbox/consent
  field is a compact row, not a full-width box; grep the field DOM for a `<label>` nested inside a `<label>`.
- **Login addendum (Stratum Login, REVIEW-FINDINGS #170) — CONFIRMED, two more HARD-TO-DETECT traps:**
  5. **The blanket `width:100%` blows the simple `remember-me` checkbox too** — not only the consent `Checkboxes`.
     com_users login renders `<input type="checkbox" name="remember">` inside a hand-written `<label>`; the auth
     full-width input rule (compiled from scss `.stratum-auth-form input{width:100%}`) stretched it to a ~110px
     box on its own line. FIX at the source: scope the full-width rule
     `input:not([type=checkbox]):not([type=radio])`, and pin the checkbox `width:16px!important;flex:0 0 16px`
     under a selector that beats T4's `label{display:block}` (use `.stratum-auth-options label.stratum-auth-remember`).
     Label text color: design wants `text` (#374151→#C7CEDB), not heading — T4's label rule may force heading.
  6. **com_users login labels: T4's `.control-label`/`.control-label label` rule (font 16/400 text) OUTRANKS a
     bare `.stratum-auth-form label` (0,2,0 tie, lost on source order).** The designed label type (Geist 13/500
     heading) silently never applies — looks fine but is the wrong size/weight/color. Pin it on
     `.stratum-auth-form .control-label label` with `!important`. (Note: `.control-label` here is a `<div>`
     wrapping the real `<label>`, so this is NOT the double-`<label>` nest of P36.1 — Joomla's `renderFieldset`
     markup is valid; don't "fix" it.)
  7. **Routing trap (all com_users views): a raw `?option=com_users&view=login` URL WITHOUT an `Itemid` renders
     an EMPTY component area** (no menu match → T4 paints header+footer but no body) — looks like the override
     is broken. Always review via the actual **menu-item route** (e.g. `/index.php/login-page`); the header
     "Sign in" link carries the correct Itemid. Same applies to register/reset/remind/profile menu items.
  - **Forgot-link semantics:** the login options-row link is "Forgot **password**?" → `view=reset` (NOT
    `COM_USERS_LOGIN_REMIND` "Forgot your username?" → `view=remind`); reminder belongs on a separate page.
  - **Login addendum (Stratum P2 re-review) — three more confirmed:**
    8. **The com_users password toggle button ships class `btn btn-secondary input-password-toggle` with a Joomla
       icomoon `<span class="icon-eye">` glyph (NOT lucide SVG).** Two traps: (a) `.btn-secondary` leaks BS grey
       (P44) — override the input-group toggle bg to the field surface + remove the danger/grey; (b) the eye glyph
       is icomoon, not lucide — if the design shows a lucide eye, swap it, but most `.pen` password inputs show NO
       toggle (just a lock prefix), so keeping Joomla's functional toggle with a neutralised look is acceptable —
       just don't leave it BS-grey. Weld it: input `border-radius:r 0 0 r;border-right:none`, toggle `0 r r 0`.
    9. **The simple `remember-me` checkbox styled via `accent-color` SILENTLY DROPS any CSS `border`/`border-radius`**
       (native accent-color paints the OS control; border/radius on a native checkbox is ignored in Chromium). If the
       `.pen` shows a rounded box with a 1px border, you must `appearance:none` + redraw: `border`+`border-radius:4px`
       + a `:checked{background:primary}` + a `::after` CSS checkmark. A computed `accentColor` probe "passes" while
       border/radius read `0px none` — screenshot or probe `borderRadius`/`border` to catch it.
    10. **A com_users login override that renders `$this->form->renderFieldset('credentials')` cannot change the
        field LABEL text** (it's core `JGLOBAL_USERNAME`/`JGLOBAL_PASSWORD` + a `.star` required asterisk). To match a
        design label ("Work email", no `*`) without a core-language edit: `preg_replace` the rendered fieldset HTML
        string to swap the label text, and `display:none` the `.star` span via a page-scoped rule. Keeps the field a
        real username field; no core touch; parallel-safe.
  - **ja_voyara Contact page confirmation (2026-06-20):** P36.1–P36.4 ALL CONFIRMED on com_contact in ja_voyara.
    Additional sub-bug confirmed: **Spacer pseudo-field** (`$field->type === 'Spacer'`) renders a `.voy-field-group`
    with escaped HTML in the label when using a full-fieldset loop — must skip with `$field->type === 'Spacer'` check.
    Focus-ring fix needed extra specificity on dark: `html.t4-dark body.item-275 .voy-contact-form .voy-input:focus`
    because the darkmode.css `!important` on the non-focus border-color blocks the focus-state flip at the same
    specificity chain. Triple-scope (dark-hook + body-class + form-class) breaks the tie.

### P16 — Megamenu renders from the DB, not files  🟡 CONFIRMED

- **Build-time:** builder gotchas #3 (megamenu from DB) / #27 (megamenu dual-seed) / #71 (megamenu type in DB params).
- **Layer:** T4. The megamenu reads `#__template_styles.params['navigation_mega_settings']` (+ `etc/navigation/*.json`).
  Editing files alone does nothing; seed the DB. A first render after an optimize-cache clear can show the
  megamenu un-initialised (transient) — warm the bundle, reload.

### P17 — T4 bundles CSS/JS into `media/t4/optimize/<hash>`  🟡 CONFIRMED

- **Build-time:** builder gotcha #1 (clear the T4 optimize cache before every verify).
- **Layer:** T4. Edits don't show until you clear it: `ddev exec "rm -rf …/cache/* …/media/t4/optimize/*"`
  before EVERY verify render. (Operational, not a design bug, but causes "my fix didn't apply" confusion.)

### P18 — Pencil MCP silently falls back to the active editor file on a bad path  🔴 CONFIRMED (tooling)
- **Layer:** tooling (Pencil MCP). **Symptom:** `get_screenshot` returns a perfectly valid image — **of the
  wrong design** — when you pass a non-existent `.pen` path, because it falls back to whatever file is open.
  An entire review's "perceptual comparison" can be against the wrong site and still "pass".
- **Fix recipe:** ALWAYS pass the correct absolute `.pen` path; PROVE you're on the right file with
  `batch_get(["<knownNodeId>"])` first (a "No node with id" error = wrong file). `get_screenshot` succeeding
  does NOT prove the path. Pin the path in every subagent brief.

### P31 — Editing article/module HTML via `mysql -N` round-trip CORRUPTS newlines into literal `\n`  🔴 CONFIRMED (tooling)
<!-- renumbered from the duplicate "P19" (tooling variant); REVIEW-FINDINGS prose citing "P19" / "PLATFORM-KB P19" for the literal-`\n` card-grid corruption refers to THIS entry (P31). The OTHER P19 (dark-bands-wrong-selector) keeps its number. -->

- **Build-time:** builder gotcha #68 (seed article/module HTML via PDO, never `mysql -N`).

- **Layer:** tooling (DB content editing) + Joomla com_content output. **Symptom:** after a script reads a
  field with `ddev mysql -N -e "SELECT introtext …"`, transforms the text, and writes it back, the rendered
  page shows **literal `\n` text scattered through the markup** AND **canvas card grids break** — cards wrap
  to the wrong column count, stray gaps, "cards touching/scattered" — because the visible `\n` strings become
  extra inline/flex children between the real cards. A computed-style probe of the grid (display:grid,
  gap:24, 3 tracks) all reads CORRECT while the layout is visibly wrong → classic [computed-passes-render-fails].
- **Root cause:** the `mysql` CLI **escapes** real newlines as the two characters backslash-`n` in its tab/
  `-N` output. A script that captures that stdout and writes it straight back stores **literal `\n`** (98 of
  them in the Stratum About body) instead of real `0x0A` newlines. The browser renders backslash-n as text.
- **Fix recipe:** NEVER round-trip HTML field content through `mysql -N` stdout. Read+write via a driver that
  returns raw bytes — e.g. PHP PDO inside the container:
  `$pdo->query("SELECT introtext…")->fetch()` → transform → `prepare("UPDATE … SET introtext=?")->execute([$c])`.
  To repair already-corrupted content: `str_replace(chr(92)."n", chr(10), $c)` then UPDATE via PDO.
- **Pre-flight check:** after any DB content edit, probe `substr_count($val, chr(92)."n")` (should be 0) and
  `document.body.innerText.includes('\\n')` in the browser (should be false). Found on About (id 84) value/
  team/testimonial grids — the "scattered cards" were `\n` flex items, not a grid bug.

### P32 — T4/JA license guard fatals the WHOLE site on the default HTTP port (`:80`) under DDEV  🟡 CONFIRMED (environment)
<!-- renumbered from the duplicate "P20" (environment variant). The OTHER P20 (section-padding-doubles) keeps its number. -->

- **Layer:** T4 / JA license check. **Symptom:** every page returns `Fatal Error → "License error - license
  domain does not match your domain (ddev.site!=joomlart.com)"` when the browser hits the bare DDEV hostname
  on port 80 (`http://<proj>.ddev.site/…`). The guard strips the host to the registrable domain (`ddev.site`)
  and compares to the licensed `joomlart.com`. The error string is not in plaintext PHP (encrypted token).
- **Root cause:** the license-domain check fires on the standard port but is **bypassed on the alternate
  mapped HTTP port** DDEV exposes (e.g. `:33000`). `curl`/`browser` on `http://<proj>.ddev.site:33000/…`
  renders the real site fine; `:80` fatals.
- **Fix recipe (for local review only):** drive the browser against the alternate port URL printed by
  `ddev describe` (web service `URL/PORT`, e.g. `:33000`). Do NOT chase it as a template bug. (Do not commit
  any license-bypass; it's purely a local-render workaround.)
- **Pre-flight check:** if a fresh DDEV T4 site fatals with a license-domain error in the browser, retry on
  the `:<altport>` URL before debugging anything else.

### P33 — Breadcrumb (`mod_breadcrumbs`) labels the active MENU ITEM, not the page — mislabels category/list views  🔴 CONFIRMED (Blog)
<!-- renumbered from the duplicate "P21" (breadcrumb variant); REVIEW-FINDINGS prose citing "P21" for breadcrumb mislabel / breadcrumb-hide on auth pages refers to THIS entry (P33). -->

- **Layer:** core `mod_breadcrumbs`. **Symptom:** on a `com_content` category/blog (or archive/author/tag/
  search) view reached through a generically-named menu item, the LAST breadcrumb crumb shows the **menu item
  title** instead of what the page actually is. On Stratum the blog is reached via the "Pages" demo-index menu
  item, so the trail read **"Home › Pages"** (should be "Home › Blog/Stratum Blog"). Core also prepends a
  "You are here:" string and ships unstyled BS `.breadcrumb` markup.
- **Root cause:** Joomla's pathway uses the active menu item's title for the current page; when one menu item
  is repurposed to point at a category, the crumb is wrong. The pathway has no awareness of the rendered
  category/tag/author entity.
- **Recurs on:** Category, Category-Blog, Archive, Author, Tag, Search — **every list view** whose menu item
  title ≠ the entity name. HARD-TO-DETECT: a computed/markup probe of the breadcrumb "passes" (it IS a valid
  crumb) while the *label* is semantically wrong; only reading the visible text catches it.
- **Fix recipe (template override, reusable):** `html/mod_breadcrumbs/default.php` — (1) drop the
  "You are here:" prefix; (2) on `com_content` `category`/`archive` views, look up the real category via
  `Categories::getInstance('Content')->get($input->get('id'))` and **relabel `$list[$last]->name`** to
  `$cat->title`; (3) emit clean BEM markup (`.stratum-bc*`) with inline lucide chevron-right separators so it
  can be themed (mono, muted links, primary active crumb, token border) and hidden on mobile if the design
  omits it. Keep the JSON-LD BreadcrumbList block. Extend the same view/entity switch for tag/author/search.
- **Pre-flight check:** on any list view, READ the visible breadcrumb text — confirm the last crumb names the
  entity (category/tag/author), not the menu item. If it shows a generic menu label ("Pages", "Blog index"),
  add/extend the relabel switch.
- **Sub-case — Tags-Index (`com_tags view=tags`, CONFIRMED Stratum #158):** routed via an "All Tags" menu item,
  the natural pathway is just **"Home › All Tags"** — both *mislabeled* (menu title "All Tags" ≠ the design's
  "Tags") AND *missing a parent crumb* the design wants ("Home › **Blog** › Tags"). `mod_breadcrumbs` cannot
  synthesize a parent that isn't on the pathway, so relabeling alone is insufficient. **Cleanest fix = build the
  breadcrumb INLINE in the `com_tags/tags` (and `/tag`) override** (full label + route + parent control), styling
  it with the shared `.stratum-bc*` rules; pin Home to the default-menu Itemid (P-Home-crumb-misroute) and any
  parent crumb (Blog) to its real menu Itemid. The active crumb color is design-specific: Tags-Index wants it
  **heading** (#0A0E1A→#F5F7FA), NOT the shared band's primary — scope the active color in the page CSS.

### P34 — `.t4-palette-{color} a` (0,2,0) hijacks every anchor inside a palette band  🔴 CONFIRMED (Blog)
<!-- renumbered from the duplicate "P22" (palette-anchor variant). The OTHER P22 (doc-vs-.pen process) keeps its number. Closely related to P24/P25 (palette button/heading variants). -->

- **Build-time:** builder gotchas #38 (`.item-page a` repaints buttons) / #60 (`page_heading` masthead) / #61 (canvas-body pattern).

- **Layer:** T4 builder CSS. **Symptom:** any section with a `color_pattern` (`t4-palette-gray/blue/dark`)
  ships a rule `.t4-palette-gray a { color:#374151 }` (specificity **0,2,0**) that recolors **all** links in
  the band, beating plain component rules (0,1,0). On the Blog featured band it forced the featured title link
  and the filled CTA button label to dark grey — the button text was near-invisible on its blue fill.
- **Root cause:** T4 sets a per-palette anchor color for legibility on tinted bands, but it's broad and
  out-specifies single-class component rules. Token-driven component CSS doesn't help — the leak is a literal
  hardcoded hex at higher specificity.
- **Recurs on:** every palette/`color_pattern` band that contains designed links or buttons (home splits, blog
  featured, CTA bands, any `t4-palette-*` section). HARD-TO-DETECT: the component's own rule "passes" a probe
  while the palette-`a` rule actually wins; only a COMPUTED color read on the live anchor catches it.
- **Fix recipe:** scope the component link/button under the band class to reach ≥0,3,0 (e.g.
  `.stratum-featured-band .stratum-featured-card__btn { color:#fff }`), or self-double the selector
  (`a:link`/`&__btn:link`) to tie+win on source order. Re-probe computed color, not just the rule.
- **Pre-flight check:** on every palette band, probe the COMPUTED `color` of each link/button vs design.

### P35 — Archive month/year filter queries a DIFFERENT date column than your override groups by  🔴 CONFIRMED (Stratum)
<!-- renumbered from the duplicate "P23" (archive-date variant); REVIEW-FINDINGS prose citing "P23" / "[PLATFORM P23]" for the archive month/year ⇔ heading date-column mismatch refers to THIS entry (P35). The OTHER P23 (dark-token-accents-omitted) keeps its number. -->

- **Layer:** Joomla core (`com_content` ArchiveModel) + any custom archive `default_items.php` override.
  **Symptom:** the grouped month headings (and the per-row dates) you render don't match the month the
  Month/Year dropdown actually filters on. A user sees a "May 2021" group, picks **May** in the filter, and
  gets **zero results** ("No archived articles found"); only picking a *different* month (Sept) returns them.
- **Root cause:** `ArchiveModel::getListQuery()` filters month/year via
  `QueryHelper::getQueryDate($params->get('order_date'))`, where **`order_date` is read from the menu item
  params, falling back to the global com_content config — whose stock default is `published` (i.e.
  `publish_up`), NOT `created`.** A naive override that groups/labels by a hardcoded `$item->created` therefore
  shows the *created* month while the filter constrains the *publish_up* month. When an article's `created`
  and `publish_up` fall in different months (very common in demo/quickstart data — created on import,
  publish_up backfilled to a campaign date) the heading and the working filter value diverge.
- **Recurs on:** EVERY archive view override on every T4 template, AND the same `order_date` indirection
  affects **category-blog / featured / category-list** date display + ordering (those use
  `QueryHelper::orderbySecondary($orderby, $order_date)` too). HARD-TO-DETECT: the page renders fine, light
  AND dark probes pass, the list is non-empty on first load — the bug only surfaces when you *use* the filter
  with the month shown in a heading. A pure visual/computed review never catches it; you must drive the
  filter (select month/year → submit → assert rows match the heading).
- **Fix recipe:** in `html/com_content/archive/default_items.php`, resolve the SAME date field the model uses
  and group / format / `<time datetime>` on it — read `$this->params->get('order_date', 'created')` and map
  `created→created · published→publish_up · modified→modified` (mirroring `QueryHelper::getQueryDate`, with the
  null-date fallback to `created`). Never hardcode `$item->created`. (Alternative: pin the menu's `order_date`
  param, but the override fix is portable and respects admin config.)
- **Pre-flight check:** on the live archive, read the first group's month heading, set the Month/Year selects
  to that month, submit, and assert the row count is unchanged (heading ⇔ filter agree). Then pick a month
  with no content and confirm the styled empty-state renders.

### P27 — `com_finder` search FORM submit lands on the wrong page (Home) — broken search  🔴 CONFIRMED (Stratum Search)  HARD-TO-DETECT
- **What:** the stock `default_form.php` builds the form action with
  `<form action="<?php echo Route::_($this->query->toUri()); ?>" method="get">`. With **SEF on +
  sef_rewrite OFF** (the DDEV default), `Route::_()` collapses the search route to a
  `/index.php/component/finder/` **path segment** (it drops `view=search`). Because a **GET form discards
  the action's query string** and submits only its field inputs, the result URL becomes
  `/index.php/component/finder/?Itemid=…&q=…` with **no `option`/`view`** — and when the search menu item is
  **nested under a content-category menu item** (here `Search` parent = `Pages`→`com_content category`), the
  finder router mis-resolves that bare path to the site **Home** layout. Net: typing a query and pressing
  Enter/Search shows the home page, not results. The search box is effectively dead.
- **Why HARD-TO-DETECT:** the Search page itself renders perfectly on direct navigation
  (`index.php?option=com_finder&view=search&Itemid=…`), so every screenshot / computed-px / dark / mobile
  axis PASSES. The break only appears when you **actually submit the form** — a pure visual review never
  exercises it. Body class still says `view-search`, masking it further.
- **Recurs on:** any T4 template whose Search menu item is nested under another component's menu item, OR any
  site with sef_rewrite off. The finder router's `toUri()` SEF behaviour is the same everywhere.
- **Fix recipe (override `html/com_finder/search/default_form.php`):** point the action at the bare entry
  point and carry the routing params as **hidden inputs** so the submitted GET URL is always a clean,
  resolvable query string:
  `<form action="index.php" method="get">` + `<input type="hidden" name="option" value="com_finder">` +
  `<input type="hidden" name="view" value="search">` (and the Itemid as a hidden input — do NOT assume
  `$this->getFields()` emits it; see the Itemid addendum below, it does NOT reliably).
  Result URL = `index.php?option=com_finder&view=search&Itemid=…&q=…` → resolves to Search every time.
- **Itemid addendum (CONFIRMED, Stratum P2 re-review 2026-06):** `$this->getFields()` does **NOT reliably emit
  the `Itemid` hidden input** — the form may render only `option`/`view`/`q`. A trusted submit then produces
  `index.php?option=com_finder&view=search&q=…` WITHOUT an Itemid → T4 fails to match the Search menu item and
  renders an **EMPTY component area with `document.title` "Home"** (header+footer only, no masthead/results) — the
  same empty-component trap as P36.7. (The once-assumed "Itemid is already emitted by `getFields()`" is FALSE on at
  least some builds — corrected in the fix recipe above.) **Fix:** add the active Itemid explicitly in the override:
  `$id=(int)Factory::getApplication()->getInput()->getInt('Itemid',0); if($id) echo '<input type="hidden" name="Itemid" value="'.$id.'">';`
  (before/after `getFields()`). **Pre-flight:** after a trusted submit, assert the form contains an `Itemid`
  hidden input AND the result URL carries `Itemid=` — don't assume getFields() added it.
- **Pre-flight check:** on the live Search page, TYPE a query and press Enter AND click the button; assert the
  landing page title is "Search" (not "Home") and the result count/list render. Do this for an empty submit too.

### P28 — `com_finder` autosuggest wraps the query input in `<div class="awesomplete">` → flex bar collapses  🟠 CONFIRMED (Stratum Search)
- **What:** with `show_autosuggest` on (default), com_finder's JS wraps `#q` in `<div class="awesomplete">`
  at runtime. If your search-bar is a flexbox with `flex:1` on the **input**, that flex now applies to a
  child of the (non-growing, `flex:0 1 auto`) wrapper — so the input only takes its content width and the
  pill bar shows a large empty gap between a short input and the submit button.
- **Fix:** target the wrapper: `.bar .awesomplete{flex:1 1 auto;min-width:0;display:block}` and
  `.bar .awesomplete > input{width:100%}`. (Computed probe of the input's own `flex:1` "passes" while the
  layout is visibly broken — must screenshot or measure the input's *rendered* width vs the bar.)

### P29 — Component views render INSIDE `.t4-section-inner.container` → custom full-width bands aren't full-bleed  🟠 CONFIRMED (Stratum Search)  `[DARK-SIDE-CUTOFF]`

- **Build-time:** builder gotcha #61 (canvas-body / full-bleed pattern).
- **What:** unlike `com_content` `fullwidth.php` (which can break out), a plain component view (com_finder
  search, and any component override that paints its own `.stratum-band` sections) is rendered inside T4's
  `.t4-section-inner.container` (max-width ~1320, ~76px side inset at 1440). Custom color bands
  (masthead/results/CTA) therefore stop ~76px short of the viewport edges — most visible in DARK as the
  `[DARK-SIDE-CUTOFF]` side seam, but it's a both-themes bug.
- **Fix:** break each band out with the vw trick — `.wrapper > .band{width:100vw;margin-left:calc(50% - 50vw);
  margin-right:calc(50% - 50vw)}` (verify no `overflow:hidden` ancestor first; the inner `.container`
  re-centers content). Confirm bands measure `left:0 → right:vw` AND there's no horizontal scroll at 1440 and 390.

### P30 — DB/HTML-authored inline `style="font-size:…"` can't be eased responsively by a stylesheet rule  🟠 CONFIRMED (Stratum Typography)
- **What:** demo/specimen content authored into the article DB body (or any HTML bundle) often carries inline
  `style="font-size:48px;font-weight:700"` on the element (e.g. a type-scale "The quick brown fox" sample).
  An inline style attribute beats ANY stylesheet selector regardless of specificity, so a normal mobile
  `@media (max-width:575.98px){ .x .sample{font-size:34px} }` rule is silently ignored — the headline stays
  desktop-size on mobile and wraps to 2+ lines. Passes desktop and passes a computed probe at desktop width;
  only a 390-width screenshot or a 390-width computed probe reveals it. Easy to miss because the CSS rule
  *looks* correct and exists in the file.
- **Fix:** the mobile (and any responsive) override of an inline-styled property MUST use `!important`
  (`font-size:34px !important`) — that is the only thing that out-ranks an inline style. Better long-term:
  don't bake responsive-variant values inline in the DB; set the base value via a class so media queries can
  win normally. **Check:** for every element that gets a responsive size/spacing change, confirm it has no
  inline `style` for that same property; if it does, the media-query override needs `!important`.
- **Sibling trap (same page):** a page-scoped masthead override like `body.item-107 .masthead .title{font-size:46px}`
  (specificity 0,3,0, **no** media query) will out-rank the *mobile* rule `.masthead .title{font-size:32px}`
  (0,2,0) **inside** an `@media` block — media queries do NOT add specificity. The mobile rule must MATCH or
  EXCEED the desktop scope (re-scope it `body.item-107 …` to reach 0,3,0) to win. **Check:** any per-page
  (`body.item-N`/`.page--x`) desktop override of a property that ALSO has a mobile media-query value — make
  sure the mobile rule's selector specificity ≥ the unconditioned desktop one.

---

## F. Verification-method lessons (why platform bugs slip through)
- **Computed-style probing is necessary but NOT sufficient.** A green computed probe over a visually-broken
  render (overlay covering text, white nested panel, logo not flipped, hover-jump) still = FAIL. Always also:
  perceptual **screenshot** (light+dark+mobile), **interaction** test (hover/click/drill/accordion), and
  **image/logo dark** check — THEN computed px. See `REVIEW-FINDINGS.md` → "METHOD UPGRADE".
- **Per-component 4-axis order, no skipping:** light desktop → dark desktop → responsive light → responsive
  dark, for EVERY component top-to-bottom. Light passing ≠ dark; desktop ≠ mobile; mobile-light ≠ mobile-dark.
- **CSS ripples unpredictably:** a shared-rule fix can break a component already passed. Work sequentially,
  re-verify after every change, re-check passed components after any SHARED edit.
- **Synthetic `el.focus()` masks the BS `.form-control:focus` shorthand-vs-longhand border trap
  (HARD-TO-DETECT).** When auditing a form-field focus ring: the base input rule uses the `border` SHORTHAND
  (`border:1px solid var(--token)`) while the `:focus` rule sets the `border-color` LONGHAND
  (`border-color:var(--primary)`). With Bootstrap `.form-control` + `.form-control:focus` also in the cascade,
  a **programmatic `input.focus()`** can leave the computed `border-color` at the resting grey while the
  `box-shadow` ring DOES paint — so a computed probe reports "ring yes, border grey" and looks like a real
  bug. It is NOT: a **trusted real click** (`mcp__chrome-devtools__click` / playwright click on the actual
  input) commits the focus border to `var(--primary)` correctly. **Check/rule:** verify focus state with a
  REAL click, never `el.focus()` in `evaluate_script`; if border-color still won't flip under a real click,
  THEN it's a genuine shorthand-override or `!important` trap (pin the focus `border-color` `!important`).
  Seen on Stratum Login (#170 note) and re-confirmed on Reset/Remind (#172).

---

## com_users PROFILE / PROFILE-EDIT form rendering (found on Stratum #174–#178)

These reproduce on ANY T4 template that renders the Joomla user profile-edit view inside a
custom card without re-styling Joomla's `.control-group` machinery + JS-enhanced widgets.

- **`.control-label{float:left}` collapses `.controls` to 0 width → every bare `<input>` falls
  back to its `size=N` intrinsic (~30–240px).** (HARD-TO-DETECT: the field *looks* present, just
  tiny; the label floats away to the opposite edge.) The first profile field ("Name") is the worst
  hit. Fix: in the form-card scope force `.control-label{float:none;width:100%}` +
  `.controls{float:none;width:100%}` and inputs `width:100%`.
- **`.form-control{max-width:240px}` (T4/BS, from the `size=30` attr) caps fields even after
  `width:100%`.** Add `max-width:none` to the field rule or the card stays a column of 240px stubs.
- **Password show/hide = Bootstrap `.btn-secondary.input-password-toggle` → inherits the template's
  SECONDARY color** (on Stratum that's #0B9E8A green). After forcing inputs to 100%, the
  `.input-group`'s `flex-wrap:wrap` then **drops the toggle onto its own line**. Fix: scope the
  input-group to `flex-wrap:nowrap`, give the input `flex:1 1 auto;width:1%`, and re-skin the toggle
  as a neutral 46×46 icon button welded to the field's right edge (both themes).
- **params `<select>` fields are enhanced by Choices.js** — the visible control is `.choices__inner`
  (default `#F9F9F9`, radius 2.5px, 14px), NOT the `<select>`. Your `.controls select` rules MISS it.
  Must re-skin `.choices__inner` / `.choices__list--dropdown` / `.choices.is-open .choices__inner`
  (focus ring) in BOTH themes, else the selects render light-grey pills in dark (DARK-STUCK-LIGHT).
- **Password-strength `<meter>` (value=0) renders a bright WHITE 4px inset track in dark mode**
  (the UA default), reading as a stray white hairline under the password field. (VERY HARD-TO-DETECT:
  a computed border probe finds nothing — it's the meter's `::-webkit-meter-bar`.) Fix:
  `meter{appearance:none;background:var(--border-token)}` + style `::-webkit-meter-*` value parts.
- **Joomla emits per-fieldset `<legend>` ("Edit Your Profile", "Basic Settings")** the design usually
  doesn't have (the card already has a title) — hide them (`legend{display:none}`) or they double the
  heading + draw a hairline rule.
- **Breadcrumb leaks on com_users PROFILE (+ edit layout)** just like reset/remind — the auth pages
  are designed with NO breadcrumb. NB: `auth.css` is NOT loaded on the profile route (the profile
  override loads `profile.css`), so the reset/remind breadcrumb-hide rule does NOT cover profile —
  add `body.com_users.view-profile #t4-breadcrumbs/.t4-breadcrumbs{display:none}` to **profile.css**.
  `view-profile` covers BOTH the display view and the `layout=edit` form.
- **Profile-edit Save round-trip:** the override's two submit buttons (`name="task"`
  `value="profile.save"`/`profile.cancel"`) + `renderControlFields()` (CSRF) post to
  `index.php/component/users/?view=profile&layout=edit` and redirect to the profile view with a
  "Profile saved." success alert. Verify with a REAL click, not just attribute inspection.

## G. Content architecture / GUI-editability (see `content-architecture-audit.md`)

### P86 — T4 ships a non-empty default `site_logo` → an override honouring it renders a placeholder logo  🔴 CONFIRMED (Stratum)  HARD-TO-DETECT
<!-- old # P36 — this was a DUPLICATE of the P36 used for the com_contact/com_users form-field bugs (Section E); renumbered to the next free id P86. Prose citing "P36" for the site_logo placeholder trap refers to THIS entry (P86); P36 proper = the forms bugs. -->
- **Symptom:** a logo override that does `if ($site_settings->get('site_logo')) <img>` renders a framework/clone
  placeholder (a `static.joomlart.com` image, or the cloned `t4-blank-logo.png`/`<tpl>-logo.svg`) instead of the
  designed brand — even though the admin set no logo. Looks "fine" until you compare to the `.pen` brand.
- **Root cause:** T4's `site_logo` has a non-empty DEFAULT, so `get('site_logo')` is truthy by default.
- **Fix recipe:** treat known placeholders (`static.joomlart.com`, `t4-blank-logo`, the shipped `<tpl>-logo`) as
  "not custom" → render the designed inline brand; render `<img>` only for a genuine custom upload (svg/raster).
- **Pre-flight check:** load the header on a fresh build; confirm it matches the `.pen` brand (inline mark+wordmark,
  wordmark = Site Name) and is NOT an unexpected `<img>`; then set a custom logo and confirm it DOES render.

### P37 — T4 "Site Settings" live in `etc/site/<layout>.json` per layout, NOT `#__template_styles.params`  🔴 CONFIRMED (Stratum)
- **Symptom:** editing `#__template_styles.params` to change logo/slogan/fonts has no effect; different layouts
  (home/blog/magazine) show different/stale logos.
- **Root cause:** the "site" typelist params are file-stored per layout in `templates/<tpl>/etc/site/<layout>.json`.
- **Fix recipe:** edit the correct `etc/site/<layout>.json` (or use T4 admin Site Settings); clean stale clone
  defaults (e.g. `t4-blank-logo.png`) in ALL `etc/site/*.json`.
- **Pre-flight check:** grep `etc/site/*.json` for `site_logo`/clone placeholders; confirm each layout's value.

### P38 — `com_users.user` custom fields render on the PUBLIC registration form  🔴 CONFIRMED (Stratum)  HARD-TO-DETECT
- **Symptom:** internal editorial/KPI user-fields (author bio/role/avatar, profile KPIs) appear as inputs on
  `/registration` for anyone signing up.
- **Root cause:** user com_fields default to `access=Public(1)`; the registration form renders all Public user-fields.
- **Fix recipe:** set those fields' `#__fields.access` to **Special (3)**; read raw `#__fields_values` in overrides
  so author/profile pages still render for guests.
- **Pre-flight check:** load `/registration` (logged OUT); assert NONE of the template's `author_*`/`profile_*`
  fields are present. (Whenever a build adds user com_fields, this check is mandatory.)
- **P38 sub-variant — `plg_user_profile` floods registration with 12+ address/phone/DOB/ToS fields (CONFIRMED ja_voyara):**
  when the author/profile data source is **`#__user_profiles`** (the stock **plg_user_profile**, element `profile`
  folder `user`) — enabled so the author box reads `profile.user_jobtitle`/`aboutme`/`user_avatar` — the plugin
  injects its OWN fieldset (Address1/2, City, Region, Country, Postal Code, Phone, Website, Favourite Book, About
  Me, Date of Birth, ToS = 12–13 `jform[profile][*]` inputs) onto `/registration` for everyone. This is NOT a
  com_fields-access issue (P38 main) — it's the plugin's per-field **registration display params**, a 3-state list
  per field: `"0"`=Disabled(not shown) · `"1"`=Required · `"2"`=Optional. **Fix (STOCK plugin PARAMS only, keep
  the plugin ENABLED so the author box still populates):** PDO-set every `register-require_<field>` param to `"0"`
  in `#__extensions.params` for `element='profile' AND folder='user'`; leave `profile-require_*` untouched (admin
  can still edit a user's profile; the author box is unaffected). Idempotent seed; no plugin code touched.
  **Pre-flight:** if the registration form shows a "User Profile" fieldset / any `jform[profile][*]` input, it's
  this — fix the params, then re-confirm the author listing + single-article author box STILL render (the plugin
  must stay enabled).

### P39 — `htmlspecialchars($item->title)` double-encodes menu titles (`&` → `&amp;amp;`)  🟠 CONFIRMED (Stratum mega)
- **Symptom:** a menu/mega title containing `&`/`<`/`>` renders the literal `&amp;` ("CLI &amp; SDKs").
- **Root cause:** Joomla's menu stack already delivers `$item->title` HTML-entity-encoded; an override re-encoded it.
- **Fix recipe:** echo `$item->title` as-is; never re-encode already-encoded CMS strings.
- **Pre-flight check:** put an `&` in a menu title; confirm the rendered HTML shows `&amp;` once, not `&amp;amp;`.

### P41 — Joomla `Email Cloaking` content plugin wraps a designed FORM's input/button → button label dropped, control collapses  🔴 CONFIRMED (Nexora Changelog)  HARD-TO-DETECT
- **Layer:** Joomla core (`content - Email Cloaking` system/content plugin, on by default). **Where:** ANY `#__content` article body that contains an email-shaped string `text@text.tld` — a mailto, OR an email-shaped **placeholder/value** on a designed subscribe/newsletter/contact `<input>` (CTA forms especially).
- **Symptom:** the plugin scans the rendered body, matches the email pattern, and wraps the match (and adjacent markup) in `<joomla-hidden-mail first=… last=… text=… base64…>`, JS-rehydrated client-side. When the match sits inside a designed FORM (e.g. `placeholder="you@company.com"` on the subscribe input), it wraps the `<input>`+`<button>` **together** → the `<button>`'s text label is base64-corrupted out (e.g. "Subscribe" drops to a stray text node after `</joomla-hidden-mail>`) and the button collapses to a tiny empty box (~44×24).
- **Why HARD-TO-DETECT:** the page renders, the card/band/typography all probe green; only the button is broken. Caught only by reading `button.textContent` (empty) + `getBoundingClientRect` (collapsed) — a colour/spacing sweep misses it entirely. A screenshot at a glance can also miss a small white-on-gradient button.
- **Fix recipe (template/DB only, no core/plugin change):** entity-escape the `@` in any email-like literal inside the article body — `you&#64;company.com`. The cloaker regex runs on the raw text **before** entity decoding, so `&#64;` won't match; the browser decodes it and still displays "you@company.com". (Alternative: disable the plugin or exclude the article — but that's a global config change; the entity escape is local + portable.)
- **Pre-flight check:** after any DB/article body edit whose markup contains an email or email-shaped placeholder, assert `document.querySelector('article joomla-hidden-mail') == null` (or that the form's submit button still has its visible label + non-collapsed box). Mandatory on every subscribe/newsletter/contact CTA inside a canvas article.

### P43 — T4 `.t4-masthead-title{padding:0 284px;font-weight:400!important}` collapses/de-emphasises every canvas page heading  🔴 CONFIRMED (Nexora)  `[PALETTE-A-LEAK]`(masthead variant)

- **Build-time:** builder gotchas #38 / #60 (`page_heading` masthead) / #61 (canvas-body pattern).
- **Layer:** T4. **Where:** EVERY page that uses T4's page-heading masthead (`com_content` canvas/article pages, list views with a page title, blog/category/archive/author/tag/search mastheads) — the title element T4 emits is `.t4-masthead-title`.
- **Symptom:** the H1 renders at the WRONG weight (`400` where the design wants 600/700) and the wrong horizontal extent — T4 applies a default `padding:0 284px` (a centering inset) so a left-aligned design heading is indented ~284px and wraps early; setting `font-weight` on the component's own rule silently loses to the `!important`.
- **Root cause:** T4 ships `.t4-masthead-title{ padding:0 284px; font-weight:400!important }` as a centered/de-emphasised default. The `padding` out-extents your title and the `!important` weight beats any plain component rule (0,1,0/0,2,0).
- **Fix recipe:** in the page scope reset `padding:0` and re-assert the design weight WITH `!important` (e.g. `body.view-category .t4-masthead-title{ padding:0; font-weight:700!important; }`); align/size per the `.pen`. Token-drive the color so it flips in dark.
- **Pre-flight check:** on every masthead/page-title view, probe the H1's computed `font-weight` AND `padding` (and rendered left edge) vs the `.pen` — a `400` weight or a `284px` inline-side padding = the T4 default leaking through; a colour/text probe alone passes.

### P44 — Bootstrap bare `.btn-secondary` leaks BS stock grey/indigo on standalone/auth pages  🟠 CONFIRMED (Nexora)  `[BTN-SECONDARY-BOOTSTRAP-GREY/INDIGO-LEAK]`
- **Layer:** BS5 / template button system. **Where:** any element rendered with a bare `class="btn btn-secondary"` that the design intends as a transparent/ghost (1px-bordered) secondary button — error/offline/standalone pages (which load template CSS but not the full marketing button overrides), com_users password show/hide toggles, core component buttons.
- **Symptom:** the secondary button renders Bootstrap's stock fill — `#6366F1` indigo (BS5 `--bs-secondary` default in some palettes) or grey — instead of the design's transparent + 1px-border ghost. Most visible on standalone pages (error.php/offline.php) where the marketing `.btn` overrides aren't all in scope.
- **Root cause:** `.btn-secondary` carries Bootstrap's own `--bs-btn-bg/-color/-border-color` defaults; if the template only overrides `.btn-primary`/`.btn-light` (or the secondary override isn't loaded on standalone pages), the BS stock fill wins.
- **Fix recipe:** add a scoped, transparent + bordered override for `.btn-secondary` (`background:transparent;color:var(--heading);border:1px solid var(--border-strong)`) and ENSURE it's loaded on standalone error/offline pages too (those pages may bypass the main stylesheet bundle — add it to whatever CSS those views DO load, or `display:none` an unwanted core secondary button). Verify in both themes.
- **Pre-flight check:** on every standalone/auth page AND any view with a `.btn-secondary`, probe the computed `background-color` — assert it's `transparent`/the design ghost, NOT `rgb(99,102,241)` indigo or a BS grey.

### P45 — T4 author router: `view=author` needs an `id`, and the Authors-index link needs `layout=list` or `getMenuAuthorsId()` returns null → 404 / Home fallback  🔴 CONFIRMED (Nexora)  `[T4-AUTHOR-ROUTER]`/`[DEAD/MALFORMED-LINK]`  HARD-TO-DETECT

- **Build-time:** builder gotcha #24 (expose the standard Joomla pages set incl. author/list routes).
- **Layer:** EXT / T4 com_content author router. **Where:** any template with an Authors index + author-profile views (a Blog/People taxonomy group).
- **Symptom (two compounding traps):** (1) a single author-profile link built as `index.php?option=com_content&view=author` WITHOUT an `id` 404s (the author view needs the author's user id). (2) The Authors-INDEX menu item link must contain `layout=list` — if `layout=list` is absent (even when an `id`/Itemid is present), T4's `getMenuAuthorsId()` returns `null`, `parseRule()` sets an empty Itemid, and Joomla falls back to the DEFAULT menu item (Home). So clicking "Authors" silently lands on Home.
- **Why HARD-TO-DETECT:** both the author page and the index render fine on direct/correct navigation, so every visual/computed axis passes; only a real click through the built link (or an href assertion) exposes the 404 / Home fallback.
- **Fix recipe:** always build author-profile links with the user `id` (`&view=author&id=<userid>&layout=author`); build the Authors-index menu item / link with `layout=list` (`&view=author&layout=list&id=<...>`). Then assert the rendered hrefs resolve to clean SEF routes (not `/` and not a 404).
- **Pre-flight check:** click the Authors-index link AND each author-profile link from the nav/footer; assert the landing page is the Authors list / the correct author (not Home), and the URL is a clean route.

### P46 — MySQL `#__content.fulltext` is a RESERVED word → unbackticked references fatal/no-op every PDO write  🔴 CONFIRMED (Nexora)  `[FULLTEXT-RESERVED-MYSQL]`
- **Layer:** MySQL / PDO (any seed or content-edit script touching `#__content`). **Where:** any script that INSERTs/UPDATEs the `fulltext` column of `#__content` (demo seeding, article-body edits) — and reading it in overrides (`$item->fulltext ?? ''` to avoid undefined-property warnings on images-empty articles).
- **Symptom:** a PDO statement like `UPDATE #__content SET fulltext=? …` or `INSERT … (introtext, fulltext) …` throws a SQL syntax error (or silently fails in a try/catch), so demo content never lands — looks like the seed "did nothing".
- **Root cause:** `FULLTEXT` is a reserved MySQL keyword (the index type); used as a bare column name it's a syntax error.
- **Fix recipe:** backtick it everywhere — `` `fulltext` `` — in ALL PDO statements (and any seed script) targeting `#__content`. Read it defensively in overrides (`$item->fulltext ?? ''`).
- **Pre-flight check:** grep every seed/content-edit script for an unbackticked `fulltext` token in SQL; assert each is `` `fulltext` ``. After a seed, confirm the rows actually exist.

### P47 — `com_finder` highlighter: removing the `#highlighter-start/end` markers → `highlight.min.js` null-deref (search results JS dies)  🔴 CONFIRMED (Nexora)  `[HIGHLIGHTER-MARKERS-REQUIRED]`
- **Layer:** EXT (com_finder + `highlight.min.js`). **Where:** any `com_finder` search results override (`html/com_finder/search/default_results.php`) where you clean up the markup.
- **Symptom:** after stripping the (visually pointless) `<br id="highlighter-start">` / `<br id="highlighter-end">` marker elements around the results list, `highlight.min.js` throws a `parentNode`-is-null error and the results-list JS dies (highlighting + any dependent behaviour break).
- **Root cause:** `highlight.min.js` locates the region to highlight via `document.getElementById('highlighter-start')`/`-end` and walks `.parentNode`; remove the markers and it dereferences null.
- **Fix recipe:** KEEP the `#highlighter-start` and `#highlighter-end` marker elements in the override; just hide them visually (`#highlighter-start,#highlighter-end{display:none}`) instead of deleting them.
- **Pre-flight check:** on the live Search results page, check the console for a `highlight`/`parentNode` null error; assert both `#highlighter-start` and `#highlighter-end` exist in the DOM (even if display:none).

### P48 — `com_tags` derived-table joins must use `content_item_id`, not `core_content_id` (0 for un-synced rows); don't load `tag(s)-default` JS when the filter form is removed  🔴 CONFIRMED (Nexora)  `[TAG-MAP-CORE-CONTENT-ID-ZERO]`

- **Build-time:** builder gotcha #66 (`workflow_associations` / ucm sync for SQL-seeded content).
- **Layer:** EXT (com_tags / `#__contentitem_tag_map`). **Where:** any custom Tag or Tags-Index override (or sidebar widget) that joins the tag map to fetch the tagged articles' category/author/body.
- **Symptom:** the tagged-items list / tag sidebar comes up EMPTY for some tags even though the tag has articles. On Nexora, ~5 archived rows carried `core_content_id=0`, so a join on `core_content_id` dropped them.
- **Root cause:** `#__contentitem_tag_map.core_content_id` is the `#__ucm_content` id and is **0 for items never synced into the UCM table** (common for archived/seeded content). The reliable key to the component's real item is **`content_item_id`** (the `#__content` id), filtered by `type_alias='com_content.article'`.
- **Fix recipe:** in the derived join, select/filter on `content_item_id` (the real `#__content` id) `WHERE tag_id=<id> AND type_alias='com_content.article'`, NOT `core_content_id`. Fix BOTH the sidebar queries AND the items cat/author/body lookup. **Companion JS trap:** do NOT load `com_tags.tags-default` / `com_tags.tag-default` JS when you've removed the filter form from the override — that script reaches for the missing filter form and null-derefs.
- **Pre-flight check:** for each tag, run `SELECT content_item_id FROM #__contentitem_tag_map WHERE tag_id=<id>` — if any `core_content_id=0`, a `core_content_id` join would drop them; assert the rendered tag list count matches. Check the console for a tags-default JS null error.
- **JS-trap variant — leftover `useScript` in a form-stripped `tag/default_items.php` override (CONFIRMED ja_helix 2026-06):** the all-tags `tags/default_items.php` override may be P48-correct (never enqueues `tags-default`) while the SINGLE-tag `tag/default_items.php` override silently KEEPS the base template's `$wa->useScript('com_tags.tag-default')` (the base layout's line ~22). With the filter/ordering form removed by the override, `media/com_tags/tag-default.min.js` does `document.<form>.querySelector(...)` on a null form → `TypeError: Cannot read properties of null (reading 'querySelector') at tag-default.min.js`. The TAGS-INDEX page itself looks clean (0 errors); the error only fires after you CLICK a pill into the tag view — so it's missed unless you interact. **Detect:** click a tag pill → tag view, check console for the tag-default TypeError; grep the override for `useScript('com_tags.tag-default')`. **Fix:** delete that `useScript` line from `html/com_tags/tag/default_items.php` (no form ⇒ nothing for the script to wire). Check BOTH `tag/` and `tags/` overrides — they are independent files and one can be fixed while the other isn't.

### P49 — `com_content` categories INDEX self-links any category lacking a menu item (`getCategoryRoute` falls back to the current page)  🔴 CONFIRMED (Nexora, Meridian)  `[DEAD/MALFORMED-LINK]`
- **Layer:** EXT / Joomla content router. **Where:** the Categories-index view (a card/row grid of categories, `view=categories`) on any template with a Categories taxonomy page.
- **Symptom:** each category card's link points back to the CURRENT (Categories-index) page instead of that category's listing — clicking a category goes nowhere/loops.
- **Root cause:** `ContentHelperRoute::getCategoryRoute($catid)` can't find an `Itemid` to anchor a clean SEF when **no menu item points at that category**, so it falls back to the active menu item's route (a self-link). Categories that DO have a menu item route correctly.
- **Fix recipe:** add a hidden per-category menu item (one per category that needs to be linkable) so `getCategoryRoute` has an Itemid to anchor; then each card resolves to its own clean SEF route. (Same Itemid-anchor root cause as the P26 Home-crumb misroute.)
  - **Where to put it — `utility` menutype (rendered nowhere):** put the item in a menutype that no module renders (the standard hidden-but-routable pattern → `utility` "Utility (hidden)"), NOT `mainmenu` — else it pollutes the nav/megamenu. It still routes: a root-level `utility` item with alias `magazine` yields a clean top-level `/magazine`, its OWN Itemid + body class (`item-<id>`, not the categories-index `item-…`), and its own section masthead (mirror a sibling section's params: `component_id`, `template_style_id`, `layout=blog`, `page_heading`/`page_heading_eyebrow`/`page_heading_desc`/`page_subheading`, `show_page_heading=0`).
  - **How — Table API, NEVER raw INSERT (nested-set safety):** `$t = Table::getInstance('Menu'); $t->bind(...); $t->setLocation(1,'last-child'); $t->check(); $t->store(); Table::getInstance('Menu')->rebuild();` (bootstrap via `Joomla\Console\Application`, alias `session.cli`). A raw `INSERT` with hand-picked `lft/rgt` corrupts the nested set and collapses the megamenu. Verify: `SELECT COUNT(*),SUM(rgt<=lft)` is 0-bad before AND after; home 200; megamenu top-item count unchanged; the category card href is now the clean route; the section masthead + `item-<id>` are correct. Meridian: category 14 "Magazine" → hidden `utility` item id 151 → `/magazine` (was the `/…/sections/magazine` fallback under the categories-index Itemid). (`cli/mer-add-magazine-menu.php`.)
- **Pre-flight check:** on the Categories index, click each category card (or assert its href) — confirm it lands on that category's listing with a clean route, not back on the index.

### P50 — A pagination layout-override with a PHP parse error FATALS every list view (404/500), not just the pager  🔴 CONFIRMED (Nexora, tooling/lint)
- **Layer:** tooling / Joomla layout overrides. **Where:** `html/layouts/joomla/pagination/*.php` (or any `JLayout` pagination override) shared across blog/category/archive/author/tag/search list views.
- **Symptom:** a single syntax error in a pagination layout override takes down EVERY list view (they 404/500), not just the pagination strip — because the pager layout is rendered inside each list view's output and a parse error aborts the whole render.
- **Root cause:** Joomla `include`s the layout file during view render; a parse error is a fatal that propagates to the entire response. The blast radius is every paginated view, so it reads as a sitewide list breakage.
- **Fix recipe:** ALWAYS `php -l <file>` every pagination (and any shared layout) override after editing, before rendering. Keep the override minimal.
- **Pre-flight check:** `php -l` clean on every pagination/JLayout override touched this build; then load one list view and confirm 200.

### P51 — `display_offline_message=1` (Joomla default) makes `offline_message` TRUTHY → a `$msg ?: $branded` fallback never shows branded copy  🟠 CONFIRMED (Nexora)

- **Build-time:** builder gotcha #6 (error/offline standalone pages).
- **Layer:** CORE (Joomla global config) + offline.php override. **Where:** the offline page override that tries `echo $offlineMessage ?: $brandedDefault;`.
- **Symptom:** the offline page shows Joomla's stock "This site is down for maintenance…" string instead of the template's designed branded copy, even though you wrote a branded fallback.
- **Root cause:** with `display_offline_message=1` (the Joomla default), `$app->get('offline_message')` returns the stock `OFFLINE_MESSAGE` (a non-empty string), so the `?:` short-circuit takes the stock value and the branded default is never reached. The fallback only fires when the admin message is empty (`display_offline_message=0`), which is not the default.
- **Fix recipe:** in the offline override, prefer the branded copy UNLESS the admin has set a genuinely CUSTOM `offline_message` (i.e. detect that the stored value differs from the stock `OFFLINE_MESSAGE` / that `display_offline_message` semantics intend a custom message), otherwise always render the branded default. Don't rely on `?:` truthiness.
- **Pre-flight check:** with default config, render the offline page; assert it shows the branded copy, not "This site is down for maintenance".

### P52 — Joomla 6 enhances `<select>` with Choices.js (NOT Chosen) → `.choices__inner`/`--dropdown` need explicit dark overrides  🟠 CONFIRMED (Nexora)  `[DARK-STUCK-LIGHT]`(select variant)
- **Layer:** CORE/BS (J6 form-field enhancement). **Where:** ANY enhanced `<select>` — com_users profile params (Time Zone, Editor, Frontend Language), contact/finder filter selects, any `list`/`groupedlist` field.
- **Symptom:** in DARK, the visible select control is a light-grey pill (`#F9F9F9`) and its open dropdown is white — your `select` / `.controls select` dark rules never reach it.
- **Root cause:** Joomla 6 replaced Chosen with **Choices.js**: the real visible widget is `.choices__inner` (default `#F9F9F9`, radius 2.5px), the open list is `.choices__list--dropdown` (white), and focus is `.choices.is-open .choices__inner` — none of which match a `select` selector.
- **Fix recipe:** re-skin `.choices__inner`, `.choices__list--dropdown`, `.choices__list[aria-expanded]`, and `.choices.is-open .choices__inner` (focus ring) in BOTH themes with the surface/border/text tokens. (Confirmed on Nexora profile Time Zone widget, item-428.) Same family as the P36 com_users "params selects are Choices.js" addendum — this is the standalone platform entry.
- **GEOMETRY + CLEAR-BUTTON gotchas (Nexora profile-edit, 2nd pass):** beyond colour, Choices ships **radius 2.5px** (vs your input r10) and (in LIGHT) keeps `#f9f9f9` so the enhanced select looks DIFFERENT from the page's sibling **native** `<select>`s (which your `.edit-card select` rule already styles) — pin `.choices__inner{border-radius:10px;width:100%;max-width:none}` and a LIGHT re-skin to `#FFF`/`$border` for parity. The selected item also carries a **clear "×" button that Joomla renames `.choices__button_joomla` (NOT the upstream `.choices__button`)** — it renders as a `#E9ECEF` light-circle blob on a dark control and is absent from most designs → hide BOTH selectors. Pre-flight: probe `.choices__button_joomla` display on any enhanced select in dark.
- **Pre-flight check:** on any page with an enhanced select, open it in DARK and probe the computed `background-color` of `.choices__inner` AND `.choices__list--dropdown` — both must be the dark surface, not `#F9F9F9`/white.

### P53 — `:first-of-type`/`:last-of-type` NEVER match the first/last GROUP on a mixed-`<section>` page (the pseudo keys on element TYPE)  🟠 CONFIRMED (Nexora)  HARD-TO-DETECT
- **Layer:** CSS mechanism (recurs on EVERY canvas page built from multiple `<section>` elements). **Where:** any
  page whose top→bottom is e.g. `<section.sec-masthead>` … N×`<section.sec-faq-accordion>` … `<section.sec-cta-card>`
  and you try `.sec-faq-accordion:first-of-type{padding-top:64}` / `:last-of-type{padding-bottom:96}` to special-
  case the first/last content group.
- **Symptom:** the first/last-group spacing override silently never applies — the content group keeps the default
  padding, so the top/bottom rhythm is wrong vs the `.pen`. Looks like the rule "exists but loses"; actually it
  never matches.
- **Root cause:** `:first-of-type`/`:last-of-type` match relative to **element TYPE** (`section`), not class. Since
  the masthead and CTA are ALSO `<section>`, the *first `<section>` of type* is the masthead and the *last* is the
  CTA — so `.sec-faq-accordion:first-of-type` matches nothing. The class on the pseudo doesn't change what "type"
  it keys on.
- **Fix recipe:** use ADJACENCY / `:has()` instead — e.g. `.sec-masthead + .sec-faq-accordion{padding-top:64}` for
  the first content group, `.sec-faq-accordion:has(+ .sec-cta-card){padding-bottom:96}` for the last, and
  `.sec-faq-accordion + .sec-faq-accordion{…}` (group+group) for the middles. These key on the actual neighbours,
  not element type.
- **Pre-flight check:** any time you write `:first-of-type`/`:last-of-type` scoped to a CLASS on a page with mixed
  `<section>` types, verify the rule actually matches (it usually doesn't) — probe the computed padding of the
  intended first/last group; if it's the default, switch to adjacency/`:has()`.

### P54 — Header CTA links render as BARE children of `.t4-header-r` → the standard mobile-hide rule misses → CTA overflows/overlaps the logo at ≤mobile  🟠 CONFIRMED (Stratum)  `[GAP-MARGIN-STRAY]`/overflow  MOBILE-ONLY HARD-TO-DETECT

- **Build-time:** builder gotchas #28 (`.row.g-*` mobile overflow) / #56 (header flex one-row).
- **Layer:** T4 (header position render) + template chrome scss. **Where:** any T4 template whose desktop header
  right-cluster shows auth/CTA links (Sign in + a "Get started"/"Start free" button) and which intends to drop
  them on mobile (they live in the off-canvas drawer foot instead). Recurs on every SaaS-style header.
- **Symptom:** desktop header is perfect; at ≤ the mobile/tablet breakpoint the Sign-in link + CTA button are
  STILL in the top bar, overflow the 390px width, and **visually overlap the logo wordmark** (the CTA paints on
  top of the brand text). ONLY visible on a mobile screenshot — a desktop review + a computed probe both pass.
- **Root cause:** the common mobile-hide rule is written as `.t4-header-r > .custom`/`> .mod-custom {display:none}`
  on the assumption the CTAs sit inside a module wrapper div. But when the header partial emits the links
  **directly** (bare `<a class="btn-signin">` + `<a class="btn btn-primary">` as DIRECT children of
  `.t4-header-r`, no `.custom`/`.mod-custom`/module wrapper), the `> .custom` selector matches nothing → the
  links never hide → they overflow. The hide rule "exists" but targets a wrapper that isn't there.
- **Fix recipe:** in the `@media (max-width:991.98px)` (or template's mobile) block, ALSO hide the bare link
  children directly: `.ja-header .t4-header-r > .btn-signin, .ja-header .t4-header-r > .btn.btn-primary
  {display:none !important}` (keep the existing `> .custom`/`> .mod-custom` for templates that DO wrap). The
  drawer foot keeps its own copies (they're inside `.c-offcanvas`, not `.t4-header-r`, so unaffected). Re-verify:
  mobile bar = Logo+Toggle+Hamburger, `scrollWidth==innerWidth`, no logo overlap; desktop still shows the CTAs.
- **Pre-flight check:** screenshot the header at 390px (light AND dark) — assert the right cluster is ONLY the
  designed mobile items (per the `.pen` Mobile Header frame) and `document.documentElement.scrollWidth==innerWidth`;
  inspect `[...document.querySelector('.t4-header-r').children]` and confirm any desktop-only CTA child reports
  `offsetParent===null` (hidden) at mobile. Don't trust that a `> .custom` hide rule covers them — check the
  actual child tag/class.

### P55 — `Text::_('KEY') ?: $fallback` NEVER falls back: a missing lang key returns the truthy UPPERCASE key → raw `TPL_*`/`COM_*` keys render on screen  🟠 CONFIRMED (Stratum)  `[RAW-LANG-KEY]`

- **Build-time:** builder gotcha #63 (untranslated constants / lang keys render raw).
- **Layer:** Joomla core (`Joomla\CMS\Language\Text::_`). **Where:** any override/ACM tmpl that writes
  `echo Text::_('TPL_X_FOO') ?: 'Foo';` (or `Text::_(...) ? : ...`) intending the literal as a graceful default
  when the key is missing. Found on JA Stratum Home pricing billing-toggle pills (`TPL_STRATUM_BILLING_MONTHLY`/
  `_ANNUAL`) which rendered the raw key text.
- **Symptom:** the UI shows the literal ALL-CAPS key (`TPL_STRATUM_BILLING_MONTHLY`) instead of "Monthly".
- **Root cause:** when a key is undefined, `Text::_()` returns the key **uppercased** (e.g. `TPL_STRATUM_BILLING_MONTHLY`),
  which is a **non-empty (truthy) string** — so the PHP `?:` / `?? :` fallback to the literal NEVER executes. The
  author's safety net is dead. Compounded by the JA ACM addon loading lang from `JPATH_SITE/language/...`: the
  key can exist in `templates/<tpl>/language/...` yet be MISSING from the stale `site/language/en-GB/en-GB.tpl_<tpl>.ini`
  the addon actually reads (same root as the SKILL's "ACM labels resolve in admin" check).
- **Fix recipe (preferred):** add the key to the language ini — to BOTH `templates/<tpl>/language/en-GB/en-GB.tpl_<tpl>.ini`
  AND the site copy `<site>/language/en-GB/en-GB.tpl_<tpl>.ini` (the ACM addon reads the site one). Keep the
  template ini committed for quickstart reproducibility; if you patch the live site ini directly, ensure the DB
  dump / quickstart carries it. (Alt code fix if you can't touch lang: `($k=Text::_('KEY'))===.'KEY' ? 'Fallback' : $k`,
  but adding the key is cleaner + GUI-consistent.)
- **Pre-flight check:** grep override/ACM PHP for `Text::_(` followed by ` ?: ` / ` ?? ` — each is a latent raw-key
  if the key is missing; then scan rendered pages for ALL-CAPS `TPL_`/`COM_` tokens (also catches keys with no
  fallback at all). For ACM specifically, diff `templates/<tpl>/language/en-GB/*.ini` keys vs the site copy.

### P56 — a `will-change`/transform compositing layer on the HEADER stops its dropdown from painting+hit-testing over later sections → mega items vanish/unclickable on hover-travel  🔴 CONFIRMED (Nexora)  `[MEGAMENU-HOVER-DEADZONE]`  HARD-TO-DETECT

- **Build-time:** builder gotcha #55 (megamenu header one-row / hover behaviour).
- **Layer:** template CSS/JS (scroll-reveal) interacting with browser compositing — NOT a T4 hover bug. **Where:** any desktop (≥992px) mega/grouped dropdown when the header (or an ancestor of the dropdown) has a PERSISTENT compositing/stacking trigger (`will-change`, `transform`, `filter`, `perspective`, `opacity`<1).
- **Symptom:** hover a top-level mega item → panel opens visibly; move the cursor DOWN into the panel and it vanishes / items can't be clicked (clicks "fall through" to the page behind). Looks identical to a hover dead-zone, which sends you down the wrong path.
- **TRUE root cause (proven via `elementFromPoint`):** a scroll-reveal class (e.g. `.reveal { will-change: opacity, transform }`) left PERMANENTLY on the header `.t4-section` promotes the header to its own composited layer / new stacking context. The header's absolutely-positioned dropdown then **cannot paint or hit-test above LATER sibling sections** (the hero/first content band). With the panel open (`display:block`, `opacity:1`, high z-index, correct rect), `document.elementFromPoint(x,y)` sampled across the panel returns the **hero section**, not the panel — so moving the cursor "into" the panel actually lands on the hero → the trigger gets `mouseleave` → menu closes, and clicks hit the hero. The hover/JS timing is a RED HERRING.
- **DETECTION (do this FIRST, before blaming hover):** open the panel, then `elementFromPoint` at several points across its rect — if it returns a sibling section (hero/main) instead of the panel/`.dropdown-menu`, it's this compositing bug. Confirm by toggling `will-change:auto` (and removing `transform`/`filter`) on the header section alone → panel becomes hit-testable.
- **Fix recipe (template only):** remove the PERSISTENT compositing trigger from the header/sticky ancestor. (a) Exclude header / sticky / any megamenu-containing `.t4-section` from the scroll-reveal that adds `.reveal` (they never need to fade in). (b) Make `will-change` TRANSIENT — drop it to `auto` once `.reveal.is-in` settles; never leave `will-change`/`transform` on a dropdown ancestor. (c) Safety net: `.t4-header, .t4-sticky, .site-header, .reveal:has(.t4-megamenu){ will-change:auto !important }`. Verify the header's computed `will-change` is `auto` and it has no `transform`.
- **Secondary (complementary, not the fix):** a desktop hover-intent JS shim — on each top-level `.nav-item.dropdown`, replace T4's immediate `mouseleave` close with a ~360ms grace cancelled while the cursor is over the item OR its panel (the panel is a DOM child) — smooths genuine trigger→panel travel timing. Keep it, but it does NOT fix the compositing hit-test bug above.
- **Pre-flight check:** with a mega panel open, assert `elementFromPoint` across the WHOLE panel returns nodes inside the panel (not the hero); then slowly move the cursor onto a panel link and click — it must stay open and the click must land. A computed/`:hover`-CSS probe passes while the live interaction fails — this is interaction + compositing, invisible to style probing.

### P57 — T4 module-chrome band gradient + white radial `::before` glow leaks behind a CARD-style CTA  🟠 CONFIRMED (Nexora)  `[CTA-BAND-GLOW-LEAK]`
- **Layer:** T4 / ACM module chrome + template scss. **Where:** a CTA section whose VISUAL is a self-contained gradient CARD (e.g. `.sec-cta-card`) but which is wrapped by a module-chrome class that ALSO paints a full-width band (`.sec-cta-band` or similar) — i.e. the band styling was authored for a band-style CTA and reused for the card variant.
- **Symptom:** in DARK especially, a soft white/colored radial glow paints on the dark page background OUTSIDE the rounded card (the band's `::before` glow + the band's own gradient bleed around the card edges). The card itself looks right; the leak is in the surrounding band.
- **Root cause:** the band class applies `background:<gradient>` plus a `::before{ background:radial-gradient(... rgba(255,255,255,...) ...) }` glow intended to fill the FULL-WIDTH band. When the same class wraps a card, the band area is just page background, so the gradient + radial glow render as a stray halo around the card.
- **Fix recipe:** suppress the band background AND its `::before` glow when the band wraps a card — `:has()`-scope it: `.sec-cta-band:has(.sec-cta-card){ background:none } .sec-cta-band:has(.sec-cta-card)::before{ content:none }`. The card keeps its own gradient; the band becomes transparent so the page bg shows through cleanly in both themes.
- **Pre-flight check:** in DARK, screenshot any card-style CTA; assert no glow/gradient paints outside the card's rounded box. Probe the band wrapper's computed `background-image` (should be `none`) and that its `::before` has `content:none` when it contains the card.

### P58 — T4 base `.t4-main-body{padding-top:Npx}` leaves a blank band between the sticky header and a full-width masthead on inner pages  🟠 CONFIRMED (Nexora)  `[STICKY-HEADER-CONTENT-GAP]`
- **Layer:** T4 (base layout). **Where:** any inner page whose first content block is a full-width masthead/hero band (`.sec-masthead`) directly under a sticky/fixed header.
- **Symptom:** a blank strip of page background sits between the bottom of the sticky header and the top of the masthead band — the masthead should butt directly against the header.
- **Root cause:** T4 ships `.t4-main-body{ padding-top:Npx }` (offset so non-bleed content clears a fixed header). On pages that OPEN with a full-bleed masthead, that padding becomes a visible gap above the band.
- **Fix recipe:** zero the padding only when the body opens with a masthead — `.t4-main-body:has(.sec-masthead){ padding-top:0 }`. Leave the default for pages that don't lead with a full-bleed band (they still need the header clearance).
- **Pre-flight check:** on every inner page that opens with a full-width masthead, probe `getComputedStyle(document.querySelector('.t4-main-body')).paddingTop` (want `0px`) and screenshot the header↔masthead seam — no page-bg strip between them.

### P59 — `{loadposition}` ACM stacks inherit faint seam borders/margins from T4 base `.moduletable`  🟡 CONFIRMED (Nexora)  `[LOADPOSITION-MODULETABLE-SEAM]`

- **Build-time:** builder `editability-standards.md` §9 (override the T4-base `.moduletable` box).
- **Layer:** T4 (base) + ACM. **Where:** marketing PAGES built as ACM section stacks rendered through `{loadposition X}` in an article/canvas body (extends the existing single-`.moduletable`-border note to the multi-stack `{loadposition}` case).
- **Symptom:** faint hairline seams / extra margins appear BETWEEN the stacked sections of a `{loadposition}` page — the bands don't butt cleanly the way they do when placed via the template's own positions.
- **Root cause:** each module emitted by `{loadposition}` is wrapped in T4's base `.moduletable`, which ships a default border/margin/padding. Unless the module's chrome token is set to **`,none`** (e.g. `{loadposition X,none}` / the ACM "no chrome" style), every stacked module draws its own box edges → seams between bands.
- **Fix recipe:** prefer `,none` chrome on the loadposition token so no `.moduletable` wrapper chrome renders. Defensively ALSO add a page-scoped reset on the canvas wrapper: `.<tpl>-canvas-page .moduletable{ border:0; margin:0; padding:0 }` so any module that slips through with default chrome still butts cleanly.
- **Pre-flight check:** on every `{loadposition}` marketing page, screenshot the band-to-band seams (light + dark) and probe a `.moduletable`'s computed `border`/`margin` — want 0; any hairline/gap = the base chrome leaking.

### P60 — Bootstrap `<pre>` stays near-white under `data-bs-theme=dark` → article code blocks are unreadable gray-on-white in dark  🟠 CONFIRMED (Nexora)  `[ARTICLE-CODE-BLOCK-UNREADABLE-DARK]`

- **Build-time:** builder gotcha #67 (dark code blocks — `<pre>` under `data-bs-theme=dark`).
- **Layer:** BS (Bootstrap reboot) + com_content prose. **Where:** any blog/single-article body that contains a `<pre>`/`<pre><code>` code block.
- **Symptom:** in DARK the article's code block renders as gray text on a near-white/very-light surface — illegible against the dark page. (Light mode looks fine, so a light-only review passes it.)
- **Root cause:** Bootstrap's reboot styles `<pre>` with a near-white surface and dark text and does NOT remap it under `data-bs-theme=dark`; the article prose container inherits that default, so the code block never flips.
- **Fix recipe:** ship an ALWAYS-dark code-block rule for the single-article prose (it reads well in BOTH themes): `<pre>` `background:#0d1018; color:#e7eaf5;` (plus a sensible radius/padding/mono font). Make the inline `<code>` chip theme-aware (flip its bg/text with the theme) so inline code stays legible in light too. Scope to the article prose container so it doesn't hit code-styled UI elsewhere.
- **Pre-flight check:** on EVERY blog/article that contains code, screenshot the `<pre>` block in DARK and probe its computed `background-color` (must be the dark code surface, NOT `#fff`/near-white) and `color` contrast.

### P61 — Doubled check glyph: inline lucide `<svg>` tick AND CSS `li::before{content:"✓"}` both render  🟡 CONFIRMED (Nexora)  `[DOUBLE-TICK-GLYPH]`
- **Layer:** template markup + scss (recurs whenever a list ships both an icon element and a CSS pseudo-marker). **Where:** feature/benefit/checklist lists.
- **Symptom:** each list item shows TWO check marks — an SVG tick (from the markup) immediately followed (or preceded) by a second ✓ from a CSS `::before`.
- **Root cause:** the list markup already emits an inline lucide `<svg>` tick per `<li>`, AND a leftover scss rule adds `li::before{ content:"✓" }` (a belt-and-braces marker from an earlier markup that had no SVG). Both paint.
- **Fix recipe:** drop the CSS `::before{content:"✓"}` and keep the inline SVG (the designed, themeable glyph). If the markup ever ships WITHOUT the SVG, keep the `::before` instead — never both.
- **Pre-flight check:** screenshot any checklist; assert exactly ONE tick per item. Probe: does the `<li>` contain an `<svg>`/icon AND a non-empty `::before` `content`? Both present = doubled glyph.

### P62 — Canvas article with `layout=fullwidth` in the menu link renders fullwidth.php regardless of `template_style_id=0` (no chrome-blob)
- **Symptom / suspicion:** a menu item pointing at a canvas/landing article has `template_style_id=0` while sibling landing pages use the dedicated Full-Width style id. Reviewer flags a likely [CHROME-BLOB-RENDER] (raw article text + page-heading + author byline + duplicate breadcrumb).
- **Reality:** when the menu link itself carries `&layout=fullwidth` (e.g. `index.php?option=com_content&view=article&id=88&layout=fullwidth`), Joomla resolves the `com_content/article/fullwidth.php` template override by the LAYOUT param — independent of the template style. The page renders the full-bleed canvas + its ACM modules correctly; `template_style_id=0` is benign (it only falls back to the default site style for chrome, which is the same template).
- **When tsid actually matters:** only if the layout param is ABSENT from the link AND the override is keyed off the style/position — then tsid=0 can mis-route to a default layout. So check the LINK's `layout=` first.
- **Pre-flight / verify:** visit the page via every link that reaches it; confirm wrapper class (e.g. `.stratum-page--<alias>`) + ACM modules render + NO `.page-header h2`/`.article-info`/`.createdby`. If those chrome-blob markers are absent, do NOT change tsid (avoids a needless nested-set-adjacent edit). Only set `template_style_id` when the blob actually renders AND the link lacks `layout=fullwidth`.

### P63 — `tsid=0` on a list view: the `layout=X` LINK param picks the component OVERRIDE, but SIDEBAR/CTA POSITIONS come from the template-STYLE layout JSON → missing sidebar/CTA, NOT a blob  🟠 CONFIRMED (Stratum Blog)  `[CHROME-BLOB-RENDER]`(near-miss variant)  HARD-TO-DETECT
- **Layer:** T4 (template-style → `etc/layout/<style>.json` mapping) + Joomla com_content. **Where:** any `view=category&layout=blog` / `&layout=list` (or featured/archive) menu item with `template_style_id=0`, where the DESIGN's sidebar + extra bands live as **positions in a dedicated layout JSON** (e.g. `blog.json`'s `blog-sidebar` + `section-5` CTA) used only by a specific template STYLE.
- **Symptom:** the page is NOT a chrome-blob (the `blog.php`/component override fires because the LINK carries `layout=blog`, so masthead/breadcrumb/grid/pagination all render styled). But the **sidebar and any designed extra bands (CTA) are SILENTLY ABSENT** — because with `tsid=0` the page renders under the **`default` template-style layout** (which has `sidebar-l`/`sidebar-r` empty positions, no `blog-sidebar`, no CTA `section-5`). The designed `blog` layout (with those positions) is attached to a different style id (e.g. 35 "Blog").
- **Why HARD-TO-DETECT:** it passes the P62 anti-blob check (no `.createdby`/page-heading) AND a CSS/computed sweep of what IS rendered (masthead/cards all correct), so "the blog renders the designed layout" reads as PASS. Only a **structural diff vs the `.pen`** (count the bands: is there a sidebar column? a CTA band?) catches it. Compounding: the sidebar/featured/CTA modules may also be pinned to a DEAD `#`-trigger menu item (a "Pages"-style mega parent) instead of the canonical list item, so even switching the style shows an empty sidebar until the modules are re-assigned.
- **Root cause:** the LINK's `layout=` param resolves the **component view override** (`html/com_content/category/blog.php`); the **template-style** (`template_style_id`) independently resolves `etc/layout/<style>.json` which supplies the **page POSITIONS** (sidebar, extra bands). `tsid=0` = "use the site default style" = the `default` layout, NOT the `blog` layout. The two are orthogonal — `layout=blog` does NOT pull `blog.json`.
- **Fix recipe (safe — `template_style_id` is nested-set-allowed):** set the list item's `template_style_id` to the style whose `etc/layout/*.json` carries the designed positions (the "Blog"/"Full Width" style). THEN ensure the sidebar/featured/CTA **modules are assigned to that menu item** (`#__modules_menu.menuid`) — they're often pinned to a sibling `#`-trigger; reassign (module flag, not nested-set). Set the menu params (`num_leading_articles`/`num_intro_articles`/`num_columns`/`num_links`) so the component grid matches the `.pen` once the layout supplies the bands. Clear cache; verify sidebar + CTA appear, mega + home still 200.
- **Pre-flight check:** for every list/blog/category/featured/archive menu item, read its `template_style_id`; if 0 (or the generic default), open the live page and **structurally diff the band/column count against the `.pen`** — a present-but-degraded layout (no sidebar / no extra band) is the tell. Confirm the designed positions exist in the *default* style's layout JSON; if not, point tsid at the style that has them.

### P64 — `mod_tagspopular` chip bg lives on `<li>` w/ class `.tagspopular`/`.mod-tagspopular` (NOT `.mod-tags-popular`) → dark overrides keyed to `.mod-tags-popular a` are DEAD → tag chips stay light in dark  🟠 CONFIRMED (Stratum Blog)  `[DARK-STUCK-LIGHT]`  HARD-TO-DETECT
- **Layer:** EXT (`mod_tags_popular` / Joomla `com_tags`). **Where:** any dark sidebar/footer containing a Popular-Tags module (blog sidebar, tags index, author pages).
- **Symptom:** in dark, the tag cloud chips render the LIGHT grey bg (`#e9ecef`/BS `--bs-gray-200`) → bright rectangles on the dark page. The author's darkmode rule "exists" but never applies.
- **Root cause — TWO compounding gotchas:** (1) the rendered module wrapper class is **`.mod-tagspopular` / `.tagspopular`** (one word, no hyphen) — NOT `mod-tags-popular`; a dark rule written `.…  .mod-tags-popular a {…}` matches NOTHING. (2) The chip background + radius + padding are set on the **`<li>`** (`.tagspopular ul > li{background:#e9ecef;border-radius:.25rem}`), with a bare `<a>` inside — so even a correctly-named rule that only colors the `<a>` leaves the chip bg light. (Stock Joomla styles the `<li>`, not the `<a>`.)
- **Fix recipe:** target `.<sidebar> .tagspopular ul > li{ background/border → dark tokens }` and `… > li > a{ color → text token }` (and light: re-skin to the design's chip — pill radius, tint bg — since the stock chip is square BS grey). Verify the **computed `<li>` background** in dark, not the `<a>`. (If darkmode.css is off-limits, load it as a per-view overlay via the override's `addStyleSheet`, scoped `html.t4-dark`.)
- **Pre-flight check:** in dark, probe `getComputedStyle(document.querySelector('.tagspopular ul > li')).backgroundColor` ≠ light grey. Don't grep for `.mod-tags-popular` — confirm the LIVE class first.

---

### P69 — Per-page auth.css bundled BEFORE template.css
<!-- renumbered from a duplicate "P65" (Nexora P65 = footer showtitle leak already held it); prose citing "P65" for auth.css bundle-order cascade = THIS entry (P69). --> in T4 optimize → same-spec overrides lose cascade  🔴 CONFIRMED (Stratum Reset/Auth)  `[SECTION-HEIGHT/PADDING-WRONG]`  HARD-TO-DETECT

- **Layer:** T4 optimize bundler. **Where:** any auth page (login/register/reset/remind/profile) that uses a per-page CSS overlay (`addStyleSheet`) bundled earlier in the optimize hash than `template.css`.
- **Symptom:** auth-page-specific padding/font-size rules in the overlay CSS are silently overridden by the base template.css rules that appear LATER in the same bundle. Example: `auth.css` section-padding rule (`.stratum-auth-section{padding-top:48px}`, 0,1,0) appears at bundle pos~4400; base `template.css` `.stratum-band{padding-top:80px}` (0,1,0) appears at pos~9000 → base wins → 80px on reset page. The overlay rule EXISTS and appears correct in the source file but loses the cascade invisibly. Passes a `grep css rule exists` check; only a live `getComputedStyle` probe reveals it.
- **Root cause:** T4 bundles CSS files in the order they are registered; `addStyleSheet` in a component override fires early (during component execution, before T4 generates the page layout CSS). Equal-specificity same-property rules → last source wins → template.css base rules override the early overlay.
- **Why HARD-TO-DETECT:** the padding CSS rule exists in the overlay file and reads correctly in a text editor; the defect is only visible as a live computed mismatch. A `grep`/file-read audit of auth.css says "48px" while the browser renders "80px". The computed probe shows "80px" — but only if you think to check (easy to assume an authored value is applied).
- **Confirmed cases (Stratum):** reset masthead 72px (base) vs 64px (.pen); reset auth section 80px (base) vs 64px (.pen); mobile variants same pattern.
- **Fix recipe:** for any auth.css padding/font rule that must override a template.css base rule:
  (a) Scope under a page-wrapper class present ONLY on auth pages (`.stratum-auth--rr`, `.stratum-auth`, etc.) to raise specificity to 0,2,0, OR
  (b) Use `!important` (belt-and-suspenders when scoping also helps).
  NEVER rely on source-order alone in a T4 optimize bundle — the bundle order is not guaranteed to preserve addStyleSheet registration order across T4 versions.

### P70 — Blog sub-category article-count trap
<!-- renumbered from a duplicate "P66" (Nexora P66 = social-tile dark already held it); prose citing "P66" for blog sub-category count-zero = THIS entry (P70). -->: `#__content.catid` points to the child, not the parent → parent `catid = N` query returns 0  🔴 CONFIRMED (Stratum Author Listing)  `[FAKE-STAT / COUNT-ZERO]`  HARD-TO-DETECT

- **Layer:** Joomla com_content / custom PHP. **Where:** any template PHP that counts articles by `catid = <parent>` (e.g. `COUNT(*) WHERE catid = 21`), when the actual articles are filed under sub-categories of that parent.
- **Symptom:** All per-author article counts show 0. No PHP error; the query runs cleanly and returns 0. The content table has the articles, they are published, but their `catid` points to a child category (22, 23, …), not the parent (21). A check of `#__content WHERE created_by = X` returns the correct rows when catid is NOT filtered, leading the developer to suspect a created_by mapping issue first.
- **Root cause:** Joomla allows multi-level category trees. When an article is placed in "Compute" (catid=22, child of "Stratum Blog" catid=21), `#__content.catid = 22` — NOT 21. A query `WHERE catid = 21` returns 0 because no articles are DIRECT children of the blog parent; they live in sub-categories.
- **Why HARD-TO-DETECT:** The query returns 0 with no error. A `SELECT * FROM #__content WHERE catid = 21` in a DB tool confirms 0 rows, which looks correct until you realize all the articles are at catid 22-27. The PHP function name (`stratum_author_article_count`) gives no hint about the catid scope.
- **Confirmed cases (Stratum):** `stratum_author_article_count()` in `_stratum_authors.php` — all 6 persona authors showed "0 posts" because their articles were in subcategories 22-27 (Compute/Databases/Networking/Security/AI-ML/Observability); catid=21 (Stratum Blog parent) had 0 direct articles.
- **Fix recipe:**
  1. First query `#__categories WHERE parent_id = <blog_parent_id> AND published = 1` → get all child catids.
  2. Build `$catIds = array_merge([<parent>], $childCatIds)`.
  3. Query `#__content WHERE catid IN (<parent>, <child1>, <child2>, …)`.
  This is safe for any depth-1 structure (direct children); for deeper nesting, use the nested-set `lft/rgt` range of the parent category instead.
- **Same fix required for:** article-count in author cards, total-reads aggregates, "posts by category" counters, any pagination that limits to a parent catid.
- **Pre-flight check:** before counting articles by a parent `catid`, run `SELECT id FROM #__categories WHERE parent_id=<parent> AND published=1` to enumerate the child catids, then assert your count query uses `catid IN (<parent>,<children…>)`. Cross-check against the unfiltered `SELECT COUNT(*) FROM #__content WHERE created_by=X` (or the parent's nested-set `lft/rgt` range) — if the catid-filtered count is 0 but the unfiltered count is non-zero, the articles live in sub-categories and this trap is firing.

### P71 — `publish_down=
<!-- renumbered from a duplicate "P67" (Stratum P67 = ucm core_catid already held it); prose citing "P67" for publish_down vs NULL archive = THIS entry (P71). -->'0000-00-00 00:00:00'` vs NULL in Joomla 6 archive model → seeded archived articles invisible  🔴 CONFIRMED (Stratum Archive)  `[CONTENT-INVISIBLE]`  HARD-TO-DETECT

- **Build-time:** builder gotcha #54 (future-dated / zero-date demo content vanishes).

- **Layer:** Joomla com_content `ArticlesModel`. **Where:** `com_content` archive view (com_content archive view, state=2) — and potentially any com_content list view that checks publish_down.
- **Symptom:** Newly seeded archived articles (state=2) do not appear in the archive view even though they are in the DB with the correct state, catid, and access level. `SELECT * FROM #__content WHERE state=2` returns the expected rows; the archive URL returns an empty list or only shows the original 2 pre-existing articles.
- **Root cause:** `ArticlesModel::getListQuery()` includes the filter `(a.publish_down IS NULL OR a.publish_down >= NOW())`. In MariaDB/MySQL, `'0000-00-00 00:00:00'` IS NOT NULL (zero-date is a valid datetime literal) AND is numerically less than any real timestamp like NOW(). So an article with `publish_down = '0000-00-00 00:00:00'` fails the IS NULL branch (false) AND fails the `>= NOW()` branch (false) → the entire AND condition is false → article excluded. This affects any INSERT that leaves `publish_down` at its column default (`'0000-00-00 00:00:00'`).
- **Why HARD-TO-DETECT:** A direct `SELECT` of the article returns it. The archive model's query is generated dynamically and the zero-date exclusion is not obvious from reading the archive template PHP. An author looking at the DB sees "published=2, state=2, correct catid" and concludes the article SHOULD appear; the exclusion comes from a WHERE condition in a model several layers away from the template override. The model also silently returns 0 items for the page (no error).
- **Confirmed case (Stratum):** Articles 108–118 seeded via raw SQL INSERT with `publish_down` omitted → MariaDB set column default `'0000-00-00 00:00:00'` → archive view showed 0 of 11 new articles. Fix: `UPDATE str_content SET publish_down=NULL WHERE state=2 AND publish_down='0000-00-00 00:00:00'` → all 13 articles appeared.
- **Fix recipe:**
  1. Always include `publish_down = NULL` (not omitted, not `'0000-00-00 00:00:00'`) in any INSERT for archived articles.
  2. After any batch seed, run: `SELECT id FROM #__content WHERE state=2 AND publish_down='0000-00-00 00:00:00'` — if non-empty, UPDATE to NULL.
  3. Alternatively: `INSERT ... publish_down = NULL` explicitly in every seed script.
- **Scope:** Affects com_content archive view and possibly category list/featured views in Joomla 6 on MariaDB 10.x+ where `'0000-00-00 00:00:00'` is permitted (strict mode may reject it in some configs but the default MariaDB config allows it).
- **Pre-flight check:** After seeding any state=2 articles, run `SELECT COUNT(*) FROM #__content WHERE state=2 AND publish_down IS NULL` vs the archive view item count. If they don't match, check publish_down='0000-00-00 00:00:00' rows.

### P65 — `showtitle=1` mod_menu/module used as a footer column leaks the admin module TITLE (e.g. `[Tpl] Footer - Product Links`) as the visible column heading  🟠 CONFIRMED (Nexora)  `[RAW-MODULE-TITLE-LEAK]`
- **Layer:** EXT (module chrome) + admin-findability convention collision. **Where:** any footer (or sidebar) where designed column headings are the module title rendered by T4 module chrome, AND the module was given a `[<Tpl>] <Page> - <Section>` admin-findable title per the module-title convention (editability-standards §7).
- **Symptom:** the footer column heading on the FRONTEND reads the full admin title (`[NEXORA] FOOTER — PRODUCT LINKS`) instead of the designed label (`PRODUCT`). A computed probe of the title (mono font, $text-dim colour) PASSES — only reading the visible TEXT catches it.
- **Root cause:** T4 module chrome prints `$module->title` when `showtitle=1`; the admin-findability prefix/suffix is part of that title, so it shows verbatim. The `[<Tpl>] <Page> - <Section>` findability convention conflicts with a module whose title is ALSO the on-screen heading.
- **Fix recipe:** for modules whose title is DISPLAYED, set the module title to the clean designed label (`Product`/`Developers`/`Company`) — it IS the UI-editable heading — and rely on POSITION (`footnav-1..N`) + module type for admin findability. Keep `[Tpl] …` titles ONLY on `showtitle=0` modules. (DB edit via PDO.)
- **Pre-flight check:** screenshot every footer/sidebar column heading and READ the text — assert it's the designed label, not an `[Tpl]`/`- Links` admin string. Probe `SELECT id,title,showtitle FROM #__modules WHERE position LIKE 'foot%'` — any `showtitle=1` with a `[Tpl]`-prefixed title is this bug.

### P66 — Dark `background` override for a social/icon-tile set targets ONE markup variant (`.nx-mf-social`) but the rendered ACM uses another (`.social-list`) → tiles stuck WHITE in dark  🟠 CONFIRMED (Nexora mobile footer)  `[DARK-STUCK-LIGHT]`(incomplete-override)
- **Layer:** template darkmode.scss (incomplete selector coverage). **Where:** footer/mobile-footer social tiles, any icon-tile set that exists in TWO markup variants (a hand-built one + an ACM-rendered one) where the dark `background`/`border` rule was written for only one class.
- **Symptom:** the social tiles flip dark in the DESKTOP footer (rule covers `.site-footer .social-list .social-link`) but stay `#FFFFFF`/light-border in the MOBILE footer because that block's dark `background` rule was scoped only to `.nx-mf-social .social-link` while the ACM emits `.social-list .social-link`. The COLOR rule covered both variants (so icons are right colour) but the BG rule covered one → white tiles. Easy to miss: desktop dark passes, only mobile dark leaks.
- **Root cause:** two emit paths for the same component; the dark `background`/`border-color` rule enumerated one class list, the `color` rule a different (fuller) list. Classic P1 incomplete-override.
- **Fix recipe:** make the dark `background`/`border` selector list MATCH the `color` list (add the `.social-list` variant). After any dark fix to a tile set, grep the darkmode block and assert the bg rule and the color rule cover the SAME selector set.
- **Pre-flight check:** in dark, probe the computed `background-color` of EVERY social/icon tile variant (desktop footer AND mobile footer AND off-canvas) — all must be the dark `$bg-card`, none `#FFFFFF`. Don't assume one fix covers both footers.

### P67 — `str_ucm_content.core_catid` stale when articles are SQL-seeded → ALL tagged items return 0  🔴 CONFIRMED (Stratum)  `[TAG-ITEMS-EMPTY]`

- **Build-time:** builder gotcha #66 (`workflow_associations` / ucm sync for SQL-seeded content).
- **Layer:** CORE (`com_tags` + `str_ucm_content`). **Where:** any T4 Joomla 6 site where demo content is seeded via raw SQL INSERT (not via Joomla admin UI Save).
- **Symptom:** every tag page shows "0 articles tagged X" / empty grid even though `str_contentitem_tag_map` has rows with valid `content_item_id` values. The count `SELECT COUNT(*) FROM #__contentitem_tag_map WHERE tag_id=N` is non-zero but the component returns nothing.
- **Root cause:** `getTagItemsQuery()` (TagsHelper.php) INNER-JOINs `#__ucm_content` on `core_content_id`, then LEFT-JOINs `#__categories` on `c.core_catid` and filters `(c.core_catid=0 OR tc.published=1)`. If `ucm_content.core_catid` points to a different (possibly unpublished) category — which happens when articles are saved via SQL without updating UCM — every article fails the `tc.published=1` check and the query returns 0 rows. The mismatch is invisible from `str_content` alone.
- **Fix recipe:** after bulk SQL article insert, run: `UPDATE #__ucm_content uc INNER JOIN #__content c ON c.id=uc.core_content_item_id SET uc.core_catid=c.catid, uc.core_state=c.state WHERE uc.core_type_alias='com_content.article' AND (uc.core_catid!=c.catid OR uc.core_state!=c.state);`
- **Pre-flight check:** Before reviewing any tag page, run `SELECT COUNT(*) FROM #__ucm_content uc JOIN #__content c ON c.id=uc.core_content_item_id WHERE uc.core_type_alias='com_content.article' AND uc.core_catid!=c.catid`. Any non-zero result → fix FIRST or every tag page will appear empty. Also check: `SELECT m.tag_id, COUNT(DISTINCT m.content_item_id) AS map_cnt, COUNT(DISTINCT c.core_content_id) AS ucm_cnt FROM #__contentitem_tag_map m LEFT JOIN #__ucm_content c ON c.core_content_id=m.core_content_id AND c.core_type_alias=m.type_alias WHERE m.type_alias='com_content.article' GROUP BY m.tag_id` — if `ucm_cnt < map_cnt` for any tag, the UCM is broken.
- **Confidence:** CONFIRMED (Stratum 2026-06-20; 21 articles affected, all tag pages returned empty).

### P68 — T4 standalone page (`offline.php`, `error.php`) crashes with "Call to undefined method stdClass::get()" on `onBeforeRender`  🔴 CONFIRMED (Stratum Offline)  `[STANDALONE-PAGE-CRASH]`  HARD-TO-DETECT

- **Build-time:** builder gotchas #12 (`site-settings` stub) + #6 (error/offline standalone pages).
- **Layer:** T4 plugin (`plugins/system/t4/src/t4/Document/Template.php`). **Where:** any standalone Joomla template file that bypasses the normal T4 render pipeline (offline.php, error.php, custom tmpl= files).
- **Symptom:** Setting `$offline = true` (or any value that routes Joomla through offline.php) causes a 500 Internal Server Error: "Call to undefined method stdClass::get()" from `Template::beforeRender()` line ~484. The page never renders; the site appears broken rather than showing the offline page.
- **Root cause:** `CMSApplication::render()` fires the `onBeforeRender` event BEFORE calling `document->render()`. The T4 plugin's `Template::beforeRender()` handler (line ~484) calls `$this->doc->params->get('site-settings')->get('other_faviconFile')`. Normally `site-settings` is a proper `Joomla\Registry\Registry` object because `Template::render()` calls `loadTypelistData()` at line ~104 which converts all typelist JSON into Registry objects. BUT for standalone pages (offline.php, error.php), `Template::render()` is never called — Joomla calls `HtmlDocument::_loadTemplate()` which just includes the PHP file directly, skipping the entire T4 render pipeline. So `doc->params->get('site-settings')` returns the raw stdClass that was deserialized from the template params JSON — and stdClass has no `->get()` method → fatal crash.
- **Fix recipe:** At the top of offline.php (and any other standalone T4 template file), after `Factory::getDocument()`, pre-initialize all T4 typelist groups as Registry objects before `onBeforeRender` fires:
  ```php
  if (defined('T4PATH_TPL') && defined('T4PATH_BASE')) {
      foreach (['site', 'navigation', 'theme', 'layout'] as $_t4group) {
          $_t4profile = $doc->params->get('typelist-' . $_t4group, 'default');
          $_t4file = T4PATH_TPL . '/etc/' . $_t4group . '/' . $_t4profile . '.json';
          if (!is_file($_t4file)) $_t4file = T4PATH_BASE . '/etc/' . $_t4group . '/' . $_t4profile . '.json';
          if (!is_file($_t4file)) $_t4file = T4PATH_TPL . '/etc/' . $_t4group . '/default.json';
          if (!is_file($_t4file)) $_t4file = T4PATH_BASE . '/etc/' . $_t4group . '/default.json';
          if (is_file($_t4file)) {
              $doc->params->set($_t4group . '-settings', new Registry(json_decode(file_get_contents($_t4file), true)));
          }
      }
      unset($_t4group, $_t4profile, $_t4file);
  }
  ```
  This mirrors what `loadTypelistData()` does and runs during `parse()` (when offline.php is included) which is BEFORE `onBeforeRender` fires.
- **Pre-flight check:** Any time you customize offline.php or error.php on a T4 site, verify the pre-init block is present. Without it the page is inaccessible in offline/error mode (worst time to discover a 500).
- **Confidence:** CONFIRMED (Stratum 2026-06-20; fix applied to offline.php, page renders correctly with HTTP 503).

---

### P73 — T4 megamenu COLUMN order + item membership render from the TYPELIST `etc/navigation/<x>.json` `mega_settings`, NOT the DB style `navigation_mega_settings`  🟠 CONFIRMED (Voyara 2026-06)  HARD-TO-DETECT
- **Layer:** T4 (mega renderer + mod_menu `mega`/`mega_sub` layout). **Where:** any grouped megamenu; reconciling mega columns/items to the design.
- **Symptom:** you edit `#__template_styles.params.navigation_mega_settings` (the blob the admin Megamenu builder appears to write) to reorder columns / change which items belong to which column / reorder items — **clear cache, and NOTHING changes** on the front end. Column titles may update (they read live) while order/membership stays.
- **Root cause:** `Renderer/Megamenu.php` reads `navigation_mega_settings` ONLY to pick the menutype (`key($megConfig)`). The actual render (`html/mod_menu/mega.php`) reads `$doc->params->get('navigation-settings')->get('mega_settings')`, which T4 builds at runtime from the **template typelist file** `templates/<tpl>/etc/navigation/<typelist-navigation>.json` (default `default.json`). `mega_sub.php` iterates `$item->mega['settings'][n]['contents']` **in array order** and renders each `items` id-string in order. So column order + item order live in that JSON file, not the DB blob.
- **Fix recipe:** edit `etc/navigation/default.json` → `mega_settings.mainmenu.<itemid>.settings[0].contents[]` (reorder the array for column order; set each column's `items` CSV for within-column order). Then clear `administrator/cache/t4core` + `t4asset` + `media/t4/optimize` + `cache`. (NB: within-column item order is honored from the JSON `items` CSV — you do NOT need a nested-set reorder for it.)
- **Pre-flight check:** to change mega column/item order, edit the typelist JSON (not the DB); after clearing caches, `curl` the page and assert the `mega-col-title` order + first item per column.

### P74 — T4 block `.html` layouts are `file_get_contents`'d → inline `<?php ?>` does NOT execute (only `<jdoc:include>` is parsed)  🟠 CONFIRMED (Voyara 2026-06)
- **Layer:** T4 (`Document/Template::renderBlock()`). **Where:** `templates/<tpl>/html/layouts/t4/block/*.html` (header/footer/mainnav blocks).
- **Symptom:** you add `<a href="<?php echo Route::_(...) ?>">` to a block `.html` to emit a dynamic/SEF chrome link → the raw `<?php … ?>` renders as **literal text** on the page (or just the `>` leaks).
- **Root cause:** `renderBlock()` does `return file_get_contents($file)` — no PHP eval. Joomla later parses the returned markup for `<jdoc:include>` tags only.
- **Fix recipe:** put dynamic/SEF chrome in an **element** (`html/layouts/t4/element/<name>.php`, included via `<jdoc:include type="element" name="<name>" />`) or a **layout** `.php` (`html/layouts/t4/layout/<name>.php`) — both DO execute PHP (the `logo.php`/`offcanvas.php` pattern). Reference menu items by `Itemid` in `Route::_()`.
- **Pre-flight check:** never put `<?php` in a `block/*.html`; use an element/layout `.php` for any computed value.

### P75 — T4 module chrome style must be the PLAIN chrome name (`JAxhtml`), not `<tpl>-JAxhtml` — the prefixed form silently falls back to `no` chrome (title dropped)  🟠 CONFIRMED (Voyara 2026-06)  `[FOOTER-TITLE-MISSING]`
- **Layer:** T4 (chrome registration in `themes/base/html/modules.php` → `modChrome_<style>` from `html/layouts/chromes/<style>.php`). **Where:** any `<jdoc:include type="modules" style="…">` and the typelist `oc_pos_style`.
- **Symptom:** a footer/sidebar `mod_menu` (or off-canvas menu) set to `style="<tpl>-JAxhtml"` renders **raw** — no `.t4-module` wrapper, no `.module-title` — so column titles (EXPLORE/COMPANY/…) silently vanish even with `showtitle=1`.
- **Root cause:** chrome functions are registered as `modChrome_JAxhtml` / `_card` / `_no` etc. (the bare file stem). A `<tpl>-JAxhtml` style has no matching function → T4 falls back to `no` (raw content, title stripped). The `<tpl>-no` form "works" only because it coincidentally maps to `no`.
- **Fix recipe:** use the bare chrome name in the jdoc include + the typelist `oc_pos_style` (`JAxhtml`, `card`, `default`, `no`). `JAxhtml` renders `<h{tag} class="module-title"><span>{title}</span></h{tag}>` when `showtitle!=0`.
- **Pre-flight check:** any footer/sidebar/off-canvas menu that needs its title → confirm `style="JAxhtml"` (not `<tpl>-JAxhtml`) and probe for `.module-title` in the rendered column.
- **⚠️ CONFLICT — verify per build.** Builder **gotcha #22** reports the OPPOSITE on Aurora: that the **dash-format** `<tpl>-JAxhtml` is REQUIRED and the bare form throws `Undefined array key 1` + degrades chrome to `none` (T4 `ModuleHelper` does `explode('-', style, 2)[1]`, line ~188). That is a different code path from P75's `modChrome_<bareName>` lookup → likely a T4-version or invocation-site difference (layout-JSON `style` vs the typelist `oc_pos_style` / jdoc `style=`). **This entry IS the resolution point for that builder conflict** — the build ships dash-format provisionally and flags it; **run THIS pre-flight in P0d** to decide which path this T4 version takes (render a titled module BOTH ways, probe for `.module-title`), then correct every module set the losing way and record the verdict for this build.

### P76 — T4 layout breadcrumb row ships `device:"xs"` (mobile-only) + matches the module by TITLE → breadcrumbs invisible on desktop / break if the module is renamed  🟠 CONFIRMED (Voyara 2026-06)  `[BREADCRUMB-MISSING]`
- **Layer:** T4 (layout JSON `etc/layout/<style>.json` `type:module` row) + EXT (mod_breadcrumbs). **Where:** every inner layout (default/sidebar-left/no-sidebar) that has a breadcrumb row.
- **Symptom:** breadcrumbs don't render on desktop inner pages even though the design shows them; or they vanish after you rename the breadcrumbs module.
- **Root cause (two compounding):** (1) the scaffolded breadcrumb layout row carries `"device":"xs"` → rendered only at the xs breakpoint (mobile), hidden on desktop. (2) the row is `type:module, modname:mod_breadcrumbs, module:"Breadcrumbs"` — T4 resolves it by the module **title** "Breadcrumbs"; if the published module is trashed (`published=-2`) or its title changed, the slot renders nothing.
- **Fix recipe:** in each `etc/layout/*.json` breadcrumb row set `"device":"def"`; publish the `mod_breadcrumbs` module and **keep its title "Breadcrumbs"** (don't rename for tidiness — the layout matches by title). Then clear `t4core`+`t4asset`+`optimize`+`cache`. Style per design: `showHere=0`, override base `.breadcrumb .divider:before{content:"/"}` to a chevron (CSS border or lucide), crumb type/colors.
- **Pre-flight check:** on a desktop inner page, assert `.breadcrumb` is visible; grep each layout JSON breadcrumb row for `"device":"xs"`.

### P77 — Mega/dropdown panel item links use `--mainnav-link-color` (literal, never flips) via `.t4-megamenu .dropdown-menu li > a` (0,3,1) → near-black items on the dark panel  🔴 CONFIRMED (Voyara 2026-06)  `[NESTED-STATE-NOT-DARKED]`/`[DARK-STUCK-LIGHT]`
- **Layer:** T4 (base megamenu css) + dark overlay. **Where:** every grouped mega panel AND simple dropdown item, in DARK.
- **Symptom:** the mega/dropdown panel SURFACE flips dark correctly, but the item LINKS render near-black (`--mainnav-link-color` light literal, e.g. #2B2420) → unreadable on the dark panel. A "did the panel flip?" check passes (surface is dark); only the link text is wrong.
- **Root cause:** T4 emits `.t4-megamenu .dropdown-menu li > a, … li .dropdown-item { color: var(--mainnav-link-color) }` at specificity 0,3,1, which beats a plain token rule `.t4-megamenu .dropdown-menu a{color:var(--token)}` (0,2,1) AND `--mainnav-link-color` is a fixed light value that doesn't re-declare in the dark scope.
- **Fix recipe:** in `darkmode.css`, pin the panel item links to the dark text token at ≥0,4,1: `html.t4-dark .t4-megamenu .dropdown-menu li > a, … li .dropdown-item, … .mega-col-nav a { color: var(--dark-text-token) }` (+ hover→primary). Open the panel in dark and probe a link's computed `color` (must be the dark text token, not the light literal).
- **Pre-flight check:** in dark, hover each mega trigger + open each dropdown; probe an item link `color` ≠ the light `--mainnav-link-color`.

### P78 — JA ACM `helper->getRows('items.title')` collides with a sibling scalar field of the same leaf name → empty list reports 1 PHANTOM row  🟠 CONFIRMED (Voyara 2026-06)  `[ACM-FINDPARAM-LEAF-COLLISION]`
- **Layer:** EXT (mod_ja_acm helper). **Where:** any ACM block whose `.php` counts a jalist via `getRows('<group>.<leaf>')` while the SAME data object also carries a top-level field named `<leaf>` (e.g. a `title` section-heading field next to an `items` list whose columns include `title`).
- **Symptom:** with the list EMPTY but the sibling scalar SET, the grid renders exactly **1 phantom card** whose cells are filled with the scalar (e.g. a destinations grid showing one card titled with the section heading). With the scalar also empty it "works" (0 cards → code fallback), so the bug only appears once you seed the heading text — easily shipped.
- **Root cause:** `ModJAACMHelper::findParam('items.title')` first tries the `items` group; when `items` is absent it **falls through to a bare-name scan over ALL data keys** and matches the unrelated `title` field (a string). `getRows()` then sees a non-list value (no `['type']`) and returns `count($string)` = **1**. The `for ($i<1)` loop runs once and `get('items.title',0)` again resolves to the heading string.
- **Fix recipe (template tmpl only):** never trust `getRows('<group>.<leaf>')` for the row count when a same-named scalar field can exist. Count from the list field's own meta instead: `$f = $helper->findParam('items'); $count = (is_array($f) && ($f['type']??'')==='list') ? (int)$f['rows'] : 0;`. (`findParam` is public; `get('items')` won't work — it array-casts and returns index 0, not the meta.)
- **Pre-flight check:** for every ACM block that loops a jalist, grep its `.php` for `getRows('<group>.<leaf>')` and confirm no top-level field shares `<leaf>`; or just switch the count to the meta-based guard above. Render with the list empty + the heading set → must show 0 cards (fallback), not 1.

### P80 — Hidden menu items for component views default to `template_style_id=0` → use home ACM layout → component output silently discarded  🔴 CONFIRMED (Voyara 2026-06)  `[TSID-ZERO-COMPONENT-LOST]`
- **Layer:** Joomla core (menu item routing + template style resolution). **Where:** any hidden menu item (`menu_show=0`) created for a component view (com_content, com_users, etc.) that is not explicitly assigned a template style.
- **Symptom:** navigating to the route renders only the template's chrome (header/footer) with zero component content. The body class shows `layout-home` instead of `layout-default`. `<article>` or component output is entirely absent. In the Joomla admin, the menu item "link" resolves to the correct component, but the frontend output is the ACM home stack.
- **Root cause:** `template_style_id=0` in `#__menu` means "use the default template style". If the default template style is the Home layout (as is common in T4 builds — style id=1 or similar, set to `layout:home`), Joomla renders the ACM home stack for that request. The home layout typically has no component position, so `<jdoc:include type="component" />` is never called → component output is not rendered.
- **Fix recipe:** for every hidden menu item that should display a component view, explicitly set `template_style_id` to the appropriate Inner style (the one with `layout:default` or `layout:inner` that includes the component position). Use `SELECT id,title,client_id FROM #__template_styles WHERE home=0 ORDER BY title` to find the inner style id; then `UPDATE #__menu SET template_style_id=<inner_id> WHERE id=<item_id>`. Verify: after cache clear the body class should show `layout-default` (not `layout-home`) and the component content should render.
- **Pre-flight check:** for any new hidden menu item, SELECT `template_style_id` before testing. If it is 0 or matches the home style, fix it before the review. Quick SQL: `SELECT id, link, template_style_id FROM #__menu WHERE menu_show=0 AND template_style_id IN (0,<home_style_id>)`.

### P79 — ACM `comparison-table` dark thead selector targets a non-existent descendant — thead bg not flipped in dark  🟠 CONFIRMED (Voyara 2026-06)  `[ACM-COMPARISON-TABLE-THEAD-SELECTOR]`
- **Layer:** EXT (acm/comparison-table stock CSS). **Where:** the comparison table ACM block, dark mode.
- **Symptom:** the comparison table header row stays white `#FFFFFF` in dark mode, even though `html.t4-dark` tokens are correctly applied everywhere else. The bug is invisible in light mode.
- **Root cause:** `acm/comparison-table/css/style.css` contains `html.t4-dark .acm-cmp-thead tr { background: var(--voy-elevated) }`. The class `.acm-cmp-thead` is applied IN `style-1.php` directly ON the `<tr>` element — `<tr class="acm-cmp-thead">`. The CSS rule targets a `<tr>` INSIDE `.acm-cmp-thead`, which cannot match (you cannot be your own descendant). The rule is entirely dead; no dark flip occurs.
- **Fix recipe (per-template overlay):** in `darkmode.css` or a per-page CSS file, add `html.t4-dark .acm-cmp-thead { background: var(--voy-elevated, #1C1712) !important; }`. The `!important` is needed to beat the stock ACM fallback (which has no other dark rule here). Do NOT edit the stock ACM CSS.
- **Pre-flight check:** in dark mode, probe `getComputedStyle(document.querySelector('.acm-cmp-thead')).backgroundColor` — if it returns `rgb(255,255,255)` the bug is present. Fix: add the corrected `html.t4-dark .acm-cmp-thead` rule to `darkmode.css`.

### P81 — `tmpl=component` / com_wrapper embed skips index.php's dark wiring → embedded body stays light + body-bg flips white in dark  🟠 CONFIRMED (Voyara 2026-06)  `[COMPONENT-TMPL-DARK-UNWIRED]`  HARD-TO-DETECT

- **Build-time:** builder gotcha #6 (error/offline standalone pages); contract: `dark-light-mode-standard.md` §8c.
- **Layer:** T4. **Where:** any page rendered with `&tmpl=component` (print views, com_wrapper iframes, AJAX/embed contexts) on a template whose dark mode is wired in `index.php`.
- **Symptom:** a com_wrapper Component-Wrapper page (or any `tmpl=component` embed) renders LIGHT even when the user has chosen dark — the parent page is dark but the embedded iframe/component body is white. Worse, the embedded `<body>` background flips to pure white in dark because the surface tokens that paint it live in `template.css`, which `tmpl=component` does not load.
- **Why HARD-TO-DETECT:** the parent page's dark mode passes every check; you only see it once you embed the component view (or open the print view) in dark. A `getComputedStyle` of the iframe content document shows `html.t4-dark` is NOT set (the resolver never ran) and `body` bg is `rgb(255,255,255)`.
- **Root cause:** `tmpl=component` renders via the template's **`component.php`**, NOT `index.php`. T4's standard dark-mode scaffold (pre-paint localStorage resolver `addScriptDeclaration`, `darkmode.css` link via `addCustomTag`, `darkmode.js`) lives only in `index.php`. `component.php` (which usually just calls `\T4\T4::render($this)`) inherits none of it. AND the component template doesn't load the compiled `template.css`, so token-driven body/surface fills are absent → the body bg has no rule → defaults to white.
- **Fix recipe (template only):** mirror the dark wiring into `component.php` BEFORE `\T4\T4::render($this)`: (1) the same pre-paint `addScriptDeclaration` that toggles `html.t4-dark` + `data-bs-theme` from `localStorage.getItem('<tpl>-theme')`; (2) `addCustomTag('<link … darkmode.css>')`; (3) an inline `addCustomTag('<style>html,body{background:<bg-light>;color:<text-light>} html.t4-dark,html.t4-dark body{background:<bg-dark>;color:<text-dark>}</style>')` to paint the body surface that template.css normally would. Same-origin embeds share localStorage so the iframe inherits the parent's theme with no FOUC.
- **Pre-flight check:** set the theme to dark, load any `…&tmpl=component` URL directly, and probe `document.documentElement.classList.contains('t4-dark')` (must be true) AND `getComputedStyle(document.body).backgroundColor` (must be the dark bg, not `rgb(255,255,255)`). If false/white → `component.php` is missing the dark wiring.

### P82 — Stock `.t4-header`/`.t4-footer` SECTION shows a LIGHT seam above/below a permanently-DARK chrome block  🟠 CONFIRMED (ja_helix)  `[STICKY-HEADER-CONTENT-GAP]`/border-seam  HARD-TO-DETECT
- **Layer:** T4. **Where:** any template whose header/footer is a permanently-DARK custom block (`.helix-header`, `.<tpl>-footer`, dark chrome) nested inside the stock T4 `.t4-section.t4-header` / `.t4-section.t4-footer` wrapper — i.e. most dark-chrome marketing templates.
- **Symptom:** a thin (1–7px) LIGHT page-bg strip shows ABOVE and/or BELOW the dark header bar, and a 1px light line above the dark footer block. Looks like a hairline seam; in the `.pen` the dark bar is flush/solid. Easy to dismiss as anti-aliasing.
- **Why HARD-TO-DETECT:** the dark block itself probes correctly (its bg is `#0A0D0C`), so a "is the header dark?" check PASSES. The seam is the *parent section* showing through — you only catch it with `elementFromPoint(x, 0..N)` sampling across the seam OR a zoomed screenshot of the top edge. The header looks fine at a glance.
- **Root cause:** the stock `.t4-header` is `display:flex; align-items:center; min-height:$t4-nav-height (80px)` and `.t4-footer` ships a light `.bg-light` band. The dark chrome block is shorter than the section's min-height and is vertically *centered* (header) → light gutters top+bottom; or the section's own light bg/border peeks 1px above the dark footer block.
- **Fix recipe (template only):** (header) `.t4-section.t4-header{align-items:stretch; min-height:<pen-navbar-h>}` + make the dark block fill: `.t4-section.t4-header>.header-block,.<tpl>-header{width:100%}` and `.<tpl>-header{display:flex;align-items:center}` (inner gets `width:100%;flex:1`). (footer) pin the section bg to the chrome surface in BOTH modes: `.t4-section.t4-footer{background-color:var(--chrome-elevated)}` (darkmode.css usually only covers the dark case, leaving the LIGHT-mode seam). 
- **Pre-flight check:** sample `document.elementFromPoint(viewportCenterX, y)` for `y` in `[0,1,2, headerH-2, headerH-1]` and at the footer-block top ±2px; every sample must be the dark chrome bg, none the light page/section bg. Plus the dark block's `getBoundingClientRect()` must equal the section's (no centering gutters). Distinct from P58 (that's `.t4-main-body` padding between header and masthead; this is the header/footer SECTION vs its own dark block).

### P83 — `site-settings` is a stub `stdClass` at `index.php`/standalone time + the GUI saves to `local/etc/site/` → dark settings read the wrong source  🔴 CONFIRMED (ja_stratum 2026-06)  `[DARK-REGISTRY-STDCLASS]`/`[DARK-NOT-LOCAL-FIRST]`/`[DARK-STANDALONE-LOCK-DESYNC]`  HARD-TO-DETECT

- **Build-time:** builder gotcha #12 (`site-settings` stub `stdClass`); contract: `dark-light-mode-standard.md` §8d.
- **Layer:** T4. **Where:** the GUI-configurable (cookie + server-resolve) dark mode — any place that resolves `other_darkmode`/`other_default_theme` at first paint: the template-root `index.php`, the gated `theme-toggle.php` element, and the standalone `error.php`/`offline.php`/`error-t4.php`.
- **Symptom (three faces):** (1) editing **Default theme → Light** or toggling **dark off** in the admin has **no effect** on the frontend — the site stays on the packaged default. (2) Reading the setting can **fatal-500** (white-screen) on some pages. (3) On a locked-light site the **404/offline page renders dark** on a dark-OS machine, and a dead toggle / `darkmode.js` loads on the locked page.
- **Why HARD-TO-DETECT:** the admin SAVE succeeds and the JSON on disk IS correct, so "did it save?" passes. The frontend silently reads a *different* file. And the fatal only triggers on the fallback branch (when no profile JSON is found), so a normal build looks fine until a profile is missing.
- **Root cause:** (a) At template-root `index.php` / standalone-page render time, T4 has **not built the `site-settings` Registry yet** — `$this->params->get('site-settings')` is a partial **`stdClass`** carrying only `site_logo`, with **no `->get()` method**; calling `->get()` is a fatal. T4 only builds the real `Joomla\Registry\Registry` later, in `loadTypelistData()` during the BODY layout render (that's why a body-layout override like ja_titan's `html/layouts/t4/index.php` CAN read it, but the root `index.php` cannot). (b) The admin GUI **saves edits to `local/etc/site/<profile>.json`**, NOT base `etc/site/` — `T4\Helper\Path::findInTheme` resolves local→base. Code that reads only base `etc/` (or reads the Registry) therefore never sees the saved values. (c) Standalone pages bypass `T4::render()` entirely, so they must repeat the disk resolution; a cookie+OS-only pre-paint ignores the GUI lock/default and loads darkmode.js/toggle unconditionally.
- **Fix recipe (template only):** resolve from the profile JSON on disk **LOCAL-FIRST** in every surface — `__DIR__.'/local/etc/site/'.basename($prof).'.json'` then base `__DIR__.'/etc/site/'.…`; parse with `filter_var($cfg['other_darkmode'], FILTER_VALIDATE_BOOLEAN)` (handles JSON bool `false` and `"0"/"1"`); only fall back to `site-settings` when `$ss instanceof \Joomla\Registry\Registry`. Repeat the SAME resolution + gate (`darkmode.css`/`darkmode.js`/toggle) in `component.php` AND `error.php`/`offline.php`/`error-t4.php`. Full copy-paste: `references/dark-light-mode-standard.md`.
- **Pre-flight check:** set `other_darkmode:false, other_default_theme:"light"` in **`local/etc/site/<profile>.json`**, clear `media/t4/optimize/*`, and curl **home + a real content page + a 404**: each must emit `var t="light"`, `grep -c js/darkmode.js` = 0, and `grep -coE '<button[^>]*t4-theme-toggle'` = 0. Flip to `true/dark` → all three must show `var t="dark"` + darkmode.js + the toggle button. If the frontend ignores the `local/` edit → the resolver reads base `etc/` or the Registry (this bug).

### P84 — Joomla admin loads the SITE-LEVEL `<root>/language/.../tpl_<name>.ini` BEFORE the template's own → admin shows raw dark constants  🔴 CONFIRMED (fleet 2026-06)  `[ADMIN-LANG-SITELEVEL-STALE]`  HARD-TO-DETECT
- **Layer:** Joomla core (com_templates StyleModel) + JA quickstart packaging. **Where:** any style-edit / T4 themer settings form that shows template params (e.g. `other_darkmode`, `other_default_theme` and their `TPL_THEME_AUTO/LIGHT/DARK` options).
- **Symptom:** the admin renders raw constant names (`T4_DARK_MODE_LABEL`, `TPL_THEME_AUTO`) instead of translated labels — even though the strings ARE in `templates/<name>/language/en-GB/en-GB.tpl_<name>.ini`. A classic partial tell: the LABEL shows but the dropdown OPTIONS are raw (the site-level file had the label lines but not the option lines).
- **Why HARD-TO-DETECT:** you add the strings to the obvious place (the template's own language folder) and re-check the file — it's correct. But the admin reads a DIFFERENT file. And BSD `grep '\s'` gives false "missing" results, masking the real state.
- **Root cause:** `administrator/components/com_templates/src/Model/StyleModel.php` does `$lang->load('tpl_'.$template, $client->path) || $lang->load('tpl_'.$template, $client->path.'/templates/'.$template)`. `$client->path` is the SITE ROOT, so it loads `<root>/language/en-GB/en-GB.tpl_<name>.ini` FIRST and **short-circuits** — the template-folder copy is only used if the site-level file is ABSENT. JA quickstarts ship a site-level copy, so that stale/partial file is authoritative in admin.
- **Fix recipe (in the install, not just the zip):** put the 7 dark constants (unified wording) in BOTH `<root>/language/en-GB/en-GB.tpl_<name>.ini` AND `templates/<name>/language/...`. The site-level file lives OUTSIDE the template folder so it is NOT in the template package — a quickstart-based system needs it updated separately (or the site-level override removed so the template copy wins).
- **Pre-flight check:** `ls <root>/language/en-GB/en-GB.tpl_<name>.ini`; if present, parse it with REAL PHP `parse_ini_string` (pass base64 via a .php file — `ddev exec php -r` mangles `$`) and assert all 7 constants resolve. Never trust `grep`.

### P85 — Template-shipped `params/typelist-site.xml` that omits the `site-other` legend hides the merged dark fields in admin  🟠 CONFIRMED (ja_spark, ja_voyara 2026-06)  `[ADMIN-FORM-NO-LEGEND]`  HARD-TO-DETECT
- **Layer:** T4. **Where:** the style "Site" settings form (where `other_darkmode`/`other_default_theme` should appear under the "Other" group).
- **Symptom:** the dark settings simply don't appear in admin for ONE template while they appear for all the others — even though templateDetails.xml declares them and the resolver works.
- **Root cause:** T4 builds the form from `Path::findInTheme('params/typelist-site.xml')` (template copy if it ships one, else base plugin) THEN merges templateDetails.xml `<site><fields name="typelist-site">`. The dark fields live in `<fieldset name="site-other" subgroup="1">`, which only renders if a `type="legend"` `site-other` group exists in the loaded form. A template that ships its OWN `params/typelist-site.xml` (commonly to customise the logo fieldset) usually OMITS `site-other` → the merged dark fields have no group → invisible. Templates with NO params override use the base plugin's form (which HAS a legend `site-other`) → fine.
- **Fix recipe (template only):** add a full `<fieldset name="site-other" icon="cog" type="legend" subgroup="1" class="other_group has-icon" label="T4_OTHER_CONFIGURE_LABEL" description="T4_OTHER_CONFIGURE_DESC">` (favicon + back-to-top + `other_darkmode` + `other_default_theme`) to the template's own `params/typelist-site.xml`.
- **Pre-flight check:** does `templates/<tpl>/params/typelist-site.xml` exist AND contain a `type="legend"` `site-other` fieldset? If the file exists without it → the dark fields won't render. (Note: P83's `instanceof` guard has a variant — `is_object($ss)` is NOT a sufficient guard because the partial `stdClass` IS an object; use `instanceof \Joomla\Registry\Registry`. Seen ja_nexora.)

### P87 — Stock `.t4-footer .nav` chrome injects a `/` separator + UPPERCASE + a 1px hover-border into any custom footer menu  🟠 CONFIRMED (ja_helix 2026-06)  `[T4-FOOTER-NAV-CHROME-LEAK]`  HARD-TO-DETECT
- **Layer:** T4 base. **Where:** any template that places a custom-styled footer menu (mod_menu columns, link lists) INSIDE the stock `.t4-section.t4-footer` wrapper — i.e. essentially every marketing footer.
- **Symptom:** footer column links render UPPERCASE with a leading `" / "` slash separator and gain a 1px bottom-border on hover (a subtle hover-jump), even though your own footer CSS sets none of these. The design shows normal-case links, no separator.
- **Why HARD-TO-DETECT:** your footer CSS looks complete and a "did my class apply?" check passes; the leak comes from a base rule on the ancestor `.t4-footer`, so it only shows once the menu is actually nested in the footer section. Easy to mistake for a content/typo issue.
- **Root cause:** T4 base ships `.t4-footer .nav > li::before{content:"/"}`, `.t4-footer .nav > li > a{text-transform:uppercase}` and a `:hover{border-bottom:…}` — they cascade into any `.nav`/`mod_menu` markup in the footer.
- **Fix recipe (template only):** neutralise inside your footer scope: `.<tpl>-foot-col li::before{content:none!important}`, `.<tpl>-foot-col a{text-transform:none}`, `.<tpl>-foot-col a:hover{border-bottom:0}`.
- **Pre-flight check:** probe a footer menu link's computed `text-transform` (must not be `uppercase`) and its `::before` `content` (must be `none`/empty), and confirm `getBoundingClientRect().height` is identical at rest vs `:hover`.

### P88 — `?layout=edit` (frontend profile/article edit) renders through T4's frontend-edit CLEAN layout, bypassing `index.php`  🟠 CONFIRMED (ja_helix 2026-06)  `[T4-EDIT-CLEAN-LAYOUT]`  HARD-TO-DETECT
- **Layer:** T4. **Where:** any frontend edit view — `com_users` profile edit (`view=profile&layout=edit`), frontend article submit/edit — when `system_t4frontendedit` is ON.
- **Symptom:** the edit page renders with NO template chrome, NO per-page overlay, and NO dark/direction resolver (white/unstyled form) — while the matching VIEW page (`layout=default`) is fully styled. A pixel review of the view passes; only the edit layout is broken.
- **Why HARD-TO-DETECT:** `index.php` is never executed for the edit layout, so every fix you make in `index.php` (overlay loader, dark pre-paint) silently does nothing on that one layout; the view page looks perfect.
- **Root cause:** with frontend-editing enabled T4 swaps in its own minimal "clean" edit layout. The toggle is `system_t4frontendedit`, and T4 reads `system_*` flags from **`templates/<tpl>/etc/global.json`** via `loadGlobalParams` — NOT from the per-style DB params — so flipping it in the admin style settings appears to do nothing.
- **Fix recipe (template only):** set `"system_t4frontendedit":"0"` in `templates/<tpl>/etc/global.json` (this is also the correct production/package setting — builder gotcha #42). Then `layout=edit` renders through the full template (chrome + overlay + dark resolver). Clear `media/t4/optimize/*`.
- **Pre-flight check:** log in, open `…view=profile&layout=edit`, and probe `document.documentElement.classList.contains('t4-dark')` (must follow the theme) + presence of the site header — if absent while the `layout=default` page has them, this flag is the cause.

### P89 — Custom chrome bar nested in `.t4-header` (a flex parent) shrink-wraps to content → mobile controls bunch left  🟠 CONFIRMED (ja_helix 2026-06)  `[T4-HEADER-FLEXCHILD-SHRINK]`  HARD-TO-DETECT
- **Layer:** T4 base. **Where:** any template whose custom header markup (`.<tpl>-header` / inner bar) sits as a direct child of `.t4-section.t4-header`, which T4 renders `display:flex`.
- **Symptom:** on mobile the logo + theme-toggle + hamburger cluster at the LEFT with a large empty gap on the right; `justify-content:space-between` appears to do nothing. On desktop it looks fine (content is naturally wide), so it ships unnoticed.
- **Why HARD-TO-DETECT:** the inner bar has `width:100%` set, but its computed width is still ~200px — because the PARENT (`.<tpl>-header`, a flex child of `.t4-header`) has the default `flex:0 1 auto` and shrink-wraps to its content; `width:100%` then resolves against that ~200px. Desktop hides it.
- **Root cause:** `.t4-header{display:flex}` makes its child the constrained element; a non-growing flex child collapses to content width, capping everything inside.
- **Fix recipe (template only):** make the chrome bar fill its flex parent: `.<tpl>-header{flex:1 1 auto;width:100%}` (plus `width:100%` on the inner max-width container). Verify on mobile, not just desktop.
- **Pre-flight check:** at 390px probe the header inner `getBoundingClientRect().width` (must ≈ viewport, not content) and the hamburger's right edge (must be viewport − padding, e.g. 370 at 390/20).

### P90 — T4 category view doesn't populate lead/intro/link buckets for a Table-API-created menu item with a custom `&layout` → category page renders EMPTY  🔴 CONFIRMED (ja_helix 2026-06)  `[T4-CATEGORY-CUSTOM-LAYOUT-EMPTY]`  HARD-TO-DETECT
- **Layer:** T4 + com_content. **Where:** a category menu item created programmatically (Joomla `Table('Menu')` API, e.g. demo seeding) AND pointed at a non-stock `&layout=<custom>` whose override reads `$this->lead_items/intro_items/link_items`.
- **Symptom:** the category page renders the masthead/title (category resolves) but **zero articles** — even though the category has published, in-window, access-OK articles. Switching the URL `&layout=blog`/`default` doesn't help under that menu item; the SAME category shows fine under a DIFFERENT (admin-created) menu item's Itemid.
- **Why HARD-TO-DETECT:** params + every `#__menu` column are byte-identical to a working item (md5-equal params), the SQL the model should run returns the rows, and the category title displays — so it looks like a data problem when it's a view-population quirk tied to the specific menu item + custom layout.
- **Root cause:** the T4 category HtmlView only fills the blog buckets for recognised layout/menu states; a Table-API item with a custom layout falls through and leaves `lead_items/intro_items/link_items` empty.
- **Fix recipe (template only):** in the custom layout override, when the merged bucket list is empty, **load the category's articles directly** (DBO query: `catid`, `state=1`, access-in-levels, publish window, ordered, limited by `num_*` params) and hydrate `slug = id:alias`, `language`, `params = clone $this->params` for the item partial. Gate it on `empty($rows)` so normally-populated items are untouched.
- **Pre-flight check:** after seeding a category menu item via the API, curl the route and grep for an article title; if absent while `&id=<cat>&Itemid=<a-working-item>` shows them, this is it.

### P91 — `com_finder` `#t4-masthead` page-heading duplicates the designed finder hero; `show_page_heading=0` then BREAKS the hero  🟠 CONFIRMED (ja_helix 2026-06)  `[SEARCH-DUP-MASTHEAD]`  HARD-TO-DETECT
- **Layer:** T4 + com_finder. **Where:** a search menu item with a designed finder hero (`h1`) in the com_finder override.
- **Symptom:** two headings stack — the T4 layout `#t4-masthead` (`h2.t4-masthead-title`) above the designed `h1`. The obvious fix (`show_page_heading=0`) removes the *hero* `h1` (which gates on `=1`) while the T4 masthead persists — worse.
- **Root cause:** the T4 LAYOUT renders `#t4-masthead` from the menu `page_heading` **independently of** `show_page_heading`; the finder hero `h1` is conditional on `show_page_heading=1`.
- **Fix recipe (template only):** keep `show_page_heading=1`; hide the T4 masthead for that page via the per-page overlay: `body.item-<Itemid> #t4-masthead, .t4-section.t4-masthead{display:none}`.
- **Pre-flight check:** count visible page-title `h1/h2` on the search page (must be 1) and confirm real results still render for a query.

### P92 — `mod_menu` `html5` chrome wraps footer columns in `nav.navbar>ul.nav-navbar-nav` → BS `.navbar` padding indents titles + global `.module-title` underline on standalone pages  🟠 CONFIRMED (ja_helix 2026-06)  `[T4-FOOTER-NAVBAR-WRAPPER]`  HARD-TO-DETECT
- **Layer:** Bootstrap 5 + mod_menu. **Where:** footer columns rendered by `mod_menu` with the `html5` chrome (the default for footer link columns).
- **Symptom:** footer column links sit indented ~16px from their column title; on standalone `error.php`/`offline.php` the hardcoded `.module-title` headings gain a stray 1px bottom-border underline.
- **Root cause:** `html5` chrome emits `<nav class="navbar"><ul class="nav navbar-nav">`; BS `.navbar` injects `padding`+row flex, and a global `.module-title{border-bottom:1px solid …}` underlines any `.module-title` heading.
- **Fix recipe (template only):** in footer scope reset `.navbar{padding:0;margin:0;border:0;min-height:0;display:block}` + `.navbar-nav{flex-direction:column}`; set `border:0;padding:0` on footer column titles.
- **Pre-flight check:** probe a footer link's column `padding-left` (≈0, flush with title) and a standalone-page `.module-title` `border-bottom-width` (0).

### P93 — JA ACM style selector `jatools-layout-<type>` is read ONLY from INSIDE the block object in `jatools-config`, never as a top-level module param → every block silently renders `style-1`  🔴 CONFIRMED (ja_meridian 2026-07)  `[ACM-STYLE-SELECT-IN-CONFIG]`  HARD-TO-DETECT
- **Layer:** EXT (mod_ja_acm helper). **Where:** any `mod_ja_acm` module whose `params` carry the style choice as a top-level sibling key `"jatools-layout-<type>":"style-N"` next to `"jatools-config"` (the shape a hand-authored/PDO-seeded module or the admin's own save can produce). Manifests as a page rendering the wrong ACM variant (e.g. a "reversed / media-right" split showing media-LEFT because it fell back to `style-1`).
- **Symptom:** the block's wrapper class reads `... style-1 ...` regardless of the intended `style-2`; a variant-specific layout (media side, band color, CTA style) is silently wrong. Because `style-1` often *also* reads a field like `align-media`, the miss can be masked (looks "nearly right") — so it ships. Verify by the rendered wrapper class + the actual visual, not the DB param.
- **Root cause:** `ModJAACMHelper::__construct()` sets `$this->data = $config[$this->type]` (the block content object decoded from the `jatools-config` JSON *string*), then resolves the layout via `$this->layout = $this->get('jatools-layout-'.$type, 0, 'default')` → `findParam()` scans ONLY `$this->data`'s keys (i.e. keys **inside** the block object). A `jatools-layout-<type>` key sitting at the top level of `params` (a sibling of `jatools-config`) is never in `$this->data`, so it's ignored and the layout defaults to `'default'` → `style-1`.
- **Fix recipe (DB/template only):** embed the style key INSIDE the block object within the `jatools-config` JSON. In PDO: `$p=json_decode($params,true); $cfg=json_decode($p['jatools-config'],true); $t=$cfg[':layout']; $cfg[$t]['jatools-layout-'.$t]='style-2'; $p['jatools-config']=json_encode($cfg,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);` then re-encode `$p` back to `params`. (Also: a jalist of >3 rows needs an explicit `"type"/"rows":N` inside the list object — `getRows()` counts sub-fields otherwise.)
- **Pre-flight check:** for each ACM module that must NOT be `style-1`, probe the live wrapper `class` (`.ja-acm[class*="style-"]`) — it must read the intended `style-N`; do NOT trust the admin param. Screenshot the block to confirm the variant's actual layout (media side / band / CTA).

---

## P87 — JA ACM silently falls back to `style-1` when the configured layout file is missing

- **Layer:** EXT (mod_ja_acm) · **Severity:** 🔴 breaks design · **Confidence:** CONFIRMED (ja_ember_oak 2026-07)
- **Symptom:** a module configured for `style-2`/`style-3` renders **style-1's design** instead. No PHP
  warning, no log line, HTTP 200. Every computed-style probe passes — against the *wrong* layout. The
  band simply "looks like the wrong section" and a reviewer who only diffs colors/spacing may
  rationalise it as a design drift rather than a missing file.
- **Root cause:** `modules/mod_ja_acm/helper.php`:
  ```php
  $this->layout = $this->get('jatools-layout-' . $this->type, 0, 'default');   // ~line 67
  ...
  $layout = $this->find('tmpl/' . $this->layout . '.php');                     // ~line 186
  if (!$layout) $layout = $this->find('tmpl/style-1.php');                     // ~line 187  ← silent
  ```
  So a template that ships only `style-1.php` while the design needs a second style will *always*
  render style-1, whatever the admin picks or the seed sets.
- **Fix recipe:** author the missing `tmpl/style-N.php` + `tmpl/style-N.xml`. **There is no option list
  to register** — `admin/fields/jaacm.php` builds the picker by scanning `Folder::files($path.$type.'/tmpl', '.php')`,
  so dropping the file IS the registration. (`config.xml` needs only `<title>`; a block with no
  `config.xml` never appears in the type list at all.)
- **Pre-flight check (run on every fresh template, BEFORE the page loop):** diff the styles the design
  asks for against the files that exist —
  ```bash
  # every acm:<block> the design docs name
  grep -rhoE 'acm:[a-z-]+' <design-docs>/pages/*.md | sort -u
  # every block + style actually shipped
  for b in templates/<TPL>/acm/*/; do echo "$(basename $b): $(ls $b/tmpl/style-*.php 2>/dev/null | xargs -n1 basename | tr '\n' ' ')"; done
  ```
  A design that names a block/style with no matching `style-N.php` is a 🔴 **before** any review starts.
  On ja_ember_oak this found 6 missing blocks + 2 missing styles that the build had silently shipped as
  style-1 fallbacks.
- **Cross-ref:** builder `gotchas.md` (Phase 5) — the build-time prevention is "author every style the
  page-map names, not just style-1".

## P88 — JA ACM layout picker scans `tmpl/*.php`, so helpers there become selectable "layouts"

- **Layer:** EXT (mod_ja_acm) · **Severity:** 🟡 subtle · **Confidence:** CONFIRMED (ja_ember_oak 2026-07)
- **Symptom:** the admin's ACM layout dropdown lists a non-layout entry (e.g. `helper-image`) alongside
  `style-1`/`style-2`. Selecting it renders a broken/blank band.
- **Root cause:** `admin/fields/jaacm.php` builds the option list with
  `Folder::files($path . $type . '/tmpl', '.php')` — **every** `.php` in `tmpl/` becomes an option. A
  block that keeps a shared partial/helper in `tmpl/` (ja_ember_oak: `acm/gallery/tmpl/helper-image.php`)
  leaks it into the picker.
- **Fix recipe:** keep partials OUT of `tmpl/` (e.g. `acm/<block>/helper-image.php` or a `partials/`
  subdir) and `require` them by path from the style file. Only real `style-N.php` layouts live in `tmpl/`.
- **Pre-flight check:** `for b in templates/<TPL>/acm/*/; do ls $b/tmpl/*.php | grep -v 'style-[0-9]*\.php' ; done`
  → any hit is a stray picker entry.


---

## P45b — T4 Authors INDEX fatals unless `gid[]` is in the menu LINK (not the menu params)

- **Layer:** T4 · **Severity:** 🔴 breaks page (HTTP 500) · **Confidence:** CONFIRMED (ja_ember_oak 2026-07)
- **Symptom:** the Authors-index page returns **500** — `implode(): Argument #2 ($array) must be of type array`
  at `plugins/system/t4/src/t4/MVC/Model/AuthorModel.php` (~line 380). Adding `layout=list` (the original
  P45 fix) is **NOT sufficient** — the page still 500s.
- **Root cause:** the model reads the group filter from the **request input**, never from the menu params:
  ```php
  $gid = $input->getint('gid','');   // ~line 91  — INPUT, not $menuParams
  ...
  $this->setState('gid', $gid);      // ~line 132 — '' when absent
  ...
  $query->where('g.group_id IN ('. implode(",", $this->getState('gid')) .")");   // ~line 380 → TypeError
  ```
  Meanwhile T4's own menu-item form **`themes/base/html/com_content/author/list.xml`** declares
  `<field name="gid" type="Usergrouplist" … required="true" multiple="true">` — i.e. the admin UI stores
  `gid` in `#__menu.params`, where the model never looks. Setting `params.gid = ["2"]` changes nothing.
- **Fix recipe:** put `gid[]` in the menu item's **`link`** (Joomla routes the link's query into the input):
  ```
  index.php?option=com_content&view=author&layout=list&gid[]=2
  ```
  (`2` = Registered, or whichever group the demo authors belong to; repeat `&gid[]=N` per group. The
  array form matters — `getint` filters an array member-wise, and `implode()` needs an array, so a scalar
  `&gid=2` fatals exactly the same way.)
- **Pre-flight check:** `curl -s -o /dev/null -w '%{http_code}' <site>/authors` → any 500 means the link is
  missing `gid[]`. Also grep your own seeds: `grep -rn "view=author" build-docs cli` — a bare
  `view=author` Authors-INDEX link is the bug. (Seen shipped in ja_meridian's `mer-seed-menu.php:78` and
  implied by ja_voyara's `seed2.php:67`.)
- **Cross-ref:** P45 (the `id`/`layout=list` half of the same router).
