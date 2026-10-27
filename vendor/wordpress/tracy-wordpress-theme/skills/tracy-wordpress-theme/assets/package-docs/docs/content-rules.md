# Content and owner decisions

DOCS_REQUIRED: Record the owner of the content, what is demo data to be replaced, the source
the content was ported from and what was dropped or renamed in the port, the licence of code
and content, and the open gaps.

Read ../AGENTS.md. The site's words and images were seeded from a source; they belong to its
owner and are edited on the site, never regenerated from the source over an owner's edits.

- **Demo data** — company details, people, prices, addresses, testimonials — stays until the
  owner replaces it. Do not invent replacements.
- **Gaps** — a page, document or feature the source had and the port does not — are recorded
  here with the decision taken (dropped, redirected, replaced by a core feature). A gap is not
  filled by fabricating the missing thing.
- **Provenance** — third-party design tokens, fonts, images: keep their notices, do not
  relicense.
- **Seed vs. site** — a rerun of the seeder on an edited site updates objects it recognises by
  slug and fingerprint; it is a rebuild tool for a fresh site, not an editing tool for a live
  one. Take a backup before any rerun.
