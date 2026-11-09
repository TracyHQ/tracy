# Fault codes met while readying a template, and their generic fixes

Each section is one fault family: the **code** a checker prints, the **symptom**, how to **confirm** it, the **fix**, and
how to **check the layout did not change**. The fix is generic; the template named in an example is only where it was
met first (JA Voyara 1.0.12, the run that wrote this page). The index from code to section is
[`fix-map.md`](fix-map.md) section 2.

`QC` is the `quickstart-contract` skill. `--replace` edits are row edits of the demo database in
`packages/design/tracy-ds-slot/scripts/release-joomla.mjs` (`src/release-content-edits.mjs`; a JSON pair edit may add one
setting with `adds: true`, and a path may hold `/`).

The usual layout check after a fix in the demo content or the template: shoot the changed pages again
([`eye-review.md`](eye-review.md), 1440 and 390) and compare them with the shots before the fix; the content coverage
audit's `article layouts checked N, not served 0` line and the demo measures (`demo-measures-clean`) must not get worse.

## F1. An article page does not serve the layout the article asks for

- **Code**: `layout-not-served` in `pages.failures` of `content-coverage.json`; the Content coverage piece reads
  `coverage-holes` with `incomplete: "N measure failures: layout-not-served N"`. The audit log prints
  `layout not served <layout> <url>`.
- **Symptom**: a page meant to print a special article layout (a tour page with its booking box, gallery and plan)
  prints the plain article layout. The live demo can show the same fault, so "it looks like the demo" proves nothing.
- **Confirm**: open one listed page; the body classes and markup are those of the default layout. Read the article's
  `attribs.article_layout` and the menu item's `params.article_layout`. Joomla 6.1 merges an article's own params only
  for the keys whose menu value is `use_article` (core `ArticleModel`); a template written for Joomla 4 or 5 expects the
  article to win always.
- **Fix**: first door, a demo row edit in the next cut: on every menu item that opens such articles, add
  `"article_layout":"use_article"` to `params` (`--replace` with `adds: true`). The template source stays as it is; the
  default that should ship in the template goes on the next template version's list.
- **Layout check**: the audit line says `not served 0`; shoot the pages that changed layout and run the eye review on
  them (they now print new blocks, so their kit blocks, lists and looks are new work: rebuild the kit,
  [`kit-rebuild.md`](kit-rebuild.md)).

## F2. A link the demo renders leads nowhere

- **Code**: `dead-link` in `pages.failures`; the log prints `dead link <status> <url>` and
  `links checked N, dead M`. Read as `coverage-holes` with `incomplete` naming `dead-link`.
- **Symptom**: a button or menu link answers 404 (JA Voyara: `/pages/contact` without `index.php`, links to a removed
  `/all-destinations`).
