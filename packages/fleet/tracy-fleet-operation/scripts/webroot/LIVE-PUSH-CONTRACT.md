# "Sync to live" job contract (stage 1 + 2) — tracy-host ⇄ tracy-web

Plan: [`tasks/ke-hoach-sync-to-live.md`](../../../../../tasks/ke-hoach-sync-to-live.md). Host side: `webroot-live-push.sh`
(script), `lib/live_push.py` (changeset), `lib/live-write.mjs` (writes through the engine). The web side is written against this file; change
any shape here and change both sides in the same PR.

Writes to the real site only through released Claude Cowork engine actions: `content.get`, `content.update`,
`content.batch` (Joomla), `content.delete`, `media.upload`; stage 2 adds `media.delete` (Joomla, images under
`images/`), `site.identity` and `template.siteSettings` (Joomla, `operation: set`); it also reads `info`, `core.manifest`,
`file.read` (the "before" check of a file) and `operation: read` of the two setting doors. No raw row writes. Engine read at
claude-cowork origin/main `9b8a955` (24/10/2026). **Template/theme files** (§9): `template.files.status|write|undo`
from the claude-cowork branch `feat/template-file-write` (NOT YET released, read at `3118e8e` + the fix in progress 24/10/2026) —
used only when `info.template_files` is present with `enabled: true`; an old engine without it → everything as in stage 2.

> Note: `content.contract` is NOT the site's list of kinds/fields (it is the quickstart's slot contract). The kinds and
> fields that can be pushed come from the writer whitelist in the engine (`JoomlaSiteWriter::MAP`/`NESTED`,
> `Claude_Cowork_Site_Writer::POST_FIELDS`…, read at claude-cowork `0ace6bd`), kept in `lib/live_push.py` `KINDS`.

## 1. Three job kinds (`POST /_host/site`, like every webroot job)

Returns `202 {jobId}`; tracy-web polls the job as with `webroot-sync`. While running, `job.progress` keeps the
`==> [Ns] …` lines (same `syncProgressLine` as sync, at most 60 lines), including the lines of the inner Sync from live run.
**The answer = the last JSON line of `job.output`.**

Stage lines, exactly in the form `==> [Ns] stage: <name>` (web reads the name to show the step):

| job | stages, in order |
|---|---|
| preview | `syncing` (Sync from live) → `comparing` (compute the changeset) |
| apply | `writing` (write to live) → `settling` (Sync from live after writing; absent when no item was written, and with `settle: "later"`) |
| undo | `undoing` (revert on live) → `settling` (same) |

