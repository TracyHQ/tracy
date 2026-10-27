# Template patches for quickstarts

The `tracy_business/` tree here is **not** the whole template — that template is a JoomlArt product
and lives inside the archive on the release; this repo does not keep its source. This folder keeps only
**the part Tracy changed**, at the same path it has in the webroot, so the next release cut can reapply it.

Same pattern as [`../overrides/`](../overrides) (the `com_contact` override): source files plus docs,
no script that copies them automatically. Whoever builds the quickstart applies them by hand to the webroot **before** packaging.

## How to apply

```sh
cp -R template-patches/tracy_business/.  <webroot>/templates/tracy_business/
cp -R template-patches/site-language/.   <webroot>/language/
cp -R template-patches/tracy/.           <webroot>/templates/tracy/     # Tracy Apple 1.3.0+
cp -R template-patches/tracy-base/.      <webroot>/templates/tracy/     # Tracy Base 1.0.1+ (do NOT apply to Apple)
cp -R template-patches/tracy-base-site-language/. <webroot>/language/ # Tracy Base 1.0.3+
```

⚠ `tracy/` and `tracy-base/` both land in `templates/tracy/` but are **two different templates with the same
element**: `tracy/` belongs to the Tracy Apple/Airbnb archive, `tracy-base/` belongs to the Tracy Base archive. Applying the wrong
one overwrites the other template's files. Tracy Base has no archive build script of its own: version 1.0.1 was
built with `tasks/tracy-base-theme-param/build-pack.py` (converts the 1.0.0 bundle exactly as the fleet does,
replaces exactly the files in `tracy-base/`, keeps the database unchanged). The `quickstart-overrides` gate compares each
file in `tracy-base/` with the `presentation-lock` of the **latest** `tracy-base/j6` profile — changing a file
here without cutting the next version and recapturing the profile turns the gate red.

The Airbnb artifact (`tpl_tracy_airbnb-j6-*.zip`) carries the SAME two files of `tracy/` (path `templates/tracy/` changed to
`templates/tracy_airbnb/`, as `package-design.py` does) — changing one side means repackaging the other.

Then clear the T4 cache (`media/t4/optimize/css`, `media/t4/optimize/js`) and `cache/`, since both CSS and JS
change.

⚠ The contract's `presentation-lock.json` hash-locks each of these files. After applying the patch you **must recapture
the hashes**, or the Claude Cowork plugin refuses every operation on a bound site.

## What is here, and why

