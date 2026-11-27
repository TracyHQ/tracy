- **EmDash pictures are reported at the address the site draws them** — David (WO) · #PR · `fix/wo-emdash-picture-lines` · 2026-11-27
  **Affects:** the EmDash content contract's apply answer (`sites/emdash-contract.js`, new `placed`) and the write step's EmDash site door (`answerOf`, `lineOf`). Joomla and WordPress do not change.
  - The media library keeps a picture under its own storage key, so the run's path `images/tracy-content/<sha256>.<ext>` names no file a page draws. The apply answer now says where each picture written sits, `/_emdash/api/media/file/<key>`, and the write step reports each picture line there.
  **Why:** dev `arabian-tea-em5` (27/11): placed pictures read back as "not held" (4) and as "written and not printed" (4), though the pages painted them.
