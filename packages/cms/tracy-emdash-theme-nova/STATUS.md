# STATUS — tracy-nova

**Phase reached: P7 in progress. Built and compared (P3–P5), personalization (P4.5), docs (P2/P8 docs), acceptance contract, `qa.mjs --browser` passing, Fast Gate machine part clean on all four stages, two lens rounds read. NOT done: the Fast Gate is not signed (open items below), the full visual tiers with lenses, the Opus lens, the ten receipts, design-system measurement/readiness, kit, release chain, content coverage, pre-check. Nothing is published; no PR.**

## Gates (evidence)
| Gate / step | Result | Evidence |
|---|---|---|
| Kit tests `node --test tests/*.test.mjs` | 483 of 483 pass (2026-11-25, after the format pass and the lead-decision changes) | `/home/agent/out/nova/tests2.log` |
| `astro check` | 0 errors | earlier today; rerun before release |
| `check-emdash-kit-sync` | level, 9 templates | — |
| `generate-docs --check` | pass | — |
| `qa-contract.mjs` | exit 0 (26 pages, 116 cases, 4 variants, revision 7) | `qa.contract.json`, `ingest/{contract-spec,source-measures}.json` |
| `qa.mjs --browser` | `contracts`, `preflight`, `browser`, `routing` pass; `distribution` pending (needs `--artifact` from a pack) | `/home/agent/out/nova/qa/qa.7` (browser/routing pass; later contract revisions changed only layouts) |
| `fast-gate.mjs plan` | ok, 12 cases | `/tmp/tracy-cli/fast-gate-plan-*.md`, `vis/fg6/FAST-GATE-PLAN.md` |
| Fast Gate visual-qa machine part | pass on light-desktop, light-responsive, dark-desktop, dark-responsive, 0 findings | `/home/agent/out/nova/vis/fg6` (clean site c5, contract revision 7) |
| Fast Gate lens round 1 / 2 | 112 notes → fix round (groups chrome/blocks/views) → round 2: 40 notes | `vis/fg5/notes`, `vis/fg6/notes`, `lens/` |
| Forms, mail, recovery, admin round-trip, content-api gate | all pass (contact form POST 200, mail in Mailpit at the notification address, stored submission, admin edit/publish/restore, backup/restore into a second dir) | `/home/agent/out/nova/t3/` |
| Full-scope visual run (baseline, no lenses) | see the section at the end of this file | `/home/agent/out/nova/vis/full1` |

