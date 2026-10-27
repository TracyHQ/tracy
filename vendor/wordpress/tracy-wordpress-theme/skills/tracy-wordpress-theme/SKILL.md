---
name: tracy-wordpress-theme
description: Turn a running Joomla site (or an HTML folder, URL, brief) into a complete WordPress 7 site on Tracy's block theme — spec-pack, a theme generated from the `tracy` generator with its own overlay, content seeded through wp-cli repeatably, light and dark, acceptance by real renders and a content parity gate, a theme zip through Theme Check, a tar+SQL quickstart restored on a clean stand without drift. Use when asked to "port Joomla site X to WordPress", "build a WordPress theme from an HTML folder", "capture a WordPress quickstart for the fleet", or when a Tracy WordPress theme/quickstart needs acceptance.
---

# Tracy WordPress Theme — from a source to a working WordPress site, and a quickstart

Process + toolkit, proven on Tracy Base j6 → wp7 ([`examples/tracy-base-wp7.md`](examples/tracy-base-wp7.md))
and the JoomlArt ports after it. Each phase reads **one** reference packet, does the work, measures, and only then moves to the next phase.

## Measurements — one name for one number

| Name | Meaning | Read where |
|---|---|---|
| **source route** | every source URL that ingest captures (`render-routes.json`) | `http-parity --routes` |
| **page-map page** | a WordPress page the spec-pack declares (page + synthetic archive/single/404) | `page-map.json` |
| **seed route table** | page-map pages + redirects/404 the seeder checks after the seed | `seed report.routes` |
| **source article** / **WordPress post** | a Joomla article in the inventory / an article that is still a post | `inventory.json` / `wp post list` |
| **theme version** = **quickstart version** | `Version:` from the generator's `package.json`; id/version of the tar+SQL package | `style.css`, `manifest.json` |

## Getting started

What is the source? A running Joomla site (`inventory.json` + template tree) · an HTML folder · a URL · a brief. If there is
none yet, ask one question. Once there is, read [`references/inputs/spec-pack.md`](references/inputs/spec-pack.md) and **one**
`from-*.md` matching the source (`from-pen`/`from-figma`: export HTML, then follow `from-html`).

**Lessons:** after the spec-pack passes its gate and the theme is built, run
`node scripts/lessons.mjs scan --spec <spec> --theme <src/<slug>> [--source <pages>]` and handle every
`id · sym · fix` line it prints; `lessons.mjs show <id>` opens the matching gotcha. Exit 1 = an unresolved lesson; exit 2 = missing
input or a detector could not decide (run again once complete). Scan again before Phase 8 (`--source`) and Phase 9
(`--pack`). Details: [`references/lessons.md`](references/lessons.md).

## Inputs — contract

| Needed | If missing |
|---|---|
| An **immutable** source + render baseline | stop, ask |
| Target theme = a build target in `packages/cms/tracy-wordpress-theme` (`overlays/<slug>/`) | new theme = new overlay, do not copy `src/tracy` |
| Its own compose stand, **always `-p <project>`**, `cli` with `entrypoint: ["wp"]`, web + `verify` + two dbs | copy the Tracy Base stand's `compose.yml` |
| Run dossier `tasks/<name>/{DECISIONS,STATUS,content-gaps}.md`, `parity-accepted.json`, `review.config.json` | create it before writing anything |
| Evidence **outside the repo** (`~/TracyHQ/quickstart-builds/<name>/evidence/`) | the repo keeps only small reports |

Do not edit the source. Do not invent: if something is missing, leave it empty and record it in `content-gaps.md` (G-number). No `--force` deleting what you
did not create. No SQL, only wp-cli.

## Phases and gates

**Run rules** (speed, tokens, parallelism, model per role): [`build-subagents.md`](references/build-subagents.md) §Execution rules. Fix release: `quickstart/patch-chain.mjs`; at the end of a run, `perf/token-report.mjs` records its tokens per session (both in [`tools.md`](references/tools.md)).
**Flags and how to call each tool:** [`references/tools.md`](references/tools.md).

