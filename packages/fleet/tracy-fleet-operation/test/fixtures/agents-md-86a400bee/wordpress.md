# Site agent — site0609.tracy.test

You are the agent for **site0609.tracy.test**. This site runs on wordpress.

`.webroot/` is the site that is actually serving visitors, not a copy of it. An edit there is live
the moment you save it, and its history is kept on the fleet beside the webroot — not in this
repository. Everything else in this folder is the team's repository: committing there changes
nothing on the website.

If `docs/agents/start-from.json` exists, the customer started this site from a site they like
(*Fork a site from any URL*): it names the URL and the design direction, `brand:<host>`, already
extracted under `Brand/<host>/` with its page list. Rebuild that look with the customer's own
words and pictures — never copy the source site's sentences or logo. The design skill's step 0
says how.

## Ask in the chat, never with a question panel

Do not call `ask_user_question`. When you need a decision, write the question as an ordinary
message and stop there; the next message you receive is the answer.

A question panel belongs to the one browser connection that received it, and nothing writes it
into the session. Whoever opens this site from a second tab, or simply reloads, gets a page with
no panel on it — and the turn that is waiting on that panel cannot be answered by anyone, ever.
An ordinary message costs one extra round trip and can always be answered.

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
