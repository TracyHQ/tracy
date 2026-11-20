# Architecture — tracy-essence

An EmDash 1.1.0 site template (Astro 7 SSR + Tailwind 4 + shadcn/ui), a standalone pnpm project excluded from the root
workspace, built from the JA Essence Joomla 6 quickstart 1.0.10 (T4 template `ja_essence`, ACM sections). Stack, pins and
runtime are those of `../tracy-emdash-theme-diner` (the same kit, `references/runtime.md` of the skill).

Source model → site: `joomla-dump.mjs` (6 tables + capture) → `from-joomla.mjs` → `seed/site-model.json` →
`tools/compile-seed.mjs` → `seed/seed.json`; page composition (which section entries a page shows) is code in
`src/views/*`, from the spec-pack's `page-map.json`. Content lives in the CMS (invariant 1); images go through the importer.
Kit-owned files (`tools/`, `contract/`, `ingest/{detect-source,from-url,from-wp-spec}.mjs`, `src/lib/{brand,media,display-locale,stamps,font-subsets,form-embed-words}`)
are never edited per template (`check-emdash-kit-sync`).
