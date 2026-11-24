# Content gaps — tracy-nova (P1, from the crawl and the model)

- 16 asset references in the crawl do not resolve (`inventory/assets.json`): `chosen-sprite.png` (Joomla admin form widget, not drawn on the public site) and `images/demo/misc/wm-bg.png` (a watermark background named by a compiled stylesheet, never requested by a public page). Not part of the design.
- Golos Text is requested from Google Fonts at run time by the source (`css?family=Golos+Text:400,500,700`); the snapshot holds no font file for it. The three files were fetched from that request on 2026-11-24 into `src/fonts/` (D6).
- Project fields `prj-client-name`, `prj-budget`, `prj-client`, `prj-services`, `prj-date`, `prj-completed` are not in the article body of the 18 project posts: the adapter keeps them in `content.json` (`joomla.fields`). P2 carries them into post fields (the Essence `ctm_*` class, DECISIONS D12 there).
- The category-blog archive prints "More Articles …" link-only titles under 9 cards (Joomla core string); the EmDash list pages by the cards alone.
- Front-end account pages (login, registration, profile), Typography, Offline and Error demo pages: not ported (D8), as Essence D8.
