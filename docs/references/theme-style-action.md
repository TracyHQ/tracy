---
description: The `theme.style` action a Tracy site component must implement so a build can choose one of the 152 looks on a site it just created — what it receives, what it must do on WordPress and Joomla, and how it must refuse.
sources:
  - packages/cms/tracy-wordpress-theme/src/tracy/functions.php
  - apps/tracy-web/src/seats/route.js
  - packages/site/tracy-site-build-wordpress/src/host/stages.mjs
  - packages/site/tracy-site-build-joomla/src/host/stages.mjs
---

# `theme.style` — choosing one style of an installed theme

A request sent to **the component on the customer's site** (the Tracy plugin), written 08/09/2026 when the *Create with* flow
started building new sites ([`tasks/todo-build-new-site.md`](../../tasks/todo-build-new-site.md) §B3).
Tracy's side has opened the path: the seat ledger accepts the action at the `code` level, the `tracy_site` tool lists it, the engine calls it. Only
the component does not know this action yet, and while it does not, it answers "unknown action" — a
readable refusal, not a silent write into the wrong place.

## Why it must be a separate action

Installing a theme already has `theme.install` and `theme.activate`. But the `tracy` theme carries **152 styles**, and
building a site from a design inspiration means **choosing exactly one style** among them. No existing door
can do that:

- `content.update` gates by *kind*, and WordPress has no kind describing global styles. The seat ledger knows
  `post`, `postmeta`, `option` — none of them is where styles are stored.
- `themeFiles.update` is a **Shopify** door (ADR 0069), writing a batch of files onto a store's draft. It
  means nothing on WordPress or Joomla.

## The contract

```
action: 'theme.style'
params: { theme: 'tracy', style: '<id>' }      # WordPress
params: { template: 'tpl_tracy', style: '<id>' }  # Joomla — or use content.update kind templateStyle
```

`style` is a design inspiration id: only `a-z`, `0-9`, `-`. The component **must** refuse an id not
matching `^[a-z0-9-]+$` rather than joining it into a path.

## What WordPress must do

Exactly what `tracy_apply_inspiration()` in the theme already does — copied here so the component does not
have to guess, because each of the following steps has broken once:

1. Read the theme's `styles/<id>.json`, falling back to `wp-content/uploads/tracy/styles/<id>.json` (the Tracy variation
   written at site build time — the brand's system, ADR 0023; `inc/variations.php`), with `wp_json_file_decode`. Present in
   neither → refuse. The list of systems a site can wear = the theme's `inspirations.json` merged with
   `uploads/tracy/inspirations.json` (a written row overrides a shipped row with the same id).
2. Drop `$schema` and `title`, set `isGlobalStylesUserThemeJSON = true`.
3. Get the user's global styles post id (`WP_Theme_JSON_Resolver::get_user_global_styles_post_id()`),
   building it from `get_user_data_from_wp_global_styles` if absent.
4. **Attach the `wp_theme` term** to that post (`wp_set_object_terms`). A post created with nobody signed in
   lacks the term, and the resolver never finds it — each call creates yet another post.
5. **Lift the two kses filters** (`wp_filter_post_kses`, `wp_filter_global_styles_post` on
   `content_save_pre`) for exactly that write, then re-attach them. Without lifting them the filters strip the JSON down to
   only the layout, and the style looks applied while changing nothing.

On Tracy's side, after `theme.style` returns `ok: true`, `tracy_site` rewrites the site's `docs/agents/design.json`
— the system it wears and the values of its 56 tokens ([ADR 0023](../adr/0023-site-bound-to-a-design-system.md));
without rewriting it, the compliance check (the next step of `tasks/todo-he-thiet-ke-site-khach.md`) measures the old palette from the next edit on.

## Joomla

A template style is a `#__template_styles` row. The seat ledger already has the `templateStyle` kind at the `code` level,
so `content.update` can do it — the component only needs to accept `{ kind: 'templateStyle', template, style }`.
If the component finds a separate action cleaner, `theme.style` accepts the same shape too.

## How to refuse

- Unknown action → `{ ok: false, code: 'UNKNOWN_ACTION', error: '…' }`. The engine reads that sentence and shows it
  verbatim to the customer; it is a sign the component needs upgrading, not a bug to chase.
- No such style in the theme → `{ ok: false, code: 'NO_SUCH_STYLE' }`.
- Theme not installed → `{ ok: false, code: 'THEME_NOT_INSTALLED' }`.

## Tracy's side is ready

| Place | State |
|---|---|
| `APPLY_RULES` in `workers/seat-registry` | `['theme.style', 'code']` — Editors are refused, with a test |
| `RELAY_ACTIONS` of `@tracy/dsh-site-tools` | listed |
| The `style` stage of `tracy-site-build` | calls `theme.style` (WordPress) · `content.update` kind `templateStyle` (Joomla) when the job targets another site |
