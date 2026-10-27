# ADR 0017 — The GitHub release is the source of truth for a quickstart, and it declares itself with `tracy_setting.json`

- **Date**: 2026-09-15
- **Status**: binding
- **Decided by**: Lee (session `ops/cms`, 15/09/2026 — *"I want to take the GitHub release as the standard"*)
- **Related**: [ADR 0006](0006-plugins-as-pinned-subtrees.md) (no dependency points
  at live GitHub — §Consequences says why this case is different) · [ADR 0008](0008-mode-config-ships-in-the-image.md)
  (configuration Tracy tunes reaches customers through the image) · D36, D37, D38 in
  [`tasks/emdash-northgate/DECISIONS.md`](../../tasks/emdash-northgate/DECISIONS.md)

## Context

A quickstart — the pre-built site a customer's new site starts from — lives in **two places** at
once, and nothing forces those two places to match:

1. **The release on `JoomlArt-Products/ja-products`**: where the publisher presses the button, attaches the zip, dump,
   manifest. Measured 15/09: **85 releases**.
2. **`provision/quickstarts.json` in git** (plus a copy in `apps/tracy-web/src/`): four
   hand-copied entries of URL + sha256 + asset id for four releases.

Tracy **reads only the second place**. Consequences measured in the same afternoon:

- Lee released `tracy-business/emdash` 1.0.0 on GitHub on 14/09; by 15/09 it was "not in the
  system yet" — because nobody had done the hand-copy step. The question that opened this session was exactly that one.
- The opposite direction is worse: `quickstarts.json` on `develop` pins `tracy-apple/j6` version **1.2.0** with
  `tracy-apple-j6-webroot-1.2.0.tar.gz` and `-database-1.2.0.sql.gz`. The release **does not have** those two files
  (the asset list only goes up to 1.1.0; the 1.2.0 URL returns 404; scanning all 85 releases finds no `webroot-1.2.0`).
  It came in with `36f88b07f`, 13/09 02:22. `tracy-apple/j6` is **Joomla's default base**, so every Joomla
  site creation on dev that takes that path dies at download — and no gate went red, because no gate compares the
  file in git with what GitHub actually has.
- 78 `quickstart/ja-*` releases have no entry at all: to Tracy they do not exist, even right after someone
  has just released one.

Hand-copying between two sources is not a lack of discipline; it is something **nobody can check**. Each entry
is ten lines of transcription (file name, byte count, 64 hex characters, asset id), and its mistakes show up
all the way out on the fleet host, in the middle of a customer's provision, as a 404 in a shell script.

A third way of reading was rejected: **reading the release's `manifest.json`**. The six existing manifests are
**three different shapes** under the same `schemaVersion: tracy-quickstart/v1` (EmDash: `artifact`+`state`;
Joomla: `artifact`+`archive`+`runtime`+`cowork`; WordPress: `webroot`+`database`+`assets[]`+`id`),
plus the QA skill's `gates`/`receipts` — which nobody installs from. Getting three release tools to agree on one
shape is a long negotiation, and once done Tracy would still be reading a file **someone else owns**.

## Decision

1. **The source of truth for a quickstart is the release on `ja-products`.** Tracy reads the release list through
   the already-installed GitHub App, stores it in the `quickstart_releases` table, and refreshes at boot · every 10 minutes ·
   on the `release` webhook · on the Refresh button in `/ops`. `quickstarts.json` (both copies) is **deleted**.

2. **Each release declares itself with `tracy_setting.json`** — Tracy's file, next to the zip, small:
   `platform · label · version · cms · install{…} · template? · languages? · card?`. Tracy does not read
   `manifest.json`, `SHA256SUMS`, `VERIFICATION.json`; the publisher keeps them as they are.

3. **`install` declares files of THAT release itself, with sha256, and without a URL.** The download address is built
   from tag + file name. Each file name is checked against the release's **real asset list** before a
   quickstart is listed as usable — this is exactly the gate that the 1.2.0 bug above would not get past.

4. **Two install shapes for PHP CMSs, not one** (measured 15/09): `webroot + database` (a captured site —
   `tracy-apple/j6`, `tracy-business/j6`) **or** `bundle` (an Akeeba zip restored by Kickstart —
   `tracy-base/j6` and **all 78 `quickstart/ja-*`**). EmDash has one shape: `source + state`. Half of
   one shape plus half of the other is **no shape at all** — not "one file missing" — and the message says exactly
   that.

5. **The questionnaire travels with the release in `tracy_site_question.json`**, in the same `tracy-questions/v1` shape as
   the Build plugin's `questions.json`. No file → the site is asked the CMS's default set. Changing the
   questionnaire does not require re-releasing the quickstart: attach a 3 KB file over the old one.

6. **On a server, the questionnaire is CHOSEN, not overwritten.** Each quickstart has a list of candidates:
   `Released <version>` (each new question file on GitHub **adds** a candidate, it does not replace the one
   in use), the server's own version (written by an admin, usually copied from a candidate), and `Standard <CMS>`. The
   server's version can be downloaded as `tracy_site_question.json` to attach to the release — the path for a
   local edit to become the standard for every server.

