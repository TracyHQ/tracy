- **The accent module keeps the template's cascade order** — David (WO) · #769 · `fix/wo-accent-cascade-order` · 2026-11-27
  **Affects:** the accent-only brand module the write step builds from the template's stylesheets (`lib/brand-accent/`), and the look guard's judge of it. Every CMS that wears one.
  - The module repeats each accent route at the end of the page. A later template rule of the same weight that set the same colour won in the template, but lost to the repeated route. Such rules are now repeated after the route, word for word, in source order.
  - A rule only counts as competing when it has the same specificity and importance, sets the same colour channel (ground, a border side, the outline or the words), uses one compound selector on both sides, and could reach the same element.
  - Status rules and rules that write the old accent by hand are not repeated.
  - The look guard accepts a repeated rule only as the template writes it.
  - A sheet linked twice is read once, as its last copy.
  **Why:** dev `arabian-tea-lat37b` (27/11): the phone menu button `.btn.btn-primary.off-canvas-toggle` was painted in the accent on every page (5 brand-accent blocks). The rebuilt module measured 0 changes on four pages at desktop and phone width.