Items written alone (everything but a Joomla `content.batch` lot and the template door's batches) go to the live
site up to `TRACY_LIVE_WRITE_CONCURRENCY` (4) at once (2026-10-27): an item starts once the items it depends on have
ended, and one lane — a live record with its meta, a WordPress menu, the terms, the options, a Joomla tree, the doors
of their own (files, media, site identity, template settings) — is written one item at a time in the changeset's
order. A live site that answers busy even once (a 429, a 5xx, a timeout) is written one item at a time from then on.
Journal, `before.json` and the answer are as with one at a time; the answer keeps the changeset's order.

`settle: "later"` (apply, undo; `--settle-later`, 27/10/2026): the job answers as soon as the writes are done, with
`"sync": {"ok": true, "state": "later"}`. tracy-web then starts the Sync from live itself (`webroot-sync`, an ordinary
`site_sync` row), handing the push's write lease `push:<id>` to it as `sync:<id>` in one statement, so no Apply runs between
the writes and that sync. `sync/pushed.json` waits for it exactly as for the sync inside the job. The Owner no longer waits
for a whole Sync from live (60–90 s on WordPress) to see what was written.
Token and endpoint reach the script only through environment variables (`TRACY_SYNC_ENDPOINT`, `TRACY_SYNC_TOKEN`), never argv,
never the job record, never the answer.

| kind | body (besides `kind`, `label`) |
|---|---|
| `webroot-live-push-preview` | `previewId`, `endpoint`, `token`, optional `baseFingerprint`, `baseWebrootUrl`, `baseDbUrl`, `byName`, `byEmail` |
| `webroot-live-push-apply` | `previewId`, `pushId`, `confirm: {deletes: boolean, php?: boolean}`, `endpoint`, `token`, optional `byName`, `byEmail` |
| `webroot-live-push-undo` | `pushId`, `endpoint`, `token`, optional `byName`, `byEmail` |

- `previewId`, `pushId`: `/^[a-f0-9-]{8,64}$/` (tracy-web row id, like `syncId`). `endpoint`/`token`: checked like
  `webroot-sync` (https, or http when the host enables `exportOverHttp`; token `/^[A-Za-z0-9._~+/=-]{8,512}$/`), **required**.
- `baseFingerprint`, `baseWebrootUrl`, `baseDbUrl`: exactly the first-base inputs the `webroot-sync` job takes (sent just as
  `sites/live-sync.js` sends them for sync): the import fingerprint (object ≤ 512 KB, host writes
  `push/previews/<previewId>/sync/base-fingerprint.json` 0600, never into the environment) and the signed import archive. Only takes
  effect when the site has never synced. If the first sync answers "nothing new" by fingerprint, the host reads live in full once
  more (without the fingerprint) to get a base — preview never stops for lack of a base on a never-synced site.
- `byName`/`byEmail`: written into the backup point the downstream sync creates.
- tracy-web holds the write lease `push:<id>` for the whole job (exclusive with sync and with a chat turn writing the copy); the host does not hold
  the web's lease, only the site lock and the heavy lock, like sync.
- An old import copy still holding the real token: tracy-web runs `webroot-sync-copy-token` first, exactly as before a sync run.

Folders on the host: `<private>/<label>/push/previews/<previewId>/` (changeset, downstream sync run; swept after 24 hours) and
`<private>/<label>/push/<pushId>/` (`before.json` 0600, `journal.jsonl`, `result.json`, `undo.json`; kept 30 days,
swept on every push job run). After 30 days `undo` returns `NOT_PUSHED`.

## 2. `preview`

1. Runs **Sync from live** first (`webroot-sync.sh --op sync`, under its site lock + heavy lock). If sync stops on
   `needs_attention`/`needs_resolution` (has `held`/`conflicts`) → returns `SYNC_NEEDS_ATTENTION`, no changeset computed;
   the owner resolves it with Sync from live (Sync anyway) and then previews again.
2. Under the site lock: changeset = copy − base (base = `sync/live-base.sql.gz` + `refs/tracy/live` that the sync just set),
   ids translated through `sync/id-map.json`, WordPress addresses changed from copy to live.
   - **A known mapped record is never a new record.** A copy record that the id map says belongs to live (the copy id is a
     value in the map) but whose live id is not in the base → no `create` (recreating it would be a second copy on live): goes to
     `unsupported` `{what: "record", op: "create", reason: "no-safe-action", why: "live-record", liveId}`.
   - **Map recorded the wrong live id** (Sync from live before 24f5c8cd29: dev 24/10/2026, wp-tracy-ai `3683 → 3822` overwrote
     `3683 → 3741`, live 3741 not remembered under any id): within each record kind, a copy record that the map assigns to a
     live id that is not a record of that kind in the base, and a base record that the map does not remember and the copy does not keep under that kind, are
     one when they are the only pair with the same name (the kind's title column + creation time `post_date`/`created`; then creation time
     alone) → paired up (update or nothing), never add + remove; recorded in `repairs`
     `[{entity, kind, live, copy, was, wasNow, title}]`. Name matches but not unique → that base record is not deleted:
     `unsupported` `{op: "delete", why: "live-record-unclear"}`.
3. A place where a Sync from live run (this one or an earlier one) kept Tracy's version while the customer also edited it on live
   (sync's `kept`, the host remembers the place names in `sync/kept.json`) → that item carries `conflict: {reason: "changed-on-both"}`:
   shown to the owner, **apply does not write it** (writing would overwrite the customer's change). The conflict clears when both sides match at that place.
   Sync names a row by its id in the copy (`option_id`, `meta_id`, `term_taxonomy_id`, Joomla `menu_types.id`), while
   push items are named by name (`option_name`, `(post_id, meta_key)`, `(term_id, taxonomy)`, `menutype`): the changeset looks up
   the name of that id in the copy (`KEPT_NAMES` in `lib/live_push.py`) before comparing. Before 25/10/2026 the two naming schemes never met,
   so a WordPress setting / meta / term description edited on both sides was overwritten by the push.

Answer on success:

```json
{
  "ok": true,
  "state": "ready",                 // "nothing" when there are no items and nothing unsupported
  "previewId": "…",
  "platform": "joomla",             // | "wordpress"
  "liveReadAt": "2026-10-24T09:00:00Z",
  "sync": { "ok": true, "state": "applied", "liveReadAt": "…", "version": 12, "kept": [], "renumbered": [],
            "files": {…}, "database": {…}, "timing": { "seconds": 41 }, … },
                                    // the FULL answer of the Sync from live run that ran first (as the webroot-sync job
                                    // returns it), plus `timing.seconds`: web records it as an ordinary site_sync row
  "counts": { "create": 1, "update": 3, "delete": 0, "move": 0, "upload": 1, "files": 1, "settings": 1, "php": 0,
              "conflicts": 0, "unsupported": 2, "items": 5 },
  "limit": 200,                     // apply writes at most this many items per run
  "overLimit": false,               // true: apply writes the first `limit` items, the rest in a later run
  "hasDeletes": false,              // true: apply deletes only with confirm.deletes = true
  "hasPhp": false,                  // true: there is a "php" group; apply sends it only with confirm.php = true
  "items": [
    {
      "id": "article:12",           // stable within one preview; new items: "article:new:57" (57 = id on the copy)
      "kind": "article",            // engine kind (table §5)
      "op": "update",               // "create" | "update" | "delete" | "move" | "upload"
      "group": "change",            // "add" | "change" | "remove" (records; every deletion including files), "files", "settings",
                                    // "php" (PHP file: linted, needs confirm.php) — the UI groups by this
      "title": "About us",          // human-readable name (title, name, file path)
      "liveId": 12,                 // null for new items
      "fields": {                   // changed fields only; values per the live side, cut at 2000 characters
        "title": { "before": { "text": "About" }, "after": { "text": "About us" } }
      },
      "dependsOn": [],              // ids of items that must be written first (parent, category, image)
      "path": "media/…/user.css",   // file items only: path, "size" (bytes), "change" (added|modified|deleted);
                                    // NEVER content/blob in the answer
      "lint": { "ok": true, "php": "8.2.20" },   // PHP files only: passed `php -l` on the real site's PHP
      "warning": "parent-theme",    // only files in a WordPress parent theme (§9): updating that theme will overwrite them
      "conflict": { "reason": "changed-on-both", "fields": ["title"] }
                                    // present only when the downstream sync just kept Tracy's version where the customer also edited on live:
                                    // apply does NOT write this item (it would overwrite the customer's change), it goes to `conflicts`
    }
  ],
  "itemsTotal": 5,                  // items cut at 500 in the answer; the full changeset stays on the host
  "unsupported": [
    { "what": "file", "path": "templates/t4/css/custom.css", "change": "modified", "reason": "engine-has-no-file-write" },
    { "what": "file", "path": "images/huge.png", "change": "added", "reason": "too-large", "size": 9437184, "limit": 8388608 },
    { "what": "file", "path": "templates/t4/html/com_content/article/default.php", "change": "modified", "reason": "php-disabled" },
    { "what": "setting", "table": "options", "name": "Permalink structure", "change": "modified", "reason": "permalink" },
    { "what": "field", "kind": "article", "title": "About us", "field": "created_by_alias" },
    { "what": "record", "kind": "menutype", "title": "Main menu", "op": "delete", "reason": "no-trash" },
    { "what": "setting", "file": "configuration.php", "name": "sitename" },
    { "what": "table", "table": "extensions", "rows": 2, "names": ["plg_system_sef"] },
    { "what": "order", "kind": "menuItem", "title": "Main menu", "reason": "…" }
  ],
  "unsupportedTotal": 6,            // unsupported cut at 300 in the answer
  "engine": { "version": "0.24.54" }
}
```

Values in `fields` have the form `{"text": "…", "truncated": <real length>?}`, `{"null": true}`, or
`{"value": <number/json>}` for ids and positions. `before` is absent for `create`/`upload` of a new file.

## 3. `apply`

1. Checks the preview still holds: copy (commit after seal + the DB's effective checksum), base (`live-base.sql.gz`) and id map
   unchanged since the preview → otherwise `PREVIEW_STALE` (detail `files` | `database` | `base`): preview again.
2. Each item (order: upload → create, parent tree first → update/move → delete), at most `limit` items:
   `content.get` on live; writes **only when every field about to be written still has its base value** (CAS) — otherwise the item is a
   `conflict`, the customer's change is not overwritten. Joomla writes in `content.batch` batches with `expected` (CAS inside the
   engine's transaction); a refused batch is rewritten item by item. The "before" version of each written item (the live value
   at write time) is kept in `push/<pushId>/before.json` (0600). `delete` items are written only when `confirm.deletes = true`.
3. After writing: the id map receives the live ids of newly created records and the preview's `repairs` (a live record under its
   own id; a wrongly recorded id goes back to `wasNow` — the copy id it assigned before being overwritten — or is dropped; even on Undo, because that is
   knowledge, not a write), `sync/pushed.json` tells the downstream sync which places were pushed;
   then runs **Sync from live** so the base becomes the new live (newly created records are not copied back into the copy twice).

Calling `apply` again with the same `pushId` + `previewId` after it finished → returns exactly the old answer, plus `"repeated": true`.
Cut off midway (deploy) → calling again with the same `pushId` continues from `journal.jsonl` (written items are not rewritten).

```json
{
  "ok": true,
  "state": "applied",               // "partial": some items conflict/failed/skipped; "nothing": no item written
  "pushId": "…", "previewId": "…",
  "written": [ { "id": "article:12", "kind": "article", "op": "update", "title": "About us", "liveId": 12 } ],
  "conflicts": [
    { "id": "article:14", "kind": "article", "op": "update", "title": "Contact", "liveId": 14,
      "fields": ["introtext"],     // fields where live already differs from the base
      "reason": "changed-on-live" }  // | "changed-on-both" | "gone-on-live" | "open-in-editor"
                                     // file: fields ["file"] — live blob differs from base blob
                                     // open-in-editor: adds "lockedBy" (display name of the admin who has it open, <= 80 chars)
                                     // and "lockedSince" (ISO) when the engine returns `lockedBy`; the web shows "open by ..."
  ],
  "failed": [ { "id": "…", "kind": "…", "op": "…", "title": "…", "error": "write_failed", "message": "…" } ],
  "skipped": [ { "id": "…", "title": "…", "reason": "deletes-not-confirmed" } ],
                                    // | "php-not-confirmed" | "over-limit" | "depends-on-failed"
  "counts": { "written": 1, "conflicts": 1, "failed": 0, "skipped": 0 },
  "sync": { "ok": true, "state": "applied", "liveReadAt": "…", "version": 13, "timing": { "seconds": 38 }, … },
                                    // the FULL answer of Sync from live after the push (as in preview); ok:false →
                                    // live has changed, the copy catches up on the next Sync; {"ok":true,"state":"skipped"} when
                                    // no item was written (no sync; the web writes no site_sync row for it);
                                    // {"ok":true,"state":"later"} with `settle: "later"`: tracy-web runs it next
  "applyId": "tracy-push-<pushId>"  // apply_id in the engine's undo journal on the real site
}
```

## 4. `undo`

For each `written` item of the push: `content.get`; **only when live still has exactly the value the push wrote** does it restore
the "before" (update: write back the old value; create: move to trash; delete: restore the old state). Items the customer has edited
since → `kept` with a reason, not overwritten. Then runs Sync from live. **The copy keeps Tracy's changes** (undo only reverts
on the real site; the next preview will show those items again) — a product decision, see §7.

```json
{
  "ok": true,
  "state": "undone",                // "partial" | "nothing"
  "pushId": "…",
  "restored": [ { "id": "article:12", "kind": "article", "op": "update", "title": "About us", "liveId": 12 } ],
  "kept": [ { "id": "article:14", "title": "Contact", "reason": "changed-on-live", "fields": ["title"] } ],
                                    // reason: "changed-on-live" | "gone-on-live" | "media-not-undone" | "cannot-remove"
                                    // | "nothing-kept"; file: restores the "before" bytes (`push/<id>/files/<blob>` 0600) via
                                    // media.upload when live still has the push's blob; a new file can only be removed if it is an image
                                    // under images/ (media.delete), other new files → "cannot-remove"
  "failed": [ { "id": "…", "title": "…", "error": "…", "message": "…" } ],
  "counts": { "restored": 1, "kept": 1, "failed": 0 },
  "sync": { "ok": true, "state": "applied", … }   // the full answer of Sync from live after the revert, as in apply
}
```

Calling `undo` again after it finished → returns the old answer with `"repeated": true`.

## 5. Error codes (`{"ok": false, "code": "…", "detail"?: "…"}`)

| code | job | meaning / what the owner does |
|---|---|---|
| `PUSH_UNSUPPORTED_PLATFORM` | all three | not Joomla/WordPress (EmDash has no stage 1) |
| `NO_HISTORY`, `NO_TABLE_PREFIX` | all three | copy not complete enough (same as sync) |
| `NO_LIVE_DOOR` | all three | endpoint/token missing from the environment |
| `TOKEN_REFUSED` | all three | the real site refused the token |
| `LIVE_UNREACHABLE` | all three | cannot reach the engine (`UNREACHABLE`, `NOT_THE_ENGINE` in `detail`) |
| `SITE_RESOURCE_LIMIT` | all three | the real site returned 429/5xx after the retries; try again later |
| `SYNC_NEEDS_ATTENTION` | preview | downstream sync stopped (held/conflicts); with `sync` = the full sync answer |
| `SYNC_FAILED` | preview | downstream sync refused/broken; with `sync` (e.g. `LIVE_BUSY`, `COPY_CHANGED`, `MERGE_FAILED` "the scratch databases could not be made…" when the DB server refuses the temporary schema) |

Every preview/apply/undo answer that has `sync` (including the two errors above) carries the full Sync from live answer, so web
records a `site_sync` row and stamps `last_write_at` as for an ordinary sync run. `confirm.deletes` is a single boolean
in stage 1.
| `NO_BASE` | preview | no live read to serve as base after sync |
| `COPY_BUSY` | preview, apply | the copy DB kept changing while being read |
| `SCRATCH_DB_FAILED` | preview | the site's DB server refused to create/load the temporary schema (disk full, read-only) or the copy DB could not be read: retry when the host is healthy |
| `CHANGESET_FAILED` | preview | error while computing the changeset (`detail` holds no site values) |
| `NOT_PREVIEWED` | apply | no such preview (or it was swept after 24 hours) |
| `PREVIEW_STALE` | apply | copy/base changed since the preview (`detail`: `files`/`database`/`base`) — preview again |
| `PUSH_ID_TAKEN` | apply | `pushId` already used for another preview |
| `NOT_PUSHED` | undo | no such push (or older than 30 days) |

**Stop reason, no site values** (24/10/2026): every `ok: false` answer may carry `detail` — for
`CHANGESET_FAILED` it is `failure_line` of `lib/live_sync.py` (exception type, its last line, cut at the first
quote, and the `live_push.py` function it stopped in), for `live-write.mjs` errors it is the type + first message line cut the same way. The script
also prints a progress line `==> [Ns] <preview|apply|undo> stopped: CODE: detail` (or the code + detail of the inner Sync from
live run). A changeset that stops without printing an answer (killed) → `CHANGESET_FAILED` "the changeset stopped with no
answer". tracy-web keeps the full answer on the `site_push` row (`preview` / `result` / `undo`), reads the reason out to the view
(`errorDetail`, `undoErrorDetail`) and the audit (`why`); a job that dies with no answer → the last `stopped:` line is taken as the answer.

Codes in `failed[].error` are engine codes (`write_failed`, `bad_params`, `unsupported`, `not_found`, …).

## 6. What can be pushed (stage 1)

| CMS | kind | create | edit (fields) | delete (to trash) |
|---|---|---|---|---|
| Joomla | `article` (`#__content`) | yes | title, alias, introtext, fulltext, state, catid, images, urls, attribs, metadata, metakey, metadesc, language, featured, ordering, access, publish_up, publish_down, note | yes (`state = -2`) |
| Joomla | `category` (com_content) | yes | title, note, description, published, access, language, params, metadesc, metakey; parent (move) | yes |
| Joomla | `tag` | yes | title, note, description, published, access, language, params; parent | yes |
| Joomla | `menuItem` (site) | yes | title, note, published, params, home, language, template_style_id, link; parent + order (move) | yes |
| Joomla | `menutype` | yes | menutype, title, description | no (no trash) |
| Joomla | `module` (site) | yes | title, note, content, position, module, access, showtitle, params, published, language, ordering | yes |
| Joomla | `moduleAssignment` | — | pages the module shows on (`menuids`) | — |
| Joomla | `redirect` | yes | old_url, new_url, comment, published, header | yes |
| Joomla | `fieldValue` | no | `value` of an existing single-line value | no |
| Joomla | media `images/…` | upload (≤ 8 MiB) | overwrite when live still has the base version | no |
| WordPress | `post` (post, page) | yes | post_title, post_content, post_excerpt, post_status, post_name, post_parent, menu_order, post_date; categories, tags | yes (trash) |
| WordPress | `term` (category, post_tag, nav_menu) | yes | name, slug, description, parent | no (engine does not allow it) |
| WordPress | `menuItem` | yes | title, url, type, object, object_id, parent, position | yes |
| WordPress | `option` | yes, only when live does not have that option yet (`expect: {"$absent": true}`) | blogname (site name), blogdescription (tagline), date_format, time_format, start_of_week, posts_per_page, show_on_front, page_on_front, page_for_posts | — |
| WordPress | `postmeta` of a post/page | yes (new key) | non-serialized values (e.g. `_thumbnail_id`, `_wp_page_template`, SEO meta) | no |
| WordPress | media `wp-content/uploads/…` (new attachment image) | upload + attachment | no | no |

Stage 2 also pushes files and settings (§8). The rest of stage 1 is `unsupported` (names listed, not written): theme/template/CSS/PHP files, `configuration.php`/`wp-config.php`
(the name of each setting, except environment settings), extension tables without a kind (table name + row count; `extensions`: extension
name), users/permissions, `templateStyle`/`extensionParams`, tags of Joomla articles, Joomla contacts/banners/newsfeeds
(the engine can write them but sync does not renumber those tables, so it cannot know for sure which record is which), serialized
options (theme mods, widgets), fields outside the whitelist (e.g. `created_by_alias`, alias of a category/menu when edited),
deleting terms/menutypes, changed or deleted media (WordPress), files > 8 MiB.

Sibling order in Joomla trees (menus, categories, tags) goes through `move` items (`parent_id` + `move_after`): each item follows
the sibling before it on the copy; a newly created record is placed last under its parent, so creating in the copy's order needs no move.

## 7. Product decisions needed (the host currently picks the default in the right column)

| question | stage 1 default |
|---|---|
| More than 200 items | write the first 200 items (in dependency order), the rest `skipped: over-limit`, the next run pushes on |
| Does Undo revert the copy | no: undo only reverts on the real site; the copy keeps Tracy's changes |
| How long to keep `before.json` | 30 days (expired → cannot Undo) |
| Item hard-deleted on the copy | on live only moved to trash (the engine does not delete permanently) |
| Places edited on both sides (sync kept Tracy's version) | never pushed; the owner must make both sides match (no "overwrite" button yet) |
| Joomla contacts/banners/newsfeeds | not pushed yet (see §6) |
| New record whose engine-generated alias/slug differs from the copy | left as is; the next preview reports `unsupported` field alias |


## 8. Stage 2 — files and settings

### What can be pushed

| CMS | type | via action | CAS | Undo |
|---|---|---|---|---|
| Joomla | files under `images/` and `media/templates/` (CSS/JS/SCSS/images of a J4/J5 template in `media/templates/site/<tpl>/`), added/modified, ≤ 8 MiB; the rest of `media/` belongs to extensions → `extension-file` (goes with the extension, not on its own) | `media.upload` (one file per call) | `file.read` → the live file's git blob must equal `baseBlob` (new file: absent, or already the copy's blob) | write back the "before" bytes when live still has the push's blob; new file: `images/` image → `media.delete`, otherwise `cannot-remove` |
| Joomla | images under `images/` deleted on the copy | `media.delete` (needs `confirm.deletes`) | live blob = `baseBlob` | `media.upload` the old bytes when live still lacks the file |
| Joomla | PHP files under `images/`/`media/templates/` | like files, group `php` | like files + `php -l` on the real site's PHP (`info.php`, image `joomla:php<x.y>-apache`, `--network none`; `TRACY_PHP_LINT` can replace it) at preview; apply re-checks blob = the linted bytes; needs `confirm.php` | like files |
| Joomla | `sitename`, `MetaDesc`, `sitename_pagetitles` of `configuration.php` | `site.identity` set | `site.identity` read: each value = base value | read = the value the push left → set the before value |
| Joomla | params, title of the site template style (`#__template_styles`, client 0) | `content.update`/`content.batch` `templateStyle` | `expected` like every kind | like every kind |
| Joomla | whitelisted keys of the T4 profile `templates/<t>/local/etc/site/<p>.json` (`site_logo*`, `site_name`, `site_slogan`, `other_faviconFile`) and the file `tracy-favicon.json` (`other_shareImage`, `other_glyphFaces`, + `other_faviconFile` in non-T4 templates) | `template.siteSettings` set (`profiles` or `fields`); images it names are uploaded first in the same run (`dependsOn`) | read: each key = base value (base file in `local/`, else `templates/<t>/etc/site/<p>.json`; neither → `base-unknown`) | read = the value the push left → set the before value |
| WordPress | existing Media Library image whose bytes were replaced (base `_wp_attached_file`) | `media.upload` (the engine rebuilds the sizes) | live blob = `baseBlob` | `media.upload` the old bytes |
| WordPress | options: adds `site_icon` (attachment id, translated through the id map / placeholder), `timezone_string`, `gmt_offset`, `posts_per_rss`, `rss_use_excerpt`, `default_comment_status`, `default_ping_status`, `comment_registration`, `comments_per_page`, `page_comments`, `thread_comments` | `content.update option` | as in stage 1 | as in stage 1 |
| WordPress | theme mods of the active theme (`theme_mods_<stylesheet>`, serialized): each key (`custom_logo`, `custom_css_post_id` with post id translated, `nav_menu_locations` with term ids translated, strings with addresses changed) | `content.update option` (writes the whole option = live/base value + the keys Tracy changed) | the whole live option must equal the whole base option (the engine writes the whole option, so the customer editing another key is also a conflict) | write back the whole before option |
| WordPress | Customizer › Additional CSS (post `custom_css`) | `content.update post` (`expected_body_revision`) | `post_content` = base | like posts |
| WordPress | block theme: template part / template of the active theme (`wp_template_part`/`wp_template` with term `wp_theme` = `stylesheet`), by slug | `content.update templatePart`/`template` with `key` = slug, always sending both `content` + `title` (without `title` the engine names it after the slug; a new part also sends `area`); a new part `expect {$absent}` (written only while live still serves the theme's file: `content.get` returns `stored: false`), `creates posts:<copy id>`; the copy dropped the part → `content.delete` (gives the place back to the theme file, needs `confirm.deletes`) | `content` + `title` = base, `expected_body_revision`; live already returned the part to the theme (`stored: false`) → an update = `changed-on-live`, a delete = already done | update: write the old one back; create: `content.delete`; delete: write the part back while live still serves the theme file |
| WordPress | block theme menus (`wp_navigation`), synced patterns (`wp_block`), Styles of the active theme (`wp_global_styles`, update only) | `content.update post` (`expected_body_revision`); ids in `{"ref":…}`/`{"id":…}` translated through the id map | `post_content` (+ `post_title`, `post_status`) = base | like posts |
| WordPress | other post types (products, forms, fonts…) | not sent: `unsupported` `{what: record, kind: <post_type>, reason: no-safe-action}` | — | — |

Groups in the preview: files → `files` (PHP → `php`), settings → `settings`, file deletions → `remove`. After a push,
`sync/pushed.json` also has `files: [{path, ours: <copy blob>, side}]` and `settings: [{path, setting, side}]`:
the file merge of a later Sync from live takes the live version of a just-pushed file when the copy still has the blob that was sent (the engine may write
the same value in its own layout), and after Undo (`side: theirs`) keeps the copy's version. A place where the file merge keeps Tracy's version even though
the customer also edited it (a file, or a `configuration.php` setting) goes into `sync/kept.json` (names only) → that item is
`changed-on-both`.

### Never pushed (name + `reason` listed)

`excluded` (cache/tmp/logs, `media/t4/optimize|css`, `t3-assets`, WordPress cache…, same list as
`lib/webroot-excludes.sh`), `server-config` (`.htaccess`, `.user.ini`, `php.ini`, `web.config`), `symlink` (mode
120000/160000), `too-large` (> 8 MiB, with `size`/`limit`), `configuration.php`/`wp-config.php` as files (settings
other than the three above: `no-safe-action`), Tracy's own files (`TRACY_ONLY`, `media/com_claudecowork/`…: silent),
`permalink` (`permalink_structure`, `category_base`, `tag_base`), `theme-switched` (theme mods of a theme the copy runs but
live does not), `unreadable` (a PHP serialized value containing an object), `php-lint-failed`, `php-lint-unavailable`,
`extension-file` (Joomla: files in `media/` outside `media/templates/`), `not-a-media-item` (WordPress: a file in uploads that is not an existing Media Library image — `media.upload` would create a new
attachment), `engine-cannot-delete-file` (deleting files other than Joomla `images/` images, every WordPress file deletion).

### `engine-has-no-file-write` — what the engine needs (to decide separately, NOT done here)

> 24/10/2026: that action now exists in claude-cowork (`template.files.*`, not yet released) — usage in §9. The part below is kept
> as the rationale; with an old engine the reason `engine-has-no-file-write` still holds.

Every file outside `images/`/`media/templates/` (Joomla: `templates/<tpl>/css|js|scss|less`, `templates/<tpl>/html/…`
PHP overrides, `templates/<tpl>/local/etc/theme|layout`) and every file outside `wp-content/uploads/` (WordPress: theme, child theme,
plugin) — the released engine has no action that writes a file there safely:

- `files.restore` (Joomla) can write any file under `JPATH_ROOT` (extracting a tar downloaded from a URL), but: no CAS
  in the engine, no undo journal entry, cannot delete files, needs a public URL serving a tar of the customer's PHP code,
  and its purpose is rescuing a core upgrade. Not used.
- An action sufficient for this needs: (1) a relative `path`, confined under a list of roots (the installed site template,
  the active child theme/theme), realpath not escaping the root, no symlinks; (2) the live file's `expected_sha1` (or
  `absent: true`) checked UNDER the engine's write lock, refusing with `conflict` on mismatch; (3) base64 bytes + `sha256`, a size
  limit like `media.upload`; (4) write the "before" bytes into the `apply_id` journal so `apply.revert` restores them (new file → delete);
  (5) PHP: `php -l` with the site's own PHP before replacing (or `token_get_all` + refuse), write to a temp file then atomic
  `rename`, `opcache_invalidate`; (6) a fixed deny list (`configuration.php`, `wp-config.php`, Tracy's files,
  `.htaccess`, cache folders); (7) a batch of many files with a per-file `expected`, all or nothing (like
  `content.batch`). With that action, the changeset only needs to change `FILE_ROOTS` and the writer calls it instead of `media.upload`.

### Stage 2 default decisions

| question | default |
|---|---|
| PHP files | only under Joomla `images/`/`media/templates/` (where the engine can write); lint + a separate tick; PHP template overrides: cannot be pushed yet (above) |
| WordPress theme mods | CAS on the whole option: the customer changing any key after sync → the whole option is a conflict |
| New CSS file (not an image) added by a push | Undo cannot remove it (`cannot-remove`); the file stays on live |
| Joomla `extensionParams` (plugin/component params) | still listed (`extensions` table), not pushed yet |
| `template.languageOverrides` (language override files) | not pushed yet (that door only accepts the keys it proposes) |

## 9. Template/theme files through the engine's template door (`template.files.*`)

Engine: claude-cowork `joomla/cowork/lib/TemplateFiles.php` (WordPress has the same file), README "A template's own files" /
"A theme's own files". **Not yet released** at the time of writing (branch `feat/template-file-write`).

**Preview.** `live-write.mjs info` reads `info.template_files`: absent (old engine) → `templateFiles: null`; `enabled:
false` → `{enabled: false}`; enabled → `template.files.status {}` gets `roots` (`{path, kind, name, php}`), plus `php`,
`max_file_bytes` (2 MiB), `max_bytes`, `max_files`, `extensions`. The preview's `engine.json` goes into the changeset via
`--engine`. A changed file under a root (longest matching root) becomes a `file` item with `door: "template"`, `root`:

| case | result |
|---|---|
| added / modified | `op: upload`, group `files` (PHP → `php`: still linted on the host + `confirm.php`) |
| deleted | `op: delete`, group `remove` (needs `confirm.deletes`) |
| file in a WordPress parent theme (`kind: parent-theme`) | as above + `warning: "parent-theme"` |
| PHP when `php: false` | `unsupported` `php-disabled` (the dialog says to enable "Allow PHP in template files" / WordPress "Allow PHP in theme files") |
| PHP under `media/templates/site/<tpl>/` (root `php: false`) | not through this door: as in stage 2 (`media.upload`, group `php`) |
| extension outside `extensions`, forbidden name, dotfile, executable double extension, deeper than 16 levels / 512 bytes | `not-a-template-file` (under `media/templates/` it falls back to `media.upload` as in stage 2) |
| new file or live file larger than `max_file_bytes` | `too-large` with `size`, `limit` |
| under `templates/` / `wp-content/themes/` but in no root | `not-a-live-template` (template not installed / theme not active on live) |
| door disabled | `template-files-off`; engine has no door → `engine-has-no-file-write` (as before) |
| T4 profile `local/etc/site/<p>.json` changing only keys that `template.siteSettings` writes | still through `template.siteSettings` (CAS per key); other keys changed too, or no base file → the whole file through the template door |

The changeset adds `templateFiles: {maxFileBytes, maxBytes, maxFiles}` for the writer.

**Apply.** Consecutive `door: template` items are batched: ≤ `maxFiles` files and ≤ min(`maxBytes`, 4 MiB) decoded bytes per
batch (~5.6 MB base64, under the default 8 MB `post_max_size`). Each file is `{path, expected_blob: baseBlob | null, content_b64,
sha256}` or `{path, delete: true, expected_blob}`; bytes are read from the copy's webroot, the blob must match the previewed blob (otherwise
`failed: copy_changed`). `apply_id` = `tracy-push-<pushId>`. The engine returns:
- `conflict` → each `conflicts[].path` is a `conflict` item (`changed-on-live`, `actual: null` → `gone-on-live`, `fields:
  ["file"]`), nothing of it is written; the batch is resent without them.
- `refused` → each `refused[].path` `failed` (`php_disabled` with the engine's `next` sentence; otherwise `refused_<reason>`);
  `php_lint_failed` → each `lint[].path` `failed`; `too_large` with `path` → that file `failed`, without `path` → split the batch in half.
  The rest is resent. Other whole-batch errors (`disabled`, `write_failed`, …) → every file of the batch `failed` with that code.
- `writer_busy` → ask again (same `retried` as every action, 4 times).
- success → `undo_id` kept in `before.json` (`templateUndo`, and each item's `undoId`); files with `op: unchanged` are
  `written` + `already` (nothing to Undo).

**Undo.** `template.files.undo {apply_id: tracy-push-<pushId>}` once (every batch of the push, newest first):
`restored`/`already` → `restored`; `kept` → `kept` with a reason (`changed-on-live` + `exists-on-live` → `changed-on-live`,
`gone-on-live`, `disabled` → `template-files-off`, `out-of-scope` + `detail: php_disabled` → `php-disabled`, otherwise
`cannot-restore`). Files the push created are removed (no more `cannot-remove` for these roots). `not_found` → `nothing-kept`.

**Sync from live afterwards.** File items of the template door go into `sync/pushed.json` `files` like stage 2 files (`record`).
