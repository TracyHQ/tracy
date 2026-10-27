---
description: A template may be Published only when it passes the Template Customization Question Readiness check ("what the website must achieve" after Customize your site); the check is a static check (reads existing data, builds no site), /ops runs and scores it, a skill lets an admin fix and re-release; real tests only serve to find new rules; not a CI gate
sources:
  - tasks/spec-template-customization-question-readiness.md
  - tasks/plan-ten-logo-favicon.md
  - apps/tracy-web/src/lib/admin-attention.js
  - apps/tracy-web/src/lib/quickstart-capabilities.js
  - apps/tracy-web/src/lib/site-pages-schema.mjs
---

# 0029 — The Template Customization Question Readiness check: static check, /ops scores, a skill fixes

**Status:** (binding) · 09/10/2026 · Akemi (PO) decided, Claude wrote it. Execution spec:
[`tasks/spec-template-customization-question-readiness.md`](../../tasks/spec-template-customization-question-readiness.md).

**Council not consulted** ([`ask-the-council.md`](../references/ask-the-council.md) §4): the machine that wrote
this ADR (Akemi's Mac mini) does not have `claude-council` and the Codex CLI installed. There is no
second view besides Claude.

## Context

The 7-question "Customize your site" round (issue #1013) had 24 fixes in two days, 07/10 and 08/10: 9
tch PRs, 11 plugin versions, 4 EmDash template versions. About 27 of the 45 bugs customers saw were
regressions in places already fixed. Almost every bug only surfaced when inspected by hand on dev after
merging. None of the three existing layers of automated checks looks at the result:

1. The "N/7 questions working" figure on /ops (`admin-attention.js`, `questionnaireAnalysis`) reads a
   static declaration table (`quickstart-capabilities.js`) and measures no site.
2. A release's `VERIFICATION.json` compares the packaged build with the original demo, not with the
   site the customer receives.
3. The PRs' regression tests run against fake doors.

## Decision

1. **There is one standard for "what the website must achieve"** after going through Customize your
   site. Akemi approved each item on 08/10 and 09/10: 29 items belong to the template (after moving
   LANG-4 and STAB-3 to Tracy). Each item is written as the result a visitor sees, grouped by part of the
   website. General rule: for each question the customer answers, the website follows that answer; for
   each question left blank, that part stays as in the template.
2. **Check only the template's part.** Each item states what the template must provide (the page list
   file, the template profile row, a field in the contract, the theme). The rest is Tracy code's job; a
   failure there is a Tracy bug, fixed and tested in tch. Three items that belong only to the platform
   (all 7 questions present, no pages hidden automatically outside the Pages question, rollback when it
   fails midway) are not part of the Template Customization Question Readiness check.
3. **Static check.** The check reads existing data without building a site: the release's assets, the
   template package, the contract in tch, `template-profiles.json`, the theme code. Building a real site
   is only for finding new rules.
4. **/ops is the judge.** The check lives in `apps/tracy-web`; /ops runs it by itself on the release
   itself and shows only "Pass" or "Not passed, N items left". The Publish button is locked until it
   passes. A template already live that later fails is only flagged (T35, decisions 1A and 2A on 08/10).
   The 7/7 declaration table is replaced by the check's results.
5. **The admin skill is the fixer.** The skill lives in the tracy-dev plugin, asks /ops which items
   failed, fixes them, re-releases, then asks again until it passes. The skill keeps no rule set of its
   own. It can fix all three places: the template package (`ja-products`), the contract and profile
   (`tch`, through a PR), the plugin (`claude-cowork`). A plugin fix requires re-checking the other
   templates on the same platform before releasing.
6. **No separate CI gate** for the check: templates live in another repo and do not go through tch's
   CI. PRs into tch still run the existing CI.
7. **A bug that slips past the check gets a rule that catches it first, then the fix.**
8. **Order and scope of this phase** (Akemi, 09/10): turn the check into code (run on the machine) with
   two fixed answer sets, finish all the work on Tracy's side, then make a golden template for each
   platform 100% clean, then check and fix every published template. Items 4 and 5 (the check on /ops,
   the skill) are a **later phase**; "Pass" on /ops then covers both the file read passing and a trial
   build passing. No work on automatically rebuilding golden templates to watch for regressions: whoever
   causes a new bug fixes it.

## Consequences

- The work backlog of the 7-question round comes from the check's results, not from manual inspection.
- An item that static data cannot decide is marked "only a real test can tell" in the spec, noting any
  partial static signal.
- The golden template (JA Essence Joomla is nominated) is a template that passes the whole check; it is
  the acceptance test for the check itself, together with the bugs already seen.
- Left for a later round: the website on phones; tracking codes and admin accounts of the demo build;
  multiple languages.
