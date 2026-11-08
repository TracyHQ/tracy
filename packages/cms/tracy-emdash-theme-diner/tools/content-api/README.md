# Experimental EmDash Content API

Authoritative source: this kit. Tested with EmDash 1.1.0, Astro 7 Node SSR and
SQLite. Stock EmDash, no core patch, public API only: entries are read through
`locals.emdash.handleContentList`/`handleContentGet` (typed by `emdash/locals`) and
authorized with `hasPermission` from `@emdash-cms/auth`, which a template using the
reader must list as a direct dependency at the same version as `emdash`. No
`emdash/internal/*` import: those paths change without notice in any release. Every template answers it: the image builds
the reader in (`TRACY_CONTENT_API_SCALARS`, Dockerfile ARG default 1, carried as
ENV for rebuilds in the container); a build with `=0` leaves it out. Full
capability (writes, menus, references) is still not advertised.
`tools/content-api-gate.mjs` checks a package has the reader, its map and model,
the switch on, and the provenance stamps (`src/lib/stamps.ts`) whose ids it
resolves.

## Identity lifecycle

Templates provide `seed/content-api-map.json` (collection types/URLs, optional
`urlField` naming a data field that holds an entry's own path — a site built from
sections keeps each page's path in its data — and optional native HTML `bodyField`;
`chrome` is one `{collection, slug}` or a list of them when the header and footer
print several entries), `seed/site-model.json` (mapping only) and locale config.
Add `contentApi` before EmDash. The official route injection uses the native API
prefix; `/content.json` performs an Astro rewrite through native init/auth.

Explicit offline commands, run only by an authorized operator/provisioning process:

- `node tools/content-api/identity-sqlite.mjs init <db>`: seed/epoch, plus repeater
  row identity (below). Rerunnable; never rotates an identity already there.
- `... fork <db> <operation-uuid>`: newSite:true semantics; rotate seed/epoch, retain
  internal row UUIDs. The same operation UUID is retry-safe, including concurrent calls.
- `... restore <db> <operation-uuid>`: after same-site backup restore, preserve seed
  and rotate only cursor epoch. These commands are not agent relay actions.

Site/content/block/item IDs derive from the persisted site seed. Item namespace
includes content, field and native row UUID. Domain and encryption-key changes do
not change IDs. Fork does. Copying a DB preserves identity unless the operator
explicitly declares fork; no hostname/path fingerprint or automatic clone detection.
GET never mints or repairs IDs. Missing initialization is unsupported.

## Repeater row identity (option A)

Every command above also installs row identity for each repeater field: it stamps a
UUID v4 `_rowId` into each stored row that lacks a usable one, in live columns and
revision payloads, and adds SQLite triggers (`tracy_rowid_<collection>_<field>_*`) that
do the same on every later insert/update. Stock EmDash keeps unknown row keys
(repeater rows are `.loose()`), so an edit or reorder that round-trips the stored rows
keeps each id. A row written without one — added, or deleted and recreated — is a new
row with a new id; a pasted copy of an existing row is a new row too. Nothing is
refused and nothing is tracked: a write that brings back an old `_rowId` (native
revision restore, the existing `personalize --revert`) keeps that id, and no identity
is promised across a native restore beyond what the restored rows carry. Arrays that
are not arrays of objects are left as stored and read as `REPEATER_IDENTITY_INVALID`.

Limit only a core change can lift: the stock admin editor does not learn an id minted
after it loaded the entry. A row added in the admin is re-sent without `_rowId` by
each autosave of that same editor session, so it gets a new id each save until the
page is reloaded; from then on its id is stable. The fix is upstream: the repeater
editor minting `_rowId` when it adds a row (`RepeaterField.tsx` `handleAdd`).
Collections/fields created after the last `init` have no triggers; their repeaters
read as `REPEATER_IDENTITY_UNSUPPORTED` until `init` runs again.

## Authority and transport

GET requires a PAT and always returns published content. URL authority is rejected.
POST `/content.json` is a read-only command: `action:content.read`, flat `params`,
and top-level `contentPrincipal`/`contentScope`. Only the exact service PAT whose
SHA-256 (hex) is set in server `TRACY_CONTENT_API_RELAY_TOKEN_SHA256`, or else in
`tracy-content-relay.sha256` beside the app (root-owned, not group/other-writable,
written by provision), may supply authority. The relay must derive it after checking current seat/site/policy, not
forward caller input. Success/error is direct. No content write endpoint is added.

