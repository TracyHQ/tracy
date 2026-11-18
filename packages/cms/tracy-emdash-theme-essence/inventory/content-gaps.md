# Content gaps — tracy-essence (P1, from the crawl and the model)

- 14 asset references in the crawl do not resolve (`inventory/assets.json`): 11 × `chosen-sprite.png` (Joomla admin form widget, not drawn on the public site) and 3 Font Awesome 5 `.svg` font fallbacks (the `.woff2` files are served). Not part of the design.
- Article fields `ctm_*` (video source and id, gallery pictures) are carried by `enrich-essence.mjs` into `kind`, `video_id`, `gallery` (D12); `ctm_width`, `ctm_height` and `ctm_thumbnail` are not (the player is responsive; the thumbnail is the post picture).
- The spec-pack reports INVALID on three points that the Diner run also had (identity summary fact, pending design decisions, source-fonts browser evidence); the model is still emitted and used.
- Design-spec slots the source could not fill: wide width, card padding, border/heading/surface (light and dark), section rhythm, content width — measure at P1/P3.
- `--body-bg-color` differs across the five Home styles (#12–#16): the Home variants are not one palette; see DECISIONS D8.
- Source fonts: Jost and Noto Serif are loaded from Google at render time; the exact files are shipped locally (D14); Jost has no Vietnamese letters (D14).
