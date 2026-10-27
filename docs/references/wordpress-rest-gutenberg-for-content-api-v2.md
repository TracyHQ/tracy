---
description: WordPress REST API + Gutenberg (block markup, Block Bindings, synced patterns / pattern overrides, template parts, Abilities API 6.9–7.1, MCP adapter) read from primary sources on 25/09/2026, compared against Tracy's Content API v1 and v2 plan; states the trade-off "v2 reader for WP sites built on WP REST + Block Bindings or on a separate Claude Cowork plugin", does not decide for the PO.
sources:
  - docs/references/content-api-v1.md
  - docs/references/content-api-v2-vs-shopify-ucp.md
  - tasks/todo-content-api-v2.md
  - packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/content-map.json
  - packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/presentation-lock.json
  - packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.2.0/manifest.json
  - packages/cms/tracy-seeder/src/apply-wordpress-contract.mjs
  - packages/cms/tracy-content-api/test/fixtures/wordpress.json
  - apps/tracy-web/src/sites/pair-component.js
---

# WordPress REST API + Gutenberg — comparison for Content API v2

Context: Lee (PO) wants an agent on a customer site to get from a question to the right edit in fewer
calls·seconds than v1 ([plan v2](../../tasks/todo-content-api-v2.md): V2-1 `writable` + per-content revision to
drop `inspect`; V2-2 `revision`/`updatedAt`/ETag/flat `page`; V2-3 `describe` + `view=pages`; V2-4
errors `{code, field, severity}`; V2-5 tools for agents). The table of 19 Shopify/UCP topics already exists in
[Shopify · UCP comparison](content-api-v2-vs-shopify-ucp.md) — this document **does not repeat**
that table; it answers *what WordPress actually does* at the REST and block editor layer, because WordPress is
one of the three CMSs Tracy builds and the self-hosted CMS closest to Tracy.

Tracy WordPress today (read from the repo, not from the web):

- Quickstart `tracy-business/wp7/1.2.0` runs **WordPress 7.1**, PHP 8.3, theme `wp-tracy-business`,
  Claude Cowork plugin `claude-cowork` 0.13.0 (`manifest.json` → `quickstart.platformVersion: "7.1"`).
- `content-map.json`: 11 entities, 292 slots. Entities are located by **identity** (`option` name, or
  `postType + slug + language`), never by post id. 276 slots point at `target: {block, attr}` —
  the block is located by `metadata.name` in the markup (`hero.heading`, `hero.cta.1`), the attr is `content`
  or `text`; 14 slots point at `option + field` of `tracy_site_identity` (header/footer read the
  `{site.*}` tokens from this option); 2 slots point straight at `blogname`/`blogdescription`.
- `presentation-lock.json` locks `stylesheet`/`template`/`show_on_front`/`permalink_structure`,
  two theme mods, and a **SHA-256 hash of every file** under `wp-content/themes/wp-tracy-business`.
- The Claude Cowork plugin reads/writes through `wp-admin/admin-ajax.php?action=claude_cowork` (the hook includes `nopriv`, the token
  is in the body — `apps/tracy-web/src/sites/pair-component.js`), and does **not** use WP REST.
- 41 Polylang editions of the same site; `editions.json` holds the post id of each entity per locale. The
  Polylang build is the **free build** (the seeder notes: "Polylang ships WP-CLI only in its Pro build",
  `packages/cms/tracy-seeder/src/site-ops.mjs`).

How the sources were read: official documentation only (developer.wordpress.org, make.wordpress.org, GitHub
`WordPress/*`, `wordpress-develop` source code), Polylang/WPML taken from their own main sites; each claim
has a source number `[n]` pointing to the Sources section at the end of the file; anything that could not be confirmed is listed in §10.

## (a) Identity and addressing

| Thing | WordPress | Tracy v1 / content-map |
|---|---|---|
| Record ID | Integer post id; routes go by id only (`GET /wp/v2/posts/<id>`), **there is no route by slug**; slug is a collection filter `?slug[]=` [1][3]. `generated_slug` and `permalink_template` only appear at `context=edit` [3] | opaque id that survives slug changes; content-map entities are located by `postType+slug+language`, **not** post id |
| Template/part ID | String `theme//slug` (the regex accepts `theme-name//template-slug`); `wp_id` is a post id only once customised; `/lookup?slug=&is_custom=&template_prefix=` [15] | — (presentation-lock, no id) |
| Locale | **Not in core.** Polylang: `?lang=fr` filters every post type/taxonomy; the response adds `lang` + `translations{code: id}`; assigned with `POST /wp/v2/posts/3376?lang=fr&translations[en]=3374`; `GET /pll/v1/languages` — **Polylang Pro only** [21]. WPML: `lang`/`wpml_lang` on the query string, the official documentation covers WooCommerce Multilingual only; for ordinary posts it is a forum answer (secondary) [22][23] | `locale` BCP 47 + `translationGroupId`; the WP adapter takes it from `editions.json` and Polylang PHP, not from REST (the free build lacks it) |
| Reference | `author`, `featured_media`, `parent`, `categories[]`, `tags[]` are ids; `_links` HAL + `_embed` (filterable since 5.4: `_embed=author,wp:term`) [4]. In markup: `wp:block {"ref":<wp_block id>}` (synced pattern) [27], `wp:template-part {"slug","theme"}` | `relations[]{type, contentId}`; `sharedContentId` |
| Shared content | (1) **Options** via `GET/POST /wp/v2/settings`: 20 fixed fields (`title`, `description`, `url`, `show_on_front`, `page_on_front`, `site_logo`…) [25]; a custom option such as `tracy_site_identity` does **not** appear without `register_setting(show_in_rest)` (the settings documentation does not say how to expose a custom option — §10). (2) **Synced pattern** = post type `wp_block` via `/wp/v2/blocks`, meta `wp_pattern_sync_status` separates synced/unsynced [12][26]. (3) **Template part** = post type `wp_template_part` via `/wp/v2/template-parts`, `area: header|footer`, `source: theme|custom`, `has_theme_file` [13] | `type: shared` + occurrence with `sharedContentId`; `site.*` slots are options |

