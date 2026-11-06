# Owner decisions and content rules

Read ../AGENTS.md first. The demo content is Ember Roasters — an illustrative independent coffee
shop (menu, shop photos, news). Rules 3, 5 and 7 are decisions recorded while the template's parent, Tracy Base, was converted
from Joomla (`tasks/emdash-tracy-base/DECISIONS.md` and `content-gaps.md` in the TCH repo are the
full record); rules 6 and 8 say what no longer applies here and why this copy has fewer pages.

1. **Illustrative, on purpose.** Shop details, team profiles, menu items and prices are examples; the
   footer notice (`site.notice`) says so and stays until a customer's own content replaces it
   (`tools/personalize.mjs` clears it).
2. **No invented facts.** Empty fields hide their element. The contact email is a `.example` address
   and the contact page's social links are "Not configured" as the design ships them; the footer's
   social links point at the networks' home pages. Set real ones before going live.
3. **Platform-naming copy was rewritten.** Base's strings that said "editable Joomla articles and
   modules" read "editable content and page sections in the admin" on an EmDash site. The café seed
   has no such string; `seed/field-map.json → rewrites` still lists the two Base rewrites
   (`home.features`, `home.faq`, fields this template no longer has) as a record, nothing reads them.
4. **Statistics are the demo's, not a business's.** The About page's figures are examples;
   `personalize.mjs` removes them for a customer.
5. **Tags were dropped.** The source's blog tags and the tag pages are not part of this template;
   articles are grouped by category only.
6. **Slugs are written by hand.** The café's six articles use plain slugs from their titles
   (`where-our-beans-come-from`, …); Base's Joomla aliases and the category-suffix renames are gone
   (`seed/field-map.json → slugRenames` is empty).
7. **Joomla-only pages were not ported** (sign-in, account, authors, news feeds, wrapper, tag index,
   archive, layout fixtures). Adding them is new design work, not a missing conversion.
8. **Thirteen Base page kinds were dropped** (one-page, landing, home-2, product, services + detail,
   pricing, team + profile, careers, help, design-system, marketing), with their content, menu
   entries, personalisation rules and tests.
