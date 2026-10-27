# CSS Tokenizing — hybrid tokenization, light + dark

**Design contract:** read `design-contract.md`. A valid `design-contract.json` is required at Phase 2.
Authors use its pinned roles/tokens; pass the pilot matrix before repetition and the complete
page/viewport/theme matrix before acceptance. Keep the contract hash with all observations.


> **Phase 6 packet.** Read when porting the component CSS into tokenized SCSS (light + dark). Prereq:
> the Phase 4 theme JSON exists. Pairs with `dark-light-mode-standard.md` (the canonical dark wiring —
> §3e here only summarizes it) and `t4-anatomy.md` (the `scss/`/`local/`/`css/` folder map).

Phase 6 of the builder. The source design ships component CSS (or, for a design-tool input, a token
table in `design-spec.md`) that already produces the design
pixel-for-pixel; the temptation is to dump it into the template verbatim. **Don't.** A verbatim
dump bakes literal hex/px everywhere, leaves nothing for the admin to theme, and gives the dark
hook no lever to pull. Instead, run a **hybrid strategy**:

> **Keep the HTML's component CSS for pixel match, but route core color / typography / spacing
> through T4 tokens** so the template is themeable from the backend AND ships **both light and dark**
> via the framework dark hook.

Component layout/structure CSS (flex, grid, positioning, decorative shapes) stays as-is. Only the
**color, type, and spacing _values_** get lifted into tokens. The look does not change; the
maintainability and themeability do.

This doc is the T4-builder counterpart to the dark-mode skill's `css-architecture.md` — it reuses
that skill's vocabulary (`<DARK>` hook, `--dm-*` palette, token remap, "dark mirrors light, every
state"). **Do not contradict it.** Where this doc and the dark-mode skill overlap, the dark-mode
skill is authoritative for runtime/dark concerns; this doc is authoritative for the build-time
tokenization into a fresh T4 template.

See also:
- `t4-anatomy.md` — where `scss/`, `local/`, `etc/theme/` sit and how T4 resolves them.
- `layout-json.md` §2 — `etc/theme/default.json` keys (brand/page/nav/footer colors, typography,
  the light+dark parallel set) and `palettes.json`.
- `gotchas.md` — the optimize-cache trap, dark-hook mismatch, scss compile path.
- `darkmode/css-architecture.md` + `darkmode/framework.md`
  — the runtime dark hook, the `--dm-*` token approach, the "mirror light, every state" rule, and
  the full dark probe→fix→verify loop and gotcha catalog. **Hand off to it when the HTML ships no
  dark variant** (see §6).

---

## 1. Identify the design system from the HTML

Before tokenizing, extract the design system from the bundle — read **computed styles** of the
rendered pages (not just the raw CSS source: the cascade, CSS-var resolution, and `@media` rules
only settle in the computed layer). Phase 2's `parse-html-bundle.mjs` already pulls the four core
palette tokens (`primary`, `secondary`, `body_bg`, `text`); here you go deeper into the full set.

Capture, per design:

- **Palette** — `primary` (the dominant accent: CTA/link color), `secondary` (supporting brand),
  `body_bg` (page surface), `text` (default body color), plus `border` (the faint divider color),
  `heading` (if headings differ from body text), and any surface/band color (`.bg-light`-style
  sections). These are the named anchors of your token set.
- **Type scale** — body `font-family`, body `font-size` / `line-height` / `letter-spacing`, the
  heading `font-family` (often distinct), and the **h1–h6 sizes + weights + line-heights**. Read
  these off real `<h1>`…`<h6>` in the rendered page, not off the stylesheet's nominal values.
- **Spacing** — the section vertical rhythm (top/bottom padding of full-width rows), the container
  max-width, the gutter, and the card/component internal padding. T4 carries these as section
  spacing in `etc/layout/*.json` (per-breakpoint, see `layout-json.md` §1a) and as SCSS spacing
  variables; map the design's rhythm onto both.

### Map to the two T4 surfaces

