# Owner decisions and content rules

Read ../AGENTS.md first. The demo content is the Tracy Base studio — an illustrative independent
website studio. What follows are the owner's decisions recorded while converting it
(`tasks/emdash-tracy-base/DECISIONS.md` and `content-gaps.md` in the TCH repo are the full record).

1. **Illustrative, on purpose.** Company details, team profiles, plans and prices are examples; the
   footer notice (`site.notice`) says so and stays until a customer's own content replaces it
   (`tools/personalize.mjs` clears it).
2. **No invented facts.** Empty fields hide their element. The contact email is a `.example` address
   and the contact page's social links are "Not configured" as the design ships them; the footer's
   social links point at the networks' home pages. Set real ones before going live.
3. **Platform-naming copy was rewritten.** Three source strings said "editable Joomla articles and
   modules"; on an EmDash site that is false, so they read "editable content and page sections in the
   admin". The list is in `seed/field-map.json → rewrites`.
4. **Statistics are the design's, not a business's.** "152 design systems · 2 appearance modes · 13
   section types · 1 place to edit" describe the toolkit; `personalize.mjs` removes them for a customer.
5. **Tags are demo data.** The five tags (`joomla`, `t4-framework`, …) came with the source's blog;
   rename or delete them in the admin when the site is real.
6. **Slugs are the source's URLs.** Article slugs equal the Joomla aliases; five aliases that were
   duplicated across categories carry the category as a suffix (`seed/field-map.json → slugRenames`).
7. **Joomla-only pages were not ported** (sign-in, account, authors, news feeds, wrapper, tag index,
   archive, layout fixtures). Adding them is new design work, not a missing conversion.
8. **The four landings share one component set.** Home (OpenDesign landing), `/onepage`, `/landing`
   and `/home-2` are demo layouts; a real site usually keeps one and unpublishes the rest.
9. **Kit pages are the template's.** Design-system swatches and specimens read `tokens.css`; the
   marketing samples are static documents under `public/marketing/` with their own licence file.
