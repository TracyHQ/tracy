# Third-party notices

## Scope of the root licence

The root `LICENSE` (MIT) covers the code and documentation written for Tracy.
It does not relicense anything below. Parts of this repository are other people's work, or
JoomlArt's work, and keep their own licence: a folder with its own `LICENSE` or `COPYING` file is
governed by it, and a package's `package.json` `license` field names its SPDX identifier. The full
map — path, origin, licence, right to distribute and what to keep — is in
[`docs/licensing.md`](docs/licensing.md).

Licences other than MIT that appear in this repository:

| Licence | Where |
|---|---|
| GPL-2.0-or-later | JoomlArt code and assets (T4 Framework, T4 shared layer, JA Kinetic, `wp-ja-*` theme ports, JoomlArt quickstart content), `packages/cms/tracy-joomla-template`, `tracy-wordpress-theme`, `tracy-joomla-quickstart`, `tracy-wordpress-quickstart`, `tracy-emdash-theme-saas` |
| GPL-3.0-or-later | `vendor/emdash/emdash-theme-bravada` and its derivatives (`emdash-theme-tracy-editorial`, `emdash-theme-tracy-coral`), `packages/cms/tracy-emdash-theme-business`, `tracy-emdash-theme-base`, Akeeba Backup/Kickstart |
| GPL-3.0-only | `vendor/tracy/dsh-passwords` |
| AGPL-3.0 | `vendor/tracy/dsh-better-locale` |
| Apache-2.0 | `vendor/tracy/od-design-system`, `od-brand-engine`, `od-skill` (OpenDesign), `packages/wo/website-opportunities` |
| BSD-3-Clause | native packages inside `vendor/tracy/deepseek-harness` |
| SIL OFL 1.1 / CC BY 4.0 | bundled fonts and icon fonts (licence file next to each) |
| Refero data | `vendor/tracy/refero` — distributed under a separate agreement with Refero, not under MIT |

## JoomlArt

T4 Framework, JA templates and quickstarts, and the JoomlArt skills are Copyright (C) J.O.O.M
Solutions Co., Ltd. (JoomlArt). JoomlArt released them for this repository on 26/10/2026: code and
assets under GPL-2.0-or-later, skill documentation under MIT. Some files kept byte for byte inside
archives still carry an older "Copyrighted Commercial Software" header; that header is superseded by
the grant for copies distributed from this repository.

## Attribution notices

Upstream copyright and licence notices are kept in the trees they came with. The main ones:

- deepseek-harness — Copyright (c) 2026 DeepSeek, MIT (`vendor/tracy/deepseek-harness/LICENSE`).
- dsh-passwords — slywalker2006, GPL-3.0-only (`vendor/tracy/dsh-passwords/LICENSE`).
- dsh-better-locale — Copyright (C) 2026 huanlinoto, AGPL-3.0 (`vendor/tracy/dsh-better-locale/LICENSE`).
- DSH better sidebar — Copyright (c) 2026 dsh-external, MIT.
- dsh-locale-vi — Copyright (c) 2026 PhuVinhAI, MIT.
- dsh-subscriptions — Copyright (c) 2026 GooDAnDReaDY, MIT.
- Matt Pocock skills — Copyright (c) 2026 Matt Pocock, MIT.
- OpenDesign (`nexu-io/open-design`) — Apache-2.0, see each tree's `NOTICE`.
- EmDash — Copyright 2026 Cloudflare Inc., MIT.
- Bravada for Astro — © 2026 vhs, a port of Bravada © 2020–25 Cryout Creations, GPL-3.0-or-later
  (`CREDITS.md` in each derived theme).
- Lexington Themes (astro-image-inspector, astro-skills), Mason James (emdash-human-sitemap,
  emdash-page-list, emdash-smtp), Bruno Meilick (emdash-mika), Joost de Valk (emdash-plugin-seo) — MIT.
- scssphp — Copyright (c) 2015 Leaf Corcoran, MIT.
- Akeeba Backup Core and Kickstart — Copyright (c) 2008-2025 Nicholas K. Dionysopoulos / Akeeba Ltd,
  GPL-3.0-or-later.
- Joomla! — Copyright (C) 2005 - 2026 Open Source Matters, Inc., GPL-2.0-or-later.
- Font Awesome (Fonticons, Inc.; Dave Gandy) — fonts SIL OFL 1.1, icons CC BY 4.0, code MIT.
- Ionicons (Ionic / Drifty) — MIT.
- Font families bundled in themes (Archivo, Alegreya, Be Vietnam Pro, Eczar, Golos Text,
  IBM Plex Sans, Inter, Inter Tight, JetBrains Mono, Jost, Newsreader, Noticia Text, Noto Serif,
  Playfair Display, PT Root UI, Readex Pro, Roboto, Roboto Mono, Saira, Space Grotesk, Teko,
  Work Sans) — SIL OFL 1.1, copyright of their project authors as listed in each `OFL.txt`.
- shadcn/ui components — MIT (`src/components/ui/PROVENANCE.md` of each EmDash theme).

npm dependencies are not vendored; their licences are those declared in `pnpm-lock.yaml` and in each
package.

## Trademarks

Names, logos and marks of third parties appear in this repository only to identify their products:

- AI vendor, model, CMS and platform logos in `packages/ui/tracy-ui/icons/{models,providers,platforms}`
  (for example Anthropic, Claude, OpenAI, Google, Gemini, DeepSeek, Meta, Microsoft, Mistral,
  WordPress, Joomla).
- Design-system names in `vendor/tracy/od-design-system` and `vendor/tracy/refero` that refer to
  brands (for example `apple`, `airbnb`, `stripe`, `nike`). These packages describe a design style
  *inspired by* those products; they are not the brands' own assets.
- The JoomlArt and "Tracy by JoomlArt" wordmarks in `docs/design/brand/cobrand/`, used with JoomlArt's
  permission.

All trademarks are the property of their respective owners. Their use here does not imply any
affiliation with or endorsement by them, and the licences in this repository grant no right to use
them.
