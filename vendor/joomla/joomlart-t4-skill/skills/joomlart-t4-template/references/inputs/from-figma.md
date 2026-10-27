# Adapter — Figma → spec-pack

> **Phase 2.** Read `spec-pack.md` first. Emits `kind: "image"` references.

Structurally this is the same adapter as `from-pen.md` — a design tool with exact numbers plus
renderable frames. Read `from-pen.md` for the reasoning behind `kind: "image"`; this file covers only
what differs.

## Preconditions — check these BEFORE extracting anything

A **Figma MCP server must be connected** to the session (Figma's Dev Mode MCP, or an equivalent that
exposes the file/node tree and can render frame images).

```
Confirm: a Figma MCP appears in the available tools AND a trivial call against the target
file key returns the document name you expect.
```

**If no Figma MCP is connected, stop and say so.** Do not:

- guess values from a pasted screenshot,
- ask the user to describe the design in words and treat that as extraction,
- fall back to scraping a Figma share link's HTML.

Each of those produces a spec-pack whose numbers are fiction, and every later phase will trust them.
The honest options to offer the user are: connect the MCP, export the frames and use
`from-html.md`/`from-brief.md`, or supply a `.pen`.

## What to extract

| spec-pack artifact | Figma source |
|---|---|
| `theme.palette.light` / `.dark` | Published **colour variables / styles**. Figma files usually name modes `Light`/`Dark` on a variable collection — read both modes, do not derive. |
| `theme.fonts` | Text style definitions — family, weight, size, line-height. |
| `pages[]` | Top-level frames. Figma naming is far less disciplined than Pencil's, so **derive the page list from the frames, then confirm the mapping with the user** before Phase 2. |
| `design-spec.md` numeric tables | Per-node: fills, strokes, corner radius, auto-layout padding/gap, effects (shadows), text properties. Auto-layout padding + gap are your spacing scale. |
| `reference/*.png` | Rendered frame images, one per page × viewport × mode. |
| `assets/` | Exported image fills and illustrations. |

## Figma-specific traps

- **Variables vs styles.** Older files use colour *styles* (no modes); newer ones use *variables*
  with a Light/Dark mode. If the file only has styles, there is likely no dark palette — set
  `theme.palette.dark` to `null` and record in `design-spec.md` that dark is derived in Phase 6 via
  `../dark-light-mode-standard.md`.
- **Frames are not pages.** Figma files carry component sheets, scratch frames, and old versions
  alongside real pages. Filter to the frames that are actually pages; list what you excluded in
  `provenance.json.notes` so the exclusion is reviewable.
- **Absolute positioning lies about intent.** A frame without auto-layout gives you x/y coordinates,
  not a spacing system. Where auto-layout is absent, derive the spacing scale from the *repeated*
  gaps you measure and say so in `design-spec.md` — do not present a measured one-off as a token.
- **Detached instances.** Two "identical" cards may carry different values if one was detached.
  Measure the instances you will actually build against, not just the master component.
- **Responsive frames may not exist.** Many Figma files ship desktop only. If there is no mobile
  frame, `reference.json.viewports` must not claim one — and you must tell the user that responsive
  behaviour will be designed by you, not reproduced. Record it in `provenance.json.notes`.

## Emit + validate

Same as every adapter:

```bash
node scripts/ingest/spec-pack.mjs --validate <WORKSPACE>/<SLUG>-spec
```

## Manual verification checklist

- [ ] The Figma MCP responded and the returned document name matches the intended file.
- [ ] Colour values came from variables/styles, not from eyedropping a rendered PNG.
- [ ] Light and dark were both read, or dark is explicitly marked derived.
- [ ] The frame→page mapping was confirmed with the user (Figma naming is unreliable).
- [ ] Excluded frames are listed in `provenance.json.notes`.
- [ ] `design-spec.md` has numeric tables with no `TODO`; the validator passes.
