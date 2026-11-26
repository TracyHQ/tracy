- **The WordPress plugin's inspect is read as a list of slots, so a WordPress chain build writes its words** — David (WO) · #762 · `fix/wo-wordpress-inspect-shape` · 2026-11-26
  **Affects:** the write step and the site check on WordPress (`readingOnPlatform`, `wordpressReading`). Joomla and EmDash do not change.
  - The Claude Cowork for WordPress answers `content.contract inspect` with `slots: {<key>: <words>}` and its pictures in `imageSlots`. The write step and the site check read `slots` as a list, as the Joomla plugin and the EmDash door answer it.
  - The WordPress door now reads the plugin's answer as `[{key, current, type}]`, with picture slots typed `image`. This applies to the write step's door, the chain's site check door and the bench's `check`.
  - On WordPress, the closing rule's "the kit or the site does not let … be emptied" now reads as "not on WordPress yet", because the plugin empties no slot yet.
  **Why:** `arabian-tea-wp2` on dev (26/11) read the plugin's `slots` as empty. Every change was left out as "the site does not have the slot", and the build wrote nothing (written 0, skipped 281).
