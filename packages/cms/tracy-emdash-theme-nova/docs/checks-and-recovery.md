# Acceptance, packaging and recovery

Read ../AGENTS.md. Regenerate the inventory after source changes with `node tools/generate-docs.mjs`; `--check` verifies completeness and freshness only. Regenerate `artifact.json` after documentation changes (none exists yet in this checkout).

- Unit tests: `node --test tests/*.test.mjs` (some need Playwright's Chromium: `pnpm exec playwright install chromium`). Types: `pnpm typecheck`.
- Seed check: `node tools/validate-seed.mjs`; seed rebuild from the model: `ingest/rebuild-seed.sh`. Content API gate: `node tools/content-api-gate.mjs`.
- Acceptance: `node tools/qa.mjs --help` lists the run (contract `tools/qa-contract.mjs`, receipt `tools/qa-receipt.mjs`, visual `tools/visual-qa.mjs`, gates read with `node tools/gates.mjs <run>`). No `qa.contract.json` or acceptance evidence exists in this checkout yet. Evidence for the port is kept outside the repository under the owner's work folder (DECISIONS D10).
- Audit and round trip on a running site: `node tools/audit.mjs`, `node tools/admin-session.mjs` then `node tools/admin-roundtrip.mjs`.
- Backup: `tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-nova-<stamp>.tgz` (SQLite, uploads, receipts, the agent token: keep it private). Restore: stop the site, then `tools/restore.sh <archive>`; it validates the archive and moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip. The encryption key (`EMDASH_ENCRYPTION_KEY`) must be recovered with the data or plugin secrets are lost.
- Export source only by the allowlist (`node tools/distribution.mjs pack <contract> <new-directory>`, checked by `verify <artifact-directory>`); never customer databases, uploads, secrets, tokens, backups or `*.before-restore-*` directories.
- Known blockers: `STATUS.md` and `DECISIONS.md` (owner decisions marked `[LEE]`) in the repository checkout.
