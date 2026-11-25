# STATUS — tracy-nova

**Phase reached (session 3, 2026-11-25): P7 in progress, kit built (not clean, not approved). Built and compared (P3–P5), personalization (P4.5), docs (P2/P8 docs), acceptance contract, `qa.mjs --browser` passing, Fast Gate machine part clean on all four stages, two lens rounds read. NOT done: the Fast Gate is not signed (blockers below), the full visual tiers with lenses, the Opus lens, the ten receipts, design-system measurement (`flow.mjs`) and readiness, release chain, Road rows, content coverage, pre-check. Nothing is published; no PR.**

## Session 4 (2026-11-25, lead answers L12-L16) - state at the deadline
- **Phase reached: P7, tier loop not closed.** Kit: only the 19 EmDash-inherent errors, 0 specific, `approval: null` (owner step). Kit approval, release and Road rows NOT done.
- **Fast Gate on the final tree (`vis/fg24`): machine pass, 17 of 18 lens readers 0 notes; `images-2` left 2 low-weight notes (390 hamburger glyph stroke weight, share-rail glyph size a few px) that are open, so the verdict on fg24 is FAIL until they are fixed or accepted and closed.** Earlier: signed (pass) at `vis/fg22` (lens round 0 notes, contract rev 12) but the tree changed afterwards (service crumb, article list margin, split text margins), so that verdict is STALE. Last machine run on the final tree: `vis/fg24` pass, 0 findings, 12 cases; no lens round or verdict on it yet.
- **Full tier:** `vis/fullB` pass (4 stages, 0 findings) on the fg22 tree; its lens round found 5 notes, all fixed in the tree since (list-to-paragraph margin 24px, the service crumb without the Services level, "What's next" 32px gap and last-paragraph margin: measured equal to the source). No full run, no second full run and no Opus lens on the final tree.
- **Source-shared (measured with ?theme=dark on the live source, not defects):** about-page dark value patch rgb(26,30,37), chips rgb(30,35,43), the light divider, current nav link border (exceptions D19), contact hero photo corners.
- **Receipts:** evidence for build, clean-install, security, editability, forms, recovery, font-review, viewing-contexts is collected and passes (`/home/agent/out/nova/receipts/`); the receipts themselves, `independent` and `visual-review` are not written. Release chain dry run reached `qa` (browser, routing pass).
- **Design system:** `ready: false`, flow 45/64 (three system-own colour pairs); readiness script not run to 0 FAIL. Content coverage and `road-precheck` not run.
- Note: `recovery-check.mjs` restarts the server without `EMDASH_SITE_URL` (the canonical becomes localhost). Kit tool defect, not fixed here.
- Next: lens round on a fg run of the final tree, verdict, two full runs + Opus lens, then the chain from a fresh worktree, receipts, DS readiness, Road rows, coverage, precheck.

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

