- **Keep dynamic CMS sentences bound to their language formats** — template readiness executor · `fix/ja-symphony-readiness` · 2026-11-11

  CMS fixed-text discovery now carries the actual matching language file, constant and format. Hide measurements count current whole-line format occurrences, so a counter changing from 24 to 25 cannot look like the sentence disappeared. Absent, unreadable or competing formats remain unknown; static literals, short-candidate handling and override restoration retain their existing behavior. The kit joins a dynamic sentence once within its block instead of also retaining stale counter text as unbound template words.

  **Affects:** Joomla template-kit CMS sentence discovery, hide measurements and site merge. Focused pure regressions cover the changed source behavior; existing saved kits and measurements are unchanged and require actual re-observation before acceptance.
