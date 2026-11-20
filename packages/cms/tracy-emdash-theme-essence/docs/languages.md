# Languages

One locale: `en` (`template.config.json -> locales`), the default, never prefixed (`src/lib/i18n.ts`). There is no
switcher, no translation relationship and no `i18n.fallback` (`DECISIONS.md` D4). Menu `primary` and the forms
(`contact-en`, `subscribe-en`) exist once. Every indexable page declares a canonical URL (only `?page=N` is kept) and
hreflang `en` + `x-default` via the local `tracy-hreflang` plugin; the search page (`/search`) is `noindex` and the 404
is answered with the 404 view (`template.config.json -> audit`). An unknown path answers 404.

Words the template prints itself live in `src/lib/ui-words.ts` and the `chrome` entry; English-only words added late fall
back to English in other languages. Customer-facing languages are chosen at personalization: `seed/questions.json` has a
site-language question in 22 languages (translated by Claude, not a native speaker); `tools/personalize.mjs` writes the
answers into the chrome entry.

Adding a locale: add it to `template.config.json -> locales` and `astro.config.mjs` (`i18n`), translate every entry
through the admin (Translations) or the importer, add its forms to `tools/forms.json` and the bindings, then run the
audit: it demands hreflang for every locale and an answer 200 on each alternate.