| Design-system input | T4 destination | Notes |
|---|---|---|
| Brand colors (primary/secondary/success/…) | `etc/theme/default.json` `color_primary`/`color_secondary`/… | **These override Bootstrap's theme color variables** (`layout-json.md` §2a). Set them here, not in SCSS. |
| Page/nav/footer colors | `etc/theme/default.json` `body_*`, `mainnav_*`, `footer_*` keys | Light values are the base set (§2). |
| Per-section schemes (a "dark band", a colored CTA strip) | `etc/palettes.json` + a section's `color_pattern` | `layout-json.md` §3. |
| Type scale + font stack | `etc/theme/default.json` **AND `etc/site/default.json`** typography keys (`body_font_*`, `heading_font_*`, `body_line_height`, `h1_font_size`…) | `layout-json.md` §2b. ⚠️ **T4 generates the runtime `--heading-font-family`/`--heading-font-weight`/`--heading-line-height`/`--body-line-height` from `etc/site/default.json`, NOT the theme JSON** — a cloned blank ships `Inter/600/1.3/1.5` there and it silently WINS, so every heading renders in the wrong font/weight unless you fix the **site** JSON and delete `media/t4/css/*`. See **gotcha #57** — verify with computed style, not the JSON. |
| SCSS-level design tokens used by the ported component partials | `scss/_variables.scss` (shipped) and/or `local/scss/variables.scss` (override) | SCSS variables that feed the component CSS you port. |

The two surfaces are complementary: `etc/theme/default.json` is the **admin-editable** layer (a
non-developer changes brand color from the Theme tab); `scss/_variables.scss` is the **compile-time**
layer the ported component partials consume. Set brand/page/nav/footer colors in the theme JSON so
they stay GUI-editable; set component-internal design constants (a card radius, an icon size) as SCSS
variables.

---

## 2. Where customizations live (survives upgrade)

A T4 reinstall overwrites `scss/`, `css/`, `html/`, `etc/` but **leaves `local/` untouched**
(`t4-anatomy.md`, "The `local/` folder"). Because you are **building a new template** (not patching
a shipped one), you own all of these — but you still want upgrade-survivable separation between the
template's own ported styles and any later per-site tuning. Two valid paths:

### Path A — In-template partial (the template's own styles)

This is where the **ported design** lives, because it ships *as* the template:

```
scss/_variables.scss        # SCSS design tokens (colors, spacing, radii) — edit
scss/_<your-partial>.scss   # a new partial holding ported component CSS — create
scss/_all.scss              # the aggregator — add @import "<your-partial>"; here (REQUIRED)
scss/template.scss          # entry: imports vars → bootstrap → all → compiles to css/template.css
```

**Adding a new partial requires an `@import` in `_all.scss`.** `_all.scss` is the manifest of
partials pulled into `template.scss` (`t4-anatomy.md`, "scss/"); a `_foo.scss` file that nobody
imports is dead. Add it in a sensible slot in the import order (component-ish partials go near
`components`/`modules`; type near `typo`).

### Path B — Local override (post-build / per-site tuning)

For changes that must survive even a template re-package or that a site owner makes locally:

```
local/scss/variables.scss   # override any SCSS variable
local/scss/custom.scss      # custom rules
                            #   → compiled to local/css/template.css, loaded AFTER the main stylesheet
```

`local/` wins over both the template and the base theme by resolution order (`t4-anatomy.md`,
"Base-theme path resolution order"). Reserve Path B for overrides; put the template's primary ported
styles in Path A so they ship in the package.

