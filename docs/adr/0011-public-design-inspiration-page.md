---
description: The Design inspiration page is a public page with a proper URL, shared by marketing and by the tab inside dsh; typing a domain changes the text immediately and the brand card runs in two passes on the guest lane
sources:
  - packages/design/tracy-design-inspiration/src/client/PreviewDialog.tsx
  - packages/design/tracy-brand-engine/src/host/pipeline.mjs
  - workers/cowork-web/wrangler.toml
  - vendor/tracy/dsh-better-sidebar/src/client/BrowserView.tsx
---

# 0011 — The public Design inspiration page: one codebase, two surfaces

Status: **binding** (Lee settled the direction and the three remaining points 07/09/2026 18:50–19:25)

## Context

The Design inspiration page today is a side card tab plus a popup (`PreviewDialog`), living
**inside the dsh page**, visible only to someone with a seat on a site. It has no URL: it cannot be opened
in the side card's Browser tab, cannot be placed on the marketing site, and no link can be sent to anyone.

On the same day, two needs converged on one spot:

- Lee wants to use better-sidebar's Browser tab as a stage to guide customers: open a page, ask, open the next
  page, and finally open their own home page. The Browser tab is an iframe **sandboxed without `allow-same-origin`**
  (`BrowserView.tsx`): the page inside has an opaque origin, Chrome sends no cookies, so every page served
  through dsh on a lane is blocked by the seat door — measured 05/09 with the fixture (grey box). Only a **public** page
  lives in the Browser tab.
- This page by nature needs no authentication: OpenDesign's 152 systems are public data, the sample text belongs
  to the authors. The only private things are the customer's text, the customer's brand, and the write buttons.

Better-sidebar also already has three tools for the agent to drive the Browser tab (`sidebar_open`,
`browser_read`, `browser_reload`, the host pushes commands down through `/sidebar/ws/agent-opens`), so a page
with a URL is all that is missing for the agent to "open a page for the customer to see".

## Decision

1. **One page, one URL: `cowork.tracy.ai/design-inspiration`.** The library at the root; one system at
   `/design-inspiration/<id>`; the view state goes in the query (`?page=/pricing/&device=mobile&theme=dark`).
   The page is a static build (mode A, Vite) of the new package `packages/web/tracy-design-page`, served
   by `cowork-web`'s Workers Static Assets next to `/cw-assets/*`. No new Worker.

2. **The page is the code's source of truth; dsh only embeds it.** `Gallery`, the body of `PreviewDialog`,
   `fixture.ts`, `fill.mjs` move to the page package and are reused by `tracy-design-inspiration`. The
   Design inspirations tab in dsh becomes an **iframe pointing at the page** plus a versioned **`postMessage` bridge**:
   the parent pushes down `site` and the lane's copy, the child reports intents up (`choose`, `create-with`,
   `more-version`, `open-brand`). The plugin receives the intent and then does the part that needs a seat, as today. The sandbox does not
   block `postMessage`, so the same page can live in the plugin's tab and in the Browser tab.

3. **Text: type a domain and it changes.** The top of the page has a *Your domain* field. With nothing typed, the 152 cards wear the
   Tracy (demo) site's text. Once typed, the Worker `GET /design-inspiration/api/read?url=` fetches the home page, uses
   HTMLRewriter to extract name · title · h1 · first paragraph · menu · buttons into exactly the `site` block that `planFill`
   consumes, cached per host in KV for a few hours. No model. The door accepts strangers' URLs, so it has three fixed
   locks: only http/https and internal IP ranges blocked; a rate limit per IP; a short timeout.

4. **Brand: the `brand:<host>` card runs on the guest lane, in two passes.** No new service: the guest lane
   already has dsh and the image carries Chromium; the guest bundle additionally gets the **host half** of `tracy-brand-engine`
   and `tracy-design-inspiration` (two packages currently "native only"), and `cowork-web` routes the doors
   `start-from`/`jobs`/`systems/brand:<host>/*` to that lane with a server-side token, without requiring
   sign-in. One job, two passes: **fast** (HTML + CSS → tokens, fonts, logo, text; 10–30 s) writes
   `Brand/<host>/` and the card shows right away; **full** (Chromium recon) keeps running and overwrites when done, the card
   updates by polling. The result lives in the guest lane's folder, shared by everyone who types the same domain;
   cached per host for one day, the *Extract again* button redoes it. A site with a bot wall returns
   `NO_MATERIAL` — the card says so, the text still changes.