## Fast Gate: why it is not signed (open, need the owner or a kit change)
1. Notes flagged `LEE` (design intent): footer link columns and the missing Joomla legal line (settled by lead decision L2: the WP port's columns, only links to pages this template has); the "Advanced Search" button and help box on `/search` (not ported: owner decision pending, would be a design addition).
2. `state shot does not show the state` (dropdown, off-canvas, accordion, pricing tab, show-more): the Fast Gate "mega" capture clicks at the trigger's page position, below the first screen, so the shots show the closed state; real clicks open all of them at 1440 and 390 (`/home/agent/out/nova/t2/widgets.mjs`). This is a kit-tool defect (D16): fix in `scripts/tools/` with a negative fixture, then re-shoot; until then the todos stay open.
3. Contrast of coloured heading words, price, teams text etc.: measured equal on the source, recorded as exceptions (D15). Needs the owner's confirmation that "a defect the source shares" is accepted.
4. Tags Popular order (Careers before developer): the seed post tags carry developer 19 vs 20 for Careers, the source tag table has developer 21: a data difference of the adapter, not a CSS fix.
5. The pink news date on photos is hard to read in light and dark; the source is identical (SOURCE flag candidate): fix better than the source or accept.
The source-site proxy used for visual runs: `--source-site http://127.0.0.1:18090` (`node /home/agent/out/nova/t2/proxy.mjs`, maps `<path>/index.html` to the live route); the live Joomla at 18082 answers 404 for snapshot-style paths. The mirror `http://127.0.0.1:18218` (snapshot) also works.

## Known differences from the source
- Footer: three columns Users / Pages / Content per lead decision L2; Users prints only its title; link rows are padded with `min-height` so the footer height equals the source's at 1440/1200/992/768/576/390 (measured: 502/502/710/614/566/934 both sides); the Joomla credit line is not printed (its room is kept).
- Logo: the real logo files ship as `public/brand/logo.png` / `logo-light.png` (lead decision L3).
- Contact page: the info-card icons are the source PNGs (`public/nova/contact/`).
- Blog detail: only the image + heading + list/paragraph patterns of the source bodies are rebuilt as two-column rows.
- Forms plugin prints three English literals (`aria-label="Page 1"`, `aria-label="required"`, the honeypot label "Leave blank"): plugin-owned, not changeable here.
- Popular tags are derived from the posts' `tags` strings, pills link nowhere (no tag pages are ported).

## Repo wiring done
`pnpm-workspace.yaml`, `turbo.json`, `apps/tracy-web/turbo.json`, `check-emdash-kit-sync.ts`, `check-tests.ts` (`standalone:nova`), `plan-ci.mjs` (`tests emdash-nova`), `docs/licensing.md`, `vocabulary.md`, `changes/2026-11-24-emdash-port-nova.md` (PR number `#TBD`), `scripts/language-policy.json` rows (regenerate with `/home/agent/out/nova/scripts/lp-rows.mjs` after any edit of the questionnaire or kit files; squash the local commits before pushing, the policy check reads every intermediate commit).
**Not done (need the release):** Road rows (`emdash-tool.js`, its test row, `quickstart-render-map.json`, `template-profiles.json`, Dockerfile copies of `contracts/`), `docs/README.md` (`pnpm docs:index`), `public-tree.json`, the regression case `tests/regression/cases/REG-PR-<n>-emdash-nova-0-1-0.json`.

## Next commands (resume here)
1. Stand: `bash /home/agent/out/nova/scripts/stand-up.sh` (Joomla + MariaDB :18082, snapshot mirror :18218; do not pipe it, it keeps the pipe open); source proxy `nohup node /home/agent/out/nova/t2/proxy.mjs &` (:18090). Dev site: `bash /home/agent/out/nova/scripts/site-up.sh 4360` (wipes and reseeds); `reseed.sh` applies seed changes. Clean sites: `tools/clean-install.sh /home/agent/out/nova/clean/<new> <port>`.
2. Decide the open Fast Gate items above, fix the kit capture defect (item 2), rerun `node tools/visual-qa.mjs --contract qa.contract.json --site <clean> --source-site http://127.0.0.1:18090 --out <new> --scope fast-gate`, lens readers per `/home/agent/out/nova/scripts/lens-plan.mjs <run> <dir>` (17 Sonnet readers, one message), `qa-notes.mjs merge`, a coding round, then `node tools/fast-gate.mjs verdict <run> --contract qa.contract.json`.
3. Full tiers: `visual-qa.mjs --scope full --fast-gate <run>` x2, lenses, Opus layout lens once (model `claude-opus-5-5`), merge both notes, `qa-receipt.mjs` receipts (build, security, editability, forms, recovery, clean-install, independent; the T3 evidence supports forms/recovery/editability).
4. Design system: `contracts/0.1.0/design-system-measurement.json` via `flow.mjs`, `design-system-roles.json` (VARS-1: every colour through `--ds-c-*`, already the rule in `tokens.css`), `node scripts/template-design-system-readiness.mjs <release copy>` until 0 FAIL.
5. Kit: `template-kit/cli.mjs build --reread-sections` against a release; write `ingest/kit-sections-check.mjs` as Impact did (not on this branch); looks by Sonnet readers; approval is the owner's.
6. P8: `node tools/release-chain.mjs`, content coverage with `packages/cms/tracy-quickstart-tools/content-coverage/emdash-audit.mjs` (map sha equals the final map) on the released zip's clean install, `road-precheck.mjs --release <dir> --tag tracy-nova/emdash-0.x --stage release` until CLEAR.

## Owner questions (batched)
1. "Advanced Search" button and help box on `/search`: add (design addition) or leave out?
2. Accept the source-shared contrast (D15) and the pink news date as they are?
3. Tag order: fix the seed post tag counts to the source's tag table (developer 21)?
4. Kit approval: not requested yet (no kit built).

## Full-scope baseline (`vis/full1`, clean site c7, no lenses, not a pass)
`visual-qa.mjs --scope full` on 25 pages: light-desktop fails with ONE finding, `source-not-rendered` on `/project` (the source page's pictures carry `#joomlaImage://…` fragments and 4 of 7 do not decode in the capture, i.e. the source side is not fully rendered: a capture limitation to settle, then the later stages run). Every other page is clean at light-desktop; 17 accepted exception groups (D15–D18, made by builder agents from measurements on the source: **the lead should confirm them**). The responsive and dark stages did not run (an earlier stage failed). Next: settle that finding (wait for lazy source images in the capture, kit tool, or record an exception with the lead's decision), rerun `--stage light-desktop --reuse vis/full1`, then the other stages.