Transport (`command.mjs`, `alias.mjs`): native 0.38 auth maps every POST under
`/_emdash/api/content` to content:write, so the alias turns the canonical POST into
an internal GET rewrite to the native route. The params become the query; the
authority travels in `x-tracy-content-principal`/`x-tracy-content-scope`. The alias
strips those headers from every request it forwards, and the route honours them
only for the relay PAT (403 otherwise, never a silent downgrade). Native auth runs
unchanged on the rewrite, so a read-only PAT (`content:read`) is enough. The native
route has one door, GET; POST there still meets native write scope and then 405.

Relay stays published. `TRACY_CONTENT_API_NATIVE_EDITORIAL_PROBE=1` is an isolated
native editorial test switch, not a seat grant. Native permissions still apply.
Session-only access is unsupported. Supply runtime `EMDASH_ENCRYPTION_KEY` and
canonical `EMDASH_SITE_URL`; cursor signing derives separately from key/seed/epoch.

## Projection and pagination

Scalars, images and repeater groups with stored row identity read native live values.
An image field stays a field (`type: image`, value = the URL the page serves:
`/_emdash/api/media/file/<storageKey>` for local media, the provider URL otherwise) and
each stored media is one `images[]` entry with its stored alt/width/height (null when
absent, never invented) and `usages` naming the content, block and item that hold it
(block/item null for a content-level field). An item page lists only the usages it can
resolve. Long text (`prose` in the site model) is plain text: a string field is one `text`
value under its key; Portable Text is one `text` value per text block, keyed
`<field>.<_key>` with the block's stored key (the EmDash editor keeps it across saves, so
the id survives edits elsewhere in the field; the template stamps the same key on the
rendered block). A block without a unique stamp-safe key is left out
(`PROSE_IDENTITY_INVALID`), never given an index-derived id; non-text blocks are skipped.
Other rich-text shapes, references and menus remain unresolved. Chrome bindings and translation groups are explicit.
List summaries omit heavy detail. Item windows use `id`, `limit` (1–100), signed
`cursor`, absolute positions and itemsPagination. Terminal continuation is partial;
null pagination cursor ends the scan, even when links.next points back to content.

Oversized mapped bodyHtml returns 413 with owner/field identity. Readable blocks
permit error.links.firstBlock plus error.snapshot; the URL carries only id, blockId,
blocksCursor. Each continuation rechecks auth, principal/scope, owner, snapshot and
expiry. Terminal blocksPagination.nextCursor is null; omitted body is not complete.
A single item/scalar beyond the 256 KiB ceiling remains 413. Other unsupported
detail shapes may return 501. No rich-text renderer is inferred.

## Byte budget (`maxBytes`)

`maxBytes` (integer 8192–262144) is the caller's budget for one answer, measured on
the UTF-8 of the JSON envelope; anything else is `CONTENT_BAD_QUERY` with
`field: "maxBytes"` and the range. A listing pages by whole contents while they fit
(`limit` still applies); `nextCursor` names the first content not sent and `total`
keeps its meaning. `pagination.budget` is the budget applied, `pagination.bytes` the
size of the answer. When the first content alone exceeds a budget the caller SENT,
it is sent cut: the longest text value (a text field, bodyHtml, or a summary's
title) is cut to maxBytes/2 characters on code-point boundaries, further if still
needed; the content and each cut field say `truncated: true`; revisions do not
change. Without `maxBytes` nothing is cut: a listing pages at 65536, a detail read
keeps the 256 KiB ceiling and its 413s. The cursor is not bound to `maxBytes`
(its offset is absolute), so each page may use a different budget.

Reads scan the mapped authorized scope inside one SQLite transaction. The token is
authenticated and scope-checked once, by EmDash's own middleware, when the request
enters; roles are checked against the same rules as the native content routes. Mapping, roles/scopes/token, records, schedules and origin
participate in snapshot invalidation. Five-minute expiry, 256 KiB and 10,000 source
row ceiling apply. Small payloads do not imply small source I/O. Postgres/D1 are
refused; media/menu snapshots, nested groups and arbitrary external writes are not
certified. Route collision checks preserve existing routes.

## Rollback

The triggers only stamp ids; dropping them (`DROP TRIGGER tracy_rowid_…`) returns the
site to stock behaviour, and the stamped `_rowId` keys are ignored by every renderer.
No customer installation is authorized by this kit alone.
