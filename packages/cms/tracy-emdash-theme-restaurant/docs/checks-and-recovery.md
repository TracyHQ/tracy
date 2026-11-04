# Acceptance, packaging and recovery

## Acceptance commands (package root)

In the package as shipped only `pnpm test` and the tools that need a running site (`audit.mjs`, `admin-session.mjs`, `admin-roundtrip.mjs`, `forms-check.mjs`, `recovery-check.mjs`) can run. The `qa-contract`, `visual-qa`, `fast-gate`, `qa` and `qa-receipt` commands below need `qa.contract.json` and `source/snapshot`, which are in the repository checkout only.

```bash
node tools/qa-contract.mjs …                       # contract validation (qa.contract.json, built by ingest/build-contract.mjs)
RENDER_CHROME_PATH=<chrome> node tools/visual-qa.mjs --contract qa.contract.json --site <origin> --source-site <origin of the source mirror> --out evidence/<run> --scope fast-gate|full --config template.config.json
node tools/fast-gate.mjs verdict evidence/<run> --contract qa.contract.json
node tools/qa.mjs --contract qa.contract.json --source source/snapshot --site <origin> --out <new dir> --browser --visual --visual-fast-gate evidence/<fast-gate run> --reviews evidence/reviews --config template.config.json
node tools/gates.mjs <qa run>                      # one line per gate
node tools/qa-receipt.mjs <forms|editability|recovery|security|build|…> --report <qa run>/report.json --out evidence/reviews …
node tools/generate-docs.mjs --check               # docs complete and fresh
```

Machine runs write their evidence under `evidence/<run>` and the signed receipts under `evidence/reviews`; both are local and not part of the package. The source mirror `source/snapshot` is not part of the package either; `source/REBUILD.md` says how to rebuild it from the pinned release.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-restaurant-<stamp>.tgz` (online SQLite backup, uploads,
receipts, token). `tools/restore.sh <archive> [data] [uploads]` — with the site stopped — validates the whole archive, then
moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip on a running
site (restart, backup, change, restore). Exclude `data/`, `uploads/`, tokens, backups and `*.before-restore-*` from any
source export (`tools/distribution.mjs` refuses them).

## Encryption key

Plugin secrets (SMTP passwords) are encrypted with `EMDASH_ENCRYPTION_KEY`. A restore needs the same key: keep it with the
backup in a separate private place. Without it the site works but the plugin secrets must be entered again.

## Known blockers and limits

Mail delivery was proven only to a sandbox mailbox. The 22-language questionnaire is Claude-translated. The dark theme has
no source to compare with. `source/REBUILD.md` was not executed end to end. Pages not ported: the visitor-account pages (login, registration, profile, reminder, reset), Typography, the Offline and Error demo pages, the four colour demos and group headings; they answer 404.

Read ../AGENTS.md. Regenerate inventory after source changes with
`node tools/generate-docs.mjs`. When validation is authorized, run
`node tools/generate-docs.mjs --check`; it checks completeness/freshness, not prose
accuracy or runtime behavior. Regenerate artifact.json after documentation updates.

Acceptance includes clean install, editor-safe import, real admin publication,
localized routing/SEO, visual comparison, interaction, forms and owned-site recovery.
Record skips honestly. Export source through an explicit allowlist; exclude customer
databases/uploads, secrets, tokens, backups and all *.before-restore-* directories.
Ship AGENTS.md/docs for agents, outside public routes. Independent handoff must use
these instructions rather than undocumented context from the author.
