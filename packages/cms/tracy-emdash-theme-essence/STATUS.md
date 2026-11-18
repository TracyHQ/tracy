# STATUS — tracy-essence

**Phase reached: P0 and P1 done (checkpoint 2/11).** Session 1 (coordinator P0–P1). Evidence is under `/home/agent/out/essence/` (outside the repo).

| Item | State | Evidence |
|---|---|---|
| Runtime identity | package `@tracy/emdash-theme-essence` 0.1.0, id `tracy-essence`; kit via `new-template.sh`; pins from Diner; `pnpm install --frozen-lockfile` ok | `/home/agent/out/essence/logs/install.log` |
| Source stand | Joomla 6.1.1 + Essence 1.0.10 at `127.0.0.1:18081` (containers `essence-db`, `essence-web`, network `essence-net`, image `essence-snap-php:8.3`); sha256 of both staged files match `tracy_setting.json` | `/home/agent/out/essence/stand/` |
| `joomla-dump` + `from-joomla` | run, `--capture` included; `spec/site-model.json` 5 types, 79 records, 29 routes | `/home/agent/out/essence/{j6,spec}` |
| Crawl | 148 pages, 224 assets | `/home/agent/out/essence/snapshot`, `source/snapshot-SHA256SUMS` |
| `inventory.mjs` | 322 files, 145 html, 14 unresolved asset refs | `inventory/` |
| Source render | 80 renders (20 pages × 2 widths × 2 themes), 0 failed, 0 overflow, only the expected 404 resource error; dark theme verified by body colours | `/home/agent/out/essence/render/render-manifest.json` |
| P1 exit | done: `inventory/{source-inventory,assets,routes}.json`, `visual-contract.md`, `content-gaps.md` | `checkpoint.json` |

**Blockers:** none. **Not started:** P2 (content model, seed, docs), P3 and later.

Tools run from a copy of the WP skill: `/home/agent/out/essence/wp-skill` (`npm install` done there); `node wp-skill/scripts/ingest/joomla-dump.mjs --out j6 --container essence-db --web-container essence-web --db joomla --prefix jd_ --user root --password root --site-url http://127.0.0.1:18081 --capture` then `from-joomla.mjs j6 --out spec --site-url …`. Playwright's Chromium is installed in `~/.cache/ms-playwright`.

**Next commands** (from this folder), P2:
1. Copy and adapt Diner's `ingest/{shape-model,enrich-*,bind-paths,build-media-map,build-route-table,html-to-portable-text,normalize-seed-dates,build-inventory}.mjs` to this model (`ingest/rebuild-seed.sh` is the order); `cp /home/agent/out/essence/spec/site-model.json seed/`.
2. `node tools/compile-seed.mjs seed/site-model.json seed --config seed/compile.config.json`, then `node tools/validate-seed.mjs seed/seed.json`.
3. Start `AGENTS.md` + `docs/{content-model,content-rules,design-system}.md`; then `node tools/checkpoint.mjs complete checkpoint.json P2 …`.

Restart the stand after a reboot: `docker start essence-db essence-web`.

## Owner questions (batched)
- `[LEE]` Which of the five Home demos (`home-1`…`home-5`, four header/layout variants) are kept as presets (DECISIONS D8)?
- `[LEE]` Licence of the demo line-art illustrations and fonts for release (same vendor and library as Diner D12; Be Vietnam Pro is OFL).
