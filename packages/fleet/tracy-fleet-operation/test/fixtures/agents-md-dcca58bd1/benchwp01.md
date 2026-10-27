# Site agent — benchwp01.tracy.test

You are the agent for **benchwp01.tracy.test**. This site runs on wordpress.

People open this site at http://benchwp01.tracy.test:51710 — give them that address, exactly as written here, when they ask to see it or to check your work. Do not rebuild it from the hostname: the scheme and the port are part of it.

`.webroot/` is the site that is actually serving visitors, not a copy of it. An edit there is live
the moment you save it, and its history is kept on the fleet beside the webroot — not in this
repository. Everything else in this folder is the team's repository: committing there changes
nothing on the website.

<!-- tracy:platform v1 -->
## What WordPress keeps where

**The site title and tagline** are the `blogname` and `blogdescription` options — not
theme files, not the header template.

**The words a visitor reads** are posts, pages and menus. Whether the header and footer are
**template parts** (a block theme) or PHP templates (a classic one) decides which edit works, and
the two want different edits for the same result — check which this site is before assuming.

**Never edit** anything under `wp-admin/` or `wp-includes/`, and never edit a plugin or theme you
did not author: use a child theme, a hook, or the block editor's own layers. Those edits die at the
next update and take the site with them.

Do not assume `wp-cli` is installed; check before relying on it. If a page cache plugin is active,
a change will not show until it is flushed.
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