- **Confirm**: the failure entry names the address and the pages that show it; open it on the stand.
- **Fix**: no door hides a dead link on a customer site, so fix the demo content in the next cut: a `--replace` row edit
  of the module param, menu link or article text that holds the address (keep the edit's match count). A link written
  in a template file (a breadcrumb) is a template fix. Unpublished menu items are not pages a visitor sees: capture
  with `--skip-unpublished-menu-pages` rather than publishing them.
- **Layout check**: the edited module or article shows the same words and button; only the address changed.

## F3. A measure failure that is not a page

- **Code**: `module-boxes-not-read` (the label judge could not read a page's module boxes) and `page-not-rendered` (the
  page itself failed) in `pages.failures`. A file written before audit 1.8.0 has no codes and reads
  `N pages did not render` for every kind.
- **Symptom**: `pages.failed` is above 0 while every page answered 200.
- **Confirm**: read `pages.failures[].code` and `error`. A timeout under a loaded machine is not a site fault.
- **Fix**: run the audit again when the machine is idle. If the site did not change since the last crawl, use
  `--reclassify` (F12) instead of a new crawl. Whether a module boxes failure should hold at all is owned by the
  module boxes reader (`content-coverage/lib/verify/module-boxes.mjs`); do not edit the coverage file by hand.
- **Layout check**: none (nothing changes on the site).

## F4. Label judge verdicts given without looking at the crops

- **Code**: `record-judge.mjs` refuses the file: `<crop>: not opened (no "crops" entry)`,
  `"seen" must say in a few words what the crop shows`, `"seen" repeats the words given for <crop>`. A verdict in the
  audit's own cache that a person overrules needs `record-judge.mjs --overrule <file> --coverage <file>` with a reason
  of 12 characters or more per key.
- **Symptom**: a helper writes all-right answers with a small script; the `seen` lines are copies.
- **Confirm**: by eye only, partly: open a random sample of crops and compare with the `seen` line. A random check that
  finds wrong verdicts (JA Voyara: 16 percent) means the whole set is judged again, every crop opened.
- **Fix**: brief helpers that every crop is opened and each `seen` line is written for that crop; split the request
  (at most two helpers at a time). Merge with overrides only when a settled decision says so, each with its reason.
- **Layout check**: none.

## F5. A release verify that is green on an empty site

- **Code**: `VERIFICATION.json` `problems`: `the restored version shows the CMS installer, not the site`,
  `the home page links no menu page: nothing was checked`; `stand.mjs` refuses a Docker engine on another machine
  (`the Docker engine is at <endpoint>, not on this machine`).
- **Symptom**: verify says equal on every count, but both stands serve the Joomla installer: the engine ran on another
  machine and the bind mounted folder was empty there.
- **Confirm**: open the stand's home page; check `docker context ls` and `DOCKER_HOST`.
- **Fix**: run the stand on the machine whose engine runs it (copy the repository and the pack there) or switch to a
  local context. Never accept a verify whose page count is 0.
- **Layout check**: the verify's pages line says `N/N answer 200, N/N as released` with N above 0.

## F6. The reach graph says a page is reached or not

- **Code**: `reach.mjs` output `pages, reached, unreached`; an accept "shown only on pages a visitor cannot reach" reads
  it. Kit error `unreached-content` names content no listing reaches.
- **Symptom**: a page counted reached through a link the customer site never shows, or the reverse after a showcase
  decision changes which menu entries stay.
- **Confirm**: the reach graph counts every link occurrence (not links merged by address); a container link is inert
  only when it leads to a stock screen (F10). Rerun `reach.mjs` after every showcase decision or kit change.
- **Fix**: never accept a hole as "hidden" on a page a visitor can reach. Make the page a stock screen (F10), hide its
  links through `hiddenPageLinks`, or fix the hole. `unreached-content` from a blog list without a pager is a
  template fault (F11).
- **Layout check**: none for a declaration; the eye review for a template fix.

## F7. Hand-declared kit fields lost by a rebuild

- **Code**: `kit-hidden-field-missing` (the verdict, `fields` names each) after a kit `build` or `assemble`.
- **Fix**: [`kit-rebuild.md`](kit-rebuild.md) (build into the folder that holds the kit, or save and replay). Page
  group fields such as `representative` are carried by the assemble step itself: if a rebuild drops them, that is a
  tool fault of `template-kit` assemble, fixed there test first.
- **Layout check**: none (declarations only).

## F8. Slot groups that pass one gate and fail another

- **Code**: the slot roles gate (`pnpm exec tsx scripts/check-all.ts --only slot-roles`):
  `group "<id>" (service) lacks ... offering.name`; the label rules: `label-rule-R4 <count>` (one group per item of an
  indexed repeat) from `content-coverage/label-rules-check.mjs`, and `labelRules.failing.R4` in a measured file.
- **Symptom**: the indexed feature lines of an offering ("What's included" rows) were given one `service` group per
  line (slot roles red), then moved into the offering's own group (R4 red on every line).
- **Fix**: the approved shape (JA Kinetic 1.0.11 feature rows): one `claim` group per line, item = the line's index,
  role `package.feature_item`. Keyed rows (not an indexed array) may stay in the offering's own group.
- **Order**: after any change of roles or groups, run both static gates BEFORE a measure:
  `node packages/cms/tracy-quickstart-tools/content-coverage/label-rules-check.mjs --contract "$CONTRACT"`
  (add `--findings <last findings.json>` for R8 and R9) and `check-all --only slot-roles`. Both at 0, then measure.
  Any group change voids the label judge verdicts of the moved slots (their hash holds the group).
- **Layout check**: none (the map only).

## F9. A button loses its shape under a design system

- **Code**: design system readiness rule `BTN-1` (`scripts/template-design-system-readiness.mjs` on the pack, from the
  release's `design-system-measurement.json`).
- **Symptom**: under one system's dark side a band's button fill is the page surface colour, almost the band's colour
  (JA Voyara: the tour booking band's white pill, 1.07 to 1).
- **Confirm**: the measurement names counts per view, not selectors: find the views' pages, then the button the
  template's stylesheet fills with a surface role on a band role.
- **Fix**: in the Tracy slot contract of the template (`packages/design/tracy-ds-slot/templates/<template>.json`), a
  `followRules` entry for that button at rest and on hover: fill with the band's on colour, text in the band colour.
  Not for a kept band (the band machine paints its buttons). Test first with a contract test that computes the
  contrast under the failing system; then measure the preview again (`release-measure.mjs`).
- **Layout check**: the light side keeps its contrast; shoot the button under the failing system, both sides.

## F10. Demo screens no customer plan keeps

- **Code**: coverage holes on pages such as writer profiles, typography samples or an archive (`coverage-holes`, the
  holes' pages), and their links counted reached (F6).
- **Fix**: declare them with `template-kit/cli.mjs stock-screens --kit <template-kit.json> --path '<path>' --why '<reason>'` (a path may end with
  `/*`): every plan drops them, reach makes container links to them inert, and their holes may be accepted as on a page
  no visitor reaches. A page a customer may keep is never a stock screen.
- **Layout check**: none (declarations only).

## F11. Faults only the template's next version can fix

Write each on the template's next version list and accept it with its reason in this one; never edit the template for
a fault the flow has a door for. Detection per fault:

| Fault | Code or check |
|---|---|
| A stylesheet rule hides the article title, or a layout prints the page title as `h2` | demo measures warning `no main heading` (a person's eye); `demo-main-heading` when more than one |
| Words or a picture written straight into a layout file | coverage hole of class `template` (`b`) on that page |
| A backup copy of a table in the demo database | `release-stray-table: <names>` in the cut's log |
| Demo tags without a path | the capture stops (one identity matching several rows); the cut repairs the paths itself (`src/release-tag-paths.mjs`) |
| Tag pages that list no item although the tag map holds rows | kit errors of list min on the tag pages; confirm with a query on the tag map's `core_content_id` |
| A phone printed without a `tel:` link | kit self-check `phoneNotCallable` |
| A blog list without a pager | kit error `unreached-content` |
| No free block for the head injection on every page | kit error on the head injection position |

## F12. A measure that takes an hour

- **Code**: `coverage-stale` (the map or lock changed after the measure).
- **Fix**: when the site did not change since the last crawl (only the contract's roles, groups or accepts did),
  run the audit with `--reclassify` on a copy of the last output folder: it rebuilds from `findings.json` with no crawl,
  then runs `--fit`, the module boxes and the label judge. A new cut means a new crawl. Run the static gates (F8)
  before either.

## F13. A logo spot nobody can set

- **Code**: `kit-logo-unsettable` (a shown logo spot with neither a setting nor a frame), then `kit-brand-unreadable`
  (the brand step refuses the kit).
- **Fix**: a T4 block layout that prints the site logo setting is a place of that setting (`template-kit` site logos);
  a spot the site profile writes needs no content map frame. Both are tool fixes, test first, in this repository.

## F14. A gate that reads the base branch

- **Code**: the `language-policy` job stays red on a policy edit inside the same PR.
- **Fix**: the job runs the checker and policy from the base commit: put the policy edit in its own PR, merge it first,
  then rerun the job. The policy names objects by id: recompute the ids after any change of those files.

## F15. A demo update fails downloading the Cowork plugin from a release download URL

- **Code**: the demo update's failed answer on /ops, read by `failureReason` (`apps/tracy-web/src/lib/demo-sites.js`):
  `download failed: The requested URL returned error: 504` (or another sticky 5xx) on a release asset URL of the form
  `https://github.com/<org>/<repo>/releases/download/<tag>/<file>`. Offline detector: none for the host itself (it is a
  server fact); the printed line is the code, and the readiness proof is `scripts/test/red-codes.test.mjs`.
- **Symptom**: the demo update stops while fetching a plugin or profile package; the same asset downloads fine through
  the API. The fault is the route, not the release.
- **Confirm**: ask the same asset twice, once by its download URL and once by
  `https://api.github.com/repos/<org>/<repo>/releases/assets/<id>` with header `Accept: application/octet-stream`. A 5xx on
  the first and a 200 on the second confirms it.
- **Fix**: a tool fix, never a template or demo fix: every download the provisioner makes takes the API road when the
  plain URL answers 5xx (#491 for the package, #493 for the profile). Do not pin a different release to get past it.
- **Layout check**: none (nothing on the site changes).

## F16. A demo update fails with "contract profile ... not on disk"

- **Code**: `!! contract profile <id>: not on disk` in the provision log, shown on /ops through `failureReason`. A fixed
  host prints the cause first: `!! contract-fetch: profile <id> could not be put on disk: <why>`.
- **Symptom**: the update dies at the profile step. The older provisioner tried the fetch once for 15 s, so a slow or 5xx
  answer ended the run with a line that named no reason.
- **Confirm**: read the log lines above the "not on disk" line for a `contract-fetch:` reason. No such line means the host
  runs the old provisioner. A reason that names a 5xx is F15.
- **Fix**: a tool fix (#493: 120 s window, the API road of F15, the real reason surfaced); update the host's provisioner,
  then run the demo update again. Never edit the contract or hand-copy the profile onto the host.
- **Layout check**: none.

## F17. A captured template kit that quotes Vietnamese text turns the language policy job red

- **Code**: `language-policy` job, finding `Vietnamese text in captured content` at a line of
  `packages/cms/tracy-joomla-quickstart/contracts/<template>/<ver>/template-kit.json`. Offline detector: `checkRange` of
  `scripts/check-language-policy.mjs` on the branch (it scans blobs up to 100 MB, so a large kit is no longer a finding by
  size).
- **Symptom**: a PR that adds a kit whose captured demo text names a local place in Vietnamese (an article about a cafe, for
  example) goes red. Other accents (Latin, Nordic, Spanish) pass: under the `captured` class the keys follow the full
  English rule and string values are refused only for Vietnamese letters. A rerun stays red because the job reads the
  checker and the policy from the base commit (F14).
- **Confirm**: the finding names the line; `sed -n '<line>p' <kit>` shows the quoted text.
- **Fix**: first an exact line allowance PR on `develop` alone: one `lines` entry in `scripts/language-policy.json` with the
  kit `path`, the `sha256` of that exact line and a reason (verbatim third-party demo text, reviewed). Merge it. Then merge
  `develop` into the kit branch (not rebase: a rebase breaks the commit refs of regression cases) and push; a rerun alone
  reuses the old base. A line edited later has a new digest and needs a new entry.
- **Layout check**: none (a policy entry only).

## F18. A release accepted with no demo baseline

- **Code**: `demo-baseline-missing` in the verdict's `demo-baseline` piece, read as `warn` on a release already shown
  on Design inspiration; Road to live on /ops stays green, because its Template kit step asks for the file
  (`kit-demo-baseline-missing`) only for the tags in `apps/tracy-web/src/lib/template-kit/demo-baseline-policy.json`.
- **Symptom**: the template passed acceptance, yet the site check and the write step bench cannot tell demo words from
  the customer's words on its sites. Met on JA Voyara 1.0.12: /ops 11 of 11 green, no `demo-baseline.json` beside
  `contracts/ja-voyara/j6/1.0.12/`, while JA Boxing 1.0.11 and JA Diner 1.0.5 had one.
- **Confirm**: `ls <contract dir>/demo-baseline.json`, or the verdict JSON's `demo-baseline` piece is not `done`.
- **Fix**: no new template version. Restore the pinned version on a fresh stand nobody writes to, check the two asset
  hashes against the pin, then `WRITE_BENCH_BASELINE_DIR=<dir> node apps/tracy-web/scripts/site-check-baseline.mjs
  --base <stand address> --version <contract id> --pages-file <the kit's pages[].path as JSON>` and
  `node packages/cms/tracy-quickstart-tools/template-kit/cli.mjs baseline --from <dir>/<contract id with / as _>.json
  --contract <contract dir>`. Commit the file, then add the tag to `holdPublishFor` in the policy file with its reason, so
  /ops holds the next version too. The file is not one of the cowork `contractFiles` (manifest, content map,
  presentation lock, showcase map), so no claude-cowork release is needed.
- **Check**: the verdict's `demo-baseline` piece reads `done` `demo-baseline-recorded`, and the baseline line reports no
  page the host could not reach. Nothing on the site changes, so no layout check is needed.

## F19. Road to live shows "Design system ... not checked" after a release went live or a pin changed

- **Code**: /ops Design system step reads `Not checked` (or an error) for the new version, or shows the old version or an
  old `checkedAt`. Offline detector: none (a server fact); the proof is the step on /ops itself.
- **Symptom**: the release is live and `tracy_setting.json` is pinned, yet the step has not run for it. GitHub sends Tracy
  no event for asset uploads, so nothing starts the checks.
- **Confirm**: open /ops and read the Design system step: version and `checkedAt`.
- **Fix**: press Refresh on /ops/cms quickstarts (`POST /api/ops/quickstarts/refresh`), wait about 2 minutes, then press
  Check again on the step if it still reads `Not checked` or an error. Never edit the release to force it.
- **Layout check**: none.
