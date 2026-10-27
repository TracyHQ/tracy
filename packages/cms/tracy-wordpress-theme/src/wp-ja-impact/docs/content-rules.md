# Content rules and provenance

- The site is a **demonstration**: JA Impact, a charity template. Names, figures, addresses,
  e-mail and phone numbers are the template's demo data, not business facts. Replace them in
  WordPress; do not invent replacements.
- Source: JoomlArt Joomla 6 quickstart `quickstart/ja-impact/j6` (template `ja_impact` 1.2.2,
  T4 framework). Pictures come from that package's `images/` folder and live in the media library.
- Fonts: Readex Pro (SIL OFL 1.1, `assets/fonts/readex-pro-OFL.txt`) and Font Awesome Free 6
  (fonts OFL 1.1, icons CC BY 4.0, `assets/fonts/font-awesome-LICENSE.txt`), self-hosted; no page
  asks an external service.
- Known gaps (recorded, not filled): the newsletter form of the source (AcyMailing) has no
  WordPress counterpart; the Google map module is not drawn (the source draws none either);
  author biographies are plain text; registration and the username reminder use WordPress's
  own fields (no name, password or profile fields at sign-up).
- The footer keeps the source's words, including its sentence about Joomla; the owner decides
  whether to keep it (editable in the footer part).
- Product decisions with their defaults are in the build task's `DECISIONS.md` (open questions
  are marked OPEN there).
- Do not publish legal text, prices or people that the source does not carry.
