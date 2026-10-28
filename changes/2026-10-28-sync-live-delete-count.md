- **Do not count a live deletion kept as a copy edit as an imported record** — David (Codex) · #62 · `fix/sync-live-delete-count` · 2026-10-28

**Affects:** owners syncing an article deleted on live and edited on the copy. MariaDB 11: 31 tests pass, none skipped. Ships through the tracy-host image after integration and the next production release.