| File | Why it was changed |
|---|---|
| `html/mod_languages/tb.php` | The switcher layout was written for 2 languages (one column, 190px panel). With 43 it is 1,935px tall, overflows the screen and cannot scroll. Now: ≤8 keeps the old dropdown, >8 opens a modal `<dialog>` at every width, with a filter box. |
| `js/tracy-business.js` | Opens/closes the dialog (`showModal` when modal, `show` when dropdown), filters the list, and marks `data-overflow` on the horizontally scrolling contact row. |
| `scss/_tracy-business-chrome.scss` | Source of the CSS below. **Edit this file first**; the two css files are build output. |
| `css/styles/tracy-business.css` | The copy the real page loads. The build machine has no `sass`, so the CSS block is copied here by hand — edit the SCSS and forget this file and the page does not change. |
| `css/template.css` | The other build output, kept in sync for the same reason. |
| `html/layouts/t4/element/logo.php` | Header lockup (monogram · name · slogan). The original reads `site_name`/`site_monogram`/`site_slogan` from `etc/site/tracy-business.json` — a hash-locked file, so the seed cannot change it and customer sites carry "Northgate" on every page. Now: when `plg_system_tracyidentity` is on, it prints the tokens `{site.name}` · `{site.monogram}` · `{site.slogan}` for the plugin to replace with the values of the `[Tracy] Site identity` module; with the plugin off it keeps the old path. See `tasks/todo-danh-tinh-site.md`. |
| `tracy/html/layouts/t4/element/logo.php` · `tracy/html/layouts/t4/layout/offcanvas.php` | Tracy Apple (and Airbnb). The logo is an SVG drawing the text "Tracy Apple", read from hash-locked `etc/site/*.json`; the menu drawer redraws that logo without going through the `logo` element. Now: when `plg_system_tracyidentity` is on, both print `{site.name}` (the header logo adds `{site.slogan}`) and drop the SVG, so the customer's name shows as text. With the plugin off they keep the old path. |
| `acm/tb-sys-social/tmpl/style-1.php` | Social cards on the Contact page. A URL can now be a token (`{social.tiktok}`): a card whose token has no value is **dropped entirely** (`Identity::isBlankToken`), and `https://` is not prepended to a token — the original only hid a card when the URL was empty, and when the layout runs the token has not been replaced yet, so it is never empty. The list of networks is changed in the DB by the `acm` rule of `identity/tracy-business-j6.json`. |
| `acm/tb-kit-email/tmpl/style-1.{php,xml}` | Wordmark/mark of the sample email: the fallback and default values are `{site.name}`/`{site.monogram}` instead of hard-coded `NORTHGATE`/`NG`. |
| `acm/tb-kit-slide-library/tmpl/style-1.php` | The cover slide and contact slide hard-coded `NG`, `NORTHGATE`, `sales@northgate-ind.ru · 8 800 550-67-90` in the HTML — now tokens. ⚠ An empty phone leaves ` · ` at the end of the line. |
| `etc/navigation/tracy-business.json` | `mega_settings` is keyed by **menutype**, and inside it points to `module_id` + `items` by id. Each language needs its own block with every id mapped. The original archive already has them for `tb-main-en` and `tb-main-ru`. |
| `tracy-base/index.php` · `tracy-base/theme-resolve.php` · `tracy-base/js/darkmode.js` | Tracy Base (Joomla, version 1.0.1). `?theme=dark\|light` in the address beats the `tracy-theme` cookie, the site default and the OS theme **for that one load only**, without saving it — that is how Tracy's Design inspiration preview frame asks for light/dark (it embeds the site from another origin so it cannot touch the cookie, and an iframe cannot change the inner page's `prefers-color-scheme`; measured 29/09/2026: version 1.0.0 ignored the parameter, the Light/Dark button did nothing). Three places share one rule: the paint-before-render script in `index.php`, `theme-resolve.php` (error/offline/component pages) and `darkmode.js` (does not let an OS theme change take it back). A site locked to light with the toggle off stays light. Test: `test/tracy-base-theme-param.test.mjs`. These three files were first committed in their 1.0.0 form (only `darkmode.js` went through the repo's formatter, no behaviour change), so the next commit's diff is just the fix. |
| `tracy-base/html/layouts/t4/element/logo.php` · `tracy-base/html/layouts/t4/layout/offcanvas.php` · `tracy-base/css/site-repairs.css` · `tracy-base/etc/site/*.json` · `tracy-base/templateDetails.xml` · `tracy-base/language/en-GB/en-GB.tpl_tracy.ini` | Tracy Base 1.0.2 (T31, `tasks/plan-ten-logo-favicon.md`). The inline SVG logo recolours itself with the theme, so it stays as is; the customer's image logo (PNG) is printed as a pair `site_logo` (`.d-light`) + `site_logo_dark` (`.d-dark`) in the header and the menu drawer; with no dark logo, dark mode shows the site name as text (Q7). The pair-swap rule lives in `site-repairs.css` (a file that is always loaded). The three site profiles have an empty `site_logo_dark` key for the brand writer to fill; `templateDetails.xml` declares two Logo Dark fields for the admin. |
| `tracy_business/html/mod_custom/default.php` (new) · `tracy_business/css/{template.css,styles/tracy-business.css}` · `tracy_business/scss/_tracy-business-chrome.scss` · `tracy_business/etc/site/tracy-business.json` · `tracy_business/templateDetails.xml` · `tracy_business/language/en-GB/en-GB.tpl_tracy_business.ini` | Dark-background logo (T31, `tasks/plan-ten-logo-favicon.md`). The customer's image logo in the header is printed as a pair `site_logo` (`.d-light`) + `site_logo_dark` (`.d-dark`); with no dark logo, dark mode shows the lockup (monogram + name, Q7). The footer is dark in both modes: when the site has a logo, the `mod_custom/default.php` override replaces `div.tb-footbrand__lockup` of the "Footer - Brand" module (one module per language) with `site_logo_dark`; otherwise it keeps the lockup. The `tracy-business.json` profile has an empty `site_logo_dark` key for the writer. Cut into **1.2.1** (08/10/2026): webroot = the 1.2.0 archive with exactly these 7 files replaced and `mod_custom/default.php` added, database byte-for-byte the same as 1.2.0; the 1.2.1 contract was captured with `capture-contract.py` (parameters reproducing the 1.2.0 contract exactly: `--languages en-GB,ru-RU,*`, `--counts-from`, `--identity-note tracy:identity`, `--evidence-pattern ...|Stats|Leadership|Accreditations`) — `content-map` matches 1.2.0, `presentation-lock` differs only in the 8 files here. The `quickstart-overrides` gate now compares the `tracy_business/` tree with the latest `tracy-business/j6` profile, so changing a file here without cutting the next version turns the gate red. The where-map records both 1.2.0 and 1.2.1; for 1.2.0, `logo.php` is proven by the hash the 1.2.0 lock pins. |
| `tracy-base/acm/{marketing-samples,carousel}/tmpl/style-1.php` · `tracy-base/html/com_users/{method/edit,captive/default}.php` · `tracy-base/html/layouts/t4/element/{offcanvas-toggle,theme-toggle}.php` (theme-toggle new) · `tracy-base/html/layouts/t4/block/header-{1,2}.html` · `tracy-base/html/layouts/t4/layout/offcanvas.php` · `tracy-base/acm/tabs/tmpl/style-1.{php,xml}` · `tracy-base/css/site-repairs.css` · `tracy-base/language/en-GB/en-GB.tpl_tracy.ini` · `tracy-base-site-language/en-GB/en-GB.tpl_tracy.ini` (new) | Tracy Base 1.0.3 (Template Customization Question Readiness, 12/10/2026). LANG-2: seven hard-coded UI strings (*Open a sample directly:*, *Previous/Next slides*, *Help* ×2, *Open/Close menu*) go through `TPL_TRACY_*` keys via `Text::_()`. The keys are in both ini files: the webroot's `language/en-GB/` (Joomla 4+ reads only this one, hence the `tracy-base-site-language/` folder) and `templates/tracy/language/`. The two 1.0.2 ini files already differed, and are left differing. ABOUT-2: the `tab-body` field of the tabs ACM changes `editor` → `textarea`, because `capture-contract.py` only grants slots to text/textarea/media/url/email. The database drops `<p>` from three tab bodies (module 215), and the layout wraps a body with no HTML tag in `<p>`, so the page prints exactly as before. LOGO-3: the header image logo is held at `max-height: 32px` (was 40px), the height of the demo logo `images/logo.svg` 150×32. Webroot = the site restored from 1.0.2 with exactly these files replaced. Database: three tab bodies, dates/ordering tie-broken (PAGE-2), `$fromname` = *Tracy Base*. File modes normalised to 0644/0755, because the 1.0.2 tar carried 0600/0700. Later (same 1.0.3, not yet released): the *Switch between light and dark* label of the light/dark toggle, hard-coded in the two T4 blocks `header-1.html`/`header-2.html` (T4 prints a block as a string; PHP in it does not run), moves to the `theme-toggle.php` element with the key `TPL_TRACY_THEME_TOGGLE`, same markup. |
| `tracy_business/acm/tb-sys-styleguide/tmpl/style-1.php` · `tracy_business/html/layouts/t4/element/offcanvas-toggle.php` (new) · `tracy_business/html/layouts/t4/element/header-theme-toggle.php` (new) · `tracy_business/html/layouts/t4/block/header-{1,2}.html` · `tracy_business/acm/tb-kit-slide-library/tmpl/style-1.php` · `tracy_business/css/tracy-business-fonts.css` (new) · `tracy_business/fonts/*-vietnamese.woff2` (8 new files) · `tracy_business/language/{en-GB,ru-RU}/*.tpl_tracy_business.ini` (ru-RU new) · `tracy_business/templateDetails.xml` · `site-language/{en-GB,ru-RU}/*.tpl_tracy_business.ini` | Tracy Business 1.2.2 (Template Customization Question Readiness, 12/10/2026). LANG-2: five hard-coded UI strings (four position labels in the module map of the Style guide page, *Open menu* on the drawer button) go through `TPL_TRACY_BUSINESS_GUIDE_*` / `TPL_TRACY_BUSINESS_OFFCANVAS_OPEN` keys via `Text::_()`; Archivo and Newsreader get Google Fonts' `vietnamese` subset (same family, Google's `unicode-range`, inserted before the `latin-ext` block as Google orders it) so a Vietnamese page renders all 102 letters in the template's font. The Archivo subset is the same version as the shipped `latin` file (sha256 matches); Newsreader on Google has moved to a newer version than the shipped `latin` file, so the Vietnamese subset is the newer version (same letterforms). LANG-3: the text drawn in the slide library thumbnails (cover *Завод «Электра»*, table of contents, figures, …) is no longer hard-coded Russian in the layout: each string is a `TPL_TRACY_BUSINESS_KITSLIDE_*` key, the en-GB file in English, the ru-RU file keeping the exact old Russian text. The keys are in both places like every key of the template (the webroot's `language/` is where Joomla 4+ reads). Template 1.0.0 → 1.0.1. Database (not a patch here): `module-810.3` *Горячая линия* → *Hotline* (en copy), the empty `alt-link` of 43 *Request a deck* modules = `btn-link` (the secondary button has no text so it does not show; the page is exactly as before), post dates/order tie-broken (PAGE-2). Also: the *Switch between light and dark* label hard-coded in the two T4 blocks `header-1.html`/`header-2.html` moves to the new element `header-theme-toggle.php` (same `tracy-theme-toggle` markup; it does NOT overwrite the existing `theme-toggle.php`, which draws a different `tb-theme-toggle` button), reusing the existing key `TPL_TRACY_BUSINESS_THEME_TOGGLE_ARIA` (en + ru). |
| `../site-language/<tag>/<tag>.tpl_tracy_business.ini` | The `TPL_TRACY_BUSINESS_LANGUAGE_FILTER` string for 53 languages. ⚠ They go into **`<webroot>/language/<tag>/`**, NOT `templates/tracy_business/language/`: Joomla 3 reads the second place, Joomla 4 onwards reads only the first. Put them in the wrong place and `Text::_()` prints the key name itself on the customer page (measured 21/09/2026). Before this the layout borrowed Joomla's `JSEARCH_FILTER` — that key is for list filters in the admin, so the Vietnamese copy came out as *"Quản lý tìm kiếm"*, the Slovenian copy has no key and falls back to English, and four other copies end with an ellipsis because the original is a button label. |

