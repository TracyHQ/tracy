# Design Spec — the written hand-off that makes execute subagents safe

> **Cross-cutting artifact (produced after Phase 2, completed after Phase 6, consumed in Phase 3 & 5).**
> The design-spec is the single WRITTEN source the execute subagents (`t4-chrome-builder`,
> `t4-acm-block-builder`, `t4-override-builder`) read **instead of conversation context**. It is what
> turns "per-component build subagents" from risky (each agent re-invents tokens/spacing/naming → an
> inconsistent template) into safe (every agent routes through the SAME spec). No spec → build chrome
> + ACM + overrides INLINE. See `build-subagents.md` §C for the dispatch rules.

## Why it exists

The build spine runs inline because the phases share **conversational** context (the design
decisions, the captured menu ids) — NOT filesystem/DB access (every agent shares the disk + DB). The
moment a phase's inputs are a **written artifact**, an execute subagent can read the artifact and run
independently. The design-spec is that artifact for the file-independent authoring work (Phase 3
chrome, Phase 5 ACM blocks + component overrides).

## Lifecycle

1. **Generate the skeleton (after Phase 2):**
   `node scripts/make-design-spec.mjs <page-map.json> --out build-docs/design-spec.md`
   (or pipe: `node scripts/parse-html-bundle.mjs <bundle> | node scripts/make-design-spec.mjs -`).
   It auto-fills everything the page-map knows: template identity, palette light+dark (primary /
   secondary / body_bg / text), fonts, and the page/view/layout list.
2. **Complete every `TODO` (during/after Phase 6):** the dark hook, the class prefix, the
   border/heading/surface palette companions, the full type scale, the spacing, your token names, and
   the per-artifact **source pointers** (which bundle section + image each builder must match).
3. **Only THEN dispatch execute subagents.** A spec with open `TODO`s would let builders guess —
   defeating the point.

## Required contents (the contract)

The generator emits this shape; keep these sections (builders rely on them):

| § | Section | Auto-filled from page-map? | Notes |
|---|---|---|---|
| 1 | **Identity** — `<TPL>`, title, bootstrap, **dark hook**, **class prefix** | name/title/bootstrap yes; hook+prefix `TODO` | dark hook pinned in Phase 0 (`css-tokenizing.md` §3a) |
| 2 | **Palette** light AND dark — primary/secondary/body_bg/text/border/heading/surface | 4 core yes; border/heading/surface `TODO` | dark mirrors light; remap palette-band + `--t4-card-bg` (gotchas #58/#59) |
| 3 | **Type scale** — body+heading fonts, h1–h6 size/weight/line-height, body metrics | fonts yes; scale `TODO` | **pin in `etc/site/default.json`** not just theme JSON (gotcha #57) |
| 4 | **Spacing** — section rhythm, container, gutter, card padding | `TODO` | read off the rendered design at Phase 6 |
| 5 | **Token taxonomy** — the exact T4 token names every agent must reuse | pre-listed | add template-specific names here |
| 6 | **Per-artifact source pointers** — each block/override/chrome part → source section + image asset | page list yes; sections `TODO` | builders match this markup pixel-for-pixel; image = `media` field, dark mockup, not SVG |
| 7 | **Naming** — module-title format `[<Tpl>] <Page> - <Section>`, module-chrome `style` (⚠ verify per build — gotcha #22 dash-format vs platform-bug P75 bare), ACM language keys | pre-filled with `<TPL>` | matches `editability-standards.md` §7 |

## How a builder uses it

Each execute subagent is handed the **template dir + the design-spec path + its ONE artifact + that
artifact's source markup**. It reads the spec for tokens/type/spacing/naming/hook, reads its row in §6
for the source it must match, authors only its own path, and **returns** the shared-file lines (scss
`@import`, layout position, language keys) for the spine to merge once (avoids parallel write races).

## Keeping it correct

`scripts/make-design-spec.mjs` is covered by `scripts/test/make-design-spec.test.mjs` (identity +
auto-filled palette/fonts present, `TODO` slots preserved, source table lists the pages, degrades on a
minimal map). Run `npm test` after editing the generator.
