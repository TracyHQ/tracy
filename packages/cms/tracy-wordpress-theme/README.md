# @tracy/wordpress-theme — `tracy`

One WordPress block theme whose look is a **style variation**: any of the 154 design inspirations
vendored in `vendor/tracy/od-design-system`, each shipped as `styles/<id>.json`, plus a
navigation and a hero layout that follow it. Not a dsh plugin; nothing here runs in the harness.
The zip goes onto a customer's WordPress.

## How the look is chosen

WordPress's own mechanism. A variation is a `theme.json` fragment; the Site Editor lists all 154
under Styles, and `tracy_apply_inspiration('brutalism')` (in `functions.php`) writes one into the
site's global styles post from code — `wp eval` works, no logged-in user needed. The call also
records `tracy_nav` and `tracy_hero` options from `inspirations.json`; `functions.php` turns them
into body classes (`tracy-nav-overlay tracy-hero-cover`) that `assets/css/layout.css` keys on. So
one call changes colours, type, spacing and layout without touching content.

| Token group | Where it lands | CSS variable |
|---|---|---|
| 16 colours | `settings.color.palette` | `--wp--preset--color--accent` |
| 3 font families | `settings.typography.fontFamilies` | `--wp--preset--font-family--display` |
| 8 sizes | `settings.typography.fontSizes` (`xs … xxxxl`) | `--wp--preset--font-size--xxl` |
| 8 spaces | `settings.spacing.spacingSizes` (`1 … 12`) | `--wp--preset--spacing--12` |
| container max | `settings.layout.contentSize` | `--wp--style--global--content-size` |
| the other 21 | `settings.custom` | `--wp--custom--section-y--desktop` |

`assets/css/tracy.css` is written once against those variables and has no literal colour.
`theme.json` carries the neutral system as the fallback before any variation is applied.

## Generated files — do not edit

`scripts/build.mjs` derives these from the vendor library and commits them; `--check` is a gate:

- `src/tracy/styles/<id>.json` ×154 — from each system's `design-tokens.json`; `var(--x)` inside a
  value is rewritten to the WordPress variable that now carries x, and an unknown x stops the build
- `src/tracy/inspirations.json` — id → name, category, nav, hero, dark
- `src/tracy/assets/css/fixtures/<id>.css` ×154 — each system's `components.html` stylesheet,
  fenced under `.tracy-fixture`
- `src/tracy/assets/css/artifacts/<kind>/<id>.css` ×456 — the brand engine's landing, form and
  typography for each system, fenced under `.tracy-artifact`
- the `Version:` line of `src/tracy/style.css`, from `package.json`
- all of `src/tracy-base/` and `src/wp-tracy-business/` — see *Second target* and *Third target* below

