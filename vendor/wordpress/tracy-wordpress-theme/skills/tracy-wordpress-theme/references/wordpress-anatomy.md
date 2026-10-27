# Standard WordPress theme — reference (measured 13/09/2026)

Sources are taken only from developer.wordpress.org, make.wordpress.org, wordpress.org, github.com/WordPress/*,
wordpress.github.io/wordpress-playground, wpaccessibility.org (the official documentation site of the Accessibility
Team, linked from make.wordpress.org/accessibility). Every line ends with the source URL. Where something could only be
measured by command (curl / GitHub API), it says "measured".

---

## 1. Current version and what each version adds for theme authors

### Timeline

- **Latest version: WordPress 7.1 "Mary Lou", released 19/08/2026** (launched at WordCamp US). 800+ contributors, 1,500+ changes. https://wordpress.org/news/2026/08/mary-lou/
- **7.1.1** scheduled for 17/09/2026 15:00 UTC (not out at the time of measuring). https://make.wordpress.org/core/2026/09/02/wordpress-7-1-1-release-schedule/
- **7.0 "Armstrong", 20/05/2026** — "opens the AI era", Abilities API, Command Palette, client-side media processing. https://wordpress.org/news/2026/05/armstrong/ · https://make.wordpress.org/core/7-0/
- **7.2** expected 8–10/12/2026, **with a new default theme** (design lead Henrique Iamarino). https://make.wordpress.org/core/7-2/
- **6.9** released 12/2025 (Field Guide 25/11/2025). https://make.wordpress.org/core/2025/11/25/wordpress-6-9-field-guide/
- **6.8** (Field Guide 28/03/2025). https://make.wordpress.org/core/2025/03/28/wordpress-6-8-field-guide/
- **6.7** (Field Guide 23/10/2024) — shipped Twenty Twenty-Five. https://make.wordpress.org/core/2024/10/23/wordpress-6-7-field-guide/
- **6.6** (Field Guide 25/06/2024). https://make.wordpress.org/core/2024/06/25/wordpress-6-6-field-guide/
- **6.5** (Field Guide 15/03/2024). https://make.wordpress.org/core/2024/03/15/wordpress-6-5-field-guide/

### Default theme — there is NO Twenty Twenty-Six

- 6.9 **skipped** the default theme ("skip a default theme both due to block themes continue to mature and the timing of the release"); the next default theme is **Twenty Twenty-Seven, shipping with 7.2** ("the default theme ships with the last release of the year"). https://make.wordpress.org/core/2026/03/13/twenty-twenty-seven/
- Measured: `github.com/WordPress/twentytwentysix` → 404; `wordpress.org/themes/twentytwentysix/` → 404; the `src/wp-content/themes` folder of `WordPress/wordpress-develop@trunk` stops at `twentytwentyfive`. https://api.github.com/repos/WordPress/wordpress-develop/contents/src/wp-content/themes
- The 7.0 release post does not mention "default theme" or any "Twenty". https://wordpress.org/news/2026/05/armstrong/
- ⚠ The page `make.wordpress.org/core/7-0/`, when summarised automatically, returns the sentence "TT6 ships with 7.0" — wrong against the three pieces of evidence above; **do not use it**.
- **Twenty Twenty-Five is the current default theme, version 1.5** (updated 20/05/2026, `Tested up to: 7.1`, `Requires at least: 6.7`, `Requires PHP: 7.2`), 1M+ active installs, 16 style variations. https://wordpress.org/themes/twentytwentyfive/ · https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-content/themes/twentytwentyfive/style.css

### Features by version (only what touches theme authors)

**6.5**
- Interactivity API in core (directives `data-wp-*`, `store()`, `wp_interactivity_state()`, script module `@wordpress/interactivity`, declare `viewScriptModule` in block.json). https://make.wordpress.org/core/2024/03/04/interactivity-api-dev-note/ · https://developer.wordpress.org/block-editor/reference-guides/interactivity-api/
- Font Library: users install fonts through the editor; fonts are stored in **`wp-content/fonts`** (changed with the `font_dir` filter); post type `wp_font_face`; `wp_register_font_collection( $slug, $config )` with `name`, `description`, `font_families`, `categories`; turn the UI off with `block_editor_settings_all` → `fontLibraryEnabled = false`. https://make.wordpress.org/core/2024/03/14/new-feature-font-library/
- Block Bindings API: connects a core block's attributes to a custom field / dynamic source. https://make.wordpress.org/core/2024/03/06/new-feature-the-block-bindings-api/
- Classic themes can opt in to `appearanceTools`. https://make.wordpress.org/core/2024/03/15/wordpress-6-5-field-guide/

**6.6**
- **theme.json `version: 3`**: adds `settings.typography.defaultFontSizes` and `settings.spacing.defaultSpacingSizes` (set `false` to reuse your own `small/medium/large/x-large` slugs); `spacingSizes` and `spacingScale` now **merge** instead of excluding each other. https://make.wordpress.org/core/2024/06/19/theme-json-version-3/
- **Section styles / block style variations as partial theme.json**: a `styles/*.json` file with `slug`, `title`, `blockTypes: [...]`, `styles: {...}`; or `register_block_style( ['core/group','core/columns'], ['name'=>..., 'style_data'=>[...]] )`; `styles.variations` in theme.json still works but is "not recommended". https://make.wordpress.org/core/2024/06/24/section-styles/
- **Color / typography variations**: a file in `styles/` that holds only colors or only typography is recognised automatically as a color/typography variation (**by content, not by folder name**); `styles/` **may have subfolders**, any name (the post suggests `color/`, `typography/`, `block/` or `section/`). https://developer.wordpress.org/news/2024/07/mixing-and-matching-styles-colors-and-typography-in-wordpress-6-6/
- Grid layout, uniform CSS specificity, site-wide background image in theme.json. https://make.wordpress.org/core/2024/06/18/grid-layout-type/ · https://make.wordpress.org/core/2024/06/21/wordpress-6-6-css-specificity/ · https://make.wordpress.org/core/2024/06/20/site-wide-background-images-in-wordpress-6-6/

**6.7**
- `register_block_template( 'plugin_uri//slug', ['title','description','content','post_types'] )` + `unregister_block_template()` — **for plugins**; themes still use the `templates/` folder, and a theme's template **overrides** a plugin's template. Template parts not supported yet. https://make.wordpress.org/core/2024/10/20/new-plugin-template-registration-api-in-wordpress-6-7/
- Block Hooks extended; Block Bindings gets a UI; Twenty Twenty-Five. https://make.wordpress.org/core/2024/10/21/updates-to-block-hooks-in-wordpress-6-7/ · https://make.wordpress.org/core/2024/10/23/wordpress-6-7-field-guide/

**6.8**
- Updated "design tools per block" roster; Speculative Loading; 40px UI standard. https://make.wordpress.org/core/2025/03/12/roster-of-design-tools-per-block-wordpress-6-8-edition/ · https://make.wordpress.org/core/2025/03/06/speculative-loading-in-6-8/

**6.9**
- New blocks: Accordion, Math, Terms Query, Comments Link/Count; Heading & Time-to-read upgraded. https://make.wordpress.org/core/2025/11/25/wordpress-6-9-field-guide/
- **Hiding blocks** (`supports.visibility`; a hidden block is dropped from the markup entirely, its script/style is not loaded either). https://make.wordpress.org/core/2025/12/01/ability-to-hide-blocks/
- block.json accepts only `apiVersion: 3` for new/updated blocks (preparing to iframe the whole post editor in 7.0). https://make.wordpress.org/core/2025/11/12/preparing-the-post-editor-for-full-iframe-integration/
- Old IE code removed (conditional comments). https://make.wordpress.org/core/2025/11/19/legacy-internet-explorer-code-removed/

**7.0**
- theme.json: **pseudo-classes** `:hover` `:focus` `:focus-visible` `:active` directly on blocks and on block style variations. https://make.wordpress.org/core/2026/03/09/pseudo-element-support-for-blocks-and-their-variations-in-theme-json/
- Dimensions: `height`/`width` block support, `text indent`, preset dimensions. https://make.wordpress.org/core/2026/03/15/dimensions-support-enhancements-in-wordpress-7-0/
- Pattern Overrides for custom blocks through the `block_bindings_supported_attributes` filter; patterns run `contentOnly` by default (a theme opts out with the setting `disableContentOnlyForUnsyncedPatterns`; nested blocks need `"role": "content"` to be editable). https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/
- **Navigation overlay** built from blocks/patterns in the Site Editor, block `Navigation Overlay Close`. https://make.wordpress.org/core/2026/03/04/customisable-navigation-overlays-in-wordpress-7-0/
- Block visibility per device (responsive editing). https://make.wordpress.org/core/2026/03/15/block-visibility-in-wordpress-7-0/
- A separate font management page, for block/hybrid/classic themes alike; block-level custom CSS; Heading/Breadcrumbs/Icons blocks, Gallery lightbox slideshow, video as Cover background. https://wordpress.org/news/2026/05/armstrong/
- Interactivity API: `watch()`, `data-wp-watch`, `state.url` filled server-side. https://make.wordpress.org/core/2026/02/23/changes-to-the-interactivity-api-in-wordpress-7-0/
- Deprecated: `add_theme_support('html5')` (removed), default `title` attribute on author links. https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/

**7.1**
- **Responsive styles in theme.json**: keys `@mobile`, `@tablet` nested in `styles.blocks.<block>` (there is no `@desktop`; the base style is desktop); breakpoints configured in `settings.viewport: { "mobile": "30rem", "tablet": "45rem" }` (default mobile `width <= 480px`, tablet `480px < width <= 782px`). https://make.wordpress.org/core/2026/08/05/responsive-block-styles-and-configurable-viewports-in-wordpress-7-1/
- **Pseudo & custom states**: `":hover"` … for Button and Navigation Link; custom states take a `-` prefix (currently only `"-current"` of `core/navigation-link`); nestable viewport → custom state → pseudo. https://make.wordpress.org/core/2026/08/05/pseudo-and-custom-style-states-in-wordpress-7-1/
- Text shadow in Global Styles. https://make.wordpress.org/core/2026/07/23/text-shadow-support-in-global-styles/
- Design System Theming (`@wordpress/theme`, tokens following W3C Design Tokens) — for the **admin/editor UI**, not the front end of a customer theme. https://make.wordpress.org/core/2026/07/31/design-system-theming-in-wordpress-7-1/
- New blocks Playlist, Tabs; SVG Icon API; admin bar persists across every editor. https://wordpress.org/news/2026/08/mary-lou/ · https://make.wordpress.org/core/2026/08/05/wordpress-7-1-field-guide/

---

## 2. Block theme anatomy (Theme Handbook)

### Required / optional files

- Exactly **two** files are required: `style.css` (header metadata) and `templates/index.html` (fallback template). https://developer.wordpress.org/themes/core-concepts/theme-structure/
- The presence of `templates/index.html` is how WordPress recognises a theme as a block theme. https://developer.wordpress.org/themes/templates/templates/
- Standard folders (optional): `parts/`, `patterns/`, `styles/`, `templates/`, `assets/` (css/images/js), `inc/`. The full example tree in the handbook also has `functions.php`, `theme.json`, `screenshot.png`, `README.txt`, `LICENSE.md`, `CHANGELOG.md`, `package.json`, `.editorconfig`. https://developer.wordpress.org/themes/core-concepts/theme-structure/
- The Theme Review Team (submitting to wordpress.org) requires a block theme to have `style.css`, `readme.txt`, `theme.json`, `templates/index.html`; templates must close their tags fully. https://make.wordpress.org/themes/handbook/review/required/

### `style.css` header — exact field names

- **Required**: `Theme Name`, `Description`, `Version` (X.X or X.X.X), `Author`, `Text Domain`, `Tested up to` (X.X), `Requires at least` (X.X), `Requires PHP` (X.X), `License`, `License URI`. **Optional**: `Theme URI`, `Author URI`, `Tags`, `Domain Path` (default `/languages`), `Template` (child theme only; must match the parent's **folder name**). https://developer.wordpress.org/themes/core-concepts/main-stylesheet/
- Theme Review also lists exactly that set of headers as required. https://make.wordpress.org/themes/handbook/review/required/
- Real example (TT5 1.5): `Requires at least: 6.7 / Tested up to: 7.1 / Requires PHP: 7.2 / Version: 1.5 / Text Domain: twentytwentyfive / Tags: one-column, custom-colors, …, full-site-editing, block-patterns, …, block-styles, style-variations, accessibility-ready, blog, portfolio, news`. https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-content/themes/twentytwentyfive/style.css

### `functions.php`

- Optional; "acts like a WordPress plugin", loaded automatically when the theme is active. Block themes are "often automatically opted into the features needed", so a setup function is usually unnecessary; there is not even a need to enqueue scripts/styles. https://developer.wordpress.org/themes/core-concepts/custom-functionality/
- In practice TT5 uses it for 5 things: `add_theme_support('post-formats', …)`, `add_editor_style(...)`, `wp_enqueue_style('twentytwentyfive-style', get_parent_theme_file_uri('style.css'), …)`, `register_block_style('core/list', [...])`, `register_block_pattern_category(...)`, `register_block_bindings_source(...)`. https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/functions.php

### `screenshot.png`, `readme.txt`

- Screenshot **at most 1200 × 900 px, 4:3 ratio**, must not look like an advertisement. https://make.wordpress.org/themes/handbook/review/required/
- `readme.txt` is required on submission, following the "plugin directory's readme.txt markdown format". https://developer.wordpress.org/themes/releasing-your-theme/writing-documentation/
- Real layout (TT5): `=== Twenty Twenty-Five ===` / `Contributors:` / `Requires at least:` / `Tested up to:` / `Requires PHP:` / `Stable tag:` / `License:` / `License URI:` then `== Description ==`, `== Changelog ==`, `== Copyright ==` (lists GPL + "This theme bundles the following third-party resources:"). https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/readme.txt
- ⚠ The page `releasing-your-theme/required-theme-files/` still lists `index.php`, `comments.php` — that is **classic** content not yet updated; for block themes take the Review Team's Required page as the standard. https://developer.wordpress.org/themes/releasing-your-theme/required-theme-files/

### Template hierarchy (`.html` files in `templates/`)

- front page: `front-page.html` → (home or page hierarchy). home: `front-page.html` → `home.html` → `index.html`. https://developer.wordpress.org/themes/templates/template-hierarchy/
- single: `{custom-template}.html` → `single-{post_type}-{post_name}.html` → `single-{post_type}.html` → `single.html` → `singular.html` → `index.html`. (same URL)
- page: `{custom-template}.html` → `page-{post_name}.html` → `page-{post_id}.html` → `page.html` → `index.html`. (same URL)
- category: `category-{slug}.html` → `category-{id}.html` → `category.html` → `archive.html` → `index.html`; tag / author (`author-{user_nicename}`, `author-{user_id}`) / taxonomy (`taxonomy-{taxonomy}-{term}`, `taxonomy-{taxonomy}`) / date (`date.html`) / CPT archive (`archive-{post_type}.html`) all fall back to `archive.html` → `index.html`. (same URL)
- attachment: `{mime_type}-{sub_type}.html` → `{sub_type}.html` → `{mime_type}.html` → `attachment.html` → single hierarchy. search: `search.html` → `index.html`. 404: `404.html` → `index.html`. (same URL)

### Template parts

- Every part lives **directly in `parts/`**; subfolders are not supported. Declared in `theme.json` → `templateParts[]` with `name` (file name without extension), `title`, `area`. Default `area` values: `header`, `footer`, `uncategorized` (shown as "General"); add areas with the `default_wp_template_part_areas` hook. https://developer.wordpress.org/themes/templates/template-parts/ · https://developer.wordpress.org/themes/global-settings-and-styles/template-parts/
- Called in a template: `<!-- wp:template-part {"slug":"header","tagName":"header"} /-->`; attributes of `core/template-part`: `slug`, `theme`, `tagName`, `area`. https://developer.wordpress.org/block-editor/reference-guides/core-blocks/

### Pattern — PHP file header in `patterns/`

- Fields: `Title`, `Slug` (`namespace/pattern-name`), `Description` (screen readers only), `Viewport Width` (px), `Inserter` (default true; `no`/`false` to hide), `Keywords`, `Categories`, `Block Types`, `Post Types`, `Template Types`. Files in `patterns/` are **registered automatically** if the header is valid. Custom categories are created with `register_block_pattern_category( $slug, ['label','description'] )` on the `init` hook. https://developer.wordpress.org/themes/patterns/registering-patterns/
- **Starter page pattern**: `Block Types: core/post-content` + `Post Types: page` (shown in Pages > Add New). **Starter template pattern**: `Template Types:` with valid values `index, home, front-page, singular, single, page, archive, author, category, taxonomy, date, tag, attachment, search, privacy-policy, 404`. https://developer.wordpress.org/themes/patterns/starter-patterns/
- Calling a pattern in a template/part: `<!-- wp:pattern {"slug":"namespace/pattern-slug"} /-->` — rendered inline, not shown in the Inserter. https://developer.wordpress.org/themes/patterns/usage-in-templates/
- Real example: TT5's `parts/header.html` has only **one line** `<!-- wp:pattern {"slug":"twentytwentyfive/header"} /-->`; `templates/index.html` = header part + `<main>` holding 2 patterns + footer part. https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/parts/header.html · https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/templates/index.html

### Style variations (`styles/*.json`)

- An alternative theme.json, placed in `styles/`, any file name; fields `version`, `title`, `settings`, `styles` (everything theme.json has). When the user picks one, the JSON is **copied into the DB** as a user customization — a later theme update does not overwrite it. https://developer.wordpress.org/themes/global-settings-and-styles/style-variations/
- The trunk schema allows at top level: `$schema, version, title, slug, description, blockTypes, settings, styles, customTemplates, templateParts, patterns` — `title/slug/description/blockTypes` are exactly the part meant for variations/partials. Measured: https://schemas.wp.org/trunk/theme.json (redirects to https://raw.githubusercontent.com/WordPress/gutenberg/trunk/schemas/json/theme.json)
- Partial for blocks (section style): add `slug` + `blockTypes`. Real example TT5 `styles/sections/section-1.json`: `"slug":"section-1","title":"Style 1","blockTypes":["core/group","core/columns","core/column"],"styles":{...}`. https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/styles/sections/section-1.json
- A child theme with a variation file of the same basename as the parent's → only the child's is loaded. https://developer.wordpress.org/reference/classes/wp_theme_json_resolver/get_style_variations/

### `theme.json`

- Schema: `"$schema": "https://schemas.wp.org/trunk/theme.json"`; per version: `https://schemas.wp.org/wp/{{version}}/theme.json` (measured: `wp/6.9`, `wp/7.0`, `wp/7.1` all 200). https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/
- **`version` is currently `3`** (trunk schema: `"const": 3`; needs WP ≥ 6.6). The handbook's "Introduction to theme.json" still writes `"version": 2` — outdated. https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/ · https://developer.wordpress.org/themes/global-settings-and-styles/introduction-to-theme-json/
- Top-level: `settings`, `styles`, `customTemplates`, `templateParts`, `patterns` (+ `$schema`, `version`). https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/
- Important `settings`: `appearanceTools`, `useRootPaddingAwareAlignments`, `layout.contentSize` / `layout.wideSize` / `allowEditing` / `allowCustomContentAndWideSize`, `color.palette|gradients|duotone|custom|link|defaultPalette|defaultGradients|defaultDuotone`, `typography.fontFamilies|fontSizes|fluid|customFontSize|defaultFontSizes`, `spacing.spacingSizes|spacingScale|units|padding|margin|blockGap|defaultSpacingSizes`, `viewport` (7.1), `dimensions`, `background`, `border`, `shadow`, `position`, `custom`, `blocks.<name>` (per-block). https://developer.wordpress.org/block-editor/reference-guides/theme-json-reference/theme-json-living/ · https://make.wordpress.org/core/2026/08/05/responsive-block-styles-and-configurable-viewports-in-wordpress-7-1/
- `styles` (trunk schema): `background, border, color, css, dimensions, filter, outline, shadow, spacing, typography` + `elements` (`link, button, heading, h1–h6, caption, cite`), `blocks.<name>` (with `variations`, pseudo `:hover`…, `@mobile/@tablet`, custom `-current`). Measured from the trunk schema + https://make.wordpress.org/core/2026/08/05/pseudo-and-custom-style-states-in-wordpress-7-1/
- `customTemplates[]`: `name` (file name without extension, **a `templates/<name>.html` file must exist**), `title`, `postTypes` (default `["page"]`). https://developer.wordpress.org/themes/global-settings-and-styles/custom-templates/
- `patterns`: an array of slugs from the Pattern Directory (`wordpress.org/patterns/pattern/<slug>`), optional, depends on the Directory. https://developer.wordpress.org/themes/global-settings-and-styles/patterns/
- **Fluid typography**: `settings.typography.fluid: true` → every fontSize generates `clamp()`; each size is overridden with `fluid: false` or `fluid: {min, max}`. Bundled fonts: `fontFamilies[].fontFace[]` with `fontFamily`, `fontWeight` (a range `"200 800"` is allowed for variable fonts), `fontStyle`, `src: ["file:./assets/fonts/…woff2"]`. https://developer.wordpress.org/themes/global-settings-and-styles/settings/typography/ · https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/theme.json
- TT5 in practice: `settings` = `appearanceTools:true`, `color` (`defaultPalette/defaultGradients/defaultDuotone` off, 8-color palette `base, contrast, accent-1…6`), `layout` (`contentSize: 645px`, `wideSize: 1340px`), `spacing` (`defaultSpacingSizes:false`, `spacingSizes`, `units`), `typography` (`fluid:true`), `useRootPaddingAwareAlignments:true`; `styles` has `color, spacing, typography, blocks (29 blocks), elements (10)`; **no** `styles.css`, **no** `patterns`. Measured from https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/theme.json

---

## 3. Classic theme (for comparison) and recommendation

- Minimal classic: `index.php` + `style.css`; add `.php` templates (`single.php`, `page.php`, `header.php`, `footer.php`…) when it gets more complex. https://developer.wordpress.org/themes/classic-themes/your-first-theme/
- The Review Team requires of a classic theme: valid DOCTYPE, `language_attributes()`, use of `get_template_part()`/`locate_template()`, calls to `wp_head()`, `body_class()`, `wp_footer()`, `wp_body_open()`, `post_class()`, `wp_link_pages()`, `add_theme_support('title-tag')` and `'automatic-feed-links'`. https://make.wordpress.org/themes/handbook/review/required/
- Handbook: "Block themes are the modern method of building WordPress themes … it is the future of the WordPress project"; classic "still supported"; hybrid "not an official theme type … still classic themes". → A new theme should be a block theme. https://developer.wordpress.org/themes/getting-started/what-is-a-theme/
- `wp scaffold _s` (underscores) still exists — but it is classic; WP-CLI has no block theme scaffold. https://developer.wordpress.org/cli/commands/scaffold/

---

## 4. Theme Review (wordpress.org), licence, Theme Check, Unit Test data, accessibility-ready

- The Required page (14 items): Licensing & Copyright (GPL-compatible for **code, images and third-party assets alike**, combined attribution list), Privacy (tracking opt-in), Accessibility (skip link + keyboard nav for every theme), Code (no PHP/JS errors; escape/sanitize; prefix ≥4 characters), Functionality (no CPT, no shortcode, no removing the admin bar…), Plugins (only recommend plugins on wordpress.org, no bundling), Naming (no "WordPress", "Theme", "Twenty*"), Language (every string through gettext; text domain = slug), Files (no `.git`, no `.sh/.sql/.xml` except `wpml-config.xml/loco.xml/phpcs.xml`; **assets must be local, the only exception is Google Fonts with consent**), Classic, Block Themes, Settings pages, Credits/links, Upload restrictions (one theme at a time). https://make.wordpress.org/themes/handbook/review/required/
- Theme Check plugin: "Themes have to pass the Theme Check plugin without errors before they can be included". Current version `20260901`, tested 7.1, source github.com/WordPress/theme-check. https://make.wordpress.org/themes/handbook/review/required/theme-check-plugin/ · https://wordpress.org/plugins/theme-check/
- Theme Unit Test data: import `https://raw.githubusercontent.com/WPTT/theme-unit-test/master/themeunittestdata.wordpress.xml` through Tools > Import > WordPress, tick "Download and import file attachments", repeat until "All Done"; then set Reading = 5 posts/page, threaded comments 3 levels, a non-default permalink, two menus. The `WordPress/theme-test-data` repo also has `64-block-test-data.xml`, `theme-preview.xml`. https://make.wordpress.org/themes/handbook/review/theme-unit-test/ · https://github.com/WordPress/theme-test-data
- Theme tags: `translation-ready` (required), `full-site-editing`, `block-patterns`, `block-styles`, `style-variations`, `template-editing`, `wide-blocks`, `editor-style`, `accessibility-ready`, `custom-logo`, `custom-menu`… at most 3 subjects (`blog, e-commerce, education, entertainment, food-and-drink, holiday, news, photography, portfolio`). https://make.wordpress.org/themes/handbook/review/required/theme-tags/
- **accessibility-ready changed its rules on 06/05/2026**: new guidelines at https://wpaccessibility.org/docs/topics/theme-guidelines/ (18 requirements: skip link, landmarks, keyboard, accessible name/role/state, form labels, headings, underlined links, unambiguous links, contrast, alt, media, **reflow/resize/text spacing**, **no unexpected change of context**, warning when opening a new tab, **hover/focus content accessible**, **accessibility statement**, **no requiring plugins that lack a11y**, `.screen-reader-text`); themes carrying the tag must update, deadline 30/06/2026 (extended). https://make.wordpress.org/accessibility/2026/05/06/accessibility-ready-requirements-updated/ · https://make.wordpress.org/accessibility/2026/07/23/accessibility-ready-theme-reviews-extending-the-deadline/ · https://make.wordpress.org/themes/handbook/review/accessibility/

---

## 5. Tooling

| Tool | What it does | URL | Command |
|---|---|---|---|
| WP-CLI `wp scaffold` | `child-theme`, `_s` (classic), `block`, `plugin`, `post-type`, `taxonomy`, `theme-tests` — **no block theme scaffold** | https://developer.wordpress.org/cli/commands/scaffold/ | `wp scaffold child-theme sample-theme --parent_theme=twentytwentyfive` (https://developer.wordpress.org/cli/commands/scaffold/child-theme/) |
| WP-CLI `wp theme` | `install <theme\|zip\|url>`, `activate`, `list`, `delete`, `mod`, `status`, `update`, `path`, `search`, `enable`, `is-active`, `get`, `auto-updates` | https://developer.wordpress.org/cli/commands/theme/ | `wp theme install ../my-theme.zip --activate` (https://developer.wordpress.org/cli/commands/theme/install/) |
| WP-CLI `wp import` | Imports WXR; `--authors=create\|skip\|mapping.csv`; `--rewrite_urls` needs WordPress Importer ≥ 0.9.1 | https://developer.wordpress.org/cli/commands/import/ | `wp import content.xml --authors=create` |
| WP-CLI `wp i18n make-pot` | Scans PHP/JS/style.css/**theme.json** into a POT (`--skip-theme-json`, `--domain`, `--exclude`) | https://developer.wordpress.org/cli/commands/i18n/make-pot/ | `wp i18n make-pot . languages/my-theme.pot` |
| Create Block Theme (plugin) | Creates a blank theme / clone / child / style variation; **saves editor changes back to the theme files**; exports a ZIP; manages fonts; edits style.css metadata. Version 2.10.1, needs WP ≥ 6.8, tested 6.9.7. Reached from the icon next to the Save button in the Editor (the Appearance > Create Block Theme page is deprecated) | https://wordpress.org/plugins/create-block-theme/ | `wp plugin install create-block-theme --activate` |
| `@wordpress/create-block` | Scaffolds a **plugin that registers a block** — not a theme; the docs advise shipping blocks in a plugin so they are not lost when the theme changes | https://developer.wordpress.org/block-editor/reference-guides/packages/packages-create-block/ | `npx @wordpress/create-block@latest todo-list` |
| `@wordpress/scripts` | `build`, `start`, `lint-js`, `lint-style`, `format`, `packages-update`, `plugin-zip`; aimed at blocks/plugins | https://developer.wordpress.org/block-editor/reference-guides/packages/packages-scripts/ | `npm install @wordpress/scripts --save-dev` |
| `@wordpress/env` (wp-env) | Local Docker WP; `.wp-env.json` `{ "themes": ["./my-theme"], "plugins": [...] }`; port 8888 (dev) / 8889 (tests); admin/password; has an experimental Playground runtime that needs no Docker | https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/ | `npm -g i @wordpress/env && wp-env start` |
| WordPress Playground CLI | `server`, `run-blueprint`, `build-snapshot`; `--blueprint=`, `--mount=host:/vfs`, `--auto-mount`, `--wp=`, `--php=` (default 8.3), `--port=` (9400) | https://wordpress.github.io/wordpress-playground/developers/local-development/wp-playground-cli/ | `npx @wp-playground/cli@latest server --mount=./my-theme:/wordpress/wp-content/themes/my-theme --blueprint=blueprint.json` |
| Blueprint JSON | `$schema: https://playground.wordpress.net/blueprint-schema.json` (measured 200); keys `landingPage`, `preferredVersions`, `features`, `login`, `plugins`, `siteOptions`, `constants`, `steps`; steps `installTheme` (`themeData.resource: "wordpress.org/themes"\|"url"\|"vfs"`, `options.activate`, `options.importStarterContent`), `activateTheme`, `importWxr` (`file.resource: "url"`…), `importThemeStarterContent`, `runPHP`, `writeFile`, `setSiteOptions` | https://wordpress.github.io/wordpress-playground/blueprints/steps · https://wordpress.github.io/wordpress-playground/blueprints/data-format | `npx @wp-playground/cli@latest run-blueprint --blueprint=blueprint.json` |
| Theme Check | Checks the Review Team's rules; must pass before going into the directory | https://wordpress.org/plugins/theme-check/ · https://github.com/WordPress/theme-check | `wp plugin install theme-check --activate` then Appearance > Theme Check |
| theme.json schema | Validation/autocomplete; `trunk` or `wp/<ver>` | https://schemas.wp.org/trunk/theme.json | the `"$schema"` line at the top of the file |

---

## 6. Reference theme: Twenty Twenty-Five (current default; TT6 does not exist)

- The GitHub repo `WordPress/twentytwentyfive` was **archived 18/11/2024**; the code lives in SVN/`wordpress-develop`; bugs go through the Trac component Bundled Themes. https://github.com/WordPress/twentytwentyfive
- Top-level tree: `assets/ parts/ patterns/ styles/ templates/ functions.php readme.txt screenshot.png style.css theme.json` + dev files (`.editorconfig .nvmrc .stylelintrc.json composer.json package.json phpcs.xml.dist theme-utils.mjs`). Measured via https://api.github.com/repos/WordPress/twentytwentyfive/git/trees/trunk?recursive=1
- Counts (measured): **8 templates** (`404, archive, home, index, page, page-no-title, search, single`), **7 parts** (`header, header-large-title, vertical-header, footer, footer-columns, footer-newsletter, sidebar`), **98 patterns** (PHP), **32 files in `styles/`** (8 global `01-evening…08-midnight`, `colors/` 8, `typography/` 7, `sections/` 5, `blocks/` 4), `assets/fonts/` 10 woff2 font families (variable + static), `assets/images/` webp, `assets/css/editor-style.css`.
- `theme.json`: `customTemplates` = 1 (`page-no-title`, `postTypes: ["page"]`); `templateParts` = 7 with area `header`×3, `footer`×3, `uncategorized`×1 (sidebar). Measured from theme.json.
- `functions.php`: post-formats, `add_editor_style`, enqueue `style.css`, `register_block_style('core/list', name `checkmark-list`, `inline_style`)`, two `register_block_pattern_category` (`twentytwentyfive_page`, `twentytwentyfive_post-format`) on `init`, `register_block_bindings_source('twentytwentyfive/format')`. https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/functions.php
- Real pattern header: `Title: Hero book / Slug: twentytwentyfive/hero-book / Categories: banner / Keywords: … / Description: …`; hidden patterns use `Inserter: no` and the `hidden-` prefix (`hidden-404`, `hidden-search`…); images via `esc_url( get_template_directory_uri() ) . '/assets/images/...'`, alt via `esc_attr_e( '…', 'twentytwentyfive' )`. https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/patterns/hero-book.php
- Style variations: global `styles/01-evening.json`; colors-only `styles/colors/01-evening.json` (`version 3`, `title`, `settings.color.palette` with the same slugs `base/contrast/accent-*`); typography-only `styles/typography/typography-preset-1.json` (`slug`, `settings.typography.fontFamilies` + fontFace); block partial `styles/blocks/01-display.json` (`slug: text-display`, `blockTypes: ["core/heading","core/paragraph"]`); section `styles/sections/section-1.json` (`blockTypes: [group, columns, column]`). Measured via raw.githubusercontent.com.
- Subfolders in `styles/` are free-form organisation — recognition is by content. https://developer.wordpress.org/news/2024/07/mixing-and-matching-styles-colors-and-typography-in-wordpress-6-6/

---

## 7. Demo content — a theme cannot carry it

- WordPress **provides no way** for a theme to carry pages/posts/menus; they live in the DB. Handbook: templates the user creates in the Site Editor "are stored in the database"; to distribute them the markup must be copied into `templates/`. https://developer.wordpress.org/themes/templates/templates/
- The Review Team forbids "demo imports" in the theme settings page and forbids bundling plugins. https://make.wordpress.org/themes/handbook/review/required/
- Ways to import content: WXR + `wp import` (needs WordPress Importer) or Tools > Import; Playground steps `importWxr` / `importThemeStarterContent` / `installTheme.options.importStarterContent`. https://developer.wordpress.org/cli/commands/import/ · https://wordpress.github.io/wordpress-playground/blueprints/steps
- Theme-side options: **starter page pattern** (`Block Types: core/post-content`, `Post Types`) and **starter template pattern** (`Template Types`). https://developer.wordpress.org/themes/patterns/starter-patterns/
- `theme.json.patterns` pulls patterns from the Pattern Directory. https://developer.wordpress.org/themes/global-settings-and-styles/patterns/
- Navigation: a menu is the post type **`wp_navigation`** (since 6.3); the `core/navigation` block points to it with the `ref` attribute; without `ref`, `WP_Navigation_Fallback` takes the newest wp_navigation → converts a classic menu (preferring location/slug `primary`) → creates a menu from `core/page-list`; filter `wp_navigation_should_create_fallback`. https://developer.wordpress.org/reference/classes/wp_navigation_fallback/ · https://developer.wordpress.org/block-editor/reference-guides/core-blocks/
- Site logo/title: `core/site-logo` (attrs `isLink, linkTarget, shouldSyncIcon, width`) reads the `custom_logo` theme mod / option `site_logo`; `core/site-title` (attrs `isLink, level, levelOptions, linkTarget`) reads the option `blogname` — the same data as the old Customizer, edited right in the block. https://developer.wordpress.org/block-editor/reference-guides/core-blocks/
- Starter content (`add_theme_support('starter-content')`) is a classic/Customizer mechanism; its old handbook page is 404 (`/themes/classic-themes/features/starter-content/` measured 404); Playground still has the `importThemeStarterContent` step. https://wordpress.github.io/wordpress-playground/blueprints/steps

---

## 8. Dark mode in a block theme

- There is no "color scheme" mechanism in theme.json or Global Styles as of 7.1; the 7.1 pseudo/custom states and 7.1 responsive dev notes do **not** mention `prefers-color-scheme`. https://make.wordpress.org/core/2026/08/05/pseudo-and-custom-style-states-in-wordpress-7-1/
- The officially recommended way (Developer Blog 12/2024): `styles.css: ":root { color-scheme: light dark; }"` + a palette using `light-dark(#f9f9f9, #1c1c1c)`; limits: a user overriding colors in the Site Editor cannot define a light/dark pair, and there is no UI for color pairs. https://developer.wordpress.org/news/2024/12/mastering-light-and-dark-mode-styling-in-block-themes/
- Manual toggle: Interactivity API store, `data-wp-on--click`, `data-wp-class--is-dark-scheme`, saved in user meta/cookie, switching `color-scheme` on `:root`. https://developer.wordpress.org/news/2025/09/building-a-light-dark-toggle-with-the-interactivity-api/
- The "two style variations, light/dark" approach (TT5 has `08-midnight`) is picked by hand by the user; the proposal to follow the operating system automatically is still an open issue. https://github.com/WordPress/twentytwentyfive/issues/16
- TT5 uses `color-mix(in srgb, currentColor 20%, transparent)` as a palette color — theme.json accepts modern CSS functions in `color`. Measured from TT5's theme.json.

---

## 9. i18n

- `Text Domain` in `style.css` = the theme slug (lowercase, hyphens); `Domain Path` defaults to `/languages`. https://developer.wordpress.org/themes/advanced-topics/internationalization/
- A theme hosted on wordpress.org **does not need** `load_theme_textdomain()` — WordPress looks in `wp-content/languages` itself (TT5's functions.php does not call it). https://developer.wordpress.org/themes/advanced-topics/internationalization/ · https://raw.githubusercontent.com/WordPress/twentytwentyfive/trunk/functions.php
- Strings in `.html` templates/parts **cannot be translated**; "the only way to internationalize that text is to move it into a pattern" — use `esc_html_e( 'Welcome', 'themeslug' )`, `esc_attr_e()`, `__()`; images via `esc_url( get_theme_file_uri( 'assets/images/x.jpg' ) )`. https://developer.wordpress.org/themes/patterns/using-php-in-patterns/
- Review: every string must go through gettext; the text domain is the slug; a framework may add at most 2 domains. https://make.wordpress.org/themes/handbook/review/required/
- POT: `wp i18n make-pot . languages/<slug>.pot` (scans theme.json too). https://developer.wordpress.org/cli/commands/i18n/make-pot/
- Multilingual is **not in core**: "WordPress currently does not support a bilingual or multilingual blog out-of-the-box"; it is Gutenberg Phase 4 (Phase 3 Collaboration is running in 7.x); the solution is a plugin (one post per language / multisite…). https://developer.wordpress.org/advanced-administration/wordpress/multilingual/ · https://wordpress.org/about/roadmap/

---

## 10. Packaging

- The ZIP holds **one folder** named = slug (lowercase, hyphens) — the slug is also the text domain and the folder name; upload at wordpress.org/themes/upload; an update must have a higher `Version` than the one in the directory. https://make.wordpress.org/themes/handbook/faq/ · https://make.wordpress.org/themes/handbook/review/required/
- Must have: `style.css` (all 10 headers), `templates/index.html`, `theme.json`, `readme.txt`, `screenshot.png` (≤1200×900, 4:3), a GPL-compatible licence for every asset, no `.git`, no hidden files. https://make.wordpress.org/themes/handbook/review/required/
- The theme name must not contain "WordPress", "Theme", or follow the "Twenty*" pattern. (same URL)
- Child theme: only needs a `style.css` with `Template: <parent folder>` (100% match); the child's `functions.php` loads **before** the parent's and **both** load; the child overrides templates/parts/patterns of the same name; the child's `theme.json` merges over the parent's; only 2 levels (no grandchild — the user customization in the DB plays the "grandchild" role). https://developer.wordpress.org/themes/advanced-topics/child-themes/ · https://developer.wordpress.org/reference/classes/wp_theme_json_resolver/
- Child themes still make sense for block themes: Create Block Theme has a command to create a child; `wp scaffold child-theme` still works. https://wordpress.org/plugins/create-block-theme/ · https://developer.wordpress.org/cli/commands/scaffold/child-theme/
- Fastest ZIP export from a running site: Create Block Theme → Export. https://wordpress.org/plugins/create-block-theme/
- Playground `build-snapshot` creates a ZIP of the whole site (not a theme ZIP). https://wordpress.github.io/wordpress-playground/developers/local-development/wp-playground-cli/

---

## Surprises (compared with 2023 knowledge)

1. **There is no Twenty Twenty-Six.** 6.9 skipped the default theme; TT5 (1.5) remains the default through 7.0 and 7.1; TT7 ships with 7.2 (12/2026). An automatic summary page of `make.wordpress.org/core/7-0/` says the opposite — three other sources refute it.
2. **WordPress is now at 7.x** (7.0 in May, 7.1 in August 2026); a new theme's `Tested up to` should be `7.1`.
3. **theme.json version 3** is current (schema `const: 3`); the handbook's "Introduction to theme.json" still prints `"version": 2` — don't copy it.
4. **theme.json now has responsive (`@mobile`/`@tablet` + `settings.viewport`), pseudo-classes (`:hover`…), custom states (`-current`)** — much hand-written CSS from before is no longer needed.
5. **`styles/` may have subfolders** and the variation type (color/typography/block) is recognised **by content**, not by folder name — TT5 uses plural `colors/`, the blog post uses singular `color/`, both are correct.
6. **`register_block_template()` (6.7) is an API for plugins**, not themes; themes are still `templates/*.html` files and always win over plugins.
7. **Font Library**: user-installed fonts live in `wp-content/fonts` (not `uploads/fonts`), post type `wp_font_face`; 7.0 has a separate font management page, for classic themes too.
8. **`add_theme_support('html5')` was removed in 7.0**; block `apiVersion` must be 3 since 6.9.
9. **accessibility-ready changed its rules in May 2026** (18 requirements, including an accessibility statement, reflow, hover/focus content) — old themes carrying the tag must update.
10. **A theme on wordpress.org does not need `load_theme_textdomain()`**, while strings in `.html` templates **cannot be translated** — they must be moved into a PHP pattern.
11. **Patterns run `contentOnly` by default since 7.0** — a pattern with nested blocks must declare `"role": "content"` if the user should be able to edit them; a theme can opt out.
12. **A navigation menu is a `wp_navigation` post**, not a theme mod; a theme does not carry menus, only the fallback generated from the page list.
13. **WP-CLI has no block theme scaffold**; `@wordpress/create-block` only creates block plugins; the official "to file" path is the **Create Block Theme** plugin (saves editor changes back to the theme, exports a ZIP).
14. **Playground CLI (`npx @wp-playground/cli`) + blueprint JSON** is the way to test a theme headless without Docker, with an `installTheme` step from `vfs`/`url` and `importWxr`.
15. The handbook page `releasing-your-theme/required-theme-files/` still lists `index.php`/`comments.php` — a classic leftover, not applicable to block themes.
16. **At most 1200×900 and a 4:3 ratio** for the screenshot is unchanged — it did not change for HiDPI screens.
17. TT5 has almost no CSS: `style.css` is only ~40 lines (focus outline, `text-wrap: pretty`, nav submenu); everything else lives in theme.json + 29 block styles + 10 elements.
