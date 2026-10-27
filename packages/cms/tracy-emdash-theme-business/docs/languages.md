# Forty locales and native i18n

Read ../AGENTS.md. Keep English as the default at / and every other locale under
/<locale>. The package uses native EmDash i18n; do not add emdash-i18n-translations
or another translation layer merely to enable more languages. Native i18n manages locale
content and translation links; it does not mean every string is automatically translated.

Configuration and behavior live in template.config.json, astro.config.mjs,
src/lib/i18n.ts, localized CMS entries/menus and the metadata helpers.
Entries in a translation group use native translation relationships; matching
slugs alone do not establish that relationship. Use getTranslations/the supported
CMS API rather than constructing every switcher URL by adding or deleting /<locale>.

## Editing and adding languages

- Edit the requested locale; do not overwrite the sibling translation.
- Keep localized menus, footer, validation messages and form bindings consistent.
- To add a locale, update CMS configuration, template config, route/UI helpers,
  content, translation links, menus and forms together. The DE/FR tool fixture
  does not prove that the storefront supports an arbitrary locale without work.
- Since 1.2.0 the template ships forty: `en` at the root and thirty-nine prefixed.
  Thirty-six of them were seeded on 22/09 by `tools/translate-seed.mjs --table`,
  which takes each sentence from the Joomla quickstart's shipped translations of the
  SAME demo site where it has one (69.5% of them) and asks the model only for the
  rest. A locale is one entry in `template.config.json`, one object in
  `src/lib/locale-words.ts`, and its rows in `seed/seed.json` — nothing else.
- The switcher becomes a modal dialog with a filter box from nine locales up
  (`MODAL_FROM` in src/components/islands/LanguageMenu.tsx). Its flag is DERIVED,
  not hand-listed: `new Intl.Locale(tag).maximize().region` is CLDR's own answer to
  "which region does this language tag imply" (`ka` → GE, `lo` → LA, `nb` → NO), and
  the two letters become regional indicator symbols. All forty resolve (measured
  22/09); a tag CLDR cannot place keeps the neutral tile with its code. CLDR
  maximizes by speakers, so `en` → US and `pt` → BR — a language is not a country.
- Keep unsupported/missing translations explicit instead of fabricating copy.

The template supplies native-plugin metadata for routes whose public URL cannot
be guessed from collection/slug alone, including marketing-kit routes. Preserve
canonical/hreflang agreement, pagination's ?page and removal of tracking parameters.
Search remains noindex; unknown routes must return a real 404. Do not enable a
fallback that turns an unknown localized URL into a successful redirect unnoticed.
