---
name: t4-framework-knowledge
description: >-
  Use when a Joomla site's inventory lists a T4 extension: how T4's plugin and template pair, where
  customizations survive updates (local/), the compiled-asset cache, the layout params.
version: 1.0.0
platforms: joomla
provenOn: joomlart.com
---

# T4 Framework, for the agent who meets one

This is an extension pack (ADR 0075 amendment): it reaches a site because that site's own
inventory lists a T4 extension, not because every Joomla site needs it. Site-specific facts —
which template, which version — are NOT here; they live in `TracyWork/agents/surface/stack.json`
and `inventory.json`, and only those may be quoted as facts about the site.

## What T4 is

- JoomlArt's template framework, successor of T3: a system plugin (`plg_system_t4`) plus
  templates built on it (`tpl_t4blank` and the JA templates released since ~2019).
- The **plugin and the template are a pair**: the template's front end renders through the
  plugin. Disabling or uninstalling `plg_system_t4` breaks every T4 template on the site — check
  the pairing before touching either, and update them together.
- T3 and T4 can coexist on one site (an old template still on T3, a newer one on T4). The
  inventory says which; do not assume one implies the other.

## Where customizations survive — and where they die

- `templates/<template>/local/` is the **only update-safe home**: `local/css/custom.css`,
  `local/scss/` variable overrides, and layout/override files placed there shadow the template's
  own. A template update overwrites everything else in the template folder.
- Standard Joomla `html/` output overrides still work as on any Joomla site; T4's `local/` sits
  on top of that, not instead of it.
- Finding hand edits outside `local/` on a client site is a finding in itself: they are one
  update away from being lost, and worth flagging before any update talk.

## The template style holds the layout

- The layout builder, megamenu, ThemeMagic colors and per-style options live as JSON **in the
  template style** (Joomla's `#__template_styles` params), not in files. Copying template files
  to another site does not carry the customer's layout — the style params must travel too.
- One template can have several styles assigned to different menu items; "the page looks
  different over there" is often two styles, not a bug.

## The compiled-asset cache

- T4 compiles SCSS and serves the result from an asset cache folder at the webroot (`t4-assets/`;
  T3 sites have `t3-assets/`). After changing SCSS, options, or updating the template, a stale
  cache shows the OLD styling — clear it (template settings → rebuild assets) before declaring a
  change failed.
- Trap seen on a real client site: a stray `.gitignore` inside the webroot swallowing the asset
  folder, so a repo snapshot silently lacks what the live site serves.

## Rules of engagement on a Tracy site

- Style work goes to `local/`, layout work to the template style params, output changes to
  `html/` overrides — never edits to the template's own SCSS or PHP.
- State facts come from the site's data: `stack.json` (the active template rides there) and
  `inventory.json` first, tool answers second, memory never.
