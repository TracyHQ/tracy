# Languages

One locale: `en` (`template.config.json → locales`), the default, never prefixed (`src/lib/i18n.ts`). There
is no switcher, no translation relationship and no `i18n.fallback`. Menus and forms exist once (`primary`; `contact-en`,
`subscribe-en`). Every indexable page declares a canonical URL (only `?page=N` is kept) and hreflang `en` + `x-default` via
the local `tracy-hreflang` plugin; Smart Search (`/explore/j-pages/smart-search`) and the 404 are `noindex` and carry no
hreflang (`template.config.json → audit`). An unknown path answers 404 with the 404 view.

Words the template prints itself (Prev, Next, Page n of N, 1 ARTICLE, search labels) live in `src/lib/ui-words.ts` and the
`chrome` entry; English-only words added late fall back to English in other languages. Customer-facing languages are chosen
at personalization: `seed/questions.json` has a site-language question in 22 languages (translated by Claude, not a
native speaker); `tools/personalize.mjs` writes the answers into the chrome entry.

Adding a locale: add it to `template.config.json → locales`, `astro.config.mjs` (`i18n`), translate every entry through the
admin (Translations) or the importer, add its forms to `tools/forms.json` and bindings, then run the audit: it demands
hreflang for every locale and an answer 200 on each alternate.

Read ../AGENTS.md and generated/inventory.md. Use native CMS i18n where supported;
do not install another translation layer merely because the site has two languages.
Do not assume EN/RU or Northgate conventions apply to every template. Explain
missing translations, unknown-path status and the work required to add a locale.
