# Example: Tracy Business (`tracy-business`) — Northgate Industrial demo content (13/09/2026)

Not a general rule — these are the measurements of one specific source, so the next person knows what "normal looks like".
Identity: template **Tracy Business** / id `tracy-business` / package `@tracy/emdash-theme-business`;
Northgate is the **demo content** in the seed, not the template's name (D31).

- Source: `vendor/joomla/html/tracy_business/` — 96 files, 15.6 MB; 34 HTML = Claude Design canvas exports,
  **one** template + **one** data script (14 EN/RU objects); 49 PNG, 9 PDF. The source render overflows at RU 390.
- Record: `tasks/emdash-northgate/` (`architecture.md`, `DECISIONS.md` D1–D32, `STATUS.md`, `inventory/`,
  `content-gaps.md` G1–G28, `visual-contract.md`, `content-model.md`, `plugin-matrix.md`, `REPORT.md`,
  `REVIEW-independent-2026-09-13.md` + `REMEDIATION-2026-09-13.md`).
- Package: `packages/cms/tracy-emdash-theme-business/` — 14 collections, 8 taxonomies (4 × 2 locales),
  12 menus, 100 entries, 35 media / 98 targets, 4 forms, 16 views, 2 islands, 7 shadcn primitives.
- Dev runtime: port 4360; second clean site 4361 (`tools/clean-install.sh`); Mailpit 1025/8025.
- First independent review (Codex): 8 findings F1–F8 — all about the **tools** (clean-install deleting the target, bootstrap
  `--force`, media edits publishing drafts, media reuse by name+size, kit tied to Northgate, identity, audit not
  asserting, canonical dropping `?page`), none about the pages. Only after fixing them were there 30 regression tests and the DE/FR fixtures.
- Evidence (outside the repo): `~/TracyHQ/emdash-builds/northgate/evidence/`.
- Costs paid (all in DECISIONS): `$media.file` does not exist on 0.37 → importer; PUT is a draft →
  publish; `entry.id` is the slug; `i18n.fallback` turns 404 into 302; Field Kit peer mismatch; `reference`
  is a single id; plugin routes are not multipart; checkboxes need `"true"`; the dev daemon needs a restart on PUT 500 HTML;
  the template's native plugin must have an `entrypoint` file + export `createPlugin` (a `definePlugin` object is not accepted
  directly in `astro.config`); core's hreflang follows `urlPattern`, so the template emits its own (D27).
- Visual QA by tier (14/09): contract r14 — 48 pages (24 routes × EN/RU), 19–20 layouts, 3 widths
  (1440 · 768 · 390, 1280 dropped) × light/dark = 6 variants, 4 tiers; ~266 images per full run instead of 768 (shot by
  layout, RU only at 390 for typography). Run `qa-7` before tiers existed: 1,840 dark findings traced back to **one**
  rule (`html[data-theme="dark"] a`) — evidence for "once light is done, dark has few defects" and for why the Fast Gate
  runs all tiers on a small set. Full `light-desktop` of 48 pages on a clean site: **8 min 09** (19:40:30 →
  19:48:39, `vqa-4`, 40 images, 1,920 components measured, 0 findings). Fast Gate measurements of the 14/09 evening run: the
  "Fast Gate" section in TCH's `tasks/emdash-fast-gate/TODO.md` (copy them here once settled).
