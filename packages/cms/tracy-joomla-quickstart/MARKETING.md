# Marketing samples on the Joomla quickstart

`build-marketing-samples.mjs` reads the catalog, `tokens.css` and `DESIGN.md` in
`vendor/tracy/od-design-system`, then uses **the same brand adapter and brand engine** as
Design inspirations to build Newsletter, Email, Poster, Deck, Form and Typography.
It does not copy the six 6 KB HTML frames in vendor: they are not the full version the dialog serves.

Landing belongs to the website: the native `/` page uses Joomla/T4 modules
and is not part of Marketing samples. The default sample of this set is Newsletter.

## Build and install

```sh
node packages/cms/tracy-joomla-quickstart/build-marketing-samples.mjs apple /tmp/tracy-marketing-apple
```

Copy the contents of the output folder into the site's `media/tracy-marketing/`; copy
`marketing.php` into `templates/<active template>/html/com_content/article/marketing.php`.
Run `install-marketing-samples.php` with the PHP CLI in the site container, passing the webroot if it
differs from `/var/www/html`. The script uses Joomla's Table to create one article and one child menu item of
Resources, taking the template style from the Design system menu item. It refuses to overwrite an existing menu item.

T4 keeps its own ID list for the megamenu: copy the navigation file in use out to staging, then run:

```sh
python3 packages/cms/tracy-joomla-quickstart/register-marketing-menu.py /tmp/navigation.json MENU_ID --backup /tmp/navigation-before.json
```

Replace `MENU_ID` with the installer's output, then copy the edited navigation back to the site.
The script only adds the ID to the Library column, leaves the other groups untouched and saves a copy before editing.

## Scope

- The sample set and its CSS/JS live on the site itself; viewing needs neither dsh nor a Tracy server.
- The Joomla page has the route `/resources/marketing-samples`; fragments `#newsletter`, `#deck`…
  open the matching sample. Header/footer belong to the current template.
- The iframe isolates the sample document's CSS from T4. This is a **sample viewer**; the artifact's
  parts have not been turned into ACM modules or editable content fields in Joomla.
- The light/dark versions are tokens built by the engine; Download HTML gets a standalone document.
- Figures, people's names and testimonials in the samples are the engine's illustrative data.
  The form sends no data and shows no fake success message. Email/newsletter/CRM are not connected.
- This original sample set leans on typography, shapes and layout; it does not generate or download business images.
- The design library's `LICENSE` and `NOTICE` files ship with it; source and SHA-256 are in the manifest.

## Local install, 11/09/2026

Site `http://127.0.0.1:8212`, Docker context `desktop-linux`, container `t4-skill-j6-web-1`.
Article **83**, menu item **325**, template **tracy**, navigation `etc/navigation/default.json`.
Navigation backup at `/tmp/marketing-navigation-before.json`; inventory before the addition at
`/tmp/marketing-before.json`. No container restart, no homepage change.

Undo: move menu item 325 and article 83 to the trash in Joomla; remove only ID 325 from the
Library column (restore the whole backup only if navigation has had no other change since the install).
The media set and the custom layout can stay; they do not affect other pages.
This install did not repackage the quickstart archive or publish it to the server.

## Landing as Home

On a follow-up request, the native Landing (menu item 247, style 113) became Home at `/`.
The old Home (menu item 239, style 110) moved into Resources as **Home variation**, path
`/resources/home-variation`. The existing variant `/resources/home-2` is unchanged.
`promote-landing.php` moves the menu items with Joomla's Table and fixes exactly those IDs in the
T4 megamenu; it does not change content or the module assignment table. Copy before the move:
`/tmp/home-landing-promotion-before.json` on the machine and in the site container.
Checked all three H1s, the hero module, a single default Home, and that the module/module-assignment
tables were unchanged. A later visual check was done in a new Chrome tab.


## Full Home and Home - Onepage (12/09/2026)

