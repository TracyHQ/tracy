# 0044. Write step and site check: one writer, one owner per slot, removal instead of hiding

Status: accepted for the trial benches (write step bench ticket 1). Decisions 1 to 4 and 6 to 9 are built by later tickets.

Builds on [ADR 0041](0041-site-planner-trial-bench-in-ops.md), [ADR 0042](0042-site-writer-trial-bench-copy-contract-and-check.md)
and ADR 0043 (the picture step, on its own branch until it reaches `develop`, so it is not linked here).

## Context

Three branches of the new build flow produce files and never touch a site: the brand file (step 2), the site copy
(steps 6 and 7) and the picture manifest (step 8). Step 9 writes them to a site, with no model. Step 11 measures the
result on the real site. Both start as a standalone trial bench, like the steps before them.

Measured on a frozen plan for the JA Boxing 1.0.10 kit, against plugin 0.24.78:

- 1174 of 1202 kit slot ids convert to a content map key with no loss. The other 28 are 17 frames of one body
  background setting and 11 icons (8 reach a text slot holding the icon class through `field`, 3 have no slot).
- The plan hides 212 slots. The plugin refuses to empty an occupied slot (`SLOT_EMPTY_STATE`), and has no operation
  that removes a list row. List rows are parallel arrays in the module's params.
- The plugin carried contracts only up to `ja-boxing/j6/1.0.8`, while the release Tracy reads was 1.0.10. A site is only writable when the plugin on it carries the kit's contract.
- `tracy-web` has no browser; `tracy-host` has one and already measures sites in `/_host/demo-qa`.

## Decisions

### 1. One writer, several plugin actions

Only the write step's code writes to the site, one action at a time. It calls whichever plugin action fits
(`content.contract`, `template.siteSettings`, `media.upload`, `site.identity`, and others). "One door" means one
writer, not one plugin action. The accent colour moves here from the host job `site-ds-slot`.

A single all-in-one plugin action was rejected: it means rewriting much of the plugin, and the rule that matters, no
second writer, holds without it.

### 2. Hidden means removed from the page, never CSS

A slot the plan hides leaves the HTML. The plugin gains the ability to empty a slot the kit measured as `canHide`
(precedent: `empty_links`) and a general way to unpublish a block. For a row the plan cuts, first measure on a real
site whether emptying the whole row leaves a hole; a remove-row operation is written only if it does, because
removing a row re-indexes the slots after it. A picture frame is hidden with its row or block (ADR 0043).

CSS hiding was rejected. Demo words stay in the HTML, where search engines and the demo scan read them, and the site
owner still finds them in the admin. A CSS hide block also caused a real loss earlier, when it outgrew a size limit
in a module it shared with the brand colours.

### 3. One owner per slot

Before any write, code builds the owner table from the three files and the plan. The plan owns link targets and hide
decisions; its labels already arrive through the site copy as `owner: "plan-label"`. Two owners with different content
stop the run with nothing written, and the report names the slot and both files. Identical repeats are not a dispute.
One owner reaching a slot by two paths is not a dispute either: the body background frames go through the site
setting. A slot in a kept block with no owner is reported and does not block, since it may not show on the page.

### 4. Write order

1. Page frame: pages, menu items and blocks the plan drops.
2. Brand: name, logos, favicon, accent colour, body background.
3. Draw the painted frames from the brand's colours (ADR 0043), upload pictures, then one contract call for pictures,
   copy and emptied slots.
4. Page settings: titles, descriptions, share images, contact mobile and map, legal and 404 pages.

Step 3 is one call because the contract door is all-or-nothing and a full site fits (limits 1500 slots, 300 entities;
JA Boxing has 164 entities). When the plugin refuses some slots, the write step drops exactly those and writes the
rest, reports each as failed in the plugin's own words, and step 11 goes red. The pre-write check applies the same
rules as the plugin, so this stays rare.

### 5. A fresh site per run

A bench-only site creator makes a site from the quickstart by the customer's path on dev. Which quickstart to create
and which contract the new site must answer are read from the template kit it is given (the kit's `quickstart` and
`contract`); no version is written in code, so a newer contract needs a newer kit and nothing else. The creator
refuses, naming both values, when `content.contract inspect` on the new site answers a different contract. It never
runs in a customer's flow; it creates and deletes trial sites only, and it records every site it makes so that it
deletes only those. The write step itself takes a site door as input and does not depend on how the site was made.
The latest run's site is kept for review and partial rewrites; the previous one is deleted once the new one is
verified. A failed run stops and leaves the site as it is. A clean
retry creates a new site and writes from the files, which calls no model. A fixed site restored from a backup was
rejected: restore time is unmeasured, and anything left behind would make results wrong.

