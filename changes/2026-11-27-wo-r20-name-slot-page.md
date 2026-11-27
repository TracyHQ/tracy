- **R20 takes a brand title slot that the kit names by its page** — David (WO) · #771 · `fix/wo-plan-page-titles` · 2026-11-27
  **Affects:** the plan check (`rules-page-titles.js`, checker `site-plan-check/13`), on every CMS.
  - A kept page whose title is the business name is the brand step's to write, judged by the blocks that hold the slot. A WordPress kit names that slot's `block` as the page (`page-contact-us`), not the kit block (`body-contact-us`), so the delegation never matched and R20 failed.
  - A name slot that names another page or another block still fails.
  **Why:** dev `arabian-tea-wp5` and `wp7` (26–27/11): JA Diner WordPress's contact title is the business name, so no plan could pass R20. Every WordPress build ended with the planner "failed, best version used".
- **A chain copy drops the alts of frames the final plan no longer has** — David (WO) · #771 · `fix/wo-plan-page-titles` · 2026-11-27
  **Affects:** the copy step's alignment to the final plan (`site-writer/base-copy-align.js`), before every check.
  - W09 failed "alt text for a frame the plan does not have" when the plan's fix rounds dropped a frame after the draft copy. That has one right answer, which needs no model.
  **Why:** dev `bxr-london-lat38` (27/11): 12 such alts stood through both copy fix rounds, and the copy step ended "failed, best version used".
