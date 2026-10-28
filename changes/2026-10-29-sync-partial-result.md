- **Keep the complete acknowledged write list when Sync to live stops partway.** — David · #75 · `fix/sync-partial-result` · 2026-10-29
  **Affects:** Failed live pushes remain undoable. The writer drains active requests before saving a partial result, and the shell records live IDs and forwards that result instead of discarding its written items. Rebuild the fleet dsh image to deploy.