The zip does not carry the working tree's modes: `writeThemeZip()` stages the tree with every file
`0644` and every directory `0755` and zips the staged copy, so a tree written under umask 077
(`0600`/`0700`) still ships a theme the web server can read once extracted as another user
(JA Vega 1.1.1, #511). Anything but a regular file or a directory in the tree stops the zip.
The zip is also byte-deterministic: every staged entry gets one fixed timestamp (`SOURCE_DATE_EPOCH`
when set — an integer inside the ZIP range, else the build stops — otherwise 1980-01-02 UTC) and `zip`
runs with `TZ=UTC`, so two builds of the same tree give the same sha256 and a frozen zip survives a
rebuild. Changing any byte of the tree changes it.

```
pnpm --filter @tracy/wordpress-theme build     # regenerate + dist/tracy-<version>.zip
pnpm --filter @tracy/wordpress-theme check     # exit 1 when a generated file is stale
pnpm --filter @tracy/wordpress-theme test
```

## Second target: `tracy-base`

The same generator builds a second, standalone theme from the same source. A target is a directory
`overlays/<slug>/` holding `theme.config.json` (slug, theme name, text domain, the design systems
it ships as `variations`, the `rootVariation` its default look wears — or `rootTokens`, see *Third
target*) plus any file that overrides
or adds to `src/tracy/` — for `tracy-base`: `style.css` (its own header) and `readme.txt`. Targets
are discovered by listing that directory; there is no list to keep in step. No overlay carries
`inc/update.php`: the build writes the target's `updateSlug` (default: its slug) into the copy from
`src/tracy/` — see step 3 below.

The output tree `src/<slug>/` is **generated whole** and committed, like the generated half of
`src/tracy/`:

1. every non-generated file of `src/tracy/` copied byte for byte — PHP files with the `'tracy'`
   text domain of their translation calls (`__`, `_e`, `esc_html__`, …) rewritten to the target's
2. the overlay on top: same path wins, a new path is added
3. `inc/update.php` rendered from `src/tracy/inc/update.php` for the target's `updateSlug`:
   `TRACY_UPDATE_SLUG`, the manifest `wordpress/theme/<updateSlug>/update.json`
   (`wordpress/theme/update.json` for `tracy`) and the transient key
   `<updateSlug with underscores>_theme_update` — exact strings of that file, nothing parsed. The
   source must match `UPDATE_SOURCE_SHA256` in `scripts/build.mjs`: every other line of it names
   the theme only through the constant, and that was reviewed. **Editing the updater** = check it
   still names the theme in those three places only, then set the new digest; until then every
   target build stops. An overlay `inc/update.php` is accepted only if it is already such a
   rendering (a copy out of a generated tree); anything else, or an `updateSlug` that is not a
   theme directory name, stops the build naming the target and the file (#471: before this step a
   target without its own copy updated as `tracy`)
4. the generated files for the target's systems only: `styles/<id>.json`, fixtures, artifacts,
   `inspirations.json`, `style.css` with `Version:` stamped from the config's `version` when it
   declares one (`x.y.z` or `x.y.z-pre`; any other value stops the build), else from `package.json`
   — so one theme can ship a release without moving every other target — and — when the
   config names a `rootVariation` — `theme.json`: the common one with its palette, font families,
   font sizes, spacing sizes, layout sizes and `custom` replaced by that system's variation, so the
   default look is the system's without a hand-authored token

```
node scripts/build.mjs --target tracy-base            # src/tracy-base/ + dist/tracy-base-<version>.zip (+ dist/tracy-base.zip)
node scripts/build.mjs --target tracy-base --check    # exit 1 when ANY file of src/tracy-base/ differs from the plan, or was not planned
node ../../../scripts/build-wordpress-theme.mjs --check   # the gate: every target, in turn
```

`functions.php` is not renamed and its functions, options, hooks and class names keep their
`tracy` prefix on purpose: WordPress runs one theme at a time, so the two never load together, and
the text domain is the only string WordPress keys per theme — it is the one thing rewritten.
Everything that is not generated stays a copy, so a fix to the source theme reaches `tracy-base`
on the next build and `--check` refuses a tree that missed it.

## Third target: `wp-tracy-business` — `rootTokens`, a measured look

The same generator, the same overlay shape, but the root look is **measured from a design**, not
one of the 154 systems: `theme.config.json` names `"rootTokens": "tokens.css"` — a file in the
overlay with the same 56 `--*` custom properties on `:root` every vendored `tokens.css` declares
(comments allowed) — instead of `rootVariation`; the two are mutually exclusive, and with
`rootTokens` the `variations` list may be `[]`. `nav` and `hero` (defaults `top-left`, `split`)
say which of the theme's layouts the look comes with, the way `catalog.json` says it for a
vendored system.

`plan()` reads the file with the same `tokensOf()` and turns it into a variation with the same
`variationOf()` (`id` = the slug, `title` = the theme name), then writes:

- `theme.json` — the common one wearing that variation, exactly as `rootVariation` does, with
  `settings.custom.tracy.inspiration = <slug>`
- `styles/<slug>.json` and a row `<slug>` in `inspirations.json` (`category: "Measured"`, the
  config's nav and hero, `dark: false`). Both are what `functions.php` needs, and it needs them
  even with no vendored system: `tracy_site_inspiration()` only returns an id `inspirations.json`
  lists, `tracy_apply_inspiration(<slug>)` reads `styles/<slug>.json`, and so does `?style=<slug>`.
  Measured 14/09/2026 on the `wp-tracy-business` stand: `tracy_apply_inspiration('wp-tracy-business')`
  → `true`, `tracy_site_inspiration()` → the slug, nav and hero options set, home 200, an empty
  `debug.log`. The Site Editor lists the look under Styles as the one entry, which doubles as
  "back to the theme's own look"
- no fixture and no artifact stylesheet: those are a vendored system's `components.html` and
  brand-engine pages, and a measured look has neither. The zip check counts what the plan wrote
  (154 of each for `tracy`, 0 here), not the number of ids

`tokens.css` is an overlay **source**, like `theme.config.json`: never copied into the theme
(theme.json and `styles/<slug>.json` carry its values), never generated, and `--check` reads it
fresh every run — edit a value and both generated files are reported stale. A name missing from
the 56, or one the contract does not know, stops the build naming it:
`overlays/wp-tracy-business/tokens.css: missing --accent, --space-12`.

Where the file comes from: the skill's `scripts/theme-tokens.mjs` writes it from a
`design-contract.json` (`--contract … --out tokens.css --fallback <vendor tokens.css>`), mapping
the measured rules to the 56 names by role and filling what the contract cannot answer from the
fallback, with a trailing comment block that says which is which
(`vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/references/theme-json-tokens.md`
§2b). Until that run lands, `overlays/wp-tracy-business/tokens.css` is a placeholder holding the
apple values, and its header says so.

```
node scripts/build.mjs --target wp-tracy-business            # src/wp-tracy-business/ + dist/wp-tracy-business-<version>.zip
node scripts/build.mjs --target wp-tracy-business --check    # the same gate as tracy-base
```

## Content contract — what a seeder writes

Templates render the four page kinds of `docs/agents/design-preview.json`, with core blocks only:

| Kind | WordPress | Shape |
|---|---|---|
| `home` | the static front page (`show_on_front=page`, `page_on_front`) | post_content = the markup of `patterns/hero.php` with the customer's words, then any sections |
| `listing` | the posts page (`page_for_posts`), `templates/home.html` | one post per item: title, excerpt as the kind, featured image |
| `article` | a post, `templates/single.html` | title, date, author, featured image, content (first paragraph is the lead) |
| `pricing` | a page with postmeta `_wp_page_template = pricing` | post_content = the markup of `patterns/pricing.php`; `data-hot` marks the highlighted column |
| `landing` | a page with `_wp_page_template = landing` | post_content alone, no title — the section library end to end (`tracy/landing` pattern) or any page that opens with its own hero |
| `fixture` | a page with `_wp_page_template = fixture` | post_content = the output of `tracy-cms-sections/scripts/fixture-body.mjs <id> --wp`; the page loads only `fixtures/<id>.css` |
| `artifact` | a page with `_wp_page_template = artifact` and postmeta `tracy_artifact = landing\|form\|typography` | post_content = the output of `artifact-body.mjs <id> <kind> --wp`; the page loads only `artifacts/<kind>/<id>.css` |

The stand's front page is the `artifact` landing — it carries its own navigation and calls to
action, so it stands as a home — and the `fixture` is the Design page at `/design/`.

Menu: one `wp_navigation` post; the header's navigation block has no `ref`, so WordPress falls
back to the newest one. Make its links `kind: post-type` with the page's `id` (and Home the
`home-link` block): only then does WordPress mark the page the visitor is on, which the theme
underlines like the Joomla template does. A custom URL is never marked.

Frames: chrome, page heads and article bodies sit in `.tracy-container` — the system's container
max with the gutter inside that width — so they start on the same line as the section library's
sections. Templates use `layout: default` and that class, not WordPress's constrained layout,
which centres at the content size with no gutter.

A design page (fixture or artifact) loads the stylesheet of the system its content was written
for (the wrapper's `data-inspiration`), not of the current variation: switching the variation
restyles every section page and leaves the design pages as they were, instead of putting one
system's stylesheet on another's markup. Bringing them over is a rewrite of their content.

## Trying another design system from the address bar: `?style=<id>`

Any page with `?style=brutalism` (any id in `inspirations.json`) renders in that variation for
this visitor: its variables and presets are printed after the site's global styles, and the body
carries the nav and hero classes the system comes with. The choice is kept in a `tracy_style`
cookie for a day, so following links keeps the look; `?style=` with no value forgets it. An
unknown id is ignored. Design pages (fixture, artifact) keep their own system — their markup is
per system. Nothing is written to the database: this is a preview, and the site's variation stays
what it was.

Caches: WordPress has no page cache of its own; the plugins that add one (WP Super Cache, W3
Total Cache, WP Rocket, LiteSpeed Cache, host caches) all honour the `DONOTCACHEPAGE` constant,
which the theme defines whenever a preview is active (parameter or cookie), so a previewed page is
never stored for the next visitor; `nocache_headers()` says the same to proxies and CDNs. Most of
those plugins also skip any URL with a query string, so `?style=` bypasses them on its own; a
plain URL reached with the cookie may still be *served* from a copy cached earlier for everyone —
the preview then holds on section pages that are not cached, and never pollutes the cache.

## Which variation the site wears

Every generated variation carries `settings.custom.tracy.inspiration = <id>`, and the theme reads
the site's system from the merged global styles (`tracy_site_inspiration()`), so a variation
picked in the Site Editor counts the same as one applied by `tracy_apply_inspiration()`. The
`tracy_inspiration` option is only the fallback for a global styles post written before the
variations carried their id.

## Local stand

```
node scripts/build.mjs
docker compose -f dev/compose.yml up -d web       # wordpress:apache + mariadb:11, port 8089
dev/verify.sh                                     # install, theme, demo content, three checks
dev/verify.sh apple                               # switch and check one design system
docker compose -f dev/compose.yml down -v         # start over
```

Admin: `http://127.0.0.1:8089/wp-admin`, user `tracyadmin`, password in `dev/verify.sh`.

## Where it is released — not to the registry

This package is `private` and is **never published to npm.tracy.ai**. Nothing imports it: the theme
is not a dependency of anything, it is a zip a WordPress installs. Publishing it would create a
second address for the same files and no reader would know which one a site is running.

The one public address is the distribution repository,
[TracyHQ/claude-cowork](https://github.com/TracyHQ/claude-cowork) — the same repository the Cowork
plugin comes from:

```
node scripts/build-cms-themes.mjs                 # or: this package's build
node scripts/sync-cms-themes.mjs <claude-cowork>  # mirror src/tracy → wordpress/theme/tracy
# then, in that repository:
node scripts/release-wordpress-theme.mjs 0.1.1    # tag, zip, GitHub release, update.json
```

Every overlay target travels the same way to its own folder `wordpress/theme/<slug>/` (the list
is in `scripts/sync-cms-themes.mjs`) and is released with
`release-wordpress-theme.mjs <version> --theme <slug>`; its sites read
`wordpress/theme/<slug>/update.json`. A target only updates its sites when its `version` goes up.

`src/tracy/inc/update.php` makes an installed site check
`wordpress/theme/update.json` in that repository about twice a day and take a newer version by
itself, reached through the `Update URI:` header in `style.css`.

A site being built installs the same released package: `tracy-site-build`'s `theme` stage reads
that manifest and runs `wp theme install <url> --activate`. **The lane image carries no copy of the
theme** — a copy would be a second answer to "which version is this site on", stale the day after
every release.

## Licence

The values under `styles/` are OpenDesign's design systems, Apache-2.0
(`vendor/tracy/od-design-system/NOTICE`). The theme code is Tracy's.
