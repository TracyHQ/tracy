# Tracy guide articles (guide)

Each article in `articles/` covers one thing a customer **can do in Tracy**: where, who can do it, the steps, common errors.
Two readers use the same set of articles:

- **the agent in a site's chat** — the `tracy_guide` tool (`@tracy/dsh-site-tools`) calls `GET /api/sites/_conversation/guide`;
- **`/help`** — `guideFacts` in `assistant/prompt.js`.

Why it exists: a customer who did not know how to point DNS asked the chat agent right away, and the agent knew nothing about Tracy; `/help` was
hand-written, so the domain feature (shipped later) was missed and then described wrongly. One source, two readers, one gate against omissions.

## Writing an article

```
---
id: own-domain                 # = file name, lowercase, hyphenated
title: Connect your own domain (DNS)
switch: site-connect-domain    # id in packages/core/tracy-core/src/ui-switches/catalogue.json, or none:<reason>
tab: tracy:site-publish        # the Tracy tab that opens this feature ('' if it has no tab of its own)
roles: [owner]                 # who CAN DO it ([] = every role); other roles are told "ask <role>"
platforms: [wordpress, joomla, emdash]
keywords: [domain, dns, ten mien, tên miền, ...]   # Vietnamese too, with and without diacritics
checked: 2026-10-21 @ 6ecf4261ee    # date + commit the article was checked against the screens and code
---
Body: English, written for customers (no more technical than the screen)...
```

- Wording comes from **real UI strings** (`packages/**/strings.ts`) and the doors' rules (`apps/tracy-web/src/sites/*.js`), not from memory.
  If unsure, **leave it out**; when something is missing, the model says "I don't know" and gives the Discord link (principle #3 of CLAUDE.md).
- A new feature customers see = a switch in `catalogue.json` **+ an article here**. The `guide-coverage` gate goes red if it is missing.
  Exempt (`scripts/guide-exempt.json`) only when customers do not *use* it as a feature (it only shows/hides a piece of the page), with a reason.
- Update `checked:` every time you re-check.

## Review notes (drafted, wording not yet reviewed)

All 12 articles were written by an agent from code and UI strings on 21/10/2026; **nobody has reviewed the tone yet**. To review:

- Tone and length: split long articles into shorter paragraphs/steps; change any sentence more technical than customers need.
- `own-domain.md` — the most important article (customers ask about it most). The DNS part has been confirmed: TXT at `_tracy.<name>`, CNAME, "DNS only"
  on Cloudflare, the name held for 72 hours, a wait of up to about 1 hour, apex domains refused, Back to draft drops the domain.
- `pricing.md` — only says "not announced yet"; change it when prices exist.
- `backup-restore.md`, `export-zip.md` — many details (20 DB copies, 24 hours, email code, install code): check they are still correct.
- Vocabulary: follow `docs/references/vocabulary.md` (four banned words). The `vocabulary` gate does not scan this folder yet — check by hand.
- Missing articles: Inbox, Brand, Files, comments on a page. The gate currently exempts these switches with a reason ("no customer has asked yet").
