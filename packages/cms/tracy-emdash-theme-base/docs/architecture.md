# Architecture

Read ../AGENTS.md first. This is an Astro 7 SSR application with EmDash 1.1.0 as the CMS: one Node
process serves the storefront, the admin (`/_emdash/admin`) and the API (`/_emdash/api/*`). It is
not a Joomla template and not an upload ZIP for another CMS.

## Runtime

- `astro.config.mjs`: `output: 'server'`, `@astrojs/node` standalone adapter, `@astrojs/react` for
  the islands, `@tailwindcss/vite`, and the `emdash()` integration with `sqlite({ url:
  file:<SITE_DATA_DIR>/data.db })` and `local()` media storage in `./uploads` (served at
  `/_emdash/api/media/file/<key>`). Plugins registered there: `@emdash-cms/plugin-audit-log`,
  `@emdash-cms/plugin-forms` (honeypot), `emdash-smtp`, and the template's own hreflang plugin
  (`src/lib/hreflang.ts`, entry file + `createPlugin`). `i18n: { defaultLocale: 'en', locales:
  ['en'] }`, no fallback. `src/live.config.ts` declares the EmDash live collection.
- `src/middleware.ts`: 301 from a trailing slash to the canonical path (never for `/_emdash/`);
  `Content-Security-Policy: frame-ancestors` only when `TRACY_FRAME_ANCESTORS` is set (demo sites).
- Source is `src/`, `public/`, `seed/`, `tools/`; generated build output is `dist/` (`pnpm build`,
  started with `node dist/server/entry.mjs`); persistent state is `data/` (SQLite, token, receipts)
  and `uploads/` — both created on start, both outside the package.

## Route dispatch

One catch-all, `src/pages/[...path].astro`, serves every public URL: it splits the locale, loads the
page chrome once (`src/lib/chrome.ts`: `site` singleton, nine menus, latest posts, four people) and
matches the path segments to a view in `src/views/` (unknown → `NotFound.astro`, HTTP 404). The
supported route table follows below; verify the running site with
`node tools/audit.mjs <origin> <out> --config template.config.json`.

| Path | View | Reads |
|---|---|---|
| `/` | `Home.astro` | `home` singleton |
| `/onepage` · `/landing` · `/home-2` | `Onepage` · `Landing` · `Home2` | `onepage` · `landing` · `home_2` (own header/footer for the one-page) |
| `/product` · `/pricing` · `/about` · `/careers` · `/help` | same-named views | same-named singletons |
| `/services` · `/services/{slug}` | `Services` · `Service` | `services_page` + `services` |
| `/blog` · `/blog/category/{slug}` · `/blog/tag/{slug}` · `/blog/topics` · `/blog/{slug}` | `Blog` · `Topics` · `Article` | `blog` + `posts` + taxonomies `category`/`tag`, `settings.postsPerPage` |
| `/team` · `/team/{slug}` | `Team` · `Person` | `team` + `people` (+ `posts` in category `people`) |
| `/contact` | `Contact` | `contact` + Forms plugin (`form_id`) |
| `/search` | `Search` | core `search()` over posts/services/people; noindex |
| `/design-system` (+ `/typography` `/colour` `/spacing`) | `DesignSystem` | `design_system` + `src/styles/tokens.css` |
| `/marketing` · `/marketing/{key}` | `Marketing` | `marketing` + `public/marketing/*.html` |
| `/sitemap` · `/404` | `Sitemap` · `NotFound` | menus + collections · `site` |

## Layout, components, styles

- `src/layouts/Base.astro` — `<head>` (EmDash head, canonical, hreflang, theme script, favicon),
  `Header`, `<slot>`, `Footer`, EmDash body start/end; the only importer of `src/styles/global.css`.
  `bare` skips the site chrome (one-page layout).
- `src/components/site/` — Header (with `MegaMenu`/`MobileNav` islands and the theme toggle),
  Footer, Logo, Breadcrumb, Pagination, PostCard, Photo, BodyImage, ArticleH2, Icon, SocialIcon,
  and the one-page header/footer.
- `src/components/sections/` — the section components the landings and pages compose
  (`SectionHead`, `HeroOd`, `HeroAcm`, `Chapter`, `CardList`, `Steps`, `FeatureRows`, `FeaturesIntro`,
  `StatsBand`, `Quotes`, `FaqList`, `PricingTiers`, `CtaBand`, `InlineCta`, `ProofStrip`, `TeamGrid`,
  `TeamCards`, `Clients`, `Timeline`).
- `src/components/islands/` — React islands, hydrated `client:load`: `MegaMenu`, `MobileNav`,
  `Carousel`, `Tabs`.
- `src/components/ui/` — shadcn primitives (provenance in `PROVENANCE.md` there).
- `src/styles/tokens.css` (Tailwind `@theme` tokens, light + dark), `global.css` (base + shared
  classes), `forms.css` (Forms plugin overrides, imported by the contact view only).
- `src/lib/` — `i18n.ts`, `chrome.ts`, `posts.ts`, `media.ts`, `toc.ts`, `hreflang*.ts`,
  `public-origin.ts`, `icons.ts`, `utils.ts`.

The admin never loads the storefront stylesheet: `curl /_emdash/admin` lists only
`@emdash-cms/admin/dist/styles.css`.

## Provenance stamps (Tracy preview only)

Tracy's comment picker needs to know which entry and field printed an element. EmDash
runs no Claude Cowork plugin, so the views print it themselves: `src/lib/stamps.ts`
(the same file as in Tracy Business) turns an entry into
`data-tracy-src="emdash:<collection>:<entry id>:<slug> field:<key>"`
(`field:<repeater>.<subfield>` in a repeater row, `block:<repeater>` on the row), and
`PageOwner.astro` puts `<template data-tracy-owner="emdash:…">` first in `<main>`. They
render only when the request carries `X-Tracy-Preview: pick`, which Tracy's site proxy
sets after verifying a preview ticket and strips from browsers; the middleware then
marks the answer `Cache-Control: private, no-store`. Every other request gets the page
without a single stamp. Islands receive theirs as a `marks` prop built with
`islandMarks()`, which adds no prop on an ordinary request. Menus, taxonomy labels and
formatted values (dates, initials) carry none. Portable Text bodies (`posts`, `services`)
stamp each text block `field:content.<_key>` through `stampBlocks()` and the `Prose*`
renderers. Stamps only name what Tracy can read back through its Content API, which
this template answers (see docs/content-api.md). `stamps.ts`, `PageOwner.astro` and
the `Prose*` renderers come from the template kit and must stay identical to it.

Keep stamps off an element with no `class` of its own inside a component that has a
`<style>` block: Astro then merges its scoped class into the spread object, which fails on
the frozen empty object an ordinary request gets (measured on `SampleFrame.astro`).

## Tools

`tools/` is the kit of the `tracy-emdash-template` skill (byte-identical, see `PROVENANCE.md`) plus
this template's own `build-seed.mjs` (source export → seed), `forms.json`, `personalize.mjs` and
`docker-entrypoint.sh`. `Dockerfile` builds the image from this directory.
