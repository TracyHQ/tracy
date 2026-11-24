# Content and owner decisions

Read ../AGENTS.md. Decisions of this port are in `DECISIONS.md` (repository checkout); the ones an installer needs:

- Licence GPL-2.0-or-later under JoomlArt's grant; demo pictures ship as seed media; fonts are SIL OFL (notices in `src/fonts/`). Provenance: `PROVENANCE.md`.
- One Home only; Home 2/3, the Pages drop-down (accounts, typography, offline, error, smart search, author and featured lists) is not ported.
- Social links, tile links and footer links that are `#` in the source are plain text/glyphs, never links; third-party embeds (a YouTube video) are click-to-play facades, the Contact map is a link, not an embed (DECISIONS D14).
- Missing material stays missing: no alt text exists in the source (pictures print empty alt); the names, addresses, hours, amounts and dates of donations and events are demo content (see `inventory/content-gaps.md` in the repository checkout).
- Seed changes are separate from edits to an installed customer's site; `tools/personalize.mjs` (map: `seed/personalize.json`) is the only tool that rewrites demo words for a customer.
