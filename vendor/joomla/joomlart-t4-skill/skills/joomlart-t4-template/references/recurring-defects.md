# Recurring Defect Classes — what to hunt + how to detect

> **Cross-cutting detection playbook — run in P1 (visual) & P3 (data/arch).** Tags map to full
> mechanisms in `platform-latent-bugs.md` (P##) and to build-time prevention in the builder's
> `gotchas.md` / `editability-standards.md` / `dark-light-mode-standard.md` §8.

These are **generic defect CLASSES** that recur on T4/Joomla templates regardless of design. They are NOT a
list of one template's findings — they are *what to look for and how to catch it*. On every relevant
component, on every axis, ask "could this class be present here?" and run the detection. (Confirmed
framework-mechanism bugs live in full in `platform-latent-bugs.md`; this file is the detection playbook.)

> Tag each defect you log with one of these so the orchestrator can hunt the same class on every other page.

## Dark-mode classes (the richest source — always check dark explicitly)
- **`[DARK-STUCK-LIGHT]`** — a surface/card/panel/input/header stays light in dark because base CSS specificity
  beats the dark overlay. **Detect:** in dark, computed `background-color` on every surface type; any
  `rgb(255,255,255)`/near-white = fail. Don't trust that a dark rule merely *exists*.
- **`[NESTED-STATE-NOT-DARKED]`** — the closed/top container flips dark but a reveal-on-interaction child does
  not (drill sub-panel, megamenu flyout, accordion body, dropdown, modal). **Detect:** OPEN each nested state
  with a real click, THEN probe in dark. The closed-state probe passes while the open panel is a white box.
- **`[DARK-LOGO/IMG-NOT-FLIPPED]`** — a logo/wordmark/image stays dark in dark mode (it's an `<img>` with a
  baked fill, or a token that didn't flip). **Detect:** SCREENSHOT every logo/branded mark in dark — a color
  probe can't see inside an `<img>`.
- **`[DARK-ACCENT-NOT-FLIPPED]`** — the dark token block defines the bg/text but omits the *accent companions*
  (secondary/accent/primary-hover), so accents render their light shade in dark. **Detect:** diff the light
  `:root` token list vs the dark block; probe a secondary/accent element in dark for the flipped value.
  **Variant — FIXED-ACCENT-TOKEN USED INSTEAD OF THE FLIPPING PRIMARY (leaks in LIGHT, not dark):** a template
  may ship BOTH a flipping `--primary` (olive light ↔ lime dark) AND a *fixed* brand token (e.g. `--helix-lime`
  always lime). A component that should follow the inversion but is wired to the fixed token renders the dark
  shade in LIGHT mode. The catch: tinted alpha BACKGROUNDS often DO stay the fixed brand hue in both themes
  (correct), while only the SOLID foregrounds (icon glyph, timeline dot, etc.) must flip — so per element ask
  "solid foreground or tint bg?". **Detect:** `grep -rn 'helix-lime\|<fixed-accent-token>' acm/*/css scss/`;
  for each hit decide if it's a tint-bg (keep) or a solid foreground that should be `--primary` (fix); then in
  LIGHT mode probe the element's computed color — a lime/dark-shade in light = leak. Seen: ja_helix About
  `.journey-dot{background:var(--helix-lime)}` + `.value-iconbox{color:var(--helix-lime)}` → olive in light.
- **`[ONPRIMARY-HEADING-LEAK]`** — a title on a primary/colored band computes a near-white token instead of
  pure white in dark, so it's dim/invisible on the color. **Detect:** probe band-title color in dark; want exact #FFF.
- **`[ARTICLE-CODE-BLOCK-UNREADABLE-DARK]`** — an article/blog prose `<pre>` ships Bootstrap's near-white surface
  even under `data-bs-theme=dark` → gray-on-white code, illegible in dark. **Detect:** on EVERY blog/article that
  contains code, screenshot the `<pre>` in dark + probe its computed `background-color` (must be the dark code
  surface, not `#fff`/near-white). Fix = an always-dark `<pre>` rule (reads in both themes) + a theme-aware inline
  `<code>` chip. (Platform P60.)
- **`[DARK-DELIVERY-NONSTANDARD]`** — the colors may look right but the dark mode is *wired* wrong, so it breaks
  on update / flashes / can't be toggled. **Detect (mechanism):** (a) `grep -n 'data-theme\|t4-dark' templates/<TPL>/css/custom.css`
  must be **0** — dark in `custom.css` is the owner's file (the admin "Edit Custom CSS" GUI clobbers it); all
  dark belongs in its own `css/darkmode.css`. (b) `curl -s <url> | grep -nE 'optimize|darkmode'` — `darkmode.css`
  must load **AFTER** the optimize bundle (else light leaks on equal-specificity ties). (c) Hard-reload a page in
  dark and watch for a **white flash** (FOUC) → the pre-paint resolver is missing/late. (d) The toggle must be
  **static markup** (a layout/element override), not built by JS. (e) Standalone docs (`offline.php`/`error.php`/
  `error-t4.php`) bypass `T4::render()`, so each must **repeat the SAME server-side resolution** as `index.php`
  (pre-paint script + own `darkmode.css` link) AND **honor the GUI lock/default** — a cookie+OS-only pre-paint is
  the bug `[DARK-STANDALONE-LOCK-DESYNC]` (a locked-light site shows a **dark 404/offline** on a dark OS), and
  they must **gate the toggle button + `darkmode.js` the same as index.php** (`[DARK-STANDALONE-ASSET-UNGATED]`
  = darkmode.js/toggle loaded on a locked page). Both found+fixed on ja_stratum. **Detect (GUI-config variant —
  real JA templates ja_titan/ja_nova ship admin dark settings):** if the template exposes
  `other_darkmode`/`other_default_theme` (style edit → **Theme Configuration → Other Settings**), verify they
  actually WORK, not just exist. **The two are orthogonal:** `other_darkmode` gates the toggle BUTTON only;
  `other_default_theme` (light/dark/auto) always decides the theme. So `other_darkmode=0` hides the toggle but
  must **still render the chosen default** — `off + Default Dark` = a **dark-only** site (data-theme=dark, no
  button, `darkmode.css` still loaded). A template that **forces light when disabled** is the bug
  **`[DARK-DEFAULT-IGNORED]`** (it silently throws away the owner's Default-theme choice) — found+fixed on
  ja_stratum. The choice persists via a **COOKIE** (only when the toggle is enabled) that the server resolves
  with no FOUC. **CRITICAL — the resolver must read the profile JSON LOCAL-FIRST:** `local/etc/site/<profile>.json`
  (where the admin GUI SAVES edits) then base `etc/site/<profile>.json`. Reading only base `etc/` ignores every
  admin change = `[DARK-NOT-LOCAL-FIRST]` (toggling dark off / switching default does nothing on the front). It
  must **NOT** read the `site-settings` Registry at `index.php`/standalone time — there it's a partial `stdClass`
  (only `site_logo`, no `->get()`) and `->get()` **fatals** (`[DARK-REGISTRY-STDCLASS]`, a 500 that white-screens
  the page); any fallback guards `instanceof \Joomla\Registry\Registry`. **Verify the matrix** (set
  `local/etc/site/<profile>.json`, clear `media/t4/optimize/*`, `?cb=$RANDOM` per curl to beat page-cache lag,
  confirm in browser) across home + a real content page + a 404: `off+dark`→dark/no-toggle, `off+light`→light,
  `on+dark`→dark+toggle, `on+auto`→OS-follow+toggle — all three page types MUST agree per mode. Same resolver
  must exist in `component.php` AND the standalone pages (all bypass `index.php`). Full standard + copy-paste:
  `references/dark-light-mode-standard.md`; manifest/scaffold detail:
  `references/darkmode/gui-config-delivery.md`.

## Full-bleed / spacing / structure classes
- **`[FULL-BLEED-CUT]`** — a section band that should span the viewport is trapped in a container, leaving
  side gaps (most visible in dark, or when the band color ≠ page bg). **Detect:** `getBoundingClientRect`
  on each band — `left==0 && right==innerWidth`; screenshot in dark.
- **`[CANVAS-CONTENT-CAP-LOST]`** — the INVERSE of FULL-BLEED-CUT and far easier to miss: to make `{loadposition}`
  ACM bands edge-to-edge, the template strips the reading-width container (`body:has(.voy-canvas-page) .container{max-width:none;padding:0}`).
  That correctly full-bleeds the band BG (which lives on the SECTION, the container's parent) but ALSO uncaps the
  CONTENT inside every block's `.container`. Centered-text blocks still look fine, but **left-aligned / grid blocks
  (split "Our Story" 2-col, team grid, feature cards) ram the viewport edge — heading clipped at x=0**. A computed
  `bandEdges` probe (left==0) PASSES while the render is broken → SCREENSHOT every canvas marketing page (About/
  Pricing/Landing/etc). **Detect:** on a canvas page, `getBoundingClientRect().left` of a left-aligned heading — if
  ~0 (not the ~150 reading-margin), it's clipped. **Fix:** re-cap the content WITHOUT shrinking the band:
  `@media(min-width:768px){ body.item-N .ja-acm>.container{max-width:1188px!important;margin-inline:auto!important;padding-inline:24px!important} }`
  — needs `!important` (the `:has()` strip rule out-specifies). The band stays full-bleed (its bg is on the section). (Voyara About.)
- **`[SECTION-HEIGHT/PADDING-WRONG]`** — section too short/tall vs design, or a self-padded module wrapped in
  a section that ALSO pads → doubled padding. **Detect:** computed section padding-top/bottom vs the `.pen`
  node; don't eyeball.
- **`[GAP-WRONG]`** / **`[CARDS-TOUCHING]`** — grid/flex gap wrong because a framework gutter var (e.g.
  `--t4-gutter-x`) or a stray BS utility overrides your scss. **Detect:** measure the REAL rendered gap
  between two adjacent items; don't trust the scss value.
- **`[BORDER-DOUBLED/CUT/WRONG]`** — a divider doubled (two stacked hairlines + a gap reads as "thick"), cut
  short of full width, wrong color, or a framework wrapper bg peeking below an element reads as a thick line.
  **Detect:** walk the element + its ancestors + the next sibling for border-top/bottom + box-shadow +
  background; compare rendered thickness/extent to the `.pen` (which may legitimately have a thin hairline).
- **`[FIELD-WIDTH-COLLAPSE]`** — a com_users edit form (profile-edit, registration) renders cramped, narrow,
  left-aligned fields (~240px) inside cards that themselves shrink to ~310px, instead of full-width fields in a
  full-width card. **Two compounding causes:** (1) the form/`.edit-card` is never given `width:100%`, so a
  flex/inline container collapses to fit-content (the widest child); (2) the platform default
  `.form-control{max-width:240px}` caps every input. A computed token/colour sweep PASSES while the layout is
  visibly broken. **Detect:** `getBoundingClientRect().width` on the form, the card, and an input — if card ≪
  container or input==240, it's this; screenshot. **Fix:** in the page overlay, `width:100% !important;
  max-width:none !important` on the form, `.edit-card`, `.control-group`, `.controls`, AND every
  input/select/textarea/`.choices`. (Confirmed Nexora profile-edit item-428.)
- **`[SEAM/OVERLAY-MASK]`** — a backdrop/pseudo-element/sticky layer covers part of a panel. **Detect:**
  screenshot; check z-index/stacking, especially after a position/side change.
- **`[CTA-BAND-GLOW-LEAK]`** — a band/module-chrome class draws a full-width gradient + white radial `::before`
  glow behind a CARD-style CTA, so a stray halo leaks on the page bg outside the card (worst in dark). **Detect:**
  in dark, screenshot card-style CTAs; no glow/gradient may paint outside the rounded card. Suppress band bg +
  `::before` via `:has(.<card>)`. (Platform P57.)
- **`[STICKY-HEADER-CONTENT-GAP]`** — a blank page-bg strip sits between the sticky header and a full-width
  masthead on inner pages, from T4 base `.t4-main-body{padding-top:Npx}`. **Detect:** on every page that opens
  with a full-bleed masthead, probe `.t4-main-body` computed `padding-top` (want 0 via `:has(.sec-masthead)`) and
  screenshot the header↔masthead seam. (Platform P58.)
- **`[LOADPOSITION-MODULETABLE-SEAM]`** — `{loadposition}` ACM stacks on marketing pages show faint seam
  borders/margins between bands from T4 base `.moduletable` chrome. **Detect:** screenshot band-to-band seams +
  probe a `.moduletable` border/margin (want 0); use `,none` chrome + a defensive canvas-scoped reset.
  (Platform P59; extends the §"stray `.moduletable` border" note to multi-stack `{loadposition}` pages.)
- **`[MOCKUP/IMG-SIZED-WRONG]`** — a hero/dashboard/terminal mockup or image renders shorter/smaller than the
  `.pen` (a too-small min-height or inner element). **Detect:** measure the `.pen` panel height + inner pieces
  vs live; fix the constraining rule.
- **`[DESIGN-EXPORT-DARK-VISUALS]`** — a section's MAIN VISUAL (hero dashboard, code panel, trace/guard panel,
  bento chart, stats card) is drawn as hand SVG/CSS the owner can't edit, OR is an exported image that the
  template's chrome then mangles. The visual must be a **swappable media-field `<img>`** exported from the `.pen`
  **DARK** frame at **2× the CSS display size** (pencil `export_nodes` scale 2) so it's crisp on retina and reads
  on light too (a dark "screenshot" frame looks intentional on white). **Detect + the CRITICAL render traps:**
  (a) **Stray border/double shadow** — the export carries its OWN frame + soft shadow baked inside TRANSPARENT
  alpha padding, so any template `border`/`box-shadow`/`border-radius` on the `<img>` traces a rectangle around
  the empty padding and DOUBLES the shadow. Screenshot the image edges; if you see a hairline rectangle offset
  from the visible panel or a doubled shadow → STRIP the template border/shadow/radius on these imgs.
  (b) **Distortion from fixed w/h** — one renderer can serve panels of DIFFERENT aspect ratios; a hardcoded
  width/height squashes them. Set intrinsic `width`/`height` per file via `getimagesize()`; assert the rendered
  aspect == the file's.
  (c) **Panel-in-panel** — if the export already includes panel chrome (e.g. a code-panel tab bar), the renderer's
  OWN chrome duplicates it → a frame inside a frame. HIDE the renderer's duplicate chrome when the image carries it.
  (d) **Bespoke CSS-art block** (e.g. a shero stats card) → render the IMAGE with the CSS art as a graceful fallback,
  not the CSS art alone. (e) Verify the DARK export on the LIGHT theme too — it should read as an intentional
  white-framed screenshot, not a broken dark blob.

## Typography / icon / color classes
- **`[ICONFONT-NOT-VECTOR]`** — FontAwesome/icon-font (or unicode) glyph used where the design specifies a
  lucide/inline-SVG icon; setting the color doesn't fix the glyph. **Detect:** confirm each icon is the exact
  designed glyph as inline SVG; grep the rendered content for `fa-`/icon-font classes.
- **`[FONT-MONO-MISSING]`** — eyebrows/meta/code/badges fall back to the sans font because the mono utility
  isn't defined. **Detect:** computed `font-family` on every element the design renders in a mono face.
- **`[MUTED-COLOR-LEAK]`** — a framework "muted/secondary" default (e.g. BS `.text-muted` = `rgba(33,37,41,.75)`)
  leaks where the design wants a specific grey. **Detect:** probe exact rgb on every caption/sub/meta — not
  "looks grey".
- **`[PRIMARY-LINK-LEAK]`** — a secondary/neutral link renders the primary brand color. **Detect:** probe
  link colors; secondary links should be the neutral token unless the design says otherwise.
- **`[HOVER-JUMP]`** — an element shifts position/size on hover (a transform that moves the box, a border that
  adds width, a padding change). **Detect:** hover and compare `getBoundingClientRect` rest vs hover — must
  be identical; only bg/color may change.
- **`[DOUBLE-TICK-GLYPH]`** — a list item renders TWO check marks because the markup ships an inline `<svg>` tick
  AND scss adds `li::before{content:"✓"}`. **Detect:** screenshot any checklist → exactly ONE tick per item; if a
  `<li>` has both an `<svg>`/icon and a non-empty `::before` content, drop the CSS `::before` (keep the SVG).
  (Platform P61.)

## Data / content / render classes (a CSS review misses these — interact + check data)
- **`[CHROME-BLOB-RENDER]`** — a designed canvas page renders as raw article text + page-heading + author
  byline + breadcrumb because the menu item lacks the fullwidth layout/`component_id`. **Detect:** visit the
  page via EVERY link that reaches it (nav, mega panel, footer) — not just the canonical URL; a blob ≠ the design.
- **`[MEGAMENU-HOVER-DEADZONE]`** — mega panel opens but items vanish / can't be clicked when moving the cursor into
  it. The usual misdiagnosis is "hover timing"; the REAL cause is almost always **compositing**: a persistent
  `will-change`/`transform`/`filter` on the HEADER (e.g. a scroll-reveal `.reveal` left on the header `.t4-section`)
  promotes it to a layer/stacking context, so its absolutely-positioned dropdown can't paint/hit-test above LATER
  sibling sections — the hero captures the pointer over the panel. **Detect (do this FIRST):** open the panel, then
  `document.elementFromPoint(x,y)` across its rect — if it returns the hero/main section instead of the panel, it's
  this. (computed/CSS + `:hover` probes all pass — interaction+compositing only.) **Fix:** strip the persistent
  compositing trigger from the header/sticky ancestor (exclude header/sticky/megamenu sections from scroll-reveal;
  make `will-change` transient; safety `.t4-header,.t4-sticky,.reveal:has(.t4-megamenu){will-change:auto}`). A
  desktop hover-intent JS shim (~360ms grace) is a useful complement for genuine travel timing but does NOT fix the
  hit-test bug. (Platform P56.)
  **Second cause — GEOMETRIC GAP, not compositing (Northgate 2026-09, gotchas #80):** `elementFromPoint` over the
  panel is clean, yet the panel still vanishes on the way in. T4's `megamenu.js` opens on `mouseenter` of the
  top `<li>` and closes on `mouseleave`; any strip of pixels between the trigger's box and the panel's box that
  is NOT a descendant of that `<li>` (a full-width panel hung from the header's bottom edge with the `<li>` made
  `position:static`; a panel pushed down by `top`/`margin`; a wrapped nav row) fires `mouseleave` mid-travel.
  Forced-open probes and screenshots pass; only a real pointer path fails. **Detect:** `scripts/review/
  mega-hover.mjs <url>` — real hover, walk straight down in 4px steps, sideways to the first link, click; it
  prints `gapPx` and `closedAtY`. Any `gapPx > 0` without a bridge is this class. **Fix:** bridge the strip with
  pseudo-elements that are DOM children of the `<li>` (`li.show > a::after` under the trigger, `.dropdown-menu.
  show::before` above the panel, height = the gap) — never a JS grace timer alone.
- **`[EMPTY/WRONG-BINDING]`** — a list/blog/category/author/featured view bound to an empty or wrong category/
  source renders "No articles". **Detect:** confirm each list view actually renders rows.
- **`[HARDCODED-DATA]`** — author name/bio/avatar/count, dates, or stats are hardcoded (same for everyone)
  instead of per-record dynamic. **Detect:** open two different records (e.g. two authors / two articles) —
  the data must DIFFER and be filtered correctly; a value identical across records is a hardcode smell.
- **`[DEAD/MALFORMED-LINK]`** — `href="#"`, `?Itemid=` only, `/index.php/...`, or malformed (`/index.phpx`).
  **Detect:** click real links; assert the URL bar is a clean SEF route and the target is correct.
- **`[NL-CORRUPTION]`** — literal `\n` strings in DB content (from a `mysql -N` edit) render as visible text /
  phantom flex children. **Detect:** grep rendered main text for a literal backslash-n; always edit DB content via PDO.

### Content-architecture / GUI-editability classes (run the pass-2 audit → `content-architecture-audit.md`)
- **`[HARDCODED-COPY]`** — text/number/label literal in `html/**` or `acm/**/tmpl/*.php` instead of a param/
  field/language-key. **Detect:** grep PHP for literal strings being echoed that aren't `Text::_`/`$helper->get`/fallback.
- **`[HARDCODED-PEOPLE]`** — author/team persona (role/bio/avatar/socials) in a PHP map, not com_fields / team-ACM.
  **Detect:** read the author override — a `$profiles=[...]` array keyed by id is the smell; should read com_fields.
- **`[FAKE-STAT]`** — same invented number for every record (followers/reads/KPIs). **Detect:** compare two records; identical = hardcode.
- **`[IMG-NOT-EDITABLE]`** — image as a hardcoded PHP/CSS path, not a `type="media"` field / article image.
  **Detect:** can an admin swap it in Media Manager without a code edit? If not → flag.
- **`[BODY-SCRIPT]`** — inline `<script>`/`<link rel=stylesheet>` inside a `#__content` article body (WYSIWYG
  "clean" save strips it → page breaks). **Detect:** query bodies for `<script`/`rel="stylesheet"`.
- **`[RAW-LANG-KEY]`** — a `Text::_('KEY')` whose key is missing renders `KEY` on screen. **Detect:** scan rendered pages for ALL-CAPS `TPL_`/`COM_` tokens.
- **`[CLONE-LEFTOVER]`** — `t4_bs5_blank` demo data still showing: demo categories (People/Food and Drink/
  Magazine), 2021 demo articles, demo tags, `t4-blank-logo.png`. **Detect:** check Categories/Category/Archive/Tag
  pages + the logo render against the DESIGN's real content; confirm taxonomy menu items point at design content.
- **`[FIELDS-ON-REGISTRATION]`** — internal `com_users.user` fields visible on the public signup form (access=Public).
  **Detect:** load `/registration` logged-out; no `author_*`/`profile_*` fields should appear (see P38).
- **`[NOT-REPRODUCIBLE]`** — no DB dump / `images/` not bundled → a fresh quickstart can't reproduce the site.
  **Detect:** confirm a full dump exists + re-imports; "copy the template folder" is NOT reproduction.

## Strict-mobile / responsive-fidelity classes
- **`[DESKTOP-RULE-LEAKS-MOBILE]`** — a media-UNSCOPED `body.<page-hook>`/`.nx-page-*` desktop rule LEAKS onto the
  strict-mobile node (equal specificity → later source order wins), so the mobile frame silently inherits a
  desktop value. AND a desktop "improvement" (e.g. an icon `border:0`) may need explicitly UN-doing on mobile to
  match the `.pen` mobile frame. **Detect:** wrap desktop-only rules in `@media (min-width:768px)`; at 390px probe
  any property the desktop scope set and assert it's the mobile value, not the leaked desktop one.
- **`[DEAD-576-767-BAND]`** — a page styled with a `@media (max-width:575.98px)` block leaves a DEAD 576–767px
  band (gets desktop or partial styling, not the mobile treatment). **Detect:** grep the page block for `575.98`;
  if present alongside (or instead of) a `767.98` block, the 576–767 range is unstyled-mobile. **Fix:** use ONE
  complete `≤767.98px` block holding every section's mobile values.
- **`[STRICT-PER-FRAME-MOBILE]`** — strict per-frame mobile = RESTRUCTURE each section to the `.pen` mobile node
  (table→list, divider-row→2×2 card grid with surface bg + border + radius the desktop row never had, multi-col→
  stacked), NOT a width-reflow of the desktop markup; KEEP all sections. **Detect:** diff the live mobile render
  against the `.pen` mobile frame structurally (count + shape of nodes), not just at the viewport-fit level. NB:
  when a desktop `::before` divider becomes a mobile card grid, `display:none` the divider or you get BOTH a card
  border AND the hairline.

## Token / architecture classes
- **`[HOOKLESS-CANVAS-BASE-LEAK]`** — a `.nx-canvas-page`/article view WITHOUT its own `.nx-page-<x>` page hook
  silently inherits the shared base masthead (H1/sub size+weight drift) and reuses another page's section look.
  **Detect:** every canvas/article page must carry its own `nx-page-*` hook on the wrapper; diff each canvas
  article's body against ITS OWN `.pen`. Also strip any inline `<style>`/`<script>` ([BODY-SCRIPT]) → external/
  page-scoped scss. (Platform: P43 masthead-title default leaks through a missing hook.)
- **`[UNDEFINED-TOKEN-ZEROES]`** — a `var(--token)` that is NOT defined in the template's token set (e.g.
  `--radius-md` where only `--radius`/`-sm`/`-lg`/`-xl` exist) silently resolves to `0`/initial with no fallback,
  so radii/spacings render square/collapsed. **Detect:** grep used `var(--x)` names against the `:root` token
  declarations; any unmatched name = a silent zero. **Fix:** map to the nearest defined token (e.g.
  `--radius-md`→`--radius`) or add a fallback.
- **`[PER-VIEW-PAGINATION-DARK-MISSING]`** — each NEW paginated/list view needs its OWN page-scoped pagination
  dark remap (pills → `var(--color-surface)`), else Bootstrap's `--t4-pagination-bg:#fff` leaks white-on-dark
  pills. **Detect:** on every list view in DARK, probe a pagination pill's computed `background-color` ≠ `#fff`.
  (Easy to miss one — item-421 shipped without it while siblings 419/420/423 had it.)
- **`[RACE-FREE-OVERLAY-LOAD]`** (build technique, not a defect) — load a per-page CSS/JS overlay WITHOUT touching
  the shared `index.php`: place a `<link rel="stylesheet">` as the first node of the article body, OR use the
  per-view override's `addStyleSheet`/`addScript` keyed off the body `item-N`/wrapper class. This avoids a shared
  index.php edit and a body-class gate → enables parallel multi-agent builds where shared scss/index.php are
  off-limits. (Wrap page JS in DOMContentLoaded; the T4 optimize bundler can emit it early.)

- **`[BS-CARD-COLUMN-LEAK]`** — an override `<article>`/card that also carries Bootstrap's `.card` class inherits
  BS `.card { display:flex; flex-direction:column }`. If your override styles the card with `display:flex` but
  never sets `flex-direction`, a designed HORIZONTAL split card (image-beside-text featured/media card) silently
  stacks VERTICALLY on desktop (image-top), because `.card`'s `column` wins the cascade. **Detect:** on any
  horizontal-split card in the override, probe computed `flex-direction` at desktop — must be `row`, not `column`.
  **Fix:** add explicit `flex-direction: row` to the card rule (keep the `@media(max-width)` `column` for mobile
  reflow). Seen: ja_nexora blog featured card (`.blog-featured-card.card`).
- **`[BS-PAGINATION-CORNER-SPLIT]`** — Bootstrap pagination rounds only the OUTER corners via
  `.page-item:first-child .page-link { border-top-left-radius … }` / `:last-child`. A custom pager that sets a
  uniform `border-radius` on `.page-link` still shows the prev/next cells with a SPLIT radius (e.g. `10px 0 0 10px`)
  because BS's first/last-child rules out-specify the bare `.page-link`. **Detect:** probe computed `borderRadius`
  on the prev + next pager cells — must equal the inner cells, not a corner-split. **Fix:** add explicit
  `.page-item:first-child .page-link, .page-item:last-child .page-link { border-radius: <r>; }`.

- **`[INLINE-SVG-DUP-WIDTH]`** — a PHP inline-Lucide helper that bakes a default `width="18" height="18"` into the
  SVG string and ALSO accepts an `$extra` attribute string appended AFTER it (e.g. `width="13"`), emits a `<svg>`
  with TWO `width`/`height` attributes. HTML uses the FIRST occurrence → the helper default (18px) wins and the
  per-call override (13px) is silently ignored. Breadcrumb/inline separators render oversized. **Detect:** probe the
  rendered separator/icon `getBoundingClientRect().width` vs the `.pen` size; if it equals the helper default and not
  the call-site value, suspect a duplicate attr. **Fix (overlay-safe):** a scoped CSS rule
  `... .nx-ic { width: <px>; height: <px> }` beats the attribute; OR fix the helper to merge `$extra` over the
  default. Seen: ja_nexora single-article breadcrumb chevron (13px wanted, 18px rendered).
- **`[META-FLIP-TOKEN-WRONG-VALUE]`** — a component defines its OWN local light/dark "meta-grey" flip token
  (`--nx-meta: #8A90AB` light / `#6B7196` dark) instead of reusing the design's `--color-text-dim`
  (`#888EA6`/`#6B7196`). The dark value happens to match, so a dark-only check passes, but the LIGHT value
  (`#8A90AB`) is a *different grey* than the design `$text-dim` (`#888EA6`) — a subtle but real light-mode leak on
  every consumer (breadcrumb links, byline meta, author role/social, related meta). **Detect:** probe each meta/dim
  text in LIGHT; rgb must equal the design `$text-dim`, not a near-grey. **Fix:** remap the local token to
  `var(--color-text-dim)` (one line, both themes correct). Seen: ja_nexora single-article `--nx-meta`.

## ACM editability classes (JA dev-review rejections — "config has no effect" / "not editable")
These came from real JoomlArt reviewer feedback. They are invisible to a pixel/dark/responsive sweep — a
page can render perfectly while the owner cannot edit it. Run them as a mandatory whole-template axis.

- **`[ACM-DEAD-FIELD]`** — a field declared in a block's `tmpl/*.xml` (or `config.xml`) that the block's
  `tmpl/*.php` NEVER reads (`$helper->get()/getRows()`). Symptom: the owner edits it in admin and the
  front-end does not change ("changing the configuration makes no change on the front-end"). **Detect** (whole template,
  scriptable): for each block, diff XML `<field name>`/`<item name>` against `$helper->get('name'`/`'name.'`
  occurrences in the PHP — *account for dynamic access* like `$helper->get('data.val'.($p+1), $i)` (a literal-
  string grep will false-positive these). Any field never read = dead. **Fix:** WIRE it (preferred when it is a
  meaningful option — e.g. `align`, `billing-toggle` default period) or REMOVE it (block xml + strip the key
  from the live module params). Seen: ja_stratum hero `align`/`image`/`nav-items`/`chart-label`/`kpi`, pricing
  `billing-toggle`.
- **`[ACM-FIELD-OVERRIDDEN-DEAD]`** — a sibling field silently bypasses another's render path, so the bypassed
  field's config is dead *in that module* even though the PHP reads it. Classic: a `hero-media`/`media-html`
  image branch that `else`-skips the granular CSS-mockup fields (KPI/nav/chart), or `media-html` taking
  priority over `intro-img`. The owner edits the granular fields → nothing, because the image branch wins.
  **Detect:** for each block with an A-vs-B branch, check the live module — if A is set, are B's fields orphaned?
  **Fix:** pick ONE coherent model (image = the swappable mockup) and PRUNE the now-dead granular fields, or
  drop the image so the granular fields drive the render. Don't ship both. Seen: ja_stratum hero.
- **`[ACM-HTML-BLOB]`** — structured/repeatable content (a `<ul>`/`<li>` checklist, `<a class="btn">` CTA,
  inline `<svg>` icons, multiple cards, an `<img>`/media) jammed into ONE editor/textarea field when the block
  already exposes discrete fields for it (a `jalist`, a `button`+`btn-link`, a `type="media"` slot). The owner
  can't edit the pieces; the reviewer rejects it ("should be split into separate fields"). **Detect**
  (scriptable): scan every published `mod_ja_acm` `jatools-config` for `<ul|<li|<a[^>]*class=.*btn|<svg|<img`
  inside a single field value. (Plain multi-`<p>` prose in a *description* field is OK — not a blob.) **Fix:**
  migrate the blob into the block's discrete fields (paragraph→desc, list→jalist items, CTA→button fields,
  media→media field); add a `btn-style` list field if the design needs non-default button variants. Seen:
  ja_stratum all 6 features-intro splits (Deploys/Scale/Compute/Networking/Observability/Integrations API).
- **`[ACM-ADDED-ITEM-MISFORMAT]`** — a block's repeatable `jalist` renders added items with a default style that
  does NOT match the design (orphaned icon-box + bold `<h5>` + sub-line where the .pen wants a bare check-row),
  so the moment the owner adds an item it looks wrong (placeholder "Sample title / Sampl desk", a stray FA car
  icon). Often hides because the demo never populated that list (`maxRows=0`), so it was never seen rendered.
  **Detect:** find every jalist that is never populated in any live module (so its render was never visually
  verified), seed a test item, screenshot. **Fix:** make the block's DEFAULT item render match the .pen
  (e.g. title-only item → bare green circle-check row), and seed real content so the demo exercises it.
  Seen: ja_stratum features-intro `data` list.

## How to use this catalog
For each component/axis, scan the classes above that could apply, run the detection, and fix in-template.
When you find a NEW class that isn't here, add it (one line: tag + how-to-detect). When the root cause is a
specific framework MECHANISM (a named base rule/default/vendor behavior), also add the full entry to
`platform-latent-bugs.md` with its fix recipe + pre-flight check — see `review.md` §"Feed the catalogs forward".

## [DARK-TOGGLE-GATE-PATH-DESYNC] — gated theme-toggle element uses wrong dirname() depth → dead toggle
**What:** the GUI-configurable dark mode is correct in `index.php` (reads the site profile JSON →
`other_darkmode`/`other_default_theme`, server-resolves theme + cookie, conditionally loads darkmode.css/js,
locks the site when disabled). But the **theme-toggle element** (`html/layouts/t4/element/theme-toggle.php`)
re-reads the SAME setting to decide whether to render the button — and computed the template root with the
**wrong `dirname(__DIR__, N)` depth**. The element sits at `templates/<tpl>/html/layouts/t4/element/`, so the
root is **4 levels up**, not 3. `dirname(__DIR__,3)` pointed at `templates/<tpl>/html` (no `etc/site` there),
so `is_file()` always failed → it fell back to the `site-settings` param, which at this render point is a partial
**`stdClass`** (only `site_logo`, no `->get()` — see `[DARK-REGISTRY-STDCLASS]`) → either a fatal or a stale
`other_darkmode=1` default → **the toggle rendered even when the admin DISABLED dark mode**. And since `index.php`
correctly does NOT load `darkmode.js` when disabled, the rendered button is **dead** (no click handler).
**Detect:** set `other_darkmode:false` in the active **`local/etc/site/<profile>.json`** (where the GUI saves —
NOT base `etc/site/`), clear cache, render the front: `window.<NAME>Theme.enabled` must be `false`,
`script[src*="darkmode.js"]` must be ABSENT, AND `document.querySelectorAll('.t4-theme-toggle').length` must be
**0** (count the `<button>`, not CSS class refs). If `enabled:false` + js absent but the toggle is still present →
the element's gate desynced from index.php (this bug). Test BOTH lock states (default=dark → dark-only,
default=light → light-only) and confirm the toggle is gone in both.
**Fix:** make the element resolve the template root the SAME way index.php does and at the correct depth
(`dirname(__DIR__, 4)` from `html/layouts/t4/element/`); read the profile JSON **LOCAL-FIRST**
(`local/etc/site/` → base `etc/site/`), and only fall back to `site-settings` when it `instanceof \Joomla\Registry\Registry`
— so the button's visibility can never desync from index.php's load/lock decision. Seen: JA Stratum
(`dirname(__DIR__,3)`→`4`, + base-only→local-first). **Pre-flight for any gated element:** echo the computed path
once and assert `is_file()` is true for the live `local/`-or-base profile before trusting the gate.

## [ADMIN-FORM-NO-LEGEND] — dark fields don't render in the T4 settings form (template ships its own params/typelist-site.xml)
> Build-side prevention + full contract: `references/dark-light-mode-standard.md` §8a (platform bug P85).
**What:** T4 builds the "Site" settings form from `Path::findInTheme('params/typelist-site.xml')` (template copy if it ships one, else base plugin) + merges `templateDetails.xml` `<site><fields>`. The dark fields live in a `<fieldset name="site-other" subgroup="1">` that only renders if a `type="legend"` `site-other` group exists in the loaded form. A template that ships its OWN `params/typelist-site.xml` (e.g. to tweak the logo fieldset) usually OMITS `site-other` → dark fields have no group → invisible in admin even though everything else is correct. Seen: ja_spark, ja_voyara.
**Detect:** check `templates/<tpl>/params/typelist-site.xml` exists AND lacks a `site-other` legend fieldset; in admin the dark settings are simply absent. **Fix:** add a full `<fieldset name="site-other" type="legend" subgroup="1" …>` (favicon + back-to-top + other_darkmode + other_default_theme) to the template's own params file.

## [ADMIN-LANG-SITELEVEL-STALE] — admin shows raw constants (TPL_THEME_AUTO…) because it reads the site-level language file, not the template's
> Build-side prevention + full contract: `references/dark-light-mode-standard.md` §8b (platform bug P84).
**What:** Joomla `StyleModel` loads `tpl_<name>` language from `$client->path` (the SITE ROOT) FIRST and short-circuits — `<root>/language/en-GB/en-GB.tpl_<name>.ini` shadows `templates/<name>/language/...`. JA quickstarts ship a site-level copy. Add the 7 dark constants only to the template-folder ini and the admin still renders raw `T4_DARK_MODE_LABEL`/`TPL_THEME_AUTO`. Fleet-wide most site-level files had 0/7 (ja_spark had 4/7 → label OK but options raw — the classic tell).
**Detect:** `ls <root>/language/en-GB/en-GB.tpl_<name>.ini`; if present, `parse_ini_string` it (real PHP — BSD `grep \s` lies) and confirm all 7 constants resolve. **Fix:** put the 7 unified strings in BOTH the site-level file AND the template-folder copy. NOTE: the site-level file is OUTSIDE the template folder → NOT in the template zip; quickstart-based installs need it updated separately or removed.

## [COMPONENT-TMPL-DARK-STALE] — component.php left on the old resolver after index.php is fixed
> Build-side prevention + full contract: `references/dark-light-mode-standard.md` §8c (platform bug P81).
**What:** `component.php` (`?tmpl=component`) bypasses index.php and is the most-forgotten surface. Even JA Stratum (the reference build) shipped a component.php still reading base `etc/site/` with `(int)$cfg===1` after index.php was made local-first + filter_var. **Detect:** grep component.php for `local/etc/site` (must be present) and `filter_var.*other_darkmode` / NOT `(int).*other_darkmode`. **Fix:** mirror index.php's local-first resolver. (Platform P81 is the related "no resolver at all" case.)

## [PKG-MANIFEST-INCOMPLETE] / [DARK-REGISTRY-ISOBJECT] — packaging + guard traps
> Build-side prevention + full contract: `references/dark-light-mode-standard.md` §8c (manifest) + §8d (Registry guard; platform bug P83).
**[PKG-MANIFEST-INCOMPLETE]:** a NEW root file (shared resolver) or NEW top-level folder (`local/`) not listed in `templateDetails.xml` `<files>` is dropped on package/reinstall → a `require_once` of a dropped root file then fatals every page. Detect: every root `.php` the template uses + `local/` must appear in `<files>`. Seen: ja_alpha (theme-config.php), ja_stratum/helix/voyara (`<folder>local</folder>` missing).
**[DARK-REGISTRY-ISOBJECT]:** guarding the `site-settings` fallback with `is_object($ss)` is NOT enough — the partial `stdClass` IS an object, so `$ss->get()` still fatals (P83). Guard must be `instanceof \Joomla\Registry\Registry`. Seen: ja_nexora.

## `[J6-LANGCONST-RAW-IN-OVERRIDE]` / `[COM-TAGS-MARGIN]` / `[HX-CHIP-BASE-COLLISION]` — small template-side traps (ja_helix 2026-06)
- **`[J6-LANGCONST-RAW-IN-OVERRIDE]`** — in a Joomla 6 `html/com_content/article` override, `Text::_('JHOME')` rendered the raw constant `JHOME` (not "Home") on the live frontend. Don't rely on core `J*` constants resolving inside a com_content override's breadcrumb/UI — define your own `TPL_<TPL>_BREADCRUMB_HOME="Home"` (template lang file + site-level mirror) and use that. Detect: grep the rendered breadcrumb for a literal `J`-prefixed token.
- **`[COM-TAGS-MARGIN]`** — the `com-tags` component adds its OWN `margin-top:32px` on the listing wrapper, ON TOP of P58's `.t4-main-body` `padding-top` → a doubled gap below the (already flush) masthead. Zero both (`body.item-<tags> .t4-main-body{padding-top:0!important}` AND the `.com-tags` margin) in the page overlay.
- **`[HX-CHIP-BASE-COLLISION]`** — a generic base pill class (e.g. `.hx-chip`: small pad/gap/radius/size) silently overrides any element that REUSES it as the base for a larger custom pill (tag cloud, filter chips). Don't layer custom pills on a shared base chip class; give the custom pill its own class. Detect: computed pad/radius on the custom pill ≠ design while the markup "has the right class".
- **Masthead dark band (positive pattern):** the inner-page `acm-page-masthead` band in DARK = a per-direction primary radial tint over `#161B18`, layered ABOVE the existing `.hx-grid-bg` lines (same element) — so the dark rule must re-declare the two grid `linear-gradient`s in its `background-image` or the shorthand wipes the grid. Dark-scoped only; light masthead stays transparent.

### `[SEEDED-CATEGORY-MENU-EMPTY]` — a programmatically-seeded category page renders empty (build trap) 🔴 ja_helix 2026-06
When demo content seeds a category MENU ITEM via the `Table('Menu')` API (not the admin) AND points it at a custom `&layout`, the T4 category view may not populate the blog buckets → the page shows its masthead but **zero articles**, even though the category has published articles and the params/columns are md5-identical to a working item. See platform bug **P90 `[T4-CATEGORY-CUSTOM-LAYOUT-EMPTY]`** for the full root cause + the template-side fallback-query fix (load the category's articles directly when `lead_items/intro_items/link_items` are empty). **Review probe:** after any seeded category menu item, curl the route and grep for an article title; if absent while `&id=<cat>&Itemid=<admin-made-item>` shows them, apply the fallback. Recurs whenever demo seeding creates category menu items programmatically.

### `[MEGA-LEAF-LABELS-VS-DESIGN]` — mega leaf labels reflect real menu-item titles, not the .pen's terse labels (usually accept) 🟢 ja_helix 2026-06
A 3-column mega built from real menu items shows the items' actual titles (e.g. "All Categories"/"Our Writers"/"Article Archive") which often read better than the .pen's terse labels ("Categories"/"Authors"/"Archive"). The column GROUPING + token styling should match the .pen exactly; the leaf labels are editable menu titles. Treat as accepted unless the user wants exact label parity (then rename the menu items — params/title only, nested-set-safe).

### `[CHROME-PERMA-DARK-VS-THEMED]` — chrome built "permanently dark" when the .pen chrome is THEMED 🔴 ja_helix 2026-06
**What:** a build hardcodes the header/footer/mega/off-canvas to a dark `--chrome-*` palette ("permanently dark in both modes"), but the `.pen` chrome components are theme-bound: Navbar fill=`$bg`, Footer=`$elevated`, CTABand=`$elevated→$surface`, Mega/Dropdown=`$surface` — all flip light↔dark. Result: in LIGHT page mode the header is a black bar (should be #FBFCFA), footer dark (should be #F2F5EE), megas dark (should be #FFFFFF). Invisible if you only ever review chrome in dark.
**Detect:** read the `.pen` chrome component root `fill` values (`batch_get` Navbar/Footer/CTABand/Mega) — if any is a themed variable (`$bg`/`$surface`/`$elevated`), the live chrome MUST flip in light. Probe light: `getComputedStyle('.helix-header').backgroundColor` must equal the design `$bg` light, not #0A0D0C.
**Fix:** make `--chrome-*` theme-driven — design LIGHT values in the light `:root`, a `html.t4-dark{ --chrome-* }` block in darkmode.scss with the design DARK values (== the old hardcoded values, so dark is visually unchanged). Map the chrome ACCENT to `var(--primary)` so the logo glyph/active states re-skin per direction like the CTA. **Trap:** keep `--chrome-elevated` (footer) as its OWN token = design `$elevated` — do NOT map it to the body `--elevated`, which a build often sets DARKER (e.g. #0F1311 vs design #161B18) for body surfaces; mapping shifts the dark footer.

### `[ACM-WRAPPER-EATS-FLEX-GAP]` — a cluster gap collapses because the ACM wraps its links in one `.custom` div 🟡 ja_helix 2026-06
**What:** the header right-cluster ("Sign in" + CTA) sets `gap:14px` on `.hx-right-links`, but the header-cta ACM emits both links inside one `<div class="ja-acm … custom">`. The cluster gap then has a single flex child (the wrapper) → the two links inside collapse to the literal markup whitespace and read "too close". General trap: any ACM/module that wraps multiple inline children breaks the parent's `gap`.
**Detect:** measure the rendered gap between the two links (rect math) vs the .pen; if ≪ design while the parent has the right `gap`, the wrapper is the culprit. **Fix:** make the wrapper itself the flex row (`.hx-right-links > .ja-acm, > .custom { display:inline-flex; gap:14px }`).

### `[MEGA-COL-WRAP-COLLAPSE]` — mega columns collapse to a narrow width because link text wraps 🟡 ja_helix 2026-06
**What:** a fit-content mega panel renders cramped / "cut short in width" because multi-word leaf links ("All Categories", "Article Archive") WRAP, so each flex column shrinks to the widest single word (~77px) instead of the whole label. Looks like the panel is clipped.
**Detect:** force-open the panel, measure `.mega-nav>li>a` — if link height is 2 lines (e.g. 40px not 22px) the column collapsed. **Fix:** `white-space:nowrap` on `.mega-nav>li>a` + `.mega-col-title` → columns size to content. Then confirm the widened panel doesn't overflow the viewport (rightmost trigger's mega `right < innerWidth`).

### `[MEGA-HOVER-DEADZONE]` — hover megamenu closes in the gap between trigger and panel 🟡 ja_helix 2026-06
**What:** T4 megamenu opens on HOVER; the dropdown sits `margin-top:8px` below the trigger. The panel is a child of the `<li>` (so hovering the panel keeps it open), but the 8px visual gap belongs to neither box — moving the cursor straight down crosses an unhoverable dead zone and the menu closes before you reach it ("very hard to click"). **Fix:** a transparent `::before` bridge on the panel (`position:absolute; top:-10px; left:0; right:0; height:10px`) extends the panel's hit-area up to the trigger for a continuous hover path. **Detect:** check the dropdown's `margin-top`; any gap with hover-open + no bridge = this bug.

### `[MEGA-INNER-PADDING-LEAK]` — T4 `.mega-inner` + col-title base styles inflate dropdown spacing 🟡 ja_helix 2026-06
**What:** a megamenu panel looks "too spacious / dead space" ("far too much spacing") even though your panel padding matches the `.pen`. Two T4/BS base leaks stack INSIDE your padding: (1) `.mega-inner` (the per-column body wrapper) ships `padding:16px 0` → +16px above the title and +16px below the last link, on top of your 28px panel padding (~44px effective); (2) the col-title `<h3>` inherits the panel's px line-box (e.g. `line-height:24.8px`) so an 11px label sits in a 24px box, AND a leaked `border-bottom` paints an underline that isn't in the design. Net: a 4-row dropdown renders ~221px instead of the design's ~178px.
**Detect:** force-open the panel, measure `.mega-inner` computed `padding` (≠0 = leak) and the `.mega-col-title` height (≫ font-size = inherited line-box) + `border-bottom-width` (>0 = leaked underline). Compare panel height to the `.pen` dropdown.
**Fix (chrome megamenu scope):** `.mega-inner{ padding:0; margin:0 }` · `.mega-col-title{ line-height:1; padding:0; border:0 }` (keep the design `margin-bottom` as the title→links gap). Applies to ALL dropdowns/megas at once; verify column titles then sit at exactly the panel padding (topPad == padding) across every panel.

### `[NAV-HOVER-BOLD-REFLOW]` — bold-on-hover widens the item and shifts following nav items 🟡 ja_helix 2026-06
**What:** the header top-level nav links change `font-weight` on hover (e.g. 400→500). Bold glyphs are wider, so the hovered item grows a few px and every item AFTER it slides right — a visible "jitter" on every hover ("hovering one menu item shifts the ones after it"). The `.pen` usually defines the heavier weight ONLY for the ACTIVE item (a static, page-load state — no shift), NOT for hover.
**Detect:** measure sibling `left` positions, then temporarily set `font-weight:500` on one item and re-measure — any non-zero sibling delta = reflow. Or just grep the chrome scss for `font-weight` inside a `:hover` rule.
**Fix:** hover changes COLOUR only (no weight) → zero reflow; keep `font-weight:500` on `.active/.current` (static). If a bold-on-hover look is required, reserve the bold width instead (invisible bold pseudo / `data-text` width-reservation) so the box never re-measures. **Sweep:** check EVERY `:hover`/`:focus`/`:active` across all scss for box-affecting props (font-weight, padding, border-WIDTH, letter-spacing, font-size, transform:scale/translate, width/height/gap) — `border-color`/`color`/`background` are safe; width-changing ones shift siblings or the element's own neighbours.

### `[SECTION-PADDING-STACK]` — a band is too tall because section + inner container both pad 🟡 ja_helix 2026-06
**What:** a full-width band (logo strip, CTA, etc.) renders far taller than the design because TWO nested wrappers both apply vertical padding: the outer `.hx-section`/band keeps the base `padding-block:80px` AND the inner `.hx-container` adds its own (e.g. 30px) → 80+30 top & bottom ≈ 250px instead of the design's ~88px. The per-style override only set border/bg, never zeroed the base section padding. (Same family as `[MEGA-INNER-PADDING-LEAK]`.)
**Detect:** measure the band height vs the `.pen`; probe BOTH the section and the inner container `padding-block` — if both > 0 and stack, that's it. **Fix:** put the vertical rhythm in ONE wrapper (zero the other). Match the `.pen` frame's single padding value.

### `[MISSING-DESIGN-SECTION]` — a whole designed home section was never built 🟡 ja_helix 2026-06
**What:** the build skips a section that exists in the `.pen` home frame (here: a dark scrolling "● LIVE" stat **TickerStrip** directly under the logo strip). Easy to miss because the page still "looks complete." **Detect:** read the `.pen` Home frame children top-to-bottom (`batch_get` depth 2) and diff against the live section order (`.t4-section`/`.ja-acm` list) — any design frame with no live counterpart is a gap. **Fix:** build it (ACM block / native module), editable fields + lang keys (template + site mirror), place it in the right layout slot. For a seamless marquee: render the item list TWICE in the track and `translateX(-50%)`, with a trailing `padding-right` on each copy so the seam gap equals the inter-item gap; pause on `prefers-reduced-motion`.

### `[ACM-CSS-RAW-LINK-CACHE]` + `[ACM-NO-$e-ESCAPER]` — two ACM-block edit traps 🟢 ja_helix 2026-06
- **Raw-link cache:** ACM block CSS loads as a plain `<link href=".../acm/<b>/css/style.css">` via `addStyleSheet` with NO `?v=` cache-buster (NOT in the T4 optimize bundle). After editing the block CSS, the browser serves the cached file → the change looks "not applied" even after clearing `cache/*` + `media/t4/optimize/*`. Verify with `curl` (server has the new bytes) then hard-bust the stylesheet href to confirm in-browser. (`css/style.css` is the loaded file even though a `less/style.less` source sits beside it — edit the CSS, it is not recompiled at runtime.)
- **No `$e` in non-chrome blocks:** only some ACM templates define the `$e = fn($s)=>htmlspecialchars(...)` closure (e.g. header-cta). Using `$e()` in a block that lacks it (e.g. clients) throws "Undefined variable $e" — a WARNING that Joomla's error handler escalates to a **500** on the whole page. Define `$e` locally before use (or call `htmlspecialchars` directly). `php -l` won't catch it (runtime, not syntax).

### `[BENTO-FLOW-VS-STACKED]` — a flow grid renders the bento side-by-side when the .pen stacks 🟡 ja_helix 2026-06
**What:** a "bento" built as a `repeat(N,1fr)` auto-flow grid with span classes does NOT match a `.pen` bento that is a 50/50 split with the secondary cards STACKED in the right half and a tall featured card on the left. Symptom: the two secondary cards sit side-by-side (narrow) and the bottom row leaves half the width EMPTY. **Detect:** read the `.pen` Bento frame — if it's `Top[Big | Right(vertical stack)] + Bottom[card card]`, the live must stack, not flow. Measure card x/y: side-by-side secondaries at the same `y` = wrong. **Fix:** `grid-template-columns:1fr 1fr` + featured tile `grid-row: span 2`; default row auto-flow then places the next two tiles stacked in column 2 and the last two as the 50/50 bottom row — no per-tile placement needed. Also check the `.pen` for a top Rule divider, card corner-radius, and featured padding.

### `[BUILD-AUDIT-OVERRODE-PEN]` — a prior in-build "unify/cleanup" pass flattens the .pen's per-section values 🔴 ja_nexora 2026-06
**What:** the template's OWN scss carries `AUDIT(spacing-unify)/(masthead-unify)` comments where a past pass
"normalized" the design — e.g. flattened every canvas section's desktop vertical padding to a uniform 72px
(comment literally says ".pen tDtuD=96 deviated" / "bands stacked to 192px, too sparse") and capped a shared
`--sec-pad` clamp. Result: desktop spacing is systematically COMPRESSED vs the .pen (−16..−68px/band) while
MOBILE stays correct (separate @media blocks). Reads as "spacing wrong / layout cramped" sitewide. Principle #1
violation: the build "improved" the .pen. **Detect:** `grep -n 'AUDIT\|unify\|deviated\|--sec-pad' scss/` — any
comment that cites a .pen value then overrides it = a deliberate divergence to REVERT. Probe a few section
`padding-block` desktop vs the .pen node; if uniformly rounded (all 72) where the .pen varies (96/104/120/140),
it's this. **Fix:** restore per-.pen values, additively in `@media (min-width:768px)` so the already-correct
mobile @media blocks are untouched ([DESKTOP-RULE-LEAKS-MOBILE] discipline). One serialized scss pass.

### `[RECON-FALSE-POSITIVE]` — verify-the-verifier patterns that recur (orchestrator MUST re-probe every "defect") 🟡 ja_nexora 2026-06
A read-only recon agent over-claims defects that aren't real; the orchestrator's independent re-probe debunked
several in one review. Recurring false-positive shapes — re-probe these before dispatching a fix:
- **Probed the wrong same-named element.** "navbar wordmark 18px/logo 28px" was the HIDDEN off-canvas `oc-brand`
  (first `.brand` in DOM), not the visible navbar (19/30, correct). RULE: scope the probe to the VISIBLE instance.
- **Read a :hover/transition state as the rest state.** "burger #EEF1F8/#CBD2E4" was the cursor-parked :hover
  (`--surface-2`/`--border-strong`); rest is #FFF/#E2E6F0 (design-correct). RULE: move the cursor away, settle, re-read.
- **Measured a hidden dup instead of the working component.** "single-article breadcrumb display:none HIGH" — the
  override's real breadcrumb is `.nx-single-bc` (works, chevrons, pad 28/0); the hidden `.sec-breadcrumbs` is the
  chrome dup. RULE: enumerate ALL same-role elements; find which one actually renders.
- **Asserted DOM-absence where the design only needs visual-absence.** "`.sec-breadcrumbs` must be null" fails
  when it's `display:none` (hidden) — visually compliant. RULE: check rendered visibility, not just `querySelector!=null`.
- **A checklist value that contradicts the .pen.** "Team mobile grid must be 1-up" but .pen frame gZFST is 2-up →
  the live 2-up is CORRECT. RULE: when a fix-spec disagrees with the .pen, the .pen wins; STOP and re-read the frame.
- **Read a lazy-loaded image as broken.** A full-page screenshot taken immediately after `rm -rf media/t4/optimize/*` + a cold reload catches `loading="lazy"` below-fold images at `naturalWidth:0` (blank/black block) — but the file is a valid 200. RULE: `curl` the img URL (200 + real bytes?) and/or warm-reload + `scrollIntoView` + wait before calling an image broken. (ja_meridian: the Featured "Pick of the week" city.jpg read as a black column cold, painted fine warm.)
- **Misread a down-scaled screenshot's colors.** A `fullPage` capture scaled from 1440→~750px makes a dark-surface pill (#171A25) with light text read as a "white/light-filled" pill → a phantom dark-mode leak. RULE: when perception conflicts with a computed check, reconcile with a TIGHT viewport-native capture of just that band + the computed `background-color`; trust the native-res + computed, not the thumbnail. (ja_meridian: the Tags A–Z cloud pills.)
Also: a per-view fix (e.g. mobile-light auth card → elevated surface) applied to ONE page (login.css) often leaves
SIBLINGS unfixed (register/remind kept white-on-white) — hunt the class across every same-pattern page.

### `[SELF-PADDED-BAND-DOUBLE-INSET]` (was `[SHARED-CTA-DOUBLE-INSET]`) — full-bleed band content sits at 2× the page gutter 🟢 ja_meridian 2026-07
**GENERAL RULE:** a self-padded full-bleed band must set `max-width` to the FULL canvas (**1440**), NOT the content width — the side `padding` (120) does the inset. Setting `max-width:<content 1200/960>` + `margin:auto` + `padding:120` DOUBLE-insets (margin-auto already centers to the 120 gutter, then padding adds another 120 → content at 240, and the row is also too narrow). This is the SAME root cause as the `.t4-section-inner.container` cap (`scss/_meridian.scss:33`). It recurs across MANY self-padded bands — Meridian hit it on the invert **CTA** (`.mer-cta__wrap`), the **author-detail** band (`--ad-max`), AND the **columnists-listing** band (`--cl-max`), all fixed the same way (max-width→1440). **Detect:** measure a band's copy/title `getBoundingClientRect().left` vs a card/breadcrumb elsewhere — 240 vs 120 = this (computed-only checks MISS it; the max-width + padding each "look right" alone). When you find one, `grep` the template for every `max-width: <content-width>` on a full-bleed band and audit them all.

The invert-CTA instance in detail: the full-width CTA band's inner wrap double-counts its horizontal inset: `.mer-cta__wrap { max-width:1200px; margin:0 auto; padding:64px 120px }` → on a 1440 canvas the `margin:auto` already centers the 1200 box at the 120 gutter, THEN `padding:120` pushes the copy to **240px** — while every other section (breadcrumb, cards, bands) sits at the 120 gutter. Reads as "the CTA text is indented too far right / misaligned with the page." The `.pen` CTA Band is `padding[64,120]` on the full 1440 frame → content at 120. **Detect:** on any page with the invert CTA, measure the CTA title's `getBoundingClientRect().left` vs a card/breadcrumb above it — 240 vs 120 = this. Computed-only style checks MISS it (max-width + padding both "look right" in isolation). **Fix:** make the wrap use the SAME container mechanism as the page — `max-width:1440px` (keep `padding:64px 120px`) so content = `min(1440,vw) − 240` = 120 gutter at 1440, row capped at 1200. One directly-loaded `acm/cta/css` edit (no scss); hard-reload to bust the [ACM-CSS-RAW-LINK-CACHE]. Affects EVERY style-1 CTA (home/home2/global/search/archive) — re-verify each. style-2 (inset card) uses `.mer-cta__card`, untouched.

### `[MASTHEAD-SUB-LEAD-EXTEND]` — page-masthead sub-text renders thin (weight 300) from a Bootstrap `.lead` @extend 🟢 ja_meridian 2026-07
The masthead description `@extend .lead` (Bootstrap) which sets `font-weight:300` + its own line-height. A separate `.t4-masthead .t4-masthead-description` rule sets color/size/max-width but NOT weight/line-height, so the `.lead` 300 wins → the sub reads lighter/thinner than the `.pen` (Inter 400). **Detect:** computed `font-weight` on `.t4-masthead-description` = 300 while the `.pen` Masthead "Sub" node = `normal`/400; also check `line-height` (BS `.lead` ≠ the `.pen` 1.55). **Fix:** add `font-weight:400; line-height:1.55;` to the more-specific `.t4-masthead .t4-masthead-description` rule (scss → recompile). Shared across ALL section/taxonomy/archive/magazine mastheads — one edit fixes all. (Same class of bug as any `@extend .lead`/`.small`/`.h1` that silently imports a BS weight the `.pen` doesn't want.)

### `[ARTICLE-INHERITS-SECTION-SIDEBAR]` — single article renders the parent section's sidebar + section bands instead of the `.pen`'s centered reading column 🟢 ja_meridian 2026-07
Articles have no own menu item → they inherit the parent CATEGORY's `Itemid` → its template_style (a sidebar layout) AND its section-scoped `main-bottom`/masthead modules leak onto the article. Result: a wide off-center article (e.g. 820 with a Sections/Account/newsletter rail) + a stray section masthead ("From the World desk") + a stray section band (e.g. an `acm-statistics` "Today's numbers"), where the `.pen` Single-Article frame is a single CENTERED column (body ~760, over-image hero ~1200) with only Author-Band → Related → CTA below. You canNOT give every article its own menu item. **Detect:** on an article, `body.view-article` + a visible `.t4-col.sidebar-*` (display≠none) + any `.t4-masthead`/section ACM band above the CTA that isn't in the `.pen` article frame. **Fix (all template-local, no DB layout change):** CSS scoped to `body.view-article` — hide the sidebar col, hide the section `.t4-masthead` + stray `.t4-main-bottom` bands, center the article body to the `.pen` width (float-hero → full-width block), move tags to body end, rebuild Related as the `.pen` card. Re-verify the LONG-READ variant (its own `layout-no-sidebar`/`longread` frame) is NOT regressed by the shared `com_content/article/default.php` override. Beware the false-positive: `body.layout-sidebar-content` matches `[class*="sidebar"]` — scope the "is the sidebar visible" probe to the actual `.t4-col.sidebar-*`, not the body.

### `[CONTACT-OVERRIDE-SWEEPS-MAINBOTTOM]` — com_contact override vacuums ALL main-bottom modules into the details column 🟢 ja_meridian 2026-07
A `com_contact/contact/default.php` override that pulls `getModules('main-bottom-1')` (or CSS-hides the T4 `main-bottom` row) to render the contact's address/details inline ALSO swallows any full-width designed band assigned to that position → the band renders squeezed inside the ~592px contact card (and often a hidden duplicate). **Detect:** a designed Contact band (e.g. a "Pick the right desk" grid) appears narrow/broken inside the form column, or `main-bottom` is `display:none` on `body.view-contact`. **Fix:** give the contact-info modules their OWN position (e.g. `contact-info`) consumed inline by the override, and FREE `main-bottom-1` for the full-width band; remove the `#t4-main-bottom{display:none}` hide. Verify exactly 1 details block + 1 band + 1 form, no dup, correct order.

### `[ACM-CSS-UNVERSIONED-STALE]` — ACM block CSS `<link>`s have no version query → edits don't show until hard-refresh 🟢 helix 2026-07
`acm/<block>/css/style.css` is emitted as a plain `<link href=".../style.css">` with NO `?ver=`/`?filemtime`. It is NOT part of the T4 optimize bundle (loaded directly), so clearing `media/t4/optimize/*` does NOT change its URL, and a warm browser cache keeps serving the OLD file after you edit it. **This silently breaks review verification:** you fix a lime leak / tablet reflow in an ACM css, clear the T4 cache, reload, and STILL see the old render — not because the fix failed but because the browser cached the un-versioned stylesheet. A fresh browser (or `curl` of the file URL) shows the correct served content. **Detect:** the served file (curl the css URL) contains your edit, but `getComputedStyle` in the review browser still shows the old value; the `<link>` href has no query string. **Workaround during review:** cache-bust the specific link in-page — `link.href = link.href.split('?')[0] + '?v=' + Date.now()` via evaluate, then re-read; OR use a fresh browser context per verify. Subagents on fresh browsers don't hit it; a long-lived orchestrator browser does. **Real fix (packaging):** append an asset version to ACM css hrefs (or bump the template media version on package) so returning visitors reliably pick up ACM CSS edits. Note in the sign-off; add to editability/package pre-flight.
