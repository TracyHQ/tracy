- **Keep copy file deletions after Undo of a live push.** — David · #96 · `fix/sync-delete-undo` · 2026-10-29
  **Affects:** Successful file deletes now leave a null-blob receipt. The following Sync reads it and preserves Tracy's deletion on the copy while restoring the live file; unrelated live changes still arrive.
