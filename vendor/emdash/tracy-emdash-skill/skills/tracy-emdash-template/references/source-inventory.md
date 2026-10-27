# P1 — Source inventory

## Identify the source before counting

Four source types, and what evidence each **provides** for QA — recorded in `qa.contract.json`
`source.kind` / `source.parity` (validator: [qa-contract.md](qa-contract.md)); what the output **must
meet** (viewport/theme, locale, routes including 404, states) is declared separately in `variants`/`visual.stages`/`pages`,
and **does not shrink to fit the source**: no mobile frame ≠ exempt from responsive, no dark version ≠ exempt from dark,
no 404 page ≠ exempt from unknown-route. Missing evidence is recorded as `missing`/`pending` or replaced by an alternative design
basis (the design system) — it never becomes not-applicable on its own.

| Type | `source.kind` | Provides | Support in the kit |
|---|---|---|---|
| An existing neutral source contract (ADR 0016) | `joomla` · `wordpress` | everything `site-model.json` declares — content as fields, not HTML | an adapter emits it directly (the clean road) or a bridge from an existing spec-pack — [`references/inputs/from-wp-spec.md`](inputs/from-wp-spec.md), [`references/site-model.md`](site-model.md) |
| Static HTML | `html` | DOM + CSS renderable at every viewport/theme → source shots **and** two-sided measurements (`--source-site`) | full: `inventory.mjs`, `render-source.mjs`, `design.parity` |
| Claude Design canvas (`<x-dc>`, `<sc-for>`, script `text/x-dc`) | `canvas` | like HTML, data in object literals (`extract.mjs`); images drawn with `<image-slot>` in a shadow root (counted with `design.images.sourceSlot`) | full |
| Renderable URL (old site, running prototype) | `url` | like HTML but there is no file to hash → `source.files` records the downloaded HTML snapshot (`inventory.mjs` on that folder) | render/parity part as for HTML; **the inventory must go through the download** |
| Frames/images/spec from Figma, Pencil, or another source | `frames` / `parity: declared` | frame images (disposition `reference`, hash = provenance) + numbers/tokens declared in `visual-contract.md` → `design.rules`; no DOM, no two-sided measurements | source shots via `visual-qa.mjs --source-dir`; **no adapter reading live Figma/Pencil** — export frames to files first; this is the missing part, declare it when you hit it |

**Each source has its own packet — read exactly one, don't read them all:**
[`inputs/from-html.md`](inputs/from-html.md) (design folder · canvas) ·
[`inputs/from-url.md`](inputs/from-url.md) (running site, downloaded with `ingest/from-url.mjs`) ·
[`inputs/from-frames.md`](inputs/from-frames.md) (Figma · Pencil · images) ·
[`inputs/from-brief.md`](inputs/from-brief.md) (only a written description — the parity gate is lost) ·
[`inputs/from-wp-spec.md`](inputs/from-wp-spec.md) (bridge from an existing Joomla spec-pack) ·
[`site-model.md`](site-model.md) (a CMS within reach — read the content model, don't scrape HTML).
If you don't know what the source is yet, `scripts/ingest/detect-source.mjs` answers (SKILL.md §Getting started).


`node tools/inventory.mjs <src> <out>` classifies each HTML file: `dc-canvas` (has `<script type="text/x-dc">`)
or `html`. With a canvas, **every file may share one template and one data script** (Northgate:
34 files differing in exactly 3 lines — `<title>`, `state.page`, `LANG_HREF`); `dataScriptSha256` in the output
tells how many real scripts there are. Count pages by `state.page` + `get lang()`, not by file name.

Assets: scan attributes (`src=`, `href=`, `url()`) **and** strings like `'./img/x.png'` in the data script —
a canvas keeps most image paths in the data object. `unresolved` must be 0; `unreferenced` is a list
to cross-check (surplus images, `.teamshare` files…), not an error.

## Extracting data — no eval

`node tools/extract.mjs <src> <out.json>`: parses with acorn, accepts only `const X = <literal>`
(object/array/string/number/boolean/template without expressions); `CallExpression`, spread, identifier →
recorded as `unsupported`, not run. Normalises `./` and `../` to paths from the source root so the two locale folders
compare equal. Labels the canvas **computes inside a class** (e.g. `allProjLabel`, `themeLabel`) are not
in the output — open the script, copy them verbatim into the builder with the line number.

Compare against the previous run's extraction (if any) with a deep diff: differences are allowed only in paths.

## Rendering the source

Serve the source folder on its own origin (`python3 -m http.server <port> --bind 127.0.0.1`), then
`node tools/render-source.mjs http://127.0.0.1:<port> <out> --pages "A.html,B.html,RU/A_ru.html"`.
Recorded in `render-manifest.json`: scrollWidth/overflow, fonts loaded, body colour light/dark, console errors.
**The source's overflow is a fact** (e.g. Northgate: RU 390 = 425px, Style guide 659px): the rebuilt site
must not overflow, and REPORT records it as a deliberate fix relative to the source.

## P1 outputs

- `routes.json`: each route has `path`, `kind` (page/list/archive/detail/system/kit), `source.page` +
  the data keys the markup binds, `cms` (entry/list/taxonomy/derived), `expected` (status, breadcrumb,
  filters, unknown → 404). Chrome (topbar/header/footer/breadcrumb) and `unknownRouteBehaviour` declared
  separately.
- `visual-contract.md`: light/dark token table **with provenance** (which `<style>` selector), type scale
  (font/size/line-height/tracking/weight), spacing/grid/image frames, measured breakpoints, theme hook,
  interaction table (what the source does → what is implemented), component map (static Astro vs island vs shadcn).
- `content-gaps.md`: Gxx codes, evidence (data key), handling. Every "missing/contradictory/mockup" spot goes here.
