- **The look guard judges the EmDash brand writes** — David (WO) · #775 · `fix/wo-emdash-brand-guard` · 2026-11-27
  **Affects:** the write step of every EmDash Website opportunity build whose brand step passes (`write-step/look-guard.js`). Joomla and WordPress do not change.
  - `emdash.settings` and `emdash.entryField` (the logo, the tab icon and the dark logo, #754) were open in the look guard's list of actions but had no judge, so the first brand write threw `JUDGES[action] is not a function` and ended the write step. Each now has one: only the places the kit names (`settings.logo`, `settings.favicon`, `chrome.logo_dark`), one media reference each. Reading them back is a read.
  - An action that is open but has no judge is now held back with that reason, instead of ending the run.
  **Why:** dev `arabian-tea-em7` (27/11): the first EmDash build whose brand step passed (#774) failed its write with that error. Every earlier one had failed its brand step, so the gap never showed.
