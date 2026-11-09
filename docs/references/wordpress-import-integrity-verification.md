---
description: Local acceptance evidence and limits for the WordPress import integrity fixes.
sources:
  - packages/site/tracy-add-site/src/host/export.ts
  - packages/site/tracy-add-site/src/host/doors.mjs
  - packages/site/tracy-add-site/test/export-site-limits.test.mjs
  - packages/site/tracy-add-site/test/import-reply-integrity.test.mjs
---

# WordPress import integrity verification

Verified on 2026-11-09 using the authorized local WordPress source, PHP 8.3 and MariaDB.
No customer account or authenticated customer site was used.

## Accepted behavior

| Reproduced defect | Result with the candidate |
| --- | --- |
| Legacy cursor repeats, offsets stop advancing, or zero rows with done=false | Stops with a bounded cursor diagnostic before any storage PUT |
| Batched cursor repeats, goes backwards, or stops on the same error | Stops with a bounded cursor diagnostic; existing resumable error behavior is retained |
| String done flag, malformed/missing base64, truncated SQL, missing/empty table list | Refused before a database is stored |
| Database PUT answers 503 once or resets once | Retries the complete compressed object; second PUT succeeds |
| Database PUT answers 403 | Refused as store_refused |
| Engine redirects a POST to another origin with 307 | Refused; dummy-token receiver gets no request |
| PHP notice after complete JSON | Engine reply accepted; unrelated HTML and incomplete JSON remain refused |
| WordPress login form after engine calls | Recognized as a login form instead of a generic host block |
| Valid MySQL table name contains a backtick | Dump and restore succeed |
| Dependent and empty SQL views | Restored after base tables in dependency order |
| Keyless table loses a row between pages | Engine refuses the changed source instead of silently skipping another row |

The real HTTP proxy reran 23 cases against the candidate importer and the candidate engine installed
only in the local source. Four comparisons (ordinary keys; composite keys with binary, Unicode,
NULL, decimal, generated and invisible values; nullable/no keys; foreign keys) restored exactly.
The empty-view proxy case deliberately selected a view without its base table and therefore could
not restore that isolated object. The separate real MariaDB acceptance test includes dependencies:
empty and dependent views restore, and stay readable after the source schema is dropped.

## Reproducible checks

- `node --test packages/site/tracy-add-site/test/export-site-limits.test.mjs packages/site/tracy-add-site/test/import-reply-integrity.test.mjs`
- Add site firewall, WordPress login and import sign-in suites: passed after linking the existing local dependencies.
- Web beta-operation signal suite: 12 passed, 22 skipped because no test database was configured.
- Add site TypeScript check and focused oxlint: passed.
- Committed host bundle rebuilt and checked with `scripts/build-host.mjs --check`.
- Companion WordPress engine suite: 3438 passed, 0 failed; installable package built.
- Companion `tests/import-integrity.php`: real MariaDB restore in a second schema, source removed, copy verified.

## Limits

This is evidence for reproducible defects. Historical customer runs retained no detailed response,
so this does not establish which defect caused their failures.

The full local gate runner encountered inherited executable wrappers pointing at a missing temporary
dependency location and worktree boot/profile setup gaps. The run was stopped after these failures;
focused tooling was invoked directly from the installed packages. Full CI still needs to pass.

View preservation requires both the importer and the companion WordPress engine update. Copied views
use SQL SECURITY INVOKER without source account definers; external-database dependencies are refused.
Keyless-table checksums scan the table per page and detect changes without providing a database-wide
transaction snapshot. Legacy numeric-offset engines retain their concurrency limitation.

Test proxy schemas and fixtures were removed in finally blocks. The temporary PHP image and copied
engine test tree were removed; no shared Docker volume was pruned.
