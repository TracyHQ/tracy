# STATUS — tracy-essence

**Phase reached: P2 done (checkpoint 3/11); next P3.** Sessions 1–2 (coordinator P0–P2). Evidence is under `/home/agent/out/essence/` (outside the repo).

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

| P2 | `seed/seed.json` valid (8 collections, 76 entries, 2 menus, 2 taxonomies: 51 posts, 9 authors, 8 category pages, 6 tags; 97 images, 330 targets); `ingest/enrich-essence.mjs` + `rebuild-seed.sh`; `docs/{content-model,content-rules}.md`, `seed/plugin-matrix.md`, `seed/field-map.json` | `node tools/validate-seed.mjs seed/seed.json` → valid, 0 errors |
| Owner answers (session 2) | Home: one at `/` (D8); D10 kept 51 posts, `[LEE]` closed; licence GPL-2.0-or-later (D13); fonts local (D14: Jost has no Vietnamese, Noto Serif has; Be Vietnam Pro behind `:lang(vi)`, `[LEE]` confirm) | `DECISIONS.md` |
| Licence files | `package.json`, `LICENSE`, `PROVENANCE.md`, `docs/licensing.md` table + grant list, `THIRD_PARTY_NOTICES.md`, `src/fonts/OFL.txt` | — |

**Next commands** (from this folder), P3: runtime + a Home slice + one article, then the Fast Gate.
1. Rebuild the seed any time: `SRC_WORK=/home/agent/out/essence ingest/rebuild-seed.sh` (`webroot` there is a symlink to the extracted release).
2. Write `src/fonts.json` (local variants, D14), `src/styles/global.css` (tokens from `inventory/visual-contract.md` and the product `design-system.md`), `src/layouts/Base.astro`, `src/components/site/{Header,Footer,...}`, `src/views/{Home,Post,Category,Authors,Contact,Search}.astro`, `src/pages/{[...path],404}.astro` — model on `../tracy-emdash-theme-diner/src` (grep before writing new).
3. `tools/bootstrap-site.sh`, `node tools/qa-contract.mjs init`, `fast-gate.mjs` on Home + a post (+ /404).
4. Release wiring, at P8: `turbo.json` inputs (root, `apps/tracy-web`, `packages/cms/tracy-quickstart-tools`, `packages/site/tracy-site-build-emdash`), `docs/README.md` (`pnpm docs:index`), `docs/references/vocabulary.md` list, `apps/tracy-web/test/emdash-*.test.mjs` template lists.

The stand containers were removed at the end of session 1; rebuild with `source/REBUILD.md` (the extracted, configured webroot is kept at `/home/agent/out/essence/stand/webroot`; the dump import is the only slow step). The crawl, render and `spec/`/`j6/` outputs stay on disk, so P2 needs no stand until a re-render.

## Owner questions (batched)
- `[LEE]` Which of the five Home demos (`home-1`…`home-5`, four header/layout variants) are kept as presets (DECISIONS D8)?
- `[LEE]` Licence of the demo line-art illustrations and fonts for release (same vendor and library as Diner D12; Be Vietnam Pro is OFL).
