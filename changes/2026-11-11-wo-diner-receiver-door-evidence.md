- **Diner readiness reads the write-door evidence extracted from its pinned RC2 package.** — WO pipeline maintainers · #558 · `fix/assigned-non-wo-issues` · 2026-11-11
  **Affects:** Operators checking Diner readiness; the reviewed package hash and five existing write doors are recorded without changing stable releases or sealed quickstart contracts.
  **Why / Measured:** The broad worker run reproduced the stale stable-pin assertion. Package regeneration read RC2 bytes and all 17 readiness tests passed, including missing-door and unread-package refusals.
