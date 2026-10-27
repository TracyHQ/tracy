---
description: The two badges on a customer site are served from tracy-web and read their configuration from the badge_setting table; the team edits text, colours and corner at /ops/widget, no free-form CSS; the last Cloudflare trace on the customer page is retired
sources:
  - apps/tracy-web/src/lib/badge-setting.js
  - apps/tracy-web/src/lib/seat-badge.js
  - apps/tracy-web/src/lib/tracy-badge.js
  - apps/tracy-web/src/badge/route.js
  - apps/tracy-web/src/ops/widget.js
  - apps/tracy-web/src/db/migrations/023-badge-setting.sql
---

# 0019 — Badge served from tracy-web, configured in `badge_setting`

**Status:** accepted · 19/09/2026 · settled by Lee

## Context

A customer site carries **two badges**, two jobs:

- **the seat pill** (variant `draft`/`managed`) on the customer's working copy — it knows who the viewer is;
- **the advert badge** (variant `advert`) on a demo — no session, no cookie, just a banner.

Until 18/09 the seat pill still loaded its script from `https://tracy.ai/dashboard/badge.js`, a Cloudflare Worker
in `tracy-infra`. TCH removed Cloudflare from every door on 16/09; this is the last trace, and it sits
exactly where it costs most: any work on the badge (changing text, adding a Chat door) is **two-repo** work,
and one word on the pill needs a deploy.

## Decision

1. **All three badge scripts are served from `apps/tracy-web`**: `/badge.js` (seat pill, ported from
   `tracy-infra/dashboard/src/badge/main.ts`), `/tracy-badge.js` and `/build-with-tracy-demo.js`
   (advert — two separate copies as Lee wanted on 16/09, both reading one configuration). `config.badgeUrl` defaults
   to `${origin}/badge.js`; `BADGE_URL` still overrides it.
2. **Configuration lives in the `badge_setting` table** (migration 023): two rows `seat` · `advert`, a jsonb document,
   optimistic `revision` like `demo_domain`. No seed — a missing row means the defaults in code, and the
   defaults **are** today's badge.
3. **The validator is the schema, run on both read and write** (`lib/badge-setting.js`): unknown keys are
   rejected, colours must be `#rrggbb`, labels 1–40 characters with no tags. A stored row that the current
   validator does not accept is **not served** — the defaults are served, at that row's exact revision,
   so the next save replaces it instead of colliding.
4. **The team edits at `/ops/widget`**: label + on/off for each door, three colours, corner, logo. **No free-form
   CSS field** — the script runs on the customer's page; a CSS string typed by a person is an XSS door, and one
   `position:fixed` covers the whole site. The preview is the very script that will be served, running in an iframe, not
   a redrawn copy.
5. **The script never makes the customer page 500**: no pool, no row, DB down — all fall back to the
   defaults. Cache `max-age=300`, so a save reaches the site within ≤5 minutes.

## Which seat-pill doors come along, which do not

Per `CLAUDE.md` §0.3 — do not invent doors: only port doors that really exist in TCH. **Come along**: home link
(`data-home-href`), Signed in as / Sign in and Team (`data-team-href`), Create (`data-create-href`),
the hide button. **Do not come along**: Publish site (points to the retired dashboard), Proposals (dropped by the design
of `bar/badge.js`), Open in Tracy Desk (TCH never passed an href), and the **error collector**
(`collector.ts` fires `POST /__tracy/errors` — there is a `preview_error` table but no route receiving it;
recorded as separate work).

The **Chat** door is the next piece of work (Lee, 18/09: only for sites on `*.tracy.ai`): `rows()` in
`seat-badge.js` returns an array; adding one element that reads `data-chat-href` is enough — the plug-in point is named
in the comment at the top of the file, not built yet.

## Consequences

- No request from a customer page goes to `tracy.ai/dashboard/badge.js` any more. The old Worker in
  `tracy-infra` is left as is for anyone still pointing at it; **nothing needs to change there**.
- ⚠ A deployment that sets `BADGE_URL` explicitly to the old address still loads the Worker — a default cannot
  override an explicit value. Check `deploy/.env` on prod1 after merge.
- The advert badge drops its `prefers-color-scheme: dark` block: one colour set chosen by a person applies to every
  viewer. The defaults keep today's light values.
- Vocabulary: **Widget** is the `/ops/widget` screen; **Badge** is the pill on the site
  (`docs/references/vocabulary.md`).
