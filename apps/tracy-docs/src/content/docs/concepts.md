---
title: Concepts
description: Sites and site keys, seats, roles and toolsets, the content map (content, block, field, slot, native), revisions and versions, undo, and plugin versions.
---

## Site and site key

A **site** is one customer website Tracy hosts or has imported: a Joomla, WordPress or EmDash
installation with its own address. Its **site key** is its canonical name (for example
`shop.example.com`) and appears in every path: `/v1/sites/{key}/…`. A site may also be reached by
an alias; Tracy normalises the key before authorising, so the answer is the same whichever name you
used. An unknown key answers `404`.

## Seats, roles and toolsets

A **seat** is one person's membership of one site, with a **role**: `owner`, `admin`, `developer`
or `editor`. A role grants **toolsets** — the four families every action belongs to:

| Toolset | Covers |
|---|---|
| `content` | words, pictures and links: records, contents, contract applies, media uploads, undo |
| `code` | templates, modules, extensions, themes, plugins and the layout they define |
| `site` | the site's data as a whole: database tables, dumps, snapshots |
| `lifecycle` | building, releasing, restoring and deleting the site |

Which toolset each action needs is written beside it in the [API reference](/reference/). The
default floor is: editor → `content`; developer → `content`, `code`; admin → `content`, `code`,
`site`; owner → everything. A site or workspace policy may narrow a role below the floor, never
widen it. An API key adds one more narrowing: its scopes (see [Authentication](/authentication/)).

## The content map

The Content API describes a site in one shape whatever the CMS. From the outside in:

- **Page** — one address of the live site, in one locale, listing the contents it shows.
  `GET /v1/sites/{key}/pages` answers every published page with a `version` of the list.
- **Content** — one editable unit: a post, an article, a menu, a shared region. It has an `id`, a
  `type` (the site's content types — the site's `describe` lists them), a `locale`, a `revision`,
  its `blocks`, and `native`.
- **Block** — one part of a content: a heading, a paragraph, an image, a call to action. Blocks
  carry `fields`, and a `visibility` (`visible`, `hidden`, `unknown`) that says whether the live
  page shows them.
- **Field** — one value inside a block: a text, a link, an image path — the level at which words
  are read and, through the record they belong to, written.
- **Slot** — on a site built from a Tracy quickstart, a named position the design keeps filled
  (`hero.0`, `footer.contact`). Slots are the addresses of `POST …/contract/apply`, which checks
  every change against the site's content contract before writing anything.
- **`native`** — the CMS rows a content comes from: the record `kind` and `id` (and on WordPress the
  `key`) that a `PATCH …/records/{kind}/{id}` changes. It is the bridge from the uniform map to the
  site's own data; the guides list each CMS's kinds.

`GET /v1/sites/{key}/contents` lists contents (filter by `type` and `locale`, page with `limit` and
`cursor`, trim with `fields`, bound the answer with `maxBytes`); `GET …/contents/{id}` reads one in
detail, blocks paged with `blockId` and `blocksCursor`.

## Records

A **record** is one row of the CMS as the site holds it — the surface under the content map. On
Joomla: `article`, `category`, `menuItem`, `module`, `templateStyle` and more; on WordPress:
`post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`. `GET …/records/{kind}` lists one
page, `GET …/records/{kind}/{id}` reads one row (WordPress kinds without a numeric id take `?key=`),
`PATCH` writes fields, `DELETE` moves it to the trash. Records have no revision check — a `PATCH`
writes what you send; read first, and keep writes small.

## Revisions, versions and `changedSince`

- A content's **`revision`** changes when that content changes. `GET …/contents/{id}` answers it as
  the `ETag`; `If-None-Match` with the same value answers `304`.
- The pages list has a **`version`**. `GET …/changes?since=<version>` answers what moved since:
  the contents changed, added or removed, and a new `version` to continue from. Send the last
  `version` back as `If-None-Match` to learn cheaply that nothing moved.
- **The limits of `changedSince`, said plainly.** Versions are held in the memory of the Tracy
  process for **30 minutes** and at most **500 walks**; they are not a durable log. When a version is
  too old, from before a restart, or from another seat, the answer is `409 CONTENT_SNAPSHOT_EXPIRED`
  — read `/pages` again without `since` and continue from its new `version`.
- **`If-Match`** is honoured only where the site guarantees the check: `POST …/contract/apply`
  passes it as the expected content revisions, and a stale revision answers `409` with
  `REVISION_STALE`. Records `PATCH`/`DELETE` do not take `If-Match`.

## Undo: `apply_id` and revert

Every write is recorded under an **`apply_id`** — a receipt you name in the `Tracy-Apply-Id` header
(or Tracy names for you: `api-<keyId>-<timestamp>`). Several writes may share one receipt; a
`DELETE` requires you to name one.

- `GET /v1/sites/{key}/applies` — the audit trail of the site's applies.
- `GET …/applies/{id}` — the steps recorded under one receipt (kind, id, media path, created).
- `POST …/applies/{id}/revert` — puts back every step, newest first; a record open in the CMS
  editor refuses the revert and the answer names who holds it (`lockedBy`).

Contract applies (`POST …/contract/apply`) are undone the same way; their receipts start with
`contract-`.

## Idempotency

`PATCH …/records/{kind}/{id}` accepts an **`Idempotency-Key`** header. Retrying with the same value
after a lost reply answers the stored result instead of writing again. It is passed to the site as
the plugin's `request_id`, so it exists only for the actions whose plugin stores results —
`content.update` (records `PATCH`) and, on Joomla, `content.batch`. No other route promises it.

## Plugin versions

On Joomla and WordPress the site answers through the **Claude Cowork plugin** installed on it, and
each action exists from a given release of that plugin. `GET /v1/sites/{key}` (the site's
`describe`) reports what the site runs; the [Compatibility](/reference/compatibility/) page
lists the minimum release per action, and each guide says how to update. An action the installed
release lacks answers `400 bad_action`; a Content API read on a plugin older than the Content API
answers `501 CONTENT_ADAPTER_UNSUPPORTED`.

EmDash sites have no plugin: Tracy reads them through its own reader (see the
[EmDash guide](/guides/emdash/)).

## Design system

Every site Tracy builds wears one **design system**: a named palette, type scale and spacing, kept
as CSS custom properties (tokens). `GET /v1/sites/{key}/design` answers which one, where it comes
from (`source`: a system of the catalogue, the customer's own `brand`, a `quickstart`'s own tokens,
the `template`'s, or `none`) and the token values the site wears. Tracy records them when the site
is built and again whenever `theme.style` switches the look, so the answer follows the site, not the
template it started from. Use the tokens to keep what you write inside the site's palette and fonts —
a colour or font outside them is what Tracy's own design check flags.

```json
{
  "design": {
    "id": "apple",
    "name": "Apple",
    "source": "catalog",
    "platform": "wordpress",
    "tokens": { "--accent": "#0071e3", "--font-body": "\"SF Pro Text\", sans-serif" },
    "tokensFrom": "tracy-web:design-tokens.json",
    "updatedAt": "2026-09-29T12:00:00.000Z"
  }
}
```

`{"design": null}` is an answer, not an error: the site wears no system Tracy knows of. The ETag
follows `updatedAt`, so `If-None-Match` answers `304` until the look changes.