Worth noting: WordPress **has no stable key for a block inside a post**. `parse_blocks()`
returns `blockName · attrs · innerBlocks · innerHTML · innerContent`, with no `id` [9]; the editor's `clientId`
is in-memory (the `@wordpress/blocks` handbook does not say outright that it is not saved — §10 —
but saved markup does not contain it, see (b)). The only key *present in the markup* is
`attributes.metadata.name` — the "block renaming" feature from 6.4, extended to every block in 6.5 [10] —
exactly what Tracy uses as the slot address. Pattern overrides also use that same `metadata.name` to map
overrides, and the documentation only says a "unique name" is *needed* to map correctly, not that WP **checks** for duplicate names
[11][28] (§10).

## (b) Content structure

**Block markup.** Blocks are serialized to HTML with **HTML comments as delimiters, JSON attributes
inside the comment**: `<!-- wp:latest-posts {"postsToShow":4,"displayPostDate":true} /-->`;
`post_content` is the "single source of truth", and the lifecycle is parse → edit the in-memory tree → serialize
again [8]. `block.json` declares `name`, `attributes` (each attribute has `source: attribute|text|html|query`
+ `selector` — i.e. the value is *extracted from the HTML* when parsing, not necessarily in the JSON comment),
`supports`, `usesContext`/`providesContext`, `render` [7]. Consequence for Tracy: a heading's `attr: content` slot
is **text extracted from `<h2>`**, a button's `attr: text` slot is extracted from `<a>`; editing a slot = editing the
HTML inside the delimiter, not editing JSON — exactly what `apply-wordpress-contract.mjs` does
(`setBlockValue` escapes text, url rewrite covers both `href` and the `url` attribute).

