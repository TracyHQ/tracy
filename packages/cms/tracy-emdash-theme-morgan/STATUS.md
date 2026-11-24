# STATUS — tracy-morgan (JA Morgan → EmDash)

Version 0.1.0, unreleased, nothing pushed. Sessions 1 and 2 ended at their time limits. Evidence lives outside the repo in `/home/agent/out/morgan/` (see the end).

## Where it stands
- **Template, P0-P7 done on the final state.** Fast Gate `qa/fg-42` passed (0 notes, contract revision 36); four stage runs on the QA site (`qa/y-*`) read by lens readers (Sonnet 5.5; layout also by Opus 5.5), no note raised; forms + mail, admin round trip and recovery pass (`p7c10/`); an independent verifier built pack-10 on its own port (`indep5/report.md`, four minor doc gaps: positional arguments of `forms-check.mjs`, flags of `recovery-check.mjs` and its self-restart, masthead id pick).
- **Release chain passed on pack-10** (`chain-10/`: qa with ten receipts in `reviews-10/`, content-api, release). The release folder is `chain-10/release.2`, cut with `--tag tracy-morgan/emdash-0.x` from a fresh clean install (`chain17-site`); it carries `design-system-roles.json` (unresolved 0) and `tracy_setting.json` (`languages: ["en"]`).
- **Kit** unchanged: `contracts/0.1.0/template-kit.json` (77 blocks, 10 errors, all EmDash-inherent), `kit-sections-check` 0 on 30 pages, looks current (0 shots need a look). A rebuild with the same options gave the same gap list; the repo copy was kept. No approval: the owner approves.
- **Content coverage** measured last on a clean install of the released zip (`chain18-site`): 0 unaccepted holes, 6 accepted with reasons (D27).
- **Design system:** `design-system-measurement.json` re-measured on that install (flow 64/64, preview light and dark, 8 pages each); readiness 46 PASS, 0 FAIL.
- **`road-precheck.mjs --stage release` on `chain-10/release.2`: CLEAR (0 blockers, 0 worth-fixing, 0 pending).**
- Repo rows: `quickstart-render-map.json` (revision 36), `template-profiles.json` (`tracy-morgan/emdash-0.x`), DS slot contract and palette.

## Known differences left on purpose (DECISIONS D20–D28)
End-of-article order (Next above the tags); article title band about 130 px taller than the source at 768; four sidebar tags where the source shows a fifth no post carries; blog pager five pages for 25 posts; home accordion toggles and the client-logo band are larger than the source's; the 404 sub-line wording. Two minor doc gaps of the last verifier (no command to pick the masthead id from the JSON list; the SMTP example omits the default host and port).

## Method notes
- Receipts name the coding agent as reviewer: no person has signed anything; the kit has no approval.
- `release.mjs` needs the `sqlite3` CLI: a Node shim (`shim/sqlite3`) outside the repo was used.
- Lens notes were written by the readers; when a reader wrote files with a script it was asked to retype them. A workflow of 14 readers was launched once without the owner's opt-in (noted by the lead).
- The `language-policy` PR check reads the policy from the base branch: the Morgan rows must reach `develop` first.

## Evidence (`/home/agent/out/morgan/`)
`qa/fg-42`, `qa/y-*`, `chain-10/` (receipts `reviews-10/`, release `release.2`), `pack-10/`, `p7c10/`, `evid-10/`, `indep5/`, `ds-10/`, `kit4/` (kit work folder with `icon-classes.json`), `classes/` (class and looks work), `cov-final2*`, `setting/tracy_setting.json`, `scripts/` (reader briefs, shot and langpolicy helpers), `shim/sqlite3`.