## Tracy Business reads role variables: cut into 1.2.4 (15–16/10/2026)

Cut 16/10/2026: `tracy-business/j6` **1.2.4** = webroot 1.2.3 + the `role-variables/` overlay (retokenized with
`release-joomla.mjs`: 50 Bootstrap/T4 literals), same database. The files were copied into `tracy_business/` with
the exact bytes of the release (the `quickstart-overrides` gate compares against the 1.2.4 profile); the overlay folder was deleted. The four
Northgate images with the strip cut off are in the 1.2.4 webroot, not kept here. What follows are the notes from the preparation pass.

This folder has a **webroot layout** (`templates/tracy_business/…`), used directly as
`release-batch.mjs build --overlay template-patches/role-variables` when cutting the version after 1.2.3. It sits
outside `tracy_business/` on purpose: the `quickstart-overrides` gate compares every file in `tracy_business/` with
the latest profile (1.2.3), so putting it there before the cut turns the gate red. After the cut, copy these files into
`tracy_business/` (three files with the same name there are the 1.2.3 versions, and get replaced) and delete this folder.

- The base is webroot 1.2.3 (sha256 `04ec5c41…`). Edits are in the **source**: `scss/*.scss` and
  `css/styles/tracy-business.css` (the hand-written token file); `css/template.css` (+ `.map`) and
  `css/site-repairs.css` are build output from the T4 skill's `compile-scss.sh` (sass 1.104.0), byte-identical
  to the template's own build.
