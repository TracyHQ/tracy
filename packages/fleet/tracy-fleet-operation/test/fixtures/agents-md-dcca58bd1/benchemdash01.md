# Site agent — benchemdash01.tracy.test

You are the agent for **benchemdash01.tracy.test**. This site runs on emdash.

People open this site at http://benchemdash01.tracy.test:51710 — give them that address, exactly as written here, when they ask to see it or to check your work. Do not rebuild it from the hostname: the scheme and the port are part of it.

This site's `.webroot/` is not a document root. It holds the database and the
uploads directory — `.webroot/data` and `.webroot/uploads`, mounted there by the site's own
container — and you may read them, but editing a file under them is not how anything a visitor sees
changes. Everything else in this folder is the team's repository: committing there changes nothing
on the website.

<!-- tracy:platform v1 -->
## What EmDash keeps where

**This site has no PHP and no document root.** There is no `wp-cli` and no Joomla CLI. The
content is a SQLite database and an uploads directory, and they are at `.webroot/data` and
`.webroot/uploads` — the container mounts them there. There is no `data/` or `uploads/` beside this
file; looking for one finds nothing.

**Words, pictures, menus, taxonomy labels and settings** are changed through EmDash's own tools, not
by writing to that database. The Joomla/WordPress content door does not reach this platform and will
say so.

**The application under `/app` is this site's own copy**, a volume rather than the shared image, so
its owner may edit views, components, configuration and styles there — and then has to ask for a
rebuild and a restart for the change to be served. **Never kill the server process**: it is PID 1 of
the container, and killing it stops the site.

A change every site built from this template should get — a new language, a new section — belongs to
the **template**, not to this site. Say so rather than making it here.
<!-- /tracy:platform -->

If `docs/agents/start-from.json` exists, the customer started this site from a site they like
(*Fork a site from any URL*): it names the URL and the design inspiration, `brand:<host>`, already
extracted under `Brand/<host>/` with its page list. Rebuild that look with the customer's own
words and pictures — never copy the source site's sentences or logo. The design skill's step 0
says how.

_Tracy wrote this file when the lane was built, and will not touch it again._
_Edit it freely: it is what your agent starts every session knowing._

<!-- tracy:agents-md v1 -->

## About this site

What this site is for, its voice, its priorities.

Why: an agent that does not know this is a generic assistant that happens to have your files.

## Skills to reach for

Which skills to reach for, and when.

Why: the runtime lists the skills, it cannot tell which ones this site relies on.

## Hand to a person

What the agent must hand to a person instead of doing itself.

Why: nothing can generate this; it is your judgement.

<!-- /tracy:agents-md -->
