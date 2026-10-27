---
description: The fleet bar stops guarding access — it proxies, injects the badge, and vouches for identity; it does not decide who may read a site
sources:
  - apps/tracy-web/src/bar/route.js
  - apps/tracy-web/src/bar/pages.js
  - apps/tracy-web/src/bar/site-proxy.js
  - packages/site/tracy-site-build-emdash/src/host/stages.mjs
---

# 0018 — The fleet bar does not guard the door

**Status:** accepted · 16/09/2026 · decided by Lee
**Partly supersedes:** the shape of the guest gate carried over from `workers/fleet-bar/src/index.js` (ADR 0008 keeps
the reason that Worker existed; the `workers/` tree was deleted 16/09)

## Decision

`apps/tracy-web/src/bar/` does **three** things and not a fourth:

1. proxies requests to the site's copy,
2. injects the Tracy badge into the returned HTML,
3. **vouches** for who the viewer is (`x-tracy-email`) when they have a seat.

It does **not** decide who may read a site. The following three things are removed from `bar/route.js`:

| Removed | What it used to do |
|---|---|
| Guest gate → `privatePage` | `publish=draft` + no seat + `guest_open=false` → **403 "This copy is private"** |
| CMS backend redirect | `/wp-admin`, `/administrator` without a seat → **302** to `${origin}/login` |
| `/__tracy/login` · `/__tracy/signin/:provider` · `/__tracy/team` | OTP and OAuth sign-in **right on the site's hostname**, plus the roster + guest switch |

From now on sign-in happens in **one place** only: Tracy's own hostname (`identity/route.js`). Inviting people to a
site moved to the workspace as of ADR 0046.

## Why

**A blocking gate returns 403 to every machine.** The `check` stage of the EmDash build queries the site over HTTP
as nobody — exactly the shape the guest gate refuses. Measured 16/09 on `site-d6ggmf.tracy.site`:
public returned `403` in 0.16 seconds, the container's internal port returned `200`. The build sat through all 12 tries ×
5 seconds and then reported *"did not answer as a site in time"* — a sentence that misdescribes the cause entirely, and whoever
reads it goes off chasing the network side.

**Soon that same bar will stand in front of a public JoomlArt demo page** — a page with no seat
ledger behind it, nothing to guard, and where the words "private copy" mean nothing.

**And that gate never kept its promise in the first place.** A "private" draft sitting behind a guessable
hostname, with no password and no expiry — it is a door left ajar, not a lock. Removing it
at least says so out loud.

## The cost, stated plainly

- **Anyone who knows the hostname can read a draft.** The draft's `robots.txt` (`ROBOTS`) still asks crawlers
  to stay out — that is a request, not a lock, and the documentation does not pretend otherwise.
- **`/wp-admin`, `/administrator` are exposed to the internet**, behind the CMS's own sign-in door.
- **`guest_open` becomes a column nobody reads.** Not dropped yet; recorded as debt.
- Four page-building functions leave `bar/pages.js` (`privatePage`, the two OTP steps, `teamPage`), and four helpers in
  `lib/page-shell.js` (`noindexBadge`, `guestAccessControl`, `permissionsTable`, `roleLabel`) lose
  their last caller. They still have their own tests, not deleted yet.
- The cheap test "which fleet-bar is this site behind" changes from `/__tracy/team` to **`/__tracy/build`**
  (GET returns JSON, no session required).
  _(11/10/2026: `/__tracy/build` has been retired — no component POSTs a manifest any more; the test is now `/__tracy/errors` without a cookie → `401`.)_

## What is NOT removed, and why it must not be

The four things below look like "security in the bar" but are not guarding access to the site —
they keep the bar itself from becoming a hole. Removing one of them is a bug, not the next step
of this ADR:

| Kept | What happens if removed |
|---|---|
| Strip `tracy_*` cookies before proxying (`site-proxy.js`) | the customer's site can read `tracy_sess`, i.e. read the viewer's Tracy session |
| `hostKind` accepts only this deployment's domains | the bar becomes an open proxy / SSRF |
| HMAC on `POST /__tracy/build` | anyone can overwrite another person's site build manifest |
| Strip client-sent `x-tracy-*` before setting them again | anyone sending `x-tracy-email` + `x-tracy-role: owner` becomes the site's **administrator** |

The last row is the most important, and it is **even more true** after this ADR: the bar no longer *guarding* does not
mean the plugin no longer *reads*.

## Outstanding work (a separate ADR, not done)

Vouching by header — `x-tracy-email` + `x-tracy-tier` + `x-tracy-role` — **is an authentication
mechanism**: `tracy-access.php` reads it and then calls `wp_set_auth_cookie()` directly, and `owner` is granted
`administrator`; `plg_system_tracyaccess` on the Joomla side does the same. What it rests on is one sentence written in
the plugin itself: *"only the fleet-bar Worker reaches this origin, so the header cannot be forged"*.

Measured 16/09 on the dev machine: the site's container ports (52012, 52005, 8083) **cannot be reached from outside** —
so that sentence is true today. But it is true **thanks to the firewall**, not thanks to the protocol, and a public JoomlArt demo page
is exactly the kind of environment where that assumption collapses.

The replacement direction: a **signed one-time admin link** issued by `tracy-web` (the only place with a session), with the plugin changing
from "trust the header" to "check the signature + expiry". Not folded into this round because today there is **no other
mechanism** that gets the site owner into the CMS — `packages/site/tracy-add-site/src/client/admin-path.mjs` says plainly that
the Admin door carries no session, it relies entirely on this header.

And: **do not install the Tracy Access plugin on the public JoomlArt demo page.** That page only needs the badge.