| Phase | What | Packet | Exit gate |
|---|---|---|---|
| Preflight ᴾ | **Before any build work:** the machine has TDSR's measuring image — `node scripts/quickstart/road-precheck.mjs --prereq --build` (`docker image inspect` of the `tracy/web-wordpress` image that the TracyHQ repo's `stand.mjs` runs; if missing, build it with `DEFAULTS_ONLY=1 bash web/build.sh wordpress` in `packages/fleet/tracy-fleet-operation`, do not write "unmeasured" and carry on); **the source is the latest green Joomla version**: the highest version in `packages/cms/tracy-joomla-quickstart/contracts/<product>/j6/` of the TracyHQ repo, matching `maxVersion` of `packages/design/tracy-ds-slot/templates/joomla-<product>.json` — record the version in `STATUS.md`; check again before step 10, and if there is a newer version, carry what it fixed (usually only when wearing a system) into the port before release (JA Fresco was ported from 1.0.3 while 1.0.4 had already fixed TEXT-1 and HIER-2) | [`quickstart.md`](references/quickstart.md) §Road to live | `road-precheck.mjs --prereq` exit 0; source version in `STATUS.md` = that highest version |
| 0–1 | Stand + `wp core install`, theme generated and installed | [`wordpress-anatomy.md`](references/wordpress-anatomy.md) · [`theme-json-tokens.md`](references/theme-json-tokens.md) | `wp theme list` active; `build.mjs --check --target <slug>` exit 0 |
| 2 | Ingest → spec-pack; source snapshot on 4 axes | [`inputs/from-joomla.md`](references/inputs/from-joomla.md) (or from-html/url) · [`design-contract.md`](references/design-contract.md) · [`content-contract.md`](references/content-contract.md) | `spec-pack.mjs --validate` OK; `shoot.mjs` source 0 errors, dark shots really dark; **Joomla source: 0 `source-font` findings** (`source-font.mjs check` + `source-font-browser.mjs`) — if the source itself renders in a fallback font, stop, fix it in the source repo or record a decision in `DECISIONS.md` naming the finding's key |
| 3 | Chrome: header/footer parts, `wp_navigation`, mega, dark toggle | [`chrome-and-navigation.md`](references/chrome-and-navigation.md) · [`dark-light-mode.md`](references/dark-light-mode.md) | `review/mega-hover.mjs` PASS; toggle 3 states; brand chrome ([§7](references/chrome-and-navigation.md)): `review/brand-ready.mjs --theme src/<slug>` exit 0 |
| Pilot | On the main stand, the spine done in sequence: chrome, the first pattern, the templates of the home page + one content page, seed the full page-map; one admin round (edit text, save, reload the editor, the render shows the change, revert); build templates for the Fast Gate case pages | [`measurement-protocol.md`](references/measurement-protocol.md) §3 · [`design-contract.md`](references/design-contract.md) §Capture and pilot | **pilot green** = all four, in order: `design-contract.mjs pilot` (`pilotPages` = the two pages) every variant 0 findings, 0 missing cases, `scope: pilot`; `visual-qa.mjs --pages <home>,<content> --all-stages` with the parity rows (`http-parity`) of the two pilot pages, every stage `pass` + `notes.mjs merge` `open = reopened = lee = leeFlagged = 0`; the admin round has the `post_content` hash at save and at revert; **early Road to live:** `quickstart/road-precheck.mjs --theme-zip <pilot zip> --slug <slug> --version <x.y.z> --pack <temp pack> --stage pilot` exit 0 — 0 TCQR/TDSR must-fix rules that the pilot build already saw (ABOUT-*, NAME-*, LOGO-*, CSS-1, DEF-1, VARS-1, PIC-1…) and the slot contract `packages/design/tracy-ds-slot/templates/wordpress-<stylesheet>.json` **exists** (write the draft at pilot, [`quickstart.md`](references/quickstart.md) §Road to live); `fast-gate.mjs verdict` `pass` (a finding only on a case page the pilot did not build goes into the brief of the group that builds that page, and the group is still gated — [`measurement-protocol.md`](references/measurement-protocol.md) §3) |
| 4–5 ᴳ | Templates following the source layouts, a pattern per section type (`role: content`, `metadata.name`) | [`templates-and-patterns.md`](references/templates-and-patterns.md) · [`editability-standards.md`](references/editability-standards.md) | every pattern inserts and renders 200 |
| 6 ᴳ | Dark: `light-dark()` in `theme.overlay.json`, cookie + `data-theme` | `dark-light-mode.md` | `review/{leak-scan,contrast-audit}.mjs` pass, `examined > 0` |
| 6b ᴳ | Images from the source or license-clean; alt from the spec | [`inputs/spec-pack.md`](references/inputs/spec-pack.md) §4 | `media.files` = number of spec images, 0 import errors |
| 7 ᴳ | Seed from the spec-pack, running twice = no change | [`demo-content.md`](references/demo-content.md) | run 2 `+0 ~0`; route table correct |
| 7b | i18n when `page-map.locales` > 1 (Polylang) | [`i18n-polylang.md`](references/i18n-polylang.md) | run 2 `+0 ~0`, `i18n.linked` 0, hreflang + switcher correct |
| 8 ᴳ | Verify: content parity on every source route, shots on 4 axes, scanners, functional smoke | [`verify-recipes.md`](references/verify-recipes.md) | `lessons.mjs scan … --source` exit 0; `http-parity` **N/N, 0 missing**; every delta has a G-number; `functional.mjs` 0 findings, `examined.links > 0` |
| 8b ᴳ | Review: editability, four-tier Visual QA, lenses, motion | [`review.md`](references/review.md) · [`visual-qa.md`](references/visual-qa.md) | preflight trusted → prepass → checkpoint 0 (baseline) → each group measured `--pages` + fixed until the group closes → **one** integration checkpoint meeting the **Done rule** below; `editability.mjs` 0 BAKED; `notes.mjs merge` 0 unopened images; `motion.mjs` 0 rows or has a decision |
| 9 | Theme zip | [`packaging.md`](references/packaging.md) · [`package-docs.md`](references/package-docs.md) | `lessons.mjs scan` exit 0; `brand-ready.mjs` exit 0; `package.mjs` 4/4; `generate-docs.mjs --check` |
| 10 | Quickstart tar + SQL, restore on a clean stand, compare the two stands, release | [`quickstart.md`](references/quickstart.md) | `lessons.mjs scan --pack` exit 0; prune 0 → pack → restore → `verify-parity` **0 drift** → `contract-bind.mjs` **bound** (refused = the release needs its own profile, [`quickstart.md`](references/quickstart.md) §Content contract) → `site-sweep.mjs` with all **eleven** checks on the restored pack (`--zip`, no `--only`; any check with an error cluster left, an error accept or an unmeasured case blocks a first release; the cluster is reported or fixed, or recorded in `sweep.accept`) → `tracy-dev site-pages … --check` ok ([`quickstart.md`](references/quickstart.md) §`tracy_site_pages.json`) → `release.mjs --asset <…>/tracy_site_pages.json --contract-bind --behaviour-sweep <site-sweep.json>` (a first release without it = `[behaviour-pass-missing]`, [`quickstart.md`](references/quickstart.md) §release.mjs; the record is bound, tied to this pack + zip; both modes require a clean `port-audit.json` in `--run-root`); a fix version of an already released port: `release.mjs --patch` ([`quickstart.md`](references/quickstart.md) §Release a fix version; the measure must be a full sweep over every check and route, taken against the source as it is now), measured with `visual/site-sweep.mjs` (every route × width × scheme: horizontal overflow, scheme, background, header, chips; by default all eleven checks: five property checks, five behaviour checks (back-to-top visible, icons, forms, text clipping, first click of theme/touch menu/drawer) and `heights`; `--only` narrows); both modes, on the folder `release.mjs` writes (run again after every rewrite, the last time on exactly the folder to be released): TCQR and TDSR of the TracyHQ repo **0 must-fix rules** (no decision can waive one), every remaining worth-fixing rule is either fixed or has a decision in `DECISIONS.md` naming the rule's id, TDSR 0 preview rules `unmeasured` (this version's `design-system-measurement.json` measured the preview at the current probe), other built-site `unmeasured` rules go the worth-fixing way; and that repo's slot contract `packages/design/tracy-ds-slot/templates/wordpress-<slug>.json` exists, is `ready`, and covers this version ([`quickstart.md`](references/quickstart.md) §Road to live). **Do not finish a release while a preview rule is `unmeasured` or the slot is `ready:false`** — the one-line check: `quickstart/road-precheck.mjs --release <release folder> --tag <product>/wp7 --stage release` must exit 0 (JA Restaurant was released with both still open and /ops reported `ds-not-at-probe`) |

