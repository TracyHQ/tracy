---
title: Joomla
description: What answers on a Joomla site — the Claude Cowork component — its minimum releases, its record kinds, and what only Joomla offers.
---

## What answers the call

A Joomla site answers through the **Claude Cowork component** installed on it (package
`joomla-v…`). Tracy authorises your key and seat, then relays the action to the component over the
site's own door; the component reads and writes Joomla's database through Joomla's own API and
answers what happened. Nothing reaches the site's files or database any other way.

The reference this site was written against is component release **0.18.4**. `GET /v1/sites/{key}`
(the site's `describe`) reports the release the site actually runs.

## Minimum releases

The full table is generated on the [Compatibility](/reference/compatibility/) page. The ones
the `/v1` routes depend on:

| Route | Action | Joomla component |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.18.0 (`native` 0.18.2, many ids in one read 0.18.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.8.4 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.7.2 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.8.13 |
| `POST …/contract/{operation}` | `content.contract` | 0.16.0 (`If-Match` → `expected_content_revisions` 0.18.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.7.0 |

An action the installed release lacks answers `400 bad_action`. Update the component from Tracy
(the agent can install a newer release through `extension.install`), or from Joomla's own Extensions
manager.

## Record kinds

`{kind}` in the `records` routes is one of Joomla's writable kinds: `article`, `category`, `tag`,
`field`, `menuItem`, `menutype`, `redirect`, `banner`, `bannerClient`, `contact`, `newsfeed`,
`language`, `articleAssociation`, `menuAssociation`, `moduleAssignment`, `languageFilter`,
`module`, `templateStyle`, `user`, `extensionParams`. `content.list` defaults to `article`.

Records are addressed by their numeric `id`. Fields are the table's columns: an article's `title`,
`introtext`, `fulltext`, `state`, `catid`; a menu item's `title`, `alias`, `parent_id`. On an
existing menu item, category or tag, `parent_id` or `move_after` moves it with everything under it.

## What only Joomla offers

- **Transactions.** `content.batch` writes up to 100 records in one database transaction with
  `expected` pre-checks — all land or none do. It is an Apply-door action, not (yet) a `/v1` route.
- **Multilingual and demo-trim contract operations.** Every `multilingual.*`, `demoTrim.*`,
  `siteLanguage.*` and `sourceLanguage.*` operation of `POST …/contract/{operation}` is answered
  when the site's quickstart ships that profile; WordPress answers only `multilingual.retire` and
  `multilingual.restore`.
- **Database snapshots** (`db.snapshot`, `db.rollback`) and **core upgrades** (`core.upgrade`) exist
  on the Apply door for the `site` and `code` toolsets; they are not exposed on `/v1`.

## What to watch for

- **Locked records.** A record open in Joomla's editor (checked out) refuses a write with `409
  locked` and names `lockedBy`. Have that person close it; there is no way to write over it.
- **Trash, not delete.** `DELETE …/records/{kind}/{id}` sets the kind's trashed state; `revert` puts
  it back. Kinds without a trash state are refused.
- **Contract sites.** A site built from a Tracy quickstart carries a content contract. Prefer
  `POST …/contract/apply` for the design's slots: it checks limits, evidence and locks before
  writing, and refuses all or nothing.
