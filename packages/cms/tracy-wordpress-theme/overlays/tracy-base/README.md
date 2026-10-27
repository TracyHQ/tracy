# Tracy Base

The Tracy company site as a WordPress block theme: light and dark, every section an editable
pattern, the Apple look by default and the Airbnb look as a second style. Requires WordPress 7.0
and PHP 8.1; the contact page needs Contact Form 7.

This directory ships inside the theme zip and is generated whole by `@tracy/wordpress-theme`
(`node scripts/build.mjs --target tracy-base`): the source theme `tracy`, the overlay
`overlays/tracy-base/` on top, and the generated `theme.json` and `styles/` for the two design
systems. Change the overlay and rebuild; a hand edit here is overwritten by the next build and,
on an installed site, by the next theme update.

- `AGENTS.md` — read first when maintaining an installed site: rules, where content lives, what
  not to edit.
- `docs/` — architecture, install, content model, content rules, design system, checks and
  recovery; `docs/generated/inventory.md` is the file inventory at build time.
- `readme.txt` — the WordPress-format readme and copyright.
- `patterns/section-*.php` — the 21 Tracy Base sections; `patterns.map.json` (not shipped)
  maps the Joomla source's blocks onto them for the seeder.

Licence: GPL-2.0-or-later for the theme; design tokens derived from the OpenDesign design-system
library, Apache-2.0.
