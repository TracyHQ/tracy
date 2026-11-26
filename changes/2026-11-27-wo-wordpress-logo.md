- **The write step writes the logo, the dark-background logo and the tab icon of a WordPress site** — David (WO) · #765 · `feat/wo-wordpress-logo` · 2026-11-27
  **Affects:** the brand stage of the write step on WordPress (staff chain builds of JA Diner WP). Joomla and EmDash orders do not change.
  - A logo spot set by a WordPress option (`site_logo`, `tracy_logo_dark`) is ordered `wordpress-option` when the theme header prints a Site Logo block, the evidence the Template kit gate reads (`kitSiteLogoBlock`). The tab icon is `site_icon`.
  - The picture is uploaded to `wp-content/uploads/tracy-brand/`, then `content.update {kind: "option", id: 0, key, fields: {value: <attachment>}}`. Each line reads back through `content.get`.
  - A dark spot with no picture beside a logo the brand gives is set to 0, so the site name shows there instead of the demo's logo.
  - The WordPress door and the look guard open exactly these three options. Any other option, or `key` on a row, is never sent.
  **Why:** dev 26/11 (`arabian-tea-wp4`): the logo was ordered through the T4 site profile, which WordPress has no door for, so the demo logo stayed.
