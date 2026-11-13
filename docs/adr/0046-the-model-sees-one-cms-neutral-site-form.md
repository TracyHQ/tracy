# 0046. The model sees one CMS neutral site form; each template maps it

- **Status:** (binding) once merged. Builds on [ADR 0038](0038-slot-roles-live-in-content-map.md) (roles) and [ADR 0045](0045-sites-are-built-from-an-ai-quickstart-not-from-the-demo.md). Replaces the planner's role in [ADR 0041](0041-site-planner-trial-bench-in-ops.md) for builds from an AI quickstart.
- **Date:** 12/11/2026
- **Decided by:** Akemi (COO), grilling session 12/11/2026. Parent spec: TracyHQ/tracy#575.

## Context

1. **Templates share no structure.** JA Boxing runs on T4, JA Diner on T3. Pages are menu items plus assigned modules; block order lives only in module assignments; nothing states which business data a block shows, how many items it takes, or what to do when there is none (JA Diner's kit records "max = demo item count, min unknown" for every group).
2. **The planner reads the whole demo to decide pages and blocks.** One measured run took about 23 minutes before writing started.
3. **Two port routes were measured on JA Diner.** A WordPress port that copied the original structure reaches 43.8 % of text through the writer (333 holes). An EmDash port that rebuilt blocks as named fields reaches 99.5 % text, 100 % images and links, in about 10.5 agent hours.
4. **A role vocabulary already exists** (ADR 0038, `place-content-roles`), bound to every slot.

## Decision

1. **One site form, the same for every template and CMS.** It declares:
   - business facts, once (name, phone, address, email, social links, logo light and dark);
   - pages, each with SEO fields (title, description, a 1200 by 630 share image);
   - blocks by block type, each with typed fields (text, link, image with frame, icon, number), length limits, minimum and maximum items, and a rule for no data (hide by default, or a fallback the block declares);
   - data kinds taken from the role vocabulary.
   The model reads and fills only this form. It never sees database rows, modules or template files.
2. **Each template has a mapping file.** For each block in its store: the block type, which config lines are design (kept) and which are content (fields), where each field is written (entity, column, JSON path or XPath, reusing the content map), where each business fact is written (all of its places), page recipes, and the setting and language overrides. Design values are typed as design so nothing writes text into them.
3. **The model composes the plan, rules gate it, then the customer approves it.**
   - **Compose.** One call to the standard build model composes the plan from the needs profile, the block list and the page recipes: which blocks each page keeps, which data items go into which block, what comes first, and the reason for each choice in words the customer can read. The model never sees the demo.
   - **Gate.** A pure rules gate checks the composed plan before anyone sees it: every data item exists in the needs profile; a kept block has at least its minimum and at most its maximum items; a page whose main block is missing is dropped; no design typed field is targeted. Data with no block finds one in order: a template block of that type, a template block whose fields fit, a Tracy library block styled through the template's design variables, else it is reported.
   - **Retry.** A plan that fails the gate is composed again once, with the failures. A second failure follows the stop and report rule of [ADR 0047](0047-a-failing-build-step-stops-and-reports.md).
   - **Approve.** The customer sees the result as a plan card and can change it before anything is written. The approved plan is saved and is what the build runs.
4. **The route per template is chosen by measurement.** Run the marker test of ADR 0045. A template that passes the gate with Tracy-side fixes keeps its original code and gets a mapping file. A template that needs too many template code fixes, or whose reachable content is low, is ported into clean named blocks (the EmDash route). Both feed the same site form.

## Consequences

- The planner step is replaced by a needs profile step and a plan composer: one model call that composes the plan, followed by a rules gate.
- Two runs on the same business may give slightly different plans. This is accepted because the customer approves one plan and that plan is saved.
- The rules gate, not the prompt, is what guarantees that a plan holds nothing the business does not have.
- The writer writes per page against the form's limits; its checks measure those limits, not the demo.
- A contract check validates the mapping file, including field types, before release.
- Adding a template adds a block store and a mapping file; build code does not change.

## Rejected

- **One prompt that understands each template.** Slow, costly, and breaks on every new template.
- **Port every template into a new base now.** Proven clean on EmDash, but costly per template and unnecessary where the original passes the gate.
