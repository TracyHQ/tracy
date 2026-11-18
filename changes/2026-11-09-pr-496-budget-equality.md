- **A budgeted bench stops before another model call when known spend reaches its limit exactly** — Codex · #496 · `docs/ai-capabilities-audit-2026-11-08` · 2026-11-09
  **Affects:** planner and other budgeted `agent-over-door` runs in tracy-web. The next call receives AGENT_BUDGET at equality, and the existing past-budget path uses the same reason wording.
  **Why / Measured:** a scripted first call cost exactly $1 on a $1 budget. Before the fix, a second request was dispatched; after it, only the first request was dispatched. One call can still exceed the budget before billing is known.
