# P4 — Importer, receipts, recovery

## Three commands to build a site

```
pnpm exec astro dev --port 4360 --host 127.0.0.1        # or: astro build && node dist/server/entry.mjs
tools/bootstrap-site.sh http://127.0.0.1:4360 ./data      # setup(+content) → mint admin/token → schema/content/media/forms/status
node tools/seed-apply.mjs status                          # must be: missing 0, untracked 0, drafts 0, media uploaded = total
```

`bootstrap-site.sh` **never** passes `--force` (D28). The first setup applies the seed with content; the
`content` pass right after takes (adopts) those entries as its own **without writing anything**, because the public data equals the seed.
Rerunning bootstrap on a site that already has an editor: everything the editor published is kept; exit 3 means some entry needs
a person to decide — read the `conflict` line, then `seed-apply adopt` (take the entries that equal the seed after looking) or
`--force` (resolve the **conflict** in favour of the seed, explicitly, recorded as `forcedOver`); `editor` entries the seed did not change are still kept —
only `--force-all` resets them. `adopt` also takes back an entry with a receipt whose `_rev` changed (discarded draft, a save
that changed nothing) when the public data still equals the seed — it does not write the site. `receipts.runs`: one record per run, `finished: true`
only when it ends (a killed run shows up immediately).

Every tool takes `--config template.config.json` (default) — identity, `locales`, `contentOrder`,
`forms.bindings` (which form writes its id into which field of which page, `{locale}` substituted per locale), `mail`.

## Receipt (`data/seed-receipts.json`, gitignored)

`entries[<coll>/<slug>/<locale>] = {id, rev, seedHash, writtenAt|adoptedAt, forcedOver?}` ·
`media[<key>] = {mediaId, contentHash (sha1:…), sha256, url, width, height, filename, mimeType, reused?}` ·
`forms[<slug>] = {id, defHash}` · `runs[]`. No token, no content.

## Reconcile rules (`content`)

| receipt | seed vs receipt | site rev vs receipt | draft? | Result |
|---|---|---|---|---|
| yes | equal | equal | no | `same` |
| yes | different | equal | no | `update` (PUT `liveData` with media merged + `publish`) |
| yes | equal | different *or* has a draft | | `editor` — keep the editor's, **don't** change the receipt |
| yes | different | different *or* has a draft | | `conflict` → exit 3, no write; only `--force` writes |
| no | — | live == seed (compared by meaning) | no | `adopt` — write the receipt, **don't** write the site |
| no | — | live ≠ seed or has a draft | | `conflict` → exit 3 (`adopt` after looking, or `--force`) |
| no entry | | | | `create` (+ `publish`) |

"Compared by meaning": boolean = 0/1, `undefined` = `null`; paths owned by the importer (targets in the
media-map, `image`/`file` fields, image sub-fields of a repeater, portable-text image blocks — the asset **and** every
upload key it produced) are taken from live before comparing. A `conflict` line names the drifting fields so the person looking can decide.
A `$ref:coll:slug:locale` reference resolves via receipt → API. Collection order follows `contentOrder`.

## Editing media / forms (`guardedPatch`, D29)

Read `liveData` (the public version; a GET with permission overlays the draft into `data`, **don't** use it). Compute the patch first:
nothing changes → `same`, even when the entry is mid-edit. Something changes and the entry has a `draftRevisionId` or `_rev` ≠ receipt
→ `conflict`, no PUT, no publish, receipt untouched. An image the editor replaced (id not in the receipt) →
kept. After the PUT, `publish` only when the entry is `published`.

`media` (D30): hash = `sha1:<hex>` of the bytes (exactly EmDash's `computeContentHash`). A receipt is trusted when the
item still exists, `status ready`, `contentHash` matches; otherwise `stale` → upload again. `upload-url` sends `contentHash`
+ `deduplicate: true`: the server returns `existing` → check that item's hash before `reuse`. Never look up by name + size.

`schema`: missing field → POST; drifting field (type/label/validation/options/required/searchable/indexed) →
PUT; collection properties (label, urlPattern, routable, hidden, sortOrder) → PUT; orphan field → report
only. New collections/taxonomies/menus: `pnpm exec emdash seed seed/seed.json --database data/data.db
--no-content --on-conflict skip`.

`forms`: create the missing ones, update when `defHash` changes, write the form id into fields per `forms.bindings` through `guardedPatch`.

## Mandatory checks before calling P4 done

Run `node --test tests/*.test.mjs` (mock API, DE/FR fixtures — `tests/seed-apply.test.mjs`): adopt does not
write · a rerun is all `same` · editor publishes → `editor`, kept, receipt untouched · seed + editor both change → exit 3, 0 writes
· an entry with no receipt that drifts → not taken over · the **bootstrap wrapper** rerun keeps the editor's text · draft + media/forms
→ both skipped · same name + size but different bytes → new upload; same bytes → reuse. Then repeat on a real site
(`evidence/recovery-test.log`): edit a field through the API/admin + publish → `content` reports `editor`.

## Backup / restore

`tools/backup.sh [data] [uploads] [out]` — SQLite online backup + uploads + receipts + token →
`<template-id>-<stamp>.tgz`. `tools/restore.sh <tgz> [data] [uploads]` — **stop the site first**. Preflight
(D32): the archive is readable, has `./data/data.db`, no `..`, extracts to a temporary folder, opens SQLite; the target must have ≥ 3
path components and must not contain `$HOME`/cwd. Only then is the current copy renamed `*.before-restore-<stamp>`
(not deleted). `tests/restore.test.mjs` runs a round-trip + 5 broken archives/targets on throwaway data.
There is no distributed transaction: a `content` pass broken midway leaves N entries published and the receipt
written up to there; rerunning continues (idempotent), no rollback needed.
