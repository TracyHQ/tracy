# Note: why this folder lives in `docs/`

The flow D case set (an agent edits a site created with Apply) used to live outside git (`<bench-dir>/tc-run/d/`), so
the results in `tasks/evidence/add-site-apply-audit/flow-d.md` could not be re-run by anyone. This is a copy of that set (PR #926):
63 P0 cases (21 per CMS), the grader `runner/oracle.mjs`, the runner `runner/run3.mjs`.

- It does **not** include the sign-in session (`cookie.txt`), sample images/PDFs (`runner/fixtures`) or site-creation logs: those are
  produced on the machine that runs it.
- This is reference material; it does **not** run in `pnpm test` or `build:check`. To re-run it: bring up the stand (see
  `docs/references/running-tracy-locally.md`), create the three Apply sites, then follow `README.md` here (`derive-d.mjs`, `build-suite.mjs`,
  `run-d.sh`). The paths in the README belonged to the original measuring machine and are shown as placeholders.
- Latest measured result: `tasks/evidence/add-site-apply-audit/flow-d.md` (41 PASS · 12 FAIL · 7 runner errors · 3 n/a).
