# Customize your site — what a template must provide for Tracy

Tracy builds a customer's site from a published quickstart and asks seven questions first: business
name, logo, favicon, one line about the business, pages, site language, tone. Four of them write into
places **the template** provides. A template without those places passes every other review — the demo
logo, icon and name are all there — and only fails when a customer's answer has nowhere to go: the demo
logo on their site, a light logo on a dark header, "© 2024 JA Something" under their name, a tab that
says "Home". Each rule below is one of those, measured on the JoomlArt catalogue (TracyHQ/tch#1013).

`scripts/quickstart/brand-ready.mjs` checks every rule. Run it at Phase 9 (template) and Phase 10
(with the demo database); it must print `READY` before the quickstart is cut.

```bash
node scripts/quickstart/brand-ready.mjs --template <site>/templates/<tpl> --fix
node scripts/quickstart/brand-ready.mjs --template <site>/templates/<tpl> --webroot <site> \
  --sql-cmd "ddev mysql -N -B" --prefix <prefix>_
```

`--fix` writes the three mechanical parts (field, strings, profile keys); every other row names its fix.

## 1. Logo — a light/dark pair, the site name when there is none

**Where it lives.** T4 profile `etc/site/<profile>.json`: `site_logo` (light background, or the only
logo), `site_logo_dark` (dark background), `site_logo_small` / `site_logo_dark_small` (phones). Tracy
writes the customer's PNGs into the profile the default style uses.

**What the template does** (the JA Nova pattern, now in every re-released JoomlArt template):

| Rule | How | Row |
|---|---|---|
| The header logo element prints `site_logo` in `.d-light` and `site_logo_dark` in `.d-dark` | `html/layouts/t4/element/logo.php` from the shared layer | `logo-pair` |
| The off-canvas drawer does the same | `html/layouts/t4/layout/offcanvas.php` from the shared layer | `drawer-pair` |
| A logo with no dark counterpart shows the **site name as text** in dark mode; no logo shows the name in both modes | the same two files | — |
| The admin has a "Logo Dark Image" field | `site_logo_dark` + `site_logo_dark_small` media fields in `<fields name="typelist-site">` of `templateDetails.xml` | `logo-field` |
| …with readable labels | `TPL_T4_SITE_DARK_LOGO`, `TPL_T4_SITE_LOGO_DARK_DESC`, `TPL_T4_SITE_LOGO_DARK_SMALL`, `TPL_T4_SITE_LOGO_DARK_SMALL_DESC` in `en-GB.tpl_<tpl>.ini` | `logo-strings` |
| **Every** profile carries the key, empty when the demo has no dark logo | `"site_logo_dark":""` in each `etc/site/*.json` | `profile-keys` |
| The dark hook switches the pair | `.navbar-brand .d-dark { display: none }` and its dark-mode inverse, compiled into `template.css` (shared layer `scss/_chrome.scss`), so it holds on pages that do not load `darkmode.css` | `pair-css` |
| An upload keeps its proportions inside the design's logo height | `max-height: var(--tracy-logo-height, 32px)` on `img.logo-img`; set `--tracy-logo-height` in the style's tokens to the height the source draws its logo at | `logo-height` |
| **Nothing in CSS repaints or swaps the logo** | no `filter` (invert, brightness, grayscale…) and no `content: url(…)` on a logo selector, in any mode. A dark logo is site data, never a stylesheet | `logo-css` |

The name as text takes the chrome's colour (`var(--fg)`), so it reads on whichever ground the header has.
The demo may ship its own dark logo (a file under `templates/<tpl>/images/`, set in the demo profile):
then the customer's light logo replaces it only together with their own dark one.

The template's **own** SVG mark is inlined (it inherits `currentColor` and follows the theme), but only
while no dark logo is set: the moment one is, the pair takes over.

**Footer or other logo spots.** A footer that shows the logo uses the same pair, or — when the footer
is dark in both modes — `site_logo_dark` alone with the site name as fallback. Never a logo typed into
a custom module's HTML: Tracy cannot replace it.

## 2. Favicon — only through T4

T4 prints `other_faviconFile` from the profile; empty keeps the template's own icon (`favicon.ico` at
the template root). Tracy writes the customer's square PNG into `other_faviconFile`.

- No `<link rel="icon">`, `addFavicon()` or `addHeadLink(…, 'icon')` in `index.php`, the other entry
  points or `html/**` — a second icon is a candidate the browser may pick over the customer's. Row `favicon`.
  The standalone pages (`error.php`, `offline.php`, `component.php`) render without T4 and may link
  `favicon.ico` themselves; the row prints a NOTE for them (the customer's icon does not reach an error
  page unless that page reads `other_faviconFile`).
- A template that overrides `params/typelist-site.xml` keeps `other_faviconFile` in it
  (`recurring-defects.md`, the `site-other` fieldset).

## 3. Business name — tab, header, copyright

- **Header**: the logo element above prints the name whenever there is no picture: T4's profile
  `site_name`, else Global Configuration › Site Name. Tracy writes the customer's name to both.
- **Browser tab**: the home menu item sets *Page Display › Browser Page Title*, or Global Configuration
  › *Site Name in Page Titles* is on. Otherwise the home tab says "Home" and the customer's name never
  reaches it. Row `home-title`.
- **Copyright**: the core **Footer** module (`mod_footer`) prints the year and Site Name. A © line typed
  into a Custom module keeps the demo's name on the customer's site. Row `copyright`.

## 4. Pages — ship `tracy_site_pages.json`

Tracy's Pages question lists the pages a customer may keep or hide, from a file attached to the release
beside the quickstart: `{ "pages": [{ "id", "label", "home"?: true }] }`, exactly one `home`, ids unique.
For Joomla the list is the published, guest-visible **level-1 items of `mainmenu`** (title + alias; the
home item is `home: true`), so keep the main menu to the pages a visitor sees — utility pages
(`typography`, `login-form`) belong in another menu.

Write it from the packed database with the `tracy-dev` plugin's site-pages tool, read the warnings it
prints (skipped items, utility-looking pages), then attach it to the release:

```bash
tracy-dev site-pages --joomla <database.sql.gz | installer.zip> --out <release-dir>
tracy-dev site-pages --joomla <same input> --check <release-dir>/tracy_site_pages.json   # ok: N pages resolve
gh release upload <tag> <release-dir>/tracy_site_pages.json --repo JoomlArt-Products/joomlart-products
```

The tool is `TracyHQ/tracy-template-dev` PR #1 (`feat/site-pages-file`, plugin 0.8.0); until it merges,
run it from that branch. The `quickstart` skill of the same plugin writes the file into every pack it builds.

## 5. Checklist before the quickstart is cut

- [ ] `brand-ready.mjs --template … --fix` → `READY` (template rows).
- [ ] `brand-ready.mjs … --sql-cmd …` (or `--data`) → `home-title` and `copyright` OK.
- [ ] Light and dark, desktop and phone, three states seen in the browser: a light/dark pair, a light
      logo only (dark mode shows the name), no logo (the name in both modes).
- [ ] `tracy_site_pages.json` written, its warnings read, attached to the release.
