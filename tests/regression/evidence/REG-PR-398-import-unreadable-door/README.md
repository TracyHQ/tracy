# Import permissions and unexpected API pages

This continues Tracy PR #398 on `fix/import-unreadable-door`, including the previous session's unfinished tests. The companion engine change is https://github.com/TracyHQ/claude-cowork/pull/277 (`fix/pack-skips-unreadable`).

## Verified behavior

- The import exporter names an older engine's permission refusal. Newer engines can report omitted paths. Warnings survive later multipart responses and a resumed upload.
- The import lifecycle distinguishes an HTML reply after an engine answer from a missing installation. Both Joomla door reply kinds are recorded and sent in the operator alert using closed-set values. Raw HTML and arbitrary engine messages are not included in the signal.
- An incremental sync retains the previous manifest entries of unreadable files. The real MariaDB sync fixture confirms that a whole read keeps omitted files, while a later actual deletion still removes them.
- An incomplete or malformed omission list refuses sync instead of authorizing deletion of unnamed paths.
- All eight interface languages include the new messages, with the repository's preserved vocabulary.

## Evidence from 2026-11-06

- Final official runner on `f737503eb4`: `REG-PR-398-import-unreadable-door` passed with 196 tests and 22 database-gated skips; `REG-PR-398-sync-unreadable` passed with 3 tests and zero skips. Results are committed in `tests/regression/results/2026-11-06-f737503eb.jsonl`.
- `REG-PR-398-sync-unreadable`: HTTP fixtures plus a real temporary MariaDB instance. All three required cases pass; the whole-read scenario takes approximately one minute on this machine.
- Browser preflight suite: 7 passed. Added permission UI scenario: passed separately in Chrome, serving the real components and compiled plugin CSS at local port 63105, PID 75496. `permission-ui.png` captures the progress omission and the older-engine recovery message. This is an isolated fixture, not a production import or a full dsh workspace.
- `pnpm build:check --skip turbo-config --skip tests`: all structural gates other than the initially unformatted files and two vocabulary checks passed. After formatting and correcting preserved terms, `lint`, `dsh-locale`, `kept-terms`, `interface-languages`, and `bundles` all pass. Both boot graphs passed (web 58 entries, native 75).
- A full `pnpm build:check` was attempted. Its `turbo-config` stage runs all 51 task traces; the existing host suite failed after 152 seconds. That broad trace was stopped and the remaining gates run separately. A full `live-sync-flow` suite also hit its 300-second file timeout; its selected unreadable-path scenario passes. These are not claimed as full-suite success.
- Engine permission fixtures, Docker user 1000:1000, PHP 7.4 and 8.3: 9 checks per CMS per PHP version, 36 checks total. Each fixture sets mode 0000, inspects a real tar, and verifies that a resumed unreadable entry refuses instead of substituting zero bytes.
- Engine Joomla and WordPress packages build locally. GitHub CI on companion commit `b333725e` passed Joomla, WordPress, PHP 7.4, PHP 5.6 entry checks, theme builds and CodeQL. These are development builds using the current manifests, not published releases.
- Pinned public-tree scan on baseline `aae87b14c3` and source commit `f737503eb4`: both report the same 52 blocking findings (9 secret detections, 34 emails, 8 phones, 1 submodule). Comparing all unallowed finding records found zero additions and zero removals. The scan is still failing; no allowlist changes were made. Matched values and raw scan reports are not committed.

## Release boundary and remaining evidence

No production service or customer site was changed. The engine fix still needs a versioned release and the Tracy changes need image builds and deployment. The actual response received by the second customer site during the historical failure was not retained; its original cause cannot be established from that report. The new diagnostics cover recurrence and prevent the misleading installation advice after an engine proof.

## Post-install readiness follow-up

A fixture of the real Joomla installer reproduced delayed routing after installation: two rounds
returned a front-end 404 and an administrator login form before the engine became ready. All three
initial readiness scenarios failed before the patch: the translated-result path installed twice,
the English-success path failed its proof, and a persistent login page stopped after only one round.
The patched scenarios pass. Both installer result languages now complete after one upload when
routing recovers. Persistent login pages stop after three rounds; engine authorization refusals,
recognized firewall challenges and PHP parse errors do not enter the readiness wait. API requests
continue using the engine token without adding the administrator cookie.

This reproduces a product failure mode, not the historical customer's exact hosting state. No
customer site was changed or reimported during this follow-up.

Final follow-up verification on `27c6fa6f90`: the official import regression passed with 205 tests
and 22 database-gated skips; the sync regression passed with 3 tests and zero skips. The separate
install/API/language run passed 103 tests and the pacing run passed 20. The package was rebuilt.
`pnpm exec tsx scripts/check-all.ts --skip turbo-config --skip tests` passed all 63 selected gates,
including lint, all 14 typecheck projects, committed bundles and both web/native boot graphs. The
two explicitly skipped broad gates are not claimed as passing. Results are committed in
`tests/regression/results/2026-11-06-27c6fa6f9.jsonl`.

## English contribution policy and generated locale data

The trusted policy rejected new localized strings in generated JavaScript, while accepting their
source JSON dictionaries. Both locale builders now use one shared serializer that emits escaped
string literals. JSON sources remain UTF-8 and runtime values are unchanged. Executing both
committed bundles and comparing every registration against source verifies all 233 dictionaries,
including the language labels and fallbacks. The new regression case is
`REG-PR-398-import-locale-bundles`.

The original branch history was preserved locally at `refs/backup/pr-398-before-ci`, then
consolidated onto the current develop base because the policy inspects every new commit. The
policy and its exceptions were not changed. Prior result files describe the earlier branch state;
the latest three official regression results are recorded on consolidated source commit `2bf48aa33b`.
