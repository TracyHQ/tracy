---
name: astro-seo
description: SEO wiring for Astro sites, covering canonical URLs, meta tags, sitemaps, robots.txt, and JSON-LD structured data. Use when adding pages, fixing indexing issues, or implementing structured data in an Astro project.
---

# Astro SEO

How to wire SEO correctly in an Astro project. Each rule either follows the
official Astro docs (linked) or is a field convention from running large
Astro sites in production, marked as such.

## Baseline: set `site`

Everything below depends on `site` being set in `astro.config.mjs`:

```js
export default defineConfig({
  site: "https://example.com",
});
```

Without it, `Astro.site` is undefined, the sitemap integration can't build
absolute URLs, and canonical tags degrade to relative guesses. Check this
first when debugging SEO output.

## Titles and descriptions

- Every indexable page sets a unique `<title>` and `<meta name="description">`.
  Do it through the project's existing SEO component or layout props; don't
  hand-write meta tags per page if a component exists (field convention).
- Titles read as page-specific first, brand second: `Pricing | Acme`, not
  `Acme, the best widgets | Pricing`.
- Descriptions are written for the search snippet: one or two sentences,
  roughly 150 characters, no keyword lists.

## Canonical URLs

Build canonicals from `Astro.url` and `Astro.site` so every route gets one
automatically:

```astro
---
const canonical = new URL(Astro.url.pathname, Astro.site);
---
<link rel="canonical" href={canonical} />
```

Field conventions:

- Pick one trailing-slash style (Astro's `trailingSlash` option) and make
  canonicals match it exactly. A canonical that redirects is wasted.
- Pages reachable at multiple URLs (pagination, filters, UTM traffic) must
  canonicalize to the clean URL.

## Open Graph and social cards

- Set `og:title`, `og:description`, `og:image`, `og:url`, and
  `twitter:card` in the same SEO component as the rest of the head.
- `og:image` must be an **absolute URL** (build it with
  `new URL(path, Astro.site)`), because relative paths silently fail on most
  platforms. Aim for 1200×630.
- Static OG images live in `public/`; generated ones come from an endpoint
  (e.g. `src/pages/og/[slug].png.ts`). Either is fine; the absolute URL is
  the part people get wrong.

## Sitemap

Use [`@astrojs/sitemap`](https://docs.astro.build/en/guides/integrations-guide/sitemap/);
never hand-maintain XML:

```bash
npx astro add sitemap
```

The build emits `sitemap-index.xml` plus numbered files. Per the docs, help
crawlers find it in both places:

```astro
<link rel="sitemap" href="/sitemap-index.xml" />
```

```txt
# public/robots.txt
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap-index.xml
```

Use the integration's `filter()` option to exclude pages that shouldn't be
indexed (thank-you pages, internal tools). If a page is excluded from the
sitemap for that reason, also give it
`<meta name="robots" content="noindex" />`: the sitemap is a hint, the
meta tag is the instruction (field convention).

## JSON-LD structured data

Astro renders structured data as an inline script. Use `set:html` with
`JSON.stringify`; don't interpolate JSON into the template by hand:

```astro
---
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Product",
  name: title,
  offers: {
    "@type": "Offer",
    price: String(price),
    priceCurrency: "USD",
  },
};
---
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
```

Field conventions:

- Keep JSON-LD builders in a plain `.ts` module (typed, testable), and keep
  them in sync with the visible page. Google ignores structured data that
  contradicts what's rendered.
- For a discounted price with a strikethrough original, add a
  `priceSpecification` with `priceType: "https://schema.org/ListPrice"` for
  the original price alongside the `Offer`'s selling price.
- Validate with Google's Rich Results Test after changing any builder.
- Common wins: `Product` + `Offer` on pricing pages, `Article` with dates on
  posts, `BreadcrumbList` on nested sections, `FAQPage` only for FAQs that
  are actually visible on the page.

## Redirects and hygiene

- Configure moved URLs in Astro's [`redirects`](https://docs.astro.build/en/guides/routing/#redirects)
  config (or the host's config) with 301s. Don't leave old URLs 404ing
  after a rename.
- One `<h1>` per page; heading levels don't skip.
- Every content image has meaningful `alt` text (see the
  `astro-tailwind-best-practices` skill for image handling).

## Before finishing

- [ ] `site` set in config; canonicals absolute and non-redirecting
- [ ] Unique title + description on every new or changed page
- [ ] `og:image` is an absolute URL
- [ ] Sitemap present, linked in head and robots.txt
- [ ] JSON-LD matches the visible page and passes Rich Results Test
- [ ] Renamed or removed routes have 301 redirects

---

Maintained by [Michael Andreuzza](https://michaelandreuzza.com) at
[Lexington Themes](https://lexingtonthemes.com): Astro + Tailwind themes
that ship with AGENTS.md, scoped rules, and design skills out of the box.
