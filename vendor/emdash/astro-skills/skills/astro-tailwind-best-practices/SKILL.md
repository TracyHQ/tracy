---
name: astro-tailwind-best-practices
description: Conventions for building and editing Astro + Tailwind CSS projects. Use when creating pages or components, styling, adding fonts or images, or making any structural change in an Astro codebase.
---

# Astro + Tailwind best practices

Conventions for working in Astro + Tailwind CSS projects. Each rule either
follows the official Astro docs (linked) or is a field convention from
building 100+ production themes, marked as such. When this file and the
project's own AGENTS.md or rules disagree, the project wins.

## Project structure

Follow Astro's [project structure](https://docs.astro.build/en/basics/project-structure/):

- `src/pages/`: file-based routes only. No helper modules inside `pages/`;
  anything not a route belongs in `src/lib/` or `src/components/`.
- `src/layouts/`: shared page shells. New pages use an existing layout
  unless the task says otherwise.
- `src/components/`: UI, grouped by domain, not by type (field convention:
  `components/pricing/`, not `components/cards/`).
- `src/assets/` or `src/images/`: images that should be optimized. Only
  files that must be served as-is (favicons, robots.txt, downloads) go in
  [`public/`](https://docs.astro.build/en/basics/project-structure/#public).
- Use the project's import alias (usually `@/` for `src/`) defined in
  `tsconfig.json`. Never write `../../..` chains when an alias exists.

## Components first

Field conventions that keep a codebase coherent:

- Before writing new UI, search `src/components/` for an existing component
  that does the job (buttons, wrappers, text styles). Reuse or extend it;
  don't fork a near-duplicate.
- Interactivity defaults to plain `<script>` tags in `.astro` files.
  Framework components (React, Svelte, etc.) are for genuinely stateful
  islands, and only if the project already uses that framework. Don't add a
  UI framework to an Astro project for a dropdown.
- No new dependencies unless the task explicitly calls for them.
- No drive-by refactors: don't rename, reorganize, or "clean up" code the
  task didn't ask about.

## Styling with Tailwind

- Astro + Tailwind 4 is set up via the Vite plugin, per the
  [official guide](https://docs.astro.build/en/guides/styling/#tailwind):
  `npx astro add tailwind` installs `@tailwindcss/vite`, and a global
  stylesheet gets `@import "tailwindcss"`. The `@astrojs/tailwind`
  integration is legacy Tailwind 3 only; never add it to a Tailwind 4
  project.
- If the project defines theme tokens (colors, fonts, spacing) in CSS via
  `@theme`, use the token utilities. Never introduce raw palette colors
  (`blue-600`, `gray-100`) or arbitrary hex values into a project that has
  its own tokens (field convention; it's the fastest way to make output look
  off-brand).
- Prefer utilities in markup over `@apply`. Reserve component classes for
  genuinely repeated patterns the project already extracts.

## Fonts: use the Fonts API

Astro has a first-class [Fonts API](https://docs.astro.build/en/guides/fonts/).
Use it instead of pasting `<link>` tags to Google Fonts or hand-writing
`@font-face`:

1. Register the font in `astro.config.mjs` with a provider and CSS variable:

   ```js
   import { defineConfig, fontProviders } from "astro/config";

   export default defineConfig({
     fonts: [{
       provider: fontProviders.fontsource(),
       name: "Inter",
       cssVariable: "--font-inter",
       weights: [400, 500, 600],
       styles: ["normal"],
       subsets: ["latin"],
     }],
   });
   ```

2. Add the `<Font />` component to the page head (usually the layout):

   ```astro
   ---
   import { Font } from "astro:assets";
   ---
   <Font cssVariable="--font-inter" preload />
   ```

3. With Tailwind 4, register it as a theme token in the global stylesheet:

   ```css
   @theme inline {
     --font-sans: var(--font-inter);
   }
   ```

Why: the API self-hosts and caches font files, generates optimized fallbacks
against layout shift, and keeps user requests off third-party font CDNs.
Preload only fonts used above the fold, per the docs.

## Images: never let dimensions disagree

Use [`astro:assets`](https://docs.astro.build/en/guides/images/) for images,
and treat the source file as the single source of truth for dimensions:

- Keep optimizable images in `src/`, import them (or resolve them through a
  content collection's `image()` schema helper) so `src` is an
  `ImageMetadata` object, and let Astro infer `width`/`height`.
- **Never pass a `width`/`height` pair that doesn't match the source ratio.**
  Astro's image service resizes to exactly what you ask; a mismatched pair
  crops the generated file (`fit` defaults to cover), and no CSS will bring
  the pixels back. If you need one dimension, pass only `width`.
- Uniform boxes (card grids) are the one case for an explicit pair: set
  `fit` and `position` deliberately, or crop in CSS with `aspect-ratio` +
  `object-cover` so the full file still ships.
- Use `widths` + `sizes` for responsive variants; `alt` is required (empty
  `alt=""` only for purely decorative images).
- `public/` images bypass optimization entirely, which is why they don't get
  srcsets or format conversion. Don't put content images there.

## Content collections

If the project has collections defined in `src/content.config.ts` (older
projects: `src/content/config.ts`), respect the schema
([content collections docs](https://docs.astro.build/en/guides/content-collections/)):

- New entries copy an existing entry's frontmatter, then edit. Never invent
  frontmatter fields; the Zod schema will reject them or, worse, silently
  ignore them.
- Image fields defined with the `image()` helper resolve to `ImageMetadata`.
  Pass them straight to `<Image />`; don't treat them as string paths.
- Schema changes are a task of their own: update the schema, all existing
  entries, and any AGENTS.md documentation together.

## Pages and SEO wiring

- Every page sets a unique `<title>` and meta description, through the
  project's existing SEO component or layout props if one exists.
- Set a canonical URL from `Astro.url` on indexable pages.
- Sitemaps come from [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/),
  not hand-maintained XML.

## Before finishing

- [ ] No raw palette colors or invented hex values in a tokened project
- [ ] No new dependencies the task didn't call for
- [ ] Images: metadata sources, no mismatched width/height pairs, `alt` set
- [ ] Fonts through the Fonts API, not `<link>` tags
- [ ] New files follow the project's structure and import alias
- [ ] `astro build` (or the project's build script) passes

---

Maintained by [Michael Andreuzza](https://michaelandreuzza.com) at
[Lexington Themes](https://lexingtonthemes.com): Astro + Tailwind themes
that ship with AGENTS.md, scoped rules, and design skills out of the box.