The first Home move used the existing Joomla landing with 5 modules, so it lacked most of the content
of the OpenDesign demo. `build-native-landing.mjs` now takes the actual renderer in od-brand-engine,
through the same adapter Design inspirations uses, and outputs all 12 content sections and 9 SVGs.
Header, megamenu and footer use the T4 website shell. Each section is a real mod_custom, editable in Joomla.
Home menu item 247 now uses style 117, layout `od-landing`, modules 228–239.

Resources also has **Home - Onepage**, `/resources/home-onepage`, menu item 330, style 118,
layout `od-onepage`, modules 240–249. `build-company-onepage.mjs` rewrites it as a studio
introduction: its own header with a scroll menu, hero, introduction, services, website product set, process,
team, FAQ, contact and footer. This page does not load the website megamenu. Team and company profiles
are clearly marked as illustrative; the contact button leads to the existing Contact page.

```sh
node packages/cms/tracy-joomla-quickstart/build-native-landing.mjs apple /tmp/tracy-native-landing
node packages/cms/tracy-joomla-quickstart/build-company-onepage.mjs /tmp/tracy-native-landing/blocks.json /tmp/tracy-company-onepage
node packages/cms/tracy-joomla-quickstart/check-native-landing.mjs /tmp/tracy-native-landing/blocks.json http://127.0.0.1:8212/
node packages/cms/tracy-joomla-quickstart/check-native-landing.mjs /tmp/tracy-company-onepage/blocks.json http://127.0.0.1:8212/resources/home-onepage
```

`od-landing.php` lives in `templates/tracy/html/mod_custom/`; the output CSS together with
`company-onepage.css` and `company-onepage.js` lives in `media/tracy-landing/`.
A navigation script serves both pages, so T4's anchor handler does not swallow the scroll.
`install-native-landing.php` takes blocks.json, a backup path that does not exist yet, and the webroot;
it installs the new layout, style and modules through Joomla. optimizecss is turned off for this style only because the old T4 optimizer
does not understand CSS nesting. Do not rerun the installer over a layout that already exists.

Install backups in the container: `/tmp/native-home-install-before-3.json` and
`/tmp/company-onepage-install-before.json`. The old modules/styles are kept for rollback;
to undo Home, assign style 113 back to menu item 247. To remove Onepage, move menu item 330 to the
trash and remove exactly ID 330 from the current navigation; do not copy the backup over newer edits.

Checked 12/12 Home blocks, 10/10 Onepage blocks, titles, SVGs, one H1 per page,
no content iframe, CTAs with targets, the scroll menu and FAQ. Onepage was viewed on desktop/mobile 390px,
light/dark, team photos fully loaded and no horizontal overflow. The quickstart archive has not been repackaged.

## Native design system sync (12/09/2026)