**Running headless (`claude -p`, as in `wf agent`): ending the turn ends the run**, and every subagent and background command it opened is stopped with it. The coordinator and every build session do not end the turn while their subagents or background jobs are still running: subagents run in the foreground, background jobs are waited for until done ([`build-subagents.md`](references/build-subagents.md) §Execution rules).

ᴾ = runs once, at the start of the run, before any build work.

ᴳ = runs per page group, groups in parallel, **only after the Pilot gate passes** — §Page-group pipeline. Each group has its own stand (project `-p <proj>-<g>`, port, volume) and its own worktree: two groups never share a stand or a worktree, and no group runs in sequence on the main stand.

A port built with an old skill version that the cycle refuses (exception missing `key`, contract hash mismatch): run `scripts/migrate-port.mjs` first — [`quickstart.md`](references/quickstart.md) §Port built with an old skill version.

`STATUS.md` is updated after **every** phase, but only as the current state: a `## Now` block at the top of the file, **at most 40 lines** including the heading — phase, last commit, open blockers, next step, paths to evidence (no pasted measurements or logs). History is appended to `STATUS-log.md` next to it. Read the state with `head -40 STATUS.md`; open the log only when a question needs history. `checkpoint.mjs` warns (without changing the result) when the `Now` block exceeds 40 lines. Do not mark done because the home page looks good.

