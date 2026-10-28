- **Preserve foreign keys through whole-table sync and partial restore** — David (Codex) · #59 · `fix/sync-foreign-keys` · 2026-10-28

**Affects:** owners syncing extensions with relational constraints. Child constraints keep their columns, actions and site-local targets; referenced parent tables can be replaced. Partial restores rebuild incoming and outgoing constraints and retain a durable recovery plan before DDL. Invalid merged references cause rollback. Ships in the tracy-host image after integration and the next production release.
