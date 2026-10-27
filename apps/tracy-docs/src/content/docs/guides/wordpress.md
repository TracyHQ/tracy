---
title: WordPress
description: What answers on a WordPress site — the Claude Cowork plugin — its minimum releases, its record kinds and keys, and what differs from Joomla.
---

## What answers the call

A WordPress site answers through the **Claude Cowork plugin** installed on it (package
`wordpress-v…`). Tracy authorises your key and seat, then relays the action to the plugin over the
site's own door; the plugin reads and writes through WordPress's own functions and answers what
happened.

The reference this site was written against is plugin release **0.14.3**. `GET /v1/sites/{key}`
(the site's `describe`) reports the release the site actually runs.

## Minimum releases

The full table is generated on the [Compatibility](/reference/compatibility/) page. The ones
the `/v1` routes depend on:

| Route | Action | WordPress plugin |
|---|---|---|
| `GET …/pages`, `…/contents`, `…/changes`, `GET /v1/sites/{key}` | `content.read` | 0.14.0 (`native` 0.14.2, many ids in one read 0.14.3) |
| `GET …/records/{kind}` · `GET …/records/{kind}/{id}` | `content.list` · `content.get` | 0.5.2 |
| `PATCH …/records/{kind}/{id}` | `content.update` | 0.3.0 |
| `DELETE …/records/{kind}/{id}` | `content.delete` | 0.6.0 |
| `POST …/contract/{operation}` | `content.contract` | 0.12.0 (`If-Match` → `expected_content_revisions` 0.14.0) |
| `GET …/applies/{id}` · `POST …/applies/{id}/revert` | `apply.list` · `apply.revert` | 0.3.0 |

An action the installed release lacks answers `400 bad_action`. Update the plugin from Tracy (the
agent can install a newer release through `plugin.install`), or from the site's Plugins screen.

## Record kinds and keys

`{kind}` is one of `post`, `postmeta`, `option`, `templatePart`, `term`, `menuItem`.

- **`post`** covers every post type — pages, posts, custom types. `GET …/records/post` lists posts
  only; narrow with `?post_type=` or find one slug with `?name=`. Other kinds are read one at a time.
- **Keys beside ids.** An `option` (its name) and a `templatePart` (its slug: `header`, `footer`)
  have no numeric id: use `0` as `{id}` and name the record by its key. A `postmeta` entry takes the
  post ID as `{id}` and the meta key as its key; a `term` takes the term ID as `{id}` and the
  taxonomy as its key; a `menuItem` takes its own ID as `{id}` and its menu (slug or name) as its
  key. `GET` and `DELETE` take the key as `?key=` on the query
  (`GET …/records/option/0?key=blogname`); `PATCH` takes it as `"key"` in the body.
- **What can be deleted.** `DELETE` accepts `post`, `templatePart` and `menuItem`. Delete a
  `menuItem` with its menu as `?key=`: without it the delete still succeeds, but `revert` cannot
  write the entry back. An `option` and a `postmeta` entry cannot be deleted: write an empty value
  instead. A `term` cannot be deleted either: `PATCH` edits one, or creates one
  with `0` as `{id}` and a `name` (fields: `name`, `slug`, `description`, `parent`).
- Fields are WordPress's own: a post's `post_title`, `post_content`, `post_status`, `post_name`; an
  option's `value`.

## What differs from Joomla

- **No transaction.** WordPress has no `content.batch`: several writes are several requests, each
  recorded under the same `apply_id` if you want one undo. If one fails, the earlier ones stay
  written until you revert the receipt.
- **Contract operations.** `POST …/contract/{operation}` answers `inspect`, `bind`, `apply`,
  `demoTrim.*` (`plan`, `apply`, `revert`), `siteLanguage.*` and `sourceLanguage.*`; of the multilingual family only `multilingual.retire`
  and `multilingual.restore`. `inspect`/`bind` take `contract`, the profile to check against.
- **Translations.** Languages are handled by the site's translation plugin (Polylang) through the
  Apply-door action `content.language` (plugin 0.9.0), and core translations by `language.install`
  (0.11.0). Neither is a `/v1` route today.
- **Themes.** `theme.style` applies one style variation of the active block theme (0.8.1); themes
  and plugins are installed from a package URL. These need the `code` toolset and are Apply-door
  actions.
- **Fatal errors.** A PHP fatal error inside the plugin answers `500 fatal` with the file and line;
  the call may have partly run — read the site before retrying.

## What to watch for

- **Locked records.** A post open in the block editor refuses a write with `409 locked` and names
  `lockedBy`.
- **Trash only for posts.** `DELETE` on a `post` uses WordPress's own trash. A `templatePart` or a
  `menuItem` is deleted permanently; `revert` writes it back from the copy saved with the apply.
- **`itemsCursor`** on `GET …/contents/{id}` is recognised but not served yet on WordPress
  (`501 CONTENT_ADAPTER_UNSUPPORTED`); page blocks with `blocksCursor` instead.
