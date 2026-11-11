- **Refuse chain retries without an exact restart authority before reserving daily usage** — David issue completion · #509 · `fix/david-demo-content-residue` · 2026-11-12

**Affects:** People retrying a failed site build after an interrupted placement, a changed or successful generation, or another active writer. A failed action or failed stored QA no longer accepts another action that can only return the previous result. Legitimate chain retries still require the existing exact generation, owner and writer checks.
