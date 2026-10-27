# P3/P5 — Astro + Tailwind v4 + shadcn on EmDash, and how to draw without breaking it

## CSS layers

- `src/styles/tokens.css`: `@theme { --color-<role>: … }` for light, `html[data-theme="dark"] { … }`
  overriding the same names for dark; **names by role** (paper, paper-2, ink, forest, signal, line, fg-meta…), values
  with provenance in `visual-contract.md`. shadcn semantics (`--color-background`, `--color-primary`,
  `--color-border`, `--radius: 0`) map onto those same roles — the default preset is not kept.
- `src/styles/global.css`: `@import "tailwindcss"` + tokens + `@custom-variant dark
  (&:where(html[data-theme="dark"], html[data-theme="dark"] *))` + `@layer components` for repeated patterns
  (eyebrow, h-page/h-section, btn-*, chip, grid-lines, photo-frame, breadcrumb, field-input,
  prose-article). Imported **only** in `src/layouts/Base.astro`. The admin does not go through this layout; check with
  `curl /_emdash/admin | grep stylesheet` → only `@emdash-cms/admin/dist/styles.css`.
- Theme: an inline script in `<head>` reads `localStorage` and sets `data-theme` before paint; the toggle button changes the
  attribute + label ("Dark"/"Light" are the button's words, taken from the site chrome).

## shadcn

`components.json` hand-written (style new-york, `tsx: true`, `rsc: false`, `tailwind.css: src/styles/global.css`,
aliases `@/components`, `@/lib/utils`). `pnpm dlx shadcn@<pin> add <items> --yes` **once**, commit
`src/components/ui/*.tsx`; CLI 4.21 writes `import { cn } from "cn"` — change it to `@/lib/utils`. Pin exact
`radix-ui`, `lucide-react`, `clsx`, `tailwind-merge`, `class-variance-authority`. Write
`src/components/ui/PROVENANCE.md` (CLI, registry, license, hash) and refresh it with `tools/provenance.mjs`.
A clean install does not call the registry.

React islands only for real interaction: language menu (DropdownMenu), mega panel (Popover
`modal={false}`), `client:load` because the nav is needed immediately. Every other section is Astro. Don't add a drawer/hamburger
if the source has none.

## One-file router

`src/pages/[...path].astro`: `Astro.currentLocale` is inferred from the URL even with a catch-all; split the locale with
`splitPath`, match segments to a view; no matching view → `NotFound` + `Astro.response.status = 404`.
Inside a view, a missing entry → `Astro.response.status = 404; return Astro.rewrite(href(locale, "/404"))`.
Middleware: strip the trailing `/` (301), don't touch `/_emdash/`.

## Reading data — measured traps

- `getEmDashEntry(coll, slug, { locale })`: `entry.id === slug`; **the real id is `entry.data.id`** — use it
  for `getEntryTerms`, `getTermsForEntries`, `getTranslations`, `content.id` of `createPublicPageContext`.
- An image value when read: `{id, meta.storageKey, width, height, alt, …}` may have no `src`.
  Check the real URL that the `emdash/ui` Image produces: the optimised path may use the public origin,
  not the preview's origin. With local storage, the same-origin inline image URL
  `/_emdash/api/media/file/<meta.storageKey>` avoids depending on a session on another hostname.
  Keep the external CDN URL when using an external provider; SEO metadata still follows the public origin.
- Fixed-height image frames: Astro responsive images set `height:auto; aspect-ratio` on `<img>` — must be overridden
  with `!important` in `.photo-frame img` (position absolute, inset 0, object-fit cover).
- `getEmDashCollection(coll, { locale, status: "published", orderBy: { <field>: "desc" }, limit, where: {
  <taxonomy>: term } })`; search: `search(q, { collections, locale, status: "published", limit })` returns
  `{collection, slug, title, snippet}`.
- A reference field returns an **id** (string); load it with `getEmDashEntry(coll, id, { locale })`.

## Lazy shots

Playwright full-page **does not scroll** → `loading="lazy"` does not load → images look like placeholders. `shoot.mjs`
scrolls the whole page before capturing. After scrolling, check `complete && naturalWidth > 0`,
`currentSrc`, network errors and the shot; the number of img tags or of imported media does not prove the images show.

## Forms (Forms plugin)

`import { blockComponents } from "@emdash-cms/plugin-forms/astro"; const FormEmbed =
blockComponents["emdash-form"]; <FormEmbed node={{ formId }} />` + `<script>import
"@emdash-cms/plugin-forms/client"</script>` + `@emdash-cms/plugin-forms/styles` + own CSS with the selector
`.ec-form .ec-form-*` (higher specificity than the plugin's). Radios hide the input, style the label with `:has(input:checked)`
— Playwright must click the label. The newsletter box sends JSON `{formId, data}` to
`/_emdash/api/plugins/emdash-forms/submit` (script `newsletter-client.ts`), the message returned is the
form's `confirmationMessage`.

## Fast Gate in P3 and P5

Stopping P3 at "two independent sites render" is not enough: run **Fast Gate** on the slice built so far
(`node tools/fast-gate.mjs plan` → `visual-qa.mjs --scope fast-gate` → lenses → fix → `fast-gate.mjs
verdict`, [qa-lenses.md](qa-lenses.md) §8). The shared frame (Header, Footer, `global.css`, tokens) fixed here
is fixed for every page; multiplying while the frame still has defects multiplies the defects. The contract in P3 has only a few pages — the plan
picks among them and records the scope; don't declare pages not built yet.

P5, for each family added: declare `layouts[]` (+ `family`) and `pages[].render.view`, run
`fast-gate.mjs plan --changed <file just added/edited>` to know which cases must rerun, then
`visual-qa.mjs --scope fast-gate --reuse <previous run>` — only pages whose hash changed are recaptured.

## Pages (P5) — checklist per family

list: filter chips = real links to the archive/term; counts and pagination derived; out-of-range page → 404 ·
detail: breadcrumb from term/`short_title`; prev/next by `date` in the same locale; related by the same term; TOC from
h2 blocks with stable ids (`toc.ts`) · search: `?q` + `?type` + count per collection, `cache-control:
no-store` · 404: full chrome, search form, suggestions from a field · kit: static samples from `sample` json, no simulated
submit · legal: title-only when the source has no body · HTML sitemap from menu + collections.
