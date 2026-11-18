# Content gaps — tracy-essence (P1, from the crawl and the model)

- 14 asset references in the crawl do not resolve (`inventory/assets.json`); classify each at P2 (external, dev-only, or missing).
- Article fields `ctm_*` (video type, source, embed URL, thumbnail, width, height, gallery) are not placed by the adapter; the
  Video and Gallery detail pages (`/detail/video`, `/detail/gallery`) and six articles carry them. Decide at P2 how each maps (`--article-fields`).
- The spec-pack reports INVALID on three points that the Diner run also had (identity summary fact, pending design decisions, source-fonts browser evidence); the model is still emitted and used.
- Design-spec slots the source could not fill: wide width, card padding, border/heading/surface (light and dark), section rhythm, content width — measure at P1/P3.
- `--body-bg-color` differs across the five Home styles (#12–#16): the Home variants are not one palette; see DECISIONS D8.
- Source fonts are loaded from Google at render time (Jost, Noto Serif); no file in the release. Fetch the exact files at P3 (D6).
