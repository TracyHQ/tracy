---
description: A template may be Published only when it passes the Template Design System Readiness suite (TDSR, the template declares the design system to standard) — the static check is a cheap, diagnostic gate, measurements on a built site (a separate measuring machine pushes them up through an authenticated receiving door) decide pass/fail at the Design system step of Road to live, the tdsr skill lets an agent fix and re-release; copies the Customize your site suite exactly (ADR 0029); a missing slot contract only warns; revised 13/10/2026
sources:
  - tasks/spec-template-design-system-readiness.md
  - docs/adr/0029-template-customization-question-readiness.md
  - apps/tracy-web/src/lib/template-design-system-readiness/index.js
  - apps/tracy-web/src/lib/design-system-readiness.js
  - apps/tracy-web/src/lib/road-to-live.js
  - packages/design/tracy-ds-slot/README.md
---

# 0031 — The Template Design System Readiness suite: static check, /ops scores, skill fixes

**Status:** (binding) · 12/10/2026 · David decided ("follow it exactly like Site question"), Claude wrote. Enforcing spec:
[`tasks/spec-template-design-system-readiness.md`](../../tasks/spec-template-design-system-readiness.md). Name given by Akemi:
TDSR = Tracy Design System Readiness, paired with TCQR (ADR 0029).

**Council 12/10/2026** ([`ask-the-council.md`](../references/ask-the-council.md)): Codex returned `401 workspace routing discovery
unauthorized` (token revoked, needs `codex login` again on this machine); only local Ollama answered. Ollama advised (1) not to lock
Publish just because a template has no slot contract yet, (2) to separate the scan pass and the table of the two suites. Both were followed (decisions 3, 4).

## Context

The design system slot (`packages/design/tracy-ds-slot`, ADR from the 08–11/10 round) lets a customer press **Design system** and the site wears that system
without going through a model. Each template has a **slot contract** (`templates/<cms>-<slug>.json`: role → selector, palette, `keepScopes`,
`minVersion`/`maxVersion`…) and a release whose stylesheet has been **tokenized** (`var(--ds-c-<role>, <hex>)`). On 12/10 there were 95
contracts, all `ready`. But nothing scored whether a release still "declares to standard":

1. Another line of work re-releases a template from an **untokenized** source (ja-spa, ja-voyara 11/10) — only a manual procedure in the README
   (`maxVersion`) catches it.
2. Every new version needs someone to move `maxVersion`, otherwise the button refuses new sites (`TEMPLATE_VERSION_UNCHECKED`) and /ops says nothing.
3. `ready` is set by per-role probes (h1, button, card…), not by scoring the whole first screen: on WordPress Tracy Business ~90% of the
   1440×900 screen does not change when wearing a system, because the template's self-painted bands are kept as they are (David 12/10: "it's still the old UI").

## Decision

1. **One TDSR suite, copying the TCQR template part by part**: static rules in `apps/tracy-web/src/lib/template-design-system-readiness/`
   (same report shape `{ template, cms, version, tag, results: [{ id, status, message, fix, owner }] }`, same four statuses
   `pass` · `fail` · `live-only` · `not-applicable`, sharing TCQR's release source and archive reader), `rule-severity.json`
   splitting `must-fix` / `worth-fixing`, local run command `scripts/template-design-system-readiness.mjs`.
2. **Static check.** The suite reads the release's files (only the archive holding the stylesheet: Joomla installer/webroot, WordPress theme
   zip, EmDash source zip) and the slot contract the running machine carries, through **the Design system door's own functions**
   (`ds-slot.js` `contractFor`, `templateKeyOf`) and **the very tokenizer** that produced the release. Building a real site (`flow.mjs`,
   `pass-*.mjs`) is only for finding new rules; things only a built site can know are listed as `live-only` with the measuring command.
3. **/ops is the judge, step 5 of Road to live: "Design system · n/m passed"**, right after Customize your site, waiting only on the install
   file (the suite does not read the content contract). Must-fix locks Publish for a template **not yet live** (`DESIGN_SYSTEM_NOT_READY`);
   a template already live only warns (as in ADR 0029 §4, 1A). Must-fix = the customer presses the button and the site breaks / is unreadable, or the customer
   does not press it and the template loses its look. **A missing slot contract (SLOT-1) and an unchecked version (SLOT-2) are only worth-fixing**: the button already
   refuses politely on its own, the template does not break (council).