- Old hand edits in the compiled CSS have moved back to the source: the two blocks the build machine copied by hand to the end of
  `template.css` (the 1.2.1 light/dark logo pair, the language switcher + topbar) are now in
  `scss/_tracy-business-late.scss`, imported last in `_all.scss`, so the build comes out in the order the page paints.
  The 70 `--ds-c-*` reads that `release-joomla.mjs` tokenized into the 1.2.3 `template.css` are not in the
  source: the template's own part now reads roles in the source; the Bootstrap/T4 part (outside the template) is rewritten by
  the tokenize step of the next cut (tried: 50 literals, the scan is still clean).
- `jpages.css` (used only by `error-t4.php`, when T4 is missing) is an old Prepros build; rebuilding it would change the look:
  keep the 1.2.3 bytes, and the edits in `jpages.scss` are copied over verbatim. `frontend-edit.css`, `theme.css`,
  `tpl/theme.tpl.css` are unchanged.
- With no system chosen the page is identical: a static comparison of every declaration in the 12 stylesheets (`--ds-*` variables left empty,
  custom variables resolved as the browser does), light 16 095 and dark 16 156 declarations, 0 differences, same order, plus
  exactly one added declaration `border-radius: 0` (the language filter box, already 0 via `input[type=search]`).
- Demo images (15/10/2026): `images/northgate/{hero-ru,factory-ru-1,factory-ru-2,proj-ru-3}.png` had the
  `#14171a` strip stuck to the bottom of the image cut off (60/46/24/34 px). On the template's ink background that strip disappears, but under a system it
  shows as a grey line. Everything else is kept pixel for pixel. The images follow the webroot layout so the next cut's `--overlay`
  carries them too; that cut's `presentation-lock` recaptures the hashes of these four images.

