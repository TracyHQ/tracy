# Chrome and navigation — header, footer, mega menu, account

> **Phase 3 packet (chrome).** Read when building `parts/header.html`, `parts/footer.html`, the mega menu block and
> the `wp_navigation` menus. Prerequisite: the spec-pack has passed its gate; `menus.json` (from `from-joomla`) or
> `page-map.menus[]` already has the menu tree.

Every theme path below belongs to the **overlay** `packages/cms/tracy-wordpress-theme/overlays/tracy-base/`;
the generated tree `src/tracy-base/` is not edited by hand ([`templates-and-patterns.md`](templates-and-patterns.md) §1).

## 1. Template parts — two files, declared in `theme.overlay.json`

WordPress only reads parts **directly in `parts/`**, no subfolders
([`wordpress-anatomy.md`](wordpress-anatomy.md) §2). `tracy-base` has exactly two:

| Part | File | `templateParts` (theme.overlay.json) | Called from a template |
|---|---|---|---|
| header | `parts/header.html` | `{ "name": "header", "title": "Header", "area": "header" }` | `<!-- wp:template-part {"slug":"header","tagName":"header","className":"tracy-header","area":"header"} /-->` |
| footer | `parts/footer.html` | `{ "name": "footer", "title": "Footer", "area": "footer" }` | `<!-- wp:template-part {"slug":"footer","tagName":"footer","className":"tracy-footer","area":"footer"} /-->` |

A part is **pure block markup**, no PHP — so strings in a part cannot be translated; text that needs i18n must live
in a PHP pattern (`<!-- wp:pattern {"slug":"tracy-base/section-social-links"} /-->` in the footer is an
example). The site owner edits parts in the Site Editor; the edit is saved as a `wp_template_part` post and **overrides** the theme
file — so a fix to `parts/*.html` after the customer has edited it does not reach them.

## 2. Header — components (measured on `parts/header.html`, commit `c372bfa56`)

```
.tracy-header__inner (flex, space-between)
├─ .tracy-header__brand   core/site-logo {width:32, shouldSyncIcon:false} + core/site-title {level:0}
├─ .tracy-header__menu    core/navigation {overlayMenu:"mobile", NO ref}
│                         + tracy-base/mega-menu ×3 ("Services" · "Resources" · "Company")
└─ .tracy-header__actions core/buttons ("Talk to sales" → /contact)
                          + core/html: <button class="tracy-theme-toggle" data-tracy-theme-toggle …>
```

- **Site identity** = `core/site-logo` (reads the `custom_logo` theme mod) + `core/site-title` (reads the
  `blogname` option). The seeder sets the logo through `custom_logo`, the name through `blogname`; do not type the site name into the part.
- **`core/navigation` without `ref`** → WordPress takes the **newest** `wp_navigation` (`WP_Navigation_Fallback`,
  [`inputs/from-joomla.md`](inputs/from-joomla.md) §5). With a single menu it works; with several menus
  (Tracy Base j6 has `tracy`, `tracy-utility`, `tracy-onepage` on the site side) the seeder **must write `ref`**
  into the block after creating the post — or accept "the last menu created wins", which nobody wants. The three
  `core/navigation` blocks in the footer are in the same situation: without `ref` → all three show the **same** menu; the three-column footer
  Product / Resources / Company is only right when each column points to its own `wp_navigation`.
