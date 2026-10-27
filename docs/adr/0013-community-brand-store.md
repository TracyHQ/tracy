# ADR 0013 — The community brand store: one public repo, the two hosts are copies

- **Date**: 2026-09-08
- **Status**: binding
- **Decided by**: Lee ("Reference" session, 07/09/2026)
- **Partly supersedes**: [ADR 0011](0011-public-design-inspiration-page.md) §Consequences — the sentence
  "`brand:<host>` is private to the customer" no longer holds for brands measured from the public page;
  [ADR 0012](0012-design-systems-served-from-one-place.md) §Context repeats that sentence, same scope.

## Context

Lee, 07/09: *"brands like apple, airbnb are just the same as the domains customers are typing in.
So when users type a domain in, that is also a process of building up more design systems"*.

Measured the same day, brands were scattered and **duplicated**: `joomlart.com` had three copies — two lanes on
the Contabo host and the guest lane on the droplet. Each copy 4–8 MB, each its own
crawl. No lane could see another lane's result, so the same website was measured again
every time someone typed it in a different place.

Two reasons why "merge into one folder on disk" does not solve it:

1. **The work is split between two hosts** ([`ban-do-fleet.md`](../references/ban-do-fleet.md) §1): agent
   lanes on DigitalOcean, customer websites on contabo. A bind mount does not span two machines.
2. **`vendor/tracy/od-design-system` is not a place to write.** It is a subtree pinned to a commit (RULE #5), and
   its `NOTICE` commits Tracy to changing nothing in `systems/`. Mixing Tracy's output into it means a
   conflict on every subtree pull, and a red `od-slots` gate.

## Decision

1. **The store is a public repo: `TracyHQ/design-inspirations`.** Not a folder on one
   machine. Each fleet host keeps a **clone** at `/srv/tracy/_brands`; the repo is the truth, hosts contribute
   to it. The folder shape mirrors that of `vendor/tracy/od-design-system`: `systems/<host>/` plus
   a generated `catalog.json` — so that the later "promote to the official shelf" round is just a subtree pinned to a
   commit, the same path the 152 systems took.

2. **Push the whole folder**, including `pages/`, `imagery/`, `fonts/` (Lee: *"Publish everything, because if it's a website
   it's already public"*). Two things held back: a folder containing a file over 50 MB is skipped **with a
   log** (GitHub rejects 100 MB files, and one failed push fails every brand at once), and
   `LICENSE-DATA` states clearly that `logos/ imagery/ fonts/ pages/` **are not Tracy's to license**.

3. **The category is decided by WHERE IT IS READ, not by the file.** The manifest carries `Your brand` or `Reference`
   according to the lane that wrote it, and inside the lane those two labels are still right: a brand that is not this site's really
   is a reference. But on the public shelf **every** entry is someone else's site, so that label
   loses its meaning and the shelf reads it as `Community` (set by the repo's `scripts/build-catalog.mjs`, kept by the page's
   `communityRows`). The manifest is not edited: it is the lane's file, and editing it overwrites a measurement.

4. **The token goes through the existing door, not a deploy key.** `seats.tracy.ai/fleet/git-token` mints a
   one-hour, one-repo token with `contents` permission, through the App `tracyhq-internal-use` — the fleet still holds no key
   (ADR 0023 of `tracy-infra`). This store belongs to no site, so `site.repo` cannot vouch for it;
   the constant **`FLEET_SHARED_REPOS`** in the seat registry vouches instead, and it is a **closed** list:
   dropping `siteKey` is not a way around the site ledger.

5. **A 10-minute timer, not a call right after the extract finishes.** The engine runs in the container, and the
   container deliberately has no git, no token, no channel to the host — a decision of 06/09 when
   `sync-site-folders.sh` was born. Ten minutes is how long a brand measured on this host waits before the
   lane on the other host sees it.

6. **The public page reads the community shelf through `?source=community`.** The bare address keeps the 152 systems.
   Whoever knows that address also sees the community shelf, read directly from `raw.githubusercontent.com`
   (`access-control-allow-origin: *`). The purpose Lee stated: **check quality before building the promote
   function** — not a feature for customers.

## Consequences

- **Customer sites' brands also go to the public store.** Lee has settled this. They also still live in the team repo
  of that site through `sync-site-folders.sh` — two paths, two purposes, no conflict.
- **Removal**: open an issue naming the host, delete the folder. A removal function in the customer's account comes later; the public repo
  keeps the history (Lee: *"in the public repo just leave it there"*).
- **The store grows**, ~15 MB of disk per domain including `.git`. GitHub complains at around 5 GB, i.e. a few hundred
  domains. There is no cleanup rule yet, and **deliberately none yet** (Lee: *"the cleanup and fine-tuning of the community will be done later"*).
- **The public repo's language gate does NOT scan `systems/`.** A Vietnamese site has a Vietnamese
  title, and that is correct data; translating it would corrupt the measurement. The gate only scans files Tracy writes itself.
- **The lane half of §3 is DELIBERATELY NOT DONE** (Lee, 07/09 after re-reading: *"that label in the lane brand is
  already right"*). In the lane, a brand that is not this site's **is** a reference, and `Reference`
  names it correctly. `Community` only means something on the public shelf, where every entry is someone else's
  site. The `community` group in the filter is therefore **empty on the lane** — and empty means not shown.
- **30-day reuse and a write lock: done** (07/09, same session). Three points worth remembering:
  - The threshold lives in **one place**, in the engine. `GET extract/<host>` also returns `fresh`, and `cowork-web` reads
    that flag rather than keeping a copy of the 30-day number.
  - A still-fresh measurement is returned **even before Turnstile**: nothing to run means nothing to protect,
    and that same job could already be read without a check at `GET api/brand/<host>`.
  - The lock is **not there to block two measurements** — `startJob` already merges them, and a lane has only one
    dsh. It blocks **the publisher**: `sync-brands.sh` copies the folder out to the shelf every 10 minutes, while
    `extractBrand` wipes that folder before writing it again.
- **Fixed alongside, not part of the request**: a failed measurement used to **delete a good card**, because
  `extractBrand` wiped the folder before fetching. The old measurement now moves aside to `<dir>.prev` and comes back when
  the new round fails. Without this fix, "keep for 30 days" is meaningless: a `refresh` while the site is down
  loses everything.
- Not done yet, and known to be not done: the promote layer to the official shelf — the thing `?source=community` was created
  to prepare for.
- **The shelf's maximum delay is 15 minutes**, not 10: the 10-minute timer plus `raw.githubusercontent.com`'s
  `max-age=300`. Good enough for a surface for checking quality; not enough if someone later
  wants it to be a customer surface.
- **The community fixtures' fonts are still right**, even though no one inlines them the way the host on the lane does: the engine's kit
  already carries a `<link>` to Google Fonts next to the self-hosted `@font-face`, so `../fonts/…` fails
  inside the `sandbox=""` iframe yet the text still renders in the right typeface. Measured on `joomlart.com` 07/09.