Home/Onepage used to keep tokens derived from the artifact engine, so text color #38383a, the font stack,
the 64/72px hero and 12px button corners differed from the Tracy Apple template (#1d1d1f, 56px hero, capsule buttons).
`native-site-tokens.css` maps the artifact variables onto the running template's tokens, both light and dark,
and shares the 1024px width, 100/64/40px section spacing, typography and Tracy buttons.
The builder appends this layer at the end of the native CSS; it does not change modules, content, images or menus.
`od-landing.php` uses mtime as the CSS URL version to avoid a stale cache after updates.

Compared Home variation directly with Home/Onepage using computed style and Chrome screenshots:
display font matches, text color light #1d1d1f / dark #f8f8f8, hero desktop 56px / mobile 40px,
Home still has 12 blocks, Onepage still 10 blocks. Mobile 390px check shows no horizontal overflow;
the Home scroll menu still reaches #how. CSS before the fix at `/tmp/native-landing-before-parity.css`.
The real Docker webroot must be updated through container `t4-skill-j6-web-1`; do not infer that container
data changed from a file of the same name under macOS `/site/`.

Parity run: Docker Desktop PID 16265 serves port 8212, container `t4-skill-j6-web-1`;
`check-boot-graph` passes for both web/native. Repo-wide check log: `/tmp/apple-parity-check.log`.

## Studio content and Onepage header sync (12/09/2026)

`studio-home-copy.json` and `studio-home-copy.mjs` replace the renderer's SaaS copy with Tracy Apple
content checked directly against Product, Services, Pricing, About and Team.
Home keeps 12 sections but drops the fake testimonials/customers/SLA. The people section introduces the demo team;
pricing uses Starter $0, Studio $24, Foundry $96 with the benefits and illustrative notes of /pricing.
Toolkit figures match the existing Product page, not customer counts.

Onepage uses the site's six services and four steps, without truncating descriptions via line clamp.
The custom HTML header was removed from the builder: the layout uses the template's own `header-2` block.
Style 118 selects navigation `onepage`; the Joomla menu `tracy-onepage` has five scroll-URL items;
a mod_menu module at `onepage-offcanvas` is assigned to menu item 330 so the mobile drawer uses the same items.
No submenus; header logo, theme toggle, Contact and drawer belong to the current template.
`company-onepage.js` only closes the drawer when an in-page anchor is chosen; it does not build a menu in HTML.
Onepage content and footer are still mod_custom, NOT yet converted to ACM with dedicated content fields.

`reconcile-studio-content.php` updates the published modules and assigns exactly menu items 247/330,
without picking draft modules that share a position; it saves a backup before editing. The successful local run used
`/tmp/studio-content-before-3.json` in the container; the clamp-removal run added backup `-4`.
Usage: `php reconcile-studio-content.php HOME_BLOCKS BACKUP WEBROOT ONEPAGE_BLOCKS`.
Checked Home 12/12 and Onepage 9/9 blocks (the header now belongs to the template), pricing matches the site,
desktop menu scrolls correctly and the mobile drawer closes after choosing an item. Archive not repackaged.

## Typography per the Style guide (12/09/2026)

The current reference is `/resources/style-guide`: display 80px/84px, weight 700; section
40px/42px, weight 700; lead 21px/30.87px and body 17px/24.99px. This replaces the
56px/600 choice based on Home variation from the previous run. Do not edit the Style guide to match another page.

`site-typography.css` applies a role-based type scale through the shared stylesheet `css/site-repairs.css`:
hero 80px, regular page title 56px, section 40px, card 28px or compact 21px;
mobile uses the phone tokens 40/28/20px. Headings use SF Pro Display 700, body/lead use the same
SF Pro Text font stack with the Style guide's fallback. Header, footer, drawer and modal have their own roles
and so do not receive the content heading rules.

`install-site-typography.py TEMPLATE BACKUP` updates the marked section, keeps other fixes
untouched and refuses to overwrite a backup. Live was updated via Docker into the Tracy template; the existing index file
uses mtime for the site-repairs URL, so browsers pick up the new version.
Backup before the fix: `/tmp/typography-site-before.css`. Measured Home, Onepage, Home variation,
Product, Pricing, Services, About, Team, Blog and Contact; checked screenshots of Home light/dark mobile
390px, desktop and Home variation. No horizontal overflow on Home mobile.

### Extended to every public page (12/09/2026)

Crawled from 43 published component menu items, following internal links to articles, categories,
tags, authors, news feeds and pagination: **152 URLs, i.e. 128 pathnames and 24 URLs with a query**.
The list is saved in `typography-page-inventory.json`; `audit-page-inventory.mjs` regenerates the
inventory from the Joomla menu JSON, read-only and without submitting forms. Every URL returns HTTP 200 and loads
the shared stylesheet. `/account/profile` redirects to Sign in when not logged in; the private profile
UI has not been checked. The Wrapper's off-site iframe content is outside the CSS scope.

Measured computed font family, heading weight and font size of visible h1–h6/p in content,
plus paragraph-style CTAs, on **152/152 desktop URLs and 152/152 mobile 390px URLs**.
After fixing and rechecking: no deviations left per the probe and no page-wide horizontal overflow.
This is a per-URL computed-style check, not a screenshot confirmation of every page or
every interactive state of forms/menus. Header/footer/drawer/modal keep the template's own
typography. Marketing artifacts with their own inner content do not get the design system replaced.

Exceptions fixed in the shared stylesheet: category tree titles; eyebrow/timeline marker;
CTA statement; Careers heading inside a quote; Wrapper masthead; News Feed heading.
The author pagination bar may wrap on mobile to avoid horizontal overflow.
Home still has all 12/12 blocks and Onepage 9/9, with all source headings/SVGs intact.
Live backup before this run: `/tmp/all-type-before.css`; the update used the marker-based installer.
Final check: `pnpm build:check` passed 31/31 gates; boot graph passed for both web/native.
The first run hit a brand-engine test reading incomplete JSON; run on its own it passed 16/16, then the final full run was green.

## Per-site content contract (12/09/2026)

`content/tracy-editorial/content-contract.json` separates the demo business data from the design source.
Its scope covers the 128 existing pathnames and 12 light/dark variants of the six marketing artifacts. Prices,
staff and services are illustrative data; the source is stated, and they are not treated as real customer information.
`studio-content.mjs` validates the profile and supplies facts to the Home/Onepage builders. It is the shared
source for the data already moved, not a confirmation that all copy on the site has been migrated.

T4 skill `1.0.0-tracy.4` captures the profile from Phase 2, compiles the content plan before Phase 7, audits rendered
fields and reviews semantics in Phase 8b. The validator catches missing sources/pages/facts, ad-hoc price overrides,
stale hashes and missing demo disclosure. The machine does not prove claims correct or detect every contradiction
in unmapped paragraphs; a full-page review is still required. See `content/README.md`.
This run did not rewrite the live Marketing Samples and did not change the archive-protecting contract in `contracts/`.

## Marketing Samples speak about Tracy Apple (12/09/2026)

The six samples used to tell the story of the **design inspiration**, not the demo business: the name
"Apple", the tagline "Consumer electronics…", the testimonial "Maya Chen · Northwind", TAM/SAM/SOM
48B/12B/1.4B, Starter/Pro/Enterprise plans at $0/$29/Custom, "99.9% uptime SLA", "100 Market Street".
All of these were claims generated by the vendor renderer, absent from the content contract — and unsourced.

Now all 12 artifacts take their text from `content/tracy-editorial/content-plan.json`, compiled via
the T4 skill's `compileContentPlan(contract, plan, MARKETING_SURFACES)` before any file is written.
The design is still Apple: colors, font sizes, radii and fonts are tokens derived by the brand engine, through the same
adapter Design inspirations uses. The display structure (tab · light/dark · iframe · Open/Download)
is unchanged.

| File | Role |
|---|---|
| `marketing-plan.mjs` | 12 surface IDs + the field set of each sample type. Light/dark **share one field set**, so the two versions cannot drift in text |
| `build-content-plan.mjs` | generates `content/tracy-editorial/content-plan.json` and compiles it immediately as a gate |
| `marketing-artifacts.mjs` | Tracy's six renderers: `--brand-*` shell, newsletter · email · poster 3:4 · 11-slide deck · form · typography |
| `build-marketing-samples.mjs` | compile plan → render → `manifest.json` with `contractId`/`contractHash` |
| `check-marketing-samples.mjs` | build gate: every field made it into the file, and each sample has a disclosure |
| `observe-marketing-samples.mjs` | reads the DOM **inside the iframe** on the running site, outputs `observed-content.json` + evidence |
| `audit-marketing-samples.mjs` | `auditContent` limited to exactly the 12 surfaces; the contract keeps all 140 surfaces |

```sh
node packages/cms/tracy-joomla-quickstart/build-content-plan.mjs
node packages/cms/tracy-joomla-quickstart/build-marketing-samples.mjs apple /tmp/tracy-marketing-apple
node packages/cms/tracy-joomla-quickstart/check-marketing-samples.mjs /tmp/tracy-marketing-apple
node packages/cms/tracy-joomla-quickstart/observe-marketing-samples.mjs \
  http://127.0.0.1:8212/resources/marketing-samples /tmp/tracy-marketing-observed
node packages/cms/tracy-joomla-quickstart/audit-marketing-samples.mjs \
  /tmp/tracy-marketing-observed/observed-content.json
```

⚠ **The sample iframe has `sandbox="allow-scripts"` WITHOUT `allow-same-origin`.** Chrome moves it into
a separate target, so it is **not in the page's frame tree** — `Page.getFrameTree` returns nothing and
it is easy to conclude "the page has no iframe". The only way in is a `Target.setAutoAttach` session.
That is also exactly the isolation the customer gets.

Every rendered field carries `data-field="<key>"` (or `data-field-href|src|alt`). That is the **map**
the audit reads back from the DOM; without it observed-content would have to be hand-written, and a hand-written
file checks nothing. `marketing-observe.mjs` keeps **one** extractor used by both sides.

The form has no `action`, no `method` and no "sent" state. The submit button says outright
"Preview only — nothing is sent"; clicking it only shows the `notice.preview` line. The real CTA is a link
to `/resources/contact`.

Deck on narrow screens: a 16:9 frame at 390px gives ~5px text. At ≤720px the frame drops the fixed ratio and
switches to px font sizes and a one-column grid — desktop keeps 16:9.

### Run of 12/09/2026

Site `http://127.0.0.1:8212`, Docker context `desktop-linux`, container `t4-skill-j6-web-1`.
Backups before copying: `/tmp/tracy-marketing-before-content-plan.tgz` and
`/tmp/marketing-layout-before-content-plan.php` in the container.

- `check-marketing-samples`: 12 artifacts, **354 fields**, disclosure on all 12.
- `observe` + `audit`: **12 surfaces / 354 fields** match, read from the real DOM inside the iframe.
  Evidence saved in `content/tracy-editorial/evidence/`.
- Team photos: 4/4 `naturalWidth > 0`, the same images `/company/team` uses.
- Light/dark really differ: background `rgb(246,246,246)` / `rgb(29,29,29)`.
- Viewed desktop 1440 and mobile 390 screenshots for all 6 samples, both modes, plus the 8212 page.
- Text scan: no stray brand names, testimonials, market figures or SLA left.
- Clicked submit on the form in Chrome: **0 network requests**, no navigation, the status line shows
  "Nothing was sent…"; `action` and `method` are both empty.
- Deck: ArrowRight ×3 → 04/11, End → 11/11, prev button → 10/11.
- No horizontal overflow at 390px on all 12 documents and the 8212 page.
- `pnpm build:check`: **31/31 gates green**.

**Not done in that run:** four items — ACM, team names, service links, 128 site surfaces — are finished
in the section below. Archive not repackaged, not deployed.

## Four outstanding items, finished 12/09/2026

### The page is a stack of ACM modules, no longer a hard-baked article

`marketing.php` — the com_content layout override — **has been deleted**. All text on the page used to live in
that file: title, lead, names and descriptions of the six tabs, the note line. The site owner could change nothing without
editing code, and that is exactly review gate no. 1 of the T4 skill.

Now the page is an empty article containing `{loadposition marketing-samples-page}`, and at that position is the module
**`[Tracy Apple] Marketing samples - Collection`** (`mod_ja_acm`, id 251, assigned to menu item 325), built from the
`acm/marketing-samples/` block in the repo. Every string is a field in Module Manager.

🔒 **The layout override is pinned in TWO places, and the menu item wins.** Remove `article_layout` from article 83 but
forget menu item 325's params, and the page still renders with the old layout, the new module does not show, and **there is no error
anywhere**. `install-marketing-acm.php` removes both and backs up both.

⚠ ACM language strings must be in **both** copies of `en-GB.tpl_tracy.ini` — in the template and in
`language/en-GB/` — because the ACM addon loads from `JPATH_SITE`. Without the second copy every field in the
module editor shows as a raw `*_LABEL`.

`samples.js` now reads the sample list **from the module's markup** and no longer fetches `manifest.json`: tab titles
and descriptions are admin fields, and a fetch would silently overwrite what the user just typed with the text of
the latest build.

**The boundary still holds:** artifact documents are still build output, not admin fields. They are
generated from the content contract and downloadable as standalone files; turning their few hundred text cells into
admin fields would give the same sentence two owners.

### Team names that read right with the portraits

Photos `mem-1..4` are stock photos: a man in his forties with glasses, an older grey-haired person, a
curly-haired woman, a young man. The old set of names matched none of them, and it was decided **not to use
Vietnamese names**.

| Photo | New name | Role | Fact key |
|---|---|---|---|
| mem-1 | Adam Hale | Design Director | `team.hale.*` |
| mem-2 | Peter Lang | Development Lead | `team.lang.*` |
| mem-3 | Sofia Lindqvist | Brand Designer | `team.lindqvist.*` |
| mem-4 | Lucas Meyer | Research Lead | `team.meyer.*` |

`rename-team-members.php` edits **in one pass** across articles, the team ACM module and two Custom modules —
articles 18/19/21 and modules 189 · 201 · 226 · 236 · 246. Article aliases are **kept**: they are
surfaces declared in the contract, and changing them would lose every observation recorded against them.

⚠ **Replacing the full name is not enough.** The body text still opened with the old given name ("Mai is the demo
studio's design director. **Her** profile…") — a defect the field audit cannot see, because every mapped field
still matches. The four bios were rewritten by role, **dropping pronouns entirely**: a demo profile has no
reason to assert a person's pronouns from a stock photo.

### Service links point to the right service pages

All six services have their own route (four clean aliases, two still on the starter's article alias — those are real
routes, so they are recorded facts, not a neater path that 404s). The contract adds
`services.<key>.href`; Newsletter uses that story's own href, Email uses each item's href.

### 128 site surfaces have a field plan and observations

- **Disclosure on every page.** Demo mode is mandatory, and `compileContentPlan` refuses to compile a
  surface that does not use it. ACM block `site-notice`, module `[Tracy Apple] Global - Demo notice` (252)
  assigned to **all pages**. Onepage renders its own layout and **never touches the `footer` position** — exactly one
  surface would be missing, so the installer also writes into Onepage's footer module (249). The overlapping line in
  Colophon (174) was trimmed so the footer does not say the same thing twice.
- **`content/tracy-editorial/site-copy.json`** holds the text currently shown on the 128 pages, with **every fact written back
  as `{{reference}}`**. The title "Adam Hale — Design Director" does not enter the plan as dead text:
  renaming the person also changes what the plan expects. Substitution applies only to facts that do not collide with ordinary words —
  `Studio`/`Starter` are plan names **and** ordinary words ("Studio notes"), so plan names stay as literal text.
- **`site-plan.mjs`** combines fields + a **selector map**. Site pages are Joomla views, not rendered by this
  repo, so they have no `data-field`; the selector is what the contract requires in its place. The six surfaces that
  declare `requiredFacts` are read fact by fact (Home · Services · Pricing · Contact · Onepage ·
  Team). Services selectors anchor on **each service's own route**, not on card order.
- **`observe-site-pages.mjs`** drives Chrome through the 128 URLs, reads by selector, and **goes red if a selector
  matches nothing** — a scanner that prints "OK" after seeing nothing is the failure mode the skill calls out specifically.
- **`audit-content.mjs`** merges the two observations and audits at the **contract's full scope**, unrestricted:
  a surface cannot pass by being left out of the question.

```sh
node packages/cms/tracy-joomla-quickstart/observe-site-pages.mjs http://127.0.0.1:8212 /tmp/tracy-site-observed
node packages/cms/tracy-joomla-quickstart/audit-content.mjs \
  packages/cms/tracy-joomla-quickstart/content/tracy-editorial/evidence/observed-content.json \
  packages/cms/tracy-joomla-quickstart/content/tracy-editorial/evidence/observed-site.json
```

### Run of 12/09/2026 (second run)

Contract at **revision 2**, hash `106e15e3a265`. Backups in the container:
`/tmp/team-rename-before.json`, `/tmp/team-intros-before.json`, `/tmp/team-18-fulltext-before.txt`,
`/tmp/marketing-acm-before.json`, `/tmp/menu-325-before-acm.json`, `/tmp/site-notice-before.json`,
`/tmp/colophon-174-before.txt`, `/tmp/tpl_tracy-ini-before-acm.ini`,
`/tmp/site-tpl_tracy-ini-before-acm.ini`.

- `check-marketing-samples`: 12 artifacts, **366 fields**, disclosure complete.
- `observe` + `audit` at full scope: **140 surfaces / 746 fields** match the real DOM.
- 128/128 URLs return 200; disclosure shows on **128/128**; no selector missed.
- No "Mai"/"Ravi"/"Okonkwo"/"Menon"/"Tran" left anywhere in the DB or on the pages.
- The six service routes return 200; links in Newsletter/Email point to the right routes.
- Desktop 1440 and mobile 390 screenshots for Home · Pricing · Team · Onepage · Services · Contact:
  no horizontal overflow, notice shown in the footer on all six pages, at both sizes.

**Still not done:** `/account/profile` redirects to Sign in when not logged in, so the observation of
that surface is the Sign in page — the private profile UI is not measured. Most site pages are audited at the
**title + heading + disclosure** level; the six pages carrying facts are read fact by fact. The audit only checks
mapped fields: it does **not** see an omitted paragraph, and a semantic review is still required.
Quickstart archive not repackaged, not deployed, not committed.


## Design + content verification (12/09/2026)

The page and all six samples were checked against the **design contract** (`design/tracy-editorial/design-contract.json`)
and the **content contract**, measured with the T4 skill's `captureDesign` on the running site.

Handoff report: [`design/tracy-editorial/marketing-verification.md`](design/tracy-editorial/marketing-verification.md).
Verdict: **PASS for the Marketing scope — 28/28 cases**, and that is **not** a full-site pass (the contract lists 632 cases).

Three things worth remembering:

- **Artifacts must declare a theme.** A document without `data-bs-theme` is read by the probe as `mode: unknown`
  and **cannot pass in any variant**. `documentShell` now emits all three hooks, like `index.php`.
- **An artifact's presentation roles differ from the website's.** Forcing every `h1` to the 80px hero is wrong; there are now
  three flow roles (section/card/compact) for newsletter · email · form · typography, and four canvas roles
  computed in `cqi` for poster · deck — every value taken from the site's published token scale.
- **Do not wrap the page intro in `<header>`.** Both the template's typography and the contract's
  coverage exclude `header *` to skip site chrome; a page-level `<header>` gets swallowed with it, so
  the H1 rendered at 64px belongs to no role and the page's coverage is **0** with no error at all.

```sh
node packages/cms/tracy-joomla-quickstart/design-capture.mjs <contract> <out.json> --pages <list>
node vendor/joomla/joomlart-t4-skill/skills/joomlart-t4-template/scripts/design-contract.mjs \
  audit <contract> <observations.json> --scope=<page-id,...>
node packages/cms/tracy-joomla-quickstart/design-shots.mjs <contract> <screenshot-dir> <page-id...>
```