7. **Three status axes, three columns, three owners**: `kind` (quickstart · design pack — the tag/manifest says) ·
   `github` (published · prerelease · draft — GitHub says) · `tracy` (ready · no-setting · invalid —
   Tracy's validator says). Merging them into one column hides who is answering which question. A release without the
   file **is still listed** with the reason; hiding it makes the list read as if it were complete.

8. **No Tracy tool uploads to a release by itself.** `scripts/tracy-setting.mjs` drafts the file and then prints
   the `gh release upload` command for a person to run.

9. **The contract does NOT go into `tracy_setting.json`** (addendum 15/09, after the merge with `develop`).
   Which contract seals a quickstart is something **this repo** knows, not something the release publisher
   declares: each profile's `manifest.json` already says which
   `quickstart.release` + `quickstart.version` it seals. `apps/tracy-web/src/lib/contracts.js` builds an index
   from that; the hand-copied `contract`/`coworkMinVersion` fields in `quickstarts.json` are **deleted**, together with
   `sites/quickstarts.js`. The site-creation door accepts a quickstart on exactly two grounds: **it has a sealed
   contract**, or **it is a template card** (installed as released, not sealed — Lee decided
   15/09). The case in between — readable, installable, sealed by nobody — is refused, because it is a site where
   the Claude Cowork plugin would be allowed to write structure. The `contracts` gate guards that index.

   ⚠ **Joomla-via-design-plan is unchanged**: a site built from a design inspiration is bound by the
   `contractProfile` that `design-templates.json` declares for that design, resolved on the fleet by
   `design-plan.py`. Evidence for why the two paths are not merged: `tracy-airbnb/j6` has two profiles but
   **no quickstart release at all** — Airbnb is a design installed on top of the Apple base.

10. **Unreleased packs, local stand only** (addendum 26/09, Lucas). `TRACY_LOCAL_RELEASES_DIR`
    points to a `<slug>/<cms>/` folder holding exactly the files a release would hold; each pack becomes a
    `quickstart_releases` row tagged `local/<slug>/<cms>`, goes through the same validator, and installs from `file://`, which
    `quickstart.py` only accepts when it is inside that folder. The pack's card is a **separate** card
    (`local-<template>`, label "(local)"), it does not replace the released card; it is sealed by the release the
    pack will become. Both apps refuse to boot with this variable on a server. This is not a second
    source: it is a release **not yet cut**, to be tried before cutting. How to use it:
    [`running-tracy-locally.md` §7.5](../references/running-tracy-locally.md).

## Consequences

- **ADR 0006 is not violated.** The rule there — "no dependency points at live GitHub" — is about
  **code built into the product**: a `dependency` pointing at a GitHub branch makes today's build differ from
  yesterday's. A quickstart is **runtime data**, it goes into no bundle; and it is still pinned —
  pinned by the sha256 in `tracy_setting.json`, checked at download. What is live is *the list of which
  quickstarts exist*, which is exactly what should be live.
- **GitHub going down does not take Tracy down.** The last read is in the DB; the page renders with "as of <time>", and the
  site-creation door can still use the entries already read.
- **Two holes disappear at once**: a new release appears by itself (no more hand-copy step), and an
  entry pointing at a file that does not exist cannot exist (the validator compares against the asset list).
- **`/ops/cms` has a Quickstarts page** — the unit is the release, the CMS is a tab and a column. The *Default
  build base* and *Default questions* fields move here.
- **The fleet does not change how it installs**: `tracy-web` sends the resolved entry down to the host, the host writes a temporary
  file and points `TRACY_QUICKSTARTS_JSON` at it — `quickstart.py` stays as is.
- **The `sites` table records provenance**: which tag, which version, which sha this site was built from.
- **The cost**: Tracy depends on the GitHub API for an admin screen, and every release has to carry one extra
  file. In exchange, two places become one place, and a class of silent errors becomes a sentence in English.

## Acceptance

- `node scripts/tracy-setting.mjs check <tag>` is green for Tracy's 5 releases.
- `/ops/cms/quickstarts` lists exactly the 85 releases that `gh release list` lists, each row with three statuses.
- `grep -rn quickstarts.json` only finds it in documentation and `tasks/`.
- Block network access to GitHub: the page still renders the last read, site creation still works.

## Addendum 29/09/2026

`provision/quickstarts.json` (and its copy in `apps/tracy-web/src/`) **is not fully deleted**: it is still where the repo pins the Claude Cowork plugin for each quickstart (`cowork` — file, sha256, bytes, url, `contractFiles`), `apps/tracy-web/src/lib/contracts.js` `coworkPinFor` reads it, and the `contracts` gate compares the profile hash inside the pinned zip. The quickstart list is exactly as decided above: read from releases. The hand-copied `contract`/`coworkMinVersion` part has been deleted; the plugin-pin part stays on purpose (memory `wp-contract-pins-live-in-repo`: changing the shape of `tracy_setting.json` on a release makes every older deployment reject the whole release).