> Rule of thumb: **template design → Path A** (ships in the zip). **Site-specific or
> experimental tweaks → Path B** (survives everything, doesn't ship). Never hand-edit the compiled
> `css/template.css` or anything under `media/t4/optimize/` — regenerated on every compile/update.

---

## 3. Light + dark strategy

The template ships **light and dark from the start** (SKILL principle 3). Tokenize once, then carry
two value sets keyed off the framework dark hook.

### 3a. Pin the dark hook FIRST

`<DARK>` is the framework dark selector. **For the J6 `t4_bs5_blank` build, the hook is the `<html>`
class `html.t4-dark`** (verified live: adding `t4-dark` to `<html>` flips the whole page to the dark
palette; the template's own dark rules in `scss/` key off `html.t4-dark`). Many sections additionally
respond to the Bootstrap 5 attribute `[data-bs-theme="dark"]`, so authoring dark under **both**
(`html.t4-dark` for your tokens, `[data-bs-theme=dark]` for BS components) is the safe default. Still
**confirm on your build** rather than assume a different T4 release matches —
T4 builds use a `<html>` **class** `html.t4-dark` and/or the Bootstrap 5 attribute
`[data-bs-theme="dark"]`. Detect it before writing any dark rule (open a rendered page, read
`document.documentElement.className` / attributes; check which one the blank's own dark assets key
off). See the dark-mode skill's `framework.md` "Detect it" section for the exact checks. A
`--t4-dark` / `--bs-dark` CSS **variable** is just Bootstrap's dark-palette token *name* — NOT a
dark-mode hook; don't be fooled.

Pin the chosen hook in Phase 0 and use it consistently everywhere (`<TPL>` notation in SKILL.md).

### 3b. Define a token palette (one source of truth)

Define a named token palette as CSS custom properties — the dark-mode skill's `--dm-*` convention,
or T4's own `--t4-*` vars, whichever fits the surface you're editing. **Light values are the base**;
they live unscoped (on `:root` / `body` / the relevant component) exactly as the design renders.
**Dark values live under the dark hook only** so light is never touched:

```css
:root {
  --dm-bg:#ffffff; --dm-band:#f6f7f9; --dm-surface:#ffffff; --dm-border:#e4e7ec;
  --dm-text:#1a1a1a; --dm-text-muted:#5b6470; --dm-heading:#0f1115;
  --ja-accent:#2f6bff; --ja-accent-hover:#1f54d6;   /* brand accent — KEEP it */
}

<DARK> {                       /* html.t4-dark  AND/OR  [data-bs-theme="dark"] — whatever ships */
  --dm-bg:#0e1116; --dm-band:#141821; --dm-surface:#161b27; --dm-border:#2c3547;
  --dm-text:#c2c9d6; --dm-text-muted:#8c97a8; --dm-heading:#eef1f6;
  --ja-accent:#2f6bff; --ja-accent-hover:#5b8cff;   /* same brand; LIGHTER hover for dark */
}
```

Then write the ported component CSS against the **tokens**, not literals:

```css
.card { background:var(--dm-surface); color:var(--dm-text); border:1px solid var(--dm-border); }
.section-title { color:var(--dm-heading); }
.btn-primary { background:var(--ja-accent); }
.btn-primary:hover { background:var(--ja-accent-hover); }
```

This is the dark-mode skill's **token remap** lever applied at build time: one palette block flips
the whole template. Where the ported CSS references the template's *own* T4 tokens
(`--heading-color`, `--body-text-color`, `--border-color`, `--color-light`, the `--t4-*` set),
remap **those** under `<DARK>` instead of inventing parallel names — see `css-architecture.md`
"custom.css skeleton — palette + TOKEN REMAP" for the discovery grep and the typical JA/T4 token
set. **Do not remap the brand-primary token** or you lose the accent.

> **Where this block lives:** the **light** token definitions (`:root { … }`) ship in the template's
> SCSS partials (Path A → `template.css`). The **`<DARK> { … }` remap block** ships in a *separate*
> `scss/darkmode.scss` → `css/darkmode.css` loaded after `template.css` — **not** baked into the light
> partials and **never** in `custom.css`. See §3e for the full delivery layout.

### 3c. Carry both palettes in `etc/theme/default.json` too

The admin-editable layer also carries dark. Provide a **parallel `*_dark` set** alongside the light
keys (`layout-json.md` §2c) so the Theme tab and the framework dark hook both have dark values, and
light stays exactly as shipped:

```jsonc
{
  "body_bg_color": "#ffffff",        "body_bg_color_dark":   "#0e1116",
  "body_text_color": "#212529",      "body_text_color_dark": "#e6e6e6",
  "body_link_color": "#0a58ca",      "body_link_color_dark": "#7ab0ff"
  // brand colors usually stay shared; add *_dark only for the few that must change in dark.
}
```

### 3d. The one rule: dark MIRRORS light

From the dark-mode skill's core principle — **dark mirrors light: the same relationship at every
state**, never more contrast than light has, never a bright bar where light has a subtle one. If a
card blends invisibly on light's white page, it blends on dark; if light has a faint 1px divider,
dark has a faint 1px divider (one `--dm-border` token, one step lighter for fields/outline buttons).
**Keep the brand accent** unless the design explicitly specifies a different dark accent; for dark,
only the accent's *hover* shade needs lifting (light's hover goes darker and vanishes on a dark
surface). Mirror **every state** — default, `:hover`, `:focus`, `:active`, `disabled`. For the full
catalog of mirror traps (surface-vs-transparent cards, white/navy leaks, pseudo-element bars,
box-shadow frames, hover losing its background), defer to `css-architecture.md` and the dark-mode
skill's gotchas — don't re-derive them here.

### 3e. Delivery — ship dark in its OWN file, NEVER `custom.css` (the "vega standard")

How dark is *delivered* matters as much as the colors. **The full spec, the copy-paste PHP/JS blocks,
the GUI/cookie admin-configurable variant, and the standalone-page wiring all live in ONE canonical
source: `references/dark-light-mode-standard.md` (verified live on ja_stratum).** Follow it verbatim —
do not re-derive the plumbing here. This subsection is just the at-a-glance map so you know what Phase
6 must produce; open the standard for the actual code.

**File layout (T4):**
```
scss/darkmode.scss   # SOURCE: the <DARK> token-remap (§3b) + dark-only fixes. Standalone entry —
                     #   do NOT @import into template.scss/_all.scss.
css/darkmode.css     # compiled output — ALL dark rules live here, ONLY here.
js/darkmode.js       # wires the toggle (click-delegation + persist + OS-follow). Does NOT build the button.
css/custom.css       # ⚠️ LEAVE A CLEAN STUB — owner's file (admin "Edit Custom CSS" overwrites it). NEVER ship dark here.
index.php            # pre-paint resolver (FOUC) + load darkmode.css via addCustomTag + register darkmode.js
html/layouts/t4/block/<header|mainnav>.html   # STATIC toggle button (one block; +d-lg-none copy if split header)
offline.php / error.php / error-t4.php        # standalone docs: each repeats the SAME resolution + its own darkmode.css <link>
```

**The non-negotiables (one-line checklist — full rationale in the standard):**
1. Separate `css/darkmode.css`, **never** `custom.css` (and never bake the `<DARK>` remap into `template.css`).
2. Load `darkmode.css` **after** `template.css` via `addCustomTag('<link…?'.filemtime().'>')` — **not** `registerAndUseStyle` (WAM reorders it).
3. **Static** toggle button in the header block; JS only wires it (never build the button in JS).
4. `darkmode.js` = click-delegation + persist (cookie in the GUI variant) + `matchMedia` OS-follow.
5. Pre-paint resolver in `index.php`. ⚠️ heredoc closing `JS` marker alone on its line, `);` on the NEXT — `JS);` is a fatal parse error that white-screens every page.
6. `offline.php`/`error.php`/`error-t4.php` each repeat the SAME server-side resolution + gate toggle/`darkmode.css` identically (they can't rely on the `custom.css` stub).
7. Never hand-edit compiled/bundled files (`css/template.css`, `media/t4/optimize/*`).

**Prefer the admin-configurable (GUI / cookie) variant** — `other_darkmode` (on/off) gates the toggle
BUTTON only; `other_default_theme` (light/dark/auto) always decides the theme (the two are
orthogonal — when off+Dark it's a dark-only site, so never "force light when disabled"). Resolve the
settings from the site profile JSON on disk **LOCAL-FIRST** (`local/etc/site/<profile>.json` → base
`etc/site/`), NOT the `site-settings` Registry (a stub `stdClass` at `index.php` time → `->get()`
fatals, gotcha #12). Resolution order: `cookie (only if enabled) > other_default_theme > auto → OS`.
**All of this — fields, JSON, the `theme-toggle.php` element, the resolver — is specced with
copy-paste blocks in `dark-light-mode-standard.md`.**

Verify with `scripts/review/toggle-test.mjs` (flips/persists/light-restores, desktop +
mobile) — not by eyeballing that the CSS exists (gotcha #42). GUI variant: `curl -s --cookie
'<tpl>-theme=dark' <url>/index.php | grep -oE 'var t="(dark|light)"'` → `var t="dark"` (no-FOUC proof).

---

## 4. Handoff: HTML ships NO dark variant

If the bundle has **no** dark stylesheet and **no** dark scope (no `dark.css`, no
`.dark`/`[data-theme=dark]`/`html.t4-dark`/`[data-bs-theme=dark]` block) and the manifest carries no
`theme.palette.dark` — **do not hand-roll dark here.** Finish the **light** tokenization (§1–§3a/§3b
light side only), then derive dark from the tokenized output following
`dark-light-mode-standard.md` + `darkmode/css-architecture.md`. That produces a faithful dark palette; run the full dark probe→fix→verify loop with
its scanners (contrast, leak, seam, border, hover). It is purpose-built for that work and will not
re-hit the usual dark bugs; rolling your own dark in this phase will.

The tokenized output you produce is the *ideal* input for that skill: because color already flows
through `--dm-*` / theme-JSON tokens, the dark skill mostly supplies a dark value set rather than
chasing literals across the codebase. Conversely, when the bundle **does** ship a dark variant,
extract its four-plus tokens here (§1, computed styles of the dark scope) and you keep dark in-house.

---

## 5. The optimize-cache gotcha (clear before EVERY verify)

T4 bundles compiled CSS/JS into `media/t4/optimize/<hash>` (SKILL "structural facts" #2). **Your CSS
change will not appear in the browser until that bundle is cleared** — you'll stare at stale output
and "fix" things that were already fixed. Before verifying *any* CSS change:

- run `scripts/clear-cache.sh` (clears `media/t4/optimize/<hash>` + the related T4/Joomla caches), **or**
- enable T4 **Development Mode** (serves unbundled assets) for the duration of the build.

Then hard-reload. This is the same trap the dark-mode skill flags as the optimize-cache bundling
gotcha — see `gotchas.md`. Pin it: every "the CSS didn't change" is this until proven otherwise.

---

## 6. dart-sass compile

`scss/template.scss` is the entry point; it imports everything via `_all.scss` (which is why a new
partial must be `@import`ed there — §2). Compile with the **dart-sass `sass` CLI** (the modern
implementation; node-sass/ruby-sass are EOL):

```bash
bash scripts/compile-scss.sh        # wraps: sass scss/template.scss css/template.css  (+ theme.scss, etc.)
```

`compile-scss.sh` runs `sass` over each entry file (`template.scss` → `css/template.css`,
`theme.scss` → `css/theme.css`, and the local path `local/scss/custom.scss` → `local/css/template.css`
when present). Note the base-theme `@import` paths in `_all.scss`/`theme.scss` reach UP into
`../../../plugins/system/t4/themes/base/...` (`t4-anatomy.md`), so run the compile from the template
root (or pass `--load-path`) for those imports to resolve.

**After every compile, clear the optimize cache (§5) before verifying** — the compile updates
`css/template.css`, but T4 still serves the old bundled copy until the cache is cleared.

---

## Summary checklist

1. Extract palette + type scale + spacing from the bundle's **computed** styles (§1).
2. Brand/page/nav/footer colors → `etc/theme/default.json`; component design constants →
   `scss/_variables.scss` (§1).
3. Port component CSS into a new `scss/_<partial>.scss`; **`@import` it in `_all.scss`** (§2 Path A).
   Per-site tweaks → `local/scss/custom.scss` (§2 Path B). Never edit compiled output.
4. Pin `<DARK>` to whatever the blank ships (§3a). Define `--dm-*` light base + dark under `<DARK>`;
   remap the template's own tokens under `<DARK>` (§3b). KEEP the brand accent.
5. Carry the dark parallel set in `etc/theme/default.json` `*_dark` keys (§3c).
6. Dark **mirrors** light, every state (§3d).
7. No dark variant in the source → finish light, then **derive dark per `dark-light-mode-standard.md`** (§4).
8. Compile with dart-sass (§6); **clear `media/t4/optimize/<hash>` before verifying** (§5).
