- **Brief build pictures: drawings go to shown pages, claim strips clear, worded photos stay out of heroes and cards, cut-outs stand where the demo figure stood** — Akemi (Claude) · #189 · `feat/brief-build-own-site` · 2026-10-29
  **Affects:** every brief build and Customize build that fills a Joomla template's pictures from the owner's photos.
  - The drawing cap is spent only on slots of pages the site keeps; a demo post the tidy-up takes off is never drawn.
  - A claim picture (`stat.proof_image`, a strip of customer faces) with no brief picture is cleared when its file can be transparent, instead of a colour block.
  - A photo the labeller saw words added on (`hasTextOverlay`) never fills a hero, a card, a background or an offering slot, and is never extended or used as a drawing reference; a gallery tile takes it only when no clean photo is left.
  - A drawn cut-out is trimmed to its object and set in the place the demo's figure stood (as large as that place holds, on its bottom edge); the object prompt asks for it large (prompt d5).
  **Why / Measured:** a local brief build spent 14 of its 20 drawings on demo posts nobody sees and gave a shown offering picture a colour block; the claim strip showed an empty gradient pill; owner photos with a burnt-in "TENNIS DAY" and "AFTER" label could reach any slot; the hero cut-out floated across the headline.
