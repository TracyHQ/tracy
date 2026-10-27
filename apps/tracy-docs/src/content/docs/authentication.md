---
title: Authentication
description: Seat-bound API keys — what a key is, what it may do, how it is sent, revoked and rate-limited, and what the API host never accepts.
---

## A key is a seat, narrowed

Every API key belongs to **one account and one site**. Whoever creates it must hold a live seat on
that site, and the key acts **as that person**: every read and write is authorised, leased and
audited under their name. There is no key that reaches "all my sites" — one site, one key.

What the key may do is the intersection of two things:

1. **The seat's effective permissions** — the toolsets the site's or workspace's policy grants the
   role (`owner`, `admin`, `developer`, `editor`). An owner holds every toolset; an editor, by
   default, only `content`.
2. **The key's scopes** — a subset of `content`, `code`, `site`, `lifecycle`, chosen when the key is
   created.

A key can never do more than its owner's seat. Narrowing a role in the workspace policy narrows
every key that person made; granting a key a scope its owner lacks grants nothing (the call answers
`403 TOOLSET_NOT_GRANTED`). Even an owner's key with `scopes: ["content"]` cannot change code.

Reads need a live key on the right site with at least one scope. The `records` routes are a raw
surface (the CMS's own rows); the `pages`, `contents` and `changes` routes are the Content API view
of the same site, and both are checked the same way.

## Sending the key

```http
GET /v1/sites/shop.example.com/pages HTTP/1.1
Host: api.tracy.ai
Authorization: Bearer trk_xxxxxxxxxxxxxxxx.yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

- The scheme is `Bearer`, the header is `Authorization`, and the key is the whole
  `trk_<id>.<secret>` string.
- **Bearer only, on the API host only.** `api.tracy.ai` reads no session cookie: a browser session on
  `cowork.tracy.ai` is not a credential here, and a request carrying the cookie is treated as if it
  carried nothing. A missing or malformed key answers `401 KEY_INVALID`.
- A key sent to Tracy's own hostname (`cowork.tracy.ai`) is ignored: those routes take the session
  cookie or the agent's signed assertion, never a key.
- Headers the Tracy agent uses to name its conversation (`x-tracy-session`, `x-tracy-actor`,
  `x-tracy-workspace-label`) are **dropped** from `/v1` requests. The lease that keeps two writers
  off one site is held under the key's own identity (`key:<id>`), decided by the server.

## Lifecycle

| Event | Effect |
|---|---|
| Created | The full key is shown once. Tracy stores a hash (HMAC-SHA256 with a server-side pepper); it cannot show the secret again. |
| Used | `last_used_at` moves, at most once a minute. |
| Expired (`expires_at`, optional) | Every call answers `401 KEY_EXPIRED`. |
| Revoked by its owner | Every call answers `401 KEY_REVOKED`. **Revocation is permanent** — re-granting the seat later does not bring the key back. |
| Owner's seat revoked | Every call answers `403 SEAT_NOT_AUTHORIZED` at once; the seat is checked on every request, not cached. |
| Site deleted | The key is deleted with it. |

Keys are managed in Tracy's Settings, or through the account doors on Tracy's own hostname
(`GET /api/me/keys`, `POST /api/me/keys`, `DELETE /api/me/keys/{id}`), which take the browser
session — never a key.

## Do not embed keys in a frontend

A key is a secret with the reach of your seat. Keep it on a server, in a CI secret or in a local
tool; never in a page, a mobile app or a public repository. On `/v1` the API answers a browser on one origin only — this documentation's, for the **Test request**
button of the [reference](/reference/) — and never with credentials, so a page on any other origin
cannot call it with a key, even by mistake. **Test request** stores nothing: a key typed there lives
in that tab only.

## Rate limits

Limits are per key, in two buckets, counted before the call reaches the site:

| Bucket | Limit | What counts |
|---|---|---|
| read | 6,000 per hour | every route that changes nothing |
| write | 600 per hour | every route that changes the site (`PATCH`, `DELETE`, `POST …/contract/*`, `POST …/revert`) |

Over the limit the answer is `429 RATE_LIMITED` with a `Retry-After` header giving the seconds until
the next window opens. The counter is fail-closed: if it cannot be read, the call is refused rather
than let through.

## Error codes of this layer

| Status | Code | Meaning |
|---|---|---|
| 401 | `KEY_INVALID` | No `Authorization: Bearer trk_…`, or the key does not exist or its secret does not match. |
| 401 | `KEY_REVOKED` | The key was revoked. Create a new one. |
| 401 | `KEY_EXPIRED` | The key's `expires_at` has passed. Create a new one. |
| 403 | `SEAT_NOT_AUTHORIZED` | The key's owner holds no live seat on this site (the seat was revoked, or the path names another site). |
| 403 | `TOOLSET_NOT_GRANTED` | The action needs a toolset outside the key's scopes ∩ the seat's permissions; the answer names `toolset` and `role`. |
| 429 | `RATE_LIMITED` | Over one of the two buckets; wait `Retry-After` seconds. |

Every other refusal — the site's own answers included — is on the [Errors](/reference/errors/)
page.
