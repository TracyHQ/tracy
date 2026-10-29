- **Report deadline-aborted drawings as timeouts without exposing raw abort errors.** — Codex · #189 · `feat/brief-build-own-site` · 2026-10-29
  **Affects:** Brief drawing failure receipts now distinguish timeout from network failure. The legacy picture path tells the owner that the picture took too long; rebuild tracy-web to ship.
  **Why / Measured:** An already-aborted signal could throw before the model race, exposing its raw abort message. The existing Apply-deadline regression keeps its original plain-word assertion.
