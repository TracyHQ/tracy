- **The host's accent emphasis measure no longer reads a menu's label as a page title** — David (with Claude) · #665 · `fix/heading-spans-not-menus` · 2026-11-16
  **Affects:** Rebuild and deploy tracy-host. Site check group `accent-emphasis`: a heading written with its accent span is no longer failed because a menu item with the same words prints without one.
  **Why / Measured:** Dev, 16/11/2026, BXR London on JA Boxing: nine accent-emphasis blocks, all the menu's "Ways to train" matched to the masthead title that printed its span. Case REG-PR-665-heading-spans-not-menus.