**REST has no door for editing one block.** A post's `content` is an object `{raw, rendered, protected,
block_version}`; `raw` and `block_version` only at `context=edit` [2]. Writing accepts `content` as a string
or `content.raw`, then `wp_update_post()` — there is **no** parameter for editing a child block, no
`If-Unmodified-Since`, no reading of `_edit_lock` [2]. To change one word in one block: read `raw` →
parse → edit → serialize → send back the **whole** `content.raw`. Two secondary read doors: `POST
/wp/v2/block-renderer/<namespace>/<name>` renders **one** registered *dynamic* block type by name +
attributes (needs `edit_posts` or `edit_post` per `post_id`; a static or unregistered block → 404)
[14]; `/wp/v2/blocks` is CRUD on `wp_block` posts (synced patterns), not "blocks inside a post"
[12].

**Block Bindings API (6.5 →).** Binds a block attribute to a source outside the markup:
`"metadata":{"bindings":{"content":{"source":"core/post-meta","args":{"key":"field-name"}}}}`
[16]. Current core sources: `core/post-meta`, `core/post-data`, `core/term-data`,
`core/pattern-overrides`; supported blocks/attributes: image `id/url/title/alt/caption`, heading and
paragraph `content`, button `url/text/linkTarget/rel`, navigation-link/submenu `url`, post-date
`datetime`; since 6.9 extensible through the filter `block_bindings_supported_attributes[_{$block_type}]` [17][18].
Server registration `register_block_bindings_source(name, {label, get_value_callback, uses_context})`;
client `registerBlockBindingsSource({getValues, setValues, canUserEditValue, getFieldsList})` —
`canUserEditValue` **defaults to false** ("The user won't be able to edit by default") [17]; post meta
used as a source must be `show_in_rest => true` [16][17]. 6.7 added an *Attributes* panel in the editor to set
bindings through the UI, and `label` for meta [19]. The core point for Tracy: **a binding is a pointer inside the markup,
the value lives outside the markup** (meta/post data) — exactly the shape `slotKey → place to edit`, but WP
puts it *inside* the CMS rather than in an external map.

**Synced patterns + pattern overrides (6.6 →, 7.0 opens them to every block).** Inside a pattern, a block that
allows overrides declares `metadata.name` + `metadata.bindings.__default.source = "core/pattern-overrides"`
[11]. An instance is a `core/block` block with two attributes `ref` (number) and `content` (object, default
`{}`), and `providesContext: {"pattern/overrides": "content"}` [27]; the server reads the override at
`context['pattern/overrides'][<metadata.name>][<attribute>]` [28]; `render_block_core_block` also
supports two old shapes (`overrides` → `content`, and `content.<name>.values`) [29]. So **one displayed text
can have two write targets**: the source copy in `wp_block`, or the override `content[name][attr]` on the
instance. 7.0: "any block attribute that supports Block Bindings also supports Pattern Overrides",
custom blocks opt in via the filter above [20][30].

**Template parts** = shared header/footer, their own post type, see (i).

## (c) Read vs write, per-field permissions

- **`context=view|embed|edit`**: `edit` is the only door that returns `content.raw`, `password`,
  `generated_slug`, `permalink_template`; requesting `context=edit` without `edit_post` on the record →
  `rest_forbidden_context` [2][3]. This is WordPress's "writable": **per principal × record**, decided
  right in the read response.
- **Per post type permissions**: `register_post_type` declares `show_in_rest`, `rest_base`, `rest_namespace`,
  `rest_controller_class`, `capability_type` + `map_meta_cap` + `capabilities` (read/edit/delete) [31];
  `/wp/v2/types` exposes `capabilities`, `supports`, `labels`, `visibility` at `context=edit` [24].
- **Per field permissions**: post fields (`title`, `content`, `status`…) have **no** ACL of their own — all
  under `edit_post`. Field-level exists only for **meta**: `register_meta(... show_in_rest: bool|{schema,
  prepare_callback}, single, type, auth_callback, default, revisions_enabled (6.4), label (6.7))`;
  `auth_callback` is the permission function for add/edit/delete, defaulting to `__return_false` for protected meta
  (`_`-prefix) [32]. Meaning: putting a value into registered post meta = per-field write ACL + per-field
  revisions; leaving it in markup = only per-post ACL.
- **Projection**: global `_fields=`, nestable since 5.3 (`_fields=meta.key.nested`) [4].
- **Draft/preview**: `status` ∈ `publish|future|draft|pending|private` [1]; autosave via `GET/POST
  /wp/v2/posts/<id>/autosaves` (the editor uses it for preview); revisions are `GET` only (+ `DELETE` with
  `force=true`), reading a revision requires `edit_post` on the parent (`rest_cannot_read`) [5][6].
- **Authentication**: cookie + `X-WP-Nonce` (no nonce → user 0, anonymous request); **Application
  Passwords** (5.6) Basic auth over HTTPS, permissions are that user's permissions [33]. There is no Tracy-style "service token";
  a seat → must be a WP user.

## (d) Revision, consistency, cache

- **Per post revisions**: `/wp/v2/posts/<parent>/revisions[/<id>]`, with `modified_gmt`, `content`;
  **no restore route** (`WP_REST_Revisions_Controller` does not call `wp_restore_post_revision`)
  [5][6]. Global styles also have their own revisions controller [34]. Meta has revisions if
  `revisions_enabled` [32].
- **Timestamps**: `modified_gmt` read-only; listings filter by `modified_after`/`modified_before`, sort
  `orderby=modified` [1][2] — enough for incremental per-record caching.
- **ETag / conditional**: `WP_REST_Posts_Controller` does **not** emit ETags, does not read `If-None-Match`
  or `If-Unmodified-Since` [2]. Searching Trac: ticket #44862 "Create REST API endpoints to lock,
  release and takeover post edition" mentions `If-Match`/ETag by user id, status unreadable
  (403 on fetch — §10); #58433 is ETag for scripts/styles, not REST [35][36]. Conclusion: **there is no
  compare-and-set in core**; writes through REST are last-write-wins.
- **Post lock**: `_edit_lock` = `"timestamp:user_id"`, written by `wp_set_post_lock()` from the edit screen +
  Heartbeat [37]; the REST controller does not read it [2]. The consequence was named by WordPress itself on
  **24/09/2026** in the *Presence API* feature project: issue #549 *"An agent can edit a post you have
  open, and neither of you knows"* — proposes that an agent write its own presence row with `wp_set_presence()` TTL
  60 s, flagged `wpai_agent`; the Presence API is an experimental plugin, not yet in core [38][39].
- **Whole-site snapshot**: the REST handbook has no snapshot or read-transaction endpoint/parameter of any
  kind; every listing is a live query, and the pagination documentation does not promise consistency between two pages
  [3][4]. Confirmed: **none** — the same conclusion as Shopify/UCP.

## (e) Schema and discovery

- Finding the door: header `Link: <…/wp-json/>; rel="https://api.w.org/"`; the `/wp-json` index lists
  `namespaces`, `routes`, `authentication`; since 5.5 every HTML page has `<link rel="alternate"
  type="application/json">` pointing to its own REST version [40].
- Per-endpoint schema: `OPTIONS <route>` returns args + schema when the controller declares a schema [41].
- Types: `/wp/v2/types[/<type>]` (`rest_base`, `supports`, `taxonomies`, `capabilities`… ) [24];
  blocks: `/wp/v2/block-types[/<ns>[/<name>]]` (`attributes`, `supports`, `provides_context`,
  `uses_context`, `variations`, `selectors`) [42]; abilities: `/wp-abilities/v1/abilities` (see h).
- **"What types/fields does this site have" in one call?** No: the index gives *routes*, `types` gives *post types*,
  and *a type's fields* live at `OPTIONS /wp/v2/<rest_base>` — three calls, not counting `block-types` to
  understand blocks. No OpenAPI in core.

## (f) Query, pagination, limits

Flat `page` + `per_page`, **`per_page` capped at 100**, `offset` equivalent (`per_page=5&page=4` =
`offset=15`), totals returned in the `X-WP-Total` / `X-WP-TotalPages` headers, default `orderby=date` descending
[3]. No cursor. Filters: `search`, `slug[]`, `include[]`/`exclude[]`, `status`, `after/before`,
`modified_after/before`, `orderby` (`modified`, `slug`, `title`, `relevance`…) [1]. Reducing bytes:
`_fields` (nested), selective `_embed`, `_envelope` wraps status+headers into the body [4]. No byte
budget per response; a post with 200 KB of `raw` is returned whole.

## (g) Validation and errors

Envelope `{"code", "message", "data": {"status"}}`. Parameter errors: `rest_invalid_param` with
`data.params = {param: message}` **and** `data.details = {param: {code, message, data}}`;
missing parameter: `rest_missing_callback_param` with `data.params = [names]` [43]. There is a `field`
(param name) and a child `code` in `details`, **no `severity`**, no JSONPath deep into
`content`. The Abilities API has its own codes: `ability_invalid_input`, `ability_invalid_output`,
`ability_invalid_permissions`, `ability_missing_input_schema`, `rest_ability_not_found` [45].

## (h) AI/agent — Abilities API and MCP adapter

- **Abilities API (in core since 6.9, 11/2025).** `wp_register_ability(name, {label, description,
  category, input_schema, output_schema, execute_callback, permission_callback, meta: {show_in_rest,
  annotations: {readonly, destructive, idempotent}}})`; the category must be registered first via
  `wp_abilities_api_categories_init`, the ability via `wp_abilities_api_init`; input/output are
  **validated automatically** against JSON Schema; hooks `wp_before/after_execute_ability` [44][46][47].
- **REST `wp-abilities/v1`**: `GET /abilities` (page/per_page default 50, cap 100), `GET
  /categories`, `GET /{ns}/{ability}`, `GET|POST|DELETE /{ns}/{ability}/run` — **the method is derived from
  annotations**: `readonly: true` → GET (input in the query), `destructive` → DELETE, otherwise POST
  (input in the body); every endpoint **requires sign-in** (cookie/application password) [45]. This is
  where it differs from ordinary WP REST: the tool declares whether it *reads or writes*, and the transport picks the verb from that.
- **Core abilities**: 7.0 has `core/get-site-info`; 7.1 (07/2026) adds/standardises `core/get-user-info`
  (parameter `fields`, a `public` flag to expose via REST), `core/get-environment-info`; every output property
  has a translatable `title` + `description` "for improved REST, MCP, and AI client compatibility"; adds the
  action `wp_ability_invoked` for audit/telemetry, the filter `wp_ability_validate_input/output`, and coerces
  query string types according to `input_schema` [48][49]. 7.0 also has client-side `@wordpress/abilities` +
  `@wordpress/core-abilities` (JS fetches server abilities itself via REST), the WP AI Client, the Connectors API
  [50][51].
- **MCP adapter** (`WordPress/mcp-adapter`, package/plugin, not in core): "WordPress abilities
  automatically become MCP tools, resources, and prompts"; **private by default**, exposed through
  `meta.public` / `meta.mcp.public`; HTTP at `/wp-json/mcp/mcp-adapter-default-server`, STDIO via
  WP-CLI; the agent does not see each ability as a tool but goes through **three meta-tools**
  `discover-abilities` · `get-ability-info` · `execute-ability` [52]. `Automattic/wordpress-mcp` is
  **deprecated + archived**, pointing to mcp-adapter [53]. `wp-cli/ability-command` lists/runs abilities
  from the CLI [54].
- **Confirm / preview / undo**: **none** at the Abilities or mcp-adapter layer — annotations only *describe*
  (readonly/destructive/idempotent) so the client decides for itself whether to ask a person; no dry-run, no
  receipt, no undo; post revisions are the only undo, and they cannot be restored through REST.

## (i) Presentation vs content at the REST layer

WordPress separates them by **post type + capability**, not by a lock:

| Layer | Post type / door | Permission | Tracy equivalent |
|---|---|---|---|
| Content | `post`, `page`, CPTs via `/wp/v2/<rest_base>`; `content.raw` = **the page's whole block tree, layout included** | `edit_post` | `contents[]` + `blocks[]` (Tracy only opens text slots) |
| Template | `wp_template` `/wp/v2/templates`, `source: theme|custom|plugin`, `origin`, `is_custom`, `has_theme_file`, `wp_id`; a post picks its template with the `template` field | `edit_theme_options` (`rest_cannot_manage_templates`); **reading** extended in 6.6 to users with `edit_posts` [15] | `presentation-lock.files` (hash) |
| Template part | `wp_template_part` `/wp/v2/template-parts`, `area: header|footer` [13] | as above | header/footer — Tracy avoids it with the `tracy_site_identity` option + tokens |
| Global styles | `wp_global_styles` `/wp/v2/global-styles/<id>` with `styles` + `settings` (theme.json shape), variations, revisions [34] | (the reference documentation does not state the capability — §10) | `presentation-lock.options.stylesheet/template` |
| Structure lock | `template_lock: all|insert|contentOnly` on `register_post_type` (5.0) [31] | — | no equivalent |

Two things Tracy needs to face squarely: (1) in WordPress, **the layout inside `post_content` is content**
— a user with `edit_post` can delete a whole section; Tracy's presentation-lock hashes *theme files*, not
*the page's block tree*, so REST has nothing stopping "change one word" from becoming "rearrange the whole page" other than the
Claude Cowork plugin itself; `template_lock: contentOnly` is an editor UI lock, and no documentation was found saying REST enforces
it (§10). (2) **Block Bindings are the bridge between the two layers**: the template/pattern (presentation) holds the *pointer*
`metadata.bindings`, the value lives in post meta/post data (content); editing the value does not touch the
template, editing the template does not touch the value. That is Tracy's presentation-lock + slot model, but
*inside* the CMS and with a per-field write ACL (`auth_callback`).

## Additions to Tracy's v2 plan

Labels: **[generic]** can be copied for all three CMSs · **[CMS-only]** WordPress adapter only · **[do not copy]**.

1. **`context=edit` ⇒ `raw` + permission-based refusal, decided at read time** → v1 does not have it; plan V2-1
   has `writable` per seat. **[generic]** Keep `writable`, but learn from WP on *real granularity*: WP only
   has per-record permissions (`edit_post`) + per meta key (`auth_callback`); no per-field ACL
   on posts. Proposal: the WP adapter returns `writable` = `edit_post` on the entity ∧ the slot is in the
   content-map; do **not** pretend to be field-level where the CMS is not (returning `null` is correct per the v1 rules). Trade-off:
   `writable: true` for a page's 276 slots is one answer for the whole page — enough for V2-1.
2. **Nested `_fields=` (`meta.key.nested`)** → v1/v2 have no projection by field name, only
   summary/detail and `view=pages`. **[generic]** Add `fields=` (a whitelist on the envelope, e.g.
   `fields=contents.blocks.fields.key,value,slotKey`) to cut bytes for the LLM. Trade-off: the signed cursor must
   carry the projection too; the validator must accept an envelope missing fields per the projection — change
   `validateContent` (which currently treats missing as an error).
3. **`X-WP-Total` / `X-WP-TotalPages` + `page`/`per_page` capped at 100** → V2-2 already has a flat `page`;
   v1 has `pagination.total`. **[generic]** Add `pageCount`; keep it in the body (v1 is an envelope, not
   headers). Also copy the sentence "no consistency promise between two `page`s", as WP makes no promise.
4. **`modified_after` + `orderby=modified`** → v2 A3 says `updatedAt` is mandatory in the summary but there is
   no filter yet. **[generic]** Add `updatedAfter=` for listings so agents/caches sync incrementally
   instead of rescanning. Trade-off: the Joomla adapter must prove `modified` changes when a module/field changes
   (WP: every write through `wp_update_post` changes `modified_gmt`).
5. **Block Bindings = WordPress's native `slotKey`** (`metadata.bindings` is a pointer in the
   markup, the value is in meta with `show_in_rest` + `auth_callback` + `revisions_enabled`) → Tracy has
   `content-map.json` *outside* the CMS, values *inside* the markup. **[CMS-only]** Two proposed levels: (i) light —
   keep the map, but `describe()` declares `slot.native: "block-bindings" | "metadata-name"` so tools know
   which slots WP protects itself; (ii) heavy — the next quickstart binds the hero/footer text slots to registered post
   meta or options, after which writing = `POST /wp/v2/pages/<id> {meta:{…}}` **per field**, with
   per-field revisions, the editor shows the binding marker and locks manual editing (`canUserEditValue` defaults to
   false). Trade-off: (ii) means rewriting the theme for 292 slots; binding only exists on 7 blocks/attrs unless opted in via the
   filter (7.0); values leave the markup, so `capture-inventory.mjs`/`setBlockValue` must also read meta.
6. **Pattern overrides = shared content with per-instance overrides** (`wp:block {ref, content:{name:
   {attr}}}`) → v1 has `sharedContentId` but the occurrence has "empty fields, no embedded copy".
   **[CMS-only]** `view=pages` (V2-3) should let an occurrence carry `overrides: [key]` so the agent knows
   "is this text an in-place override or the source copy"; apply takes `scope: instance|source`. Trade-off: two
   write targets for one visible text — if not declared, the agent edits the source copy and changes every page.
7. **Template / template part / global styles are their own post types, fenced by `edit_theme_options`**
   → Tracy has a presentation-lock that hashes files. **[CMS-only]** `describe()` declares
   `ai.tracy.content.presentation: locked` + the reason; the WP adapter does not open the `/templates` door to an editor
   seat (matches C6 "do not open a presentation write door"). Trade-off: WP-native lets an admin edit the
   template through the site editor and Tracy's lock only **detects it afterwards** (hash), does not prevent it; accepted,
   since it is already the current rule.
8. **No ETag, no `If-Unmodified-Since`, no compare-and-set in core; `_edit_lock` is not
   read by REST** → V2-2 wants ETag/304 after auth, V2-1 wants per-content `expected_revision`.
   **[generic]** Both must be *Tracy's own*: the WP adapter builds `revision` from `modified_gmt` + the latest revision
   id, and the Claude Cowork plugin must **check-then-write within one PHP request** (there is no CAS in
   `wp_update_post`, a race window remains — state in the spec that it is "best effort", no promise of
   serializable). Trade-off: if the reader goes through plain WP REST (see the end), check and write are two HTTP
   calls → not even best effort holds.
9. **Post lock / presence: "an agent edits a post someone has open, nobody knows" (Presence API #549,
   24/09/2026)** → Tracy says nothing yet about a person who has the editor open. **[generic]** Apply reads `_edit_lock`
   (WP) / checked_out (Joomla) and returns the error `SLOT_LOCKED_BY_USER` `severity: recoverable` with
   `lockedBy`, `next: ask the customer`; once the Presence API is in core, the Claude Cowork plugin writes a presence row with the
   agent flag. Trade-off: the WP lock is a 150 s heuristic, sometimes refusing wrongly; letting the agent decide "ignore the lock"
   opens the way to overwriting.
10. **The `rest_invalid_param` error with `data.params{field: msg}` + `data.details{field: {code…}}`** →
    V2-4 already has `{code, field, severity}` for one slot. **[generic]** Add a *multi-slot* shape:
    `error.details{slotKey: {code, message}}` so a 50-slot apply returns **one** error listing them all,
    instead of stopping at the first slot; `severity` is Tracy's addition (WP has none). Trade-off: the Claude Cowork plugin must
    validate everything before writing (already atomic, so cheap).
11. **Abilities API = tools with a schema + `permission_callback` + annotations
    (readonly/destructive/idempotent), the HTTP verb derived from the annotation** → v2 D1 has a cap of 12
    actions/surface and JIT `next`, no annotations yet. **[generic]** `describe().capabilities[]` and
    each `next: {tool, args}` carry `annotations`; site-tools use the annotation to decide *whether to ask the customer
    before running* instead of a regex on the action name. Do not run Tracy on the Abilities runtime (three CMSs),
    only copy the **shape**. Trade-off: adds ~40 bytes/action to the tool description — within the D1 budget.
12. **Core abilities `core/get-site-info` with a `fields` parameter and an output schema with `title` +
    `description` per property "for REST, MCP, and AI client"** → V2-3 `describe()` does not yet say
    `outputSchema` describes each field. **[generic]** `describe()` and `content.read` publish an
    `outputSchema` with `title/description` per property (D1 already wants `outputSchema`) — the LLM reads the
    schema instead of reading 1,785 characters of tool description.
13. **MCP adapter: three meta-tools discover → get-info → execute instead of N tools** → D1 worries about 28+ actions.
    **[generic]** Measure on the 9-question table: `tracy_site` with grouped `ops` + `next` (plan) vs. the 3
    meta-tool model. Trade-off: 3 meta-tools are +1–2 calls per action — against the calls·seconds goal, so only
    copy it if the measurements show a benefit.
14. **Revisions are read-only, no restore through REST; Abilities/MCP have no undo, dry-run or
    receipt** → ADR 0021 §6 builds no new undo. **[do not copy]** Confirms the current direction; WP
    "preview" = autosave (a separate record) — if C7 chooses `apply {dry_run}`, do **not** use
    autosave as the dry-run (it creates a real revision).
15. **Polylang free has no `lang` in REST; `translations{code:id}` is Pro only** → v1
    `translationGroupId` must be "confirmed by the CMS". **[CMS-only]** The WP adapter gets the group from Polylang
    PHP (`pll_get_post_translations`) in the Claude Cowork plugin, or from the contract's `editions.json` — it cannot
    be obtained from WP REST with the build Tracy ships; state in `describe()` that `locale` is supplied by the
    contract. Trade-off: upgrading to Polylang Pro just to get REST is a licence cost per site.

### The direct question: should the v2 reader for Tracy's WordPress sites be built on WP REST + Block Bindings instead of a separate Claude Cowork plugin?

Not decided here; three paths and trade-offs measured from the sources above.

**Path A — plain WP REST (read `context=edit` + `_fields`, write the whole `content.raw`, Block Bindings for
slots).** Gains: maintained by core, discovery/schema/permissions enforced by WP, application password ties a seat
to a real WP user (WP's audit is usable), revisions come for free, `modified_gmt` for caching, the Abilities/
MCP ecosystem is already open, no more Claude Cowork plugin release cycle (currently pinned at 0.13.0 in two copies of
`quickstarts.json`). Losses: (1) **no door to edit one block** — read `raw` → parse → write the whole page, no
`If-Match`, real lost updates; (2) every contract rule (`maxCharacters`, valid `slotKey`, refusal codes,
presentation-lock hash of theme files) must run in **tracy-web**, i.e. each apply is ≥ 2–3 HTTP calls to the site,
and **theme file hashes cannot be measured through REST** (no endpoint reads files) — the lock shrinks to
`stylesheet/template` via `/settings`; (3) `tracy_site_identity` and the header/footer slots need
`register_setting(show_in_rest)` — still a theme change; (4) Polylang free → no locale through REST;
(5) Block Bindings require moving values out of markup into meta for 292 slots — a theme rewrite; (6) `block-renderer`
does not render a whole page → render proof still needs a front-end fetch; (7) 7.0 moves Block Hooks into the REST
controller [50] — the effect on the `content.raw` round-trip is unconfirmed (§10).

**Path B — keep the Claude Cowork plugin, switch the transport to the Abilities API.** The Claude Cowork plugin registers
`tracy/content-read`, `tracy/content-apply` (input/output schema, `permission_callback` per WP user
= seat, annotations `readonly`/not), served through `wp-abilities/v1/.../run` with an application password.
Gains: drops `admin-ajax` `nopriv` + the token in the body (C8 wants it gone), automatic schema validation, audit via
`wp_ability_invoked` (7.1), mcp-adapter can expose it right away if needed, **keeps as is** the single-request
check-then-write, the file hash lock, the contract, Polylang PHP. Losses: requires WP ≥ 6.9 (Tracy ships 7.1 — met), still has the
Claude Cowork plugin release cycle, two doors (the old ajax for old sites) during the transition.

**Path C — hybrid: read through WP REST, write through the Claude Cowork plugin.** The v2 reader takes `raw` + `modified_gmt` +
`_fields` from WP REST (no new PHP code needed), maps `metadata.name` in tracy-web; apply stays in the Claude Cowork plugin.
Gains: V2-1/V2-2 can be done in tracy-web right away; losses: two permission systems (a WP user for reading, the Claude Cowork plugin token for
writing) and the reader's `revision` must match the Claude Cowork plugin's definition — one more place to drift, exactly what
A2 wants to remove.

What tips the balance is measurements, not sources: A saves the Claude Cowork plugin release cycle but adds
calls per apply and drops the hash lock; B keeps every existing guarantee and only changes the door. If Lee wants a
measurement before choosing: build `tracy/content-read` as an ability on a WP 7.1 dev site and re-measure the 3 questions
"edit one line of text" per the V2-1 table.

## §10 Could not be confirmed (from primary sources in this session)

- Whether WP **checks for duplicate** `metadata.name` within a pattern/page — the documentation only says it must be unique
  to map overrides [11]; no checking code found.
- That `clientId` is not saved into the markup — the `@wordpress/blocks` handbook does not say so outright [9]; inferred from
  `parse_blocks()` having no id.
- Status of Trac #44862 (lock/release/takeover via REST, `If-Match`) — fetch returned 403.
- Whether `template_lock: contentOnly` is enforced by REST — no documentation found.
- The capability of `/wp/v2/global-styles` and `/wp/v2/settings` — the reference pages do not state it (usually
  `edit_theme_options` / `manage_options`, code not read in this session).
- How to expose a custom option through `/wp/v2/settings` (`register_setting(show_in_rest)`) — the reference page
  does not say; general knowledge, not sourced.
- 7.0 moving Block Hooks into the REST controller — the effect on the `content.raw` of templates/patterns on
  round-trip; the dedicated dev note was not read.
- WPML: `lang`/`wpml_lang` for ordinary posts appears only in the WPML forum (secondary), there is no documentation page.
- Whether Gutenberg respects `_edit_lock` when saving through REST (UI modal only) — the source is a search
  snippet, code not read.

## Technical notes for the committer

- Written on a local checkout behind `origin/develop`; `docs/references/content-api-v1.md` and
  `content-map.json` in `sources:` exist on `origin/develop` (read with `git show`), not yet present
  locally → `doc-frontmatter`/`doc-links` red locally, green after `git pull`. Run `pnpm docs:index`
  before opening the PR (`docs/README.md` is GENERATED).

## Sources

### Official

1. Posts reference — https://developer.wordpress.org/rest-api/reference/posts/
2. `WP_REST_Posts_Controller` (trunk) — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-posts-controller.php
3. Pagination — https://developer.wordpress.org/rest-api/using-the-rest-api/pagination/
4. Global parameters (`_fields`, `_embed`, `_envelope`, `_method`) — https://developer.wordpress.org/rest-api/using-the-rest-api/global-parameters/
5. Post revisions + autosaves — https://developer.wordpress.org/rest-api/reference/post-revisions/
6. `WP_REST_Revisions_Controller` (trunk) — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-revisions-controller.php
7. Metadata in block.json — https://developer.wordpress.org/block-editor/reference-guides/block-api/block-metadata/
8. Data flow (serialization / parsing) — https://developer.wordpress.org/block-editor/explanations/architecture/data-flow/
9. `parse_blocks()` — https://developer.wordpress.org/reference/functions/parse_blocks/ ; `@wordpress/blocks` — https://developer.wordpress.org/block-editor/reference-guides/packages/packages-blocks/
10. Miscellaneous Editor changes in 6.5 (block renaming `attributes.metadata.name`) — https://make.wordpress.org/core/2024/03/09/miscellaneous-editor-changes-in-wordpress-6-5/
11. An introduction to overrides in Synced Patterns (6.6) — https://developer.wordpress.org/news/2024/06/an-introduction-to-overrides-in-synced-patterns/
12. Blocks (`wp_block`) reference — https://developer.wordpress.org/rest-api/reference/blocks/
13. Template parts reference — https://developer.wordpress.org/rest-api/reference/wp_template_parts/
14. Rendered blocks (`block-renderer`) — https://developer.wordpress.org/rest-api/reference/rendered-blocks/ ; controller — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-block-renderer-controller.php
15. Templates reference — https://developer.wordpress.org/rest-api/reference/wp_templates/ ; `WP_REST_Templates_Controller` — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/endpoints/class-wp-rest-templates-controller.php
16. New Feature: The Block Bindings API (6.5) — https://make.wordpress.org/core/2024/03/06/new-feature-the-block-bindings-api/
17. Block Bindings handbook — https://developer.wordpress.org/block-editor/reference-guides/block-api/block-bindings/
18. Block Bindings improvements in 6.9 — https://make.wordpress.org/core/2025/11/12/block-bindings-improvements-in-wordpress-6-9/
19. Block Bindings: editor experience in 6.7 — https://make.wordpress.org/core/2024/10/21/block-bindings-improvements-to-the-editor-experience-in-6-7/
20. Pattern Overrides in WP 7.0: support for custom blocks — https://make.wordpress.org/core/2026/03/16/pattern-overrides-in-wp-7-0-support-for-custom-blocks/
21. Polylang REST API (Pro) — https://polylang.pro/documentation/support/developers/rest-api/
22. WPML + WooCommerce Multilingual REST — https://wpml.org/documentation/related-projects/woocommerce-multilingual/using-wordpress-rest-api-woocommerce-multilingual/
24. Post types reference — https://developer.wordpress.org/rest-api/reference/post-types/
25. Settings reference — https://developer.wordpress.org/rest-api/reference/settings/
26. Synced Patterns: the evolution of Reusable Blocks (6.3) — https://wordpress.org/news/2023/07/synced-patterns-the-evolution-of-reusable-blocks/ ; WP-CLI `wp block synced-pattern` — https://developer.wordpress.org/cli/commands/block/synced-pattern/list/
27. `core/block` block.json — https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/block-library/src/block/block.json
28. `block-bindings/pattern-overrides.php` — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/block-bindings/pattern-overrides.php
29. `render_block_core_block` — https://raw.githubusercontent.com/WordPress/gutenberg/trunk/packages/block-library/src/block/index.php
30. Gutenberg issue #59819 (overrides iteration 6.6) — https://github.com/WordPress/gutenberg/issues/59819
31. `register_post_type()` — https://developer.wordpress.org/reference/functions/register_post_type/
32. `register_meta()` — https://developer.wordpress.org/reference/functions/register_meta/
33. Authentication — https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/
34. Global styles reference — https://developer.wordpress.org/rest-api/reference/wp_global_styles/ ; revisions controller — https://developer.wordpress.org/reference/classes/wp_rest_global_styles_revisions_controller/
35. Trac #44862 — https://core.trac.wordpress.org/ticket/44862
36. Trac #58433 — https://core.trac.wordpress.org/ticket/58433
37. `wp_set_post_lock()` — https://developer.wordpress.org/reference/functions/wp_set_post_lock/
38. Presence API issue #549 — https://github.com/WordPress/presence-api/issues/549
39. Presence API — https://github.com/WordPress/presence-api
40. Discovery — https://developer.wordpress.org/rest-api/using-the-rest-api/discovery/
41. Schema (OPTIONS, validation) — https://developer.wordpress.org/rest-api/extending-the-rest-api/schema/
42. Block types reference — https://developer.wordpress.org/rest-api/reference/block-types/
43. `WP_REST_Request` (trunk) — https://raw.githubusercontent.com/WordPress/wordpress-develop/trunk/src/wp-includes/rest-api/class-wp-rest-request.php
44. Abilities API in WordPress 6.9 — https://make.wordpress.org/core/2025/11/10/abilities-api-in-wordpress-6-9/
45. Abilities API — REST API handbook — https://developer.wordpress.org/apis/abilities-api/rest-api/
46. Abilities API handbook — https://developer.wordpress.org/apis/abilities-api/
47. `WordPress/abilities-api` (archived 05/02/2026 after landing in core) — https://github.com/WordPress/abilities-api
48. Abilities API improvements in 7.1 — https://make.wordpress.org/core/2026/07/31/abilities-api-improvements-in-wordpress-7-1/
49. Introducing the WordPress Abilities API (dev blog) — https://developer.wordpress.org/news/2025/11/introducing-the-wordpress-abilities-api/
50. WordPress 7.0 Field Guide — https://make.wordpress.org/core/2026/05/14/wordpress-7-0-field-guide/
51. Client-side Abilities API in 7.0 — https://make.wordpress.org/core/2026/03/24/client-side-abilities-api-in-wordpress-7-0/
52. `WordPress/mcp-adapter` — https://github.com/WordPress/mcp-adapter
53. `Automattic/wordpress-mcp` (deprecated) — https://github.com/Automattic/wordpress-mcp
54. `wp-cli/ability-command` — https://github.com/wp-cli/ability-command

### Secondary (used only where stated)

23. WPML forum: REST + language param for posts — https://wpml.org/forums/topic/how-to-use-rest-apis-to-set-retrieve-post-translations/ ; community plugin `shawnhooper/wpml-rest-api` — https://github.com/shawnhooper/wpml-rest-api
- Gutenberg PR #4217 / issue #4331 (post locking via Heartbeat in Gutenberg) — https://github.com/WordPress/gutenberg/pull/4217 · https://github.com/WordPress/gutenberg/issues/4331
