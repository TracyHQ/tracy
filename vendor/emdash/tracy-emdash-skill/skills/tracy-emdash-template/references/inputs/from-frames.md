# `from-frames` — Figma, Pencil, design images

> **Packet P1.** Merges two sources that the two sibling skills split into `from-figma.md` and `from-pen.md`,
> because for this skill they are **identical**: both are images, neither has a DOM.

## No adapter reads live files — in any of the three skills

No Tracy skill reads `.fig` or `.pen` directly. `references/source-inventory.md` says it
plainly: *"there is no adapter that reads live Figma/Pencil — export frames to files first; this is the missing piece,
declare it when you meet it"*.

Two roads, chosen by what the user can export:

| Can export | Take the road | `source.kind` · `parity` |
|---|---|---|
| **HTML** (Figma → code, Pencil → export) | [`from-html.md`](from-html.md) — far better | `html` · `measured` |
| **Frame images only** (PNG/JPG/PDF) | this packet | `frames` · `declared` |

Always ask for the first road first. An HTML export gives a real DOM, so computed styles can be compared on both sides;
an image does not.

## If there are only images

1. Frame images go into the source folder with `disposition: reference` — they are **provenance evidence**, hashed
   to know whether the source changed, **not** site assets.
2. Numbers and tokens (colours, font sizes, spacing, breakpoints) are **declared by hand** in `visual-contract.md` →
   `design.rules` of `qa.contract.json`. Each number records which frame it was measured from.
3. `source.parity: declared`. Visual QA compares the output with the source images via `visual-qa.mjs --source-dir`,
   but **by the lens's eye**, not by a two-sided measurement.

## 🔒 A missing source does not waive the output requirement

This sentence lives in `references/visual-review-method.md` and is worth repeating here, because `frames` is where it
is violated most: **frames that only have light desktop do not mean the output may lack mobile,
dark or 404**. The source decides the *basis of comparison*, not the *matrix that must be covered*. Missing frames
are recorded as `missing`/`pending` in the contract with the grounds for what you built yourself — not by silently dropping
a variant.
