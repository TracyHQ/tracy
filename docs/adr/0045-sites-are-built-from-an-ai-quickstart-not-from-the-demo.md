# 0045. Sites are built from an AI quickstart, not by rewriting the demo

- **Status:** (binding) once merged. Amends [ADR 0044](0044-write-step-and-site-check.md): the write step writes into a blank site instead of over the demo.
- **Date:** 12/11/2026
- **Decided by:** Akemi (COO), grilling session 12/11/2026. Parent spec: TracyHQ/tracy#575.

## Context

Measured on JA Boxing j6 1.0.11 and JA Diner j6 1.0.8, 12/11/2026:

1. **The step chain starts from the full demo site and replaces what it can.** Every slot it misses keeps its demo words, so a miss is visible to the customer. A build that could not read the kit still ended `applied` with the whole demo in place.
2. **Demo content is spread over many stores.** JA Boxing: 39 modules (22 JA ACM), 29 articles, 33 menu items, template setting files, language strings. JA Diner: six stores, and its business facts exist in five conflicting copies.
3. **Design and content share one record.** A JA ACM module keeps layout, column count, background and spacing in the same params JSON as its headings, pictures and links.
4. **A marker test on JA Boxing 1.0.11 works.** Writing a unique marker into all 1612 content map slots with the plugin's own patch functions, then rendering 51 pages at 390, 768 and 1440 in light and dark, showed no demo words left inside content. It also found 18 groups of leaks outside the content map (site name, body background, author, social links, system strings) and four pages that crashed with a 500 because two design values were declared as text slots.
5. **A page can be rebuilt from blocks.** Deleting the demo menu items and creating one new page from copies of three demo modules rendered correctly in light, dark and at 390. Footer menu items pointing at deleted items broke.
6. **A released content map cannot change** (ADR 0038, context 8). The AI quickstart is a new artifact with its own mapping file, so this does not force a new human quickstart.

## Decision

1. **Each template release carries an AI quickstart next to the human quickstart.** It holds:
   - a blank site: the template with its design intact, no pages, an empty menu, and every demo block moved to a block store with its content slots emptied;
   - the block store description, page recipes and the mapping file (ADR 0046);
   - a check record: the release gate results below, with screenshots and versions.
   The human quickstart stays as it is and remains the demo pack used for previews.
2. **A site is built by adding to the blank site, never by replacing demo content.** The write step creates pages and menu items, places copies of blocks from the store, and writes each slot. A slot left unwritten stays empty or its block is not placed. Demo words can only reach a customer site if the blank site itself is dirty.
3. **An AI quickstart is released only when it is clean.** The release gate, run by machine:
   - marker test: zero visible text, image, link, alt, title or meta that is not a marker, on every page, at three widths, light and dark;
   - demo scan: zero demo sentences and demo images on the rendered blank site and on a marker build;
   - write safety: writing arbitrary values into every slot raises no server error;
   - structure: creating and deleting pages leaves no broken links;
   - the existing template quality tests (light and dark, phone widths, SEO, accessibility).
   Templates differ in how much work it takes to pass the gate, never in what passes.
4. **Every fix lives in the step that produces the AI quickstart; the template release and the human quickstart are not touched.** In order: the mapping file (including correct field types), then setting and language overrides, then data fixes applied to the blank site. If a fix needs a template file to change, the production step applies a recorded patch to its copy of the template; nothing is sent back to the template's own release. When the template releases a new version, the production step runs again and the gate shows whether each patch still applies.
5. **The blank site is produced by a machine step at release time**, not by hand and not on every build, so every build starts from the same checked state and can be installed ahead of time.

## Consequences

- The quickstart capture and release tooling gains a step that produces the blank site and runs the gate.
- The write step changes its starting point. Its plugin actions stay; the marker test already wrote all 1612 slots through them.
- Checks that compare new copy with the length of the demo copy lose their purpose and move to the limits in the mapping file.
- JA Boxing gets its first AI quickstart with the fixes found by the marker test; its template release and human quickstart stay as they are.

## Rejected

- **Keep rewriting the demo and find the misses.** Every miss shows demo words to a customer, and finding misses has no end.
- **Generate a new site per customer from design tokens (as some site builders do).** Loses the template's design, which is the product's strength, and every site becomes a new, unchecked design.