4. **Separate scan pass and table** (`template_ds_readiness`, migration 099): once per version, rechecked when one of three
   inputs changes — the release's files, the rule set (suite code + `rule-severity.json` + `@tracy/ds-slot` `src/` code), the slot contract **of
   that template itself** (including its `extends` chain). On recheck the old result is kept until the new one arrives. Its own Check again button
   (`POST /api/ops/quickstart/design-system/check`).
5. **The `tdsr` skill is the fixer** (`.agents/skills/tdsr/`): asks the suite, fixes the right place (slot contract via a tch PR; template via
   re-release; WordPress theme via `claude-cowork`), stops before any commit/push/release/upload, then says to press Check again.
   The prompt on /ops names this skill. The skill keeps no copy of the rules of its own.
6. **No separate CI gate** (templates live in another repo), as in ADR 0029 §6.
7. **For any defect that slips through, first add a rule that catches it, then fix** (ADR 0029 §7). BAND-1 is such a rule for the "old UI" defect.

## Consequences

- The first boot after deploy checks the whole batch of releases (95 releases, one at a time, downloading one archive each); meanwhile a release not yet
  live shows "Checking" and its Publish waits.
- Measured 12/10 on the 38 releases that have a card (`tasks/evidence/tdsr-2026-10-12/`): 0 must-fix, 6 clean; BAND-1 failed 27 (bands kept
  as they are — being fixed in PR #1258 with the `bands` key, which the suite reads correctly), CSS-2 failed 13 (literal colours left over,
  needs a template re-release).
- BAND-1 is worth-fixing until the `bands` key reaches `develop`; then it moves to must-fix with just one line in
  `rule-severity.json`.
- The tokenizer's `replaced` counter is not the number of real changes (it also counts replacements that were then undone): the suite counts the
  **increase** in slot reads between before and after. Anyone using `replaced` to decide anything else should know this.

## Revision 13/10/2026

**Status:** SETTLED 13/10/2026 (3 grill rounds, 12 questions; decisions 7–15 below, decision 15 at 20:50 replaces 2, 8, 13, 14; no open points left); waiting on `/to-spec` and
`/to-tickets` · Akemi (PO) decided, Claude wrote. The part above is kept as history; wherever the text below says otherwise, the text below wins. Vocabulary: [`CONTEXT.md`](../../CONTEXT.md) §9. The enforcing spec is still
[`tasks/spec-template-design-system-readiness.md`](../../tasks/spec-template-design-system-readiness.md), now the merge
of David's version (12/10) with the scoring table on the built site; the comparison document
[`tasks/ke-hoach-tdsr-so-sanh-va-hop-nhat.md`](../../tasks/ke-hoach-tdsr-so-sanh-va-hop-nhat.md) has been merged into it.
**Council not consulted** (the machine writing this revision has no Codex installed).

### Why revise

On the same day, 12/10, there were two ways of answering one question: David's seven static rules and Akemi's scoring table on the built site. Compared on
the 38 releases that have a card, the two sides contradicted each other where it mattered: JA Vogue was statically "clean" but the built site failed roles; JA Symphony,
JA Vital were statically only worth-fixing but the built site scored 4/12; Tracy Business WordPress got grade A on the scoring table but the eye saw ~90% of the first screen
unchanged. Three kinds of defect slipped through both: empty logo, Light/Dark button missing, the site's mode out of step with the system. Decision 2 above ("building
a real site is only for finding new rules") left out exactly five things the customer sees.

### Decisions changed

1. **Replaces decision 2 (static check):** the measurement on the built site is the **pass/fail** on /ops. The seven static rules stay as the
   cheap gate run first and as the diagnosis of where to fix; BAND-1 becomes the "which band" diagnosis, the gate for "the first screen is still the old UI" is
   SCREEN-1, measured by first-screen area. CSS-2 counts only stylesheets the customer page actually loads.
