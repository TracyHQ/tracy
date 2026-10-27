# Licensing

The repository is published under the **MIT License** (`LICENSE` at the root, standard text). That
licence covers Tracy's own code and documentation. Some trees in this repository are other people's
work, or JoomlArt's work, and keep their own licence; the root `LICENSE` does not relicense them.
This page is the full map: for every part that is not plain MIT, where it came from, under which
licence, what gives us the right to distribute it, and what must be kept when you redistribute it.
`THIRD_PARTY_NOTICES.md` holds the attribution notices and the trademark disclaimer.

Rules of thumb:

- A folder with its own `LICENSE`/`COPYING` is governed by that file, not by the root `LICENSE`.
- A `package.json` `license` field states the SPDX identifier of that package.
- Font files keep the licence file next to them (`OFL.txt`, `*-OFL.txt`, `*-LICENSE.txt`).
- Copyright and licence notices of third-party files must be kept intact (MIT, Apache-2.0 §4, GPL §1/§4).

Copyright holders named below: **Tracy** publishes Tracy; **J.O.O.M Solutions Co., Ltd.**
trades as JoomlArt.

## JoomlArt grant (26/10/2026)

Lee, owner of JoomlArt, released JoomlArt's parts of this repository for publication on 26/10/2026:

- JoomlArt PHP, Joomla and WordPress code and assets — the T4 Framework zip, the T4 shared layer,
  `vendor/joomla/html/ja_kinetic/`, the JoomlArt template ports (`wp-ja-*`), JoomlArt quickstart
  content and contracts, `packages/cms/tracy-emdash-theme-saas` — under **GPL-2.0-or-later**.
- JoomlArt skill documentation (`joomlart-t4-skill`, `tracy-emdash-skill`) under **MIT**.

The grant supersedes the older "Copyrighted Commercial Software … may not be redistributed" headers
that some JoomlArt files still carry inside archives kept byte for byte (the T4 zip, quickstart fixture
archives). Some JoomlArt WordPress themes say "GNU General Public License v3" in their `style.css`;
GPL-2.0-or-later includes that version, so both readings allow the same use.

## Map

### Tracy's own code — MIT

| Path | Licence | Notes |
|---|---|---|
| `apps/*` | MIT | |
| `packages/*/*` except the rows below | MIT | `package.json` `license: "MIT"` |
| `scripts/`, `tests/`, `docs/`, `deploy/`, `tch/`, root files | MIT | |
| `packages/site/tracy-website-opportunities` | MIT | client plugin of Website Opportunities |
| `packages/fleet/tracy-fleet-operation` | MIT (intended) | `package.json` still says `UNLICENSED`; changed by its owner (see "Open items") |

### Tracy packages under another licence

