# Build Subagents — when to dispatch, when to stay inline

**Design contract:** read `design-contract.md`. A valid `design-contract.json` is required at Phase 2.
Authors use its pinned roles/tokens; pass the pilot matrix before repetition and the complete
page/viewport/theme matrix before acceptance. Keep the contract hash with all observations.


**Content contract:** read `content-contract.md`. Authors and reviewers receive the same
`content-contract.json` path/hash and `content-plan.json`. Compile before content writes;
compare rendered fields and review whole-page meaning before recording content complete.


The T4 build is **two kinds of work** that want opposite execution models. Getting this split right
is what keeps a long build from "reading once and missing things" WITHOUT paying the hand-off tax of
splitting everything into subagents.

## The split (read this first)

```
Phase 0  Provision   ─┐
Phase 1  Scaffold     │
Phase 2  Parse & Map  │   BUILD SPINE — sequential, shares live state
Phase 3  Chrome       │   (the DDEV site, the DB, files on disk).
Phase 4  Layouts      │   RUN INLINE in the main conversation, ONE phase
Phase 5  Overrides/ACM│   packet at a time (progressive disclosure).
Phase 6  CSS tokenize │   Do NOT split these into per-phase subagents:
Phase 6b Imagery      │   each subagent starts from empty context, must
Phase 7  Demo content ─┘   re-discover state, and only its final message
                           returns — detail is lost across hand-offs.

Phase 8  Verify      ─┐   PARALLEL, INDEPENDENT, READ-HEAVY.
Final    Review pass ─┘   DISPATCH SUBAGENTS — one per page/dimension,
                           each on its own browser slot. This is where
                           subagents pay off (context isolation + wall-clock).

Phase 3  Chrome      ┄┐   CONDITIONAL FAN-OUT (execute subagents, §C) — ONLY
Phase 5  ACM/over.   ┄┘   once a written design-spec artifact exists. The work
                           is FILE-independent (one block/override per agent),
                           so it parallelizes — IF the agent reads the spec
                           instead of needing conversation context.
```

**Why inline for the spine.** Official Claude Code guidance: *use the main conversation when multiple
phases share significant context (plan → build → test).* The spine phases each mutate the same site
and feed the next phase. Keep them in the main loop; read the phase's packet (see SKILL.md router)
just-in-time so you hold one phase's detail at full resolution instead of skimming all 14 references
at once.

**Why subagents for verify/review.** Each page renders and probes independently; nothing downstream
depends on another page's verify. A subagent that renders + screenshots + reads `getComputedStyle`
generates 30–50k tokens of intermediate output but returns a 500-token findings list — that is the
context-isolation win. Run them on the parallel browser fleet (`.mcp.json` `pw-1..5` / `cdp-1..5`,
one slot per agent) so 5 pages verify at once.

**Why execute subagents only conditionally (§C).** The reason the spine is inline is *conversational*
context — the design decisions, the captured menu ids — not filesystem/DB access (every agent shares
the disk + DB). So an execute subagent becomes safe the moment its inputs are a **written artifact**
(the design-spec + the source markup) instead of conversation history. Chrome (Phase 3) and the ACM
blocks + component overrides (Phase 5) are the file-independent, high-volume authoring work where this
pays off; the rest of the spine stays inline.

**Use the dispatch prompts below verbatim** (fill the `<…>` slots). The §A verify + §B review agents
are READ-ONLY (they **report**, you fix on the spine); the §C execute agents **write files** (to
distinct paths / worktrees). 

---

## A. Phase 8 — parallel page verify (dispatch one per view group)