### 6. Partial rewrite by difference

Given new files and the site, the write step compares them with its last report and writes only the slots that differ.
Its report still holds every line, the ones not sent marked unchanged with their value, and step 11 reads back all of them. Showing a slot that was emptied needs a new site, because the plugin refuses to
fill an empty slot.

### 7. Read-back belongs to the site check

The write step checks files before writing and stops on a plugin refusal it cannot attribute to a slot. Comparing the
site with what was ordered is the first group of the site check. When that group is red, the failure belongs to step
9 and later groups do not run. This keeps one script and one failure format after the write. Reading a slot's current
value uses `inspect`; states `inspect` does not cover use other reads or the page HTML.

### 8. The site check reuses the host's measures

Step 11 calls `tracy-host` and reuses the measures of `demo-qa`, adding read-back, dead links, text overflow and the
step that caused each failure. It uses no model and repairs nothing. Failures block when a customer would see them;
measures that need a person's eye only warn. Invented facts are left to steps 7 and 12, as code cannot tell.

Demo content comes from a baseline measured once per quickstart version on an untouched site, not from the kit, so
what the kit misses is still caught. An untouched site must fail the demo groups. This is a script reading text and
hashes, so the rule that no one captures a page before the write still holds.

### 9. The repair loop is a backstop

Step 13, sending a failure back to the step that caused it, should rarely run. A failure caused by loose code in an
earlier step is fixed in that step's code, so later sites do not repeat it, including the picture step's code once it
is on `develop`. Locked prompts are not changed without the owner's approval. Automatic routing is built when the
whole flow is wired, when real failures show what it must carry. For now each failure names its causing step, and the
loop is proven by hand: edit one slot in a file, rewrite it, the check turns green.

### 10. The template's look is held at the write, not measured after it

A written site may change the template's accent, icons, pictures, words and logo; corners, lines, fonts, sizes and grounds
stay. A guard on the door every write passes through (`write-step/look-guard.js`) enforces that before anything is sent: a
closed list of operations and settings, injected CSS limited to colours on the accent routes read from the template's own
stylesheets, written text with no new style or class, and an icon held to the size and backing of the template file it
replaces. A refusal names the step at fault and no further write is sent. An exception states its reason in the guard, such
as a created page copying the template's own article layout.

This replaces the `template-look` and `icon-look` groups, and the computed look of every element they needed measured on an
untouched site: a heavy read that compared effects and left the write that caused them to be found. The baseline keeps words,
hashes and the words over a picture. What the guard cannot see is what the plugin does with a write and what the words or a
picture's shape do to the layout; those stay with the remaining page groups and step 12.

### 11. A written value counts only once the page prints it

Read-back compares the database with the report, so it stays green when a template drops the block that would print a value: a
video poster that JA Boxing prints only beside a video id, written while the plan hid the id. One rule decides whether a value is
printed (`lib/printed-in-body.js`), shared by the write step and the site check: inside the page body, a picture needs an `<img>`
or `<source>` naming its file, or an element painting it as its own background; words need the body text to hold them. The head,
scripts (JSON-LD among them), comments, `<meta>` and `data-*` attributes do not count. Slots holding the same file on one page each
need their own printed element, and a slot is printed when any page that shows it prints it.

After its writes, given a page reader, the write step reads every kept page and applies the rule (`write-step/printed-stage.js`).
A kept picture of an article that shares a kit list row with a slot the run hid, and that the template does not print, is printed
by a fallback block at the top of the article's full text, where the template prints the gated block: the template's media classes,
`tracy-fallback`, `data-slot` naming the slot, and no play button. A later run finds the block by its slot and writes nothing when
it is right, replaces it when the picture changed, and takes it off when the template prints the slot itself again. The look guard
lets a template article's text change by these blocks alone. The report's `printed` section counts and names the slots printed
through a block and lists those not printed. Any other unprinted slot is only reported, since its cause is not decided.

The site check's `written-not-printed` group applies the same rule on its own reading of the pages and blocks on every written
value no page prints, naming step 9.

## Consequences

- A plugin release carrying the kit's contract comes first (1.0.10 for the first kit). It is small and separate from the plugin changes in
  decision 2, so the picture step can be reviewed on a real site before hiding works.
- The site used for that early review still shows demo content in slots that are not hidden yet.
- Alt text stays open: only gallery modules and two articles have alt slots, and how the template prints alt for the
  other pictures must be measured on a site. If it needs a template change, it becomes its own ticket.
- A per-page share image needs the Joomla Open Graph plugin on, untested on this release. The site-wide image is the
  fallback.
- A failed slot is written around rather than stopping the run. That does not hide it, since step 11 fails on it.
