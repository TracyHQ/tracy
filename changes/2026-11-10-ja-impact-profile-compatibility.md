- **Record JA Impact 1.0.6 design-system CSS compatibility.** — template readiness maintainer · #625 · `fix/ja-impact-readiness` · 2026-11-10
  **Affects:** The Joomla design-system profile includes quickstart 1.0.6 in its checked version range and preserves the earlier compatibility history.
  **Why / Measured:** Stock CSS-1/CSS-2 pass on the pinned webroot. All 12 stock-scope stylesheets are byte-identical to checked 1.0.5; all seven palette-painting sheets read the slot, with 1063 reads and no drops.
  **Limits:** Static compatibility evidence only; no fresh runtime measurement or complete design-system readiness claim.
