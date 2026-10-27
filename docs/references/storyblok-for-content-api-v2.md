---
description: Storyblok's Content API (Content Delivery + Management + MCP + Visual Editor) read from the official docs on 25/09/2026 — identity, bloks/_uid, token/version/cv, revision/Releases/versions, schema discovery, query, errors, AI/agent, and presentation vs content — compared with Tracy's Content API v1 and v2 plan; states what the v2 plan does not have yet, does not decide for the PO.
sources:
  - docs/references/content-api-v1.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-content-api/schema.json
---

# Storyblok Content API — additions for Tracy's Content API v2

Context: after four Shopify/UCP research documents (the 19-topic table in
[`content-api-v2-vs-shopify-ucp.md`](content-api-v2-vs-shopify-ucp.md), labels G/C/CMS) Lee (PO)
reminded that **content ≠ product**: keep the CMS part — blocks with a position, `slotKey` pointing to the place to edit, presentation-lock,
translations in the same group, the editor is a seat. Storyblok is a pure-content headless CMS, so it is the comparison
source for exactly the CMS part that Shopify has no model for. This document **does not repeat** the 19 topics already covered; it
only answers *what Storyblok does* in nine sections (a)–(i) and then draws lessons for the v2 plan
([`tasks/todo-content-api-v2.md`](../../tasks/todo-content-api-v2.md): V2-1 writable + revision per
content · V2-2 revision/updatedAt/ETag/flat page · V2-3 describe + view=pages · V2-4 errors
{code, field, severity} · V2-5 tools for the agent).

## 0. How to read and confidence level

- **Primary sources only**: `storyblok.com/docs` (the raw `.md` version of each page, for example
  `…/the-story-object.md`), `storyblok.com/faq`, `storyblok.com/apps`, `storyblok.com/cl` (changelog),
  `storyblok.com/mp` (official blog), `github.com/storyblok/*`. Each claim has a URL in the Sources section (§11).
- **Secondary** (marked on the spot): forum.storyblok.com, feedback.storyblok.com, search snippets when the original
  page returned 403.
- No source found → written as **could not be confirmed** (§10), no guessing. The Storyblok docs changed their URL
  structure (many old `/docs/guide/…`, `/docs/api/management/core-resources/…` paths returned 404 on
  25/09/2026); the URLs in §11 are the paths that were live that day.
- Not measured on a real space (no Storyblok token); every figure is a published documentation figure.

## 1. (a) Identity — story, folder, language, reference, global content

**Three ID layers, three scopes.** The Content Delivery API (CD) story object has `id` (integer), `uuid`
(string), `slug`, `full_slug` ("including parent folder and language paths"), `parent_id`,
`is_startpage` (the story is the root of a folder), `position`, `group_id` ("shared between stories defined as
alternates"), `alternates[]{id, name, slug, published, full_slug, is_folder, parent_id}`,
`translated_slugs[]{path, name, lang, published}`, `default_full_slug`, `lang`, `release_id`,
`meta_data` ("non-editable data that's exclusively maintained with the Management API"),
`taxonomy_terms[]`. Official FAQ: `id` is the "legacy default story identifier", so use `uuid`
("unique throughout a Storyblok space") for references; `_uid` is the ID of a **component inside** a story,
unique only **within one story**. The Management API (MAPI) adds `published`, `unpublished_changes`,
`is_folder`, `deleted_at`, `imported_at`, `stage` (workflow), `last_author`, `release_ids[]`,
`current_version_id` · `base_version_id` · `main_version_id`, `localized_paths[]`,
`disable_fe_editor`, `preview_token`.

**A folder is a story** (`is_folder: true`, `parent_id`), the folder tree = URL (`full_slug`). `starts_with`
filters by `full_slug` prefix; the `cdn/links` endpoint returns a condensed site map (§6).

**Two ways to translate, coexisting:**

- *Field-level*: several languages in **one** story; the field must declare `translatable: true` in the schema;
  translations sit **in the same content object** with the suffix `field__i18n__<lang>` (for example
  `"headline": "This is awesome!", "headline__i18n__de": "Das ist toll!"`); read with `language=` +
  `fallback_lang=`; filter with `filter_query[field__i18n__de][op]`; "By default, publishing a story
  publishes all language versions simultaneously" (enable per-language publishing in Settings;
  MAPI `publish?lang=es,pt-br,[default]`). Translated slugs need the Translatable Slugs app (`translated_slugs`).
- *Folder-level* ("Space with folders"): each language/market is a top-level folder, each
  translation is **a separate story**; the **Dimensions** app (Growth) links them as `alternates` via `group_id`,
  with Clone / Merge (structure only) / Overwrite (including content) / "Clone and AI Translations"; fields have the flags
  `exclude_from_merge`, `exclude_from_overwrite`, `force_merge`.
- Storyblok's recommendation: field-level when the structure is the same, folder-level when each locale needs a
  different structure; the two can be combined (folders US/EU, with field-level multiple languages inside).

**Reference.** An `option`/`options` field with `source: internal_stories` (or a "References" field,
`is_reference_type: true`) stores the **`uuid` of the target story** (`use_uuid` defaults to `true`); restricted by
`folder_slug` (allows dynamic `{0}`, `{0}/{1}`), `filter_content_type[]`, `min_options`/`max_options`.
`multilink` is a link to a story/URL/asset/email (`restrict_content_types`, `force_link_scope` +
`link_scope`). Read alongside: `resolve_relations=component.field` (at most **50 stories** per request, the rest
are in `rel_uuids`), `resolve_links=link|url|story`, `resolve_links_level` ≤ 2, `resolve_assets`.

