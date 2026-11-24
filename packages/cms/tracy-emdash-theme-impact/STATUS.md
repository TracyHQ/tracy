# STATUS — tracy-impact (JA Impact → EmDash)

Version 0.1.0, **not released**. Road `contract`. Branch `feat/emdash-port-impact`, commits local, nothing pushed.

## Runtime identity
Package `packages/cms/tracy-emdash-theme-impact`, id `tracy-impact`, EmDash 1.1.0, Astro 7.4.12 (pins copied from `tracy-emdash-theme-fresco`). Source stand: see `source/REBUILD.md` (docker `im-web` + `im-db`, `127.0.0.1:18090`, image `impact-php:8.3`). Evidence and work files: `/home/agent/out/impact/` (outside the repo).

## Phases and gates
- P0: DECISIONS.md written (D1–D13), scaffold from the kit (`scripts/new-template.sh`), stack copied from Fresco.
- P1: stand up, model dumped (`joomla-dump --capture`, `from-joomla`), crawl `source/snapshot` (90 pages, 215 assets, git-ignored), `inventory/` written.
- P2: `ingest/shape-model.mjs` + `ingest/rebuild-seed.sh` → `seed/seed.json` valid (13 collections, 62 entries, 83 images).

## Next command
See the last section.
