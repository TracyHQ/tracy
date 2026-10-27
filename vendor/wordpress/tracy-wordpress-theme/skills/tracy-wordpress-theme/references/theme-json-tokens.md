# `theme.json` and 56 tokens — never typed by hand, generated from the design system

> **Phase 4 packet (theme-json).** Read before touching `theme.json`, `theme.overlay.json`, `theme.config.json`
> or any `styles/*.json` file. The source of truth is `packages/cms/tracy-wordpress-theme/scripts/build.mjs`
> — line numbers below were measured on commit `c372bfa56` (13/09/2026); grep the constant name if the file has moved.

## 0. The one-sentence rule

**No hex outside the palette.** Every colour in the theme's CSS goes through `var(--wp--preset--color--<slug>)`;
every font size, spacing, radius, motion through a preset or `--wp--custom--*`. The base theme's `assets/css/tracy.css`
"has no literal colour" (package README); `tracy-base.css`, `sections-extra.css` and the overlay's 21 patterns
follow the same rule. A hex that appears in the render but not in the palette is a
hardcode — dark mode will **not** be able to change it ([`dark-light-mode.md`](dark-light-mode.md)). Visual QA
still checks dark mode when `reference.kind: none`; interaction and preflight record the source comparisons as
not-applicable and keep checking the target side. Site sweep keeps measuring target invariants, round always calls
the sweep, and first/patch releases require complete, spec-bound, clean sweep evidence.

## 1. From 56 OpenDesign tokens to WordPress presets

`TOKEN_NAMES` (build.mjs lines 47–104) lists exactly the 56 custom properties that every `systems/<id>/tokens.css` of
`vendor/tracy/od-design-system` declares (measured 07/09 on all 152). `variationOf(tokens, meta)` (lines 201–230)
splits them into:

| Group | Tokens | Where in `settings` | WordPress CSS variable (`WP_VAR`, lines 173–181) |
|---|---|---|---|
| 16 colours (`COLORS`, line 107) | `--bg` `--surface` `--surface-warm` `--fg` `--fg-2` `--muted` `--meta` `--border` `--border-soft` `--accent` `--accent-on` `--accent-hover` `--accent-active` `--success` `--warn` `--danger` | `color.palette[]` — slug = name without `--` | `--wp--preset--color--accent` |
| 3 fonts (`FONTS`, line 126) | `--font-display` `--font-body` `--font-mono` | `typography.fontFamilies[]` slug `display` `body` `mono` | `--wp--preset--font-family--display` |
| 8 font sizes (`SIZES`, line 132) | `--text-xs` … `--text-4xl` | `typography.fontSizes[]` slug `xs sm base lg xl xxl xxxl xxxxl` | `--wp--preset--font-size--xxl` |
| 8 spacings (`SPACES`, line 143) | `--space-1 2 3 4 5 6 8 12` | `spacing.spacingSizes[]` slug is the number | `--wp--preset--spacing--12` |
| container | `--container-max` | `layout.contentSize` **and** `wideSize` (same value, line 226) | `--wp--style--global--content-size` |
| the other 21 (`CUSTOM`, lines 145–167) | leading, tracking, section-y, radius, elev, focus-ring, motion, ease, container-gutter | `settings.custom` by camelCase path (`sectionY.desktop`) | `--wp--custom--section-y--desktop` (kebab-cased, line 170) |

Two deciding details:

- A `var(--x)` **inside** a token value is rewritten to the matching WordPress variable
  (`rewriteVars`, lines 188–194); an `x` outside the 56 names is a **build error**, not a warning.
- Each variation carries `settings.custom.tracy.inspiration = <id>` (line 214) so that `functions.php` can read
  which system the site is wearing from the merged global styles — whether chosen in the Site Editor or through
  `tracy_apply_inspiration()`.

Output: `styles/<id>.json` (`$schema: https://schemas.wp.org/wp/6.6/theme.json`, `version: 3`, lines
216–217). `tokensOf(css)` (lines 239–246) reads tokens.css after stripping comments, **the first declaration wins**
— a reduced-motion or per-language override placed later does not overwrite the default.

## 2. `tracy-base` — the root `theme.json` generated from `rootVariation`

`overlays/tracy-base/theme.config.json`:

