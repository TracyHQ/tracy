# Notes on the 152 design systems

This folder holds what was **learned from using** OpenDesign's 152 design systems. It is not
documentation for the code in `packages/design/tracy-design-inspiration`; that code describes itself
in the package README. What is here are conclusions you can only reach by taking the tokens and
building something real with them.

It lives outside `docs/references/` on purpose: `check-doc-frontmatter` only guards that folder, and
its rule — every document must declare `sources` pointing at code that still exists — cannot apply
to a report about **someone else's** code (`vendor/tracy/od-design-system`, `t4_bs5_blank`, and the
JoomlArt skill set). For the same reason `gen-doc-index.ts` does not scan this folder, just like
`docs/design/`.

| Document | What it covers |
|---|---|
| [Four directions for improvement, drawn from one real template build](four-improvements-from-one-template-build.md) | Building `tracy_apple` (a T4 template for Joomla 6) from the `apple` system, running all of Phase 0→9 of the `joomlart-t4-template` skill. Seven gaps in the design system, three gates missing from the skill, eight things worth fixing in T4, and the problem of parallel agents not seeing each other. Every number measured on the running site — 09/09/2026 |
| [Improving the Tracy design library from Refero Styles](improvements-from-refero-styles.md) | A trial crawl of 20 Popular styles and an index of 1,342 URLs, compared against the existing library of 154 systems; priority is keeping typography, image rules and layout through the brand engine, plus the contradictions to verify before importing — 08/10/2026 |
| [Refero Styles snapshot library](../../vendor/tracy/refero/README.md) | All 1,342 public styles found, raw data, Compact/Extended exports, screenshots and hash/completeness checks; kept separate for later integration — 08/10/2026 |

## Why this is worth keeping

The three worst defects of that build all belong to the group **no gate caught**: all body text fell
back to Times on every page, the marketing page rendered in a 406px column, and nine colour bands
had a 4% lightness range. All six of the skill's scanners were green; the defects only showed up
when a person looked. The appendix at the end of the document lists all ten defects with a "who
caught it" column — read that first if you plan to add a gate.
