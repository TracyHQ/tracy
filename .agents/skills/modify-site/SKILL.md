---
name: modify-site
description: Change a RUNNING customer site on WordPress, Joomla or EmDash — add, delete, edit, translate, and complex combinations of these. Use when a customer asks to change a site that is already built; it says where each CMS's structure differs, which door is the right one for each layer, and what order dependent tasks must follow. NOT for building a new site — that is the job of the three build skills (`tracy-wordpress-theme`, `joomlart-t4-template`, `tracy-emdash-template`).
---

# Change a running customer site

## This skill does NOT repeat what the agent already has

The site context (`site-context.mjs`) is loaded on every turn and already says: the **five layers** (WORDS · SETTINGS ·
PHRASES · PRESENTATION · WHAT IS INSTALLED), **ask every read in one step**, **re-read the
`apply.list` receipt**, and **if a translation can be installed, don't retype it**. Don't re-read them here.

What this skill adds is what a prompt sent on every turn **cannot carry**: the structure of each CMS, and
recipes for common requests.

## Three things to read before changing anything, in this order

1. **The site's own `.webroot/AGENTS.md`**, if it exists. It **overrides** everything in this skill — it was written by
   whoever built that template, while this is what holds for the CMS in general. On a
   `tracy-business/j6` site, that file points to `templates/tracy_business/AGENTS.md`: **thirteen rules** and
   nine `docs/` documents. The site context names it when it exists.
2. **The reference for this CMS** — [`wordpress`](references/wordpress.md) ·
   [`joomla`](references/joomla.md) · [`emdash`](references/emdash.md).
3. **`tracy_site` `info`** (or `tracy_emdash {list:true}`) — the site says what it is; don't infer it from the name.

## One rule specific to CHANGING

🔒 **THIS SITE IS SERVING REAL PEOPLE.** Completely unlike building: no draft, no worktree,
no re-run. `.webroot/` **is** the running site — a write is public the moment it is saved.
Therefore:

- **No "let's try and see".** Every write must be the one you intend, carrying its `apply_id`.
- **Delete means trash, not permanent removal** (`content.delete` writes the trash column) — so it can be undone
  with that same receipt. Don't go looking for a hard-delete path.
- **Touching structure means snapshot first**: `db.snapshot` before any extension install/uninstall or upgrade.

## Order between tasks — what forces what

The site context already says *"order is not preference"*. Here are three concrete constraints, true for all three CMSes:

| later task | must wait for | because |
|---|---|---|
| a post/page pointing at an item | the item exists | no id to point at |
| any text in language X | language X is installed | it can't be set before it is installed |
| editing a record | every delete touching it | delete first and there is nothing left to edit |

Tasks **without** such a constraint can be done in any order — and **say so**, because
that is how the customer knows nothing is waiting on anything.

## Split complex work, and split by LAYER, not by page

A request like *"switch the site to Vietnamese and add a Contact page"* is **two** requests. But
*"switch the site to Vietnamese"* is **one** request touching **two layers** (WORDS + PHRASES) — splitting it by
page (10 pages = 10 tasks) is how one package install turns into ten rounds of hand typing.

The test: name the layer first, then count the tasks within that layer.

## Adding a record (post, article, member…)

The site context has **one line** `- Adding a record:` per platform: field names and the shape of the create command, enough to
avoid reading sibling posts, theme code or plugin code to learn them (bench v7, 29/09: 11 runs of "publish a news post"
took 8–23 LLM calls for a job needing 3–4). What that line **cannot carry** is in the *Adding a record* section of the
CMS reference: where the record lives, what happens with past or future dates, what to leave empty. Three rules common
to all three CMSes:

1. **Create only what the customer gave.** Category, excerpt, image, a copy in another language: only when the customer
   names it. Invented data is worse than empty — the site will show a classification nobody chose (bench v7: every
   WordPress run added a category and an excerpt on its own, two of them sentences the agent wrote itself). The answer says
   what was left empty. **The category is the exception when the page the customer names filters posts by it**: a post
   without that category does not appear on that page (Joomla always needs a `catid`; for WordPress see the reference), so it
   is the PAGE's category, not a classification the agent chose.
2. **A language copy never carries text in the wrong language**, not even an "unpublished" one: if the customer has not given
   a translation, there is no counterpart yet. Say it is missing, and add it when they provide the translation.
3. **Read as little as possible before the create — exactly these things and nothing more.** WordPress: nothing to read,
   unless the customer names a page that lists posts (read that page's `wp:query` block to know whether it filters by
   category). Joomla: the category the customer's page lists, plus ONE sibling article in that category to copy
   `attribs` from (the Tracy template's layout lives there). EmDash: the list of collections. Don't read describe (15–41k
   characters), many sibling posts or source code to learn the command shape. Today's date is already in the
   `Today:` notice (the host's UTC time, sent after the customer's message, once per conversation): don't hunt for it with `date`, log globs
   or file mtimes — a broad glob over `.webroot` once timed out at 30 seconds (bench v7: 3 out of 4 times). The notice only
   has the DATE: the time of day is midnight (`00:00:00`) unless the customer names a time — don't make one up.

## After the change

The site context already requires re-reading `apply.list`. What this skill adds: **each CMS has a "make it
show up" step** and it is NOT the same — see the *After writing* section in that CMS's reference. Skipping that step is
the most common reason for *"I changed it but nothing looks different"*.
