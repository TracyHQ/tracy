# T4 Template-Build Gotchas

A numbered, append-friendly catalog of pitfalls hit while building a T4
(Joomla 6 / Bootstrap 5) template from an HTML bundle. Each entry: short title,
the trap, the fix. New gotchas go at the bottom — keep the numbers stable so
notes and commit messages can reference them.

See also: [css-tokenizing.md](css-tokenizing.md) (token/palette routing),
[demo-content.md](demo-content.md) (seeding modules, menus, megamenu params),
and [t4-anatomy.md](t4-anatomy.md) (every file/folder and its role).

## Index by phase / system (jump to the numbers; titles below are unchanged)

- **Cache & compile:** 1 (optimize cache) · 4 (custom in `local/`) · 5 (scss `@import`)
- **Phase 0 Provision:** 8 (`.env` creds) · 14 (Dev Mode) · 19 (local pkg ships demo) · 21 (admin pw ≥12)
- **Phase 1 Scaffold / Phase 9 de-blank & package:** 2 (rename) · 31 (purge blank demo) · 41 (default-style title) · 43 (strip foreign baggage) · 44 (stray `etc/theme/.json`) · 45 (finish de-blank) · 47 (`global.json` flags) · 49 (zip ≠ quickstart) · 50 (clean aliases)
- **Phase 3 Chrome / nav / megamenu:** 3 (megamenu from DB) · 23 (no flat menu) · 25 (`menu_show=0` hides) · 26 (brand off-canvas) · 27 (megamenu dual-seed) · 28 (`.row.g-*` overflow) · 29 (one mobile toggle) · 55 (megamenu header one-row) · 56 (header flex "off to one side") · 71 (megamenu type in DB params)
- **Phase 4 Layouts / styles:** 15 (per-style layout) · 16 (chrome every layout) · 17 (`theme.tpl.css` body bg) · 20 (`template_style_id` wins) · 22 (module chrome dash-format) · 52 (`params={}` → default layout)
- **Phase 5 Overrides / ACM / page completeness:** 9 (system pages at root) · 10 (base theme overrides) · 24 (standard Joomla pages) · 38 (`.item-page a` repaints buttons) · 39 (pages complete) · 46 (featured-view warnings) · 48 (ACM-less home) · 51 (rich + dense) · 60 (`page_heading` masthead) · 61 (canvas-body pattern) · 63 (untranslated constants) · 65 (full override set) · 67 (dark code blocks)
- **Phase 6 CSS / dark mode:** 6 (error/offline standalone) · 12 (`site-settings` stub) · 13 (dark-only sources) · 18 (BS utility leaks) · 42 (dark needs a switch) · 57 (heading font from `etc/site`) · 58 (palette wrappers hardcode) · 59 (white user-form cards) · 62 (figcaption dark bar)
- **Phase 6b Imagery:** 11 (image credits) · 32 (FA class style) · 70 (media-field section images)
- **Phase 7 Demo content:** 30 (valid `images` JSON) · 33 (Playwright reality) · 34 (leftover demo hijacks Itemid) · 35 (identical `link` routing) · 36 (login success vs failure) · 37 (`access=2`) · 53 (purge demo 500s reg) · 54 (future-dated content) · 64 (Smart Search index) · 66 (`workflow_associations`) · 68 (PDO seed) · 69 (real Acymailing)
- **Phase 8 Verify:** 7 (J4/BS4 docs vs BS5 target) · 33 (Playwright reality)
- **Cross-cutting:** 40 (`com_jaextmanager` is NOT a layout standard) · 72 (encoding traps: mojibake, double-encoded JSON, smart quotes) · 74 (ACM params are JSON-in-JSON) · 75 (module titles are not unique) · 76 (a position must exist in a layout before a module renders there) · 79 (re-measure at the moment of fixing)
- **Phase 2 Ingest:** 78 (a `.pen` holds a component library beside the page frames — a kit value is not the page value)
- **Phase 3 Chrome (more):** 77 (a mega panel only renders DESCENDANTS of the item that owns it)
- **Phase 7 Demo content (more):** 73 (move menu items between menutypes for clean URLs; re-parenting alone is not enough)

---

## 1. Optimize cache bundling

**Trap.** T4 bundles compiled CSS/JS into `media/t4/optimize/<hash>`. Edits to
`scss/` or `css/` (including `local/css/template.css`) do not appear on the
frontend because the page is still serving the old bundle.

**Fix.** Clear the optimize cache before every verify pass
(`scripts/clear-cache.sh`), OR enable Joomla Development Mode
(Global Config > System > Development Mode = Yes), which disables bundling.
Always clear/disable before rendering — never trust a render against a stale
bundle. (Principle 2: clear cache, then re-render.)

QA-detect: design-review platform bug P17 (stale optimize bundle masks edits). (Also a package trap —
quickstart gotchas: a stale `media/t4/optimize/*` shipped in the `.jpa` renders broken until cleared.)

## 2. Renaming the blank is not just the folder

**Trap.** Renaming `t4_bs5_blank` → `<TPL>` by moving the folder leaves the old
name persisted everywhere else, and the template name is also written to the DB
on install (`#__template_styles`, `#__extensions`), so a half-rename is hard to
undo after install.

**Fix.** Before install, also:
- rename the two `language/en-GB/en-GB.tpl_*.{ini,sys.ini}` files,
- update `<name>` and the two `<language>` entries in `templateDetails.xml`,
- update `T4_TPL_DESC_1/2/3` in the ini,
- swap `template_preview.png` / `template_thumbnail.png`.

`scripts/scaffold-template.sh` performs all of this. Do the rename BEFORE the
first install.

## 3. Megamenu renders from the DB, not files

**Trap.** Shipping `etc/navigation/*.json` alone does nothing on the frontend.
The live megamenu is read from
`#__template_styles.params['navigation_mega_settings']`. The JSON file is only
the admin-builder default/source.

**Fix.** Seed the params in the DB (see [demo-content.md](demo-content.md)).
The `etc/navigation/*.json` file remains the source that the admin builder loads
as its default, but the frontend needs the persisted params.

## 4. Custom CSS/SCSS must live in `local/`

**Trap.** Editing the shipped `scss/` risks being overwritten on template
upgrade, and is not where T4 expects your overrides.

**Fix.** Put custom styles in `local/`:
`local/scss/variables.scss` + `local/scss/custom.scss` compile to
`local/css/template.css`. The `local/` folder is not shipped and survives
upgrades. (See [css-tokenizing.md](css-tokenizing.md) for what goes in
`variables.scss` vs `custom.scss`.)

## 5. New SCSS partials need an `@import`

**Trap.** A new `_yourpartial.scss` is silently ignored — it never compiles.

**Fix.** Add `@import 'yourpartial';` to `_all.scss` (which `template.scss`
pulls in). No import, no output.

## 6. Error/offline pages are standalone

**Trap.** `error.php`, `offline.php` (and `error-t4.php`) do NOT render through
the T4 pipeline (`T4::render()` / `site-settings` Registry), so template tokens,
the optimize bundle, and the dark-mode resolution do not "just apply" to them.
Leaving them on a cookie+OS-only pre-paint is the common bug: on a locked-light
site a stale cookie or a dark OS flips the 404/offline page to dark, breaking the
lock; and they often load `darkmode.js` (or show a toggle) unconditionally.

**Fix.** Give each its own `<head>` CSS links and **repeat the SAME server-side
resolution `index.php` uses** — read the site profile JSON from disk LOCAL-FIRST
(`local/etc/site/<profile>.json` then base `etc/site/`; the GUI saves to `local/`),
honor the GUI lock/default (cookie only when enabled → default → auto/OS), set the
hook before first paint, and gate the toggle button + `darkmode.css` + `darkmode.js`
exactly like `index.php`. Do NOT read `site-settings` here (it's a stub `stdClass`
→ `->get()` fatals). Full copy-paste: `references/dark-light-mode-standard.md` §4.

## 7. Docs show Joomla 4 / Bootstrap 4, but the J6 target uses the BS5 blank

**Trap.** Official T4 docs and older tutorials sometimes show BS4 / Joomla 4
paths and markup that don't match the J6 build.

**Fix.** Build from `t4_bs5_blank` (Bootstrap 5) and follow its paths. Confirm
the binding in `templateDetails.xml`:
`<t4><bootstrap>bs5</bootstrap></t4>`. When docs and the blank disagree, the
blank wins.

## 8. Member-area creds come from `.env`

**Trap.** Hardcoding or echoing the JoomlArt member credentials leaks them into
output, commits, or chat.

**Fix.** Read `JA_MEMBER_USER` / `JA_MEMBER_PASSWORD` from `.env` only. Never
print them in tool output, commit messages, or chat. (Mirrors the repo's
read-only secrets policy.)

## 9. System pages live at the template ROOT, not under `html/`

**Trap.** Putting `error.php` / `offline.php` / `component.php` under `html/`
(like component view overrides) means Joomla never finds them.

**Fix.** System pages — `error.php`, `error-t4.php`, `offline.php`,
`component.php` — sit at the template ROOT, copied from Joomla's
`templates/system/`. Only component view overrides (e.g. `com_content`,
`com_users`) live under `html/`. (See [t4-anatomy.md](t4-anatomy.md).)

## 10. The T4 base theme already ships most core overrides

**Trap.** Blindly copying every override into the template duplicates what the
base theme already provides and creates extra surface to maintain (and to drift
out of date on upgrade).

**Fix.** The T4 base theme `plugins/system/t4/themes/base/html/` already covers
`com_users`, `com_finder`, `com_tags`, `com_content` (author), `mod_menu`, etc.
Override at the template level only what you actually need to RESTYLE. Inherit
the rest.

