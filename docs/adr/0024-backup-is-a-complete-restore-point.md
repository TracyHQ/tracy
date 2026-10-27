---
description: Backup replaces Release on the customer screen — one restore point made of a file seal and a consistent database dump in one door; each point declares what it holds; two restore scopes (files / everything) with an automatic snapshot right before; the dump lives next to the site, never goes out to the client; the v1 baseline becomes the first backup
sources:
  - packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-backup.sh
  - packages/fleet/tracy-fleet-operation/scripts/webroot/webroot-git.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/provision.sh
  - packages/fleet/tracy-fleet-operation/scripts/provision/teardown.sh
  - packages/fleet/tracy-fleet-operation/scripts/lib/webroot-zones.cjs
  - apps/tracy-host/src/webroot.js
  - apps/tracy-web/src/sites/route.js
  - apps/tracy-web/src/sites/backup-export.js
  - packages/core/tracy-core/src/site-tabs/BackupDialogs.tsx
  - packages/core/tracy-core/src/tab-link/index.ts
  - packages/site/tracy-site-tabs/src/client/strings.ts
  - packages/dev/tracy-design/src/mockups/site-changes-backup.tsx
---

# 0024 — A backup is a complete restore point (files + database), replacing the Release concept for customers

**Status:** accepted — Brian (PO) signed 12/10/2026, both the original decision and the three amendments · proposed
02/10/2026, Brian settled the direction, Claude wrote. Deliberately overturns one "out of scope" line of
[`tasks/todo-site-changes-v2.md`](../../tasks/todo-site-changes-v2.md) §1 ("undo the whole site including
the DB") — V2 is still right within its scope; this decision is a separate line, with its own paperwork.

## Context

`CONTEXT.md` §1: customers pay because they **can see** and **can go back**. "To keep a good point,
close it in Releases." Measured on the code and a stand on 02/10, that promise is only half true:

1. **A release today is files only.** `POST /api/sites/:key/release` (`apps/tracy-web/src/sites/route.js`)
   runs the job `webroot-release` → `webroot-release.sh --op create`: seals the worktree (commit "outside
   Tracy"), an annotated tag `tracy-release/vN` on the webroot git on the host machine, then (if the site has a repo) writes
   the filtered ledger to GitHub. Restoring to a release (`/restore` mode `reset` → `restore_reset` in
   `webroot-git.sh`) is `read-tree -u --reset <sha>` — **files only**. The dialog itself already tells the truth:
   "Content and settings kept in the database are not changed."
2. **The part customers value most lives in the database and has no history at all.** Posts, pages, menus, settings,
   users, forms — all in MariaDB (WP/Joomla) or SQLite (EmDash). `apply.revert` can only roll back
   individual Tracy writes through the Content API; edits in the admin, plugin self-updates, cron — nothing
   can be rolled back. A "good" release that can only return half the files is a promise not kept.
3. **EmDash has nothing.** The webroot git of an EmDash site is an **empty** tree (measured `scv2em`: 1 commit
   `chore: webroot baseline`, 0 files, tags `tracy-baseline` + `tracy-release/v1` both pointing there) because
   the content is in `data/data.db` + `uploads/` (bound from the private folder), and the code is in the `<label>_app` volume.
   The merged-view mockup (`site-changes-backup.tsx` §7) has to say "EmDash offers no restore".
4. **The pieces exist but are scattered.** `db.snapshot` / `db.rollback` (Joomla, plugin ≥ 0.9.0) copy tables
   to `_tracy_snap_<tag>__*` right inside the site's DB — good for a core upgrade, not a restore
   point: it lives in the same DB it protects, Joomla only, doubles the DB size. `db.dump` reads table by table
   through the relay, for the agent, not a consistent copy.
5. **V2 already pushed whole-site restore out of scope** (§1 "Out of scope"). Brian 02/10: one need,
   one view (the line merging Releases into Site changes), and a point in that view must be something that restores
   the whole site. That is why this ADR exists: overturning a scope line by a named decision.

## Measurements (02/10/2026, Mac Studio, read only)

Dumps with `mariadb-dump --single-transaction --quick` run inside the DB container (read; a first pass
wrote a temporary file into the container's `/tmp` and then deleted it, later passes streamed straight into `wc`). SQLite with the
online backup API (`sqlite3 'file:…?mode=ro' .backup`) into the scratchpad, then deleted. gzip level 6.

| Site | CMS | DB in `information_schema` | Raw dump | Gzip dump | Dump time | gzip |
|---|---|---|---|---|---|---|
| `scwp1002` (stand `~/tracy-data`) | WordPress | 22.6 MB · 14 tables · ~10.5 k rows | 15.6 MB | **1.88 MB** | **0.09 s** | 0.13 s |
| `scjo1002` (stand `~/tracy-data`) | Joomla 6 | 17.1 MB · 92 tables · ~33 k rows | 11.8 MB | **1.55 MB** | **0.12–0.14 s** | 0.11 s |
| `scv2wp` (scv2) | WordPress | 21.6 MB | 14.8 MB | 1.71 MB | 0.11 s | — |
| `scv2jo` (scv2) | Joomla 6 | 17.0 MB | 11.8 MB | 1.55 MB | 0.16 s | — |
| `scv2l5` (scv2, **built 11:02 today**) | WordPress | 21.1 MB | 14.1 MB | **1.63 MB** | 0.08 s | 0.11 s |
| `scv2em` (scv2) | EmDash 1.x | `data.db` 24.4 MB (+ WAL 10.6 MB) | 24.4 MB | **5.54 MB** | 0.07–0.18 s | 0.27 s |
| `scv2em` uploads | EmDash | 80 files, 4.6 MB | — | tar.gz 3.7 MB | — | — |

For comparison on the file side: `scwp1002` webroot 322 MB, git history 135 MB; `scjo1002` webroot 385 MB, git
90 MB. **The gzip dump is ~1–2 % of what is already kept for files.** The largest WP table is `*_posts` (18.9 MB — seed
posts + revisions); for Joomla it is `*_modules` (3.8 MB). A freshly created site is not much smaller than a used one
because the quickstart's seed content is already there.

Limits of the measurement: stand sites are small; real customer sites (WooCommerce, logs, forms) may be 10–100×. A
0.1 s dump here will become a few seconds on a 1 GB site — still within the door's 120 s limit, but it must be re-measured on the fleet
before the job limit is settled (see §Consequences).

## Proposed decision

**On the customer screen, "Create a backup" replaces "Create a release".** A backup is **one restore point**:
a file seal (exactly today's seal + tag path) **and** a consistent copy of the database, made in **one door**,
one job, one tag.

- WordPress / Joomla: `mariadb-dump --single-transaction --quick --routines --triggers` run **from
  tracy-host** (`docker compose exec -T db …`, as `provision.sh` and `platform/*.sh` already do) — the host
  holds the docker socket without the proxy; the agent's dsh does **not** reach `<label>-db-1` (the proxy blocks it,
  `collect-site-facts.mjs`) and this ADR does not open that path. Skip the `_tracy_snap_*` tables and the tables in
  `db.cleanup`'s trash (they are copies; copying them again doubles them).
- EmDash: SQLite's online backup API on `data/data.db` (not a raw file copy — the WAL is open) +
  tar of `uploads/`. There is no file-history component (the webroot tree is empty); the template code in the
  `<label>_app` volume is **not** in the backup — say it, don't hide it (sub-decision 1).
- Order within the job: dump first, then seal + tag; the tag carries a trailer declaring the database part
  (`Tracy-Database: sha256:<hex> <bytes> <engine>`). The dump is consistent **inside the DB**; between DB and files
  there is a skew of under a second and running writes are not blocked — stated plainly in the docs, no promise of
  "whole-site atomic".
- Old enums/APIs **stay compatible**: job `webroot-release`, tag `tracy-release/vN`, door
  `/api/sites/:key/release`, `/releases`, audit `site.release`. (**Overturned in Amendment 2**, 03/10:
  every name changes to backup, only the tag prefix stays.) The answer **adds** a
  `database` field (`null` when the point has none). An old client clicking "Create release" also gets a full backup —
  there is no reason to keep a files-only path for the person clicking.

### Sub-decision 1 — Each point declares what it holds

**Proposed:** capability **per point**, read from the point itself, not from the software version:

| Point | Label (EN) | Label (VI) | Badge |
|---|---|---|---|
| Old tag, no database trailer (every release before this ADR) | File backup (no database) | Sao lưu file (không có database) | `Files ✓` |
| WP/Joomla after this ADR | Full backup | Sao lưu đầy đủ | `Files ✓ · DB ✓` |
| EmDash after this ADR | Content backup | Sao lưu nội dung | `DB ✓ · Media ✓` (no `Files`) |
| Point with a trailer but the dump file missing / wrong sha256 | File backup (database missing) | — | `Files ✓ · DB ✗` + one line of reason |

`webroot-release.sh --op list` also returns `database: {engine, bytes, sha256, ok}`; `ok` = the file is present
**and** the hash matches. The UI only offers the "Restore everything" button when `ok`. Never show "Full backup" for
a point that cannot prove it has a DB — exactly principle 3 of `CLAUDE.md` (invented data is worse than empty).

**Alternative:** one shared "Backup" label for every point, explaining the scope in the details. Rejected because customers
would click restore on an old point believing the DB comes back with it.

### Sub-decision 2 — Two restore scopes on one point

**Proposed:** a point's menu has two verbs, with very different risk:

1. **Restore files to <point>…** — gentle, exactly today's `restore_reset`, the current dialog text unchanged.
   Available on every point that has files (WP/Joomla).
2. **Restore everything to <point>…** — files **and** database. The dialog warns heavily: "Everything
   saved on the site after <time> is deleted: posts, pages, orders, form entries, users, comments
   and settings." The person clicking must type the site name (as when deleting a site). Requires the `site` toolset (same tier as
   `db.restore` in `APPLY_RULES`: owner/admin), not only `code`.

Steps of "Restore everything" (host job, `run_heavy` lock + webroot lock):

1. **Automatically snapshot "Before restore to <point>"** — an ordinary full backup, By = the person clicking, marked
   `auto: pre-restore`. The operation can itself be reversed with the very verb it just used.
2. WP/Joomla: load the dump into a **temporary schema** `<db>_tracy_restore`, check the table count, then rename each table
   (`RENAME TABLE live → _tracy_trash_<ts>__x, restore.x → live`) — the same two-rename pattern as
   `db.rollback`, so a failure midway leaves the old DB intact rather than half-done. Then `restore_reset` the
   files. The trash is cleaned on the next backup after 24 h.
3. EmDash: `docker compose stop web` → replace `data.db` (delete `-wal`/`-shm`) + `rsync --delete` uploads
   → `start`. The site is down for a few seconds — said in the dialog. No online restore into the open DB:
   the Astro/EmDash process cache would read stale data.
4. Write a Site changes row with Source `site-changes` (the mockup calls it "Restore"), By = the person clicking, description
   `Restored everything to Backup 4`. Old rows stay as they are, as history — V2 §2.3 already specifies that the summary
   does not assert the current state.

**Alternative:** a single "Restore" verb that always pulls the DB too. Rejected: most rollbacks are "the CSS broke",
and pulling the DB when only files are needed deletes the customer's orders because of a visual bug.

### Sub-decision 3 — Storage, retention, personal data

The dump contains **personal data of the customer's customers** (users, emails, comments, orders, forms).
It must be treated as a database, not as a build artefact.

**Proposed — option B, next to the site, in the private folder:**
`<TRACY_PRIVATE_ROOT>/<label>/backups/v<N>.<engine>.gz` (+ `v<N>.uploads.tar.gz` for EmDash), mode
`0600`, owned by the host.

- Reason: the private folder is **outside** the webroot (Apache cannot serve it), sits next to
  `webroot-baseline.git` that the tags point into, restore needs the bytes on that machine, and `teardown.sh` already `rm -rf`s
  that folder — deleting the site deletes the backups, no extra cleanup round in another store needed.
- tracy-host does **not** hold S3 credentials (`apps/tracy-host/src/provision.js`: the host only receives pre-signed URLs
  from tracy-web); option B adds no secret.
- Limit stated plainly: same disk as the site, **not** protection against losing the machine. That is the job of a daily off-machine
  backup, which already has its own name (`tasks/todo-backup-site-s3.md`, not yet assigned) — this ADR does not do it.

**Alternative A — the artifact store (MinIO local / R2 server):** `tracy-scv2-minio-1` currently only holds Migrate
artifacts and comment attachments (`config.artifactStore`, bucket `tracy-artifacts`, tracy-web signs URLs).
Pushing dumps there needs tracy-web to sign a PUT for every backup and a GET for every restore, plus a per-site deletion
lifecycle, and puts PII in a bucket currently shared with other things. Reasonable for the later off-machine copy,
not for the restore point.

**Proposed retention:**

- Points made by a person clicking: keep **the 20 most recent dumps** per site. Older dumps are deleted; the tag and files remain, so
  the point falls back by itself to "File backup (database removed after 20 backups)" — sub-decision 1's own rule.
- `auto: pre-restore` points: keep the **5** most recent, not counted in the 20.
- **The first backup (v1) never expires** (sub-decision 5).
- Size estimate from the measurements: WP/Joomla ~1.6–1.9 MB/point → 22 points ≈ **40 MB/site**. EmDash
  ~5.5 MB DB + uploads; if uploads are tarred every time that is ~9 MB/point ≈ 200 MB/site, so EmDash uploads are stored
  **by content** (each file once, by sha256; the point keeps a list) — only adding new images costs space.

**Never:** return the raw dump to the client (no download door in this ADR — a download door is a separate
decision, needing an owner and a reason); push the dump to the site's GitHub repo (the `SiteSourceCode/` ledger already filters
`*.sql` with `tracy_prune_data_files` — keep it that way); read the dump with the agent. Job logs print only size and
hash.

### Sub-decision 4 — Names, numbers, and the "Content" word clash

**Names/numbers — proposed:** keep `vN` as the **machine identity** (tag `tracy-release/vN`, GitHub ledger `vN`,
the host's `next_version` — no plumbing change), while the customer screen shows **"Backup N · <date time> ·
<title>"**. The title is no longer required: if left empty the machine sets `Backup <date time>`. The number helps conversation
("back to version 4"), the time helps recognition ("this morning's version").
**Alternative:** time only, no number. Rejected: two versions a minute apart cannot be named, and
the GitHub ledger already uses `vN`.

**"Content" word clash — proposed:** the `content` zone of `webroot-zones.cjs` is **files** (`wp-content/uploads`,
`images/`, `language/`), but the display label `zone.content` = "Content" / "Nội dung" collides with
V2's "Content" (database: posts, pages). Brian already tripped over it in the prepared notes (`draftNotes`). Change the **label**,
keep the **id**: `zone.content` → "Media & language files" / "Tệp media và ngôn ngữ". From now on the word "Content"
means only the database on every customer screen. Follow-up work: review `vocabulary.md`, the `vi` copy, and the text in
`webroot-release.sh` (labels `Thiết kế · Chức năng · Nội dung · Hệ thống`).
**Alternative:** change the zone id too. Rejected: the id is in already-written data and in deployed hosts.

### Sub-decision 5 — The v1 baseline becomes the "first backup"

Today every site has `tracy-release/v1` = `tracy-baseline` ("Initial release", `ensure_initial_release`
in `webroot-git.sh`, called from `provision.sh` `build_webroot_baseline`).

1. **Display role:** v1 shows as **"Initial backup — site as built"** / **"Bản sao lưu đầu — site lúc
   bàn giao"**. From now on provisioning **dumps the DB right after `build_webroot_baseline`** (the site just built,
   nobody has edited it yet), attaches the trailer to the v1 tag → the first point is a real Full backup and plays the role of **restoring to
   the original state**: "Restore everything to Initial backup". This dump never expires.
2. **Old sites** (built before this ADR): v1 has no dump, so under sub-decision 1 it shows
   **"File backup (no database) — site as built"**. No back-filled dump: today's DB is not the DB at handover,
   and attaching it to v1 would lie about the point.
3. **Technical role unchanged:** `BASELINE_TAG`, the v1 tag on the baseline, the rule "history goes back to the baseline"
   (`history`, `file-diff` read from `tracy-baseline`), and every script relying on them — no renaming. Only
   one dump step at provision time and one layer of display text are added.
4. **Cost:** a dump when the site is newly created is the smallest possible cost — `scv2l5` (WordPress built 11:02
   the same day): 14.1 MB raw, **1.63 MB gzip, 0.08 s**. Adds < 1 s to a provision of ~190 s.

## Options considered and rejected

### Third-party backup plugins (UpdraftPlus / Duplicator for WP, Akeeba Backup for Joomla) — REJECTED

Brian asked 02/10. Rejected for six reasons:

1. **Tracy already has the file half.** The webroot git already seals and tags each point; the only thing missing is one
   `mariadb-dump` pass from outside via `docker compose exec` on the host. A plugin would redo the file part in
   its own way, in parallel with Git.
2. **Plugins run in PHP and dump artifacts into the webroot.** Slow, hit `max_execution_time` on large sites,
   and leaving archives in the site tree pollutes the history. Existing evidence: `lib/webroot-excludes.sh` already
   had to exclude `/administrator/components/com_akeebabackup/backup/`, `/administrator/components/com_akeeba/backup/`,
   `/jaextmanager_data/`, `/wp-content/upgrade-temp-backup/`.
3. **A plugin's restore is an interactive wizard** that extracts over the webroot: it conflicts with the webroot Git, does not
   run headless, has no `site_operation` row, has no idempotency through Tracy's `/restore` door.
4. **Three CMSs, three plugins, three lifecycles.** The CLI-capable version is usually the paid one (licence); plugins
   self-upgrading create noise in Site changes; plugin cron spawns `Automatic` rows nobody asked for.
5. **Tracy's dumps live outside the webroot** (private folder, sub-decision 3; later an off-machine store).
   A backup folder servable over the web is a classic vulnerability — exactly where these plugins put their files.
6. **No fighting with an agency customer's own backup plugin**: if the customer already installed Akeeba/Updraft, it stays
   as is; Tracy does not install a second one next to it.

Note: the real strength of these plugins is **migration** (rewriting URLs in serialized data when
moving domains) — outside the "in-place restore point" problem, not needed here. EmDash has no equivalent plugin
system; its path is SQLite online backup + uploads as above.

### The existing `db.snapshot` / `db.rollback` — REJECTED as the foundation

Copies tables to `_tracy_snap_*` right inside the site's DB: does not survive if the DB itself breaks, exists only on
Joomla, costs double the DB size per point, and goes through the relay (agent) rather than a host job. It keeps
its role (a one-off core upgrade); only its two-rename pattern is borrowed for the restore step.

## Consequences

- **UI of the merged Site changes line** (mockup `site-changes-backup.tsx` on branch
  `feat/site-changes-releases-view`): "Release" → "Backup" on the point row, header button "Create backup",
  "Jump to backup", capability badge (`Files ✓ · DB ✓`) on the point row, two-verb menu. The row
  `Released v3 — "<title>"` becomes `Backed up — Backup 3 "<title>"`. The mockup must be redrawn for the three
  capability states and the Restore everything dialog before porting.
- **EmDash gets a real restore for the first time** (Restore everything, no Restore files). The sentence "EmDash offers
  no restore" in the mockup changes to "Content backup: database and media; template code is not
  included".
- **Doors and jobs:** `webroot-release` adds the dump step and trailer; `--op list` adds `database`; `/restore`
  adds `mode: 'everything'` (toolset `site`, type the site name, idempotency like the two old modes, its own
  `site_operation` row). The 120 s job limit must be re-measured on the largest site of the fleet before it is settled.
- **Disk cost** estimated at ~40 MB/site WP/Joomla, ~50–60 MB/site EmDash (uploads by content), in the host's private
  folder.
- **tracy-infra ADR 0091** (Release: `vN` numbers, GitHub ledger) is not superseded: the ledger is still the release ledger; this ADR
  only changes what the customer sees and adds the DB part to the artefact on the machine.
- **Out of scope for this ADR:**
  - Scheduled / cron backups — later work, needs its own retention decision for automatic points.
  - Off-machine backups (S3/R2, encryption, periodic restore tests) — `tasks/todo-backup-site-s3.md`.
  - A door to download dumps, or per-table/per-post restore.
  - Backing up EmDash template code (the `<label>_app` volume).
  - Back-filled dumps for v1 of old sites.
- **Preconditions before coding** (once the ADR is approved): measure the dump on the largest site of the fleet; confirm
  the 20/5 retention with Brian; redraw the mockup; write a plan (`writing-plans`) in one branch, one draft PR.

## Amendment 1 (02/10, per installation B1 — coordinator approved)

1. Actual trailer: `Tracy-Database: sha256:<hex> size:<bytes> kind:<mysql|sqlite> tables:<n>`
   (+`Tracy-Uploads:` for EmDash, +`Tracy-Backup: pre-restore` for the automatic snapshot) — `tables` added
   for checking after loading.
2. EmDash uploads are tarred whole for each point (not yet by content) — size higher than estimated; optimising is
   later work if fleet measurements demand it.
3. Restore order: load the temporary schema + reset files BEFORE the swap (safer than the ADR as written — every step
   before the swap is reversible); the swap is ONE RENAME TABLE statement; failure after the swap → a tested rollback.
4. Published MariaDB limits: tables with triggers make the restore fail-and-roll-back; routines/events/views
   are not transferred — standard WP/Joomla do not use them, must be measured on real sites before enabling widely.
   The variable `TRACY_TEST_FAIL_AFTER_SWAP` exists in the script for a controlled-failure harness (setting it
   in a real environment only makes restores always roll back, it does not destroy data).

## Amendment 2 (03/10, Brian: "go in hard and clean it up properly" — no real customers yet, no compatibility kept)

Overturns the line "Old enums/APIs **stay compatible**" of the Proposed decision. Survey of traces:
`tasks/evidence/release-cleanup-survey/SURVEY.md`; branch `feat/retire-release-for-backup`, one draft PR.

1. **Rename at every layer, no aliases:** doors `GET /api/sites/:key/backups` and
   `POST /api/sites/:key/backup` (doors `/releases`, `/release` return 404), audit `site.backup`, job
   `webroot-backup`, script `webroot/webroot-backup.sh` (`create_backup`, `list_backups`; `--op list`
   returns the key `backups`), history rows `kind: "backup"` going through host → web → client, the new v1 tag
   carries the message "Initial backup". Client: `readBackups`, `createBackup`, i18n keys `backup.*` /
   `restore.*Backup`. The API version exception is recorded in `docs/references/api-changelog.md` (03/10):
   renamed within `v1`, no `v2` opened, because nobody outside the repo calls those two doors.
2. **Keep the tag prefix `tracy-release/`** (`BACKUP_TAG_PREFIX` in `webroot-backup.sh`). The next number
   and the name of every dump (`backups/v<N>.<engine>.gz`) count by the tags under this prefix; changing the prefix without
   moving every site's tags makes the site count again from v1 and **overwrite the dumps** of existing points. Tags,
   the "Initial release" message of old sites, the audit `site.release` and the job `webroot-release` already written
   in the DB are historical data: not rewritten, no migration.
3. **Drop the release GitHub ledger** (`--repo`, the filtered copy, `CHANGELOG.md`, `TracyWork/releases/`, GitHub
   Release): tracy-web never sent `repo`. The site's repo has one remaining writer, the sync pass
   (`push-site-folder.sh`); two sync passes of one site queue under the repo lock, taking the lock even before
   the step that builds the git dir.
4. **Delete the Releases and History tabs** (code, stories, the switches `launch-releases`/`tab-releases`/`tab-history`
   in the catalogue, text in 8 languages) and **the V1 branch of Site changes** (every server returns
   `/activity?version=2`). The old addresses `?tab=tracy:releases|tracy:history` and saved right-column layouts
   open **Site changes** through ONE table `RETIRED_TABS` (`packages/core/tracy-core/src/tab-link/index.ts`).
   Old switch ids still in `ui_setting` are silently ignored (the server reads by the catalogue, the client reads
   by `DEFAULTS`).
5. **Site changes goes into the launcher** (`hidden` removed; the `launch-changes` switch still defaults to off), the site menu
   of the Browser chip (fork better-sidebar `0.21.1-tracy.65`) opens Site changes instead of History. No
   switches added for Create a backup / Restore everything: `tab-changes` hides the whole tab, and who may restore
   is the job of the seat fence (`may`), not of a hidden button.

## Amendment 3 (11/10/2026) — the download door, Brian signed 12/10/2026

**Status:** signed — Brian (PO) 12/10/2026, keeping the v1 table below as is (see "Signed" at the end of this section). Brian (PO) 11/10: "a backup in Tracy is essentially a QS" —
the site belongs to the customer, the customer must be able to take it away. Plan and detailed decisions:
[`tasks/todo-backup-export.md`](../../tasks/todo-backup-export.md) (Codex + Claude, 11/10).

**Limited overturn** of the line "Never: return the raw dump to the client" of Sub-decision 3 (and the line "A door to
download dumps" in "Out of scope for this ADR"): the ban is lifted **for one door only** —
`POST /api/sites/:key/backups/:version/export` + `GET …/export/:exportId` — on every deployment
that sets `BACKUP_EXPORT=on` (dev from 11/10, production from 12/10/2026). Every other path stays banned: no other door returns a dump; the agent still does not
read dumps; dumps still do not go to the site's GitHub repo. 

**Purpose:** the customer keeps and moves their own site. No promise of "full restore elsewhere" until
the re-import round (S7 of the plan) proves it.

| Item | v1 |
|---|---|
| Who | Only the **Owner** (toolset `lifecycle`, ADR 0028), checked at both the create door and the read/link-issuing door. Editor/viewer: 403 `FORBIDDEN_EXPORT`. Editor is a separate product decision. |
| Data scope | One ZIP `<label>-backup-vN.zip`: `webroot.tar` (`git archive` at the tag's commit, files and folders only — links are dropped and counted), `db.sql.gz` (the dump as is, sha256 re-checked against the trailer), `tracy_setting.json` (`tracy-setting/v1`), `manifest.json` (scope: **files > 50 MB are not included** because history does not keep them), `SHA256SUMS`. Config: only DB host/user/password/name replaced with `tracy-placeholder`; prefix, charset, salts/`secret` and every other setting kept. The package contains the database, **personal data** and possibly the site's secrets — the UI says so clearly before the click. WordPress + Joomla; EmDash later. |
| On/off | The `BACKUP_EXPORT` switch (`on`/`off`, default **off**): when off both doors return 404 `EXPORT_OFF`, `may.export=false`; the sweeper still runs. Dev set to `on` (11/10); production set to `on` 12/10/2026 at signing; staging left empty. |
| Access | Bytes go host → artifact store → browser, not through tracy-web. The host PUTs to a pre-signed URL (TTL 2 h, covering a 30′ wait for the heavy lock + packaging); its own namespace `backup-exports/<label>/<exportId>.zip`; the general artifact doors refuse this namespace (and any key with a `.`/`..` segment). The upload URL is a secret: it reaches the job via an environment variable, reaches curl via stdin, not argv, not logged, not stored in any row. |
| URL TTL | Download link **5 minutes**, freshly signed each time the status door is asked, `response-content-disposition: attachment`, `response-cache-control: no-store`; the status door returns `Cache-Control: no-store`. |
| Retention | **24 h** from `ready`. On expiry: no more links issued (immediately), object deleted (sweeper, ≤ 1 h later). "No longer allowed to issue links" and "delete the object" are two separate jobs: the first by the door, the second by the sweeper. |
| Cleanup | Hourly sweeper (`cron.js` `sweepBackupExports`): deletes expired objects → `expired`; running rows ask the host again; still not done after 3 h → `failed`. Deleting a site: delete every export object, then the rows (`forgetSite`, in `closeBook`). The original backups' retention (20/5) is not changed. |
| Limits | 1 export running / site (partial index), 2 / account, 10 requests / hour / account (429); package ≤ 1 GiB (host refuses with `TOO_LARGE`). Packaging holds the site lock + heavy lock; **releases the locks before upload**; `ready` only after the store returns a HEAD with exactly the size the host reported. |
| Audit | `site.backup.export` with `event`: `requested`, `ready` / `failed`, `link-issued` (each time a link is signed), `deleted` (expired or site deleted). Job logs only have size, hash and error code. |

**Signing conditions:** the re-import round (S7) works on a stand; Brian answers the plan's open questions
(editor, 24 h / 1 GiB, keeping salts/`secret`, EmDash).

**Signed (Brian, 12/10/2026):** "ok, signed and approved" — answering the plan's four open questions with exactly the v1 values:

1. Editors **cannot** download; Owner only. Opening it to Editors is a separate product decision later.
2. Retention **24 h** and cap **1 GiB** unchanged.
3. The site's salts/`secret` are **kept** in the package (only the DB login details are replaced with `tracy-placeholder`),
   so a re-imported site does not log every user out.
4. **EmDash later**, with its own export format; v1 is WordPress + Joomla only.

Signing conditions met: re-import round S7 PASS on a stand (11/10, `tasks/evidence/backup-export/stand/reimport/`).
Production evidence: `tests/e2e/backup-export-dev.mjs` with `ORIGIN=https://cowork.tracy.ai` on
`kinetic-joomla.tracy.ai` (Joomla), 15/15, zip 424 MB, ready after 31.5 s (12/10/2026).
