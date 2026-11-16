- **A hide no kept page prints is no longer a read-back block** — David (with Claude) · #666 · `fix/unshown-read-back` · 2026-11-17
  **Affects:** Rebuild and deploy tracy-web. Write report lines of `unshown` hides carry `printed: false`; the site check's `read-back` reads them as a match instead of asking for an empty slot.
  **Why / Measured:** Dev, 16/11/2026, Arabian Tea House on JA Diner: four category titles printed only on dropped blog pages and a masthead background the kit read on no page were five read-back blocks. Case REG-PR-666-unshown-read-back.
