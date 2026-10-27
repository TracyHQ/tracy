# Acceptance, packaging and recovery

Read ../AGENTS.md. Run checks only within the operator's authorized scope. Record
source revision/artifact, runtime version, origin, process ownership and evidence
for each acceptance run. Do not label old evidence as a fresh pass.

## Acceptance gates

- Fresh standalone installation from distributable source and pinned lockfile.
- Published CMS edits visible publicly, with drafts preserved and change reverted.
- Seed rerun/resume, media hash reuse and explicit conflict handling.
- Per-locale navigation, translation links, canonical/hreflang, pagination, search
  noindex and unknown URLs returning 404 rather than a fallback redirect.
- Visual comparison plus interaction across desktop/mobile and light/dark; verify
  focus, keyboard dismissal, theme persistence and console/resource failures.
- Real form submission stored once, validation enforced and notification delivered
  to the intended test mailbox. Production SMTP is a separate acceptance step.
- Backup/restore on a separate owned destination; real admin authentication and
  development bypass unavailable in the built deployment.

Use the package's tools/tests and README for commands. An incomplete crawl must
fail, not report zero findings. Independent acceptance must document what was not
exercised, including any admin UI or locale gaps.

## Distribution boundary

Prefer an explicit source allowlist: application source/configuration, lockfile,
approved seed/assets, runbook, provenance, AGENTS.md, docs, tools and tests.
Exclude runtime data/uploads, .env and secrets, tokens, logs, evidence, node_modules,
generated local build state and all backup or before-restore directories. Approved
seed media are different from a customer's uploads.

Packaging is done by `tools/distribution.mjs pack qa.contract.json <new-dir>` from the
allowlist in the acceptance contract; it refuses runtime state, secrets, backups and
`*.before-restore-*` copies, and `clean-install.sh` excludes them too (both covered by
the kit tests). Verify a received artifact with `node tools/distribution.mjs verify .`
before installing it.

After changing seed or package inputs, regenerate artifact.json through the
documented artifact generator before release so its hashes match the release.
Documentation is not proof that a generated artifact has been refreshed.

## Backup and restore

Backups contain confidential site state, potentially including tokens and receipts.
Store them outside distributable source with restricted access. Preserve the
encryption key through a separate secure recovery channel; a database archive
alone does not establish recovery of encrypted plugin settings.

Coordinate quiescence for a consistent database/media restore, confirm the exact
target and preserve the current site before replacement. Restore only into an
owned destination and follow tools/restore.sh guards. before-restore copies are
recovery material, not template assets. Never delete them to make a package appear
clean; exclude them from export and remove only with explicit retention approval.