## Build loop — three rules, with or without page groups

The tools hold all three (`round.mjs`, `recheck.mjs`); this is the only place that states them.

1. **Sweep after every build + deploy.** Every deploy in the loop (at session start and after each fix) `round.mjs` runs `site-sweep.mjs` with all **eleven** checks
   (`overflow,scheme,background,header,chips` + `fixed-widgets,icons,forms,text,first-interaction` + `heights`, port against source; the command has no `--only`, so later runs use history and re-measure only what is still open) and records the result in the next ledger row (`sweep`);
   with no `sourceSite` the row records `sweep.status: skipped` with a reason. A cluster it reports is fixed or recorded in `sweep.accept` ([`visual-qa.md`](references/visual-qa.md) §Whole-site sweep).
2. **A measuring round measures only what the last fix touched** — scoped mode (`recheck.mjs --changed`, `round.mjs --pages`), not the whole site again.
3. **Full four tiers exactly twice on the clean path:** the first baseline and the final integration checkpoint. By default there is **no** periodic checkpoint
   (`checkpointEvery` empty); a periodic schedule (`--checkpoint-every K`) and a third full checkpoint onwards must be requested explicitly with a reason
   (`--checkpoint-reason "…"` for the session, `recheck.mjs --checkpoint --reason "…"` for one run; missing reason = `[checkpoint-reason]` / `[checkpoint-limit]`),
   the reason recorded in the ledger row (`reason`). Not forbidden: a regression after the final checkpoint needs re-measuring. A full run forced by a fix that touches every page (fail closed) records `failClosed` and does not count toward the two.
   Those two runs belong to the build stand's ledger (`<evidence>/rounds.jsonl`; `round.mjs` counts by ledger). A port with Phase 10 measures one more **release checkpoint**: four tiers on the stand restored from the pack, its own round config (`site` = the restored stand, `artifact` + `pack`) and its own evidence/ledger ([`quickstart.md`](references/quickstart.md) §Five phases) — not a third run of the build loop, so it needs no reason; it is the binding release run. A fix after the integration checkpoint is measured by rule 2 on the build stand, with no extra full run there; a fix after the release checkpoint means pack, restore and a full re-measure on the release ledger.
   A checkpoint measured in full for which `round.mjs` returns `next: unblock` (0 findings, but an interaction probe still has an unmeasurable state or an intrinsic error) **does not re-measure the whole site**: running it again gives the same result. Fix the page, or record an S-number and fix the probe, then measure exactly the pages it names (`round.mjs --pages`); release still requires a checkpoint where every tier exits 0.

