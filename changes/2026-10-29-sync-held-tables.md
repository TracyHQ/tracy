- **Hold every push into a table that Sync from live could not compare.** — David · #95 · `fix/sync-held-table` · 2026-10-29
  **Affects:** Whole-table schema-changed kept entries become changed-on-both conflicts for all affected create, update and delete items, preserving customer edits; unrelated tables still push normally.
