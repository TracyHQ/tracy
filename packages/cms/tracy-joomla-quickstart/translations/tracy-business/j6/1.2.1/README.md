# Translations for `tracy-business/j6` **1.2.1**

Copied byte for byte from [`../1.2.0/`](../1.2.0/README.md) (`MANIFEST.sha256` unchanged and still matching).

Why a copy is right: 1.2.1 is 1.2.0 plus the dark-background logo template patch (T31) — the database is the same
byte for byte, and 1.2.1's `content-map.json` has exactly 1.2.0's 1797 fields (same keys, same sample text).
Translations are joined by field key, so no field changes meaning. The seeder finds this folder by the profile's
path (`translationsDirOf`), so without it the `language` step calls the model for every field.
