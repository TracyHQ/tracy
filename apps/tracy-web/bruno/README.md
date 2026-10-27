# Tracy Apply door — Bruno collection

A [Bruno](https://www.usebruno.com) collection for calling Tracy's Apply door by hand:

```
POST {{baseUrl}}/api/sites/{{site}}/apply
cookie: tracy_sess=<your session>
{"action": "<action>", "params": {...}}
```

Bruno stores collections as plain-text `.bru` files, so this folder is reviewed and versioned
like code. Every request here is a **read**; none of them changes a site.

## Layout

| Path | What it is |
|---|---|
| `bruno.json` | Collection config |
| `collection.bru` | Headers sent with every request: `cookie`, `user-agent`, `content-type` |
| `environments/local.bru` | The local stand: `http://tracy.test:8080` |
| `environments/dev.bru` | The dev surface: `https://cowork.tracy.site` |
| `environments/api-dev.bru` | The dev **api host**: `https://api.tracy.site`, with a seat key (`apiKey`, secret) |
| `v1/` | The public REST API `/v1` on the api host: me, describe, pages, contents, changes, records, contract, applies, revert (Bearer key; the WRITE requests are named so) |
| `content-read/` | `content.read`: describe, list, pages view, find by link, one record, fields, byte budget, not modified, changes since |
| `content/` | `content.get`, `content.list` (the CMS's own records) |
| `apply/` | `apply.list` (the steps an earlier write made) |
| `info/` | `info` (the site's component) |

Each request has a **Docs** tab saying what it shows and what to look for in the answer.

## Setup

1. Install Bruno (desktop app) and choose **Open Collection**, then pick this folder
   (`apps/tracy-web/bruno`).
2. Choose an environment in the top-right selector: `local` or `dev`.
3. Open the environment's settings and set:
   - `site`: the site key you hold a seat on. On the local stand that is
     `<label>.tracy.test`; on dev it is `<label>.tracy.site`. The committed values
     (`example.tracy.test`, `example.tracy.site`) are placeholders.
   - `session` (a **secret** variable): the value of your `tracy_sess` cookie, see below.
   - `locale`, if the site has no `en` content (used by "list pages").
4. Send `content.read / describe` first. A `200` means the cookie and site are right.

### Getting the `tracy_sess` value

1. In a browser, sign in on the same origin as the environment: `http://tracy.test:8080` for
   `local`, `https://cowork.tracy.site` for `dev`.
2. Open DevTools → **Application** (Chrome) or **Storage** (Firefox) → **Cookies** → that
   origin.
3. Copy the **value** of the `tracy_sess` cookie (only the value, not `tracy_sess=`) into the
   environment's secret `session` variable.

The cookie expires; a `401` means sign in again and paste the new value. It carries your seat,
so treat it like a password.

### Secrets stay out of git

`session` is declared under `vars:secret [...]` in both environment files. Bruno stores the
value on your machine and writes only the variable's **name** to the file. Never type a cookie
or token into `collection.bru`, a request, or the `vars { }` block of an environment file.
If you add a `.env` file here, it is already ignored by the repository's `.gitignore`.

## The `/v1` folder (api host, seat key)

The `v1/` folder calls the public REST layer on the **api host** instead of the Apply door. It
needs the `api-dev` environment and one secret variable:

1. On the cowork host (`https://cowork.tracy.site`), mint a seat key with
   `POST /api/me/keys` and the body `{"siteKey": "<your site>", "label": "Bruno", "scopes": ["content"]}`.
   There is no screen for this; the call is the way. It needs your signed-in session (the
   `tracy_sess` cookie, as above), the header `Origin: https://cowork.tracy.site` (anything else is
   `403 BAD_ORIGIN`), and a live seat on that site whose role grants the scopes you ask for.
   The `key` (`trk_<id>.<secret>`) is shown once, in that answer.
2. Choose the `api-dev` environment, set `site` to that site, and paste the key into the secret
   `apiKey` variable. The folder's auth is `Bearer {{apiKey}}`; the collection's `cookie` header is
   still sent and ignored there (the api host reads no cookie).
3. Send `v1 / me` first: `200 {email, keyId, siteKey, scopes}` means the key works.

Run the folder in order: `pages` saves `version`, `contentId` and `pagesEtag`; `one content`
saves `contentRevision`. Requests whose name ends in **WRITE** change the site (`record patch`,
`record delete`, `contract apply`, `revert`) — point the environment at a test site before sending
them, and `revert` puts back what `record patch`/`record delete` did under `bruno-record-1`.

Answers on `/v1` differ from the door's in two ways: a plugin refusal is an HTTP status (400 · 403 ·
404 · 409 · 413 · 422 · 501 · 502) with `{error: {code, message}, errors, next}` instead of a `200`
`{ok: false}`, and reads carry an `ETag` (`If-None-Match` → `304`). Every answer has
`X-Tracy-Api-Version: v1`.

## Chained requests

Some requests save values from their answer as runtime variables that later requests use.
Run the `content-read` folder in order (or use **Run** on it):

| Set by | Variable | Used by |
|---|---|---|
| view pages | `version` | not modified, changes since |
| view pages, list pages | `contentId` | one record, fields projection |
| view pages | `pageLink` | find by link |
| view pages | `nativeKind`, `nativeId` | `content/content.get`, `content/content.list` |
| changes since | `version` (the new one) | the next changes since |

`apply.list` needs an `apply_id` that an earlier write answered; set `applyId` in that
request's Vars tab.

## Which requests are safe

All of them. `content.read`, `content.get`, `content.list`, `apply.list` and `info` only read.
Writes (`content.update`, `content.create`, `apply.revert`, …) are deliberately not in the Apply
door folders; the four in `v1/` are named **WRITE** and say so in their Docs tab — point them at a
test site.

## Common answers

| Answer | Meaning |
|---|---|
| `401 NOT_SIGNED_IN` | No session, or it expired: copy a fresh `tracy_sess` value |
| `403 TOOLSET_NOT_GRANTED` | Your seat's role lacks the toolset this action needs |
| `400 ACTION_NOT_ALLOWED` | The action is not on Tracy's allowlist |
| `400 CONTENT_BAD_QUERY` | A `content.read` parameter is wrong; `message` names it |
| `409 COMPONENT_NOT_REGISTERED` / `SITE_PROVISIONING` | The site has no component Tracy can call yet |
| `409 CONTENT_SNAPSHOT_EXPIRED` | The `version` is no longer held; run "view pages" again |
| A Cloudflare challenge page (dev) | The `user-agent` header was removed; keep the collection's |

## Checking the contract

`scripts/api-contract-check.mjs` sends the same kind of reads to real sites and checks every
answer against the documented contract: the `@tracy/content-api` validators for `content.read`
(describe, a listing, the pages view, changes since, not modified, one record), `native` records
opening with `content.get` on Joomla and WordPress plugins new enough to name them, the two
refusals (`CONTENT_BAD_QUERY`, `ACTION_NOT_ALLOWED`), and that every refusal code it met is in
the public error table. It only reads; it refuses to send any other action.

```
node scripts/api-contract-check.mjs --base http://tracy.test:8080 \
  --cookie-file <file holding the tracy_sess value> \
  --site <joomla site key> --site <wordpress site key> --site <emdash site key>
```

It prints one `PASS`, `FAIL` or `SKIP` line per check and a summary, and exits 1 on any `FAIL`.
A platform none of the given sites covers is printed as `SKIP`, never counted as passed.
