- **The write step writes a WordPress site's words through the Claude Cowork for WordPress contract, and JA Diner on WordPress runs the chain for staff** — David (WO) · #759 · `feat/wo-wordpress-write-door` · 2026-11-26
  **Affects:** the write step on WordPress, and staff chain builds of JA Diner WP (`STEP_CHAIN_STAFF_TEMPLATES` adds `ja-diner/wp7`). Customers' WordPress builds do not change.
  - `siteDoorFor('wordpress')` now writes (`write-step/site-doors/wordpress.js`). It sends `content.contract` inspect, then one `apply` of plain-text changes (the WordPress mapping, `contract-mapping-wordpress.js`: the write step now passes the kit's platform to `exportContractMapping`).
  - What the plugin does not take yet is refused by slot before anything is sent: an emptied slot, a link taken off, a picture or address slot. Calls of Joomla stages are answered by the door itself, never sent.
  - Each such line is skipped as "not on WordPress yet: …".
  **Why:** the three CMS plan, step 3 first half (no plugin release): measure the WordPress chain build. Hides, page creation, menus and pictures on WordPress need new plugin doors (step 3, second half).
