# Acceptance, packaging and recovery

Read ../AGENTS.md. Regenerate inventory after source changes with
`node tools/generate-docs.mjs`. When validation is authorized, run
`node tools/generate-docs.mjs --check`; it checks completeness/freshness, not prose
accuracy or runtime behavior. Regenerate artifact.json after documentation updates.

## Commands

| Check | Command |
| --- | --- |
| Kit regression tests (mock EmDash, no live site) | `node --test tests/*.test.mjs` |
| Source model gate | `node contract/validate.mjs seed/site-model.json` |
| Seed validity | `node tools/validate-seed.mjs seed/seed.json` |
| Seed rebuild from the model | `node tools/compile-seed.mjs seed/site-model.json seed --config seed/compile.config.json && node ingest/finish-seed.mjs --seed seed --model seed/site-model.json --images <quickstart>/images` |
| Import state of a running site | `node tools/seed-apply.mjs status --site <origin>` |
| Routing/SEO audit | `node tools/audit.mjs <origin> <new-dir> --config template.config.json` |
| Acceptance matrix | `node tools/qa.mjs --contract qa.contract.json --source <source-copy> --site <origin> --out <new-dir> --browser` |
| Fast Gate, then visual review | `node tools/fast-gate.mjs plan --contract qa.contract.json` → `node tools/visual-qa.mjs … --scope fast-gate` → `fast-gate.mjs verdict` → `--scope full` |
| Editability | `node tools/admin-session.mjs …` → `node tools/admin-roundtrip.mjs …` |
| Recovery | `node tools/recovery-check.mjs …` from the site directory |
| Package | `node tools/distribution.mjs pack qa.contract.json <new-dir>` then `verify <dir>` |
| Clean install from the package | `cd <package-dir> && tools/clean-install.sh <empty-dir> <port>` |

Every run writes into a new directory under `evidence/` (gitignored); receipts for review gates are
written with `tools/qa-receipt.mjs` next to the evidence they cite.

## Backup and restore

- `tools/backup.sh [data] [uploads] [out]` — SQLite online backup, uploads, seed receipts and token into
  `<template-id>-<stamp>.tgz`.
- `tools/restore.sh <tgz> [data] [uploads]` — stop the site first. It reads the whole archive and opens
  the database before moving the current state aside as `*.before-restore-<stamp>`; nothing is deleted.
- Keep `EMDASH_ENCRYPTION_KEY` with the backups: restored plugin secrets (SMTP credentials) are unreadable
  without the key that encrypted them.

## Export rules

Export source through `distribution.include` of `qa.contract.json`; never customer databases, uploads,
secrets, tokens, backups or `*.before-restore-*` directories. `AGENTS.md` and `docs/` ship with the source,
outside public routes.

## Known blockers

- Release: licence of the port and of the quickstart images is undecided (content-rules.md).
- Acceptance gates are recorded per run in the evidence directory; a gate without evidence is pending,
  never passed.
