# Locale

Read ../AGENTS.md first.

The site ships one locale, `en`, at the root (no prefix). Native EmDash i18n is in place and every
entry, taxonomy term and menu carries `locale: "en"`; `src/lib/i18n.ts` (`LOCALES`, `href`,
`splitPath`, `formatDate`) and `astro.config.mjs` (`i18n.locales`) are the two lists.

Rules kept from the Tracy Business template, measured on EmDash 0.37 / Astro 7:

- the default locale is never prefixed (prefixing it 404s the EmDash admin);
- no `i18n.fallback` in `astro.config.mjs` (it turns a 404 under a prefix into a 302);
- `hreflang`/`x-default` are emitted by `src/lib/hreflang.ts` for every indexable page — with one
  locale that is `en` + `x-default` pointing at the same URL.

## Adding a locale

1. Add the code to `LOCALES` in `src/lib/i18n.ts` and to `i18n.locales` in `astro.config.mjs`;
   add it to `locales` in `template.config.json` (the tools read that).
2. Create the translated entries in the admin (each entry's *Translations* panel links them in one
   `translation_group`), the taxonomy terms and the nine menus for the new locale (menu URLs carry
   the prefix, `/<locale>/...`).
3. `formatDate` in `src/lib/i18n.ts` renders the English long date; add the new locale's shape there.
4. Re-run the acceptance matrix with the new locale in `qa.contract.json` (`locales`, `pages`).

Do not install a translation plugin: the views already read by locale.
