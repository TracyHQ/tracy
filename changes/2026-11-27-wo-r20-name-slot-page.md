- **R20 takes a brand title slot that the kit names by its page** — David (WO) · #771 · `fix/wo-plan-page-titles` · 2026-11-27
  **Affects:** the plan check (`rules-page-titles.js`, checker `site-plan-check/13`), on every CMS.
  - A kept page whose title is the business name is the brand step's to write, judged by the blocks that hold the slot. A WordPress kit names that slot's `block` as the page (`page-contact-us`), not the kit block (`body-contact-us`), so the delegation never matched and R20 failed.
  - A name slot that names another page or another block still fails.
  **Why:** dev `arabian-tea-wp5` and `wp7` (26–27/11): JA Diner WordPress's contact title is the business name, so no plan could pass R20. Every WordPress build ended with the planner "failed, best version used".
