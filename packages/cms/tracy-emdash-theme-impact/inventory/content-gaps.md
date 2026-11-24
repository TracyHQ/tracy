# Content gaps — what the source does not give, or the port does not carry

| Item | State | Decision |
|---|---|---|
| Front-end accounts (Login, Registration, Profile, Password reset, Username reminder), Typography, Offline, Error and Smart Search demo pages, Featured Articles, Author listing, the `Pages` drop-down | not ported | D7 |
| The `children` category (Joomla "Category Blog", 10 demo articles) | not ported | D7 |
| Footer links whose menu item has no page (Store Locations, Registry, Shipping info, Term of service, Careers, Affiliates, Track your order) | plain text | D11 |
| Social profiles (`#` in the footer and the Home; JoomlArt's own address on the Contact page) | plain glyphs, no link | D11, D14 |
| The AcyMailing subscribe form of the Home | a Forms-plugin form with the same two fields; its button stays disabled until the form is bound | D15 |
| The Google map of the Contact page | not embedded (a third-party request before the click); the address and an `Open in Google Maps` link | D14 |
| The share buttons of the article pages (a JavaScript widget that stays empty offline) | not ported | D11 |
| The video of the Home's `Stay connected` band (YouTube `5kozt0uDa4c`) | click-to-play: the picture and a button, nothing is loaded before the click | D11 |
| The dark-mode toggle | the source renders none (`docs/design-system.md`); the port honours the OS | D12 |
| The second `Charity of the month plan international UK` article (`-2`) | kept, its alias is the slug | shape-model |
| The licence line "Joomla! is Free Software released under the GNU General Public License." | not ported (the package licence is in `PROVENANCE.md`) | D10 |
| Section background pictures of the Home (`features/bg-1.jpg`, `gallery/bg-1.png`) | shipped as template decor under `public/decor/`, not as seed media | D5 |
