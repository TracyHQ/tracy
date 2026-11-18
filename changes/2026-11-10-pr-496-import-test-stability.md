- **Browser reach measurement tests wait for the fixture DOM instead of an external map iframe** — Tracy engineering · #496 · `docs/ai-capabilities-audit-2026-11-08` · 2026-11-10
  **Affects:** Tracy host test runners; the invented map fixture no longer needs Google Maps to finish loading before its local DOM can be measured.
  **Why / Measured:** The full worker suite and the isolated browser test timed out after 30 seconds on `page.setContent`; the isolated four-test file passed in 1.4 seconds after this change.
