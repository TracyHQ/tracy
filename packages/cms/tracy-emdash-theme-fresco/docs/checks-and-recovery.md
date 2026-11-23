# Acceptance, packaging and recovery

Read ../AGENTS.md. Regenerate the inventory after source changes with `node tools/generate-docs.mjs`; `--check` verifies completeness and freshness only. Regenerate `artifact.json` after documentation changes.

- Unit tests: `node --test tests/*.test.mjs` (some need Playwright's Chromium: `pnpm exec playwright install chromium`; some read repository-only files and skip in the package). Types: `pnpm typecheck`.
- Acceptance (repository checkout): `node tools/qa.mjs --contract qa.contract.json --source source/snapshot --site <origin> --out evidence/qa-1 --browser --visual --visual-fast-gate <fast-gate run>`; gates are read with `node tools/gates.mjs <run>`. Evidence stays outside the package.
- Audit and round trip on a running site: `node tools/audit.mjs`, `node tools/admin-session.mjs` then `node tools/admin-roundtrip.mjs`, `node tools/forms-check.mjs` (Mailpit on 127.0.0.1:8025 only).
- Backup: `tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-fresco-<stamp>.tgz` (SQLite, uploads, receipts, the agent token: keep it private). Restore: stop the site, then `tools/restore.sh <archive>`; it validates the archive and moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip. The encryption key (`EMDASH_ENCRYPTION_KEY`) must be recovered with the data or plugin secrets are lost.
- Export source only by the allowlist (`node tools/distribution.mjs pack`); never customer databases, uploads, secrets, tokens, backups or `*.before-restore-*` directories.
- Known blockers: see STATUS.md in the repository checkout.
