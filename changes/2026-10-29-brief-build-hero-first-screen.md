- **A brief build's first screen says what, where and how to contact** — brief-build agent · #189 · `feat/brief-build-own-site` · 2026-10-29

**Affects:** brief builds on Joomla (T4 and T3): the home hero subline and its main button. WordPress and EmDash brief builds are not covered yet.

- The site plan finds the home page's hero by slot role and module position (hero, slideshow, masthead, banner), its words by role, else by field or element, and plans its lines (`hero-first-screen.mjs`, reasons `hero-what`, `hero-contact`): the subline names the offerings the brief reads and the city or area served; the main button uses the owner's phone, else WhatsApp, else a verified booking link, else the Contact page under a label that names the action. The headline stays the owner's own words. Nothing is invented: a question the brief cannot answer is reported, not filled.
- The Joomla engine writes those lines over the copy writer's, on an English site, and the left-demo sweep never empties them.
- The leftover report gains `heroMissing`: which of what, where and contact the served first screen does not answer. `pass` is unchanged.
