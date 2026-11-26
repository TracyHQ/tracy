- **The write step writes WordPress pictures and addresses and empties demo words there, through the plugin's existing contract** — David (WO) · #PR · `feat/wo-wordpress-pictures-links-empties` · 2026-11-26
  **Affects:** the write step on WordPress (`write-step/site-doors/wordpress.js`), staff chain builds of JA Diner WP. Joomla and EmDash do not change. No plugin release is needed: the Claude Cowork for WordPress already takes all of this.
  - Pictures: an upload of the write step goes to the plugin's folder for image slots (`wp-content/uploads/tracy-content/<sha256>.<ext>`), and the image slot gets that path in the one apply. The site check compares pictures by file name, so its read-back is unchanged.
  - Addresses: a `url` slot's link is sent. Before, it was refused as not on WordPress.
  - Emptied slots: a text or address slot is emptied by writing `''`. The WordPress inspect marks those slots `canHide: 'unmeasured'`, and the door adds `hide_ops` to the plugin's `info`, so the hide stage and the closing rule empty demo words. A picture slot cannot be taken off yet; its line says so.
  - A WordPress menu item only links to its page, so an item the plan hides no longer holds its page (`menuOwnsPage: false`).
  **Why:** `arabian-tea-wp4` (dev, 26/11) still had 20 demo words, 20 demo pictures and 18 link faults. Everything that blocked fixing them was on the Tracy side.