## Session 3 (lead answers L5–L11) — what changed
- **L5 state shots (tool defect, proven by a negative fixture):** `mega-hover.mjs` clicked a below-the-fold trigger at viewport coordinates outside the screen. Fixed in the kit at `vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/scripts/tools/mega-hover.mjs` (centre the trigger, scroll a tall panel's link into view; the `offscreen` branch), new `persistent: true` interaction field for disclosures (`qa-contract.mjs`, `--persistent`), copied to the nine templates, tests `tests/mega-hover-below-fold.test.mjs` (the below-fold and tall-panel cases fail on the old tool). The contract was compared with Essence/Diner first: they declare only an off-canvas popup. All four states (dropdown, accordion, pricing tabs, show more) and the off-canvas now PASS in `mega-hover`.
- **L9 `/project` source-not-rendered:** capture fault fixed in `visual-qa.mjs` (`loading=eager` for the source's lazy pictures before the scroll; case `lazyOffscreen` in `tests/visual.test.mjs`, fails on the old tool), nine templates; `IMPORT-NOTE.md` records both kit edits.
- **L6 tags:** the two service articles that carry tags (Company, Design, developer) became `pages.tags`; the Popular tags module counts posts and pages: order now equals the source's tag table. **L7** pink date: cited exception (page `/`, 1440 light, 3.87 against white). **L8** Advanced Search not ported. **L10** D15–D18 each cite page, width, value in `ingest/contract-spec.json` and `DECISIONS.md`.
- Contract revision 10 (pricing selectors as plain CSS, `persistent`), content map/roles/slot limits (`contracts/0.1.0/content-map.json`, gate `check-emdash-content-map` green and Nova in `REQUIRED`), VARS-1 greps (`ds-keep` comments), slot profile `packages/design/tracy-ds-slot/templates/emdash-tracy-nova.json` (`ready: false`: not measured), kit built (see below).
- Fast Gate machine part: `vis/fg13` (clean site, contract rev 10): pass on all four stages, 0 findings, 12 cases; lens rounds fg10 → fix → fg12 (45 of 62 notes closed, 17 new) → fg13.

## Fast Gate: why it is NOT signed
1. **Blocked step (needs the lead):** the layout reader `layout-3` could not write its notes file in two rounds (fg12 and fg13): the permission classifier denied the write (Bash and Write) and the agent stopped instead of working around it; its 62 tiles (`lens/fg13/layout-3.md`, shots of Contact/Search/404/dark pages) are therefore unopened by the `layout` lens and `qa-notes merge` reports `missing` pictures. I did not write that file on the agent's behalf (it would assert a reading I did not make) and did not re-dispatch the same task a third time. Needs the lead to allow the write or to have the reading done another way.
2. **Open lens notes of fg13 (36):** mostly SOURCE-flagged wrap defects that the source shares (widows "want", "here", "URL"; the inline-icon heading line pitch). A `text-wrap: balance/pretty` fix was tried and reverted: it changed the wraps against the source ("world-/class", "16-/in."), which the readers then flagged. Decide: accept source-shared wraps (cited exceptions) or fix them with a method that keeps the source's breaks.
3. Dark-mode design notes (indigo header/pricing icons, saturated bands): `LEE` (design intent).
4. Footer Users column empty (lead decision L2) and the 404 page without header (the source's error page has none): settled, closers closed them.
Source-site proxy for visual runs: `--source-site http://127.0.0.1:18090` (`node /home/agent/out/nova/t2/proxy.mjs`).

## Kit (built, looks written, NOT approved: `approval: null`)
Work folder `/home/agent/out/nova/kit/` (site, kit, logs, `looks-final.json`, `reach-accepts.json` inside `kit/`). `contracts/0.1.0/template-kit.json` is byte-identical to the json inside `kit/template-kit-tracy-nova-0.1.0.zip` (412 images, 59.2 MB, sha256 `7dc44c93851ea2e3b1b7bf5a8cd3cd09fc40de138b0ca8bc01c5cb471b218991`); 206 shots have looks written by Sonnet readers (259 looks incl. copies). Road step (`apps/tracy-web/scripts/template-kit-step.mjs`): `kit-incomplete`, self-check `linksWithoutLabel 7`, `slotCoverage 7` explained. `ingest/kit-sections-check.mjs` reports 0. Errors 196 → 26.
**Gap list for the owner's approval review.**
- *EmDash-inherent (19):* 6 off-canvas links never shown, 6 not-on-platform (free HTML block, CMS contact entity, menu blocks, item lists), 3 logoSpots, 1 navigationGroups, 1 articleLayoutForNewPage, 1 head.injection.position, 1 faces.
- *Template-specific (7):* the "Branding" breadcrumb crumb link on the 7 `/project/branding/…` project pages has a taxonomy term as its label, and the kit takes only text slots as label slots. Fix identified, not applied (it needs a site + kit rebuild, about 30 minutes, and new looks for the changed shots): in `src/views/Post.astro` take the crumb label from the `primary` menu item with the same url (a menu-item label slot) instead of `post.category.label`.
- *Accepted with a written reason (in `kit/reach-accepts.json`):* 7 page-title slots on `/project/branding…` (a taxonomy term is a term slot, not a page title slot).
- *Tool quirk to fix in the kit:* `relabel` and the label step of `assemble` stop at 650 links while `emdash-sections.json` is in the out folder (28 Prev/Next labels were affected); the workaround in this run (assemble, clear labels, relabel in a section-less copy, copy back, relabel again) is `/tmp/settle.sh` (lost with /tmp: re-create from this description); a fix in `link-label-reasons.mjs` with a negative fixture is due.
- 37 icons are classified "demo" by an agent's eye in `kit/icon-classes.json`: check them.
- Template change from the kit work: `ingest/bind-paths.mjs` (a page route wins over a list route of the same last segment: `/illustration` page vs `/project/illustration` list), `PostNav.astro` stamps, `seed/slot-limits.json`, reseeded seed files (no pixel changes).

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
1. Stand: `bash /home/agent/out/nova/scripts/stand-up.sh > /dev/null 2>&1 &` (Joomla + MariaDB :18082; never pipe it: the snapshot mirror it starts holds the pipe), source proxy `nohup node /home/agent/out/nova/t2/proxy.mjs &` (:18090), dev site `bash /home/agent/out/nova/scripts/site-up.sh 4360`, clean sites `tools/clean-install.sh /home/agent/out/nova/clean/<new> <port>`.
2. Unblock the `layout-3` reading (see the blocker above), decide the open lens notes, rerun `visual-qa.mjs --scope fast-gate` on a clean site, lenses (`/home/agent/out/nova/scripts/lens-plan.mjs <run> <dir>`: 18 Sonnet readers, close verdicts per `close-plan.mjs`), `qa-notes.mjs merge` per stage, then `node tools/fast-gate.mjs verdict <run> --contract qa.contract.json`.
3. Full tiers: `visual-qa.mjs --scope full --fast-gate <run>` twice, lenses, one Opus layout lens (`claude-opus-5-5`) at the final checkpoint with its note merged; receipts (`qa-receipt.mjs`: build, security, editability, forms, recovery, clean-install, independent; `/home/agent/out/nova/t3/` holds the forms/mail/recovery/admin evidence, c-runs the clean installs; `visual-review` is signed by no one).
4. Design system: set `ready: true` in `packages/design/tracy-ds-slot/templates/emdash-tracy-nova.json` only after `packages/design/tracy-ds-slot/scripts/flow-emdash.mjs` measured the final clean site (Moxie and Figma, light and dark, 16 pages) into `contracts/0.1.0/design-system-measurement.json` (the selectors in the profile are unmeasured guesses); `scripts/template-design-system-readiness.mjs` on a release copy until 0 FAIL.
5. Kit: finish the template-specific errors, write the looks with Sonnet readers (`cli.mjs looks --kit … --list`, then `--apply`), pack, copy the json; approval is the owner's (`cli.mjs approve --out … --by <login>`).
6. P8: `node tools/release-chain.mjs`, Road rows (`emdash-tool.js` + test row, `quickstart-render-map.json`, `template-profiles.json`, Dockerfile copies of `contracts/`), `docs/README.md` (`pnpm docs:index`), `public-tree.json` (the opensource scan stops on a zip in another folder: it needs the tar shim Essence used; `gitleaks dir` on this package finds only gitignored `data/`), the regression case with the PR number, content coverage with `emdash-audit.mjs` on the clean install of the released zip (map sha must equal the final map), `road-precheck.mjs --release <dir> --tag tracy-nova/emdash-0.x --stage release` until CLEAR.

## Owner questions (batched)
1. Accept the source-shared wrap defects (widows, inline-icon heading pitch) as cited exceptions, or fix them in a way that keeps the source's breaks?
2. Dark-mode design notes (`LEE`): saturated bands and indigo icons in dark.
3. Allow the `layout-3` notes write (or tell me how the reading should be done).
4. Kit approval: not requested yet (the kit has template-specific errors left).
