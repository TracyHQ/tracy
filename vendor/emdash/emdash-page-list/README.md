# `emdash-page-list`

Collection-backed and menu-backed page lists for EmDash CMS.

This plugin gives editors a `pageList` Portable Text block and gives theme authors a matching Astro component they can import directly into layouts or pages.

## What it does

- Insert a **Page List** block inside Portable Text content
- Render lists from an EmDash **collection**
- Render nested navigation from an EmDash **menu**
- Set install-wide defaults with `admin.settingsSchema`
- Reuse the same renderer directly from Astro templates

## Install

```bash
npm install emdash-page-list
```

Then register it in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import { emdash } from "emdash/astro";
import { pageListPlugin } from "emdash-page-list";

export default defineConfig({
	integrations: [
		emdash({
			plugins: [pageListPlugin()],
		}),
	],
});
```

## Editor usage

Once the plugin is enabled, editors can insert a `Page List` block into any Portable Text field.

### Source types

- **Collection** — render a flat list from a content collection
- **Menu** — render an existing EmDash menu hierarchy

### Per-block options

- source type
- collection slug or menu name
- limit
- sort field + direction
- show excerpt
- show publish date
- heading
- empty-state text
- child depth limit for menu trees
- style (`bulleted`, `compact`, `card`)

## Direct Astro usage

```astro
---
import { PageList } from "emdash-page-list/astro";
---

<PageList
	sourceType="collection"
	collection="pages"
	heading="Start here"
	style="compact"
	limit={6}
/>
```

### Custom collection URL patterns

Collection mode uses the collection's EmDash `urlPattern` when one exists. You can still override it manually if you need a theme-specific pattern:

```astro
<PageList
	sourceType="collection"
	collection="docs"
	collectionUrlPattern="/docs/{slug}"
/>
```

Use menu mode when you want EmDash’s fully resolved menu URLs and nested navigation structure.

## Settings

The plugin ships settings for:

- default source type
- default list style
- default limit
- default sort field
- default sort direction
- show excerpt by default
- show date by default

Per-block choices always override the plugin defaults.

## Migration from the scoped package

This package was previously published as `@masonjames/emdash-page-list`. Use `emdash-page-list` for new installs. No content or settings migration is expected because the EmDash plugin ID remains `page-list`.

## Notes on plugin format

This package is a **native trusted EmDash plugin**.

That means:

- it works in `plugins: []`
- it supports Portable Text blocks and `componentsEntry`
- it is installable from npm and GitHub
- it is **not** compatible with `sandboxed: []`

## Marketplace publishing

Current EmDash core does not allow Portable Text block plugins with `componentsEntry` to be bundled for the marketplace with `emdash plugin publish`.

So this package is intended to be distributed as a normal npm package and installed through `astro.config.mjs`.