- **The seeder fills `ref` by NAME, not by position** (since 14/09, `seed.mjs` step 8). A
  `core/navigation` block in a part carrying `"metadata":{"name":"nav.<menutype>"}` receives the `wp_navigation` post of
  exactly that menutype in `menus.json` (the site's default locale — a part is one for the whole site; secondary
  locales go through the theme's `render_block_data` filter, which switches `ref` to `<menutype>-<lang>` by
  `pll_current_language()` — [`i18n-polylang.md`](i18n-polylang.md) §3). A block **without** a name takes the old path: the header
  takes `tracy`, the footer takes the `footnav-*` columns in order — Tracy Base's parts have no names, so nothing
  changes. A name with no matching menu → the block stays as is (WordPress's "newest" fallback) and
  `report.notes` records `part`, `nav.<menutype>`. Why it is needed: `wp-tracy-business` has **two** navs in the
  header (`nav.topbar` = Careers/Investors, `nav.tracy` = the main row) and **two** in the footer
  (`nav.footer-company`, `nav.footer-contact`); filling by position put the main menu in the topbar, the second block
  without `ref` showed the last menu created — a Russian footer column — and the Contact column received `footnav-1-ru`.
  Measured on the first render run of Northgate → WP, 14/09.
- **Mobile:** `overlayMenu: "mobile"` — below the block's breakpoint, the navigation collapses into a button that opens an overlay
  (7.0 allows building the overlay with blocks/patterns in the Site Editor —
  [`wordpress-anatomy.md`](wordpress-anatomy.md) §1). `mega-hover.mjs` runs at 1440 and 1024; at 390 the mega
  block is **not** inside the navigation's overlay (it is a sibling block, not a child) — the show/hide rule
  is in `assets/css/tracy-base.css` (`@media` around line 355). Check with `scripts/shoot.mjs` 390.
- **Body class:** `inc/extra.php` removes every `tracy-nav-*` that the base theme adds (the `apple` archetype declares nav
  `overlay` in `inspirations.json`, making the header **float** over the home page and painting the text in the background colour) and pins
  `tracy-nav-top-left` — because j6's header is a bar. Gotcha #7.

## 3. Mega menu — the theme's block `tracy-base/mega-menu`

Q11 (settled by Lee 13/09): a multi-column panel under the header, "Latest from the blog" is a Query Loop, Search is
`core/search`, opened by hover/focus/click; columns and links are **block content** edited in the Site Editor; the frame
and behaviour are the theme's own block. Theme Review treats custom blocks as plugin territory → **not targeting
wordpress.org**, recorded in `readme.txt`.

**The mega block owns its label.** An HTML source often has that same dropdown in the menu (`menus.json`:
a top-level item "Resources" with 16 children); seeding both makes the header draw "Resources" twice (measured 14/09 on
Northgate). The seeder reads the theme's `parts/header.html`, takes the label of every `wp:<theme>/mega-menu`, and drops the
top-level item with the same label from the default-locale menu — menus in other locales drop **the same position** (the label is
translated). Each drop leaves a note in the report. Without a mega block the menu keeps the source dropdown.

| File (`blocks/mega-menu/`) | Job |
|---|---|
| `block.json` | `name: tracy-base/mega-menu`, `apiVersion: 3`, attribute `label` (default "Menu"), `render: file:./render.php`, `editorScript: file:./editor.js`, `supports.html: false` |
| `render.php` | wrapper `.tracy-mega.has-child[data-tracy-mega]` → `button.tracy-mega__trigger[aria-expanded][aria-controls]` + `div.tracy-mega__panel.wp-block-navigation__submenu-container` containing `$content` |
| `editor.js` | plain script on `wp.*` (no JSX, no build); in the editor the panel is **always open** and in the flow (`tracy-mega--editing`); `InnerBlocks` with a two-column template (heading + list · heading + paragraph), `templateLock: false`; `save` = `InnerBlocks.Content` |
| `editor.asset.php` | hand-written dependencies (`wp-blocks`, `wp-element`, `wp-block-editor`, `wp-i18n`) — no build step generates it |
| `assets/js/tracy-base-mega.js` | **the whole behaviour contract**: opens when the pointer enters the block after 60 ms, on focus into the trigger, on trigger click; closes when the pointer leaves the block after 220 ms (enough to cross the header's bottom edge), on Escape (focus returns to the trigger), click/touch outside, focus leaving the block, another block opening. There is no `:hover` rule in the CSS — `is-open` is the only switch |

The class names `has-child` and `wp-block-navigation__submenu-container` **deliberately** match the navigation block's: that
is the item → trigger → panel contract that `scripts/review/mega-hover.mjs` drives with a real pointer, and core scopes
every rule for those names under `.wp-block-navigation`, so outside it they paint nothing.

Registered in `inc/extra.php` — **with a guard** `is_readable(blocks/mega-menu/block.json)`: `register_block_type()`
given a path that does not exist treats it as a block **name** and logs a notice on every request (gotcha #6).

**Measure:**

```bash
node scripts/review/mega-hover.mjs http://127.0.0.1:8227/ --items '.tracy-mega'
node scripts/review/mega-hover.mjs http://127.0.0.1:8227/ --items '.tracy-mega' --viewport 1024
```

The default `--items` is `.wp-block-navigation .wp-block-navigation-item.has-child` (the navigation block's submenus);
for the mega block pass `'.tracy-mega'`. **The trigger is the button that opens the panel, not the label**: `--trigger`,
when declared, is the **only** trigger — an item it does not match gets `FAIL (--trigger "…" matches nothing in the item)`,
with no fallback to a guessed button (a wrong contract still PASSing is fail-open). Undeclared, it is `:scope > button[aria-expanded]`,
`:scope > button`, and only last `:scope > a` — a
"link + button" item (the navigation block's submenu, JA Vega's `.jv-mega`: `<a>Our Services</a><button>`) clicked
on the label link leaves the page and the walk dies with "Execution context was destroyed" (JA Vega M4, 31/31 pages). A link that navigates
away is only hovered, never clicked. The panel is `--panel` or `:scope > .wp-block-navigation__submenu-container`;
visual-qa passes both from the contract's `interactions.mega`. "Open" is measured by the panel being **drawn** (display/visibility/
opacity/size), not by a class; close/open are **waited for with a bound** (Escape closing after a 300 ms transition still
counts as closed), reopening after Escape by leaving the item and coming back (`reopens`). The panel link clicked is the first link that does **not** point at the page currently shown (with or without `aria-current`). An item whose walk throws → a
`FAIL (walk error)` row with the error, no crash. Exit 1 when any item FAILs; exit 2 when the URL is missing or a declared flag
has no value (`--trigger` at the end of the line is not "undeclared" — it would take the fallback trigger and could PASS). Tracy Base run: PASS ×3 (STATUS
phase C). Forcing open with a class only proves the style — it does not prove the mouse can get in.

## 4. Menus are data: `wp_navigation`

Menus **do not live in the theme**. Each Joomla site menu (`client_id 0`) → one `wp_navigation` post, `post_content`
being `core/navigation-link` / `core/navigation-submenu` / `core/home-link`. A link to an internal page uses
`kind: post-type` + the page's `id` — only then does WordPress mark the page being viewed (`current-menu-item`) and
the theme can underline it; a custom URL is never marked (`packages/cms/tracy-wordpress-theme/README.md`
§Content contract). The source menu tree: `menus.json` (`label`, `type`, `url`, `page`, `children`; for a gap `url`
is `redirectTo`). Seeder: [`demo-content.md`](demo-content.md) §3.

**State as of 13/09, to be reviewed at 8b:** `parts/header.html` currently carries the mega columns as `core/list`
with hand-typed `<a href>` and a `core/buttons` "Talk to sales"; `parts/footer.html` has the text "All rights
reserved. Built with Tracy." They are editable in the Site Editor (part), but per
[`editability-standards.md`](editability-standards.md) §3 menu links must be a navigation block pointing to
`wp_navigation`, not `<a>` in a list. This is an open item, not decided — do not read the current part as the standard.

## 5. Account links: seeded page first, `wp-login.php` fallback (Q9)

An account menu item links to the page seeded for its view whenever the page-map has one (`page-login`
/ `page-register` / `page-account` / `page-password`); the core targets below are the fallback for a view
with no seeded page. `buildNavigation` (`seed.mjs`) resolves the item URL first: a URL that resolves to a
seeded page becomes a page link (`type: page`, `id`, `kind: post-type`), because WordPress marks the
current menu item only when the link carries the id of the page being viewed, and the page built from
the page-map is where the source form is drawn. Only when no seeded page resolves does an account view
fall back to its core target (`ACCOUNT_URLS`); a URL with no view in the page-map stays a custom link
(#44).

Core targets for the five Joomla account routes (`sign-in`, `create-account`, `profile`,
`reset-password`, `forgot-username`): `/wp-login.php`, `?action=register` (only with
`users_can_register`, **off** by default on the stand), `?action=lostpassword`, `/wp-admin/profile.php`.
`forgot-username` folds into `lostpassword` (G6). The theme styles the login screen through the
`login_enqueue_scripts` hook — **not written** as of 13/09; the login form style guide is a named gap
(`content-gaps.md` G6). No plugin. In the spec-pack these routes are still the pages `page-login` /
`page-register` / `page-account` / `page-password` with the `core/loginout` starter (`VIEW_STARTER` in
`from-joomla.mjs`), so they are present in the verify matrix.

## 6. Breadcrumbs, sidebar, position

- Breadcrumbs: `content-gaps.md` G8 records "core has no block, dropped", but
  [`wordpress-anatomy.md`](wordpress-anatomy.md) §1 (7.0) lists a Breadcrumbs block in the Armstrong
  release post. The two sources disagree — an item to decide at 8b, nobody has measured it on a stand.
- A block theme has **no** widget areas / positions. A sidebar is `core/columns` in the template
  (`page-sidebar-left.html`); modules assigned per page become content in that page's `post_content`
  ([`inputs/from-joomla.md`](inputs/from-joomla.md) §Mapping table).
- Joomla chrome in positions `header*`, `footer*`, `footnav-*`, `mega-*`, `off-canvas`, `breadcrumbs`,
  `sidebar-*` **never goes into `post_content`** — the adapter excludes them with `CHROME_POSITION`; they are
  parts.

## 7. The brand: ready for Tracy's "Customize your site"

A customer of Tracy answers a business name, a logo (and one drawn for a dark background) and a
favicon. Tracy writes them through WordPress core and one option, **never by editing the theme**:
`blogname`, `site_logo`, `tracy_logo_dark` (attachment id of the dark-background logo) and
`site_icon`. A theme is ready when every place that draws the brand reads those. The conventions
live in `inc/brand-logo.php`, which every theme built from `src/tracy` ships (TCH
`packages/cms/tracy-wordpress-theme`, plan T27/T28); `functions.php` requires it.

- **Logo = a Site Logo block (`core/site-logo`)**, never an Image block, an `<img>` or an inline
  `<svg>` in a part. Every one carries `"shouldSyncIcon":false`: without it, saving the block in the
  editor copies the logo over the customer's site icon.
- **Say each spot's ground by class** (theme with dark mode):

  | Spot | Class | Shows |
  |---|---|---|
  | dark ground (a dark footer; the header in dark mode) | `tracy-logo-dark` or `<prefix>-logo--dark` / `<prefix>__logo--dark` | `tracy_logo_dark`; none → the site name as text, never the light logo |
  | light ground | `tracy-logo-fallback` or `<prefix>-logo--light` / `__logo--light` | `site_logo`; none → the site name as text |
  | either, with a Site Title printed beside it | add `tracy-logo-bare` | nothing when empty |

  A header that changes ground with the mode carries a pair (`x-logo x-logo--light` +
  `x-logo x-logo--dark`) and the theme's CSS shows one by `[data-theme]`, as JA Nova does. A header
  that keeps one ground in both modes carries one spot classed for that ground (JA Impact, JA Vega:
  navy/black headers). The text keeps the block's classes, so the swap hides and shows it alike.
- **Name:** a header without a logo spot keeps a Site Title block (`core/site-title`) — the name is
  then the brand (JA Essence keeps the name by design).
- **Copyright:** a Paragraph or Custom HTML block with `© {year} {site.title}` — the tokens are filled
  as the block renders. A demo name or year written into the line stays on the customer's site.
- **Favicon:** only core's site icon (`wp_site_icon`). Print no `<link rel="icon">` of your own, unless
  only while `has_site_icon()` is false (the template's own icon until the customer gives one).
- **Tab title:** block themes get `title-tag` support from core, so the tab reads the site name. Do not
  remove it, put a `<title>` in a template, or filter `pre_get_document_title` / `document_title_parts`
  / `wp_title` with fixed text; a filter that builds the title from `get_bloginfo( 'name' )` is fine.

**Gate:** `node scripts/review/brand-ready.mjs --theme src/<slug>` exit 0 (Phase 3 and again Phase 9).
It reads the built theme's files only; each finding is one line `rule · file · detail`. A dark-mode
theme with no dark-classed spot is a note — check it with `review/toggle-test.mjs`.