**"Global content" is not a feature — it is a pattern**: the official tutorial creates a `global` folder,
locks the folder's content type, puts the shared stories there (newsletter section, author…) and then **references** them
from pages. The name "Shared Components" is an app that shares component **schemas** across several spaces (multi-tenant),
not content. Changelog 01/09/2026 "Multi-Space Content Distribution new capabilities" —
only the title was seen (§10).

## 2. (b) Bloks — component tree, `_uid`, Rich Text, editing one blok

**Shape.** All content is a tree of objects; each node has `component` (the block's technical name, "content"
is a keyword that cannot be used on its own) and `_uid`; the story's root block (content type, `is_root: true`) is also
such a node. Three kinds of block: content type (is a story), nestable (`is_nestable`), universal (both).
Nesting via a `bloks` field (`minimum`/`maximum`, `restrict_components` + `component_whitelist` /
`component_denylist` / by group / by tag). The Create a Story doc: "Every nested object which
is a component or custom field type needs a `_uid` property. This lets you import data and define the
schema of your components afterwards" — i.e. `_uid` is set by **the writer** on import, not issued by the
server.

**How stable is `_uid`?** The docs only say: unique within the story, "required for certain functionality of
the Visual Editor, i.e., opening components in the editor upon clicking on them in the preview".
Not a single sentence about `_uid` staying the same across edit/duplicate/move → **could not be confirmed** (§10).
Safe reading: `_uid` is a key **for the editor to click on**, not a stable key for external systems (unlike the story's
`uuid`).

**Rich Text** is TipTap/ProseMirror-style JSON: `{type: "doc", content: [...]}`, nodes `paragraph`,
`heading{attrs.level}`, `blockquote`, list, `code_block`, `image`, `table`, `hard_break`… and
**`blok`**: `{type: "blok", attrs: {id, body: [{component, _uid, ...}]}}` — a component embedded in
text still carries `_uid`/`component`, so the editor can click even a block in the middle of a paragraph. Marks:
`bold`/`italic`/`link`/`anchor`/`styled`/`textStyle`…

**Editing one blok = PUT the whole story.** `PUT /v1/spaces/:space_id/stories/:story_id` with body
`{story: {...content...}, publish, release_id, lang, group_id, force_update}`; the docs only accept a
**full story object**, there is no endpoint to patch one field/one blok; the official MCP guide also
describes the agent as "send the complete story object within the request body, including the `content` field".
`publish: true` publishes right away; `publish: false` only saves (it cannot unpublish this way).
`force_update: 1` forces a write to a story that is **locked because someone else is editing it**; "Forcing an update via the
API causes a content conflict"; it has no effect if the lock comes from a workflow stage. No `lock_version`,
`If-Match` or ETag seen in MAPI (§4).

**Compared with Tracy.** v1 `blocks[]{id, key, role, position, sharedContentId, visibility, fields[]{key,
type, value, slotKey, semanticKey}, items[]}` (`schema.json` `$defs.block`, `$defs.field`) is already richer than
Storyblok exactly where Tracy needs it: explicit `position` (Storyblok: array order), `slotKey` is a
write key **per field** (Storyblok: none — writes the whole story), `sharedContentId` (Storyblok: a `uuid`
reference that must be resolved). Where Storyblok is better: **every** node, including nodes embedded in Rich Text, has a `_uid`, and
that `_uid` goes straight out to the DOM (§9); Tracy v1's `bodyHtml` is a blob, blocks inside the body are only visible via
the 413 → `error.links.firstBlock` path.

## 3. (c) Content Delivery API vs Management API

| | Content Delivery (`api.storyblok.com/v2/cdn`) | Management (`mapi.storyblok.com/v1`) |
|---|---|---|
| Token | `token=` query: **public** = `published` only; **preview** = `draft` + `published`; asset token for private assets; created in the space's Settings → Access Tokens | Personal access token (per account, limited by space + scope Stories/Assets/Components…) or OAuth; `Authorization` header |
| Version | `version=draft\|published` (draft needs a preview token) | always reads drafts; `is_published` filter; story has `published` + `unpublished_changes` |
| Cache | `cv=` (§4), CloudFront CDN; missing/mismatched `cv` → 301 to the new `cv` | no cache |
| Projection | `excluding_fields`, `excluding_story_fields`; **no `only`/`fields`** in the parameter list (§10) | list stories **does not return `content`**; `with_summary=true` → `content_summary` |
| Resolve | `resolve_relations` (≤50), `resolve_links`, `resolve_links_level` ≤2, `resolve_assets`, `resolve_level` | — |
| Rate limit | CDN cached **1000/s**; uncached: single story **50/s**, listing ≤25 **50/s**, 25–50 **15/s**, 50–75 **10/s**, 75–100 **6/s**; 429 | Starter **3/s**, Growth+ **6/s**; 429 |
| Region | separate EU/US/CA/AP/CN base URLs | same as the left |

**Permissions by role.** The space role object has `allowed_paths`/`blocked_paths` (+ `resolved_*` = slug),
`allowed_languages`/`blocked_languages`, `allowed_component_ids`/`component_ids`,
`managed_component_ids`/`blocked_manage_component_ids`, **`allowed_field_permissions`** (visible
fields), **`field_permissions`** (hidden fields), **`readonly_field_permissions`** (read-only fields), written as
`component_name.field_name`; 40+ `permissions[]` (`read_stories`, `save_stories`, …); multiple conflicting roles
→ "the deny status prevails". Field-level permissions **really** exist — but the docs only
say roles can be managed via MAPI, not whether MAPI **enforces** `readonly_field_permissions` on a PUT with a
personal token (§10).