5. **The button into Tracy is the input of the Fork flow.** In public mode the write buttons are hidden; they are replaced by a
   *Build this with WordPress* button that carries the domain and the chosen system into sign-in and then to Add site
   with the Fork card prefilled (`todo-fork-pipeline.md`). In embedded mode the three Create with buttons stay as
   today and go through the bridge.

6. **The Build tab opens the customer's real page in the Browser tab**, rather than drawing its own iframe: the engine calls
   `betterSidebar.openTab({type:'browser', url})` when the `seed` stage finishes, `updateTab(id, {meta:{reloadNonce}})`
   after each edit (finding its own tab through `getSnapshot()` by URL, because the Browser tab mints its own id
   `browser:<n>`). The form and the skeleton stay in the Build tab because before `seed` there is no real page yet.

## Consequences

- **Dropped**: the `tracy:preview` tab proposed 07/09 17:20 (a full view already exists because the page is a page; the side card
  stretches to the full window). The Built screen's iframe in the Build tab is dropped following decision 6.
- **Added package**: `packages/web/tracy-design-page` (the page), and the `postMessage` bridge contract in
  `docs/references/design-page-bridge.md` with a versioned schema and tests on both ends — the two sides release
  out of step (the page with the Worker deploy, the plugin with the lane bundle), so the version is mandatory, not
  cosmetic.
- **Assets of the 152 systems** are generated at build time from `vendor/tracy/od-design-system` like the two CMS themes, with
  hashed file names so the Browser tab does not keep an old copy; plus a vendor-drift gate of the same kind as `od-slots`.
  *08/09, [ADR 0012](0012-design-systems-served-from-one-place.md)*: those files are **the only place** serving the
  library — lanes read them over HTTP by `?v=<commit>`, the copy in the image is now only a fallback.
- **The guest bundle** gets heavier by two host halves; `check-lane-tabs` does not change because no tab is seeded
  in guest (only the host half).
- **The customer's text does not leave the lane**: the public page only knows the text the `read` door extracts from their public
  site, and the brand from the guest lane. A site's `design-preview.json`, `design-copy/*` still only
  reach the page through the bridge when embedded in that site's lane.
- Licensing of the 152-system set: Lee handles it himself, outside the scope of this ADR.

## Settled additionally (Lee, 07/09 19:20)

- The `read` door also takes the customer's **hero image** (`site.image`): the image is theirs, and showing it back to them
  across the 152 systems is exactly the page's job.
- The public brand card keeps the name **`brand:<host>`** as in the lane, and carries a **corner badge**
  (ribbon) to stand out clearly from the 152 original systems — the person typing a domain must see their own card at once.

- **Turnstile turned on right away** for the guest lane's brand extract door only (Lee, 07/09 19:25): this door
  runs Chromium on a shared machine and fetches unknown sites by the URL people type, so every
  extract must carry a Turnstile token verified by the Worker; real people barely notice it. The text `read`
  door is cheap, and only rate-limited per IP.

## Deviation during implementation (Akemi, 07/09 22:xx)

Point 2 of the Decision (the tab in dsh = an iframe pointing at the page + a `postMessage` bridge) **has not been done, and
may not be needed**: the public page imports the plugin's components (`Gallery`, `PreviewDialog`) directly
by relative path, as the bench does; the plugin only adds `setDoor()` to switch doors and `publicMode` to switch the write
buttons. One codebase, two surfaces — exactly the goal of point 2 — with no bridge whose version can drift. The bridge is only
worth building if one day the page and the plugin must release out of step; only then write
`design-page-bridge.md`. Recorded in `tasks/todo-design-page.md` §Findings during implementation.
