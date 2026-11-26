- **On EmDash, a write step line that failed only because EmDash has no door for its stage is skipped, with words that say so** — David (WO) · #758 · `fix/wo-emdash-not-on-lines` · 2026-11-26
  **Affects:** the write report and the site check of staff chain builds on EmDash. Joomla and WordPress do not change.
  - Two kinds of line become `skipped` with the reason `not on EmDash yet: <the stage's words>`: lines the EmDash site door answered itself (`not_on_emdash`), and lines of a stage that read `info` and found its door closed.
  - Two stages produce such lines: the page title and description (JA Diner on EmDash has no SEO field, and its document title is the page's own title slot) and legal page creation.
  - The site check's read-back takes only failed and refused lines as faults.
  **Why:** the EmDash Diner build `arabian-tea-em3` (26/11) had 52 of its 98 blocking faults from such lines. They read as refusals of the site ("plugin-refused"), although nothing was ever sent.
