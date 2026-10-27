# Execution contract and resume

**Design contract:** read `design-contract.md`. A valid `design-contract.json` is required at Phase 2.
Authors use its pinned roles/tokens; pass the pilot matrix before repetition and the complete
page/viewport/theme matrix before acceptance. Keep the contract hash with all observations.


After intake, choose the requested output. Keep this choice in `page-map.json.scope`:

```json
{"mode":"website","reason":"Customer requested one landing page","pages":["index.html"]}
```

- `website`: adapt the selected quickstart to the requested pages. Preserve working template,
  styles, extensions and data relationships. Phases 9/10 run only if packaging was requested.
- `template`: distribution build; the full standard-view coverage and packaging requirements apply.
  Existing packs without scope retain this mode. The validator's 12-page minimum is a coverage
  floor for this mode only, not a reason to invent pages for a small customer site.
- `edit`: identify the existing target, map changed pages and regression pages, then execute only
  affected build steps. Use only the affected build phases between identity/spec and verification. Verify affected pages in both modes and representative shared chrome.

The scope pages must match the page map exactly; reference and palette checks apply in every mode.
Record expected HTTP statuses: a genuine missing URL should return 404, not 200; offline may be 503.

## One environment probe

Run `bash <skill>/scripts/preflight.sh --root <authorized-joomla-root>` from the SAME execution
surface that will run build commands. It only reads local capabilities. If even this path is
unavailable, report the resource-mount mismatch once and continue source/intake work; searching the
whole filesystem repeatedly cannot cross a container boundary. Missing DDEV does not prove a
missing database. A WordPress workspace is not the Joomla target for a standalone build.

The report separates analysis, ingest, compile, render and installed-site prerequisites. A local
binary is not proof of a healthy service; verify URLs/database access at the phase that uses them.
For the bundled scripts, run `npm ci` in the skill directory. Sass is locked there; compile does
not fetch a changing version during a build. A browser tool may replace local Playwright when
available; follow that environment's browser instructions.

## Checkpoints

```bash
node <skill>/scripts/checkpoint.mjs init <work>/build-state.json website <source> <target>
node <skill>/scripts/checkpoint.mjs complete <work>/build-state.json intake <work>/intake.json
node <skill>/scripts/checkpoint.mjs status <work>/build-state.json
```

`init` accepts an optional final comma-separated phase list. The edit default is
`intake,1,2,6,8,8b` for a CSS change; add 3/4/5/6b/7 when chrome/layout/overrides/images/data change.
A website can append 9/10 when packaging was requested. Distribution mode retains every phase.
The tool validates phase order and keeps intake, identity, spec and verification mandatory.

`complete` accepts one phase plus one or more evidence files and hashes them; earlier phases must
be verified first. Include input manifests, configuration and generated outputs, not just a claim
of success. Keep evidence under the work directory, without credentials. Changed/missing evidence
invalidates that phase and everything after it. Re-completing an earlier phase clears later marks.
A skill version change requires a new checkpoint. Before resuming, recheck the live target and
refresh database/version evidence: hashes do not observe changes made elsewhere in a running site.
A checkpoint records evidence; it does not itself establish visual parity or authorization.

## Verification configuration

Save the hook observed during target identification in `<work>/review-config.json`:

```json
{
  "hook":{"type":"attribute","name":"data-bs-theme"},
  "toggle":".t4-theme-toggle",
  "persistence":{"type":"cookie","key":"t4-theme"},
  "expectedSelectors":["main", "header"],
  "expectedStatus":200
}
```

Hook type is `class` (for `t4-dark`) or `attribute`. Persistence is `cookie` or `localStorage`.
Use selectors identifying the intended page, not generic elements that also match a login/error
page. Run each scanner with `--config <file>` or `T4_REVIEW_CONFIG=<file>`; the same configuration
is shared by all scanners. Use a per-page config for expected status/identity where needed.
Scanners print a JSON summary with final URL, examined count and findings. Exit 0 = pass,
1 = failed execution/coverage/behavior, 3 = findings need review or configuration is unverified.
Heuristic findings require investigation; intentional differences are not automatically bugs.
`toggle-test.mjs` clicks the real control and checks persistence/reload rather than forcing a hook.
Other scanners force only the configured hook to measure palette coverage, not toggle behavior.

`verify-render.mjs A.json B.json --required measurements.json` compares snapshots. The optional
requirements file maps selectors to required properties, e.g. `{"main":["color","fontSize"]}`.
Empty/malformed snapshots fail; alpha is compared separately from RGB tolerance. This script
checks supplied measurements, not screenshots, and does not prove geometry or complete page parity.

## Content evidence

Phase 2 evidence includes `content-contract.json` and its validation result. Phase 7 includes
`content-plan.json`, resolved fields and the actual CMS field mapping. Phase 8b includes observed
content and the semantic review findings (`content-contract.md`). Changing the contract invalidates
copy/render evidence for affected consumers; keep all authors on the same hash. For content edits,
include Phase 7 in the checkpoint list even when template code stays unchanged.
