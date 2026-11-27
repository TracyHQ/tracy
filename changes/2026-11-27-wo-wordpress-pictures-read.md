- **WordPress pictures read back as the site holds them** — David (WO) · #PR · `fix/wo-wordpress-pictures-land` · 2026-11-27
  **Affects:** the write step and the site check on WordPress (`site-doors/wordpress.js`). Joomla and EmDash do not change.
  - The plugin's inspect answers a picture slot's current value in `slots`. Its `imageSlots` is the demo picture a new one must match in shape. The door read `imageSlots` as the current value, so every picture Tracy placed read back as the demo. It now reads `slots`, and keeps the demo as `sample`.
  - A picture line is reported at the path the plugin placed it under, `wp-content/uploads/tracy-content/<sha256>.<ext>`, which is the path the page prints (`lineOf`). Before, the line said `images/tracy-content/…`, so pictures the pages printed read as "written and not printed".
  **Why:** dev `arabian-tea-wp7` (27/11): 20 pictures were on the pages (about-us printed 10), yet the final check counted them as unprinted demo.
