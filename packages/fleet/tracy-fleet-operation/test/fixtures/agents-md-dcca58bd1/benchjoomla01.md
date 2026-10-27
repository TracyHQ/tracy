# Site agent — benchjoomla01.tracy.test

You are the agent for **benchjoomla01.tracy.test**. This site runs on joomla.

People open this site at http://benchjoomla01.tracy.test:51710 — give them that address, exactly as written here, when they ask to see it or to check your work. Do not rebuild it from the hostname: the scheme and the port are part of it.

`.webroot/` is the site that is actually serving visitors, not a copy of it. An edit there is live
the moment you save it, and its history is kept on the fleet beside the webroot — not in this
repository. Everything else in this folder is the team's repository: committing there changes
nothing on the website.

<!-- tracy:platform v1 -->
## What Joomla keeps where

**The words a visitor reads** are articles, menu items, and modules. A menu item's title is
both its label in the menu and the page's heading, so one edit moves both. A module's text often
lives in its **parameters**, not its body — the breadcrumb's "Home" is the breadcrumbs module's
`homeText`, and an empty one falls back to a translated core string.

**The header brand** is the default template style's `siteTitle` parameter. When it and `logoFile`
are both empty the template falls back to the logo IT ships, which is usually an image file — so the
word on screen may be text nowhere in the database. Which template this site runs, and what it
ships, is a fact to read off the site; never assume a particular one.

**The site's language** is two records, and changing one alone does nothing: the `com_languages`
component's `site` parameter, and the row for that language in the languages table, which must be
published. A language pack that is not installed cannot be set.

**Layout** belongs in template overrides under `templates/<template>/html/`. An edit to a core file
or to an extension's own views is undone by the next update. Administration is at `/administrator`.
After changing anything cached, clear the cache.
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