## 4. (d) Revision, consistency, cache, Releases, workflow, webhook

**`cv` = one number for the whole space.** "a space-specific numeric counter (a Unix timestamp) that increments
with each content change within the space". Taken from the top-level `cv` of a stories/datasources response
or `GET /cdn/spaces/me` → `version`. The CDN "serves requests that include a `cv` parameter directly";
same `cv` → cache hit, no backend touch. Missing `cv`, an old `cv` not yet cached, a wrong `cv` → **301 redirect**
to the current `cv`. Publish → new `version`, old responses "remain cached under the old `cv`"; "version
can take a few seconds to update". The JS client keeps `cv` in memory, `flushCache()` to clear it.

**Timestamps on a story**: `created_at`, `updated_at`, `published_at`, `first_published_at`;
`published` + `unpublished_changes` (MAPI). No ETag/`If-None-Match` on stories in the docs.

**Versions/history/restore.** `GET /v1/spaces/:id/story_versions?by_story_id=` (`per_page` default
25, max 100, `show_content`, `by_release_id`) returns `{id, created_at, user_id, user, story_id,
status, release_id, parent_id, content?}` — **only versions after 28/08/2024**, older ones use the legacy
endpoint. Restore: `GET …/stories/:id/restore_with?version=&versions_v2=true`. Components (block schema)
also have their own version history + restore. UI: History → select → Restore ("replace the current story").

**Optimistic lock: none at the API.** Conflicts are a **UI** matter: open an old tab and Save → overlay
"Copy over" (opens the new version in another tab to copy over yourself) or "Overwrite". The Content Locking app (Growth) locks
the story while someone is editing, unlocking automatically after N minutes; the API overrides it with `force_update: 1`, which "causes a content
conflict". There is no version number that must be sent with a PUT.

