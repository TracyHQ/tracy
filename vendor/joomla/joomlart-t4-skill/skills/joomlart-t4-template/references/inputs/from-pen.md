# Adapter — Pencil `.pen` → spec-pack

> **Phase 2.** Read `spec-pack.md` first. Emits `kind: "image"` references.

## Preconditions

- The **pencil MCP** is connected. `.pen` files are encrypted: access them **only** through the
  pencil MCP tools. Never `Read`/`Grep` a `.pen`.
- You have the `.pen` path. If a sibling **design-docs folder** exists at `<pen-dir>/<penname>/`,
  read it too — it is the build contract in plain markdown and saves a lot of MCP round-trips.

**Fail fast** if the MCP is absent: say so and stop. A half-extracted spec-pack that silently
guesses hex values is worse than no spec-pack, because every downstream phase will trust it.

## Why `image` and not HTML

The `.pen` is the **exact-px source of truth**. Exporting it to HTML first and then diffing DOM
against DOM adds a lossy translation step and re-introduces the very ambiguity the design tool
removed. Instead:

- **Numbers** come from the pencil MCP (`get_variables`, `batch_get` with `resolveVariables: true`)
  and go into `design-spec.md` as exact expectations.
- **Pictures** come from `get_screenshot` per frame and go into `reference/` for visual comparison.

Phase 8 then asserts the Joomla render against *both*. That is stricter than a DOM diff, not looser.

## Step 1 — Prove you are on the right `.pen`

```
get_editor_state(include_schema: true)
```

You need the schema before any other pencil tool will make sense. Then **prove the path** —
a returned screenshot does not prove which file it came from. `batch_get` a node you can name from
the design-docs folder and confirm its content matches.

## Step 2 — Tokens

```
get_variables()
```

Gives the token table: brand hex (light + dark), backgrounds, type scale, spacing unit, radii,
shadows, breakpoints. Map them onto the spec-pack's four required palette slots:

| spec-pack slot | usually the `.pen` variable for |
|---|---|
| `primary` | brand/accent — CTAs, links, active nav |
| `secondary` | supporting brand colour |
| `body_bg` | page background surface |
| `text` | default body text |

Record **every** other token too — they belong in `design-spec.md`'s token table and become T4
tokens in Phase 6 (`../css-tokenizing.md`). If `get_variables` returns a dark set, the dark palette
is **read, not derived** — note that in `provenance.json`.

## Step 3 — Frame inventory

The convention is three frames per page:

```
Page/<Name> — Desktop — Light
Page/<Name> — Desktop — Dark
Page/<Name> — Mobile — Light
```

Enumerate every frame. **A page missing one of the three is a gap — flag it to the user before
building**, do not silently build two axes and claim parity on the third.

Map frames → `pages[]` entries. If the design-docs folder has an
`01-information-architecture.md` page-map with a `type` column
(`canvas (hybrid: modules)` / `canvas` / `component` / `system`), **that column is the authority**
for the ACM decision — do not re-derive it:

| design-docs `type` | spec-pack `sections[].kind` |
|---|---|
| `canvas (hybrid: modules)` | `acm` per section — the GUI-editable home/landing stack |
| `canvas` | one `com_content.article`, fullwidth layout, article chrome suppressed |
| `component` | rebuilt from Joomla data via overrides — no `sections[]` |
| `system` | `error` / `offline` standalone PHP |

## Step 4 — Per-frame numbers

For each frame, and each component inside it:

```
snapshot_layout(frameId)                       → geometry: x/y/w/h, gaps, padding
batch_get(nodeIds, resolveVariables: true)     → resolved hex, font, weight, size, line-height, radius
```

Write these into `design-spec.md` as **one table per component**, e.g.:

| Component | Property | Light | Dark |
|---|---|---|---|
| Header | height | 72px | 72px |
| Header | background | `#ffffff` | `#0e1116` |
| Header nav link | font-size / weight / line-height | 15px / 500 / 24px | same |
| Primary button | radius / padding | 8px / 12px 24px | same |

These are what Phase 8 asserts against. Prose ("a comfortable gap") is useless here — write numbers.

> `batch_design` truncates at roughly 7k of output. Batch node reads in chunks and stitch them;
> a silently truncated response looks like a complete one.

## Step 5 — Reference screenshots

```
get_screenshot(frameId)
```

per frame → `reference/<page>-<viewport>-<mode>.png`. Then write `reference.json`:

```jsonc
{
  "kind": "image",
  "viewports": [1440, 390],
  "modes": ["light", "dark"],
  "pages": [
    { "page": "index.html", "shots": {
        "light":  "reference/index-1440-light.png",
        "dark":   "reference/index-1440-dark.png",
        "mobile": "reference/index-390-light.png" } }
  ]
}
```

Use the `.pen`'s own frame widths as `viewports` — matching the design's breakpoints beats using
generic ones.

## Step 6 — Assets

`export_nodes` for any image/illustration the design uses as content (not for CSS-expressible
shapes). Export the **dark** variant at **2×** the CSS display size and encode WebP q≈82 — it reads
acceptably on both themes and is what the editability standard requires for complex section visuals
(`../editability-standards.md`). Simple icons and the brand logo keep rendering as SVG/CSS; do not
flatten those to images.

Later phases may legitimately come back for another `export_nodes` — that is the one sanctioned
reason to re-open the `.pen` after Phase 2.

## Step 7 — Emit + validate

```bash
node scripts/ingest/spec-pack.mjs --validate <WORKSPACE>/<SLUG>-spec
```

## Manual verification checklist

This adapter is MCP-driven and has no unit test. Before declaring Phase 2 done, confirm by hand:

- [ ] `get_editor_state` succeeded and the path was proven with a named node, not a screenshot.
- [ ] Every page has all three frames, or the gaps were raised with the user.
- [ ] The dark palette was **read** from dark frames (not derived) — or `provenance.json` says
      explicitly that it was derived and why.
- [ ] `design-spec.md` has a numeric table per component, with no `TODO` left.
- [ ] Every `reference.json` path exists on disk (the validator checks this — run it).
- [ ] Frame count in `provenance.json` matches what `get_editor_state` reported.