## 11. Record source + license for every downloaded image (`images/CREDITS.md`)

**Trap.** Phase 6b fills image gaps with open-source imagery. Shipping a template
with images of unknown origin or incompatible license is a legal/redistribution
risk — and after the fact you can't reconstruct where each file came from.

**Fix.** For ANY downloaded open-source image that lands in `images/`, append an
entry to `images/CREDITS.md` recording the **source URL**, **author**, and
**license** (e.g. CC0/CC-BY/Unsplash license) at download time — not later. Only
ship images whose license permits redistribution in a template package. If a file
has no recorded provenance, it must not ship.

## 12. `site-settings` is a stub `stdClass` at `index.php` time — read the profile JSON

**Trap.** To resolve the first-paint theme (or any T4 "Other" setting like
`other_darkmode`/`other_default_theme`) in the template-root `index.php`, the
obvious move is `$this->params->get('site-settings')->get('other_darkmode')`. At
that point T4 has **not built the Registry yet** — `site-settings` is a partial
**`stdClass`** carrying only `site_logo`, with **no `->get()` method**. Calling
`->get()` is a **fatal 500 that white-screens every page**. (T4 builds the real
`Joomla\Registry\Registry` later, in `loadTypelistData()` during the body render —
which is why a body-layout override like ja_titan CAN read it, but the root
`index.php` / standalone `error.php`/`offline.php` CANNOT.)

**Fix.** Resolve from the active *site profile* JSON on disk, **LOCAL-FIRST**:
`local/etc/site/<profile>.json` (where the admin GUI saves edits) then base
`etc/site/<profile>.json` — mirroring `T4\Helper\Path::findInTheme` (local→base).
Reading only base `etc/` ignores every admin change. If you keep a `site-settings`
fallback at all, guard it: `if ($ss instanceof \Joomla\Registry\Registry)`. Full
verified pattern: `references/dark-light-mode-standard.md`.

---

Append new gotchas as discovered during real conversions.

---

## Field notes (from real conversions)

12. **Raw single-page / no-manifest input — now handled by `--single` / auto-detect.**
    `parse-html-bundle.mjs` now supports raw external templates (e.g. a Tooplate one-pager like
    `2162_stackcraft`: just `index.html` + one CSS + images, no `manifest.json`) via two paths:
    - **Auto-detect:** if `manifest.json` is absent, `parseBundle` falls through to `parseRawTemplate`
      automatically — no flag required.
    - **`--single` flag:** `node scripts/parse-html-bundle.mjs --single <dir>` forces raw-template
      ingestion even when a `manifest.json` exists alongside the HTML.
    The ingestion reads the largest CSS in the dir, extracts `:root` custom properties via
    `extractPaletteFromCss` (maps to `primary/secondary/body_bg/text`, resolves one-level `var()`
    references, derives `mode` from `body_bg` luminance), extracts font families via `extractFonts`
    (prefers `--font-body`/`--font-display` vars, falls back to `body{}`/`h1,h2{}` declarations),
    derives a placeholder light palette from a dark-primary source, and synthesizes the page-map
    from all non-stub HTML files in the directory. See `conversion-contract.md §4` for the full
    heuristic-fallback details. The new exports (`extractPaletteFromCss`, `extractFonts`,
    `parseRawTemplate`) are tested in `scripts/test/html-bundle.test.mjs`.

13. **Dark-only source designs.** Some real templates ship dark-ONLY (StackCraft: `--bg-primary:#0f0e0b`,
    gold accent `#c9a96e`, no light variant) — the inverse of the skill's "HTML ships light(+dark)"
    assumption. Build it dark-primary; a light variant must be DERIVED (or declared out of scope for
    that template). Record the chosen `theme.mode` (`dark-primary`) in the manifest so later phases
    and the dark-mode handoff know not to expect a light reference.

14. **Joomla 6 Development Mode value.** Enable Dev Mode (so edits show without cache) by setting
    `error_reporting = 'maximum'` + `debug = true` in `configuration.php`. The value `'development'`
    is INVALID on Joomla 6 and causes a hard 500 (`error_reporting(): Argument #1 must be ?int`).
    Valid values: `default | none | simple | maximum`.

15. **T4 layout is per-STYLE, not per-menu — inner pages need their own style.** A T4 template style
    carries one `typelist-layout` (e.g. `home`), applied site-wide for that style. There is NO per-menu
    layout override. So a single style makes EVERY view render the home layout (hero/sections leak onto
    contact/login/blog). FIX: create at least TWO template styles — a `home` style (layout=home) for the
    front page, and an `Inner`/`default` style (layout=default) assigned to all inner menu items. Assign
    menu items to the right style.
16. **Chrome must be applied to EVERY layout, not just home.** The header/footer blocks + nav + logo you
    build for `home.json` do NOT carry to `default.json`. Inner pages keep the BLANK's demo header
    (e.g. "T4 Blank" logo + the demo megamenu) and demo footer until you point the inner layout at your
    own header/footer blocks AND replace the demo modules (megamenu menu, footer link modules) + set the
    site logo. Verify an inner page's header/footer, not just the home.
17. **`theme.tpl.css` overrides your body bg in light mode.** T4 injects `--body-bg-color`/`--body-text-color`
    from the style params via `css/tpl/theme.tpl.css`, loaded LAST — so `body{background:var(--your-bg)}`
    loses in light mode even when your token flips. Re-map `--body-bg-color`/`--body-text-color`/`--t4-body-bg`
    under your light/dark hook (and add a higher-specificity `body`/`.t4-content` guard).
18. **Bootstrap utility classes leak light colors on dark.** `.alert-info`, `.badge.bg-info`, `.well` etc.
    render light-blue boxes on a dark page. Add a `[data-bs-theme=dark]`/`<DARK>`-scoped rule set re-coloring
    the BS utilities (this is dark-mode-skill territory — hand off or mirror its approach).
19. **The local `t4-framework-for-joomla-6` package ships the T4 DEMO content.** Provisioning from the local
    fallback yields a site pre-loaded with the T4 quickstart demo (articles, full mainmenu, demo modules),
    NOT a blank site. Either start from a truly clean Joomla 6 + manual T4 install, or expect to unpublish
    the demo modules/menu and replace them with your own.

