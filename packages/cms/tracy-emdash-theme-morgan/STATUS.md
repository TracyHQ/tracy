# STATUS — tracy-morgan (JA Morgan → EmDash)

Version 0.1.0 (unreleased). Session 1 of the port.

## Phase
P0–P3 built; P4.5 (personalization) written; Fast Gate: the machine pass is clean on all four tiers (run `fg-8`), the lens notes and the verdict are not done yet. Next: lens readers on `fg-8`, `fast-gate.mjs verdict`, then P5 (the families not yet in the Fast Gate), P7, P8.

## Runtime identity
- Package `packages/cms/tracy-emdash-theme-morgan`, template `tracy-morgan` 0.1.0, EmDash 1.1.0 / Astro 7.4.12 pins and lockfile copied from the released sibling `tracy-emdash-theme-fresco`.
- Evidence (outside the repo, `/home/agent/out/morgan/`): Joomla stand `morgan-db` + `morgan-web` (network `morgan-net`, `127.0.0.1:18080`, image `morgan-php:8.3`), static mirror of `source/snapshot` on `127.0.0.1:18090`, dump `j6dump/`, spec `spec/`, shots `shots*/`, QA runs `qa/`, clean installs `site-*` (the current one on `127.0.0.1:4360`), scripts `scripts/` (`redeploy.sh`, `fg.sh`).

## Gates (evidence paths under /home/agent/out/morgan/)
- Seed valid: `node tools/validate-seed.mjs seed/seed.json` → valid (rebuild: `SRC_WORK=/home/agent/out/morgan/work bash ingest/rebuild-seed.sh`, then `node ingest/build-personalize.mjs`).
- Kit tests `node --test tests/*.test.mjs`: 521 run, the 6 template-specific failures fixed (`tests/composition`, `set-html-safe`, `logo-spots`, `content-api-gate`); `tests/road-precheck.test.mjs` (the Fresco lessons: LANG-2 derivation, PAGE-5, PAGE-8, DEF-1, IDENT-2, MODE-2) 11/11.
- `qa-contract.mjs qa.contract.json --source source/snapshot` → pass, 54 cases.
- Visual QA, scope fast-gate, run `qa/fg-8`: status=pass, 7 pages, 42 axes, 0 findings, all four tiers (light-desktop, light-responsive, dark-desktop, dark-responsive).

## Not done yet
Lens notes for the Fast Gate tiles and its verdict; P5 families (the full page list is in the contract); admin round trip, recovery, forms check, mail; the full visual tiers twice; the Opus layout lens at P7; ten review receipts; `release-chain.mjs`; kit and content coverage; Road to live pre-check; repo wiring (Road rows, Dockerfile copies, `plan-ci.mjs`, `language-policy.json`, `public-tree.json`); journal file `changes/`; docs (`AGENTS.md`, `docs/`, README).

## Blockers
none. Owner questions are listed in `DECISIONS.md` as `[LEE]` (D6 Home choice, D8 font licence).

## Next command
`node tools/fast-gate.mjs verdict /home/agent/out/morgan/qa/fg-8 --contract qa.contract.json` after the lens notes (see `references/qa-lenses.md` §6).
