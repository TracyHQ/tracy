# 0045. Progressive site plan: copy and pictures start on each page group the plan has settled

Status: proposed (19/11/2026). Nothing is built; each stage below is its own PR, measured on dev before the next.

Builds on [ADR 0041](0041-site-planner-trial-bench-in-ops.md) (the planner and its approved prompt),
[ADR 0042](0042-site-writer-trial-bench-copy-contract-and-check.md) (the writer and its locked prompt),
[ADR 0043](0043-picture-step-manifest-check-and-fallback-ladder.md) and [ADR 0044](0044-write-step-and-site-check.md).

## Context

A website opportunity chain build runs kit, then brand beside plan, then copy beside pictures, then the write step.
Measured on dev on 19/11/2026 (lat16, after #681 #683 #696 #697 #699):

| Site | Plan | Copy | Pictures | Write | Total |
|---|---|---|---|---|---|
| Arabian Tea House (JA Diner) | 8.2 | 7.7 | 3.4 | 1.2 | 17.1 |
| BXR London (JA Boxing) | 11.2 | 7.8 | 4.5 | about 1 | 20.4 |

The goal is a build of about 10 to 15 minutes. Today the plan step and the copy step run one after the other and
together are 16 to 19 minutes of a build.

Nothing after the plan can start earlier today, because every stage reads the whole site:
- **Plan check.** It takes the whole plan only (`plan-check/check-plan.js`).
  - Cross-page rules: R04 menu, R09, R10a, R10d links to kept pages, R10e footer, R10g, R11 forms, R13 shared blocks, R24 shared labels and R10b reading them, R25, V01.
  - Page-local rules: R03, R05 to R08, R12, R14 to R23, R26.
- **Copy.** Every part's first message holds the whole plan (`writer-turns.js`, `writer-parts.js`). Shared blocks are written in their own shared turn. W02, W06 and W09 judge the whole site.
- **Pictures.** Photo use is counted across the site, a shared-block frame is on every page, and the picker answers every frame at once.
- **Write step.** One owner table is built from every claim and then written in one contract apply.

The planner writes its plan in one answer at the end of a conversation with tools (round 0, 6 to 8.5 minutes),
then fix rounds (1 to 3 minutes). Running the plan in parallel parts (`--parallel-pages`, #645) gave no gain on dev:
each part read the whole kit, and the merged parts failed more.

## Decision (proposed)

The plan is written, checked and handed on page group by page group. The first steps are the site-level part, and
then each page group in the planner's own order. Copy and pictures for a group start as soon as that group and the
site-level part are settled. The write step still writes the whole site once.

1. **Stage 1: the planner writes in turns** (one PR; measured alone).
   - Round 0 becomes one conversation of writing turns (`step.nextTurn`, as the writer has):
     - a first turn for the site-level fields (`site`, `mainMenu`, `sharedBlocks`, `footerMenu`, `forms`, legal pages, voice);
     - one turn per page group.
   - The approved system prompt is unchanged. Each turn's user message says what that turn decides, as the plan parts' messages do (`plan-parts.js`).
   - After each turn, the page-local rules run on that group.
   - The whole-plan check and the fix rounds stay at the end, as today.
   - Pass condition on dev: plan time within 10% of today, and no more standing failures.
2. **Stage 2: copy per settled group.**
   - When a group's turn passes its page-local rules, a writer part starts on the site-level part plus that group (`planOfPages`).
   - The shared turn starts once the site-level part is settled.
   - The parts are merged and checked once (W02, W06, W09), and the fix rounds run as today.
   - A group that the plan's later fix rounds change is written again as a patch of only its slots.
   - Pass condition: copy ends within 3 minutes of the plan's end.
3. **Stage 3: pictures per settled group.**
   - The code half and the picker run per group.
   - The site-wide photo use is shared in one tally that groups read in plan order. A shared-block frame belongs to the site-level part.
   - Pass condition: pictures end within 2 minutes of the plan's end.
4. **What stays whole-site:**
   - the final plan check and its fix rounds;
   - the merged copy check;
   - the picture check;
   - the write step;
   - the site check.

Expected: a build of plan time plus about 4 minutes, so about 12.5 minutes for Arabian Tea House and 15.5 for BXR
London on today's plan times. Reaching 10 minutes also needs a shorter plan step, which this ADR does not decide.

## Consequences

- **The planner's approved prompt is unchanged**, but the planner now answers in turns. The reference-run comparison of ADR 0041 must be re-run on the stage 1 build before stage 2 starts.
- **The prefix cache changes.** The writer's parts no longer share one fixed part holding the whole plan; each part's prefix is the site-level part plus its group. Model spend per build may rise; it is measured at each stage.
- **Rework when fix rounds change a group.** A group whose plan changes after its copy started is written again. If that happens on most builds, stage 2 saves nothing; the stage 1 measurement shows how often fix rounds touch a group that already passed.
- **One owner per slot is kept** (ADR 0044): the write step still builds one table from the final plan, copy and pictures.

## Not decided here

- A faster plan step (fewer kit images opened, a precomputed per-kit reading).
- Writing the site page by page.
