# Content and owner decisions

Read ../AGENTS.md. Decisions of this port are in `DECISIONS.md` (repository checkout); the ones an installer needs:

- Licence GPL-2.0-or-later under JoomlArt's grant; demo pictures ship as seed media. PT Root UI and Be Vietnam Pro are SIL OFL (notices in `src/fonts/`). Provenance: `PROVENANCE.md`.
- One Home only (the source's "Home Style 1"); Home Styles 2 to 4, the account pages, typography, offline and Joomla list pages are not ported.
- Links that are `#` in the source (the footer's link columns, case cards, social icons of the top bar) are plain text or left out, never links; the hit counter and the login box of the blog sidebar are not ported.
- Missing material stays missing: no alt text exists in the source (pictures print empty alt); names, quotes, logos, addresses and figures are demo content that `tools/personalize.mjs` (map: `seed/personalize.json`) replaces or removes for a customer.
- Seed changes are separate from edits to an installed customer's site; `tools/personalize.mjs` is the only tool that rewrites demo words for a customer.
