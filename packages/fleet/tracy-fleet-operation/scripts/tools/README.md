# fleet/tools — run from a PERSON'S MACHINE, not on the host

This folder is **deliberately outside** `ALLOWED` in `deploy/fleet-receive.sh`, for the same reason as
`tests/`: it is not shipped, because nothing on the host runs it.

🔒 **And that is the boundary to keep.** On the old fleet host, `tools/` was not shipped either — yet
`hooks/tracy-hooks.py` called `/opt/tracy-fleet/tools/<script>` for every webroot job. Server code that
must run but that the ship path will not carry travels by hand, and 95 files reached production that no
repo had. Here those scripts live in `webroot/`, which is shipped.

**Rule:** a file added here must **never** appear in an absolute path that `hooks/` or `provision/`
calls. If the host needs to run it, its place is `provision/`.

Since 06/09/2026 this folder **keeps that rule**: none of the remaining files is called by `hooks/`
through an absolute path. Before that some were — see the last section.

⚠ **The first two sentences are about `tracy-infra`'s `fleet-receive.sh`, not the deploy path in use
today.** This repo's action `.github/actions/deploy-host-dsh/action.yml` copies `tools/` (with `lib/`,
`provision/`, `webroot/`) to `/opt/tracy-fleet/tools/` on every deploy, and `dsh/deploy-host-dsh.sh`
calls `resync-access-plugin.sh` as its last step (#677). The rule "do not let `hooks/`/`provision/`
call files here through an absolute path" still stands.

| Script | What it does |
|---|---|
| `archive-orphan-sessions.mjs` | Moves the dsh session folders (`$DSH_HOME/sessions/--site-<label>--`) of sites that **no longer exist** out of the live session store, into `$DSH_HOME/sessions-archive/<label>-<UTC time>/` — one `rename`, no copy, no delete. **By default it only lists**; `--apply` moves. Runs inside `tracy-dsh`, as the user and with the paths dsh sees: `docker cp archive-orphan-sessions.mjs tracy-dsh:/tmp/` then `docker exec tracy-dsh node /tmp/archive-orphan-sessions.mjs --dsh-home /desk-home --sites-root /site [--apply]`. It leaves (and gives the reason for) folders of live sites, folders holding sessions of another path, unreadable headers, sessions with a fresh lease; an empty `/site` refuses the whole run (a missing mount looks exactly like that). The rules are those of the `/gateway/seat/archive-sessions` door that site deletion calls (`dsh-passwords/src/session-archive.ts`); `scripts/test/session-archive-parity.test.ts` keeps both versions reaching the same verdict. |
| `fleet-map.sh` | Asks the host itself: which container is which copy, at which URL. Needs `TRACY_FLEET_HOST`. Every column is read from live state, never inferred from names. |
| `push-site-folder.sh` | Pushes a site's site folder to its mapped `TracyHQ/<siteID>` repo. Runs ON the host (the tracy-host container) — the GitHub token is **requested** through `lib/relay-git-token.sh` → `$TRACY_WEB_ORIGIN/fleet/git-token` (signed with `HOST_SECRET`, sending the `label`), never kept on the machine (ADR 0023). |
| `emdash/emdash-content.mjs` | **The emdash adapter**: `data.db` ⇄ `SiteContent/`. Runs ON the host, next to the database. |
| `push-site-folder.sh` | Commits ONE site's site folder to its `TracyHQ/<siteID>` repo (one-hour token, ADR 0023). Runs ON the host. Since 06/09 it can run repeatedly: the first run is "scaffold", later runs are "sync … — Brand, TracyWork" listing the folders that changed. **One way**: the folder on the host is the truth; edits on GitHub not pulled back are overwritten by the next sync. Since 02/10: git metadata lives in `$TRACY_PRIVATE_ROOT/<label>/site-sync.git` (never a `.git` inside the site folder, hooks off); secret/dump-like files (`.env*`, `*.pem`, `*.key`, `id_*`, `*.sql`, `*.sqlite*`) are excluded, and one slipping into the stage aborts the whole site; files > 95 MB are skipped individually; a site without a repo → exit 3 (skipped); two runs for the same site wait for each other on the lock `/var/lock/tracy-repo-<label>`. |
| `resync-access-plugin.sh` | Copies `provision/access/wordpress/tracy-access.php` (the shipped copy) into `wp-content/mu-plugins/` of EVERY `platform: wordpress` site with a `.webroot/wp-content` on the host, or of one site (`<label>`). Identical bytes are not written; different ones go through a temp file in the same folder + rename, mode 0644; a symlink on the way is refused. Every step goes through a descriptor opened `O_NOFOLLOW` (openat/fchmod/renameat), so turning a folder into a symlink after the check still cannot write outside the site. When run by hand, set `TRACY_SITES_ROOT` to `HOST_SITES_ROOT` from `/etc/tracy/host-dsh.env`. Runs ON the host: `deploy-host-dsh.sh` calls it at the end of every deploy (through a one-off container, because the runner cannot see `/srv/tracy-sites`); a one-time backfill per host is done by hand — [`dsh/HOST-DSH.md`](../../dsh/HOST-DSH.md) §2bis. Lock `/run/lock/tracy-access-sync`. |
| `sync-brands.sh` | Pushes EVERY `Brand/<host>/` on the host to the public store `TracyHQ/design-inspirations` (ADR 0013). The token is requested at the same `/fleet/git-token` door (`tracy_relay_git_token_shared`), but declaring `repo` **without** a `siteKey` — this store belongs to no site; tracy-web's closed `fleetSharedRepos` list is what vouches for it. `/srv/tracy/_brands` is **a clone**, not a source: each run does `reset --hard origin/main` and then copies in the lane folders that are **newer** by `source.extractedAt`. When two hosts push at once, the loser resets to the winner's commit and redoes its work — no brand is lost. tracy-host (`apps/tracy-host/src/sync.js`) runs it first ~5 minutes after boot and then every 10 minutes. Try it first with `sync-brands.sh --dry-run`. |
| `sync-site-folders.sh` | Runs `push-site-folder.sh <label> <siteKey>` for EVERY site with a site folder on the host (siteKey read from `.tracy/site.json`). tracy-host (`apps/tracy-host/src/sync.js`) runs it first ~5 minutes after boot and then every hour (decided 06/09: `Brand/<host>/` goes to GitHub in full, fonts and images included); turn it off with `TRACY_HOST_SYNC=0`. Last line: `done: N synced, S skipped, F failed` (skipped = site without a repo); exit ≠ 0 only when F > 0. Log: `/var/lib/tracy-host/logs/sync-site-folders.log`. |

⚠ **`emdash/` is the only thing here that writes to a site serving customers.** An emdash site born on
the fleet has no Preview in front of it (ADR 0086), so an `apply` is public at once. Its three rules —
all or nothing, a refusal must name the file, and `--dry-run` must say everything — are written at the
top of `emdash-content.mjs`; read them before editing.

## What has gone, and where

🔒 **TWELVE SCRIPTS OF THE LANE ERA WERE DELETED (06/09/2026)**, in the same change as `lanes/`,
`dsh/Dockerfile`, `dsh/install/`, `dsh/IMAGE_TAG` and the three hook doors `/lane` · `/lane-update` · `/lane-versions`:

```
create-lane.sh          ensure-lane.sh            seed-lane-profile.sh
update-lane.sh          rollback-lane-profile.sh  recreate-lane-container.sh
migrate-lane-site-folder.sh  set-lane-seat-secret.sh  lane-template-status.sh
lane-versions.mjs       render-lane.mjs           push-image-tag.sh
```

They built, seeded, upgraded, rolled back and listed **one dsh container per site**. Since Plan 3 each
fleet host runs exactly **one** `tracy-dsh` serving every site on that machine
([`dsh/HOST-DSH.md`](../../dsh/HOST-DSH.md)), so there is no unit left for those scripts to operate on.
The equivalent work today:

| Before | Now |
|---|---|
| `create-lane.sh` · `ensure-lane.sh` — build a lane for a new site | [`../provision/attach-site.sh`](../provision/attach-site.sh) binds the site folder into `/srv/tracy-sites/<label>`; the `/site-attach` hook door calls it |
| `seed-lane-profile.sh` · `update-lane.sh` — seed/upgrade each lane's plugin tree | rebuild the `tracy/dsh` image on the host, then `docker compose up -d` ([`dsh/HOST-DSH.md`](../../dsh/HOST-DSH.md) §1, §2) — one run for the whole host |
| `rollback-lane-profile.sh` — roll back one lane's plugin tree | delete the KV flag `host-dsh:<label>`, then `compose down` (HOST-DSH.md §8) |
| `recreate-lane-container.sh` · `push-image-tag.sh` · `lane-template-status.sh` · `lane-versions.mjs` — change the image, declare the image, list each lane's versions | one image for the whole host, tagged by `DSH_IMAGE_TAG` in `/etc/tracy/host-dsh.env` |
| `migrate-lane-site-folder.sh` — move a lane to the site-folder shape | [`../provision/migrate-site-to-host-dsh.sh`](../provision/migrate-site-to-host-dsh.sh) and [`../provision/rollback-site-from-host-dsh.sh`](../provision/rollback-site-from-host-dsh.sh) |
| `set-lane-seat-secret.sh` — one seat key per lane | one key per **host**, generated by [`../../dsh/host-dsh-init.sh`](../../dsh/host-dsh-init.sh), set on the two Workers with `wrangler secret put HOST_SEAT_SECRET_<HOST>` |
| `render-lane.mjs` — screenshot a lane's dsh with headless Chrome | no version for the host dsh yet; rebuild it when needed, do not restore the old one (it ssh'd into each lane's own port) |

⚠ **Keys left over in `/etc/tracy/hooks.env` on two hosts, which the repo cannot remove for you.**
`TRACY_LANE_IMAGE`, `TRACY_LANE_TEMPLATE`, `TRACY_LANE_ONBOARD`, `TRACY_LANE_GUEST` are now read by no
script. They are harmless but read like live configuration — to be removed by hand on the host (Plan 4 §Cloudflare/host).

🔒 **`ensure-site-folder.mjs` · `siteFolder.mjs` · `attach-site.sh` MOVED to
[`../provision/`](../provision/) (06/09).** The reason is exactly the rule at the top of this file: since
Plan 3, `provision.sh` calls all three on the host, so their place is the folder that IS shipped.

| Moved to | What it does |
|---|---|
| [`../provision/ensure-site-folder.mjs`](../provision/ensure-site-folder.mjs) · [`../provision/siteFolder.mjs`](../provision/siteFolder.mjs) | Generates the site folder (`AGENTS.md`, `AgentSetting/`, …). Writes only missing files. |
| [`../provision/attach-site.sh`](../provision/attach-site.sh) | Binds a site's site folder into `/srv/tracy-sites/<label>` so the host's dsh sees it at `/site/<label>`. |
| [`../provision/detach-site.sh`](../provision/detach-site.sh) | The other half: removes the bind and **deletes the `/etc/fstab` line**. `teardown.sh` calls it before `rm -rf` — an fstab line pointing at a deleted source keeps the HOST from booting next time. |