**Releases** (paid app): "Group stories in thematic or time-based releases", "Publish a release
manually or schedule automatic publication", calendar view, "Compare versions when stories are modified
outside the release", limit which people/roles/API keys can see it. Release object: `{id, uuid, name,
release_at ("YYYY-mm-dd HH:MM"), timezone, released, branches_to_deploy[], users_to_notify_ids[],
owner_id, public, allowed_user_ids[], allowed_space_role_ids[], allowed_api_key_ids[]}`. A story enters a
release via `release_id` on update/publish; the story keeps `release_ids[]` and three `*_version_id`
(base/current/main) — i.e. a release is a **per-story branch**, with a base to compare against. Preview with
`from_release=` (CD) / `_storyblok_release` (Visual Editor). The app page says "It is not possible to
schedule the publication of a single story without creating a release for it", yet MAPI still has the
resource **Story Schedulings** `{story_id, language, publish_at, status: scheduled |
published_before_schedule}` — the two statements disagree; "publishing a whole release is one transaction" **could not
be confirmed** (§10).

**Workflow stage.** A story carries `stage{}`, `user_ids[]`, `space_role_ids[]` (assignees per stage);
filter `in_workflow_stages=`; webhook `stage.changed`; a stage can **lock** a story to the point that even
`force_update` does not get through. The "stage forbids editing/forbids publishing" details page could not be opened (§10).

**Webhooks.** Triggers: story `published`/`unpublished`/`deleted`/`moved` (payload `{action, text,
space_id, story_id, full_slug}`), asset `created`/`replaced`/`deleted`/`restored`, workflow
`stage.changed`, user, datasource, discussion, experiment, releases, pipelines, tasks. Header
`webhook-signature` (secret on paid plans only). **"webhooks don't retry on failure"**; work taking >120 s must
return `202 Accepted` immediately.

**Compared with v1/v2 plan.** v1: whole-site `snapshot.revision` + 5-minute signed cursor + 409 when the source changes;
opaque `contents[].revision`. Plan V2-2 drops the whole-site snapshot, ETag/304 after auth keyed on (site,
principal, scope, query, revision), flat `page` for listings. Storyblok demonstrates a way cheaper than
both: **one counter for the whole space as the cache key** (`cv`) — it does not promise a consistent read across two pages,
only promises "same `cv` = same bytes"; consistent reads belong to the signed cursor (Tracy), Storyblok has none. On
writes, Storyblok is **weaker** than v1 (no `expected_revision`); V2-1 revision per content is exactly
Storyblok's unit of conflict (the story).

## 5. (e) Schema discovery — Components API, Datasources, space

**One call gets the whole schema.** `GET /v1/spaces/:id/components` (paginated by the general MAPI rule:
`page`, `per_page` default 25, max 1000, headers `total`/`per_page`) returns the full component object:
`name`, `display_name`, **`schema{}`** (each field: `type`, `pos`, `required`, `translatable`,
`default_value`, `description`, `maximum`/`minimum` for `bloks`, whitelist/denylist by
component/group/tag, `source` + `folder_slug` + `filter_content_type` + `use_uuid` for options/references,
`filetypes`/`asset_folder_id` for assets, `max_length`/`regex` for text, `style_options`/`toolbar` for
richtext, `conditional_settings`, `exclude_from_ai_translation`, `no_translate`…), `is_root`,
`is_nestable`, `all_presets[]`, `preset_id`, `preview_field`, `preview_tmpl` (Squirrelly, only for the
editor's display), `component_group_uuid`, `content_type_asset_preview`, `internal_tags_list`. 17 field
types: `text`, `textarea`, `richtext`, `markdown`, `number`, `datetime`, `boolean`, `option`,
`options`, `asset`, `multiasset`, `multilink`, `bloks`, `section` (only groups in the editor, "without
affecting the API response"), `table`, `custom`, (`image`/`file` deprecated). There is a library
`@storyblok/schema` that generates types from the schema.

**Datasources**: "a collection of key-value pairs that can be used throughout your space"; entries
`{name, value}`; **dimensions** = several values for one key (for example one dimension per language); used as the
`source: internal` of an option; read via CD `/cdn/datasource_entries` (with its own `cv`).

**Space**: `GET /cdn/spaces/me` (public token) returns `version` (= the latest `cv` unless the token has a TTL);
the docs do not list further fields (languages, name) on the page that was opened (§10).

**Compared with plan V2-3 `describe()`**: the plan only has `version`, `site.locales`, `types[]{type, count}`,
`capabilities[]`, `services[]` — **it does not yet have "which block kinds the site has, which fields each kind has, of what type, which
are translatable, which are writable"**. Storyblok answers that in one call, and their MCP server only
adds `search`/`describe` **over operations**, rather than replacing the Components API.

## 6. (f) Query, pagination, limits

- **Flat pagination**: `page` (default 1) + `per_page` (default 25; "Maximum is `1000` (`100` for
  stories)"); headers `total`, `per_page`; a page past the end → empty array. No cursor. The rate limit drops
  by `per_page` tier (§3) — i.e. the cost of a large page is **priced** instead of forbidden.
- **Filters**: `starts_with`, `by_slugs`/`excluding_slugs` (wildcard), `by_uuids`/`by_uuids_ordered`,
  `by_ids`/`excluding_ids`, `content_type`, `level`, `is_startpage`, `with_tag`,
  `published_at_*`/`first_published_at_*`/`updated_at_*` (gt/gte/lt/lte), `in_workflow_stages`,
  `from_release`, `language`/`fallback_lang`, `only_variants`.
- **`filter_query[field][op]=value`** on content type fields: `is` (empty, not_empty,
  empty_array, not_empty_array, true, false, null, not_null), `in`, `not_in`, `like`, `not_like`,
  `any_in_array`, `all_in_array`, `in_array` (MAPI; deprecated in CD), `gt_date`/`lt_date`,
  `gt_int`/`lt_int`, `gt_float`/`lt_float`; OR groups with `__or`; translated fields: `field__i18n__de`.
- **`sort_by`**: `created_at:desc`, `content.field:asc`, type casting `content.price:asc:float` /
  `:int`, multi-key chains separated by commas, `nulls_first`/`nulls_last`.
- **`search_term`**: "anywhere in the name, slug, full slug, or content object".
- **MAPI list**: stories **without `content`** (`with_summary=true` → `content_summary`);
  `text_search`, `search`, `contain_component` (which stories contain a given block), `reference_search` (which stories
  reference a given story/asset), `in_release`, `is_published`, `in_trash`, `mine`, `favourite`,
  `folder_only`/`story_only`.
- **`cdn/links`**: "a compact representation of stories and folders" — `{id, uuid, slug, name,
  is_folder, parent_id, published, real_path, position, alternates}` (+ dates if `include_dates`),
  `starts_with`, `paginated`, `per_page`, `version`, `cv`. This is a **site map** in the sense of Tracy's
  `view=pages`.
- **Response limits**: only `resolve_relations` ≤50 and `resolve_links_level` ≤2; no published byte
  ceiling (§10). Tracy v1: 256 KiB + 413 `CONTENT_FIELD_TOO_LARGE`.

## 7. (g) Errors

The official docs only have a **code table**: 200; 400 "Wrong format was sent (eg. XML instead of JSON)";
401; 403 "Insufficient permissions"; **404 "The requested resource doesn't exist (perhaps due to not
yet published content entries)"** — i.e. a draft read with a public token is 404, not 403 (the same
choice as v1's "404 with the same shape, do not reveal existence"); **422 "often due to missing a required
parameter"**; 429 + exponential backoff; 5xx. The old docs on GitHub say "some `4xx` errors" have an error
code, but **there is no sample JSON body and no path pointing to a field** on any page that was opened (§10). Storyblok
has nothing to copy for V2-4; V2-4 `{code, field{contentId, blockId, itemId, key}, severity}` is ahead.

## 8. (h) AI and agents

**AI in the editor** (consumes credits per plan, enabled in Settings → AI Settings, with "AI Customization" using
the customer's model credentials): AI Translations (48 languages; changelog 01/2025; folder-level 12/2025),
AI Alt Text (26/03/2025, in the asset uploader), AI SEO, AI Branding (brand voice + editorial rules
per org/space), Ideation Room (draft canvas + AI shorten/expand/summarise, public beta for every plan
since 04/06/2024, sends straight into the Visual Editor; has MAPI `/v1/spaces/:id/ideas/:id` with `content`,
`status`, `story_ids[]`). No document says these AI features can be called via MAPI.

**Storyblok MCP Server** (hosted, `https://mcp.storyblok.com/mcp` per the docs; the GitHub README — the repo
was archived 30/03/2026 — says `https://mcp.labs.storyblok.com/mcp`; OAuth by default or a personal access
token). **Seven generic tools, not one tool per endpoint**: `search` (finds MAPI operations by
keyword) → `describe` (parameter schema of an operation) → `execute_readonly` (GET) · **`execute_mutating`**
(POST/PUT/PATCH; guide of 05/05/2026: shows an "execution plan" for a person to approve) ·
**`execute_destructive`** (DELETE, "requires explicit user confirmation", repeats the id before deleting) +
`upload_asset` · `upload_asset_finish`. The landing page calls the write tool `execute` — the names differ between two
official pages. Limits stated: **MAPI only, "cannot read published content"** (no CD);
the MAPI rate limit applies; **no undo** (only MAPI's story versions + restore). Updating a story via MCP
= sending the whole story object (§2).

**Storyblok Agents** (blog 10/09/2026, changelog the same day "Agents"): a conversational "content operations" layer
**inside** the CMS — ask which content is stale/duplicated/missing translations and fix it in the same conversation,
create custom agents that run on a schedule, choose provider/model, use their own credentials; via Storyblok Labs,
Growth and up. The MCP Server is the path for agents **outside** the CMS.

## 9. (i) Presentation vs content — the focus

**Storyblok does not store layout.** Component = **schema** (which fields) + technical name; how it is displayed lives
100% in the customer's frontend code, keyed on `component`. The only "presentation" things in Storyblok:
`preview_tmpl`/`preview_field` (only for the editor to view), `image` (a screenshot of the component), and **Presets** —
"the sample data of the component"; "a teaser component can have three styles… save these as presets
and upload a screenshot"; `preset{}` = "Fields of the component filled with content"; starred to become the
default when a new block is added. I.e. **presentation variants are field values** (for example an `option` field
`style: dark`) rather than a template layer; template and content are not separated — **the component is both**.

**Content points back to where it is displayed — Visual Editor + Bridge.** When fetching a **draft** with a preview token,
Storyblok attaches to **every block** its own `_editable` property — an HTML comment
`<!--#storyblok#{"name":"column","space":"48408","uid":"7c44c5d8-…","id":"307934"}-->` (`name` =
component, `id` = story, `uid` = `_uid`). `storyblokEditable(blok)` turns it into two DOM attributes:
**`data-blok-c`** (the raw JSON) and **`data-blok-uid`** = `"<story id>-<_uid>"`, plus the class
`storyblok__outline`. The editor embeds the preview page in an iframe (Preview URL + "Real path", HTTPS
+ `frame-ancestors` required), adds `_storyblok`, `_storyblok_tk[...]`, `_storyblok_release`,
`_storyblok_lang`, `_storyblok_c`; **clicking an element with `data-blok-uid` → the editor opens exactly that blok**.
The reverse direction — editor → page: `@storyblok/preview-bridge` with the event **`input`** ("user updated a
field… delivers the full or minimal story object" → the page re-renders live without reloading), `change`
(Saved: slug, id, reload flag), `published`, `enterEditmode` (app version, block id, component name);
options `resolveRelations`, `resolveLinks`, `preventClicks`, `customParent`, `fallbackLang`. The Bridge
reloads the page by default on `save`/`publish`. `disable_fe_editor` turns the Visual Editor off for one story.

`_editable` is only attached to **blocks** (objects with `component`/`_uid`), not to scalar fields of the
root block — according to a forum thread (secondary; the page returned 403 when fetched, only the snippet was readable): "the
Heading field has no `_editable` property, but all items nested in the Body field do". So the unit of
"click to edit" is the **block**, not the field; from the block one then picks a field in the editor.

**"Editable Content Types"** is not a term in the Storyblok docs; the closest is the content
type block (`is_root`) + `disable_fe_editor` (§10).

**Consequences for presentation-lock.** Storyblok has **no** lock between content and layout: in any
`bloks` field the editor adds/removes/drags blocks at will within `minimum`/`maximum` + whitelist. The
locks that exist: (1) schema — `required`, `max_length`, `regex`, whitelist, min/max; (2) role — hidden/read-only
fields by `component.field`, folder, language, blocks that may be added; (3) a workflow stage locks the whole story;
(4) `disable_fe_editor`. The request "forbid adding/removing/dragging components in a Blocks field by role" is an
open feature request on feedback.storyblok.com (secondary) — i.e. exactly what Tracy calls
presentation-lock (seal the template, open only the text slots) Storyblok **does not have yet**, and they make up for it with
Releases + versions + restore instead of locks. Tracy keeps presentation-lock as a **deliberate difference**,
not a gap.

## 10. Could not be confirmed

- Whether `_uid` stays the same across content edits, story duplication, folder moves, Dimensions clones —
  no page says.
- Whether MAPI enforces `readonly_field_permissions`/`field_permissions` on a PUT with a personal access token
  or only in the UI — not stated.
- Whether publishing a release is atomic for every story in it; the contradiction between the Releases app page
  ("cannot schedule a story without creating a release") and MAPI's Story Schedulings resource.
- Workflow stage: per-stage flags forbidding editing/publishing — the pages `editor-guides/workflows`,
  `concepts/workflows(.md)`, `manuals/workflows.md` all returned 404 on 25/09/2026.
- The JSON body of MAPI errors (422) and whether it has a path pointing to a field — no official example.
- Whether there is an `only`/`fields` parameter to choose the returned fields — not in the CD parameter list.
- The byte ceiling of a CD/MAPI response — not published.
- Fields of `GET /cdn/spaces/me` other than `version`.
- "Multi-Space Content Distribution" (changelog 01/09/2026) — only the title was seen.
- The release date of the hosted MCP server — the GitHub README only gives the archive date of the local repo (30/03/2026);
  the practical guide is dated 05/05/2026.
- "Editable Content Types" — does not exist as a term.

## 11. Additions for Tracy's v2 plan

Each bullet: what Storyblok does → whether v1/v2 plan has it → proposal + trade-off. Label **[generic]** can be copied ·
**[CMS-only]** keep/add because it is a content property · **[do not copy]** specific to multi-tenant SaaS. Lee decides.

1. **[CMS-only] Content → DOM map (`data-blok-uid`).** Storyblok attaches `_editable` to every block when
   rendering a draft, `data-blok-c`/`data-blok-uid` so the editor clicks exactly the right block. v1 has `slotKey` (a **write**
   key) and `blocks[].position`, plan V2-3 `view=pages` only lists occurrences — **it does not yet have "which element
   on the page this block is"**. Proposal: the themes of the three CMSes, when rendering for a signed-in seat (not
   public HTML), emit `data-tracy-block="<blockId>"` (+ `data-tracy-field` for slot text) and
   `content.read` declares `blocks[].anchor` (`null` if the theme does not emit it yet). In exchange: touches all three themes
   (`tracy` WP, `tpl_tracy` Joomla, the EmDash kit) + gate `cms-sections` generates both; ids are exposed in HTML so
   only in renders with a seat. Needed because Lee defines the goal as "a map pointing to the place to edit": today the map points to the **write
   key**, not yet to the **place on screen**; an agent checking the result of an edit still has to guess the selector.
2. **[generic] `cv` — one counter for the whole site as cache key, separate from consistent reads.** Storyblok:
   `cv` for the whole space, missing/mismatched → 301, CDN caches by `cv`, no promise of consistency across two pages. Plan
   V2-2 drops the whole-site `snapshot.revision`, ETag keyed on (site, principal, scope, query, revision) — but
   whether that `revision` belongs to the content or the site is not settled in the step. Proposal: keep **two separate numbers**:
   `site.contentVersion` (a number that increases on every apply, cheap, for the ETag of listing/`describe`/`view=pages`) and
   `contents[].revision` (for `expected_revision`); `describe` returns `contentVersion` so the agent knows whether it
   needs to read again with one small call (like `/cdn/spaces/me`). Trade-off: two revision concepts must be
   explained in the tool description (D1 is saving characters). The signed cursor remains only for continuation
   (already in the plan). **The v2 plan does not yet have this cheap site-level number after dropping the snapshot.**
3. **[generic] Component schema discovery in `describe()`.** Storyblok `/components` returns the whole
   schema (kind, field, type, translatable, min/max, whitelist) in one call; MCP `describe` only describes
   operations. V2-3 `describe` has `types[]{type,count}` + capabilities, **no block kind/field
   schema yet**. Proposal: `describe.blockKinds[]{kind, root, nestable, fields[]{key, type, translatable,
   writable}}` generated from the contract profile/`content-map.json` (Joomla/WP) and `template.config.json` (EmDash);
   unmapped → not listed. Trade-off: empty for imported sites without a contract; increases the size of `describe`
   (needs the D1 budget). This is exactly the "content map of every quickstart" Lee asked for, which `types[]`
   does not give.
4. **[CMS-only] `_uid` as block id — do not copy, state the reason.** Storyblok `_uid` is unique within the
   story, set by the writer, stability across edits is not promised; it is a key **for the editor to click**. v1
   `blocks[].id` is opaque per site, "stable across slug changes, deleting and re-creating must yield a new id" (v1 §3). Proposal:
   keep v1; add to the V2-1 conformance test the invariant "applying one slot does not change the `id` of other blocks
   in the same content" (Storyblok does not promise it, Tracy should because the `anchor` in bullet 1 relies on it).
5. **[generic] Writing the whole object vs patching by slot — evidence for C3.** Storyblok only has PUT of the whole
   story, the MCP agent sends the whole `content`; lists are declarative (missing = deleted). v1 `changes{slotKey}`
   is a patch — better, keep. For Open question C3 (repeater): the Storyblok lesson is that declarative-whole-list
   forces the agent to download and send everything back; if v2 opens repeaters, op-based by `itemId` is closer to `slotKey`.
   Not decided here.
6. **[generic] Storyblok has no optimistic lock — v1 is already stronger, V2-1 has the right granularity.** Conflicts
   in Storyblok are UI (Copy over/Overwrite), the API has `force_update` to break the lock. Tracy `expected_revision`
   per content (V2-1) = Storyblok's story unit of conflict. Proposal: keep; **do not** add a
   `force_update`-style flag for the agent (direct apply is already the only confirmation — ADR 0021 §6); write in V2-4 the code
   `REVISION_STALE` `severity: recoverable` + `next: content.read`.
7. **[generic] Two token classes = two scopes, the caller does not choose.** A public token is published only,
   a preview token draft+published, explicit `version=`, draft with a public token → 404. v1: the relay computes
   `contentPrincipal`/`contentScope`, 404 with the same shape. Matches; keep. Small addition: `describe` returns the
   `scope` in force (published/draft) so the agent does not try to read a draft and then misread the 404 as "no such
   page".
8. **[generic] Field-level role → `writable`.** Storyblok `readonly_field_permissions` /
   `field_permissions` written as `component.field`, deny wins with multiple roles. V2-1 `fields[].writable:
   true|false|null` per seat. Proposal: the table deriving `writable` for each adapter must combine (a) the contract has the
   slot, (b) the seat has permission to write the entity, (c) the field is marked read-only (if the CMS has it: WP capability, Joomla
   ACL asset) — deny wins; `null` only when the adapter truly does not know. Confirms the V2-1 direction, no
   extra step.
9. **[CMS-only] Translations: keep "each translation its own id + `translationGroupId`", declare the mode in
   `describe`.** Storyblok has two models (field-level in one object; folder-level = separate story +
   `alternates`/`group_id` + Dimensions merge). Joomla/WP-Polylang/EmDash are all "separate entity per
   language" = folder-level; v1 `translationGroupId` is already `group_id`. Proposal: `describe.i18n{mode:
   "entity", locales[], fallback}` and `contents[].alternates[]{locale, id}` (cheap, already available from the group) so the
   agent jumps to a translation without filtering again; **do not** copy `field__i18n__xx`. Trade-off: one more
   array in the summary (counts against the V2-2 budget).
10. **[do not copy] Rich Text JSON (ProseMirror) instead of `bodyHtml`.** Storyblok stores the body as a JSON tree
    and blocks embedded in text carry `_uid`. Tracy's three CMSes store HTML (WP block HTML, Joomla HTML,
    EmDash's own rich text); two-way conversion is a separate project and loses fidelity. Keep `html` +
    the 413 → `firstBlock` path; only note that "a block inside the body" is a case Storyblok handles more nicely
    and Tracy already has a (slower) path for it.
11. **[generic] `cdn/links` = `view=pages`.** Storyblok returns a condensed site map: `{id, uuid, slug, name,
    is_folder, parent_id, published, real_path, position, alternates}`. V2-3 `view=pages` only mentions
    occurrences + `sharedContentId`. Proposal: add per row: `parentId`/`isFolder` (Joomla category,
    WP page parent, EmDash collection), `published`, `path`, `alternates` (bullet 9). Trade-off: the three CMSes
    understand "tree" differently (menu ≠ parent page) — `describe` must declare where the tree comes from, no guessing.
12. **[generic] Tool tiering `readonly / mutating / destructive` + `search → describe → execute`.**
    Storyblok MCP uses **7 generic tools** for hundreds of operations, only destructive requires confirmation,
    mutating shows a plan. V2-5 sets a ceiling of ≤12 actions/surface + JIT `next`. Proposal: attach a `tier` to each
    action of `tracy_site` in the tool schema (written in `outputSchema`/a one-line description), confirmation only for
    `destructive` (no such action exists in the Content API yet — good), and note that `describe=1`
    (V2-3) is exactly Storyblok's `describe` for **content**, not for operations. Trade-off:
    do not copy the "search operations" model — Tracy has few actions, JIT `next` is enough.
13. **[do not copy] Storyblok's Releases, workflow stage, versions/restore.** Those are the editorial
    process of a SaaS with many editors, new state in the CMS (ADR 0021 §6 forbids a new journal/receipt).
    Customer sites on the fleet: WP/Joomla have their own publish schedules (`publish_up`, `post_status
    future`), v1 already exposes `publication.scheduledAt` read-only — enough. If Lee wants "edit many pages then
    go live at the same time", the cheap answer is **one atomic multi-slot apply** (C2 already has it), not a release.
14. **[generic] Errors: nothing to copy; keep 404 for drafts without permission.** Storyblok only publishes
    a code table, 404 "perhaps due to not yet published content"; no body with a path. V2-4 is ahead.
    Addition: a `RATE_LIMITED` code with `retryAfter` (Storyblok only says 429 + backoff) if the relay/Claude Cowork plugin
    has limits — not yet declared in the plan.
15. **[generic] Price `limit` instead of forbidding.** Storyblok lowers the rate limit by `per_page` tier
    (50/15/10/6 per second) — large pages are allowed but expensive. V2-2 flat `page` + 256 KiB budget.
    Proposal: turn `X-Tracy-Source-Calls` (already in EmDash) into a `cost{sourceCalls, bytes}` field in the
    envelope so the 9 questions × 3 CMS table is measured from data, not from logs. Trade-off: one small extra object in every
    response.
16. **[do not copy] Multi-space / Shared Components / Pipelines / `branches_to_deploy` / AI credits.**
    Tracy is one site, one seat; there is no second tenant to share schemas with.

In short, three things **the v2 plan does not have yet** that Storyblok shows are worth having: (1) a content→DOM anchor
(bullet 1), (2) a cheap site-level counter separate from the per-content revision (bullet 2), (3) block-kind/field
schema in `describe` (bullet 3). Two things Tracy **is already better at** than Storyblok and must keep: `slotKey` patching
by field + `expected_revision` (bullets 5–6), and presentation-lock (§9). Storyblok's `_uid` and
Releases are two things that look like "block id"/"snapshot" but should not be copied as is (bullets 4, 13).

## 12. Sources

### Official (storyblok.com, github.com/storyblok)

- Story object (CD): https://www.storyblok.com/docs/api/content-delivery/v2/stories/the-story-object
- Story object (MAPI): https://www.storyblok.com/docs/api/management/stories/the-story-object
- id / uuid / `_uid`: https://www.storyblok.com/faq/what-is-difference-between-story-id-and-uuid
- Update a Story (`force_update`, `publish`, `release_id`, `lang`): https://www.storyblok.com/docs/api/management/stories/update-a-story
- Create a Story (`_uid` required, import): https://www.storyblok.com/docs/api/management/stories/create-a-story
- Publish a Story: https://www.storyblok.com/docs/api/management/stories/publish-a-story
- Internationalization (concept): https://www.storyblok.com/docs/concepts/internationalization
- Internationalization for Stories (`__i18n__`): https://www.storyblok.com/docs/api/management/stories/internationalization-for-stories
- Filter queries with field-level translation: https://www.storyblok.com/docs/api/content-delivery/v2/filter-queries/field-level-translation
- Dimensions app: https://www.storyblok.com/apps/locales
- References: https://www.storyblok.com/docs/concepts/references
- Global components tutorial: https://www.storyblok.com/tp/global-components-references
- Shared Components (FAQ): https://www.storyblok.com/faq/what-are-shared-components-in-storyblok
- Blocks (concept): https://www.storyblok.com/docs/concepts/blocks
- Fields (concept): https://www.storyblok.com/docs/concepts/fields
- Component object: https://www.storyblok.com/docs/api/management/components/the-component-object
- Component schema field object: https://www.storyblok.com/docs/api/management/components/the-component-schema-field-object
- Possible field types: https://www.storyblok.com/docs/api/management/components/possible-field-types
- `@storyblok/richtext` (JSON doc, node `blok`): https://www.storyblok.com/docs/libraries/js/rich-text
- Preset object: https://www.storyblok.com/docs/api/management/presets/the-preset-object
- Presets: https://www.storyblok.com/docs/api/management/presets
- Content Delivery API intro (base URL, rate limit, pagination): https://www.storyblok.com/docs/api/content-delivery/v2
- Rate limit CD: https://www.storyblok.com/docs/api/content-delivery/v2/getting-started/rate-limit
- Pagination CD: https://www.storyblok.com/docs/api/content-delivery/v2/getting-started/pagination
- Retrieve Multiple Stories (CD): https://www.storyblok.com/docs/api/content-delivery/v2/stories/retrieve-multiple-stories
- Filter queries: https://www.storyblok.com/docs/api/content-delivery/v2/filter-queries
- Links endpoint: https://www.storyblok.com/docs/api/content-delivery/v2/links/retrieve-multiple-links
- Caching / `cv`: https://www.storyblok.com/docs/concepts/caching
- Access tokens: https://www.storyblok.com/docs/concepts/access-tokens
- Management API intro (base URL, rate limit, pagination): https://www.storyblok.com/docs/api/management
- Retrieve Multiple Stories (MAPI): https://www.storyblok.com/docs/api/management/stories/retrieve-multiple-stories
- Errors (code table, old docs repo): https://github.com/storyblok/storyblok-docs/blob/master/content/management/v1/topics/errors.md
- Errors CD: https://www.storyblok.com/docs/api/content-delivery/v2/getting-started/errors
- Roles (concept): https://www.storyblok.com/docs/concepts/roles
- Space role object: https://www.storyblok.com/docs/api/management/space-roles/the-space-role-object
- Story versions: https://www.storyblok.com/docs/api/management/stories/get-story-versions-new
- Restore a story version: https://www.storyblok.com/docs/api/management/stories/restore-a-story-version
- History (manual): https://www.storyblok.com/docs/manuals/history
- Conflict resolving: https://www.storyblok.com/faq/conflict-resolving-while-editing
- Content Locking app: https://www.storyblok.com/apps/locking
- Releases (MAPI): https://www.storyblok.com/docs/api/management/releases
- Release object: https://www.storyblok.com/docs/api/management/releases/the-release-object
- Releases app: https://www.storyblok.com/apps/releases_only
- Story scheduling object: https://www.storyblok.com/docs/api/management/scheduling-stories/the-story-scheduling-object
- Webhooks (concept): https://www.storyblok.com/docs/concepts/webhooks
- Datasources (concept): https://www.storyblok.com/docs/concepts/datasources
- Visual Editor (concept, `_editable`, bridge): https://www.storyblok.com/docs/concepts/visual-editor
- Parse `_editable` comments: https://www.storyblok.com/faq/how-to-parse-the-editable-comments
- `@storyblok/js` (`storyblokEditable`, `useStoryblokBridge`): https://www.storyblok.com/docs/packages/storyblok-js
- `@storyblok/preview-bridge` (events, options): https://www.storyblok.com/docs/libraries/js/preview-bridge
- AI Assistance (manual): https://www.storyblok.com/docs/manuals/ai-assistance
- AI Alt-text (changelog 03/2025): https://www.storyblok.com/cl/2025-march-ai-alt-text-generation
- AI Translations (changelog 01/2025): https://www.storyblok.com/cl/2025-january-ai-translations
- Folder-level AI translations (changelog 12/2025): https://www.storyblok.com/cl/2025-december-ai-translation-on-folder-level
- Ideation Room (blog 04/06/2024): https://www.storyblok.com/mp/ideation-room
- Update an Idea (MAPI): https://www.storyblok.com/docs/api/management/ideation-room/update-an-idea
- MCP Server (docs): https://www.storyblok.com/docs/libraries/mcp-server
- MCP Server (landing): https://www.storyblok.com/lp/mcp-server
- MCP Server practical guide (05/05/2026): https://www.storyblok.com/mp/mcp-server-practical-guide
- MCP Server repo (archived 30/03/2026): https://github.com/storyblok/mcp-server
- Storyblok Agents (blog 10/09/2026): https://www.storyblok.com/mp/introduces-storyblok-agents
- Changelog: https://www.storyblok.com/changelog

### Secondary

- Forum: `_editable` only exists on components, not on root fields (the page returned 403 when fetched; read from the
  search snippet): https://forum.storyblok.com/t/do-only-components-have-an-editable-property/411
- Feature request: restrict adding/removing/dragging components in a Blocks field by role:
  https://feedback.storyblok.com/b/feature-requests/add-option-to-custom-user-roles-to-restrict-deleting-adding-and-moving-of-components-in-block-field/
