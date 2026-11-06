- **Template kit: a front page with its own alias is still `/`** — Akemi (Claude) · `feat/ja-cagox-j6-103` · 2026-11-04
  **Affects:** anyone building a template kit. Kits already built keep working; a template whose front page has its own alias needs a new kit.
  **Why / Measured:** the tool knew a front page only by the route `home`. JA Cagox routes it as `homepage`, so its kit held a false `/homepage` page and a `/` page without the home blocks: the brand step saw the wrong home picture and a plan could unpublish the home item. The tool now takes the front page from the contract's presentation lock.
  **Also:** a link label such as "Previous article: X Prev" counts as the template's own words, and the review sheet opens a kit with a frame that is empty in the demo.
