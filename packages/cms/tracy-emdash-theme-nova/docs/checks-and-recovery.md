# Acceptance, packaging and recovery

Read ../AGENTS.md. Regenerate the inventory after source changes with `node tools/generate-docs.mjs`; `--check` verifies completeness and freshness only. Regenerate `artifact.json` with `node tools/artifact.mjs` after documentation changes; the package ships it.

- Unit tests: `node --test tests/*.test.mjs` (some need Playwright's Chromium: `pnpm exec playwright install chromium`). Types: `pnpm typecheck`.
- Seed check: `node tools/validate-seed.mjs`; seed rebuild from the model: `ingest/rebuild-seed.sh`. Content API gate: `node tools/content-api-gate.mjs`.
- Acceptance: `node tools/qa.mjs --help` lists the run (contract `tools/qa-contract.mjs`, receipt `tools/qa-receipt.mjs`, visual `tools/visual-qa.mjs`, gates read with `node tools/gates.mjs <run>`). `qa.contract.json` ships with the package. The acceptance evidence of the port is kept outside it, in the owner's work folder.
- Audit of a running site (about a minute): `node tools/audit.mjs <base-url> <out-dir> --roots /`, for example `node tools/audit.mjs http://127.0.0.1:4361 ./audit-out --roots /`; it exits 1 on any finding and writes `audit.json` to the out folder.
- Admin round trip (opens the admin in a browser, edits one field, saves, publishes, checks the public page, restores the original and checks it is back; it leaves no residue). Use a throwaway site (`tools/clean-install.sh <dir> <port>`), never a customer's. Recipe, in this order:
  1. Start a mail catcher: `docker run -d --name mailpit -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025 axllent/mailpit`.
  2. Point the site's mail at it: `node tools/configure-smtp.mjs --site http://127.0.0.1:<port> --token-file data/tracy-agent.token`.
  3. Sign in: `node tools/admin-session.mjs --site http://127.0.0.1:<port> --email tracy-agent@tracy.ai --out state.json`.
  4. Find the target entry id: `curl -s -H "Authorization: Bearer $(cat data/tracy-agent.token)" -H "X-EmDash-Request: 1" http://127.0.0.1:<port>/_emdash/api/content/pages/about` and read `data.item.id`.
  5. Run `node tools/admin-roundtrip.mjs --site http://127.0.0.1:<port> --storage-state state.json --entry /_emdash/admin/content/pages/<id> --field field-title --public /about --out roundtrip.json`. Field ids are `field-<name>` (`field-title`, not `title`). The About page's title is a safe target; the tool restores the original value.
- Backup: `tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-nova-<stamp>.tgz` (SQLite, uploads, receipts, the agent token: keep it private). Restore: stop the site, then `tools/restore.sh <archive>`; it validates the archive and moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip. The encryption key (`EMDASH_ENCRYPTION_KEY`, an environment variable of the site that the local scripts do not create) must be kept with the data or plugin secrets are lost.
- Export source only by the allowlist (`node tools/distribution.mjs pack <contract> <new-directory>`, checked by `verify <artifact-directory>`); never customer databases, uploads, secrets, tokens, backups or `*.before-restore-*` directories.
- Known blockers and owner decisions are kept in the Tracy repository (`STATUS.md`, `DECISIONS.md`), not in this package; ask the owner for them.