```json
{ "slug": "tracy-base", "themeName": "Tracy Base", "textDomain": "tracy-base",
  "variations": ["apple", "airbnb"], "rootVariation": "apple", "updateSlug": "tracy-base" }
```

`targetOf(slug)` (lines 325–367) reads it and refuses: a mismatched slug, empty `variations` (unless there is `rootTokens`,
§2b), missing `themeName`/`textDomain`, a `rootVariation` not in `variations`. Then `rootThemeJson(base, variation)` (lines
385–403) takes `src/tracy/theme.json` and **replaces** `layout.contentSize/wideSize`, `color.palette`,
`typography.fontFamilies/fontSizes`, `spacing.spacingSizes`, `custom` with those of the `apple` variation; every other
key (schema, version, `styles`, the `default*` switches) stays as is.

Why `apple`: D3 (`tasks/tracy-base-wp7/DECISIONS.md`) — j6's "Base" look (accent `#0071e3`, fg
`#1d1d1f`, surface `#f5f5f7`, hover `#0077ed`, body 17px, heading 1.05, tracking −0.015em, h1 56 / h2 40 /
h3 28 / h4 21) **matches number for number** `systems/apple/tokens.css`. So `tracy-base` has no hand-typed tokens;
wherever it drifts, add `overlays/tracy-base/tokens.css` overriding token by token — do not edit vendor (reversible).

## 2b. `rootTokens` — a MEASURED look instead of a system from the library

The generator's third target (`wp-tracy-business`) wears none of the 152 systems: it wears **a token set measured from
the design**. `theme.config.json` declares `"rootTokens": "tokens.css"` (a file in the overlay, the same schema of 56
`--*` names on `:root` as every `systems/<id>/tokens.css`, comments allowed), **excludes** `rootVariation`,
and `variations` may be `[]`. `plan()` reads it with the same `tokensOf()`, through the same `variationOf()` with
`meta = { id: <slug>, name: <themeName> }`, then:

- root `theme.json` = `rootThemeJson(base, variation)` — `settings.custom.tracy.inspiration = <slug>`;
- **`styles/<slug>.json`** is written too, and `inspirations.json` has a `<slug>` row (`category: "Measured"`,
  `nav`/`hero` from the config, default `top-left`/`split`). Both are **required** by `functions.php`:
  `tracy_site_inspiration()` only accepts an id present in `inspirations.json`, `tracy_apply_inspiration(<slug>)`
  reads `styles/<slug>.json`, and so does `?style=<slug>`. Measured 14/09 on the `wp-tracy-business` stand:
  `tracy_apply_inspiration('wp-tracy-business')` → `true`, `tracy_site_inspiration()` → slug, home 200,
  `debug.log` empty;
- **no** fixture, **no** artifact (those belong to a vendor system that has `components.html`), the zip compares its file count with
  the plan, not with the number of ids — so 0 vendor systems still passes;
- `tokens.css` is the overlay's **source**: not copied into the theme, not generated, and a name missing or unknown against
  `TOKEN_NAMES` is a build error **naming it** (`overlays/<slug>/tokens.css: missing --accent, --space-12`).

That `tokens.css` file is written by `scripts/theme-tokens.mjs` from the design contract:

```bash
node scripts/theme-tokens.mjs --contract <spec>/design-contract.json --out overlays/<slug>/tokens.css \
     [--variant desktop-light] --fallback vendor/tracy/od-design-system/systems/apple/tokens.css
```

