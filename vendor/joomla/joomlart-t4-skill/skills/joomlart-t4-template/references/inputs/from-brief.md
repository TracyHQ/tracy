# Adapter — written brief / topic → spec-pack

> **Phase 2.** Read `spec-pack.md` first. Emits `kind: "none"` references.

Input is a sentence or a paragraph: *"a template for an artisan bakery"*, *"a SaaS analytics
product, dark-first"*. There is no design to extract from — **you design it**, then write the
spec-pack by hand.

## The honest trade-off, stated up front

With no external reference there is nothing to diff against, so the parity gate that protects every
other adapter does not exist here. Phase 8 degrades to a **self-consistency** check (§4). Tell the
user this once: with a brief, "matches the design" is not a claim anyone can make — the acceptance
bar becomes coherence, coverage and correctness instead. If they have a `.pen`, a Figma file or even
a reference site, one of those adapters gives a materially better result.

That said, this is a legitimate path, and it is the one where the design work is actually interesting.

## Step 1 — Decide the design direction before writing anything

Do not start from a component list. Decide, and write down in `design-spec.md`:

- **What kind of business/product this is**, and what that implies about tone, density and imagery.
- **A type pairing** with a real reason behind it — not Inter/Poppins by reflex.
- **A palette** built from a brand hue, with the four required slots plus the companions Phase 6
  needs (border, heading, surface, muted). Pick both light and dark deliberately; dark is not
  "light with inverted lightness".
- **A spacing scale and a radius scale.** Commit to numbers.
- **One signature idea** — the thing that makes this template not look like every other T4 template.
  `../catalog.md` is the menu of section archetypes and the creative-freedom charter; read it here.

If a `frontend-design` skill is available, this is exactly where it earns its keep — invoke it for
the aesthetic direction, then encode the outcome as tokens.

**Sameness is a defect.** Two briefs in the same category must not produce the same template. Vary
the page subset, the signature section, the layout rhythm, and the type pairing.

## Step 2 — Author `page-map.json`

Use the website/template/edit scope in `../execution.md`. The following expanded page set is
for a distributable template; website/edit include the requested pages and necessary regressions.

Select the page set from `../page-coverage-matrix.md` tier F and `../catalog.md`: 2–3 home variants,
a landing page, the marketing set (about / services / pricing / team / FAQ / portfolio — pick, don't
take all), the content set (blog, article, tag, search), auth (login / register / profile), contact,
and the system pages (404, offline). 18–24 pages, ≥3 layouts, ≥2 styles, ≥6 ACM sections.

Write `sections[]` for the homes and the landing page as `kind: "acm"` with concrete block names —
this is the editability contract (`../editability-standards.md`), and with no source design there is
nothing else forcing you to get it right.

## Step 3 — Author `design-spec.md` with real numbers

Same numeric-table discipline as the design-tool adapters: per component, the exact px/hex/weight
you intend. The difference is that here the numbers are **decisions**, not measurements — which
makes writing them down more important, not less, because they are the only record of intent and the
only thing keeping parallel execute-subagents consistent (`../build-subagents.md` §C).

## Step 4 — `reference.json` and what Phase 8 actually checks

```jsonc
{
  "kind": "none",
  "viewports": [1440, 768, 390],
  "modes": ["light", "dark"],
  "pages": [ { "page": "index.html" }, … ]
}
```

With no external target, Phase 8 runs the **self-consistency gate**. Every one of these must pass on
every page:

1. **Token fidelity** — every colour on screen resolves to a token from `design-spec.md`. A hex that
   appears in the render but not in the spec is a defect (it means something was hardcoded).
2. **Both palettes render** — the dark toggle flips every surface: page, cards, header, off-canvas,
   footer, form controls, standalone 404/offline. No white or navy leaks.
3. **No horizontal overflow** at any of the three viewports.
4. **Type scale holds** — headings use the declared sizes/weights, not browser defaults leaking
   through from the cloned blank (`gotchas.md` #57 is exactly this).
5. **Coverage** — every page in `page-map.json` returns its expected status (404 for a missing URL, potentially 503 for offline), including search and the
   three auth views.
6. **Editability** — the full `../editability-standards.md` audit. This carries extra weight here:
   with no design to point at, an unreviewable template is the likeliest failure mode.

## Step 5 — Validate

```bash
node scripts/ingest/spec-pack.mjs --validate <WORKSPACE>/<SLUG>-spec
```

The validator accepts `kind: "none"` and skips the reference-path existence check for it — every
other check (page floor, palette completeness, no unresolved `TODO`) still applies.

## Manual verification checklist

- [ ] The user was told once that no parity gate exists on this path.
- [ ] The design direction is written down with reasons, before any page list.
- [ ] Palette has light **and** dark, both chosen deliberately.
- [ ] The page selection and signature section differ from the last build in this category.
- [ ] `sections[]` populated with ACM kinds on every home/landing page.
- [ ] `design-spec.md` carries numeric tables, no `TODO`.
- [ ] The validator passes.
