# The spec-pack — the one contract every input adapter emits

**Design contract:** read `../design-contract.md`. A valid `design-contract.json` is required at Phase 2.
Authors use its pinned roles/tokens; pass the pilot matrix before repetition and the complete
page/viewport/theme matrix before acceptance. Keep the contract hash with all observations.


> **Phase 2 packet (Ingest & Map).** Read this first, then the one `from-*.md` adapter that matches your
> input. Everything downstream (Phases 3–10) reads the spec-pack and **never** looks at the original
> source again.

## Why this exists

A `.pen` file, a Figma document, a live URL, an HTML bundle and a one-paragraph brief have nothing in
common structurally. Rather than teach the build pipeline five source formats, each input gets a thin
**adapter** that produces the same artifacts. The pipeline is input-blind.

```
INPUT              ADAPTER                       SPEC-PACK              PIPELINE
─────              ───────                       ─────────              ────────
.pen            →  pencil MCP              ┐     page-map.json      ┐   P3  Chrome
Figma           →  Figma MCP               │     design-spec.md     │   P4  Layouts & theme
URL website     →  Playwright crawl        ├──→  reference/         ├→  P5  Overrides + ACM
HTML bundle/dir →  scripts/ingest/…        │     reference.json     │   P6  CSS · P7 Demo
text brief      →  authored                ┘     assets/            ┘   P8  Verify · P8b Review
                                                 provenance.json         P9  Package · P10 Quickstart
```

(Phase 0 provisions the site and Phase 1 scaffolds `<TPL>`; neither reads the spec-pack, so they can
run before or in parallel with ingest.)

**The adapter is the ONLY place that knows about the input format.** If you find yourself reaching
back to the `.pen`/Figma/URL from Phase 5, the adapter under-extracted — go back and fix the
spec-pack instead. (One exception, stated in `from-pen.md` and `from-figma.md`: re-reading the design
tool to *export an image asset* at Phase 6b is fine and expected.)

## Layout

Written to `<WORKSPACE>/<SLUG>-spec/` (kept out of the Joomla site tree so it never ships):

```
<SLUG>-spec/
  page-map.json         # machine-readable: identity, theme, pages[], sections[]
  design-contract.json  # measured design roles, variants, coverage and bounded exceptions
  content-contract.json # site facts, sources, voice, demo/customer mode and surface coverage
  design-spec.md        # human/agent-readable design system + per-artifact source pointers
  reference/            # the per-page comparison target (see reference.json)
  reference.json        # per page: what kind of target, and where
  assets/
    images/             # bitmaps/SVG pulled from the source
    fonts/              # self-hosted webfonts, if any
  provenance.json       # adapter, source identity, timestamp, tool versions
```

Read `../content-contract.md` before authoring copy. The spec-pack validator requires a valid
`content-contract.json` covering every page-map filename. Phase 7 adds `content-plan.json`;
keep resolved copy and observed-content evidence with the checkpoints.

## 1. `page-map.json`

The schema is unchanged from the HTML-bundle era — see `../conversion-contract.md` §2 for the full
annotated field reference. Two keys are **added** by the adapter layer:

```jsonc
{
  "template": { "name": "ja_acme", "title": "Acme", "bootstrap": "bs5" },
  "theme": {
    "palette": { "light": { … }, "dark": { … } },
    "fonts":   { "body": "Inter", "heading": "Poppins" }
  },
  "pages":     [ … ],          // see conversion-contract.md §2 / §3
  "acm":       [ … ],
  "positions": [ … ],

  // ── added by the adapter layer ──
  "reference": "reference.json",   // relative path; always this value
  "provenance": "provenance.json"
}
```

Requirements the validator enforces (`scripts/ingest/spec-pack.mjs --validate`):

- `template.name` matches `^ja_[a-z0-9][a-z0-9_-]*$`; `template.title` non-empty.
- `theme.palette.light` has all four of `primary`, `secondary`, `body_bg`, `text`, each a parseable
  CSS colour. `theme.palette.dark` may be `null` **only** if `design-spec.md` says dark is derived in
  Phase 6 — otherwise it must have the same four keys.
- `theme.fonts.body` non-empty.
- `pages[]` has **at least 12 entries** (the coverage floor; the realistic target is 18–24 — see
  `../page-coverage-matrix.md` tier F) and **must** include a page mapped to each of
  `com_content.featured`, `com_content.category.blog`, `com_content.article`, `error`, `offline`.
- Every `pages[].file` has a matching entry in `reference.json` (or `kind: "none"` globally).

## 2. `design-spec.md`

The design system as prose + tables: token names, the light and dark palette, the type scale, the
spacing scale, the class prefix, the dark hook, and **per-artifact source pointers** (which frame /
selector / URL each chrome part and each section came from).