Clear the optimize cache ONCE on the spine before dispatching (gotcha #1) — stale bundles make every
agent report phantom diffs. Then dispatch in ONE message (parallel), each agent pinned to a slot.

Split the ~18–24 pages into N groups of 3–5 (one group per agent). Each agent:

> **READ the skill first**, then verify these pages. Read
> `SKILL.md`, `references/verify-recipes.md`, and
> `references/dark-light-mode-standard.md` §7 yourself — do not rely only on this prompt.
>
> **Browser slot:** use the **`<cdp-N>` / `<pw-N>`** MCP slot ONLY (clear any stale
> `/tmp/mcp-fleet/<slot>/Singleton*` lock first). Joomla root: `<root>`. Spec-pack: `<spec-pack>`
> (read its `reference.json` — it declares what the reference side is for each page).
>
> **Pages to verify (this group):** `<page → Joomla URL → matching bundle .html>` × 3–5.
>
> For EACH page, in BOTH light and dark:
> 1. Navigate the Joomla URL; set the mode (toggle or `?…`/cookie per dark-light-mode-standard.md §7).
> 2. Screenshot. Open megamenu + off-canvas and screenshot those too — open the megamenu with a
>    REAL hover and walk the pointer into the panel; on the home page also run
>    `scripts/review/mega-hover.mjs <url>` and report its verdict (blocks-and-elements.md §5d).
> 3. Probe the selectors in `verify-recipes.md` "Probe these selectors" → emit the snapshot JSON shape.
> 4. Navigate the matching bundle `.html`, same mode, same probes → second snapshot.
> 5. Report per page: parity verdict + every diff (selector, light value, dark value, expected,
>    severity). Flag horizontal overflow, tofu icons, broken hover, unaligned breadcrumb separators.
>
> **Anti-false-positive:** probe the SAME element on the source side before flagging — a finding
> without the source-side value is discarded. Demo/placeholder images stay as-is. Parity = structure
> + token colors + type + spacing, NOT pixel-exact. Return findings as a list; do not fix anything.

You (spine) consolidate, fix the real diffs, clear cache, re-dispatch the affected group until clean.
`scripts/verify-render.mjs` diffs two snapshot JSONs deterministically — agents can run it themselves.

## B. Final review pass (dispatch 3–4 dimensions in parallel)

After Phase 8 parity, run an adversarial review BEFORE packaging. Dispatch all in ONE message.

**Agent 1 — Editability / dev-review compliance** (reusable def: `t4-editability-auditor`; read-only):
> READ `references/editability-standards.md` in full, then audit the live site + the template tree
> against EVERY rule in it. For each violation give the rule §, the offending element/file, and the
> fix. Specifically hunt: marketing pages baked into one article (must be ACM stacks); `mod_custom`
> where ACM is required; raw `*_LABEL` in the ACM editor (language not synced to `<site>/language/`);
> mega menu with icons/subtitles or a `mod_menu` override; module titles not `[<Tpl>] <Page> -
> <Section>`; hidden/duplicate/unpublished menu items; hardcoded SEF instead of Itemid; style-per-page.

**Agent 2 — Coverage matrix** (reusable def: `t4-coverage-auditor`; read-only):
> READ `references/page-coverage-matrix.md` + `references/catalog.md` §6. Confirm the build hits the
> mandatory floor (≥1 home + full ≥18-page Joomla set + ≥3 layouts + ≥2 styles + ≥6 ACM sections) and
> list any tier-A/B/C/D/E item missing. Confirm 404 / offline / search / login / register / profile
> all render. Report gaps only.

**Agent 3 — Dark-mode completeness** (reusable def: `t4-darkmode-auditor`; drives `<slot>`):
> READ `references/dark-light-mode-standard.md`. Screenshot DARK mode on every page incl. standalone
> error/offline. Confirm server-side resolution (no FOUC), toggle present on every header variant +
> mobile, and the orthogonal `other_darkmode`/`other_default_theme` behavior. Hunt white/navy leaks,
> dark-on-dark text, pseudo-bar borders, bg-image icons. Probe light-vs-dark on each finding.

**Agent 4 — Package / install-smoke pre-check** (reusable def: `t4-package-auditor`; read-only):
> READ SKILL.md "Phase 9" + `references/gotchas.md` #41–#49. Grep the template for
> `T4_BLANK|t4_bs5_blank|Blank`; confirm de-blank complete, default-style title is real, foreign-
> component override baggage stripped, `system_optimizecss/js=1`, `system_t4frontendedit=0`. List
> anything that would fail a clean-frame install.

Consolidate, apply the **verify-before-fix gate** (probe the exact value light-vs-dark before
changing — a screenshot reviewer produces false positives), fix on the spine, re-check.

**Report vs fix-loop.** In this PARALLEL pass the agents REPORT and you fix on the spine (concurrent
fixes to shared files — one `darkmode.css`, the DB, the menu — would race). Each auditor ALSO supports
a **solo fix-loop mode**: when you dispatch ONE agent alone with an explicit "fix" mandate and
ownership of its scope, it loops verify→fix(through the gate)→clear-cache→re-verify until clean. Use
fix-loop only solo / on disjoint scopes — never two fixers on the same files at once.

---

## C. Execute subagents — parallel BUILD (Phase 3 chrome · Phase 5 ACM/overrides)

These agents WRITE files. They are only safe when their inputs are a **written artifact**, not
conversation history (see the split overview above). Use them for the high-volume, file-independent
authoring work; keep the rest of the spine inline.

### Precondition — the design-spec artifact (write it ONCE, on the spine, before dispatching)

Every execute agent reads a single **design-spec** artifact instead of asking you. **Generate the
skeleton from the page-map, then complete every `TODO`:**

```
node scripts/make-design-spec.mjs <page-map.json> --out build-docs/design-spec.md
```

It auto-fills identity + palette (light+dark) + fonts + the page/view list from Phase 2; you complete
the `TODO`s (dark hook, class prefix, the border/heading/surface companions, type scale, spacing,
token names, and the **per-artifact source pointers**) during/after Phase 6. **Full contract + the
section-by-section schema: `references/design-spec.md`.** Without this artifact, parallel builders
diverge (different class names, spacing, tokens) → an inconsistent template — the whole reason the
spine is inline by default. A spec with open `TODO`s is not ready; finish it before dispatching.

### Avoiding write races

Each agent owns a DISTINCT path (one `acm/<block>/`, one `html/com_*/<view>`, or the chrome cluster).
For **shared** files multiple agents would touch — the global `_all.scss` `@import` list,
`etc/layout/*.json`, the `en-GB.tpl_<tpl>.ini` — agents do NOT edit them; they **RETURN** the lines
(the `@import`, the position, the language keys) and the **spine merges them once**. For true parallel
authoring that must touch shared files, dispatch each agent in its own **git worktree** and merge on
the spine. Then: compile scss, sync the language file to `<site>/language/`, seed/publish in Phase 7,
and verify (§A) — all on the spine.

### Dispatch

- **Phase 3 chrome → ONE `t4-chrome-builder`** (not split per-part — header/off-canvas/nav/toggle are
  coupled). Give it the design-spec + the header/footer/nav source markup. It returns the blocks +
  declared positions + the planned menu/mega structure for the spine to seed in Phase 7.
- **Phase 5 → parallel `t4-acm-block-builder` (one per ACM block) + `t4-override-builder` (one per
  com_*/mod_* view).** Give each the design-spec + its one section's source markup. Dispatch in one
  message; collect the returned `@import`/position/language lines; merge on the spine.

Each agent reads its own references (it's told to) — your dispatch prompt only supplies the template
dir, the design-spec path, the ONE artifact to build, and its source markup.

---

## D. Reusable agent definitions (shipped in the plugin)

The dispatch prompts above travel with the skill and need no install. For a **reusable** role you
invoke across many builds, the `joomlart-t4` plugin also ships agent definitions at the plugin
root `agents/`. When the plugin is installed these **auto-register** — Claude delegates to them by
name, no manual copy to `~/.claude/agents/`. (Running the skill standalone via symlink instead? Just
use the copy-paste prompts above — same behavior, no install.) The agent files are thin wrappers that
tell the agent to read these same references — the references stay the single source of truth.

**Verify / review (read-only):** `t4-page-verifier` (§A) · `t4-editability-auditor` (§B-1) ·
`t4-coverage-auditor` (§B-2) · `t4-darkmode-auditor` (§B-3) · `t4-package-auditor` (§B-4).

**Execute / build (write files; §C — only with a completed design-spec):** `t4-chrome-builder`
(Phase 3, one pass) · `t4-acm-block-builder` (Phase 5, one block/agent, parallel) ·
`t4-override-builder` (Phase 5, one override/agent, parallel).

**Design-review + packaging:** `t4-design-review-unit` (Phase 8b, one unit per agent, drives it to
parity on all 4 axes) · `t4-quickstart-parity` (Phase 10, one page-group per agent, compares the
restored quickstart against the live build).
