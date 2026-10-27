# One visual system, measured before repetition

Read at Phase 2 for a new template/site, style edit or imported artifact, at Phase 6 before
repeating the layout, and at Phase 8/8b before acceptance. `design-spec.md` explains intent;
`design-contract.json` holds executable expectations. CSS/tokens implement them. The content
contract owns business facts. The quickstart presentation lock still controls authorized changes.

## Establish the baseline (Phase 2)

1. Identify the authoritative style guide and inspiration/version. For an existing site, measure
   its accepted style guide first. For a new build, use the supplied design source and record the
   user's decisions. Record capture time and source version/hash. A library preview is not an
   authority to overwrite a site's accepted typography.
2. Fill `<spec-pack>/design-contract.json` using `examples/design-contract.json` as a format example,
   not as style defaults. Map typography roles (display, page title, section, card, body, caption),
   colors, spacing/container/breakpoints, and shared header/menu/footer/button/form/card rules.
   Read actual computed styles in light/dark at desktop/mobile. Include tablet/breakpoint-edge
   variants when the layout changes there. Explicit numeric/CSS values make expectations portable;
   `var(...)` expressions are not computed-style evidence.
3. Inventory every page, query pagination variant, system/auth state and artifact in scope. A page
   declares its applicable rules plus `requiredRules` which must match at least one visible element.
   Use `{mode}` in an artifact URL to select its light/dark document. Frames are separate page entries;
   testing the parent iframe rectangle does not test the document inside it. Specify intentional
   redirects in `expectedUrl`; private states require authenticated observations or remain unverified.
4. Define `coverage` selectors and required properties. Every matched visible element must be covered
   by applicable rules for those properties. Include all content headings and body roles, not merely
   the easiest selector. Exclude third-party extension overlays with the site's own scope selector.
   Review the coverage map against the full DOM before accepting it; a schema cannot discover a
   component the author omitted from both the rules and coverage map.
5. Run the validator and spec-pack gate. Each author receives the same contract path/hash. A source
   or contract change invalidates earlier render evidence; remeasure the reference and affected pages.

```bash
node <skill>/scripts/design-contract.mjs validate <spec-pack>/design-contract.json
node <skill>/scripts/ingest/spec-pack.mjs --validate <spec-pack>
```

Old packs must add a measured contract before resuming. `--init` creates an incomplete skeleton;
`--force` preserves authored contracts. Resolve `pending` decisions before the gate can pass.

## Format (schemaVersion 1)

- `source`: reference, inspiration, version and ISO capturedAt. These record provenance; inspect the
  actual source and keep CSS/source snapshots alongside evidence. A claimed hash is not a live check.
- `theme`: selector/attribute and distinct lightValue/darkValue. The probe reads this signal; configure
  the real theme hook. Imported static documents must expose their actual theme, not a guessed label.
- `variants`: unique id, mode, viewport width/height. Both desktop (>=1280) and mobile (<=430) are
  mandatory in both themes. `tokens` maps each variant to expected root CSS custom-property strings.
- `rules`: unique id, category (`typography`, `color`, `layout`, `component`), selector, and a complete
  `styles` map per variant. Property names are CSSOM camelCase or custom properties. Every category
  must exist. Record canonical token aliases in design-spec; use resolved values in these rules.
- `pages`: id matching the page map, url, expectedUrl, identity selector, rules and requiredRules.
- `coverage`: selector and properties whose classification is mandatory. `pilotPages` names the
  representative pages that must pass before expanding to the rest.
- `exceptions`: exact page/rule/variant, replacement styles, reason and decision reference. Exceptions
  can override declared properties, not remove coverage or disable pages. A rationale is not approval:
  it must cite an existing user/design decision. Do not write an exception just because a test failed.

Poster/slide typography can differ when the brief calls for it. Keep the exception local to that
artifact. Heading HTML tags do not determine the role: a specimen label and a section heading may
both be h2 but have different expectations. Map imported artifact roles to the site's system before
using their CSS. Preserve site header/menu/footer; scope artifact resets away from the site shell.

## Capture and pilot (before repeating pages)

Generate the requested measurement configuration:

```bash
node <skill>/scripts/design-contract.mjs request <contract.json> <page-id> <variant-id>
```

Navigate with the supported browser tool, set the exact viewport, switch the real theme and confirm
it, wait for fonts and stable layout, then evaluate the read-only `captureDesign` callback from
`scripts/design-probe.mjs` with this request as its argument. The callback reads actual geometry,
CSS, tokens, theme and coverage; it does not set styles or navigate. Capture after lazy content is
rendered. Repeated cards are all measured; the probe does not truncate arrays to the first match.
Store each returned object in an observations JSON array, with screenshots and source/CSS hashes.

```bash
node <skill>/scripts/design-contract.mjs pilot <contract.json> <pilot-observations.json>
```

Pilot pass requires every pilot page in every variant, zero findings and zero missing cases, plus
visual review of representative components. A pilot report explicitly says `scope: pilot`; it is
never full-site acceptance. Only then repeat the approved components/token mapping across pages.

## Full acceptance (Phase 8/8b)

```bash
node <skill>/scripts/design-contract.mjs audit <contract.json> <all-observations.json>
```

A full pass requires the complete page × variant matrix, correct URL/theme/viewport, loaded fonts,
identity match, required selector matches, classified coverage and no horizontal overflow. Every
expected property is checked; missing properties fail. CSS colors include alpha and have zero
channel tolerance; px values allow 0.1px rounding only. Empty, stale or duplicate observations fail.
The report states expected/observed cases, elements, properties, missing cases and findings.

Computed family proves the configured stack, not which font supplied every glyph. Review fonts,
images, wrapping, alignment, responsive navigation, interactions and light/dark switching visually.
Record hover/focus/error/open-menu states as separate cases/contracts when needed; the default
matrix is the settled page state. Screenshots and theme-toggle tests remain separate requirements.
Do not generate observations from expected values, broaden tolerances, shrink coverage, or change
Style Guide to bless an accidental override. Fix the implementation, or resolve a deliberate design
change with the user and revise the contract. Capture contract/pilot/full reports in checkpoints.