2. **(The measuring-machine and receiving-door part was replaced by decision 15, 13/10 20:50; kept as history. The part where /ops shows five measured rules and "not measured" is not recorded as a pass still stands.)** Added to decisions 3 and 4 (/ops, table): a separate measuring machine (with Docker and Chromium, one stand at a time; from grill round
   2 it is the server `prod-2-runner-dev`, the iMac measures only the bootstrap pass, see decisions 13 and 14) builds the site from exactly the release being published, runs `flow.mjs`, then pushes the result up to tracy-web through an **authenticated
   receiving door specific to the machine**, writing into `template_ds_readiness` for the exact `(tag, version)`. The door **rejects** a result whose version
   does not match the release being published. /ops shows five measured rules (ROLE-1, SCREEN-1, CON-1, UNDO-1, FONT-1) with real measurements; with no
   measurement yet it says "not measured", not pass. The dev server has no Docker; TCQR O3 "Trial build" is not done, do not wait for it.
3. **Reverse the Light/Dark button policy:** hiding the button when wearing a system is a **bug**, not "one system is one look". Every system carries a mode
   label (light / dark / mixed, from the library's Theme filter); wearing a system puts the original palette into the template's mode of the same kind and generates
   the other mode with `derive(profile, mode)`; the button still shows. If the generated side fails contrast, that side is not served.
4. **New rules:** IDENT-1 (logo/brand mark has content and size, by default and when wearing a system), MODE-1 (background lightness matches the system's dark
   flag), MODE-2 (the Light/Dark button remains and the second mode follows the system). FONT-1 scored from `fontsLoaded`, SCREEN-1 from `left.first`,
   ROLE-1 has a `follows` floor. Provisional thresholds: `left.first` ≤ 15%, `follows` ≥ 85%, contrast "no worse than the original template" with 3:1
   for buttons warning only; review after the first scan pass on the measuring machine.
5. **Groups:** ROLE-1, CON-1, UNDO-1 must-fix immediately; SCREEN-1, IDENT-1 worth-fixing until the first green scan pass, then up to must-fix
   (decision 11 revises this point: round 1 put IDENT-1 as must-fix immediately); FONT-1 reviewed at the same milestone; MODE-1, MODE-2 switched on when the
   mode-generation step reaches `develop`. Changing groups is still only through `rule-severity.json`.
6. **Definition of done for a template:** static green **and** built site green in both modes on exactly the release being published, with the measurements
   already on /ops. The `tdsr` skill closes the loop on this condition. Decisions 1, 5, 6, 7 above stay unchanged.
7. **Standard measuring system set** (grill round 1, 13/10): `od:bmw`, `od:stripe`, `od:spotify`, `refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0`
   (Moxie), two light two dark, recorded in the measuring machine's config; Moxie replaces Vercel from the 13/10 scan pass.
8. **(No longer in scope per decision 15: there is no receiving door; kept as history.)** The receiving door authenticates with HMAC following the `signHostCall` template (`apps/tracy-web/src/host/client.js`): timestamp + nonce, signing the whole
   body; each measuring machine has its own secret; results are recorded with the machine name and the version measured. No static token, no human session.
9. **Road to live draws measured rules in the same list as static rules;** a measured rule has a sub-line "Measured on <version>, <date>, <machine>", not yet measured
   is "Not measured yet" and does not count as a pass; grade A/B/C is the summary word at the head of the line; evidence images are a small link beside the rule.
10. **Done per mode:** the system's original mode passes every measured rule; the generated mode only needs no must-fix (CON-1, IDENT-1). Raised to
    "both pass everything" later, by changing rule groups in `rule-severity.json`; clarifies decision 6.
11. **"Not measured yet" does not lock Publish, in two phases** (grill round 2, 13/10): phase 1, an unmeasured release shows grade C and a
    warning, Publish open. The phase-change milestone is **the first green scan pass** (the measuring machine has measured every line being published, none failing
    must-fix): then SCREEN-1 and IDENT-1 go up to must-fix in `rule-severity.json`, and from then on an unmeasured release is locked from Publish as if
    it failed must-fix. Reason: locking before a server-side measuring machine exists would block every new release with a measurement nobody can run.
    IDENT-1 goes in the same phase as SCREEN-1 because both are measured rules on the built site (settled 13/10 18:00 for consistency).
12. **Wearing a system switches the page immediately to the system's original mode** (grill round 2): the template's Light/Dark button remains and pressing it goes to
    the generated mode; the site's default mode is stored with the system being worn; taking the system off restores the previous default mode (UNDO-1 measures the mode too).
    Clarifies decision 3 above: "puts the original palette into the template's mode of the same kind" means the page **switches to** that mode immediately,
    without waiting for the customer to press.
13. **(Replaced by decision 15, 13/10 20:50; kept as history.)** Measure on events and on the server side (grill round 2, with Akemi's note: never measure on her machine): no
    nightly scan pass. A deploy that changes a slot contract or a new release of a template queues measuring for exactly the template × CMS lines
    touched; a "Measure again" button on /ops queues one line (unlike "Check again", which reruns static rules in place).
    tracy-web keeps a **measuring job queue table**; the measuring machine is a server that **pulls jobs itself** (tracy-web does not call into the measuring machine, the measuring machine
    opens no inbound port), runs one stand at a time, returns results through decision 8's HMAC receiving door with the machine name and the version measured; /ops
    shows queued / measuring / measured state per line. The measuring machine at this stage is `prod-2-runner-dev` (VPN-only, 4 vCPU,
    15 GB RAM, already has Docker 29.8.1, no Chrome or Node yet, reached via the iMac as jump host); the iMac is only the bootstrap measuring machine for the first scan
    pass until the server is up (order in decision 14). This is tch's first server-side built-site measurement: TCQR's /ops
    today is also static and its "Trial build" step (O3) is not done, so this job queue and measuring machine are designed for TCQR to reuse (job
    type is a field, the TDSR name is not tied into the key).
14. **(Replaced by decision 15, 13/10 20:50; kept as history.)** Measuring machine order for the first scan pass (Q12, grill round 3, 13/10 18:05, Akemi chose option A): the iMac runs the bootstrap
    scan pass today, without waiting; `prod-2-runner-dev` is built in parallel and takes over as soon as its first measuring job
    succeeds; from that milestone the iMac is no longer a measuring machine (revoke the `imac` secret). Akemi: do it now, don't wait for tomorrow, go in whatever order
    progress allows.
15. **TDSR follows the TCQR template exactly; measurements travel as a file** (13/10 20:50, after the iMac scan pass; replaces decision 2's measuring-machine part, 8, 13, 14
    and the spec's old T7). Akemi's words: *do it like TCQR: the suite runs on /ops, whatever is off shows up, the admin pastes the prompt into
    Claude Code and fixes it to green; don't spawn infrastructure.* Reason: the person fixing a template has already built the site to fix it, measuring about 1.5 more minutes with the
    `tdsr` skill (`pass-joomla.mjs`, `pass-wordpress.mjs`, `flow-emdash.mjs` already exist) yields the numbers; a measuring server, a measuring job queue
    and an HMAC receiving door are infrastructure just to carry a number the fixer already holds in hand, and the 38-line scan pass on the
    iMac (one hour, every stand torn down cleanly) shows no dedicated machine is needed. Therefore: the fixer measures on their own machine; the result is a
    **measurement file** following one schema: on re-release it is the `designSystem` block in the release's `VERIFICATION.json`; when only the
    contract is fixed it is `design-system-measurement.json` in the contract folder of the exact version
    (`packages/cms/tracy-joomla-quickstart/contracts/<template>/<cms>/<version>/`, equivalent for WordPress and EmDash), travelling
    with the tch PR that changes the contract. /ops reads the file like any other release / contract file: with a file for the right version it scores the eight measured rules from
    the numbers in the file and writes "Measured on <version>, <date>, <machine>"; with none, or a file for another version, it is "Not measured yet" (the two phases
    of decision 11 stay unchanged). The /ops prompt for a failing template says to run the measuring pass and bring the file along with the fix. The
    13/10 scan pass (`tasks/evidence/ds-sweep-2026-10-13-moxie/`) is the baseline measurement, turned into files for 38 lines in one tch PR. Removed from
    scope: the server-side measuring machine, the measuring job queue, the "Measure again" button (the "Check again" button stays), the HMAC receiving door. Decisions
    1, 4 to 12 stand, except where they mention a measuring server; `CONTEXT.md` §9 vocabulary changes "measuring machine / receiving door" to "measuring pass / measurement file".

### Consequences

- `template_ds_readiness` has no new write source: built-site measurements come from the measurement file that the release read / Check again reads
  together with the seven static rules (decision 15); a new version does not inherit the old version's measurements, and with no file for the right version it is "not measured".
- Of the 38 lines with a card, by the 13/10 measurements and the new rules, 18 lines are not done (the "Current state" table in the spec; JA Vital left the table
  after grill round 1 because its last pass passed, JA Resume stayed because `follows` is 82%); about two thirds
  are fixed in the slot contract without a re-release. Four root causes found 13/10 (mode-dependent ink role missing in
  `emit.mjs`; WordPress theme missing the `tracy_site_identity` fallback; the T4 optimize package drops missing files; the preview door skips the version
  gate) are recorded in the spec with where to fix them.
- **No measuring server, no measuring job queue, no receiving door** (decision 15 replaces 13 and 14): tracy-web opens no new API
  door, keeps no measuring-machine secret, does not build `prod-2-runner-dev`. What is new is a measurement-file schema, the place that reads the file in /ops's
  release / contract read, and the `tdsr` skill's measuring command that can write that file. The spec's T7 is now turning the iMac scan pass of
  13/10 into measurement files for the 38 lines being published.
- The eight open points of grill round 1, the three questions of round 2 and question Q12 of round 3 were settled 13/10 (decisions 7–14 above and the corresponding
  items in the spec); decision 15 at 20:50 trimmed the measuring part back. The spec has no open points left; the next step is `/to-spec` then `/to-tickets`.

## Revision 14/10/2026: auto palette and four preview rules

### Why revise

On 14/10 Akemi inspected Add site → template → Moxie: JA Impact, Kinetic, Resort looked broken (orange blocks, glaring khaki bands, white
text on light backgrounds) while every built-site rule passed. Two root causes. First, the rules measure a built site, not the
preview frame the customer sees. Second, the contract **lists** the blocks needing a colour change (bands, followRules, inlineColours), so it always misses
hard-coded colours of JA templates, and then `keepScopes` was added just so ROLE-1 would hit 85%, i.e. optimizing the number. Tracy Business wears a system
nicely only because all of its colours go through tokens.

### Decisions changed

16. **Auto palette.** The slot reads the template's whole palette from the demo page itself (every colour declaration the page
    uses, brand colour variables at `:root`, inline colours, and how the page uses each colour), assigns each colour a role (page background,
    surface, band, accent, text, secondary text, text on band, text on accent, accent text, border), then maps it to the system's colour of the same role, a band
    background or accent background always comes with a text colour readable on it. Bands use `light-dark()`, so they follow whichever light/dark side the page is
    showing. The result is generated into `packages/design/tracy-ds-slot/templates/palette/<contract>.json` by
    `apps/tracy-web/scripts/preview-check.mjs --palette`; Joomla and WordPress wear it. EmDash does not need it yet: all three EmDash templates
    go through tokens. The contract declares only **exceptions with a reason** (images, illustrations, brand art: `keepScopes` with
    `keepScopesNote`, `paletteKeep`) and **role hints** where automatic assignment is still ambiguous (`paletteRoles`). No block is kept just to pass a rule.
17. **Four preview rules**, scored from the `preview` block of the measurement file (`preview-check.mjs --write`, each system × each light/dark side
    of the viewer). TPL-1: no colour block, glaring band or brand-coloured text of the template still shows (must fix). CON-2:
    no text made hard to read by the system below 3:1; text already hard to read on the original page belongs to the template (must fix). BTN-1: buttons keep
    their shape (worth fixing). PREV-1: the preview frame is only one page, fonts load, no empty blocks (must fix).
    Measurement files before 14/10 have no such block, so the four rules show "Not measured yet" until the next measuring pass.

### Consequences

- The preview frame now cuts off the Joomla error page printed after `</html>`, loads the demo's stylesheets and fonts through the
  `/api/design-system/preview-asset` door, and shows template content hidden until scroll (`data-aos`, `.ja-animate`) because the frame does not
  run scripts.
- The Joomla and WordPress slots state the light/dark side of the page wearing the system, overriding the theme's `:root{color-scheme: light dark}`.
- The Joomla slot has a size gate (under 60 KB, because the Joomla module content column is a 64 KB TEXT).
