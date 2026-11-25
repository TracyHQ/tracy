# Content and owner decisions

Read ../AGENTS.md. Decisions of this port are in `DECISIONS.md` (repository checkout); the ones an installer needs:

- Seed changes are separate from edits to an installed customer's site; `tools/personalize.mjs` (map: `seed/personalize.json`) is the only tool that rewrites demo words for a customer.
- Missing material stays missing: no alt text, prices, openings, addresses or testimonials are invented. Distribution price is distinct from license terms. Preserve upstream notices.

## Personalization map (`seed/personalize.json`)

Which rule owns which demo words (LANG-2: every word a component prints reaches one of them; `tests/lang2-printed-words.test.mjs` derives the printed fields from `src/**` and fails when one is uncovered):

- **identity** (the customer's own answers, written exactly): the brand name (`chrome.brand_name`, `chrome.logo_text`), the copyright line (`{year}` and `{name}`), the header phone and e-mail, the contact page's address, phone and e-mail. An unanswered contact value keeps the demo's, named under `unanswered`.
- **replace** (demo brand to the customer's name, everywhere): "JA Nova", "Nova" and "Salmon" (whole words); `demoCompanyNames` also lists the demo client "Microsoft App Holing Ltd".
- **copy** and **blocks** (written by the model for the sector): the home hero heading and line, the footer line, the intro headings and lines, the service and value cards, the expertise cards, the logo-slider words, the call to action, the team heading, the pricing heading, the FAQ (heading, line and every question and answer), and the contact intro.
- **rewrite**: all 45 demo posts (27 articles, 18 projects): title, body and tags (the topic words, one per line).
- **facts** (removed, never invented): counters and their headings, the demo video, open positions, the named team members, the price plans, the demo authors and their pictures, and the client, client contact, budget, services, date and web address of every demo project.
- **labels** (interface words, translated and never rewritten): the whole `chrome` entry (every word the template prints, accessible names included) and `contact` entry, page titles, the button and heading words of the sections.
- **forms**: the contact form of `tools/forms.json` (`contact-en`): labels and placeholders from the rule, the notification address from the `email` answer (`notifyEmails`).
- **terms**: the blog categories.

`keptText` is empty: no printed demo word is left on purpose. A kept word would be listed there as `collection/slug.field` and its reason written in this file; `tests/lang2-printed-words.test.mjs` checks both.

Known and left: the Forms plugin's own words are translated by `FormWords.astro`, not by the map; a post's cover and body pictures stay the demo's until the customer replaces them; the network names of the social rows ("Facebook") are translated as labels.
