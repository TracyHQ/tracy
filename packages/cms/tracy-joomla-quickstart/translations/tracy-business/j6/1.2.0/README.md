# Translations for `tracy-business/j6` **1.2.0**

Generated from [`../1.1.0/`](../1.1.0/README.md) with `scripts/tokenize-brand.mjs --remap-translations` and the rule
table [`identity/tracy-business-j6.json`](../../../../identity/tracy-business-j6.json) — not translated again.

Why not a copy like 1.1.0: 1.2.0 moves the site identity into a module, so the en-GB part changes — the demo name
becomes `{site.name}`, contact details become `{contact.*}`, the social network list goes from 6 to 5 — and **field
keys shift** in modules whose structure changed. Translations are joined by **field position** (entity · column ·
`jsonPath`/`xpath`), not by key; translated strings go through the same rule table.

Join rules, and what is left empty instead of guessed:

- English source unchanged (after tokenizing) → carries the old translation, tokenized — but only when the
  translation still holds every token of the source;
- source became text that needs no translation (tokens only, social network names, numbers, punctuation) →
  translation = source;
- anything else → absent, and the seeder's `language` step calls the model for that field like any field a
  customer wrote.

Measured 23/09 (de-DE): 778 fields in 1.1.0 → 788 in 1.2.0; 7 old fields not carried over, all as intended (the INN
registration line, the footer address line now a token, the sixth network hh.ru); 0 demo identity strings left.

`MANIFEST.sha256` is computed AFTER biome formats the folder — computed before, the manifest is wrong (this
happened with 1.0.0).
