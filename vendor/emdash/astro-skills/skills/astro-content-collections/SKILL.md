---
name: astro-content-collections
description: Working with Astro content collections, covering schemas with Zod, the glob loader, image() fields, querying, drafts, and rendering. Use when adding or editing content entries, changing a collection schema, or building pages from collection data.
---

# Astro content collections

How to define, edit, and query content collections without breaking the
build. Each rule either follows the official
[content collections docs](https://docs.astro.build/en/guides/content-collections/)
(linked) or is a field convention from maintaining large content sites,
marked as such.

## Where collections live

- Collections are defined in `src/content.config.ts` at the project root of
  `src/` (older projects: `src/content/config.ts`). One `defineCollection()`
  per collection, exported in a single `collections` object.
- The standard local setup uses the `glob()` loader with a `base` directory
  and file `pattern`:

  ```ts
  import { defineCollection } from "astro:content";
  import { glob } from "astro/loaders";
  import { z } from "astro/zod";

  const posts = defineCollection({
    loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
    schema: z.object({
      title: z.string(),
      description: z.string(),
      pubDate: z.coerce.date(),
    }),
  });

  export const collections = { posts };
  ```

- Entry `id`s are generated from filenames (URL-friendly, lowercased). An
  entry can override its own `id` with a `slug` frontmatter property.

## Schema rules

- Import Zod from `astro/zod`, per the docs.
- Dates in frontmatter arrive as strings or dates depending on quoting, so
  use `z.coerce.date()` to handle both.
- **Image fields use the `image()` helper**, not `z.string()`:

  ```ts
  schema: ({ image }) =>
    z.object({
      cover: image(),
    }),
  ```

  The field then resolves to an `ImageMetadata` object with real dimensions.
  Pass it straight to `<Image />` from `astro:assets`; never treat it as a
  string path. (Note: `image().refine()` custom checks are unsupported.)
- Link entries across collections with `reference("collection-name")`
  instead of storing raw ids in strings.
- Changing a schema is a three-part task (field convention): update the
  schema, update every existing entry that no longer validates, and update
  any AGENTS.md or docs describing the frontmatter. A schema change that
  only touches the config file is almost certainly incomplete.

## Editing and adding entries

Field conventions:

- New entries start as a copy of an existing entry's frontmatter, then edit.
  Never invent frontmatter fields: unknown fields are either rejected by a
  strict schema or silently dropped, and both are bugs.
- Keep frontmatter values consistent with the collection's existing style
  (date formats, tag casing, image paths) rather than introducing variants.

## Drafts

Two working patterns; check which one the project already uses:

- **A `draft` boolean in the schema**, filtered at query time, per the docs:

  ```ts
  const published = await getCollection("posts", ({ data }) => !data.draft);
  ```

  Every `getCollection()` call site must apply the filter, including RSS
  feeds and sitemaps, which are the classic leak (field convention).
- **Underscore-prefixed filenames** excluded by the loader pattern
  (field convention: one exclusion point, no filters to forget):

  ```ts
  loader: glob({ base: "./src/content/posts", pattern: ["**/*.md", "!**/_*"] }),
  ```

## Querying and rendering

- `getCollection()` returns entries in **non-deterministic order**, per the
  docs. Anything user-facing sorts explicitly:

  ```ts
  const posts = (await getCollection("posts")).sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
  ```

- Render Markdown/MDX bodies with `render()` from `astro:content`:

  ```astro
  ---
  import { getEntry, render } from "astro:content";
  const entry = await getEntry("posts", Astro.params.slug);
  if (!entry) return Astro.redirect("/404");
  const { Content, headings } = await render(entry);
  ---
  <Content />
  ```

- Build routes from entries with `getStaticPaths()` mapping over
  `getCollection()`, using `post.id` for the URL param.

## Before finishing

- [ ] No invented frontmatter fields; new entries validate against the schema
- [ ] Image fields use `image()` and are passed as metadata, not strings
- [ ] Every user-facing `getCollection()` call sorts explicitly
- [ ] Draft filtering applied everywhere entries are listed (pages, RSS, sitemap)
- [ ] Schema changes shipped together with entry and docs updates
- [ ] `astro build` passes (schema errors surface at build time)

---

Maintained by [Michael Andreuzza](https://michaelandreuzza.com) at
[Lexington Themes](https://lexingtonthemes.com): Astro + Tailwind themes
that ship with AGENTS.md, scoped rules, and design skills out of the box.