| Path | Origin | Licence | Right to distribute | Keep when redistributing |
|---|---|---|---|---|
| `packages/wo/website-opportunities` | Tracy | Apache-2.0 | Tracy's own (ADR 0036) | `LICENSE`, `NOTICE` |
| `packages/cms/tracy-joomla-template` | Tracy (Joomla template `tpl_tracy`) | GPL-2.0-or-later | Tracy's own; manifest already says GPL-2.0-or-later | `LICENSE`; 152 design-system token files are generated from `vendor/tracy/od-design-system` (Apache-2.0) |
| `packages/cms/tracy-wordpress-theme` | Tracy themes `tracy`, `tracy-base`, `wp-tracy-business`; WordPress ports of JoomlArt themes `wp-ja-*` | GPL-2.0-or-later | Tracy's own + JoomlArt grant | `LICENSE`, each theme's `style.css`/`readme.txt` headers, every font licence in `assets/fonts/` |
| `packages/cms/tracy-joomla-quickstart` | Tracy patches, contracts and content for JoomlArt and Tracy Joomla quickstarts | GPL-2.0-or-later | Tracy's own + JoomlArt grant | `LICENSE`, JoomlArt headers (`@copyright … JoomlArt.com`), `tracy-business-fonts-OFL.txt` |
| `packages/cms/tracy-wordpress-quickstart` | Tracy contracts and content edits for JoomlArt and Tracy WordPress quickstarts | GPL-2.0-or-later | Tracy's own + JoomlArt grant | `LICENSE` |
| `packages/cms/tracy-emdash-theme-saas` | EmDash port of the JA Kinetic Joomla 6 quickstart (design, demo content, seed images by JoomlArt) | GPL-2.0-or-later | JoomlArt grant | `LICENSE`, `PROVENANCE.md`, `src/components/ui/PROVENANCE.md` (shadcn/ui, MIT) |
| `packages/cms/tracy-emdash-theme-business` | Tracy (design "Northgate Industrial", Tracy/Lee's own demo content) | GPL-3.0-or-later | Owner decision 14/09/2026 (`PROVENANCE.md`) | `LICENSE`, `PROVENANCE.md` |
| `packages/cms/tracy-emdash-theme-base` | Tracy (snapshot of the "Tracy Base" Joomla site) | GPL-3.0-or-later | Owner decision 16/09/2026 (`PROVENANCE.md`) | `LICENSE`, `PROVENANCE.md`; `public/marketing/` keeps its Apache-2.0 `LICENSE` + `NOTICE` (OpenDesign) |
| `packages/cms/tracy-cms-sections`, `tracy-cms-motion`, `tracy-cms-preview`, `tracy-content-api`, `tracy-quickstart-tools`, `tracy-seeder` | Tracy | MIT | Tracy's own | — (MIT output is GPL-compatible, so it may be written into the GPL themes) |
| `packages/ui/tracy-ui/icons/{models,providers,platforms}` | brand marks of AI vendors, CMSs and platforms | artwork licence: see "Open items"; marks are trademarks of their owners | — | trademark disclaimer in `THIRD_PARTY_NOTICES.md` |
| `docs/design/brand/cobrand/` | JoomlArt wordmark, "Tracy by JoomlArt" lock-ups | JoomlArt trademark, used with the owner's permission | JoomlArt grant | trademark disclaimer |
| `apps/tracy-web/src/welcome/scenes/sites/fernway/fonts` | Inter, JetBrains Mono, Newsreader, Space Grotesk | SIL OFL 1.1 | OFL | `LICENSES.txt`, `INTER-LICENSE.txt` |

### Fonts bundled in themes

| Folder (in both `src/` and `overlays/` of `packages/cms/tracy-wordpress-theme`) | Fonts | Licence file |
|---|---|---|
| `wp-ja-diner/assets/fonts` | Work Sans, Eczar, Alegreya (OFL); Font Awesome 4.6.3 font (OFL); Ionicons 2 (MIT) | `OFL.txt`, `font-awesome-OFL.txt`, `ionicons-LICENSE.txt` |
| `wp-ja-essence/assets/fonts` | Be Vietnam Pro, Jost, Noto Serif (OFL) | `OFL.txt` |
| `wp-ja-fresco/assets/fonts` | Playfair Display, Roboto (OFL) | `playfair-display-OFL.txt`, `roboto-OFL.txt` |
| `wp-ja-impact/assets/fonts` | Readex Pro (OFL); Font Awesome Free 6.7.1 (font OFL, icons CC BY 4.0) | `readex-pro-OFL.txt`, `font-awesome-LICENSE.txt` |
| `wp-ja-kinetic/assets/fonts` | IBM Plex Sans, JetBrains Mono, Space Grotesk (OFL); Font Awesome 4.7.0 font (OFL); Font Awesome Free 5.15.4 (font OFL, icons CC BY 4.0) | `OFL.txt`, `font-awesome-OFL.txt`, `font-awesome-5-LICENSE.txt` |
| `wp-ja-morgan/assets/fonts` | PT Root UI, Be Vietnam Pro (OFL); Font Awesome 4.5 font (OFL); Ionicons 4.4.7 (MIT) | `pt-root-ui-OFL.txt`, `be-vietnam-pro-OFL.txt`, `font-awesome-OFL.txt`, `ionicons-LICENSE.txt` |
| `wp-ja-nova/assets/fonts` | Golos Text, Be Vietnam Pro (OFL) | `golos-text-OFL.txt`, `be-vietnam-pro-OFL.txt` |
| `wp-ja-restaurant/assets/fonts` | Teko, Noticia Text, Roboto Mono, Saira Extra Condensed (OFL); Font Awesome 4.6.3 (OFL); Ionicons 2 (MIT) | `OFL.txt` |
| `wp-ja-vega/assets/fonts` | Inter Tight (OFL) | `inter-tight-OFL.txt` |
| `wp-tracy-business/assets/fonts` | Archivo, Newsreader (OFL) | `OFL.txt` |

`packages/cms/tracy-joomla-quickstart/template-patches/tracy_business/fonts`: Archivo, Newsreader (OFL);
licence text in `packages/cms/tracy-joomla-quickstart/tracy-business-fonts-OFL.txt` (a file inside
`template-patches/` must ship in a released quickstart, so it waits for the next `tracy-business/j6`
release — see "Open items").

### `vendor/` — other people's code

| Path | Origin (pin in its `IMPORT-NOTE.md` / `TRACY-FORK.md`) | Licence | Right to distribute | Keep when redistributing |
|---|---|---|---|---|
| `vendor/tracy/deepseek-harness` (submodule) | fork of `deepseek-ai/deepseek-harness`, repo `TracyHQ/tch-vendor-deepseek-harness` | MIT (some native packages BSD-3-Clause) | upstream licence | its `LICENSE` files |
| `vendor/tracy/dsh-passwords` | fork of `slywalker2006/dsh-passwords` v2.6.6 | **GPL-3.0-only** | upstream licence; Tracy's changes are GPL-3.0-only too | `LICENSE`, `TRACY-FORK.md` |
| `vendor/tracy/dsh-better-locale` | `@huanlin/dsh-plugin-better-locale` (huanlinoto), `-tracy.N` fork | **AGPL-3.0** | upstream licence | `LICENSE`; network use triggers AGPL §13 — offer the source of the running version |
| `vendor/tracy/dsh-better-sidebar` | fork of `omdsh-dev/DSH-better-sidebar` | MIT | upstream licence | `LICENSE` |
| `vendor/tracy/dsh-locale-vi` | `PhuVinhAI/dsh-locale-vi` | MIT | upstream licence | `LICENSE` |
| `vendor/tracy/dsh-subscriptions` | `GooDAnDReaDY/dsh-subscriptions` | MIT | upstream licence | `LICENSE` |
| `vendor/tracy/mattpocock-skills` | `mattpocock/skills` | MIT | upstream licence | `LICENSE` |
| `vendor/tracy/od-design-system`, `od-brand-engine`, `od-skill` | OpenDesign `nexu-io/open-design` @ `3d0d15fc55` | Apache-2.0 | upstream licence | `LICENSE`, `NOTICE`; brand names → trademark disclaimer |
| `vendor/tracy/refero` | data snapshot of `styles.refero.design` | Refero's data, **not** MIT/Apache | separate agreement with Refero; legal confirmed 26/10/2026 that it may stay (`IMPORT-NOTE.md`) | `IMPORT-NOTE.md`, `snapshot.json` |
| `vendor/emdash/emdash` | `emdash-cms/emdash` @ `emdash@0.37.0` | MIT | upstream licence | `LICENSE` |
| `vendor/emdash/emdash-theme-bravada` | `vhscom/emdash-theme-bravada` v0.10.0, a port of Bravada by Cryout Creations | GPL-3.0-or-later | upstream licence | `LICENSE`, `CREDITS.md` |
| `vendor/emdash/emdash-theme-tracy-editorial`, `emdash-theme-tracy-coral` | Tracy derivatives of Bravada (renamed from `-apple`/`-airbnb` 26/10/2026), wearing od-design-system systems `apple` / `airbnb` | GPL-3.0-or-later | Bravada's licence | `LICENSE`, `CREDITS.md`; token CSS from od-design-system (Apache-2.0) |
| `vendor/emdash/astro-image-inspector`, `astro-skills` | Lexington Themes | MIT | upstream licence | `LICENSE` |
| `vendor/emdash/emdash-human-sitemap`, `emdash-page-list`, `emdash-smtp` | Mason James | MIT | upstream licence | `LICENSE` |
| `vendor/emdash/emdash-mika` | Bruno Meilick | MIT | upstream licence | `LICENSE` |
| `vendor/emdash/emdash-plugin-seo` | Joost de Valk | MIT | upstream licence | `LICENSE` |
| `vendor/emdash/tracy-emdash-skill` | home `JoomlArt-Products/tracy-emdash-template` | MIT | JoomlArt grant | `LICENSE`, `NOTICE.md` |
| `vendor/joomla/joomlart-t4-skill` | home `JoomlArt-Products/tracy-joomla-template` | MIT (docs, scripts) + GPL-2.0-or-later (T4 zip, shared layer) + GPL-3.0-or-later (Akeeba) | JoomlArt grant; Akeeba and Joomla core by their licences | `LICENSE`, `COPYING`, `NOTICE.md`; zip kept byte for byte |
| `vendor/joomla/html/ja_kinetic` | crawl of the JA Kinetic quickstart (JoomlArt), with T4, Font Awesome 4/5, Bootstrap, jQuery, jQuery Migrate, Awesomplete, Joomla media and AcyMailing assets as served | GPL-2.0-or-later (JoomlArt grant); Joomla core GPL-2.0-or-later; Bootstrap, jQuery, jQuery Migrate, Awesomplete MIT; Font Awesome fonts OFL 1.1, icons CC BY 4.0; AcyMailing (Acyba) GPL-3.0 | JoomlArt grant + each project's licence | `vendor/joomla/html/LICENSE.md`; files are hashed inputs and are never edited |
| `vendor/joomla/html/tracy_business` | Tracy's "Northgate Industrial" design export | GPL-3.0-or-later | owner decision 14/09/2026 | `vendor/joomla/html/LICENSE.md` |
| `vendor/joomla/html/tracy_base` | snapshot of Tracy's "Tracy Base" Joomla site | GPL-3.0-or-later; `media/tracy-marketing/` Apache-2.0 (OpenDesign) | owner decision 16/09/2026 | `vendor/joomla/html/LICENSE.md`, `media/tracy-marketing/LICENSE` + `NOTICE` |
| `vendor/wordpress/tracy-wordpress-theme` | Tracy's WordPress site-building skill | MIT | Tracy's own | `LICENSE`, `NOTICE.md` |
| `vendor/php/scssphp` | `scssphp/scssphp` | MIT | upstream licence | `LICENSE.md` |

### Archives and sample content

| Path | What | Licence |
|---|---|---|
| `vendor/joomla/joomlart-t4-skill/assets/t4/t4-framework-for-joomla-6.zip` | Joomla 6.1.1 + T4 Framework 2.5.6 + `t4_bs5_blank` | GPL-2.0-or-later (Joomla core by its licence; T4 by the JoomlArt grant — the archive comment and in-file headers predate the grant) |
| `vendor/joomla/joomlart-t4-skill/assets/akeeba/*` | Akeeba Backup Core 10.3.5, Kickstart | GPL-3.0-or-later |
| `apps/tracy-web/test/fixtures/template-customization-question-readiness/**/{ja-*}` (`.zip`, `.tar.gz`, `.sql.gz`, `.php`, `.css`, `.html`) | JoomlArt quickstart builds and files used as test fixtures | GPL-2.0-or-later (JoomlArt grant); archives kept byte for byte |
| `apps/tracy-web/test/fixtures/template-customization-question-readiness/**/{tracy-*}` | Tracy quickstart builds | GPL-3.0-or-later (EmDash/WordPress Tracy Business) or as their package states |
| `packages/cms/tracy-joomla-quickstart/contracts/ja-*`, `translations/`, `content/` | JoomlArt and Tracy demo content (texts such as "© … JoomlArt. All rights reserved." are page content, not licence notices) | GPL-2.0-or-later |
| `packages/fleet/tracy-fleet-operation/web/emdash-conditional-core.tar.gz` | EmDash core build | MIT (emdash-cms) |

## Open items

- Copy `packages/cms/tracy-joomla-quickstart/tracy-business-fonts-OFL.txt` into
  `template-patches/tracy_business/fonts/OFL.txt` when the next `tracy-business/j6` version is cut
  (gate `quickstart-overrides` pins every file of the patch to a released profile).

- `packages/fleet/tracy-fleet-operation/package.json` still says `UNLICENSED`: that package was being
  edited by another change line on 26/10/2026; set it to `MIT`.
- `packages/ui/tracy-ui/icons/{models,providers,platforms}`: the SVG artwork was copied from tracy-desk
  on 07/09/2026 and its upstream source is not recorded. Record the source and its licence (LobeHub
  icons, MIT, is the likely one) before relying on it.
- `vendor/emdash/emdash-smtp/package.json` has no `license` field upstream; its `LICENSE` is MIT.
- The skill trees whose home is a JoomlArt repository (`tracy-emdash-skill`, `joomlart-t4-skill`) got
  `LICENSE`/`NOTICE.md` changes here; push the same changes to their home repositories, or the next
  pull overwrites them.
