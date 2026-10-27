# 0010 — "Design inspiration": the customer-facing name and the machine name of the 152-design-system feature

- Status: accepted (binding)
- Date: 2026-09-07
- Decided by: Lee ("rename this Design Direction feature to Design Inspiration everywhere")
- Related: [`docs/references/vocabulary.md`](../references/vocabulary.md) §1 and §4 ·
  `tasks/spec-huong-thiet-ke.md` (original spec, kept unchanged as a record) · `tasks/todo-design-inspiration.md`
  (inventory and rename plan)
- Enforced in: `packages/design/tracy-design-inspiration/` · `packages/locale/tracy-locale-vi/vi/tracy-design-inspiration.json`
  · `packages/design/tracy-design-skill/skills/tracy-design-inspiration/` · `packages/bundle/tracy-native` ·
  `scripts/check-vocabulary.ts` · `scripts/check-language.ts` · `scripts/check-lane-tabs.ts`

## Context

The feature that brings OpenDesign's 152 design systems to the customer — a tab on the side card, three suggestion
cards in chat, a dialog previewing each page of the site in that system — was born on 05/09/2026
under the name **Design direction** (vi: *Hướng thiết kế*), following the machine→customer table in `vocabulary.md` §1.
The word "direction" was at the same time the **domain noun** for one of the 152 systems: "Use this direction",
"Three directions for your site", the type `Direction` in code.

On 07/09 Lee renamed it to **Design inspiration**. This is not a text fix in one place: the same feature
carries its name in four layers — product vocabulary, machine identifiers (package name, tab id, namespace,
route), en/vi strings, and the places that call it (brand engine, skill, design bench, gates). Renaming one
layer without the others is exactly the "half-done rename" that `vocabulary.md` §5 bans.

## Decision

1. **Customer-facing name**: en *Design inspiration(s)*, one system is an *inspiration*; vi *Cảm hứng thiết
   kế*, one system is a *cảm hứng*. The sentence the dialog sends into chat on the customer's behalf:
   `I chose the design inspiration "{name}" ({id}). Continue with step 3.` — this sentence is a contract
   in three copies (`strings.ts` en · `vi/*.json` · `SKILL.md` step 3) and they must change together.
2. **Machine names follow**, one mapping table, the old name kept in no layer:

   | Old | New |
   |---|---|
   | `packages/design/tracy-design-system/` | `packages/design/tracy-design-inspiration/` |
   | `@tracy/dsh-design-system` | `@tracy/dsh-design-inspiration` (new package on the registry, starting at `0.2.0`) |
   | cordis row id · host `name` · i18n `NS` `tracy-design-system` | `tracy-design-inspiration` |
   | tab type `tracy:design-system` | `tracy:design-inspiration` |
   | `/api/tracy-design-system/*` | `/api/tracy-design-inspiration/*` |
   | CSS scope `tracy-design-system`, prefix `tds-` | `tracy-design-inspiration`, `tdi-` |
   | skill `tracy-design-system` | `tracy-design-inspiration` |
   | type `Direction`, `DirectionCard`, `openDirection` (brand engine) | `Inspiration`, `InspirationCard`, `openInspiration` |

3. **Four things do NOT change**, because they are data already written to customers' disks or other people's code:
   - files and keys in the site folder: `docs/agents/design-preview.json`, `docs/agents/design-copy/<id>.json`,
     `Brand/<host>/`, id `brand:<host>`, version id `v1-direction`, `tracy-design-copy/v2`,
     `tracy-design-preview/v1`;
   - the two tools `tracy_design_propose` / `tracy_design_copy` — they do not contain the word "direction", and renaming
     a tool changes the contract with the skill and every existing transcript;
   - vendor OpenDesign's coinciding words: `@tracy/od-design-system`, `/opt/tracy/design-systems`,
     `design-catalog.json`, the heading `# Design System Inspired by …` in each system's `design.md`;
   - the brand engine's `writeDirection()` — that pipeline's own "direction", with its own test.
4. **The gates ban the phrase "Design direction(s)"** in `check-vocabulary.ts` and `check-language.ts`.
   Only the two-word phrase is banned: bare `direction` is a platform word (`flex-direction`, `direction: rtl`)
   and `.css` is within the scan scope — the same reason "Frame" is not in the table.
5. **The old triggers in `SKILL.md` are kept** ("design direction", "hướng thiết kế") alongside the new
   triggers, so customers typing out of habit still hit the skill. The vocabulary gate does not scan `.md`.

## Consequences

- **Orphaned tabs.** `dsh-better-sidebar` stores open tabs in `localStorage`
  (`dsh-sidebar:v1:<session>`) by type id. A customer with the old tab open, after the lane gets the new bundle,
  sees an `OrphanedTab` cell labelled `tracy:design-system` until they close it. Accepted: nothing
  breaks, no data is lost, and the new plugin does not register the old type.
- The package `@tracy/dsh-design-system@0.1.36` stays on the registry, not unpublished (unpublishing burns the number,
  and old bundles on lanes not yet updated still need to install).
- Specs, todos and journal entries written before 07/09 still say "Design direction" / "hướng thiết kế". They are
  records, not rewritten; every spec/todo file still in use carries a note line at the top pointing here.
