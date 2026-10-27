---
name: emdash-site
description: >-
  Use when an EmDash job goes beyond changing words already on a page: structure, pictures, menus,
  languages, personalising a new build, or code under /app. Words: the site context's WORDS rule.
---

# An EmDash site speaks for itself

EmDash ships a Model Context Protocol server on every site: 59 typed tools, its own
scopes, its own optimistic locking. Tracy adds nothing in between — the `tracy_emdash` tool
names the site and carries the site's agent token; the tool names and arguments are EmDash's.

Words already on a page need none of this skill: `tracy_site content.replace {find, replace}`
changes them in one call, and the site context's WORDS rule is the road for what it cannot do (one
read, one `content_update` that publishes).

## The road for everything else

1. `tracy_emdash {tool, arguments}` — one call; several reads may go in one step. The locale is
   filled with the language the site serves; pass `locale` for another. Reads: `content_get`
   (one entry, with its `_rev`), `content_list` (a list), `menu_get`, `media_list`,
   `taxonomy_list`, `settings_get`, `schema_get_collection {slug}` for the fields of a collection
   that `schema_list_collections` gave no `recordFields` for. Writes: `content_create {collection,
   slug, data, status:"published"}` (a new language edition: `locale` + `translationOf:<the
   default entry's id>`), `content_update {…, status:"published"}`, `menu_set_items`,
   `settings_update`.
   A NEW entry (a post, a team member): the entries a listing page shows are in the collection
   labelled like the page. `schema_list_collections` answers every collection's slug, label and
   urlPattern, so a slug is never guessed from a page name, and `recordFields`: the fields of the
   collections that hold records, as `name:type required` (`schema_get_collection {slug}` gives them
   for one it leaves out); then ONE `content_create` (rich text is a Markdown string, a date an ISO
   datetime). Put in only what the customer gave: a category (`taxonomies`), an excerpt, a picture
   or another language's copy only when they named it — empty beats invented.
2. `{list: true, tools: [names]}` only for the schema of a tool the description does not name —
   never as a first step.
3. Menus: `menu_get {name}` answers its items in the shape `menu_set_items {name, items}` takes;
   send every item back with your change (item ids change; say so).
4. Pictures: a picture the customer gave goes up with `tracy_site media.upload` — `{file}` is its
   name in the Files tab, `{attachment}` its name (or `sha256:` id) when they sent it in this chat;
   Tracy reads the bytes, so never type base64 or a URL into `media_upload`; a picture already in
   the chat needs no Files tab. A Files-tab picture is not in `media_list` until then: never look
   for it there or with `media.scan` first. A new one is drawn with `tracy_site media.draw {prompt, aspect}`.
   Either answers a media `id`: that id into the field; EmDash fills in the rest of the picture.
5. A delete of any kind (`content_delete`, `schema_delete_*`, `menu_delete`, …) is refused with
   `CONFIRM_FIRST` until the customer has answered: ask with `ask_user_question`, naming what goes,
   then make the same call with `confirm: true`.
6. Every write answers its receipt — each field before and after — so there is nothing to read back.
   Undo is the same call with the before values.

## Putting the customer's words in

Some templates carry their own `tools/personalize.mjs` and the build runs it; the ones packed by
the EmDash template skill do not, and then the build hands that work to you — the stage reads
`personalize: skipped` with the code `PERSONALIZE_BY_AGENT`. **The customer has already answered
the questionnaire when this happens**, so it is never a reason to ask them again, and never a
limitation to report back. Their answers are in `docs/agents/build/job.json` under `answers`
(business name, sector, address, hotline — whatever that site's set asked).

1. Read the entries the demo words live in: `content_get {collection:"site", id:"site"}` for the
   top bar, header, footer and contact values, and each page's own collection.
2. For each entry: one `content_update … status:"published"` with only the fields an answer gives
   — the brand name everywhere it appears, the contact details, the words that describe what this
   business does.
3. Anything the answers do not cover stays as it is, EXCEPT a claim about the business: a count
   of projects, a founding year, a certification, a named client, a price. Those are removed,
   never rewritten from imagination — a made-up "380 projects since 2004" is a lie told in the
   customer's name.
4. Say in one line what changed, and what is still demo copy waiting for them.

## What must stay true

- **One write changes and publishes.** `content_update` with `status:"published"` puts the change
  live in the same call. Without `status` it stages a draft no visitor sees; `status:"draft"`
  takes a live page offline. A list field goes back whole with one item changed.
- **Somebody else's draft is theirs.** `PENDING_DRAFT` means the entry holds an unpublished change
  nobody in this conversation made — ask the customer before publishing it; if they say yes, make
  the same call with `confirm: true`. A `CONFLICT` means the entry changed since you read it: read
  it again for a fresh `_rev`, do not retry the old one.
- **Languages are entries.** Another language is another entry of the same slug, linked as a
  translation. Change the language the customer asked about; do not translate on your own.
- **Labels change through their own tools.** A category's or tag's label: `taxonomy_update_term
  {taxonomy, termSlug, label}`, its items kept — terms are per language, and without `locale` it
  writes the first language's. A form's visible words (labels, placeholders, options, button):
  `form_words` after `form_list`, never its fields or recipients.
- **Do not invent facts.** No counts, years, certifications, prices, clients or people the
  customer did not give. Empty beats invented.
- **Code is the build tool's business.** Views, styles and config live under `/app` and are
  this site's own copy, and so are the words written into the template's code (a label in a
  view that no entry holds): edit them with bash in the site's container, then call the build
  tool's `site.rebuild` (astro build, then a restart) or `site.restart`; a mode without bash
  cannot, so it says so. Nothing in the admin needs a rebuild. Words an entry holds are EmDash's
  content, never in `/app`: read and written through `tracy_emdash`.
- **No shell into the database.** `.webroot/data` holds the raw database: never edit it, and do
  not look for words there. No `sqlite3`, no replacing the file.

## Where the details are

The site folder carries the template's own documentation under `template/docs/` —
`content-api.md` (REST shapes, headers, revisions), `languages.md`, `content-rules.md`. Read the
one that matches the job only before a STRUCTURE change you have not done on this site: a new
collection, field, menu or language. Words, pictures and menu labels need none of it.