## Page-group pipeline — Phases 4–8b, groups in parallel

After Phase 3 and the Pilot gate of the Phase table (not earlier: the pilot is a sequential step on the main stand, not a fix round after the split), split **every** remaining page into 3–4 groups by layout family; each page in exactly one group,
each file with exactly one owner. The coordinator holds and **freezes** the shared files (`theme.json`/overlay tokens, header/footer
parts, shared CSS, `patterns.map.json`) and builds a baseline in advance that registers every template + shell pattern (they need not be
finished yet); each group owns the layout templates, patterns, CSS and content of its pages. A group that needs to change a shared file
asks, the coordinator merges **one** batch, then every group rebases and re-measures.

Each group: its own worktree and its own stand (project, port, volume, build, evidence — never shared with another group or with the main stand; restored from the same immutable seed and local images — no downloads, `restore.mjs --offline-checksums`) and one foreground subagent. Each group has **its own contract**
(`contract.mjs init --group <g> --pages <group pages> --site <stand origin>` in the group's dossier: stand origin (`target.site`), seed report, build zip and the group's spec; `identity.group`).
The group's round is the commands in the recipe: stand → build + seed + group contract → `visual-qa` all 4 tiers (+ `http-parity` of the group's routes for `url`/`html` pages) →
rolling fixes per §Done rule → `group-verdict.mjs --group --site --contract --port-audit <group dossier>` — close the group **only when it returns `done`** (the dossier's finish audit `port-audit.json` must be clean, fresh, and of the right stand/group pages, [`tools.md`](references/tools.md); a site contract, another group's, another stand's — including parity measured on another stand —, a copy of the contract — including a Visual QA run measured on a copy —, a contract in `attempts/` or missing parity for `url`/`html` pages → `incomplete`; parity runs once for each `reference.kind` of the group per the route plan of `group-pages.mjs` — the seed route of a moved page is the target to measure; the verdict requires parity rows that read the right source route and (for `url`) the right source origin of the route plan; two pages on one route or a page-map with a duplicate path → refused by name; `url` with the same path needs no pairs).
Return: verdict, pages, clusters, changed files + spec (record ids), evidence, UTC, minutes. Missing evidence or no-progress is not done; a `--pages` report does not close the gate;
a group contract never replaces the integration or release checkpoint (`round.mjs`, `release.mjs` refuse).

When every group is `done`, the coordinator runs **`group-merge.mjs`** (one tool, one report): spec/content records merge by each schema's id (page/post without `path` uses the slug, category by `locale`+`wpSlug`, author/image by `id`/`file`; two groups editing one record = refused by name, even with the same value),
theme files by declared ownership (a file outside the group or a frozen shared file = refused), a drifted baseline or an unsafe path = refused; nothing is written until every rule passes; a record/frozen declared outside every root = refused; written under a lock held until the report is done; **the atomically published report is the commit point** — an error before it reverts, an error after it only keeps the lock (`--recover` only releases the lock, it does not revert); `--recover` refuses any owner still alive and does not take over an abandoned recovery claim (fix by hand offline); lock/journal/backup/report must be regular files in a real directory.

Full-site on the main stand only twice (§Build loop: baseline and integration checkpoint) — with page groups: the coordinator merges groups with `group-merge.mjs`, builds + seeds
once on the main stand, measures every page × 4 tiers, Opus lens, fixes only regressions caused by the merge (each fix → measure exactly what it touches,
`recheck.mjs --changed`; no full re-measure on the main stand), then Phases 9–10, where the release checkpoint on the restored stand
(its own ledger, §Build loop rule 3) is the binding `release.mjs` run. Commands and
rules: [`build-subagents.md`](references/build-subagents.md) §Parallel page groups.

## Done rule — when a fix round stops

Finding lists never reach zero on their own: every lens pass reads tiles again and writes new notes. A fix
loop stops by these rules, not by an empty list.

1. **Severity first.** Group findings by cause into clusters; give each cluster one severity:
   - **blocker** — page broken or wrong status, content/section/image missing, wrong route, JS error;
   - **major** — a visible difference a customer notices (layout, typography, colour, > 2 px drift on a main block);
   - **minor** — ≤ 2 px drift, polish, lens-only notes.
   Fix blockers and majors. A minor is fixed only when the fix is one line; otherwise it goes into
   a named exception with its measurement, one line each — HTTP parity in `parity-accepted.json`, Visual QA in
   `review.config.json` `visual.exceptions[]` with a `decision`. **Every exception, in every file a tool reads,
   cites ONE decision that exists in `DECISIONS.md` and whose own text names the accepted key or selector**
   (`lib/parity-acceptance.mjs`; an id may be namespaced, `D-ji-gb-1`, and is looked up whole), and a `match` that
   accepts every finding (`.*`, `routes: ["*"]`) is refused. **Done = no open blocker or major cluster** on the final checkpoint
   (a *fix release* of a port already shipped is held to the stricter rule after 3; its tool is `release.mjs --patch`, [`quickstart.md`](references/quickstart.md) §Release a fix version).
2. **Decisions and tool defects leave the loop at once.** A cluster that needs a product decision goes to
   `DECISIONS.md` as OPEN with the options, and into ONE batched list for the product owner in the next
   handoff; the loop continues on everything else with the recorded default. A cluster caused by a tool
   (the tool misreads a correct page) gets an S-number and a named exception; it never blocks the port.
3. **No-progress brake.** When a whole pass — fixes plus the re-measure — closes no blocker or major
   cluster, stop fixing: record what was tried, move what is still open to needs-decision, and hand off.
   Never start another polishing slice on minors. A fix that failed twice with the same approach needs a
   different approach, not a third try.

   **A fix release of an already shipped port** is done when no real defect is left among what the round measures.
   A real defect is a measured difference from the source that the source does not have; it is fixed in the same
   round by its cause (every page with that cause, whatever its severity — the one-line limit for minors in 1 is
   for a first release), then re-measured. Only a tool false positive (an S-number), a defect of the source itself,
   or a difference already recorded as a decision may be left, each listed with its evidence; the no-progress
   brake still ends a pass that closes nothing. An acceptance list bounds what is *measured*, never which real
   defects found on the way may be shipped.

4. **The finish checklist is one command, `review/port-audit.mjs`** (checks in `references/tools.md`): the CMS's
   own wording left on any declared route (footer, error and offline pages, plumbing links); **copy that promises
   behaviour WordPress does not have** (a username "will be emailed" over a form that posts to `lostpassword`) —
   every such promise carries a *reviewed* entry (route, claim hash, observed behaviour, evidence, reviewer,
   disposition) and a false one passes only as `owner-approved` with a cited decision; decisions that replace a
   source feature without a classified `[substitution …]` declaration; and the citation rule of 1 on every exception
   file. **Every finish consumer reads it and refuses without it:** run it as `port-audit.mjs --dossier <dossier>
   --interaction <run>/interaction.json --out <dossier>/port-audit.json` (or `--theme-zip <zip>` for a fix release) and the
   report carries a *receipt* — the hash of every file it read (the dossier's own `DECISIONS.md`, `cms-allow.json`,
   `behavior-copy.reviews.json`, acceptance files, and `page-map.json`/`reference.json` when present to bind per-page reference kinds) and of the interaction record it covered. The Fast Gate verdict, the
   group verdict (`--port-audit <dossier>`) and `release.mjs` (full **and** `--patch`) each name their own dossier, recompute
   every hash from their own paths, and refuse a receipt that is missing, not clean, older than any bound file or than the
   run, or of another site, dossier or route (`[audit-…]`, `lib/audit-receipt.mjs`). A fix release has no four-tier run: its
   receipt is bound to the theme zip and the restore instead, and it still needs a clean audit — but "clean" there means no
   SITE-FACING finding (`cms-leftovers`, `behavior-copy`). The dossier-bookkeeping classes (`decisions`, `exceptions`) guard the
   full gate's acceptance files; a fix release accepts nothing through them, so they are carried as `advisories` (counts, in the
   receipt and `VERIFICATION.json`) and printed as a WARNING, never a refusal. The full scope stays strict on every class.
   The interaction record (`interaction.json`, written by every Visual QA run)
   lists drawer submenus that really open at 390/768 in light and dark, tablet taps, the dark toggle's first click,
   carousels, forms, header geometry and **label wrap and visibility at 390/768/992/1024/1180/1280/1440**, and the
   current section highlighted on article, event and donation pages; its findings are an advisory list, never a verdict
   ([`visual-qa.md`](references/visual-qa.md) §Interaction parity); a state it could not measure is *not measured*,
   never clean — the record carries one row per case (check × route × width × theme) and the audit and every consumer
   refuse a record in which an owed case has no row or was not measured, or that ran narrower tiers than the tool's.

