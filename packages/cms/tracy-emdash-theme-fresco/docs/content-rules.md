# Content and owner decisions

Read ../AGENTS.md. Decisions of this port are in `DECISIONS.md` (repository checkout); the ones an installer needs:

- Licence GPL-2.0-or-later under JoomlArt's grant; demo pictures ship as seed media; fonts are SIL OFL (notices in `src/fonts/`). Provenance: `PROVENANCE.md`.
- One Home only; Home 2/3, accounts, typography, offline, error and smart-search demo pages are not ported.
- Social links, tile links and footer links that are `#` in the source are plain text/glyphs, never links; third-party embeds (a YouTube video) are click-to-play facades.
- Missing material stays missing: no alt text exists in the source (pictures print empty alt), dish prices, hours, addresses and testimonials are demo content (see `inventory/content-gaps.md` in the repository checkout). White text on the accent colour follows the source (contrast 1.6:1): an open owner question (DECISIONS D13).
- Seed changes are separate from edits to an installed customer's site; `tools/personalize.mjs` (map: `seed/personalize.json`) is the only tool that rewrites demo words for a customer.
