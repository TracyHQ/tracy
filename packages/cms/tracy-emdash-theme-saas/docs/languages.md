# Languages

Read ../AGENTS.md and generated/inventory.md. Native EmDash i18n is used; no extra translation layer.

## Current configuration

- One locale: `en`, default, **unprefixed** (`/pricing`). Configured in three places that must agree:
  `astro.config.mjs → i18n`, `src/lib/i18n.ts → LOCALES`, `template.config.json → locales`.
- No Astro `fallback`: an unknown path answers 404, never a redirect to another locale.
- Every indexable page emits a self `hreflang="en"` alternate and `x-default`; noindex pages (search, 404)
  emit none. Canonical = path, plus `page` when it is greater than 1.
- Menus, taxonomies, forms and entries all carry `locale: en`.

## Adding a locale

1. Add it to the three configuration places above (default stays unprefixed; others live under
   `/<locale>/`).
2. Create translated entries (same slug, `translationOf` the English entry) for `pages`, every section
   entry the translated pages list, `posts`, the chrome collections, menus and taxonomy terms.
3. Add a translated form (`newsletter-<locale>` in `tools/forms.json`); the binding `newsletter-{locale}`
   already expands per locale.
4. Add a language switcher to the header (none exists with one locale) and verify hreflang pairs with
   `tools/audit.mjs`.

A page without a translation answers 404 under the new prefix rather than showing English.