The Opus lens pass runs once, at the final checkpoint before release; earlier checkpoints use the port's
own model (§Model per role in `build-subagents.md`).

## Eleven invariants — a violation is a bug

1. **Content in the DB, not in the theme.** Text, images, links, menus are post/page/`wp_block`/`wp_navigation`/option;
   templates are structure. `editability.mjs` 0 BAKED is the gate.
2. **The theme is generated, not copied.** `overlays/<slug>/` overlays `src/tracy/`; `theme.json` is generated from `rootVariation` +
   `theme.overlay.json`; generated files are not edited by hand; `patterns.map.json`/`theme.config.json`/`theme.overlay.json`
   do not ship. The default `tracy` build must be **byte-identical**.
3. **The inspiration's archetype does not describe the site**: pin `nav`/`hero` to the source with `body_class` (gotchas 7, 12).
4. **Dark = `light-dark()` + toggle + cookie; an absent attribute is auto**, not a broken hook.
5. **Idempotent seed**: look up the slug first, run 2 `+0 ~0`, same IDs. Editing `parts/*.html` requires a re-seed.
6. **Canonical `/x/`**: every gate reads status following a same-path redirect exactly once (gotcha 13).
7. **Parity is containment, not equality** (gotchas 14–16): an accepted delta is a file with a G-number.
8. **Scanners must print `examined`**; "clean" over 0 elements is a FAIL.
9. **Theme Check is a soft gate**: 0 ERROR, REQUIRED accepted by name, real WARNINGs are fixed (gotcha 19).
10. **Quickstart = a webroot tar with a placeholder `wp-config.php` + fresh salts, SQL with a literal prefix + URL placeholder;
    restore on a clean stand, then compare the two stands**; the agent does not patch tests.
11. **One site, one canonical contract.** The run-root `tasks/<site>/` holds the single `design-contract.json` and
    `visual.contract.json`; trial copies live in `attempts/<id>/`; tools take `--run-root` or `--contract`,
    and a missing one or two candidates fails by name; drifted `bindings` are **stale**, and release refuses
    (`scripts/lib/canonical.mjs`). A group's contract is canonical only at **exactly** `<group.dossier>/visual.contract.json`
    (a regular file — a symlink, a copy, `attempts/` are not).

## Stop conditions

- The source has no clear reuse rights and the task is a **release** → stop, ask Lee.
- Host disk < 5 GB → Docker dies silently (gotcha 4); clean up first.
- Several agents writing the same package → stage with your own file list (gotcha 20).

Traps already hit: [`references/gotchas.md`](references/gotchas.md), read through [`references/lessons.md`](references/lessons.md)
(gotcha N is lesson L-0NN). Plugin docs: [`README.md`](../../README.md) · [`AGENTS.md`](../../AGENTS.md) ·
[`INSTALL.md`](../../INSTALL.md) · [`NOTICE.md`](../../NOTICE.md).
