# Content translations for `tracy-business/j6` 1.0.0

41 languages; each file is `{slotKey: "translation"}` for the **778 text fields** of the `en-GB` version.

## Source

Extracted from `contracts/tracy-business/j6/1.0.0/content-map.json`: 899 slots carrying `language: en-GB`,
minus 70 `url` slots and 35 `image` slots (they are not text), minus 16 empty fields → **778 strings**.

## Why 41 and not 52

The **interface** language packs cover all 52 (see `../../../language-packs.json`). The **content**
translations are fewer, because 11 of them can reuse another one:

| No translation of its own | Uses |
|---|---|
| `en-AU` `en-CA` `en-NZ` `en-US` | the original `en-GB` |
| `ru-RU` | the 180 Russian entities **already in** the package |
| `de-AT` `de-CH` `de-LI` `de-LU` | `de-DE` |
| `fr-CA` | `fr-FR` |
| `nl-BE` | `nl-NL` |

`pt-BR`/`pt-PT`, `zh-CN`/`zh-TW`, `sr-RS`/`sr-YU` keep separate translations — they really differ.

## How they are checked

`MANIFEST.sha256` holds the hashes of these 41 files. Each file passed six machine checks:

1. all 778 keys, none missing, none extra
2. no empty field
3. no field longer than its slot's `maxCharacters` — an overflow breaks the layout, and nothing reports it
4. no more than 30% left verbatim in English (in practice: 14–23%)
5. the right script, for languages with a script of their own
6. the function words of that very language — **two Latin-script translations swapped with each other pass all five checks above**

Check 6 exists for a measured reason: the translating agents shared one folder and overwrote each
other's files at least three times. German and Dutch are both "not English", both Latin script, both
complete with 778 keys — only function words tell them apart.

⚠ None of the six checks catches **a translation with the wrong meaning**. These 31,898 strings have
not been proofread by a person.

## A defect of the original package that they work around

`module-810.3` in the `en-GB` version carries **Russian** text: `"Горячая линия"` — the hotline label
nobody translated when the EN version was built from the RU one. All 41 translations translate its
meaning (`Hotline`, `Assistance`, `ホットライン`, …); none copies the Russian.

The defect itself stays in the package: **Northgate's English page shows a Russian word.** It must be
fixed in the 1.1.0 archive, not here.
