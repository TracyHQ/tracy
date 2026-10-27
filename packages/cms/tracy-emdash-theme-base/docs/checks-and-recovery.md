# Acceptance, packaging and recovery

Read ../AGENTS.md first.

## Acceptance gates

| Gate | Tool | Evidence |
|---|---|---|
| Screens, overflow, console, images, theme | `node tools/shoot.mjs <origin> <out> --paths … --viewports 1440,390 --themes light,dark --config template.config.json` | JPEGs + exit code |
| Routing policy (canonical, hreflang, noindex, 404) | `node tools/audit.mjs <origin> <out> --config template.config.json` | `audit.json`, exit 1 on any finding or incomplete crawl |
| Editability through the admin UI | `tools/admin-session.mjs` → `tools/admin-roundtrip.mjs` | report JSON |
| Recovery | `node tools/recovery-check.mjs …` (from the site directory) | report JSON |
| Author-only contract (requires separately supplied matching contract and design source; pages × variants × states, content vs source, design rules, visual stages) | `node tools/qa.mjs --contract qa.contract.json --source <source-dir> --site <origin> --out evidence/qa-<n> --browser [--visual --source-site <origin of the source>]` | `report.json`, `REPORT.md` |
| Kit regressions | `node --test tests/*.test.mjs` | ~9 minutes, mock EmDash API |

A run's `--out` directory must be new; receipts for human/agent gates are written with
`tools/qa-receipt.mjs` and verified by `tools/qa.mjs --reviews`. `pending` and `blocked` never
count as pass.

## Distribution boundary

`node tools/distribution.mjs pack qa.contract.json <new-dir>` copies only the allowlist
(`distribution.include`) and refuses `data/`, `uploads/`, `.env*`, `*.token`, `node_modules/`,
`backups/`, `evidence/`; `distribution.json` hashes every file and `distribution.mjs verify <dir>`
catches a changed, added or missing byte. `tools/artifact.mjs` writes `artifact.json` (template id,
version, pins, locales, entrypoints, checksums) for the Tracy build pipeline. `qa.contract.json`
itself is not part of the package.

## Backup and restore

- `tools/backup.sh` — online SQLite backup + `uploads/` + receipts into `backups/<id>.tgz`.
- `tools/restore.sh <archive>` — reads the whole archive first, then moves the current
  `data/`/`uploads/` aside as `*.before-restore-<time>` and restores; refuses a destination path
  shallower than three components.
- `tools/recovery-check.mjs` proves both on a running site you own: a published edit survives a
  restart; backup → overwrite → restore brings it back. Run it from the site directory; it stops
  and restarts that site.

Never ship `backups/` or `*.before-restore-*` directories.

## Checks available to package recipients

The package is self-contained for installation, building, distribution verification, crawl audits,
screenshots, admin editing and recovery. Run `node tools/distribution.mjs verify <package-dir>`,
then follow `docs/install.md` and the applicable tools above. Full source parity uses the author
contract and original design source, which are deliberately outside the distribution. Request those
matching inputs to reproduce that check; unavailable inputs must be reported as unavailable, never
as a passing contract run.
