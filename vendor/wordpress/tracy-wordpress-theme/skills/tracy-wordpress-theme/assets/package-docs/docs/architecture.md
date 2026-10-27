# Architecture

DOCS_REQUIRED: Name the theme's build origin (generator, source theme, overlay), the custom
templates and what each is for, the blocks it registers, the PHP it loads from inc/, and the
plugins the site depends on.

Read ../AGENTS.md. This is a WordPress block theme: HTML templates made of blocks, styled by
`theme.json`, with PHP only for registration and hooks. Single language; the REST API is
WordPress core (`/wp-json/wp/v2/`) with nothing added by the theme.

## What is a file and what is a row

| Thing | In the theme (files, replaced on update) | In the database (survives update) |
| --- | --- | --- |
| Page/post body | — | `post_content` of the post, block markup |
| Template (`page`, `single`, `front-page` …) | `templates/<name>.html` | `wp_template` post when edited in the Site Editor — **shadows the file** |
| Template part (`header`, `footer`) | `parts/<name>.html` | `wp_template_part` post — **shadows the file**; a seeder writes these to fill navigation refs |
| Pattern (a section) | `patterns/<name>.php`, registered from its header | inserted copies live in `post_content`; a **synced** pattern is a `wp_block` post |
| Navigation | — | `wp_navigation` post; a `core/navigation` block points at it by `ref` |
| Global styles (Site Editor > Styles) | `theme.json` + `styles/<variation>.json` | `wp_global_styles` post holding the chosen variation and any override |
| Site identity | — | options `blogname`, `blogdescription`, `site_logo`, `show_on_front`, `page_on_front` |
| Theme settings | — | options with the theme's prefix (see generated/inventory.md, "Options read") |

WordPress behaviour these rows rely on: templates and parts —
https://developer.wordpress.org/themes/templates/templates/ and
https://developer.wordpress.org/themes/templates/template-parts/; the template hierarchy that
picks one — https://developer.wordpress.org/themes/templates/template-hierarchy/; patterns —
https://developer.wordpress.org/themes/patterns/registering-patterns/; the navigation fallback
when a block has no `ref` — https://developer.wordpress.org/reference/classes/wp_navigation_fallback/;
theme.json — https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/.

## How a request is answered

1. WordPress resolves the URL to a post, archive, search or 404 (permalinks in the database).
2. The template hierarchy picks `templates/<name>.html` — unless a `wp_template` row of that
   name exists, which wins. Pages may name a custom template (`customTemplates` in theme.json).
3. The template's `core/template-part` blocks pull `header`/`footer` — from the `wp_template_part`
   row when one exists, else from `parts/`.
4. `core/post-content` prints the post's block markup; each block renders; `core/block` with a
   `ref` prints the synced pattern; `core/navigation` with a `ref` prints the menu.
5. `theme.json`, the active variation and the global-styles row become the `--wp--preset--*`
   variables; the theme's stylesheets under `assets/css/` are written against those variables.

## Theme layout

```
style.css          header: name, version, Requires at least / Tested up to / Requires PHP, Text Domain, Update URI
theme.json         settings (palette, fonts, sizes, spacing, layout, custom), styles, customTemplates, templateParts
styles/*.json      style variations, one per design system
templates/*.html   block templates; parts/*.html the header and footer
patterns/*.php     sections; each editable block carries metadata {"role":"content","name":"<type>.<field>"}
blocks/*/          custom blocks (block.json + render.php), registered from inc/
functions.php      shared helpers and hooks; inc/*.php loaded from it
assets/css, js     stylesheets and scripts enqueued by functions.php / inc/
```

generated/inventory.md lists every file of those kinds with the facts read from them.
