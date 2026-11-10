# Assigned non-WO issues: verification

The branch fixes #536, #307, #392 and #316 in PR #541. No WO source was edited; the WO client bundle was regenerated because it consumes the shared Button.

## Local results

- Full package build passed; committed client bundles match their sources.
- 64 non-test gates passed, including lint/typecheck, translations, bundle freshness and web/native boot graphs. The command explicitly skipped `turbo-config` and `tests`; this is not a complete `build:check` pass.
- MariaDB sync/push integration: 56 of 57 passed in the broad run. The remaining HPOS case lost the Docker daemon mid-query; its isolated rerun passed. Both logs are retained.
- Regression REG-PR-311 passed with the original eight targeted cases plus one-time fingerprint repair. The final version adds a taken-table counter assertion: preserve real counters 50/75 and allocate the next record at 75. A run with that assertion first failed on a transient Docker disconnect and subsequently passed. Both results are retained; the first run’s transcript was overwritten by the runner, so its observed Docker error is recorded separately.
- The original develop engine fails both high-ID swap cases with Duplicate entry / MERGE_FAILED. It also fails the new counter assertion with 2000000002 instead of 75. The fixed engine passes all three.
- Browser wizard suite: 11/11 passed. REG-PR-541 checks a failed PHP import with the real wizard and production CSS in Chromium, in both modes at 390/1440px. The status door is mocked; no real PHP source site is contacted by this harness.
- Browser contrast: 72 real shared Button states pass AA, minimum 4.50889:1 (default plus eight accents, light/dark, primary/destructive, rest/hover). The theme unit suite independently checks text/focus roles. Screenshots and raw colour measurements are retained.
- Latest develop merge: 27 passed and one existing TODO in the three affected web suites.

## Full-suite limitations

The full build check was attempted. Its Turbo test audit repeatedly timed out in the unchanged host test that loads an external Google Maps iframe, and in the site-publish file under its 120-second file cap. A direct rerun without that file cap completed site-publish; the external-iframe browser test still timed out at page.setContent. Its combined result was 60 passed, 1 failed. This PR must not claim full local gates are green.

## Acceptance on dev after deployment

Local fixture E2E does not replace acceptance against the deployed image. Keep this pending until the fleet/host and dsh images contain the PR commit:

- Record the deployed web/host image tags and dsh source commit. Run `node tests/e2e-dev/run.mjs --env dev --tier smoke --cms w,j` against that deployment and retain its report.
- On suite-owned Joomla and WordPress source/copy pairs, create one record and push/sync it; create two more with reversed live IDs; push/sync twice. Verify no MERGE_FAILED, low next IDs remain low, and record references agree.
- Repeat with an old high-ID mapping; verify subsequent sync and preview succeed. Delete a pushed parent on live and check its ID mapping, owned rows and WordPress _pingme/_encloseme metadata are gone. Verify repair also runs when live is unchanged.
- Reproduce a failed import (PHP below minimum) on an owned source. Inspect failed header, recovery spacing and retry in light/dark on mobile/desktop. The standard E2E runner declares import J2c uncovered, so it cannot substitute for this specific check.
- Inspect primary hover, destructive controls, focus strokes and chosen accent roles in the deployed dsh page in both modes.

No acceptance result against dev is recorded yet. The PR is draft because complete local gates and deployed acceptance are still outstanding.