## Tracy Business 1.2.5: Add site preview under a design system (16/10/2026)

`tracy-business/j6` **1.2.5** = webroot 1.2.4 + six files in `tracy_business/` (cut with `release-batch.mjs build
--from 1.2.4 --contract-from 1.2.4 --overlay <six files>`), same database. With no system chosen the page is identical to 1.2.4
(verify: 0 computed differences, same pixels). The files here are the exact bytes of the release.

- `css/styles/tracy-business.css`: buttons/chips/pagination filled with the text colour (`--tb-ink-fill`) read `--ds-c-fg` /
  `--ds-c-bg` instead of `--ds-c-ink` / `--ds-c-on-ink` (the dark face of a system with ink is the card face: a grey Search button on Moxie's black
  background, BTN-1); the template's ink strip in dark mode reads `--ds-c-surface-warm`.
- `scss/_tracy-business-system.scss` + `css/template.css` (+ `.map`, built with sass 1.104.0 and then patched with exactly the changed
  part onto the tokenized version): a button attached to an input takes the input's corners (`:where(input, select, textarea) + .tb-btn`), the search
  bar and the 404 page's search box are rounded as one block (BTN-1/CLIP-1: the Search and Subscribe buttons became pills
  under a system).
- `acm/tb-kit-palette/tmpl/style-1.php` (new here) + `acm/tb-sys-styleguide/tmpl/style-1.php`: the colour swatches of the template's
  palette (Ink, Paper, Paper 2, Line, Forest, Signal) are painted through their role, `var(--ds-c-…, <hex>)` (MOCK-1).

## Tracy Base reads role variables: cut into 1.0.4 (15–16/10/2026)

Cut 16/10/2026: `tracy-base/j6` **1.0.4** = webroot 1.0.3 + the `role-variables-tracy-base/` overlay (retokenized
with `release-joomla.mjs`) + two database edits from `role-variables-tracy-base-content.json` (`--replace`). The files
were copied into `tracy-base/` with the bytes of the release; the overlay and the content-edit file were deleted (version 1.0.4 carries the new
content). What follows are the notes from the preparation pass.

Same pattern as `role-variables/` above, but a **separate folder**: Tracy Base and Tracy Business
are two different cuts, and Tracy Base's `templates/tracy/` shares its element with Tracy Apple. Used as
`--overlay template-patches/role-variables-tracy-base` when cutting Tracy Base j6 after 1.0.3; after the cut, copy
the files into `tracy-base/` and delete this folder.

- The base is webroot 1.0.3 (sha256 `0b0a6723…`). Edits are in the **source**: `scss/*.scss`, the two token files
  `css/styles/{base,airbnb}.css` (generated by the T4 skill's `make-style.mjs`, now hand-edited: the file header says so,
  and rerunning the script loses the role reads). `css/template.css` (+ `.map`) and `css/site-repairs.css` are
  rebuilt with sass 1.104.0 (`compile-scss.sh`), byte-identical to the template's own build before the edits.
  The light/dark logo pair block the build machine copied by hand to the end of `site-repairs.css` (1.0.2) is now at the end of
  `scss/site-repairs.scss`. `jpages.css` (an old Prepros build) keeps its bytes; the edits in `jpages.scss` are copied verbatim.
