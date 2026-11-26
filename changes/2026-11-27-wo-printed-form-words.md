- **A form field's placeholder, and a template string a body script fills a hint from, count as printed** — David (WO) · #PR · `fix/wo-printed-form-words` · 2026-11-27
  **Affects:** the printed rule shared by the write step and the site check (`lib/printed-in-body.js`): `written-not-printed` and the write step's printed stage. Every CMS.
  - An `<input>` or `<textarea>` prints its `placeholder` to the visitor, as an image prints its `alt`.
  - A `languageString-` slot also counts when an inline script of the body holds it as a whole string value. A template that fills its form hints by script reads them that way: JA Boxing's `window.ja_lang`.
  - Other scripts, the head and scripts loaded by address still never count.
  **Why:** dev `bxr-london-lat36` (26/11): the contact form's four hints blocked as written and not printed, though the page shows them.
