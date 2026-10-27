---
title: Quickstart
description: Five curl calls — create a key, check it, list a site's pages, change one title, and undo it.
---

You need a seat on a Tracy-hosted site (any role) and `curl`. Every call below goes to
`https://api.tracy.ai` (on the development environment, `https://api.tracy.site`) and carries the
key as a Bearer token. Nothing here uses a browser session.

## 1. Create a key

Open the site in Tracy, go to **Settings → API keys**, and create a key for that site. Choose a
label (for example `demo laptop`) and the scopes it may use — `content` is enough for this page.

The full key is shown **once**: `trk_<16 characters>.<32 characters>`. Store it where you keep
secrets; Tracy keeps only a hash of it. The list of keys shows a hint of each key, never the secret.

```bash
export TRACY_KEY='trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy'
export TRACY_API='https://api.tracy.ai/v1'
```

## 2. Check who the key acts as

```bash
curl -s "$TRACY_API/me" -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "email": "you@example.com", "keyId": "xxxxxxxxxxxxxxxx", "siteKey": "shop.example.com", "scopes": ["content"] }
```

A key is bound to one account and one site. `siteKey` is the site's canonical name and the value of
`{key}` in every path below.

## 3. List the site's pages

```bash
curl -s "$TRACY_API/sites/shop.example.com/pages" -H "Authorization: Bearer $TRACY_KEY"
```

The answer is the Content API `pages` document: every published page with its `contentId`,
`locale`, `url` and `revision`, plus a `version` of the whole list. The response carries an `ETag`
equal to that version; send it back as `If-None-Match` and the answer is `304 Not Modified` when
nothing moved.

Read one content in full (blocks, fields, the CMS rows it comes from):

```bash
curl -s "$TRACY_API/sites/shop.example.com/contents/<contentId>" -H "Authorization: Bearer $TRACY_KEY"
```

Each content names its `native` record — the CMS kind and id the words live in. That is what the
next step changes.

## 4. Change one title

Records are the site's own rows: a Joomla `article`, a WordPress `post`, and so on. A `PATCH`
writes the given fields of one record and records how to undo it under an `apply_id` you choose
(header `Tracy-Apply-Id`; Tracy generates `api-<keyId>-<timestamp>` when you leave it out).

```bash
curl -s -X PATCH "$TRACY_API/sites/shop.example.com/records/post/42" \
  -H "Authorization: Bearer $TRACY_KEY" \
  -H "Content-Type: application/json" \
  -H "Tracy-Apply-Id: quickstart-title-1" \
  -H "Idempotency-Key: quickstart-title-1-try-1" \
  -d '{ "fields": { "post_title": "Fresh bread every morning" } }'
```

```json
{ "kind": "post", "id": 42, "created": false }
```

On Joomla the same change is `records/article/<id>` with `{ "fields": { "title": "…" } }`. The
change is live at once. Retrying with the same `Idempotency-Key` after a lost reply answers the
stored result instead of writing twice.

## 5. Undo it

```bash
curl -s -X POST "$TRACY_API/sites/shop.example.com/applies/quickstart-title-1/revert" \
  -H "Authorization: Bearer $TRACY_KEY"
```

```json
{ "reverted": 1 }
```

Everything recorded under `quickstart-title-1` is put back, newest first. `GET
…/applies/quickstart-title-1` lists what the receipt holds before you revert it.

## What to read next

- [Authentication](/authentication/) — what a key may do, and what it may never do.
- [Concepts](/concepts/) — pages, contents, blocks, fields, slots, records, revisions and undo.
- [Guides](/guides/joomla/) — what differs on Joomla, WordPress and EmDash.
- [API reference](/reference/) — every route, parameter and answer, with **Test request**.
