- **Scope Joomla contact demo-content edits to their row and field.** — Quickstart release maintainers · #625 · `fix/ja-nova-readiness` · 2026-11-10
  **Affects:** Quickstart release builders can use contact entities with the existing row or whole-field replacement descriptors. Contact tables require entity-scoped edits, matching other contract entities. Existing count, field and table-prefix guards still apply.
  **Why / Measured:** Synthetic checks cover column order, target identity, unrelated rows and fields, refusal cases, and consistent dump, lock and slot samples.
