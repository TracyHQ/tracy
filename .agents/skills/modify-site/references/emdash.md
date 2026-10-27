# Change a running EmDash site

> Read after `SKILL.md`. Tracy's EmDash themes ship `AGENTS.md` + **9 `docs/` documents**
> (`tracy-emdash-theme-base` and `tracy-emdash-theme-business` in `packages/cms/`) — **that file
> wins over this one**.

## Where EmDash differs from the other two CMSes

**No PHP, no `wp-cli`, no Joomla CLI.** Every reflex carried over from WordPress or
Joomla leads to a dead end here. And `tracy_site` — the Joomla/WordPress door — **refuses** on
this platform; calling it wastes a turn.

The only door is **`tracy_emdash`**, and it calls the site's own tools under the site's name:

1. `tracy_emdash {list: true}` **FIRST**, always — it lists every tool with its parameters. That list
   belongs to this site, not a fixed API to memorise.
2. then `tracy_emdash {tool, arguments}`.

## Structure: what lives where

| layer | where | door |
|---|---|---|
| WORDS | content in the site's SQLite | `content_*` (exact names come from `{list:true}`) |
| SETTINGS | including languages | `settings_update` |
| PHRASES · PRESENTATION | **belong to the TEMPLATE, not to this site** | see below |
| INSTALLED | not reachable from here | — |

**Where the data is, to LOOK at:** `.webroot/data` and `.webroot/uploads`. That is where the site's compose mounts
them, and where your `docker exec` lands — there is **no** `data/` or `uploads/` next to
`AGENTS.md`. Read to **look**; every write goes through a tool. **Never** edit the database by hand.

## The site / template boundary — the easiest one to cross

`/app` is **this site's own copy** (a volume, not a shared image). The site owner can edit
views, components, config and styles there, then call the build tool for `site.rebuild` (astro build then
restart) or `site.restart`.

🔒 **Don't kill the server process yourself — it is PID 1.**

⚠ And this is the test to ask before editing `/app`: **something EVERY site of this template deserves —
a new language, a new section — is the TEMPLATE's job, not this site's.** When you hit that kind,
**say so**; don't patch one site alone — that patch will drift away from the template at the next build.

## Adding a record (an entry of a collection)

The site context has the `- Adding a record:` line; each step below is one `tracy_emdash` command, and **no
describe is needed** (`content.read {describe:true}` returns up to 41k characters). The three common rules in `SKILL.md` (only what
the customer gave, no wrong-language copy, read as little as possible) apply unchanged.

1. **Which collection**: the entries a page lists live in the collection whose **LABEL matches the page**.
   `schema_list_collections` returns each collection's `slug`, `label`, `urlPattern`, so a slug is never
   guessed from the page name (`COLLECTION_NOT_FOUND`). Don't confuse it with `<name>_page`: that is the text OF that listing page,
   not the entries it lists.
2. **Fields**: `schema_list_collections` itself already includes `recordFields` — `{<slug>: "title:string required,
   date:datetime, …"}` for collections that hold records (`urlPattern` has `{slug}`, or no page of its own;
   at most six) — so this step is usually not needed. `schema_get_collection {slug}` (about 1k characters) only when the
   collection is not in `recordFields`, or when you need what it does not say: a select field's `options`, a repeater's
   sub-fields, `supports`.
3. **Create**: ONE `content_create {collection, slug, status:"published", data:{…}}` creates and publishes in one
   command; omit `status` and it is a draft (the receipt's `next` says how to publish). Rich text fields
   (`portableText`) are a Markdown string, `datetime` fields are an ISO string (`2026-09-15T00:00:00Z`): midnight of
   the day the customer named (today if none), unless they also named a time — the `Today:` notice has only the date, don't
   make up a time. `date` is a template field (printed on the page), **not the publish schedule**: scheduling is a separate task,
   `content_schedule {collection, id, scheduledAt}`, and only for collections with `scheduling` in
   `supports`. The `Today:` notice says what today's date is (UTC).
4. **Leave empty what the customer did not give**: categories (`taxonomies`), `excerpt`, image, `locale` together with
   `translationOf`. A record with text in the wrong language is never created.
5. **A new entry of the PAGE collection is not in any menu yet** (PP-4) until a menu has it: `menu_get
   {name}` then `menu_set_items {name, items}` with ALL items (it writes the whole menu). If the customer wants that page reachable,
   ask, or say clearly that no menu points to it yet; don't report "done" just because the entry is `published`.

## After writing

Writes through a tool show up immediately — there is no cache like the other two CMSes. But any write that touches `/app` needs
`site.rebuild`, because Astro serves the built output, not the source.

## Going deeper

Tracy's two EmDash themes ship their own documentation, and that is the source closest to the site:

- `packages/cms/tracy-emdash-theme-base/AGENTS.md`
- `packages/cms/tracy-emdash-theme-business/AGENTS.md`

The EmDash **build** skill holds the procedure:
`vendor/emdash/tracy-emdash-skill/skills/tracy-emdash-template/SKILL.md` — same subtree constraint
(RULE #5): edit it in `JoomlArt-Products/tracy-emdash-template`, then pull it in.
