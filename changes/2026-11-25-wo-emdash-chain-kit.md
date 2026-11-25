- **A chain build on an EmDash release finds its template kit** — David (WO) · #756 · `fix/wo-emdash-chain-kit` · 2026-11-25
  **Affects:** the chain's kit step, for staff builds of JA Diner on EmDash (`STEP_CHAIN_STAFF_TEMPLATES`).
  - A run on an EmDash release carries no sealing profile, because the site needs no Claude Cowork plugin. Its kit now comes from the kit index, at the site's `quickstart_tag` and `quickstart_version`.
  - A run that carries its profile (Joomla) works as before.
  **Why:** the first EmDash Diner chain build on dev (25/11) stopped at its first step with "no readable template kit for tracy-diner/emdash-0.x".
