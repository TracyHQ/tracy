# Machine translations

This folder is for **machine translations**, generated from `packages/i18n/src/locales/en-us.json` — not
maintained by hand. It is empty for now: the three languages Tracy ships (`en-US`, `vi-VN`, `zh-CN`) are all
**hand translations** and live in `../locales/`.

A fourth language onwards lands here:

1. Add **one row** to `APP_LANGUAGES` in `../languages.ts` (id, label, flag, `load`).
   That is the only place — there is no second table to forget.
2. `pnpm i18n:sync` — **creates the file** and fills in the sentinel `[to be translated]:<the English original>`.
3. Translate the lines carrying the sentinel (a separate task). To make it a machine translation, move the
   file from `../locales/` into this folder.

`pnpm i18n:check` turns red when a language is declared without a file — such a row shows in the menu and
then breaks when the user clicks it.

Strings still carrying the sentinel are **skipped at runtime** and fall back to English, so a half-done
translation never shows garbage on screen. See ADR 0004.
