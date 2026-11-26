- **A slot that is one text node of an HTML value takes the writer's paragraphs as one** — David (WO) · #PR · `fix/wo-joomla-text-node-paragraphs` · 2026-11-27
  **Affects:** the export of a site copy for the write step on Joomla (`exportContractMapping`). WordPress and EmDash exports do not change.
  - A content map slot whose `xpath` ends in `text()` holds the words of one element, so several items of the writer are joined with a space instead of `((p))` paragraphs.
  - Before, the paragraphs nested a `<p>` in the slot's element, and the parser split it. The slot's xpath then matched several text nodes, and every inspect after the write answered `contract_failed`.
  - The kits allow several paragraphs on 22 such slots of JA Diner and 46 of JA Boxing.
  **Why:** dev `arabian-tea-lat34` and `lat36` (25–26/11): the reservation text broke the contract, and the whole final check went unmeasured.