- Roles: the tokens `--bg/--fg/--accent/…`, typefaces, the radius scale, `--focus-ring` (colour only), the scene strip
  (`--tracy-scene-bg/-fg` = `--ds-c-ink/--ds-c-on-ink`) read roles; Bootstrap/T4 root variables
  (`--t4-heading-color`, link, the `*-bg-subtle`/`*-text-emphasis` states, disabled fields, focus, radius, type
  faces) read roles in the same token file, so CSS lines compiled from T4/Bootstrap follow the system (the `framework` layer).
  The Sass variables of `_variables.scss` (read by Bootstrap's colour functions), utility classes and decoration are `ds-keep`.
- With no system chosen the page is identical: a static comparison of every declaration (`--ds-*` variables left empty), 0 differences; the only additions are declarations
  with exactly the existing value (Bootstrap's original radius/typefaces in the token file).
- Demo content (database) does not go through the overlay (an overlay only copies files into the webroot), so the database edits
  live in a separate file next to the folder: `role-variables-tracy-base-content.json`,
  used as `--replace` in the same cut (`release-batch.mjs build --out <dir> --overlay
  template-patches/role-variables-tracy-base --replace template-patches/role-variables-tracy-base-content.json
  tracy-base`). `release-joomla.mjs` edits exactly that string in the new version's dump **and** in
  the new contract's `presentation-lock.json` (the lock pins module content; editing one side makes the plugin refuse
  to bind with "Presentation drift"), counts the occurrences and stops the build on a mismatch (`src/release-content-edits.mjs`).
  There are two edits now. (1) The "Strategy · Design · Development" line of module 229 (the home page social proof strip),
  painted with `var(--brand-color-warning)` (a status colour used as decoration, still yellow under every system), now reads
  `var(--ds-c-accent-text, var(--brand-color-warning))`, like `--color-kicker` of Tracy Base EmDash. With no
  system chosen it keeps the old colour. Dump 1.0.3 (sha256 `e81c4c4a…`): the string occurs exactly once, on the module 229 line.
  (2) The team cards of module 236 kept the initials of the old names that `rename-team-members.php` changed (MT, DO, RM
  next to Adam Hale, Peter Lang, Lucas Meyer); they are now AH, PL, LM; each string occurs exactly once in the 1.0.3 dump. After the
  cut, delete this file together with the overlay folder (the next version carries the new content).

## Tracy Base 1.0.5: text painted with accent reads the readable accent (16/10/2026)

`tracy-base/j6` **1.0.5** = webroot 1.0.4 + an overlay of only 7 scss partials (`_chrome`, `_overrides-content`,
`_overrides-users`, `_overrides-misc`, `_overrides-spine`, `_fixture-pages`, `site-repairs`) plus `css/template.css`
(+ `.map`) and `css/site-repairs.css` rebuilt with sass 1.104.0 (the build of the 1.0.4 source is byte-identical to the
approved version), retokenized with `release-joomla.mjs`; the database keeps the 1.0.4 bytes. Reason: measuring the 1.0.4 preview (16/10)
showed text (links, "Read more", hover/focus colours) painted with `var(--accent)`, which is the accent's BACKGROUND colour; under Moxie it comes out `#6786c4`
on `#eae5cc` (2.87:1, CON-2 and HOVER-1). 47 `color: var(--accent[-hover])` declarations (and `--btn-fg`) are now
`var(--ds-c-accent-text[-hover], var(--accent[-hover]))`: with no system chosen it is identical (verify: 0 computed differences against
1.0.4). The new partials were copied into `tracy-base/scss/` with the bytes of the release; the overlay is kept outside the repo.

## A template convention the patch depends on

`html/layouts/t4/element/megamenu.php` (the template's own, not changed here) resolves the menutype as
`<menu_type>-<language sef>` — `tb-main-en`, `tb-main-ru`, `tb-main-de`. A menutype named by
**language tag** (`tb-main-dede`) makes the lookup miss, and the mega menu **silently** falls back to the plain menu:
three blocks disappear from every page, with not one line of error.

## Tracy Business 1.2.6: footer link underline follows the system (19/10/2026)

`tracy-business/j6` **1.2.6** = webroot 1.2.5 + the `tracy_business/` tree (cut with `lane.mjs tracy-business
template-patches/tracy_business`, i.e. `release-batch.mjs build --overlay`), same database. Exactly one rule changes:
`a.tb-footlink:hover` is underlined with `var(--tb-ds-accent, var(--tb-signal))` (`scss/_tracy-business-chrome.scss`
+ `css/template.css`) instead of `--tb-signal`. The `--ds-c-accent*` reset slot in the footer stays, so `--tb-signal`
there falls back to the template's orange under every system (ACCENT-LEAK, probe 10); `--tb-ds-accent` takes the system's accent at the page root,
like the footer's other accent marks. With no system chosen it is identical to 1.2.5 (verify: 0 computed differences, same pixels). The matching
patch in the slot contract stays for 1.2.5 and below; 1.2.6 uses `joomla-tracy-business-source`, which does not have it.
