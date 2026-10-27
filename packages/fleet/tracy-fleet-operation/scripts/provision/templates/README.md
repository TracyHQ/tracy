# Design inspiration card screenshots — DO NOT DELETE, this is the source for importing into the store

Each subfolder is a `template.id` (`tracy-business`, `tracy-saas`), holding a screenshot of each
layout at 1440×900 and 390×844.

**Why they are still here after `card` left `quickstarts.json` (16/09).** A Design inspiration card
now lives in one place only — `tracy_design_inspiration.json` on the GitHub release — while the
screenshots live in the deployment's own store (`template_shots`,
`apps/tracy-web/src/lib/template-shots.js`). Cards published BEFORE 16/09 have no screenshots in any
store: the only copy is the files here. An operator moves them over with:

```
DATABASE_URL=postgres://… node scripts/template-shots-import.mjs
```

One run per deployment, repeatable (the script says what is `unchanged`). Deleting this folder
deletes that source — and no error shows until the next import on a new machine.

**File names must be what the store accepts** (`shotProblem`): lowercase letters, digits and
hyphens, ending in `.png`, `.jpg`, `.jpeg` or `.webp`, no path. The `check-templates` gate reads
exactly that rule from the store's own code, so a name the store would reject is a red gate here
rather than an empty image tile on the customer's screen.