Generate the skeleton with `scripts/make-design-spec.mjs`, then complete every `TODO`. Full contract:
`../design-spec.md`. **A spec with an open `TODO` fails validation** — this artifact is what parallel
execute-subagents read instead of conversation context (`../build-subagents.md` §C), so an
unfinished one makes them diverge.

For `image`-kind references (`.pen`, Figma) this file carries something extra and important: the
**exact numeric expectations** pulled from the design tool's API — hex values, px sizes, font
weights, line heights, radii, gaps. Phase 8 asserts the Joomla render against these numbers. Write
them as a table per component, not as prose.

## 3. `reference.json` — the only thing Phase 8 branches on

Declares, per page, **what to compare the Joomla render against**:

```jsonc
{
  "kind": "html",                    // default for all pages; a page may override
  "viewports": [1440, 768, 390],
  "modes": ["light", "dark"],
  "pages": [
    { "page": "index.html",   "path": "reference/index.html" },
    { "page": "blog.html",    "path": "reference/blog.html" },
    { "page": "landing.html", "kind": "image",
      "shots": { "light": "reference/landing-light.png", "dark": "reference/landing-dark.png" } }
  ]
}
```

### The four kinds

| `kind` | Emitted by | What Phase 8 does |
|---|---|---|
| `html` | `from-html` | Render the reference `.html` in the browser and the Joomla page side by side; probe `getComputedStyle` on both; diff with `scripts/verify-render.mjs`. **Strictest** — an actual DOM on both sides. |
| `url` | `from-url` | Same as `html`, but the reference side is the live URL. Network-dependent; snapshot the probes early so a source change mid-build does not move the goalposts. |
| `image` | `from-pen`, `from-figma` | Screenshot the Joomla page at each viewport/mode and compare against the reference frame **visually**, *and* assert the probed computed values against the numeric table in `design-spec.md`. The numbers come from the design tool's API, so they are exact — this is stricter than it looks. |
| `none` | `from-brief` | No external target exists. Self-consistency gate only: every token resolves, both palettes render, all three viewports have no horizontal overflow, the dark toggle flips every surface. |

Rules:

- The top-level `kind` is the default; a page-level `kind` overrides it. Mixed packs are legal (an
  HTML bundle that also ships two Figma frames).
- `path` / `shots` are **relative to the spec-pack root**. The validator fails on a dangling path —
  a reference that does not exist on disk is worse than no reference, because Phase 8 would silently
  skip it and report a pass.
- `viewports` must contain at least one mobile (`≤430`) and one desktop (`≥1280`) width.
- `modes` must contain both `light` and `dark` unless the source genuinely ships only one, in which
  case `design-spec.md` must say which palette is derived and how.

## 4. `assets/`

Images, SVGs and fonts pulled out of the source, with original filenames preserved where possible.
Phase 6b (imagery) copies these into the template or the site's `images/`, re-encoding as needed.

**Licence discipline:** record where each asset came from in `provenance.json`. For `from-url`, an
asset scraped from a third-party site is *not* automatically licensed for redistribution — flag
anything you did not author, and replace it with a licence-safe equivalent before packaging (see
`gotchas.md` #11).

## 5. `provenance.json`

```jsonc
{
  "adapter": "from-pen",
  "adapterVersion": "1.0",
  "source": { "kind": "pen", "path": "designs/acme.pen", "frames": 31 },
  "generatedAt": "2026-08-02T09:14:00Z",
  "tools": { "pencilMcp": "…", "node": "v22.…" },
  "notes": [ "dark palette read from the Dark variant frames, not derived" ]
}
```

Its job is answering "where did this number come from?" three weeks later, and letting Phase 10
prove the demo content is reproducible.

## The gate — run this before Phase 3

```bash
node scripts/ingest/spec-pack.mjs --validate <WORKSPACE>/<SLUG>-spec
```

It exits non-zero and prints one line per problem. **Nothing downstream may read a spec-pack that
has not passed.** The checks are deliberately blunt (missing field, dangling path, unresolved TODO,
page count under floor) because those are exactly the failures that stay invisible until Phase 8 and
then cost a rebuild.

## Choosing your adapter

| Input you were given | Read |
|---|---|
| A `.pen` file (Pencil design) | `from-pen.md` |
| A Figma file / node URL | `from-figma.md` |
| A live website URL to reproduce | `from-url.md` |
| A folder of HTML (bundle with `manifest.json`, or raw pages) | `from-html.md` |
| A written brief / topic, no design | `from-brief.md` |

Given two inputs (e.g. a `.pen` **and** a reference site), pick the one that is the design authority,
build the spec-pack from it, and record the other under `provenance.json.notes`. Do not merge two
adapters — mixed authority is how a build ends up matching neither source.
