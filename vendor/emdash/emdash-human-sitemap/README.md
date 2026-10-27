# @masonjames/emdash-human-sitemap

A trusted EmDash plugin that renders a human-readable sitemap for real people, not search-engine XML crawlers.

It adds:

- a `humanSitemap` Portable Text block for editors,
- a theme-importable `HumanSitemap` Astro component,
- plugin settings for collections, menus, taxonomies, counts, sort, and section limits.

## Install

This package expects the first EmDash release that exposes plugin settings helpers to the public runtime API. In practice, that means the next EmDash release after `0.1.0`.

```bash
npm install @masonjames/emdash-human-sitemap
```

Then register it in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import { emdash } from "emdash/astro";
import { humanSitemap } from "@masonjames/emdash-human-sitemap/descriptor";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [humanSitemap()],
    }),
  ],
});
```

## Editor workflow

1. Install and register the plugin.
2. Open the plugin settings in EmDash admin.
3. Choose the collections and menus you want to expose.
4. Create a normal page such as `/sitemap`.
5. Insert the **Human Sitemap** block.

## Plugin settings

`includedCollections` and `includedMenus` use one line per entry.

Examples:

```txt
pages
posts|Articles
resources|Knowledge Base
```

```txt
primary
footer|Footer Links
```

The optional `|Label` suffix lets you rename a section heading without changing the underlying collection or menu slug.

Collection and menu headings are overridable here. Taxonomy section headings currently use the taxonomy labels defined inside EmDash itself.

## Direct theme usage

You can also import the component directly:

```astro
---
import { HumanSitemap } from "@masonjames/emdash-human-sitemap/astro";
---

<HumanSitemap
  title="Browse the site"
  viewAllLinks={{
    "collection:posts": { href: "/posts", label: "Browse all posts" },
    "taxonomy:category": { href: "/category", label: "Browse every category" },
  }}
/>
```

If your site uses custom URL patterns, pass explicit builders so links line up with your routes:

```astro
---
import { HumanSitemap } from "@masonjames/emdash-human-sitemap/astro";
---

<HumanSitemap
  title={null}
  collectionHrefBuilder={(collection, entry) => {
    if (collection === "pages") return entry.id === "index" ? "/" : `/${entry.id}`;
    if (collection === "posts") return `/writing/${entry.id}`;
    return `/${collection}/${entry.id}`;
  }}
  taxonomyHrefBuilder={(taxonomy, term) => `/${taxonomy}/${term.slug}`}
/>
```

Default link behavior is intentionally simple:

- pages: `/{slug}`
- other collections: `/{collection}/{slug}`
- taxonomies: `/{taxonomy}/{slug}`
- menus: the resolved menu URLs already stored in EmDash

## What the block can override

Per page, editors can override:

- title,
- collections on/off,
- menus on/off,
- taxonomies on/off,
- counts inherit/show/hide,
- compact vs expanded layout.

## Marketplace and `emdash plugin publish`

This package is a **trusted native plugin** intended for installation from npm and registration in `astro.config.mjs`.

Today, EmDash marketplace publishing targets sandbox/standard plugins. Native plugins that rely on `componentsEntry` and Portable Text block rendering are not currently compatible with `emdash plugin bundle` / `emdash plugin publish`.

So the supported installation path for this package is:

1. publish to npm,
2. install it in your site,
3. register it in `astro.config.mjs`.

## CI and releases

GitHub Actions runs CI for pushes and pull requests targeting `main`.

To publish a new version:

1. bump `version` in `package.json`,
2. commit and push to `main`,
3. create and push a matching stable tag from that `main` commit, like `v0.1.1`.

The release workflow validates the package and then publishes it to npm.

- CI currently installs with `--legacy-peer-deps` because the `emdash >=0.2.0` peer target has not landed on npm yet.
- Preferred: configure npm Trusted Publishing for `masonjames/emdash-human-sitemap` using the workflow file `.github/workflows/release.yml`.
- Fallback: add an `NPM_TOKEN` repository secret until trusted publishing is enabled.

## Development

```bash
npm install
npm run release:check
```

## License

MIT
