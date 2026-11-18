# STATUS — tracy-essence

**Phase reached: P0 done, P1 partly done.** Session 1 (coordinator P0–P1). Evidence is under `/home/agent/out/essence/` (outside the repo).

| Item | State | Evidence |
|---|---|---|
| Runtime identity | package `@tracy/emdash-theme-essence` 0.1.0, id `tracy-essence`; kit via `new-template.sh`; pins from Diner; `pnpm install --frozen-lockfile` ok | `/home/agent/out/essence/logs/install.log` |
| Source stand | Joomla 6.1.1 + Essence 1.0.10 at `127.0.0.1:18081` (containers `essence-db`, `essence-web`, network `essence-net`, image `essence-snap-php:8.3`); sha256 of both staged files match `tracy_setting.json` | `/home/agent/out/essence/stand/` |
| `joomla-dump` + `from-joomla` | run, `--capture` included; `spec/site-model.json` 5 types, 79 records, 29 routes | `/home/agent/out/essence/{j6,spec}` |
| Crawl | 148 pages, 224 assets | `/home/agent/out/essence/snapshot`, `source/snapshot-SHA256SUMS` |
| `inventory.mjs` | 322 files, 145 html, 14 unresolved asset refs | `inventory/` |
| P1 exit | NOT complete: no `routes.json`, `visual-contract.md`, render-manifest (`render-source.mjs`) | — |

**Blockers:** none. **Not started:** P2 (content model, seed, docs), P3 and later.

**Next commands** (from this folder):
1. `node ingest/…` — copy and adapt Diner's `ingest/{shape-model,enrich-*,bind-paths,build-media-map,build-route-table,html-to-portable-text,normalize-seed-dates,build-inventory}.mjs` to this model (`ingest/rebuild-seed.sh` is the order).
2. `node tools/render-source.mjs` against `127.0.0.1:18081` with `waitUntil: 'load'` (lesson E-052); read the render manifest, then write `inventory/{routes.json,visual-contract.md}`.
3. `node tools/checkpoint.mjs complete checkpoint.json P0 DECISIONS.md architecture.md STATUS.md`, then `P1` once step 2 is done.

Restart the stand after a reboot: `docker start essence-db essence-web`.

## Owner questions (batched)
- `[LEE]` Which of the five Home demos (`home-1`…`home-5`, four header/layout variants) are kept as presets (DECISIONS D8)?
- `[LEE]` Licence of the demo line-art illustrations and fonts for release (same vendor and library as Diner D12; Be Vietnam Pro is OFL).
