# STATUS — tracy-morgan (JA Morgan → EmDash)

Version 0.1.0, unreleased, nothing pushed. Sessions 1 and 2 ended at their time limits. Evidence lives outside the repo in `/home/agent/out/morgan/` (see the end).

## Where it stands
- **Template, P0–P7 done.** Fast Gate `qa/fg-40` signed on contract revision 36; the four visual stage runs on the QA site (`qa/w-*`) read by lens readers (Sonnet 5.5; layout lens also by Opus 5.5); every raised note closed by its own lens (D25, D28); forms + mail, admin round trip and recovery pass on the QA site (`p7c7/`); an independent verifier built pack-7 on its own port (`indep3/report.md`, two minor doc gaps).
- **Release chain passed on pack-7** (`chain-7/`: docs, artifact, pack, clean-install, qa with ten current receipts in `reviews-7/`, content-api, release). The release folder is `chain-7/release.3` (cut with `--tag tracy-morgan/emdash-0.x`, the tag the sibling templates use) from a **fresh clean install** (`chain11-site`), not from the QA site (which holds test submissions and a Mailpit SMTP setting). `tracy_setting.json` is beside it (`scripts/tracy-setting.mjs` `settingFrom`, with `languages: ["en"]`).
- **Kit:** `contracts/0.1.0/template-kit.json` (built with `--reread-sections`, records `sectionsOfPage`; 77 blocks, 162 images; 109 icon classes and faces written by Sonnet agents that looked at the pictures; 81 looks), byte-identical to the json in the zip (`kit4/`), `kit-sections-check` = 0 on 30 pages, **10 errors, all EmDash-inherent** (see the kit gap list in the last report). No approval: the owner approves.
- **Content coverage** (`contracts/0.1.0/content-coverage.json`) measured last on a clean install of the released zip (`chain12-site`): 0 unaccepted holes, 6 accepted with reasons (D27).
- **Repo rows:** `quickstart-render-map.json` (revision 36), `template-profiles.json` (`tracy-morgan/emdash-0.x`), DS slot contract `templates/emdash-tracy-morgan.json` (ready, measured: ROLE-1, SCREEN-1, CON-1, UNDO-1, FONT-1, IDENT-1, MODE-1, MODE-2 pass on the 15 featured systems) and its palette.

## NOT DONE — `road-precheck.mjs --stage release` is BLOCKED (not CLEAR)
Run: `node vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart/road-precheck.mjs --release <release dir> --tag tracy-morgan/emdash-0.x --stage release`. On `chain-7/release.3` (pack-7) it names:
1. **ABOUT-2** (template) — 25 demo text pieces nothing rewrites (`chrome/chrome.not_found_text`, the `title` of the 24 footer link entries). **Fixed in the repo after pack-7** (`ingest/build-personalize.mjs`, `seed/personalize.json`, D28); not in the release yet.
2. **PAGE-4 / PAGE-7** (template) — `src/lib/link-gate.ts` RECORDS still named the scaffold's pages. **Fixed in the repo after pack-7** (`blog`, `about-us`, `services`, `contact-us`); check that the nav and footer links still render as before (they now pass the gate).
3. **LANG-5 / PAGE-8 / LANG-1** — fixed by `languages: ["en"]` in `tracy_setting.json` (already in release.3).
4. **VARS-1** (template) — the release carries no `design-system-roles.json`: run `node packages/design/tracy-ds-slot/scripts/role-scan.mjs <pack> --check --platform emdash --template tracy-morgan --version 0.1.0` (it reports 12 required roles never read: success/warn/danger/info bg and text, plus 17 flagged colours; read them with fallbacks in `src/styles`, then `--write`), and put the file beside the release.
5. **TEXT-1** (worth fixing) — `src/styles/pages/contact.css:6 .mg-contact-icon { color: var(--ds-c-ink) }` → `--ds-c-heading`.
6. **TDSR unmeasured ×29** — the Add site preview is not measured: follow the commands printed by `scripts/template-design-system-readiness.mjs <release copy> --tag tracy-morgan/emdash-0.x` (Docker stand from the release zip and state, `flow.mjs`, `preview-check.mjs` light and dark), commit the file it writes in the contract folder.
After 1, 2, 4, 5: `node tools/generate-docs.mjs`, `node tools/artifact.mjs`, the language policy rows (`/home/agent/out/morgan/scripts/langpolicy.mjs`), then the chain from `docs` (a new pack, a new QA site, stage runs, readers, the ten receipts), the release from a fresh clean install, coverage last, the precheck.

## Known differences left on purpose (DECISIONS D20–D28)
End-of-article order (Next above the tags); article title band about 130 px taller than the source at 768; four sidebar tags where the source shows a fifth no post carries; blog pager five pages for 25 posts; home accordion toggles and the client-logo band are larger than the source's; the 404 sub-line wording. Two minor doc gaps of the last verifier (no command to pick the masthead id from the JSON list; the SMTP example omits the default host and port).

## Method notes
- Receipts name the coding agent as reviewer: no person has signed anything; the kit has no approval.
- `release.mjs` needs the `sqlite3` CLI: a Node shim (`shim/sqlite3`) outside the repo was used.
- Lens notes were written by the readers; when a reader wrote files with a script it was asked to retype them. A workflow of 14 readers was launched once without the owner's opt-in (noted by the lead).
- The `language-policy` PR check reads the policy from the base branch: the Morgan rows must reach `develop` first.

## Evidence (`/home/agent/out/morgan/`)
`qa/fg-40`, `qa/w-*` (final visual runs), `chain-7/` (chain, receipts `reviews-7/`, release `release.3`), `pack-7/`, `p7c7/`, `evid-7/`, `indep3/`, `kit4/` (kit work folder with `icon-classes.json`), `classes/` (class and looks work), `cov-final2*`, `setting/tracy_setting.json`, `scripts/` (reader briefs, shot and langpolicy helpers), `shim/sqlite3`.