20. **A menu item's explicit `template_style_id` beats the default style.** Setting your style as the
    site default (`home=1`) is NOT enough if the Home menu item (or any item) has an explicit
    `#__menu.template_style_id` pointing at another style — that override wins and the page keeps
    rendering the old template. After setting the default, also repoint the relevant menu items'
    `template_style_id` (esp. the Home item) to your style. (Refines gotcha #15.)
21. **Joomla 6 admin password minimum is 12 chars**; the CLI installer rejects shorter. **DDEV config
    traps**: re-running `ddev config` with a single flag re-detects defaults (can flip project type to
    `joomla`, bump php, rename) — pass ALL flags in one invocation; `--database` needs a version
    (`--database=mariadb:10.11`, not bare `mariadb`).

22. **Module chrome `style` MUST be dash-format `<template>-<chrome>`.** T4's ModuleHelper does
    `explode('-', style, 2)[1]` unconditionally (line ~188), so a bare/dash-less chrome style
    (`style="raw"`, `"card"`, `"no"`, `"JAxhtml"`) → `Warning: Undefined array key 1` AND the chrome
    silently degrades to `none` (your intended wrapper is dropped). Everywhere you set a module chrome —
    `etc/layout/*.json` position columns (`"style":"..."`), `<jdoc:include type="modules" ... style="...">`
    in blocks, and published modules' `style` param — use `<templatename>-<chrome>` (e.g.
    `ja_aurora-no`, `ja_aurora-JAxhtml`). (`"0"`/empty don't fire it.) T4 emits the layout `style`
    straight into the jdoc include, so dash-less values trigger it at render time.
    ⚠️ **CONFLICT — verify per build.** The design-review skill's platform-bug **P75** (Voyara) reports
    the OPPOSITE: that the **bare** `JAxhtml` is required and `<tpl>-JAxhtml` silently drops the module
    title (chrome functions register as `modChrome_<bareName>`, with no match for the prefixed form).
    The two cite different T4 code paths (`ModuleHelper` `explode('-')` here vs the `modChrome_*`
    function lookup there) — likely a T4-version or invocation-site difference (layout-JSON `style` vs
    the typelist `oc_pos_style` / jdoc `style=`). **Resolve empirically:** render a TITLED module both
    ways, probe for `.module-title` / the chrome wrapper, and use the format that produces it on THIS
    build. **This conflict is RESOLVED in the Phase 8b review pass (`platform-latent-bugs.md` P75 pre-flight):** the
    build ships a format PROVISIONALLY (dash-format `<tpl>-<chrome>` is this skill's default) and
    **FLAGS the module-chrome style as an open review item**; the design-review renders + probes
    `.module-title` on the live site and corrects every module set the losing way. So don't block the
    build on it — pick dash, flag it, let design-review confirm/correct.

23. **Don't dump every page as a flat top-level menu item.** Real JoomlArt navs use
    **4–7 top-level items** with the long tail grouped into **mega panels** — a
    business/agency template runs **4–6** top items (counts verified across vega 5,
    nova 4, prodex 6, morgan 5, spark 4, essence 5). A **10+ item flat row is a red
    flag** and looks nothing like a designed JA template. FIX: keep the top row to
    Home · Work · Services▾ · Pages▾ · Journal · Contact (+ a right cluster: search ·
    dark-toggle · accent CTA pill); re-parent the rest as **children** so they render
    under a mega/dropdown. Build the mega the DB way — `megabuild` items + `items`
    link-list columns (children only) + `module` columns (icon-card grid, featured
    card, CTA) seeded into `navigation_mega_settings` AND `etc/navigation/*.json`
    (see gotcha #3 and blocks-and-elements §5; `scripts/seed-megamenu.mjs` maps the
    columns). The `items:"id,id,…"` of an `items` column can ONLY reference real menu
    CHILDREN of that top item (`mega_items.php` walks the item's sub-tree) — a
    flat-sibling item never shows up in another item's mega. Also: a top item opens a
    mega only when its entry has a truthy `megabuild`; otherwise children render as a
    plain dropdown. Mobile collapses the panels into an off-canvas **drilldown**
    (`oc_menu_effect:"drill"`), not an accordion.

24. **A template MUST expose the standard "Joomla! pages" set.** Beyond the home/blog/article/contact
    basics, ship + link these (the T4 demo's "Joomla! pages" mega is the checklist): Login, Registration,
    **User Profile (+ edit)**, **Password reset**, **Forgot username (remind)**, **Author listing**
    (`com_content&view=author`), **List All Categories** (`com_content&view=categories&id=0`), Smart
    Search, Tags, Single Article, Category Blog, Featured, Offline, Error(404) — plus layout showcases
    (Full width / Content+Sidebar / Sidebar+Content). Missing these reads as an incomplete template.
25. **`menu_show=0` hides a menu item from `mod_menu` AND the mega menu.** If a page you want in the nav
    doesn't appear, check `#__menu.menu_show` = 1. (Demo builds often leave secondary items at 0.)
26. **Brand the off-canvas drawer.** The drawer title defaults to "Sidebar Menu" (T4 `offcanvas_title`
    param / the `t4/layout/offcanvas.php` element). Override it with the template name + tagline and pin
    a CTA inside the drawer — don't ship the generic default.

27. **Megamenu is DUAL-seeded: DB param picks the mega items, the FILE renders the columns.** Refines
    #3. The frontend reads `#__template_styles.params['navigation_mega_settings']` to know WHICH menu
    items are mega + their width/align/`megabuild`, but the T4 `mega.php` element reads the COLUMN
    contents (`settings[].contents[]`) from `etc/navigation/<profile>.json`. So seed BOTH: write the
    id-keyed `mega_settings` into the style params (all styles that use the menu) AND into the
    navigation JSON file. Seeding only one → mega opens empty or doesn't open. (`seed-megamenu.mjs`
    emits both.) An `items`-type column references menu CHILDREN by id; a `module`/`position` column
    renders a module — chrome dash-format (#22).
28. **Bootstrap `.row.g-*` negative gutters cause mobile horizontal overflow.** A `.row.g-4/.g-5` inside
    a `container:"none"` section (or any full-bleed band) overflows ~9-24px on narrow viewports because
    the negative gutter margins exceed the container padding → a horizontal scrollbar. Fix: `overflow-x:
    clip` on your section bands and the footer (use `clip`, NOT `hidden` — `hidden` creates a scroll
    container that breaks `position:sticky`). Verify 0 overflow at 390px (`scrollWidth==clientWidth`).
29. **One mobile toggle only — don't include both `megamenu-toggle` AND `offcanvas-toggle`.** A header
    block that includes both elements renders TWO hamburger icons on mobile. The off-canvas drawer is
    the working mobile menu, so keep `offcanvas-toggle` and drop the redundant `megamenu-toggle`.
30. **Seed articles with a VALID `images` JSON, never NULL/empty-string.** An article whose `#__content.images`
    is `''`/NULL triggers `Warning: Attempt to read property "image_intro" on null` in content layouts.
    When inserting demo articles, set `images` to a proper JSON object (e.g.
    `{"image_intro":"","image_fulltext":""}` or real paths). Same care for `urls`/`attribs`.
31. **Purge the blank's leftover demo layouts, modules, and menu items.** After scaffolding from
    `t4_bs5_blank`, the template still carries demo `etc/layout/*.json` (`home-biz`, `home-magz`,
    `pagebuilder`, `Header-1..4`, `no-sidebar`) and the install carries demo modules + `mainmenu` items
    pointing at `t4_bs5_blank` styles. Remove the unused layouts, unpublish/replace demo modules, and
    don't leave demo menu items reachable (they render under the wrong template). Keep only the layouts
    your styles actually use.
32. **Match the Font-Awesome class style the template ships.** Mixing FA versions silently shows blank
    icons. T4/BS5 templates generally use FA5 short prefixes (`fas`/`far`/`fab fa-xxx`), not the FA6
    `fa-solid`/`fa-regular` longhand, and some icon names differ across versions (`fa-clapperboard` →
    `fa-film`). Use the prefix/names that the template's loaded FA addon supports; verify icons render.
33. **Playwright verification reality on T4 sites — READ before you screenshot/probe.** These bit every
    run; budget for them:
    - **MCP screenshot wrapper times out at ~5s on heavy T4 pages**, and the MCP browser profile is
      often **locked** ("Browser is already in use"). Reliable path: a **standalone Playwright script
      using system Chrome** (`chromium.launch({channel:'chrome'})`) — bundled chromium may be uninstalled.
      A reusable driver was kept at `.aurora-build/shot.mjs` / `capture-menus.mjs` (model new ones on it).
    - **T4 emits ~7 copies of `ul.navbar-nav`** (hidden off-canvas clone, footer menus, …); the FIRST is
      the hidden off-canvas copy. Target the VISIBLE desktop nav (`width>300 && top<200 && visible`).
    - **Hover doesn't fire reliably headless**, so mega panels stay closed. Prefer a real `page.hover()`
      on the top `<li>` — force-opening via injected `.show`/`!important` CSS works for presence checks
      but **mis-positions the panel off-screen** because T4's `megamenu.js` viewport-fit only runs on
      real hover. Use real hover for visual screenshots.
    - **Always clear the T4 optimize cache** (`clear-cache.sh --root <root>`) before each render or you
      screenshot stale CSS.

34. **Leftover demo menu items in OTHER menutypes silently HIJACK the view→Itemid router.** This is the
    #1 cause of "a page renders the HOME page / an unstyled demo page instead of its own content," and of
    login-fail/guest-redirect landing on the wrong page. Joomla resolves a bare component link
    (`view=login`, `view=featured`, `view=profile`, `view=registration`, `view=reset`…) to the
    **lowest-id PUBLISHED `client_id=0` menu item carrying that link across ALL frontend menutypes** — not
    your template's menu. A demo `login-page`/`featured` item (from `mainmenu`/`joomla-pages`/`top-menu`)
    outranks your styled one. **Fix: unpublish (state −2) every frontend menu item outside your template's
    own menutype** after scaffolding/quickstart. This single change de-collides routing, login, and profile
    at once. (Bigger than #20/#31 — it's view→Itemid resolution, not just style overrides.)
35. **Identical `link` on multiple menu items is a routing time-bomb.** Two items with the same query
    (e.g. several `view=featured` "home/landing/featured" pages) collide; SEF may disambiguate by path
    today but bare URLs / canonical redirects won't. Give each a genuinely DISTINCT query —
    different `featured_categories`, a category filter, or a single-article link — so every page has a
    unique route.
36. **Login success vs failure are two different mechanisms.** SUCCESS → the login menu item's
    `login_redirect_menuitem` param (set it, e.g. to Profile/Home). FAILURE → the login *view's* `return`
    (base64), which Joomla sets to the form's own page, so a wrong password naturally STAYS on the login
    page with the error — **provided your login menu item is the canonical `view=login` target** (see #34).
    If wrong-password redirects home, the culprit is almost always a competing demo login item, not config.
37. **Auth-gated pages must use `access=2` (Registered), not Public.** A guest hitting a Public
    `com_users` profile/edit page gets bounced (often home). Set those menu items `access=2` → Joomla
    auto-redirects guests to the LOGIN page (with return) and back after login — the standard pattern.
    The login destination is again the canonical `view=login` Itemid (#34 caveat applies).
38. **`.item-page a { color: <primary> }` repaints BUTTON text inside article bodies.** CTAs placed in
    `#__content.fulltext` render link-colored-on-button-fill (e.g. coral-on-coral = invisible). Scope the
    content link color with `a:not([class*="btn"])` and add explicit `a.btn-*{color:…}` guards, in BOTH
    light and dark. (Same family as the dark-mode skill's "white-on-fill restore".)
39. **Pages must be COMPLETE, not a bare article/single component.** Real JA pages are multi-section:
    masthead/hero + breadcrumbs + the main view + supporting modules/bands (stats, process, testimonial,
    related) + a CTA band + sidebar where sensible — not one naked `view=article`. When you generate a
    page (About, Services, a service-detail, Pricing, Team…), build the full composition (article body
    with rich sections AND/OR published modules in the layout's positions). Study a real template's page
    (e.g. the captured `vega-source/*.html`, or live nova/spark about/services) for the section recipe.
40. **JA Extension Manager (`com_jaextmanager`) is NOT a page/layout standard — don't chase it.** It is a
    JoomlArt extension **management** tool (install / upgrade / rollback / compare versions of JA
    extensions); it has nothing to do with how a template composes pages or sections. The **T4-native
    flexible-section / page mechanisms** to leverage are: **ACM blocks** (`acm/<block>/` rendered by
    **`mod_ja_acm`**) for editable home/marketing sections — `config.xml` + `tmpl/style-N.php` +
    `style-N.xml` + `css/`+`less/` (see `layout-json.md` "ACM authoring" + `catalog.md` §3) — plus
    **`com_jabuilder`** (JA Builder) as the optional drag-drop page builder. When you need an editable,
    repeating front-page section, author an ACM block (or a new `style-N` of one); do not look to JA EM.
    Custom ACM blocks are encouraged for signature sections (`catalog.md` §6.4).

<!-- #41–#49 were found by a full review of a skill-generated template (ja_aurora): live frontend
     render (light+dark), an admin pass, and a clean-frame install-smoke-test (packaged zip installed
     into a pristine Joomla 6 + T4 via `extension:install`, set default, booted). Each is a real,
     reproduced defect — fold the fix into the relevant phase so it never ships again. -->

41. **The default style installs titled `JLIB_INSTALLER_DEFAULT_STYLE` — generic/unbranded, not a real
    name.** On a clean `extension:install`, Joomla stores that **literal constant** as
    `#__template_styles.title` for the one auto-created style (this is Joomla-standard for *every*
    template, not a bug in yours). In most admin views `Text::_()` renders it as **"Default"**, but some
    contexts (CLI, certain lists) show the raw `JLIB_INSTALLER_DEFAULT_STYLE`. Either way the style is
    **unbranded** and there's only **one** of it — a real JA template ships several named styles
    (`<Name> - Home`, `- Inner`, `- Landing`, …). **Fix:** your demo/seed SQL must create + rename the
    styles with friendly titles (`UPDATE #__template_styles SET title='<Name> - Home' …`); that's part of
    the *quickstart*, not the bare package (gotcha #49). Verify on a **fresh** install, not the dev site
    where your seed already renamed them. (Found live: fresh-frame install created exactly one style
    titled `JLIB_INSTALLER_DEFAULT_STYLE`; the dev DB had it too until the seed SQL renamed it.)

42. **"Ships dark from the start" needs an actual SWITCH, not just dark CSS.** A template can carry a
    fully-themed `html.t4-dark` palette (every section correct in dark) and still give the end user **no
    way to enable it** — no toggle in the header, and T4's native Dark-Mode option left off. Dark CSS that
    nothing activates is invisible. **Fix:** wire a real switch — either (a) enable T4's built-in dark
    toggle in the template's site/global settings (the toolbar toggle that adds `html.t4-dark`), or (b)
    ship your own following the **vega standard** (`css-tokenizing.md` §3e): a STATIC button in the
    header layout override + a separate `js/darkmode.js` that toggles the `<DARK>` hook and persists
    localStorage + a separate `css/darkmode.css` (**never `custom.css`** — owner's file) loaded after
    `template.css`. **Verify by loading the page and clicking the toggle**, not by confirming the CSS
    exists. (Found live: applying `t4-dark` turned the body dark correctly, but `document.querySelector`
    found zero toggle elements — dark was unreachable.)
    **Wiring trap (learned fixing aurora): `$this->addScript('…/js/darkmode.js')` in the template
    `index.php` is silently dropped by T4's JS optimiser** (with `system_optimizejs=1`) — the file never
    lands in the `media/t4/optimize/<hash>.js` bundle and the toggle stays dead. Correct wiring (vega
    standard): load `darkmode.js` via the **WebAssetManager** —
    `$this->getWebAssetManager()->registerAndUseScript('tpl.<NAME>.darkmode', 'templates/'.$this->template.'/js/darkmode.js', [], ['defer'=>true])`
    (T4 sees it at collection time; `addScript` does not survive) — and put the tiny FOUC **pre-paint**
    resolver inline via `addScriptDeclaration` (inline declarations are never bundled, so they always
    render before paint). NOTE the heredoc trap: close `<<<'JS'` with the `JS` marker alone on its line
    and `);` on the NEXT line — `JS);` on one line is a PHP < 7.3 fatal that white-screens every page.
    ⚠️ For the CSS use `addCustomTag('<link … darkmode.css>')`, NOT `registerAndUseStyle` (WAM can place
    it BEFORE `template.css` → light leaks). The toggle BUTTON is plain HTML in the header block
    (`mainnav.html`/`header.html`), styled in `darkmode.css` with the `<DARK>` hook swapping sun/moon.

43. **Strip foreign-component baggage — only override components the template actually uses.** Cloning
    from a blank/source template drags in overrides + assets for extensions you'll never ship:
    `html/com_virtuemart`, `html/com_community`, `html/com_easyblog`, `html/mod_virtuemart_*`,
    `html/mod_community_hellome`, `html/mod_easydiscuss_*`, the matching `css/extras/com_*.css` +
    `scss/extras/com_*.scss`, `images/vm-*.png`, **and** the `etc/assets.json` + `etc/global.json`
    `system_addons` wiring for docman/easyblog/easydiscuss/virtuemart/kunena/jomsocial. These don't just
    bloat the zip — `css/extras/com_docman.css`, `com_easyblog.css`, etc. **load on every front-end page**.
    **Fix in Phase 5/9:** delete overrides/assets for any component not in the design; keep only what the
    template renders (e.g. com_content, com_contact, com_users, the few mods you use). Decide the
    component set from the source category (`catalog.md`), not from whatever the blank shipped. (Found
    live: a "creative-studio" template was loading VirtueMart/Kunena/JomSocial/DocMan/EasyBlog CSS.)

44. **Delete the stray `etc/theme/.json` (empty filename).** Generation can leave a file literally named
    `.json` in `etc/theme/` holding the untouched blank defaults (Inter font, blue `#3d5afe`). It parses as
    valid JSON but is junk and can confuse the T4 theme picker. **Fix:** ensure every `etc/theme/*.json`
    has a real name (`default.json`, `architect.json`, …) and remove any zero-name file. Add a Phase 9
    check: `find etc -name '.json'` must return nothing.

45. **Finish the de-blank rebrand — the blank's identity hides in non-obvious files.** Beyond the visible
    template name, "T4 Blank" residue survives in: `index.php` (`@package T4_BLANK`), both language inis
    (`T4_BLANK`, `T4_TPL_DESC_3`, and a leftover `; VM` VirtueMart string block), `templateInfo.php`
    (`T4 Blank Template Bs5`), and **`<updateservers>` in `templateDetails.xml`** (still pointing at
    `tpl_t4_bs5_blank.xml`, so the template would pull *blank* updates). **Fix:** grep the whole template
    for `T4_BLANK|t4_bs5_blank|Blank` after scaffolding and rewrite each hit; repoint or remove
    `<updateservers>`. (Complements the rename gotcha #2 — rename handles the machine name; this handles
    the prose/metadata.)

46. **Featured-view home throws `Undefined variable $row` / `$rowcount` warnings.** T4's base
    `plugins/system/t4/themes/base/html/com_content/featured/default.php` (lines ~70–72) references `$row`
    and `$rowcount` that aren't initialized in that code path, so **every featured render** (any home/landing
    using `view=featured`) logs PHP warnings. Overriding only `default_item.php` (the per-article partial)
    doesn't help — the warnings are in the `default.php` wrapper. **Fix:** ship
    `html/com_content/featured/default.php` in the template that initializes `$row`/`$rowcount` before the
    loop (or copy the base file and add `$row = 0; $rowcount = 0;`). Cosmetic when Joomla debug is off
    (warnings go to log only), but a shippable template should render clean. (Found in the nginx/php error
    log on au-home, au-landing, au-home-2.)

47. **Set the optimize + frontend-edit flags in `etc/global.json` explicitly.** A generated `global.json`
    can **omit** `system_optimizecss`/`system_optimizejs` (so CSS/JS bundling is unconfigured and assets
    serve unminified/unbundled — you'll see raw `templates/<tpl>/css/*.css` instead of
    `media/t4/optimize/<hash>`) and leave `system_t4frontendedit` = `"1"` (front-end editing left on for
    site visitors). Real shipped templates set the optimize keys to `"1"` and `system_t4frontendedit` to
    `"0"`. **Fix:** author these keys deliberately in Phase 9. (Note: with optimize off, the cache-clear
    discipline of gotcha #1 still applies the moment a user turns it on.)

48. **ACM-less home = sections that aren't admin-editable (principle #4 violated).** A home built entirely
    from bespoke static blocks (`html/layouts/t4/block/<name>.html`) renders beautifully but is **not
    editable through the admin** — there's no `acm/` directory and no `mod_ja_acm` blocks, so a site owner
    can't change the hero/features/pricing/team copy without editing template files. The mandatory minimum
    (`catalog.md` §6.1) calls for **≥6 ACM home sections** precisely so the home is editable. **Fix:** for
    the editable marketing sections, author ACM blocks (`acm/<block>/` + `mod_ja_acm`) and place them via
    layout positions (Phase 5), reserving static blocks for genuinely complex/one-off hero art only. If you
    deliberately ship a static home, say so and don't claim "editable through admin." (Found live: zero
    `acm/` blocks; every home section was a hardcoded `aurora-*` block.)
    **Conversion recipe (used to retrofit aurora's home to editable, parity-preserved):** the lighter
    alternative to authoring full `mod_ja_acm` packages is a **`mod_custom` per section in a layout
    position** — admin-editable via the Custom-HTML editor. Steps: (1) move each static block's HTML into a
    `mod_custom` module (`#__modules.content`, `module='mod_custom'`, `showtitle=0`, params
    `prepare_content="0"` so the raw markup isn't mangled), one per section, **assigned to the home menu
    item only** (`#__modules_menu`); (2) in `etc/layout/home.json` flip each section's `contents[0]` from
    `type:"block"` to `type:"positions"`, set its `positions` to the target position, **and set its `name`
    to the SAME position string** — *T4 resolves a positions row by `name`, not by `positions`; if
    `name` still holds the old block name the row renders EMPTY* (the #1 trap here), and set
    `style:"<tpl>-no"` (the "no module chrome" style) so the module outputs raw — its `<section>` stays the
    direct child, parity intact; (3) keep the row's wrapper (`extra_class`, background) untouched. Verify by
    geometry, not eyeballing: consecutive `<section>`s should have **0px gaps** and full-bleed width, and
    dark must still apply to the now-module-rendered sections. **Caveat (gotcha #49):** the editable home's
    content now lives in **demo/seed modules, not the template package** — a bare package install renders an
    *empty* home (positions with no modules), so the module rows MUST be in your quickstart seed SQL.

49. **A template ZIP ≠ a quickstart — the package installs and boots, but it's content-empty.** Verified:
    the packaged template zip (manifest can sit under a single wrapping `<tpl>/` folder — Joomla's
    installer finds it) installs cleanly via `extension:install`, registers + enables the extension, and
    creates **one** default style; setting it default boots the site HTTP 200 with the template's chrome and
    **no fatal errors**. But the **extra styles (Inner/Landing/Home-2), the megamenu params, the menus,
    modules, and demo articles only exist because your demo/seed SQL created them** — none travel in the
    template package. So: (a) the *template-package* deliverable must install + boot standalone (run the
    install-smoke-test below); (b) the *quickstart* deliverable is template + demo SQL together. Don't
    conflate them, and don't assume "it works on my dev site" means "the zip works" — your dev DB already
    has the seed. **Always run the clean-frame install-smoke-test in Phase 9** (see `verify-recipes.md`).
    → the full quickstart (Joomla core + DB + media as an Akeeba `.jpa`) is built + parity-verified in
    **Phase 10** (`packaging-quickstart.md`).

50. **Page aliases/paths must be clean & SEO-friendly — never prefix with the template codename.** Menu
    items and articles should get human, keyword-bearing slugs (`home`, `about`, `services`,
    `services/brand-identity`, `pricing`, `blog`, `contact`) — NOT the template's internal abbreviation
    (`au-home`, `au-services/au-svc-brand`, `au-pages/au-about`). A prefix like `au-`/`vega-` bleeds the
    template's codename into **every URL** (`/au-pages/au-about`), reads as machine-generated, and weakens
    the keyword in the slug — worse for SEO and for the human reading the address bar. `setup-demo-content.mjs`
    `toAlias(title)` already emits clean slugs; **don't post-process them with a namespace.** The usual
    reason builders reach for a prefix is to avoid an alias collision with the blank/quickstart's leftover
    demo menu items — but the correct fix is to **unpublish those leftover items** (#34), *then* take the
    clean alias. Check in Phase 8: no front-end URL should contain the template abbreviation. (Found in the
    aurora build: the whole nav was `au-…`.)

51. **Content must be RICH and DENSE — coverage is not enough (strengthens #39).** Every page must be
    *substantive*: many sections, each carrying real, plentiful content — NOT a thin page made just to
    satisfy the page list. A page that merely EXISTS but is sparse (a lone hero, a bare form, one card) is
    a FAILURE, even though it counts toward coverage. Targets: home ≥6 rich sections; inner content pages
    (about/services/features/pricing/single/category/author/archive…) ≥4 sections of real content +
    supporting modules in the sidebar/positions; auth/system pages (login/register/profile/reset/remind/
    contact/search) ≥3 (masthead + form + a supporting section — never a bare form). Fill modules/ACM with
    REAL demo content (multiple articles, full feature lists, several testimonials, a populated FAQ), not
    one token item. When porting from an HTML bundle, mirror its density; if the source is rich, the Joomla
    pages must be equally rich. Aim WELL above the minimums. (The upstream `html-template-authoring` skill
    enforces this with an `assertRichness` gate — the bundle arrives dense; keep it dense through the port.)

52. **A style row with `params={}` silently renders the `default` layout, not your `home`.** A
    template style created by the scaffold/seed (or via the admin "New" button) can land in
    `#__template_styles` with **empty params** (`{}`) — no `typelist-layout`/`typelist-theme`/
    `typelist-navigation`/`typelist-site` keys. T4 then falls back to the `default` layout for that
    style, so your Home menu item (correctly pointing at the style, `home=1`) renders the **inner**
    layout (component view + footnav) instead of `home.json` — chrome/footer from `home.json` may even
    partially apply, masking the cause. **Fix:** the style's params MUST carry the typelist tuple
    explicitly, e.g. `{"typelist-site":"default","typelist-navigation":"default","typelist-theme":
    "default","typelist-layout":"home","system_addons":["font.awesome5","font.awesome4",
    "font.iconmoon"]}`. Seed it in your demo SQL (and set `navigation_mega_settings` in the SAME params
    — gotcha #3/#27). Verify with `SELECT JSON_EXTRACT(params,'$."typelist-layout"') FROM
    #__template_styles WHERE id=<style>;` — empty/NULL means the home will never render. (Refines #15:
    #15 is "one layout per style"; #52 is "the style must actually NAME that layout in its params.")
    (Found live building ja_meridian: style 32 was `home=1` + Home item repointed at it, but params were
    `{}` so the front page rendered the demo article + footnav until the typelist keys were seeded.)

53. **Purging the blank's demo ARTICLES 500s the registration page (and any consent flow) — fix the
    plugin pointers, don't just delete.** The blank/quickstart ships `user/terms`, `content/confirmconsent`
    and `system/privacyconsent` plugins whose params point at a specific demo article id (e.g.
    `terms_article:30`, `privacy_article:30`). When Phase 7 purges the demo content (`DELETE FROM #__content
    WHERE id<200`), those ids vanish but the plugins still load them during `onContentPrepareForm` on the
    **registration** view — and crash with `Attempt to assign property "link" on null` → a hard **500 on
    `view=registration`** (login/reset/remind are unaffected, which is the tell). **Fix:** after purging,
    create a real "Terms & Conditions"/"Privacy" article and repoint `terms_article` /`privacy_article` in
    `#__extensions.params` for `terms`, `confirmconsent`, and `privacyconsent` at it (or disable those
    plugins). Same trap for any plugin that resolves a demo entity by id (related-items, a demo menu, a
    sample contact). (Found live building ja_meridian.)
54. **Demo articles/modules dated "today" can be FUTURE relative to the DB server clock → silently
    hidden.** Seeding `#__content.publish_up`/`created` or `#__modules.publish_up` with a wall-clock time
    like `NOW='2026-06-16 10:00:00'` while the DDEV MySQL server clock reads `2026-06-16 01:44` makes those
    rows **future-published** — articles drop out of category/featured/popular lists and **`countModules()`
    returns 0 so T4 omits the whole sidebar position column** (the row renders with only the content column,
    no sidebar, looking like a layout bug). The symptom is "the sidebar/most-read/recent modules don't
    render even though they're published and assigned to all pages (`modules_menu.menuid=0`)." **Fix:** seed
    `publish_up`/`created` with a clearly PAST date (`2026-01-01`), or read the server's `SELECT NOW()`
    first and backdate. Verify with the Joomla module query: `… AND (publish_up IS NULL OR publish_up <=
    NOW())`. (Found live building ja_meridian: 11 articles + every inner-page sidebar module were invisible
    until the future `publish_up` was backdated.) (Also a package trap — quickstart: future-dated demo
    content vanishes when a user installs months later; back-date before capture.)

55. **Restyling the T4 megamenu header must NOT break its built-in one-row layout + breakpoint collapse +
    dropdown positioning — and the wrap bug hides in `ul.navbar-nav`'s `flex-wrap`.** The T4 megamenu
    element renders `<nav class="navbar navbar-expand-{breakpoint}"> … <ul class="nav navbar-nav level0">`,
    and Joomla's `mod_menu` ships that `ul` with **`flex-wrap: wrap`** (plus `flex-column`). T4's own CSS
    handles the responsive *collapse* correctly — at `≥{breakpoint}` (`navigation_option_breakpoint`, e.g.
    `lg`/992px) the `.t4-megamenu.collapse.navbar-collapse` is shown and the desktop nav appears; below it
    the collapse is `display:none` and (with `mega_showsm:false` + `oc_enabled`) the `offcanvas-toggle`
    burger shows (`d-lg-none`) — that part usually JUST WORKS. **The trap is the desktop row itself:** a
    custom header SCSS that only re-colours the links and centers the nav (`mx-auto`) but never forces
    `flex-wrap: nowrap` on `ul.navbar-nav` lets 6–7 top items **wrap to a 2nd row** inside the nav's track
    (e.g. CONTACT drops under the logo), doubling the header height. And because each mega `<li>`'s
    absolutely-positioned `.dropdown-menu` is anchored to that `<li>`, a wrapped li sits on row 2 so the
    **mega panel opens at the wrong Y** and looks "mis-positioned/broken" — when in fact the panel markup is
    fine; **fix the wrap and the mega drops correctly.** **Fix (scope to your header, desktop bp only):**
    ```css
    @media (min-width: 992px) {            /* match navigation_option_breakpoint */
      .<tpl>-header .t4-megamenu .navbar-nav.level0 {
        flex-direction: row !important; flex-wrap: nowrap !important;
        justify-content: center; align-items: center;
      }
      .<tpl>-header .t4-megamenu .navbar-nav.level0 > li { flex: 0 0 auto; }
      .<tpl>-header .t4-megamenu .navbar-nav.level0 > li > a {
        white-space: nowrap; padding-inline: clamp(.5rem,.2rem+.7vw,.85rem);
      }
    }
    .<tpl>-header .header-inner { flex-wrap: nowrap; }   /* logo|nav|actions never wrap */
    .<tpl>-header .<tpl>-nav { min-width: 0; }           /* nav track may shrink, no overflow */
    ```
    Do NOT cap the nav's width and do NOT fight T4's collapse — just stop the row wrapping and let the nav
    size to its content inside `.header-inner`. **VERIFY at the desktop bp AND below it, in BOTH modes:**
    desktop nav = ONE row (assert every top `<li>` shares the same `getBoundingClientRect().top`), the
    `#triggerButton` burger is `display:none` at/above the bp and visible below it, the desktop megamenu is
    `display:none` below the bp, the mega panel opens just under a single-row header, and `scrollWidth ==
    clientWidth` at 992/820/390. Driver: probe `tops = [...ul.children].map(li=>li.getBoundingClientRect().top)`
    → `new Set(tops).size === 1`. (Found live on ja_meridian: 7 items wrapped to 2 rows at 992–1440px with NO
    hamburger fallback for the wrap, and the Technology/Sections mega opened at y:80 because its `<li>` was on
    the 2nd row. One `flex-wrap:nowrap` + a tighter link box fixed all three at once; the collapse was already
    correct.) Companion: keep ONE toggle (#29) and `overflow-x:clip` the header (#28).

56. **The header sits left / "off to one side" because `.t4-header` is `display:flex` and your
    `<header>` child collapses to content width.** T4 wraps the header block in
    `.t4-section.t4-header { display:flex; flex-wrap:wrap }` and only stretches children with class
    `.header-block` (`width:100%`). A bespoke `<header class="<tpl>-header">` child is a flex item with
    no flex/width, so it sizes to its content (~1150px at 1280) and aligns flex-start → the whole header
    shifts left and the inner `.container` can't center. **Fix:** `.t4-header { display:block }` *or*
    `.t4-header > .<tpl>-header { flex:1 1 100%; width:100% }`. **Verify:** the header's
    `getBoundingClientRect()` is `x:0 w:<viewport>` and the inner `.container` is centered
    (`x == (viewport-maxWidth)/2`). (Distinct from #55, which is the nav row wrapping *inside* a
    full-width header.)

57. **Heading font, weight, and line-height are read from `etc/site/default.json`, NOT
    `etc/theme/default.json` — and the blank's defaults silently win.** T4 regenerates
    `media/t4/css/<styleid>.css` (the `:root` that defines `--heading-font-family` /
    `--heading-font-weight` / `--heading-line-height` / `--body-line-height`) from the **site** params,
    which a cloned blank ships as `Inter / 600 / 1.3 / 1.5`. The theme JSON can say `Geist / 700 / 1.15`
    and it is ignored — so **every heading renders in Inter 600 with body line-height too tight**, on
    every page, even though `--font-heading` is correctly defined in your SCSS `:root`. **Fix:** set
    `heading_font_family` / `heading_font_weight` / `heading_line_height` / `body_line_height` in
    `etc/site/default.json` (and in the DB template-style params if they carry them), then delete
    `media/t4/css/*` + the optimize cache so T4 regenerates. **Verify (computed, not the JSON):**
    `getComputedStyle(document.documentElement).getPropertyValue('--heading-font-family')` is your
    heading font, and `getComputedStyle(h2).fontFamily` starts with it (not Inter). This is the #1
    "the HTML was pixel-right but the Joomla render is wrong" defect — catch it with a computed-style
    diff (`verify-render.mjs`), not by eye.

58. **T4 section-colour-palette wrappers (`.t4-palette-gray` / `.t4-palette-light`) hardcode light hex
    and do NOT flip in dark.** A layout row with `color_pattern:"gray"` renders `t4-palette-gray` whose
    `background-color:#F6F7FB` + dark heading come from the generated `<id>-sub.css` at 0,2,0
    specificity — so a tinted band stays a light slab on a dark page (most-noticed dark-mode bug).
    **Fix (darkmode.scss):** `html[<DARK>] .t4-palette-gray,[…].t4-palette-light{ background-color:
    var(--color-bg-alt) !important; color:var(--color-text) }` + remap their headings to
    `var(--color-heading)`. Separately, if a section is banded gray in your design's LIGHT mode but the
    source page isn't, remove the `color_pattern` from that row in `etc/layout/*.json`.
    QA-detect: design-review platform bug P19 / recurring `[DARK-PALETTE-WRONG-SELECTOR]`.

59. **Joomla's user-form cards are WHITE in dark — `--t4-card-bg:#fff` is never remapped.** com_users
    login/register/reset/remind/profile wrap the form in a Bootstrap `.card` whose bg resolves to
    `#F8F9FA/#fff`, so the auth card is white-on-white (content illegible) in dark even when your design
    `.card`s are dark. **Fix (darkmode.scss):** remap `--t4-card-bg`/`--t4-card-border-color` to your
    dark surface tokens AND add `html[<DARK>] .auth-card{ background-color:var(--color-surface);
    border-color:var(--color-border) }`. **Verify:** `getComputedStyle(.auth-card).backgroundColor` is
    the dark surface, not near-white.

60. **EVERY menu item needs a `page_heading` param or its masthead hero vanishes — not just the
    pages-hub items.** T4's masthead element paints the inner-page hero from the active menu item's
    `page_heading` (+ `page_heading_desc`). When a primary-nav route (e.g. `/product/signin`,
    `/company/contact`, `/product/search`) and the demo-hub route point at the same view but only the
    hub item carries the heading params, the primary route renders with **no hero band**. **Fix:** seed
    `page_heading` / `page_heading_desc` (eyebrow folded into desc as `<span class="masthead-eyebrow">`)
    on **every** menu item, and add a `.masthead-eyebrow` rule (mono/uppercase/primary) — it has no CSS
    by default. Keep `show_page_heading=0` so the *component* view doesn't also print a title (see #61).

61. **Designed marketing pages = the "canvas-body" pattern; otherwise they convert to a bare stub
    article or a squished blog grid.** A page like about/features/pricing/FAQ/team/integrations/changelog
    is one fully-designed `<main>`, not a Joomla data view. Reproduce it by injecting the cleaned source
    `<main>` (asset paths + internal links rewritten) into an **article introtext**, wrapped in a marker
    (`.nx-canvas-page`). Then: (a) the article override branches the body wrapper to a plain
    `.nx-canvas-body` (NOT `.article-prose`, whose `font-size:18px` + smaller-heading rules squeeze the
    section type); (b) hide the article chrome + the layout masthead/breadcrumb with `:has()` —
    `body:has(.nx-canvas-page) .t4-masthead`, `.article:has(.nx-canvas-page) > .article-head`, etc.; (c)
    strip the narrow reading container so sections span full width. The recurring sibling defect is the
    **duplicate page heading** (the T4 masthead AND the view's own title both render) on article /
    category / archive / com_tags / com_users views — hide the in-component title (`body.view-category
    .cw-head`, the show_page_heading `<h1>` block, `body.com_tags .cw-head`) and let the masthead own it.
    NEVER point a designed page at a generic data view (a changelog timeline routed to a blog category
    renders as a blog grid).

62. **The T4 legacy stylesheet styles EVERY `figure figcaption` as a dark Joomla image caption.**
    `figure figcaption { background:#343a40; color:#adb5bd; text-transform:uppercase; … }` (from the
    `@import …/base/scss/legacy`) bleeds into any design component that uses `<figure><figcaption>` — a
    testimonial author row gets a dark bar behind the name. **Fix:** reset it for your components
    (`.ja-acm figcaption, .testimonial-author{ background:transparent; color:var(--color-text);
    text-transform:none; padding:0; text-shadow:none }`) — leave Joomla content-image captions
    (`figure.item-image figcaption`) alone.

63. **Untranslated `JGLOBAL_*` / `COM_*` constants render RAW in custom overrides.** A bespoke
    categories/author card that does `Text::_('JGLOBAL_VIEW')` prints the literal string
    `JGLOBAL_VIEW` (the key isn't loaded in that context). Likewise `Text::plural('COM_CONTENT_NUM_ITEMS',
    $n)` yields a label with **no number** when the string lacks a plural/placeholder. **Fix:** use a
    literal ("View →") or a real count (`(int)$item->numitems . ' articles'`) in the override, or add the
    key to `language/en-GB/*.ini`. Grep the rendered HTML for `JGLOBAL_|COM_[A-Z]` as a gate.

64. **Smart Search returns "No Results" until the index is built; `json_decode($nullField)` prints a
    visible Deprecated warning.** Two com_finder/com_tags/com_newsfeeds traps: (a) the finder index is
    empty after seeding content → `ddev exec php cli/joomla.php finder:index` (124 items appeared and
    search worked). (b) `json_decode($item->core_images)` on a NULL field emits
    `Deprecated: Passing null to parameter #1 ($json)` **rendered on the page** (display_errors=On on
    ddev) — guard every such call: `json_decode($item->core_images ?: '{}')`.

65. **Ship overrides for the FULL Joomla-6 component set, not just the nav-linked views.** A complete
    template styles every standard component view so nothing falls back to raw Joomla output when a site
    owner enables it. Beyond article/category/single/featured/archive/categories, com_users
    (login/registration/profile/edit/reset/remind), com_finder/search, com_tags (tags/tag), com_contact
    (contact), and standalone error/offline/component — also override: **com_contact** `category` /
    `categories` / `featured` (contact directory), **com_newsfeeds** `category` / `categories`,
    **com_users MFA** (`methods` / `captive` / `method/edit` / `method/backupcodes` — increasingly
    required in Joomla 6), and the **com_tags `tag/list`** compact variant. Restyle each in the
    template's own design (its `.card` / auth-card / masthead conventions), null-guard `json_decode`
    (#64), avoid raw lang keys (#63), and render the hero from the menu `page_heading` (#60). Audit by
    diffing your `html/com_*` view folders against the most complete official template (ja_titan) — see
    `page-coverage-matrix.md`.

66. **Every SQL/PDO-seeded article needs a `#__workflow_associations` row — without it the article is
    INVISIBLE in the Joomla 6 admin Articles list (frontend still renders it).** Joomla 6's admin
    article list `INNER JOIN`s `#__workflow_associations`, so an article inserted straight into
    `#__content` (categories/featured/single/legal/canvas-page articles all hit this) shows on the
    site but **never appears in Content → Articles** — the owner can't find or edit it. **Fix:** for
    EVERY seeded article also insert `#__workflow_associations (item_id, stage_id, extension)` with
    `stage_id` = the default com_content stage (usually `1`) and `extension='com_content.article'`.
    Also seed `#__ucm_content` (the unified-content row Joomla expects for tags/finder/versions) and,
    if the article is tagged, `#__contentitem_tag_map`. **Tag-race trap:** do NOT have parallel
    seeders each create `#__tags` rows — `#__tags` is a nested set and concurrent inserts corrupt
    `lft`/`rgt`; pre-seed the full tag set once (single writer) and have every article seeder REUSE
    those tag ids. (`setup-demo-content.mjs` now emits the `ucm_content` + `workflow_associations` rows
    per article — see also #30 valid `images` JSON, #54 past `created`/`publish_up`.)
    QA-detect: design-review platform bugs P67 (ucm `core_catid` stale) / P48 (`com_tags` joins) / recurring `[TAG-ITEMS-EMPTY]`.
67. **Article-body code blocks are unreadable in dark — `<pre>` inherits Bootstrap's near-white
    surface.** A blog/single article whose prose contains `<pre>`/`<code>` (changelog, docs, tutorial)
    renders the code block on Bootstrap's default light `<pre>` background, which is near-white and so
    illegible on a dark page. **Fix:** ship an ALWAYS-dark `<pre>` rule for single-article prose (a
    fixed dark surface + light text in BOTH light and dark mode — a code block reads dark in either
    theme, like an editor) scoped to the article body (`.item-page pre`, `.article-prose pre`,
    `.nx-canvas-body pre`). Verify the computed `background-color` of a real article's `<pre>` is dark
    in both modes.
    QA-detect: design-review platform bug P60 / recurring `[ARTICLE-CODE-BLOCK-UNREADABLE-DARK]`.
68. **Seed with PDO prepared statements (creds from `configuration.php`), NEVER `mysql -N`.** Piping
    content through `mysql -N -e "…"` (or `ddev mysql -N`) **injects literal `\n` two-character
    sequences** into any field carrying newlines — article `introtext`/`fulltext`, module `content`,
    style `params` — so the stored HTML is corrupted (`\n` printed verbatim, broken markup). It also
    mangles quotes/UTF-8. **Fix:** do every demo/content write via a PDO (or mysqli) **prepared
    statement**, reading the DB host/user/password/prefix from the site's `configuration.php` (don't
    hard-code, don't echo creds). Keep each write **idempotent** (UPSERT / delete-then-insert on a
    fixed id) so the quickstart seed is reproducible. **Verify:** after any body write, assert the
    stored field contains **0 literal `\n`** (`SELECT introtext LIKE '%\\n%'`). (Reinforces the
    repo read-only-DB policy: content writes are explicit operator steps, never auto-run.)
    QA-detect: design-review platform bug P31 (`mysql -N` round-trip corrupts newlines to literal `\n`).
69. **The newsletter widget must be a real Acymailing install — not a dead static form (headless
    recipe).** A footer/CTA "subscribe" form that posts nowhere fails review (principle: functional
    widgets = real extensions). Install **Acymailing** and render `mod_acym`. **Headless gotcha:** the
    Joomla 6 admin **Discover GUI 302-redirects** in automation, so install from the CLI:
    `php cli/joomla.php extension:discover` then `extension:discover:install` (after dropping the
    package under the discover path). Post-install seed the **2 default subscriber fields** (name +
    email), copy the `com_acym` `.ini` language files into `language/en-GB/` so admin strings resolve,
    and set the list to **single opt-in** (no confirmation email needed for the demo). Then the footer
    newsletter is a live `mod_acym` module, editable in the admin. (Cross-ref `demo-content.md` §3 and
    `provision.md` for the extension fetch.)
70. **Section visuals = swappable media-field images exported from the `.pen` DARK frame at 2×
    display size — not hand-drawn SVG/CSS, and strip the template's border/shadow off the `<img>`.**
    (Build-time companion to SKILL "complex visuals → images".) Export each complex visual (code panel,
    dashboard, chart) from the design's **dark** frame (reads on both themes) at ~**2× the displayed
    width** for retina, set as a `media` field the owner swaps. **Border trap:** these exports carry
    baked panel chrome inside **transparent alpha padding**, so the template's default image
    `border`/`box-shadow` traces the *padding* rectangle, not the artwork — a stray frame offset from
    the visual. **Fix:** `border:0;box-shadow:none` on the section `<img>`, and set the **intrinsic
    `width`/`height`** (read via PHP `getimagesize()`) so the browser reserves the right box (no CLS).
    If the export ALREADY includes panel chrome (window bar / tabs), don't wrap it in a second window
    frame — render the bare `<img>`. (See #62 for the related `figure figcaption` dark-bar leak.)
71. **The megamenu `type` + settings live in the DB style params `navigation_menu_type` +
    `navigation_mega_settings` (per style) — setting only `etc/navigation/default.json` does nothing.**
    Refines #3/#27 with the exact param keys: for the megamenu to render as a mega (not a plain
    dropdown) the **active template style's `params`** must carry **`navigation_menu_type`** (the
    profile that selects mega rendering) AND **`navigation_mega_settings`** (the id-keyed column
    config). Seed BOTH keys into `#__template_styles.params` for every style that uses the menu — the
    `etc/navigation/*.json` file is only the admin-builder source (#3). Keep the mega **plain text &
    100% UI-editable**: no rich `mod_custom` CTA/featured/promo panels and no per-item icons (those
    can't be edited in the T4 Megamenu builder). And remember **`mod_menu` silently drops any item
    with `menu_show=0`** (#25) — an item missing from the mega is usually hidden, not mis-seeded.
72. **Three encoding traps that silently break the megamenu and every ACM block — all found live on
    ja_meridian.** Each fails *quietly* (a 500 with a useless message, or the wrong template rendered)
    and none is guessable from the file contents.
    - **`navigation_mega_settings` is a JSON *STRING* inside `#__template_styles.params`, not a nested
      object.** Writing it as a real nested structure (the obvious thing when you build the params in
      PHP and `json_encode` the whole array) makes T4's mega renderer fatal with
      **`Cannot use object of type stdClass as array` on EVERY page** — the whole site 500s, and the
      message names no file. Encode the settings to a string first:
      `$p['navigation_mega_settings'] = json_encode($settings);` then encode `$p`. Same for the
      companion file `etc/navigation/<profile>.json`, whose shape is
      `{"menu_type":"mainmenu","mega_settings":"<json string>"}` — **not** `{"mega_settings":{…}}`.
      Copy the shape from `etc/presets/default.json` before writing either one.
    - **`mod_ja_acm` reads its style from INSIDE the block's own data, not from a module param.**
      `ModJAACMHelper::__construct()` sets `$this->data = $config[<block>]` and `findParam()` searches
      **only** `array_keys($this->data)`; `getLayout()` then does
      `find('tmpl/'.$this->layout.'.php') ?: find('tmpl/style-1.php')`. So a top-level
      `"jatools-layout-<block>":"style-2"` module param — which is exactly what the admin field
      `field-jaacm-select-layout.php` posts — is **never read**, and the block silently renders
      **style-1** with your style-2 data. When seeding ACM modules by SQL/PDO, write the key inside
      the block object too:
      `{":layout":"hero","hero":{"jatools-layout-hero":"style-2", …fields…}}`.
      Symptom: correct copy, wrong markup/classes — verify with
      `grep -o 'acm-<block> style-[0-9]'` on the rendered page, never by trusting the params.
    - The whole `jatools-config` value is itself a **JSON string** in `#__modules.params`.
73. **Moving menu items between menutypes is how you get clean URLs — re-parenting alone is not.**
    A page whose menu item is a CHILD of another item inherits that item's path
    (`/technology/contact`, `/technology/search`). Real JA navs put the mega's link list under the
    mega trigger, so every *other* destination must live at level 1 — of `mainmenu` if it is in the
    top row, otherwise of the menutype the footer renders. Use the Joomla `Menu` table
    (`setLocation($parent,'last-child')` + `rebuild()`), never hand-edited `lft`/`rgt`. Re-list a desk
    in a second nav slot with a **Menu Item Alias**, so there is one canonical Itemid and one URL —
    that satisfies both the design and the "no duplicate items → same page" hygiene rule.
    - **`etc/navigation/<profile>.json` is the OFF-CANVAS config too — merge, never overwrite.**
      Besides `menu_type` + `mega_settings` the profile carries `oc_enabled`, `oc_pos_name`,
      `oc_pos_style`, `oc_effect`, `oc_menu_effect` (`"drill"`), `oc_rightside`, `oc_showlg`,
      `mega_effect`, `mega_showsm` and `option_breakpoint`. A seeder that writes the file fresh with
      only the two mega keys **removes the entire mobile drawer from every page** — and the site
      still returns HTTP 200, so nothing fails loudly. Read the file, set the two keys, write it back.
    - **A `jalist` field is stored COLUMN-oriented**, not as a list of row objects:
      `{"btn-title":["a","b"],"btn-link":["x","y"]}` — not `[{"btn-title":"a",…},…]`. Seed it the
      wrong way round and `getRows('data.<field>')` returns 0, so the block renders its wrapper and
      **no rows at all**. Related: **`getRows('data')` (no sub-field) counts the number of FIELDS,
      not rows** — `acm/contact-info` and `acm/statistics` both used the bare form, silently capping
      them at 3 items forever regardless of what the owner entered. Always
      `getRows('data.<primary-field>')`.
74. **Validating `#__modules.params` as JSON is NOT enough — the ACM config is a SECOND JSON
    document nested inside it, and a broken one fails SILENTLY with HTTP 200.**
    `params` is JSON; `params['jatools-config']` is a JSON **string** holding the whole block
    config. If the inner document is malformed, `json_decode` returns null, `findParam()` finds
    nothing, `ModJAACMHelper::get()` hands null to `decode()` → `str_replace(): Passing null to
    parameter #3` in the PHP log — and the module renders **empty**, so T4 drops the empty row and
    the page is simply **missing a whole band**. No 500, no visible error, correct HTTP 200.
    Three separate page-verifier agents independently reported "the CTA band is missing" /
    "the membership split is absent" on three different pages before the shared cause was found.
    - A validator that only decodes the outer blob reports **0 bad rows** while three modules are
      broken. Decode **both** levels:
      `json_decode(json_decode($params,true)['jatools-config'] ?? '{}')`.
    - The usual way to break it is a **string-based URL rewrite** (SEF → `Itemid`) run over the raw
      params blob. Inside the nested string every `/` is escaped as `\/`, so replacing `/culture`
      yields `\index.php?Itemid=105` — `\i` is not a legal JSON escape. It also fires **inside image
      paths** (`images\/meridian\index.php?Itemid=105\/gallery.jpg` was `…/meridian/culture/…`), so
      the repair has to map the Itemid back to the menu path, not just strip the backslash.
      Never string-replace links in params: decode → walk the structure → re-encode.
75. **Module titles are not unique, and for several module types the title IS the visible content.**
    `mod_menu` and `mod_articles_*` render `$module->title` as the widget heading, so a sidebar
    widget legitimately shares the title "Sections" with a footer menu column. A seeder that
    looks a module up by title alone will find the wrong one — matching `'Sections'` and updating
    its `position` moved the **footer column** into the sidebar and deleted a footer nav.
    Key on `title + position` (or the module id), and make the helper **throw** on more than one
    match rather than silently taking the first row.
    - Corollary for the naming convention: `[<Tpl>] <Page> - <Section>` is right for modules whose
      title is hidden, but **wrong wherever the title renders as the section label** — those must be
      named the way they should read ("Technology", "Most read this weekend"), or the page shows
      `HOME - DESK COLUMN (TECHNOLOGY)` to visitors. Set `note` for the dev-facing label instead.
76. **Positions must exist in a layout JSON before a module can render there.**
    Publishing to `main-bottom-2` when every `etc/layout/*.json` only defines `main-bottom-1` gives
    a published, correctly-configured module that renders nowhere — again with no error. Grep the
    layout JSONs for the position name before seeding, and order within one position instead of
    inventing a second: `ordering` 1, 2, 3 in the same `main-bottom-1`.
77. **A T4 mega panel only renders items that are DESCENDANTS of the item that owns the panel**,
    even though `navigation_mega_settings` lists explicit item ids. Re-parenting a desk elsewhere in
    the tree for a cleaner URL therefore silently drops it from the panel (15 links → 12). Keep the
    real item where the URL should be and add a **Menu Item Alias** under the mega owner, then point
    the column at the alias id — the same pattern the other columns already use.
78. **A `.pen` file holds a COMPONENT LIBRARY beside the page frames — reading a value off a kit
    component and filing it as a page defect produces confident, precisely-specified, wrong findings.**
    In `ja_meridian.pen` the reusable kit sits in its own canvas region (e.g. `D6Xu9` "Form/Search
    Bar" at x=4650, y=-3540). A verifier measured that component and filed two defects: the search
    field is "missing its leading 16px Lucide `search` icon" and its card "should have
    `0 6px 20px #0F111714`". **Neither is in the design.** The pages instantiate `y3qox` / `CIxan` /
    `hyjbk`, which contain the placeholder text and nothing else, and carry `stroke $border 1px`
    with **no effect**. Someone then "fixed" the page to match the kit, adding a shadow the design
    never had — the real defect turned out to be the *opposite*: `/search` had a shadow its
    identical 404 twin did not.
    - Before treating a node as spec, confirm it is **reachable from a page frame**. `batch_get` on
      the page frame and walk down; if the node only appears in the kit region, it is a library
      definition, and the page's own instance is what the design says.
    - Corollary: kit components are frequently *richer* than their page instances (they show every
      slot). "The page is missing X that the component has" is the signature of this error.
79. **Re-measure at the moment of fixing; never trust a residue list.** Across three review waves,
    five separate items on a fix list were already correct when the fixer looked — the list had been
    written from earlier agent reports, and the fixes had since landed. Two more were measured
    against a **stale `media/t4/optimize/` bundle** and reported values the source no longer
    produced. Fixing those would have moved correct values *away* from the design.
    - Every execute brief should say: confirm the live value and the pen node yourself before
      editing, and report "already correct" as a valid outcome.
    - Worse than a stale list is a **stale comment**: one CSS file asserted "this IS the .pen mobile
      value" next to a value that was not. The next agent trusts a comment more than a ticket.
      When you correct a value, correct the comment that defended it.

80. **A full-width mega panel hung from the header leaves a hover gap, and T4 closes the panel while
    the pointer crosses it.** `megamenu.js` opens on `mouseenter` of the top `<li>` and closes on
    `mouseleave`. The stock panel is a child of the `<li>` and starts at the `<li>`'s bottom edge, so
    there is no gap. The moment a design wants the panel **edge-to-edge under the header** you make the
    `<li>`/`.navbar-nav`/`.t4-megamenu` `position:static` so the panel resolves against
    `.<tpl>-header` — and now the panel's top is the HEADER's bottom while the `<li>` ends at the nav
    row's bottom (Northgate: link bottom 91px, panel top 117px → 26px of plain header). Every pixel of
    that strip is outside the `<li>`, so crossing it fires `mouseleave` and the panel is gone before
    the click. Forced-open screenshots, `elementFromPoint` over the panel, and `page.click()` on the
    trigger all pass — only a real pointer path fails, which is why three review waves missed it.
    **Fix (CSS only, no JS timer):** bridge the strip with pseudo-elements that are DOM children of the
    `<li>` so hovering them is still "inside":
    ```scss
    .<tpl>-header .t4-megamenu .nav-item.mega > .nav-link { position: relative; }
    .<tpl>-header .t4-megamenu .nav-item.mega.show > .nav-link::after {   // under the trigger
      border: 0; content: ''; display: block !important; height: 32px; left: 0; margin: 0;
      position: absolute; right: 0; top: 100%; vertical-align: baseline;
    }
    .<tpl>-header .t4-megamenu .nav-item.mega > .dropdown-menu.show::before {   // above the panel
      bottom: 100%; content: ''; display: block; height: <gap>px; left: 0; position: absolute; right: 0;
    }
    ```
    Two traps inside the fix: Bootstrap's `.dropdown-toggle::after` is the CARET — it carries
    `margin-left`, `vertical-align` and `border` that shove the bridge 9px down and off the gap (zero
    them); and a template rule that hides the caret (`.nav-link::after { display:none }`) also hides
    the bridge (hence `!important`). Keep the trigger bridge as wide as the link only, so neighbouring
    links stay clickable; the panel bridge may span full width because it sits BELOW the nav row.
    **Verify:** `scripts/review/mega-hover.mjs <url>` at the desktop bp and at 1024, per language —
    `survivesDrop`, `reachesLink`, `clickNavigates` all true, `gapPx` reported. Contract:
    `blocks-and-elements.md` §5d. Class: recurring-defects `[MEGAMENU-HOVER-DEADZONE]` (2nd cause).

81. **Built ON a quickstart, not on a blank: the base's DEFINITIONS survive without a single row
    pointing at them, and nothing that hunts "Blank" or docroot junk sees them.** #43 strips
    foreign-component overrides, #45 greps `T4_BLANK|Blank`, the Q1 scrub removes screenshots and
    `.playwright-mcp/` — all three are blind to what a *base quickstart* leaves behind: its ACM block
    dirs (still offered in the admin, styled for ITS design system), its `etc/layout|site|theme|
    navigation/*.json` (still selectable on every style), overrides for components with no menu item,
    the base template itself still installed beside yours (its style still in the menu-item dropdown),
    `css/styles/<base>.css`, its `template_preview.png`, and — the one that reaches the customer's eye
    first — `TPL_<TPL>_XML_DESCRIPTION` copied verbatim, so the Templates screen says "Tracy Base is a
    responsive…" under your template's name, with the base's author, copyright and creation date.
    None of it contains "Blank"; none of it is junk at the docroot. Measured on tracy_business
    (2026-09-13): 18 ACM dirs, 8 layouts, 6 profiles, 5 overrides, 2 css, 1 template, the description,
    the author and both thumbnails. **Fix:** Phase 10 Q1a, `scripts/quickstart/prune-audit.mjs` —
    every row is decided by a measurement (rows in any state, style params, menu links, sha256,
    manifest field equality with the base's `manifest_cache`), so it works for any base, not a
    named one. Run it **before** `extension:remove` of the base (the identity comparison needs the
    base's manifest), then again after `--apply` until 0 PRUNE. Companion: the description text is
    compared with the base's resolved `.sys.ini` value, not grepped for a word.
