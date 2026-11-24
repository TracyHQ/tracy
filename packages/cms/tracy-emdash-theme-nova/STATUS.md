# STATUS — tracy-nova

**Phase reached: P1 done (source stand, model, snapshot, source render, inventory). P2 not started.** Nothing is published; no PR.

| Gate | Result | Evidence |
|---|---|---|
| P0 `architecture.md`, `DECISIONS.md` (D1–D10) | done | this folder |
| Source pins | `SHA256SUMS` of `j6/` all OK (webroot, database, manifest, setting, site pages, roles, verification); `wp7/SHA256SUMS` names `wp-ja-nova-1.1.17.zip`, which is not staged (reference only, D5) | `/home/agent/src/nova/` |
| P1 stand | Joomla 6.1.1 + MariaDB in Docker, `127.0.0.1:18082`, Home 200 | `source/REBUILD.md` |
| P1 model | `joomla-dump.mjs --capture` + `from-joomla.mjs`: 92 records, 12 types, 73 routes, 6 menus, 56 media → `seed/site-model.json` (spec-pack reported INVALID only for pending design decisions and browser font evidence: not used by this road) | `/home/agent/out/nova/work/` |
| P1 snapshot | 114 pages, 225 assets; 329 hashes in `source/snapshot-SHA256SUMS`; 16 unresolved refs are admin-widget/watermark images (`inventory/content-gaps.md`) | `/home/agent/out/nova/snapshot` |
| P1 source render | 68 renders (17 pages × 1440/390 × light/dark), 0 failed, 0 overflow, Golos Text loads | `/home/agent/out/nova/render/render-manifest.json` |
| Install | `pnpm install --frozen-lockfile` clean (lockfile and workspace overrides from Fresco) | — |

**Next command (P2):** `node scripts/lessons.mjs scan packages/cms/tracy-emdash-theme-nova --phase P2` (from the skill folder), then settle collections from the Home sections (`visual-contract.md`), add `ingest/enrich-nova.mjs` for the project fields (`prj-*`, see `content-gaps.md`), write `seed/compile.config.json`, run `ingest/rebuild-seed.sh`-style chain (copy Essence's), `tools/validate-seed.mjs`.

**Tools state:** stand containers `nova-db`, `nova-web` and network `nova-net` were removed at the end of the session; rebuild per `source/REBUILD.md` (the build folder `/home/agent/out/nova/stand` keeps the webroot and Dockerfile). Chromium for Playwright is installed in `~/.cache/ms-playwright`.

**Owner questions (batched):** none yet. Open: D8 (utility pages not ported) is a default.

**Not started:** P2 to P8 — content model, runtime, every page family, Fast Gate, four-tier visual QA, kit, personalization rules, repo wiring (Road rows, `plan-ci.mjs`, `language-policy.json`, `public-tree.json`, `docs/licensing.md`), journal entry, release chain, pre-check.
