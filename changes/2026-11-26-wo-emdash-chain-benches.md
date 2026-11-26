- **An EmDash chain build gets past its brand, pictures and setup hold** — David (WO) · #757 · `fix/wo-emdash-chain-benches` · 2026-11-26
  **Affects:** staff chain builds of JA Diner on EmDash (`STEP_CHAIN_STAFF_TEMPLATES`). Joomla and WordPress do not change.
  - The brand step names the EmDash release's design system slot contract (`emdash-tracy-diner`, through `quickstartContractOf`). Before, it looked for a Joomla slot of the product name.
  - The picture bench opens the kits it lists, EmDash ones included: `openKitWithMap` reads the kit index.
  - A run on EmDash needs no webroot seal, because its words live in its database and every setup write is an Apply door row. Its setup commit before the repair step is nothing to do. `WEBROOT_SEALED` in `sites/brief-build.js` lists the platforms that are sealed: Joomla and WordPress.
  **Why:** the EmDash Diner chain build `arabian-tea-em2` on dev (25/11) failed `BRAND_FONT_UNRESOLVED` and `SITE_PICTURES_KIT_UNKNOWN`, and then stopped `STEP_CHAIN_SETUP_HOLD_UNPROVEN` before the write step.
