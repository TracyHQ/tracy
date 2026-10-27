# Menu render, SEF clean URLs, and dynamic-data integrity

> **Phase P3 packet.** Read with `content-architecture-audit.md` — the systemic menu/routing/data
> layer a page-by-page CSS review misses. All fixes stay in-template + local DB under nested-set safety.

A page-by-page CSS review misses an entire class of defects that live in the MENU/ROUTING/DATA layer. A page
can look perfect at its canonical URL yet be broken when reached through the nav, have an ugly non-SEO URL,
or show hardcoded data. Audit these explicitly (phase P3). All fixes stay in the template + local DB (PDO),
under the nested-set safety rule.

## 1. Menu render — does every link render the DESIGNED layout?
A designed canvas page renders chrome-free fullwidth ONLY when its menu item is configured for it. The same
article reached through an under-configured menu item (e.g. a "Pages"-showcase mega item) renders the DEFAULT
article layout: a raw text blob + page-heading + author byline + duplicated breadcrumb + bands trapped in the
container (cut on the sides). **Root cause is usually a missing `component_id` and/or `template_style_id`/
`params.layout` on that menu item.**
- **Detect:** open EVERY page via EVERY link that reaches it — header nav, each mega-panel item, footer, CTAs
  — not just the canonical SEF URL. A chrome-blob ≠ the design.
- **Fix (safe):** set the menu item's `component_id` (+ `template_style_id` = the fullwidth style, +
  `params.layout`/`show_page_heading:0`) to match the canonical fullwidth item. JSON-merge params; don't clobber.
- Fix wrong targets too: a Blog/Category/Featured/Author menu item bound to an empty/wrong category renders
  "No articles" — repoint its `link` to a populated source.

## 2. SEF — clean URLs for SEO
- **Enable rewriting:** `configuration.php` `sef=true`, **`sef_rewrite=true`**, `sef_suffix=false`; and the
  site root **`.htaccess` must exist** (copy `htaccess.txt` → `.htaccess`). Without rewrite, URLs are
  `/index.php/pricing` instead of `/pricing`. Verify a real page renders at `/pricing` (no `/index.php`, no
  malformed `/index.phpx`). If a subdir/RewriteBase issue 500s, fix RewriteBase (usually `/`) or revert + report.
- **Clean aliases:** each page on a clean canonical alias (`pricing`, not `pricing-page`/`?Itemid=`), resolving
  collisions with header trigger items. One canonical URL per page (avoid duplicate content).
- **Link audit:** every link source must emit a clean SEF route via `Route::_()` (PHP) or a correct SEF href
  (DB/HTML). Kill `href="#"` dead links, `?Itemid=`-only, `/index.php`-prefixed, and malformed hrefs in
  overrides, dropdown helpers, CTAs, footer, and article bodies.
- **Dedupe:** where the same page is reachable via a canonical item AND a showcase item, prefer making the
  showcase item a Menu-Item-**Alias** of the canonical (if safe) or note rel=canonical as a follow-up — don't
  break a working render for SEO purity.

## 3. Dynamic data — per-record, filtered, not hardcoded
Templates often ship "author"/listing pages as static canvas with hardcoded personas + fake counts, and
article bylines that don't reflect the real author. The bar: **real, per-record, filtered, clickable.**
- **Authors:** real Joomla user accounts for the personas; articles distributed across them via `created_by`;
  the article authorbox shows that author's real name/role/bio/avatar (per-author data source — user profile
  fields or a per-user-id map, NEVER one hardcoded string); the author name+avatar LINK to that author's page;
  the author page FILTERS to only that author's articles with live counts; the author listing shows real
  authors + real counts each linking to its detail.
- **Detect (the hardcode smell):** open two different records — the data must DIFFER. If the byline/bio/count
  is identical across records, it's hardcoded.
- **Honest limits:** some design stats have no Joomla metric (followers/reads) — leave as mock + document; a
  real `com_content view=author` may not exist in the build — a clean `?author=<id>` query-param route that
  filters dynamically is acceptable (note it's not a per-author SEF slug).
- **Demo content quality:** rewrite off-brand quickstart leftovers (Lorem/placeholder titles) and replace
  off-theme demo cover images so the content matches the product; this is content polish, not a template bug,
  but it affects the "looks like the design" judgment — flag it.

## Safety recap
DB edits via PDO only (never `mysql -N`). Menu edits limited to `link`/`params`/`alias`/`type`/`component_id`/
`template_style_id`; never `menutype`/`published`/`parent_id`/`lft`/`rgt`/`level`; verify the megamenu still
renders + homepage 200 after each change; revert if broken.
