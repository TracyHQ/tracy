# NOTICE

## Licence

This tree — the `tracy-emdash-template` skill: its method, phase flow, acceptance contract, gate rules,
kit scripts and documentation — is released under the **MIT License** (`LICENSE`). Its home repository
belongs to JoomlArt; the copyright holder released it for publication on 26/10/2026.

## The worked example

`skills/tracy-emdash-template/examples/northgate.md` describes the Tracy Business build and its demo
content "Northgate Industrial". That content is Tracy's own, written for the product — not a
customer's — and is released with `@tracy/emdash-theme-business` under GPL-3.0-or-later
(`packages/cms/tracy-emdash-theme-business/PROVENANCE.md`; source in `vendor/joomla/html/tracy_business/`).
The example quotes only measurements and decisions of that build.

## Third-party software

Nothing third-party is bundled here. The kit's scripts import, at run time and from the template's
own `node_modules`:

| Package | Licence | Used for |
|---|---|---|
| `playwright` | Apache-2.0 | the browser matrix, the visual pass, the interaction probes |
| `emdash` (0.37.x) | MIT | the CMS the template runs on; the kit reads its seed validator and page context |
| `better-sqlite3` | MIT | the runtime preflight and the backup/restore checks |
| `acorn` | MIT | reading literals out of a Claude Design canvas export without evaluating it |

Fonts, images and PDFs belong to whoever supplied the design source. The skill records their
provenance per template (`PROVENANCE.md` in the generated package); it never assumes a right to
redistribute them.
