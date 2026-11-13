# 0047. A failing build step stops and reports; no repair agent

- **Status:** (binding) once merged. Amends [ADR 0044](0044-write-step-and-site-check.md): removes the agent repair pass after the site check.
- **Date:** 12/11/2026
- **Decided by:** Akemi (COO), grilling session 12/11/2026. Parent spec: TracyHQ/tracy#575.

## Context

1. **The step chain degrades silently.** A failing step falls back to partial output or a stand-in, and the run always ends `applied`. The full write report is deleted with the temporary folder unless a keep flag is set.
2. **The repair pass (9b) can hang.** One measured run asked the customer a question that the confirm card guard refused, and the turn never ended, leaving the demo in place. Another invented services to fill a page the plan had dropped.
3. **With a blank site and a typed form (ADRs 0045, 0046), most repair targets disappear**: there is no demo text to chase, and field limits are checked by machine before writing.

## Decision

1. **No repair agent.** The agent pass after the site check is removed.
2. **A failing step is re-run once from its own saved inputs.** If it fails again, the build stops, the customer is told the build could not finish, and the Tracy team gets a report that names the step and keeps its inputs and outputs.
3. **"Done" means the site check passed.** A build never reports done, applied or complete otherwise.
4. **Missing facts are asked from the customer, system faults are not.** A gap in the needs profile becomes a question in the chat; a broken step never does.
5. **Every step keeps its record** (inputs, outputs, timing, cost) after the run, without a flag.

## Consequences

- Run records outlive the temporary folder.
- The chat experience needs a "could not finish" state.
- Model doors used by the chain are checked before a build starts, so an empty door stops the build up front instead of failing silently later.

## Rejected

- **Keep the repair agent with a time limit.** It still edits outside the plan and hides the step that failed.