It maps measured rules by **role** (h1 → `--text-4xl`/`--font-display`/`--leading-tight`/`--tracking-display`,
body → `--bg`/`--fg`/`--font-body`/`--text-base`/`--leading-body`, primary button → `--accent`/`--accent-on`/
`--radius-md`/`--motion-base`, card → `--surface`/`--radius-lg`/`--elev-raised`, section → `--section-y-*`,
container → `--container-*`; `--space-N` = N × unit, the unit being the gcd of every padding/margin/gap halved
down to ≤ 6px), normalises to the vendor file's form (hex, unitless leading, tracking in `em`, `ms`), and **every** token
has a value: measured if it was measured, otherwise taken from `--fallback`; a comment block at the end of the file lists each name as
`measured`/`fallback` so a reviewer sees which ones are guesses. The role is chosen by the **subject selector** (the last compound, `:not(...)` dropped): `a:not(.btn)` is a link, `.hero .btn` is a button, not a
section (`--section-y-*` only from the `.hero`/`section`/`.t3-section` band itself, #70); `--container-max` reads `maxWidth`, failing that
a px `width` smaller than the viewport (Bootstrap 3: 1260); `--surface` does not take the footer/header background, after cards it takes the main
content area's background; `--accent-on` must be ≥ 4.5:1 on `--accent` — otherwise it is replaced with `--bg`/white/black, recorded as `derived` with the ratio
(a value declared in the contract's `tokens` is kept, with only a warning).
A token with neither → refuses to write (exit 1,
naming it). A `--<name>` declared directly in the contract's `tokens[variant]` beats every rule. Test:
`scripts/test/theme-tokens.test.mjs` (sample contract + apple: 13 measured, 43 fallback, 56 read back).

## 3. `theme.overlay.json` — may only add, may not override tokens

Deep-merged onto the freshly generated `theme.json` (`mergeThemeOverlay`, lines 448–478), **after** the root variation. Allowed
keys — `THEME_OVERLAY_KEYS` (lines 417–423):

| Path | Used for |
|---|---|
| `styles` | including `styles.css` — tracy-base's dark CSS lives here |
| `customTemplates` | 5 page templates: `landing`, `page-landing`, `page-onepage`, `page-no-sidebar`, `page-sidebar-left` |
| `templateParts` | `header`, `footer` |
| `patterns` | slugs from the Pattern Directory (unused) |
| `settings.custom.tracy` | the theme's own keys under `custom.tracy` |

Arrays with `name` (customTemplates, templateParts, patterns) merge **by name**: the same name replaces, a new name
is added; other arrays/scalars are replaced whole. **Any key outside the list is a build error**, naming the path:
an overlay able to set `settings.color.palette` would silently disable `rootVariation`. To change colours →
`rootVariation`/tokens.css, not the overlay.

## 4. What is generated, what is hand-written — and the gate

`isGenerated(rel)` (lines 273–281): `style.css` (only the `Version:` line), `inspirations.json`,
`styles/*.json`, `assets/css/fixtures/*`, `assets/css/artifacts/*/*`. For the `tracy-base` target, add
`theme.json` (when there is a `rootVariation`) — and **the whole `src/tracy-base/` tree is generated** (`plan()`, lines 487–618):
the source `src/tracy/` copied byte for byte (PHP has the text domain of its translation calls changed, `retargetTextDomain`, lines
374–376), the overlay laid on top, then generated files for exactly the declared systems. The overlay **may not** carry a file at a
generated path (except `style.css`) and may not carry `theme.json` — `plan()` throws.

Three files **belong to the overlay and never ship** — `OVERLAY_META_FILES` (line 407): `theme.config.json`,
`theme.overlay.json`, `patterns.map.json`. Gotcha #5: `patterns.map.json` once leaked into the generated tree until
it was added to this set.

```bash
node scripts/build.mjs --target tracy-base            # src/tracy-base/ + dist/tracy-base-<version>.zip
node scripts/build.mjs --target tracy-base --check    # exit 1 when ANY file of src/tracy-base/ drifts from the plan or is not in the plan
node ../../../scripts/build-wordpress-theme.mjs --check   # the repo's gate: every target
```

(run in `packages/cms/tracy-wordpress-theme/`.) `--check` with `everything: true` (lines 628–651) also catches
stray files in the generated tree. The formatter **must not** touch generated files: `biome.jsonc` excludes
`src/tracy-base/theme.json` and the two `tracy-motion.js` — gotcha #1.

## 5. Checking on the running site

```bash
curl -s http://127.0.0.1:8227/ | grep -o -- '--wp--preset--color--accent: #0071e3'
```

WordPress prints the palette onto `:root` as **fixed hex** — so `color-scheme` alone changes nothing, and
dark must restate every preset (see [`dark-light-mode.md`](dark-light-mode.md) §1). Switching a variation in the Site
Editor **copies** the JSON into the DB (`wp_global_styles`) — a later theme update does not overwrite it
([`wordpress-anatomy.md`](wordpress-anatomy.md) §2 Style variations).
