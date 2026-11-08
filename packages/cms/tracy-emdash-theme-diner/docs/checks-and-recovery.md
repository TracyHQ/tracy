# Acceptance, packaging and recovery

## Acceptance commands (package root)

In the package as shipped only `pnpm test` (`node --test tests/*.test.mjs`) and the tools that need a running site
(`audit.mjs`, `admin-session.mjs`, `admin-roundtrip.mjs`, `forms-check.mjs`, `recovery-check.mjs`) can run. The
`qa-contract`, `visual-qa`, `fast-gate` and `qa` commands need `qa.contract.json` and `source/snapshot`, which are in the
repository checkout only.

```bash
node tools/qa.mjs --help                           # the acceptance run and its options
node tools/qa-contract.mjs ...                     # contract validation (qa.contract.json, built by ingest/build-contract.mjs)
node tools/visual-qa.mjs --contract qa.contract.json --site <origin> --source-site <origin of the source mirror> --out evidence/<run> --scope fast-gate|full --config template.config.json
node tools/fast-gate.mjs verdict evidence/<run> --contract qa.contract.json
node tools/qa.mjs --contract qa.contract.json --source source/snapshot --site <origin> --out <new dir> --browser --visual --visual-fast-gate evidence/<fast-gate run> --config template.config.json
node tools/gates.mjs <qa run>                      # one line per gate
node tools/qa-receipt.mjs <forms|editability|recovery|security|build|...> --report <qa run>/report.json --out evidence/reviews ...
node tools/generate-docs.mjs --check               # docs complete and fresh
```

## Evidence

Machine runs write under `evidence/<run>`; the folder is git-ignored and not part of the package. The acceptance
evidence of the port (contracts, browser matrix of 34 pages x 6 variants + the menu state, routing, visual scope `full`,
the Fast Gate, and the supporting evidence of the review receipts) lives in the repository checkout, not in a packed
artifact. A packed artifact is verified with `node tools/distribution.mjs verify <package dir>` (exit 0, `status pass`).

Commands a recipient can run on a built site (`<origin>` is where your site listens, e.g. `http://127.0.0.1:4361`):

```bash
node tools/audit.mjs <origin> <new out dir> --config template.config.json     # routes, SEO, 404s, assets
node tools/admin-session.mjs --site <origin> --email tracy-agent@tracy.ai --out admin-state.json
# list an entry id: curl -s <origin>/_emdash/api/content/posts -H "Authorization: Bearer $(cat data/tracy-agent.token)"
node tools/admin-roundtrip.mjs --site <origin> --storage-state admin-state.json \
  --entry /_emdash/admin/content/posts/<entry id> --field field-title --public <the post's public path> --out roundtrip.json
bash tools/backup.sh      # from the site folder: defaults ./data and ./uploads, writes backups/tracy-diner-<stamp>.tgz
```

## Forms and mail

`tools/forms-check.mjs` submits `contact-en` and `subscribe-en` against a running site and checks that the notification
mail lands in Mailpit (`127.0.0.1:8025`, sandbox mailbox from `docker run -p 127.0.0.1:1025:1025 -p 127.0.0.1:8025:8025
axllent/mailpit`; point the site at it with `tools/configure-smtp.mjs`). It needs the storage state from
`tools/admin-session.mjs`.

## Backup and restore

`tools/backup.sh [data] [uploads] [out]` writes `backups/tracy-diner-<stamp>.tgz` (online SQLite backup, uploads,
receipts, token). `tools/restore.sh <archive> [data] [uploads]` — with the site stopped — validates the whole archive,
then moves the current state aside as `*.before-restore-<stamp>`. `tools/recovery-check.mjs` proves the round trip on a
running site you own (restart, backup, change, restore):

```bash
node tools/recovery-check.mjs --site <origin> --token-file data/tracy-agent.token --collection <c> --slug <s> --field <text field> --public <path> --out <report.json>
```

It stops and restarts the site from `dist/`. Exclude `data/`, `uploads/`, tokens, backups and `*.before-restore-*` from
any source export (`tools/distribution.mjs` refuses them).

## Encryption key

Plugin secrets (SMTP passwords) are encrypted with `EMDASH_ENCRYPTION_KEY`. A restore needs the same key: keep it with
the backup in a separate private place. Without it the site works but the plugin secrets must be entered again.

## Known blockers and limits

Mail delivery was proven only to a sandbox mailbox. The 22-language questionnaire is Claude-translated. The dark theme
has no source to compare with. Pages not ported answer 404 (`DECISIONS.md` D6, D13, D14). The search page shows a
results state where the source shows its empty state. In the source capture the newsletter heading is unreadable; the
port does not copy that (D-P7-4).
