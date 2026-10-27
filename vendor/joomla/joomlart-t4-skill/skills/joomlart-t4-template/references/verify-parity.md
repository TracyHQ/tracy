# Q4 — Verify parity: clean install + parallel compare vs live (the product)

> **Phase Q4 packet — verify parity (the product).** Clean restore + parallel page-and-DB compare vs live.
> The install step is the Akeeba **Kickstart/ANGIE restore** (`akeeba-method.md` Q4) — NEVER a base.sql CLI
> install. The page sweep mirrors `review-verify-method.md`; dispatch `t4-quickstart-parity` agents.

The package is only "done" when a CLEAN install of it renders **100% identical** to the live source. This
phase is the bulk of the work: **initialize** a fresh site from the package, and **compare it in parallel**
against `<SRC>`, page-by-page and row-by-row, looping until there is zero difference.

## Step 1 — Stand up a genuinely CLEAN `<TEST>` and RESTORE the `.jpa`
- Fresh files (an empty web root) + a FRESH empty DB (new DDEV project or a new DB name) — NOT the dev site,
  or you're testing the dev site, not the package.
- **Restore via Kickstart + ANGIE** (the shipped method — NOT a base.sql CLI install, NOT a manual `mysql <`
  import): drop `kickstart.php` + the `.jpa` into the empty web root, run Kickstart to extract, then drive
  **ANGIE** (`/installation`) end-to-end — pre-check → DB step with the fresh DB creds + a prefix **different
  from `<SRC>`'s** (`qs_`) to prove tokenization → set the REAL site name → finalise → remove `installation/`.
  Full GUI-drive discipline: `akeeba-method.md` Q4.
- **Assert fatal-free restore AND template auto-active:** ANGIE removes `installation/`, writes
  `configuration.php` with the new prefix; then `#__template_styles WHERE home=1` = `<TPL>` and the front-end
  (after cache clear) renders the DEMO with the template already applied — ZERO manual steps.
- If the restore aborts (e.g. `#__schemas` duplicate) or the front-end is the default template → fix the
  SOURCE/package (re-capture from a corrected live site / missing extension / wrong `default.json` params) and
  **re-capture** (`akeeba-method.md` Q2). Don't proceed.

## Step 2 — DB-parity (the structural truth, orchestrator runs centrally)
Compare `<TEST>` vs `<SRC>` at the data layer — this catches what screenshots can't:
- **Per-table row counts** for the content tables: `content`, `menu` (per menutype), `modules`, `categories`,
  `tags`, `contentitem_tag_map`, `fields`, `fields_values`, `contact_details`, `template_styles`, `users`,
  `assets`, `ucm_content`, `workflow_associations` (one per article — else articles are uneditable in admin,
  see gotchas / builder #66). Counts must match (allow only the deliberate admin-user delta).
- **Key params identical:** `template_styles.params` (megamenu/nav/site settings) for the template style;
  `modules.params` for the ACM instances; menu item `params` (mastheads/subtitles); `fields.access` (the
  author/profile fields must be Special, not Public — or they leak onto registration).
- **Spot-content:** a few article bodies, the com_fields values for the author personas, the contact record.
- Account for the prefix difference (`qs_` vs `str_`) in your queries; compare VALUES, not prefixes.
Any mismatch → something was excluded/!exported/!imported → fix Q1/Q2, rebuild, reinstall.

## Step 3 — Page parity (perceptual + content, parallel subagents)
Use the SAME page inventory the design-review used, and the SAME 4-axis sweep it codifies (design-review
`review-verify-method.md` — this step mirrors it, comparing two LIVE sites instead of live-vs-design). For EVERY
page, render BOTH `<TEST>` and `<SRC>` and diff:
- **Screenshot** light + dark + mobile@390 — they must look identical (same sections, images, layout, theme).
- **Content** — same headings/copy/counts/author bylines/images actually present (not "No articles", not
  broken `<img>`, not raw `TPL_` keys, not chrome-blob).
- **Behaviour** — mega menu opens, off-canvas drills, accordion/filter work, theme toggle persists, forms render.
- **No horizontal overflow**, no console PHP errors/500s on `<TEST>`.
Parallelize page-groups to opus/sonnet subagents (each: load both sites, compare, report deltas) — like the
review sweep. The orchestrator re-checks any "identical" claim.

## Step 4 — Diagnose every diff to its SOURCE, fix, loop
A page/asset that differs in `<TEST>` almost always means a packaging gap, not a template bug:
- Missing image → not bundled in Q1 (media) → add it.
- Missing module/section/page → table/rows excluded from the dump, or sample-data didn't import fully.
- Broken CSS/JS → shipped a stale `media/t4/optimize` hash, or didn't clear cache on first run.
- Wrong/blank content under a different prefix → a `str_` token leaked into data, or tokenization hit data.
- Extension missing/disabled → its files or `#__extensions` row not bundled.
- Future-dated demo content vanished → publish_up in the future relative to install date (see gotchas).
Fix the SOURCE (re-export / add media / adjust scrub / fix tokenization / add extension), rebuild the zip,
reinstall clean, recompare. **Never patch `<TEST>` directly to make it match — that defeats the test.**

## Step 5 — Sign off only on shown 100% parity
Produce a parity report: install verdict (fatal-free), the DB row-count table (`<SRC>` vs `<TEST>`), and a
per-page PASS table (light/dark/mobile) with screenshots. "Identical" must be EVIDENCED (counts + shots),
not asserted. Loop until the report shows zero deltas. Then the quickstart is the product.

## Verify-the-verifier
Subagents over-claim "identical". The orchestrator independently re-renders a few pages on both sites and
re-runs a couple of the row-count queries. A bare "PASS" with no screenshot/numbers is not accepted.
