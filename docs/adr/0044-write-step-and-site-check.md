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

Measured 2026-11-06 (card AL): a second run with the same files stopped `NEEDS_NEW_SITE` with nothing written, naming 28 slots
the first run had taken off with their rows (`rows.remove`, lines of `part: 'row'`). Those lines have no hide claim, so the check
that a hidden slot is still hidden read them as brought back. A row line is now brought back only when the new files want it
again: they fill its slot, or it is a slot of a kit row the new plan no longer gives up. A slot the plugin took along that no kit
row names stays gone. The same files give 0 written, every line unchanged.

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
replaces. A finding names the step at fault; since decision 26 the value is written all the same and step 11 blocks on it. An exception states its reason in the guard, such
as a created page copying the template's own article layout.

This replaces the `template-look` and `icon-look` groups, and the computed look of every element they needed measured on an
untouched site: a heavy read that compared effects and left the write that caused them to be found. The baseline keeps words,
hashes and the words over a picture. What the guard cannot see is what the plugin does with a write and what the words or a
picture's shape do to the layout; those stay with the remaining page groups and step 12.

Decided 2026-11-06 (card AB, product owner): one named exception, `social-icons-without-accounts`. A cell whose demo content is
only social icon links (no visible text), written for a subject the brief gives no social account (the brief facts the copy cites
for that cell), may take words in their place; the icons going is accepted, not a finding. Only the "takes off the template's
class" findings of that cell are let through, kept in `report.guard.allowed` with the rule and its reason; any other finding on
the cell, a cell whose subject has an account, or a cell the copy cites no fact for, stays a finding. Measured offline on a JA
Boxing bench run: 28 blocking look-guard lines (four coach role cells) become 0.

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

Measured 2026-11-06 (card K): a gallery prints each picture's description only as the image's `alt`, and `written-not-printed`
blocked six written descriptions as not printed. A written text slot now also counts as printed when an `<img>` of the body holds it
as its `alt`, or any element as its `title`, each attribute compared on its own with spaces and character references read
(`lib/printed-in-body.js`). Other attributes (`data-*` among them) still do not count. The rule reads the page's markup, so the
host's measures did not change.

### 12. Brand accent words are held to 3:1, and a logo blocks only when most of it fades

`band-contrast` blocks words the brand style made worse than the template only when they read under 3:1, WCAG's level for large
text and controls: an accent marks a link, a highlight or a button label, and the owner ruled a brand green at 3.28:1 on a dark
footer no fault. Words the brand style did not touch keep 4.5:1 and stay the template's warning.

`logo-readable` keeps its measurement and changes its verdict: a logo blocks when over 60% of its ink reads under 2:1 against its
ground, warns from 40%, and passes below. The owner ruled logos with 31% to 34% of their ink under 2:1 no fault, since the name stayed
readable and only the dark part of the mark faded. The fault still goes to step 2 for the brand's logo file and to the template for
its own. Every other measure keeps its bar.

### 13. A frame's light or dark twin follows the frame it names

When the plan hides a frame, the write step hides every frame whose `twinOf` names it, through chains, as the plan's claim with
`via: 'twin'`; the planner never hides a twin on its own. In the site check, an unowned picture slot on a kept block that still holds
a template picture blocks even when the read did not see it, unless the kit says its block prints at no width; a picture counts as
shown when either side of the light and dark switch shows it, and an unowned twin of a frame the write step hid names step 9.

### 14. The template's own text colours are held to 3:1

`band-contrast` and `words-over-picture` say nothing of words whose colour and ground are the template's own (the brand style did
not make them worse) when they read at 3:1 or over: the owner ruled the template's default grey text at 3.55:1 to 4.30:1, the same on
the untouched demo, no fault. Under 3:1 they stay a step 0 warning, said once per theme, selector and colours for the whole run;
the brand's bars do not move.

Over a picture (cards AX and AW, 2026-11-06) the same bars hold whatever picture lies under the words: the template's neutral grey
is no fault from 3:1 and a warning under it, once per fact, even on a picture step 8 placed; a colour the brand style gave blocks
under 3:1, and only warns over a veiled picture (blurred, or under a pseudo-element veil, as the template's blurred background
layer is), which the owner ruled readable; any other colour keeps 4.5:1.

### 15. A tall block is compared with the same block on the demo

`tall-blocks` warns only when a block is more than 25% taller than the same block (page, width, selector) on the demo baseline,
never against a fixed height, and says nothing when the baseline holds no height for that block. A 2721 px home block was warned
under the old 2700 px limit while the same block on the demo measured 3354 px.

### 16. The quickstart is the standard, not the public demo

The comparison standard for a run is the quickstart version the customer receives (for example ja-boxing 1.0.10), measured as an
untouched site (decision 8). The template's public demo site is not a standard: where it differs from the quickstart, in sizes or in
spacing at narrow widths, the difference is not a fault of the run.

### 17. A block's text is compared with the same block on the demo

`text-fill` (step 6, a warning) compares the characters each block prints (page, width, selector the page holds once) with the same
block on the demo baseline: under 60% (`TEXT_FILL_MIN`) or over 110% (`TEXT_FILL_MAX`) of a demo over 40 characters warns, and so
does a list showing half the demo's items or fewer, or with a median item twice the demo's or longer. One line per block for the whole
run, silent when the baseline holds no block text. The host answers `textBlocks: [{ selector, chars, items? }]` beside `blocks`, and
the baseline keeps them (`textBlocks`). The writer's own rule (ADR 0042 section 10) is tighter, 80% to 100% per slot; this is the
page-level net, which also sees text a block lost or gained around the slots.

### 18. Nothing measured is not green, and an older kit is refused

A group that measured nothing is `unmeasured`, never green: `broken-sentence` when the kit names no sentence groups,
`written-not-printed` when no written slot the kit places on a kept page was read, `unowned-slots` when the write report carries no
unowned list (or no slot at all). The check's `counts` gain `unmeasured` (groups), printed in the last line. With a kit, the first
group is `kit-version`: a kit whose `tool` names a template-kit older than `KIT_TOOL_MIN` (3.1.0), or no version, blocks the run on
step 0 ("settle it again"), since the later groups read data such a kit lacks. The committed ja-boxing 1.0.10 kit was settled before
the tool knew sentence groups, and `broken-sentence` read green on 0 slots.

### 19. A heading the demo marks with an accent span prints one in the brand accent

`accent-emphasis` (block) reads, for every written slot whose kit slot has a span `inline` (ADR 0042 section 11), the printed
heading with the same words (`headingSpans: [{ text, color, spans: [{ text, color }] }]`, which the host now answers). No span is a
block on step 6 when the written value holds no span (the copy named no emphasis) and on step 9 when it does. A span not painted in
the brand accent the style names (or its word colour, or a shade of it) is a step 0 warning: the template colours it with a fixed
value. Written headings that no page prints as a heading leave the group unmeasured (decision 18).

The Road to live step "Template kit" names four kit counters in words, first, so /ops shows them within its 90 characters:
`samplesCut` "demo samples cut", `sentenceGroupsUnsettled` "sentence groups not settled", `inlineEmphasisMissing` "inline
emphasis missing", `inlineMarkupLost` "inline markup lost" (content map samples that lost the demo's inline markup, measured
against the demo database by `content-coverage/resample.mjs`). Any of them above 0 keeps the kit `kit-incomplete`, as every
self-check counter does.

The export writes the demo's line break too: when the kit slot's `inline` has a `br` right before a span that ends the
text, the exported value puts `((br/))` before the wrapped emphasis (`Our((br/))((span))Classes((/span))`), so the title
prints on two lines as the demo does. A demo without that break gets none.

### 20. Kept pages take the plan's slug at the end of the write step; the site check blocks a kept page whose menu link does not end with its plan slug

The planner names every kept page after what it holds (`plan.pages[].slug`), and the site kept serving it at the demo's address:
on a JA Boxing bench site 6 of 8 kept pages (a tennis page at `/classes/group-boxing`, its parent at `/classes` for `services`).
The route stage (`write-step/page-route-stage.js`) runs last of the writes, after the printed check read the pages back, since every
stage before it and the kit find a page by its demo address. For each kept page with a plan slug, the home page aside, the published
menu item that opens it (the main menu's first) takes the slug as its `alias` through `content.update`, and so does the article it
prints when its link is a single article. The slug is ASCII, lower case, joined by hyphens; a sibling already holding it is said
before anything is sent. The plugin (Claude Cowork for Joomla, from 0.24.81) renames the item's branch with an `alias` undo entry,
refuses an alias a sibling holds and the home item, and answers the alias it holds now. A plugin from before ignores or refuses the
field: the line is failed with the release it needs, so read-back blocks on step 9 and no page reads as renamed. A category or tag
alias is not renamed: no kept page of a single-article menu item shows one in its address.

The report keeps a route table, `routes: [{ pageId, slug, itemId, articleId, from, to, outcome, reason?, evidence?, article? }]`
(`outcome` written, already or refused; `to` is where the page answers now), the lines `<page>:slug` and `<page>:article-slug`
(`part` page-slug and article-slug, owner plan, each read back on its row), and `keptPages` at the new addresses, which the site check
opens. On a rerun the last report's route table is played back first: each renamed item takes its demo alias again, a refusal stops
the run (`ROUTE_RESTORE_FAILED`), and the stage renames it again at the end. The look guard opens `alias` on a template menu item and
article, as a slug only: an address restyles nothing.

`page-slug` (block, step 9) runs after read-back on a report with a route table: each page's menu item, as inspect lists its route
(or its row, when inspect does not), must end with the plan slug. A page the site answers nothing for is unmeasured (decision 18).
With a host, a kept page that does not answer at its new address blocks too; an old demo address answering 404 is what a rename
leaves and is not opened. The demo baseline is moved to the new addresses before the page measures compare with it. A report from
before this stage has no route table, and the measure does not run on it. Links the template holds as literal demo addresses (not
`index.php?Itemid=`) are not rewritten; `dead-links` finds them.

### 21. Every link the plan keeps leads where the plan says, and a button with no address is the template's fault

The kit counts `deadControls` (`template-kit/lib/reach-checks.mjs`): a link read as a page control with words but no address, no
menu item and no target the site holds. Above 0 the kit is `kit-incomplete`, and /ops names it "buttons with no address". The
write step no longer leaves such a link as a skipped line: a kept link with no door is `refused`, with the reason, and for a dead
control the reason says the template must print it as a link with an address the site holds (`deadControl: true`). Read-back fails a
refused line on step 9, and the counts carry `refused`.

The report keeps `planLinks: [{ link, block, pages, leadsTo, target, labelSlot, deadControl? }]`, `endActions: [{ page, leadsTo,
target }]` and `phones` (`write-step/plan-link-table.js`): the target is a kept page, a `tel:` number, a `mailto:` or an https
address from the brief facts; a map, a legal page or a lightbox has none and is not measured. `plan-links` (block, step 9, step 0 for
a dead control) opens each kept page the link shows on and needs a shown link to its target with the plan label's words; an end
action needs any shown link to its target on its page. A link whose line went with its row is not held. A report without the table
or a host without `shownLinks` leaves the group unmeasured (decision 18).

### 22. A list keeps exactly the plan's rows, removed whole

Measured on a bench site with the JA Boxing kit: a list the plan cut to 2 rows printed 4, two of them empty. The cause was the
shared link door. A kept link whose address the demo held in a url slot of a later row (`byItsAddress`) wrote that slot, so the
slot was in `changes`, so in `keep` (`hide-plan.js`, `const keep = new Set(Object.keys(changes))`), and the row rule
(`hide-rows.js`, `!members.some((s) => keep.has(s.key))`) kept the row: its words were emptied instead of the row removed.

Now the rows the plan drops are decided before any claim: a link claim whose slot sits in a gone row is not kept (its line reads
`via: 'row'`, hidden with the row), and every member of an on-site row with a gone member and no kept member goes through
`rows.remove`, its url and picture slots included (`rowRest`, a `row` line each when no claim names it). A written slot still holds
its row. The report keeps `rows: [{ block, list, plan, demo, kept, keptKeys }]`, rows kept against the plan per list.

The host now answers `lists` per page (sibling groups by tag and classes, each item's characters, words and pictures). `list-rows`
(block, step 9) finds the printed list holding the written words of a list's kept rows and blocks when it prints another number of
items than the plan keeps (the plan's count, or the demo's when fewer), or an item with no words and no picture. A list printed
nowhere leaves the group unmeasured.

Measured 2026-11-06 (card AH): a kept card's written word "Coach" was also printed by other blocks of the page, so a four-item
list of another block was taken for a two-card list, and a block was measured on the home page, which does not print it. The list
is now looked for only on the pages that print the row's block (inspect's `pages` and their `assignedModules`), a written word
matches only as a whole word, and a word another block on that page also wrote is no sign of the row. A list it cannot place
that way is unmeasured, never the nearest guess.

### 23. A map is drawn at the business, not at the demo's place

The kit reads the maps each block prints (an embedded maps frame, an element carrying latitude and longitude) and counts
`mapLocationUnmapped`: a link that opens a map, or a block that embeds one, with no map-location slot to write. /ops names it "map
stays at the demo place". The page settings stage writes a map-location setting from the copy, else from the brief's address fact,
with coordinates when the place, a location fact or the Google place has them; with neither it is `refused` and says so. A link that
opens a map no slot holds is refused with what it needs (`MAP_NEEDS`): a door in the Claude Cowork plugin for the map plugin's
parameters, or a template that prints the map from a slot or links to the address.

The host answers `maps` per page (frame, link, element or script, with latitude, longitude or address), and the demo baseline keeps
them, moved with the kept pages (decision 20). `map-location` (block, step 9) blocks a map within 0.5 km of a demo map, or at the
same address, and one more than 50 km from the business when the report holds its coordinates (`place`). With no demo maps and no
coordinates it is unmeasured.

Measured 2026-11-06 (card AP): a template release turned its map button into a maps search link of the address the page prints,
and the button led to the business address once the address was written, yet the write step still refused it as "a map that
stays at the demo place" and `demo-links` blocked it as a link leaving the site. A map button whose kit link is a maps search of an
address (`lib/map-links.js`) is now a `skipped` line, not a refusal: there is no map drawn from settings to move, and
`map-location` reads where the link leads. `demo-links` judges a maps link by its target: one that searches another address than
the demo baseline's maps is not the demo's link; one still at the demo's address stays a block. Without a baseline nothing changes.

### 24. A phone a visitor reads can be called

The kit counts `phoneNotCallable`: a phone slot no link of its block uses as its label, and a contact form or contact field of the
phone or mobile kind the template prints as text. /ops names it "phones not callable". The host answers `phones` per page (the
printed number, its digits, whether a `tel:` link holds it, and where). `phone-callable` (block, step 0) blocks a brief phone (matched
on its last 9 digits) printed outside a `tel:` link: the template prints it as text, and the write step never puts markup in a text
slot to make it a link. Another number on the page is not judged.

### 25. A released contract's inline markup lives beside its sealed content map until the next contract version

A heading such as `More<br><span>Blogs</span>` was captured as words only, so the kit could not list the line break and the
accent span the template draws (decision 19). A released `content-map.json` is sealed: the Claude Cowork plugin binds every site
to its hash, and changing one byte answers "Installed content contract changed" (ADR 0038 context 8 and decision 6, ADR 0039
decision 6). So the markup of a released contract is never written into its map. `content-coverage/resample.mjs --sidecar`
measures it against the installer's dump and writes it into `content-coverage.json` as `inlineMarkup.samples` (slot key to
sample), a file the plugin does not hash and the seeder does not pin. The template kit takes a slot's sample from the content map
first and from that sidecar second, only when the map's sample marks nothing and both read as the same words
(`template-kit/lib/contract-read.mjs`); `inlineMarkupLost` counts the slots neither carries. The next contract version captures the
markup into its map (`capture-contract.py --inline-markup`) and drops the sidecar. JA Boxing 1.0.10 is the first: 64 samples in
the sidecar, its map back at the sealed bytes the 0.24.79 to 0.24.81 plugin carries; 1.0.11 takes them into its map.

### 26. One item never stops the run: the write step writes everything it can, and the site check lists every fault

Owner's decision, 2026-11-05. A real run stopped with nothing written three ways, each over one item: the picture package
listed a frame "the kit has no image slot" for (`BAD_FILE`), a copy or brand slot the kit or the site did not have
(`UNKNOWN_SLOT`), and the look guard refusing words over a cell whose demo is only a block of social icons (`LOOK_GUARD`). A
stop hides every other fault of the run behind the first one, and the owner can only see the site once each is fixed in turn.

Now the write step writes everything it can in one pass:

- A value the look guard finds fault with (decision 10) is sent all the same. The finding is kept in `report.guard.findings`
  (`step`, `stepName`, `action`, `what`, `reason`, `sent`), and the line of that cell carries it in `guard`. Only a call on a
  channel the guard does not list (an action, an operation or a parameter) is held back (`sent: false`, also in
  `report.guard.refused`); it is the write step's own code calling a door nobody opened, not a value, and the run goes on.
- An item with nothing to write to is left out and said once in `report.unaddressable` (`slot`, `key`, `owner`, `step`,
  `stepName`, `reason`), and its line reads `refused` with `unaddressable: { step, stepName }`: a copy slot the kit does not
  have and a copy entry that is not what step 6 writes (step 6), a brand order on a slot the kit does not have (step 2), a
  picture frame the export could not place or that holds a file the uploads do not list (step 8,
  `write-step/picture-package.js` `packageItems`), and a slot the site does not have (the step that owns the value, by its
  owner; the write step when no file owns it). Every other item is written.

The run still stops, with nothing written, only when the whole run cannot be trusted:

- an input file that is not JSON, not the shape its step writes (the copy's version, fingerprint or lists, the plan's shape,
  a brand file the brand step did not write, a picture file that is not the export), or made on another kit or contract;
- a file the inputs name that is outside its folder, cannot be read, is not its sha256, is not named by its sha256 under
  `images/tracy-content/`, or is over the plugin's upload limit;
- a site that does not answer `inspect`, answers another contract, or takes more slots than one contract call holds;
- two owners disputing one slot (decision 3), a rewrite that needs a new site (decision 6), and a door that throws.

These are kept because each says the files or the site are not what the run believes, so no item of it can be trusted, and
because a second run with the same files must still write nothing.

Step 11 gains two groups that read only the write report, and run before read-back so a red read-back never hides them
(`site-check/write-findings.js`). `look-guard-findings` blocks on each finding and `unaddressable-items` on each item left out,
naming the cell and the step that owns the value: copy step 6, plan step 3, pictures step 8, brand step 2, the write step
itself step 9. A report written before this decision has neither list, and both groups are `unmeasured` (decision 18).
Read-back leaves an `unaddressable` line to its own group, so the fault is blamed once and on the owning step.

### 27. A group that checked nothing is never green: it is not applicable with its reason, or unmeasured

Owner's decision, 2026-11-06. Decision 18 wrote "nothing measured is unmeasured" into three groups by hand, and every other group
that answered `checked: 0` with no block still read green: on a real run `broken-sentence` read green on 0 (each slot of the kit's
three sentence groups was hidden by the plan or had no line in the write report) and `unaddressable-items` read green on 0 while
the plugin had refused 96 hides for want of a contract slot. The rule now lives once, in `measure()` (`site-check/site-check.js`):

- A block failure is red, whatever the count.
- Otherwise `checked > 0` is green.
- Otherwise the group is `not-applicable` when it answers `notApplicable: '<reason>'`, a reason that says there was nothing of its
  kind on this site (the write step created no page, the plan cuts no list, the kit marks no accent span), and `unmeasured`
  when it gives none. A group never says not applicable for a read that came back empty: that is unmeasured.
- `not-applicable` passes: the verdict reads it as green and a group with `stopsLaterWhenRed` does not stop the later ones.
  `counts.notApplicable` counts it, and each one prints its reason on its line. `unmeasured` stays as decision 18 made it.

The reasons given: `look-guard-findings` (the guard found nothing), `unaddressable-items` (nothing left out and no contract
refusal), `broken-sentence` (every slot of every sentence group is hidden by the plan or has no line in the write report),
`accent-emphasis` (the kit marks no accent span, or no written heading is one it marks), `created-controls` (no page created),
`plan-links` (no plan link and no end action), `list-rows` (the plan cuts no list), `phone-callable` (the report names no brief
phone), `map-location` (no page prints a map and the demo baseline holds none), `brand-accent` (no brand accent written and no
page reads a brand style), `words-over-picture` (no page prints words over a picture), `unowned-slots` (every slot has an
owner), `alt-matches-picture` (no written picture, decision 28), `empty-video-buttons` (no page read shows a video control,
decision 29), `hidden-page-links` (no page read shows a link, decision 29). Read-back that compared no line, `logo-readable` with no logo read, and a page group with no page read are unmeasured.

A hide the plugin refuses because the contract has no slot for it (`report.noWayOut`, a reason naming issue #369) was sent, so it
is not in `report.unaddressable`, and read-back blamed it on step 9 as a refused slot. `unaddressable-items` now lists it too, on
step 0: the contract ships with the template, and a new contract is a template release. Read-back leaves those failed lines to
that group, so each is blamed once.

### 28. The alt a page prints is held to what step 8 saw in the picture, on the written site

Owner's decision, 2026-11-06. Steps 6 (the writer, who writes the alts) and 8 (the pictures) run in parallel once the plan
passes its check. Step 8 compared each alt with what its looker saw (`altNotes`, ADR 0043 section 3b) only when it was
given the writer's copy file, so in a parallel run the comparison was skipped and nothing said so. Making step 8 wait for
step 6 would keep the check where it was and cost the customer several minutes per site; dropping it lets an alt that
describes another scene (a pool pictured, a tennis court in the alt) reach screen readers and search engines.

The comparison moves to step 11. The site check's `alt-matches-picture` group (`site-check/alt-matches-picture.js`) runs
with the page-read groups, after step 9, given step 8's manifest (`site-pictures/1`, its `seen` sentences). For each
picture the write report says was written, it reads the alt each page showing the slot prints for that file (an `<img>`
naming it, or a `<picture>` one of whose `<source>` tags names it, inside the body) and compares it with the seen sentence
by the same word overlap step 8 uses (`lib/alt-compare.js`, shared by both). No model is called. A disagreeing alt blocks
on that slot with the page, the alt printed, what the picture shows and why they disagree, naming step 6 when the alt is
words the writer wrote in this run, and step 9 when it is not (the template's or the demo's alt, left on the page). A
picture with no seen sentence, painted as a background, printed with an empty alt or not printed at all is listed in
`notMeasured` with its reason and not counted. With no written picture the group is not applicable (decision 27); with
pictures written but none compared, or without the manifest, it is unmeasured, with its reason. Step 8 no longer leaves `altNotes` empty in silence: its
manifest's `altCheck` says `deferred` (to this group) without a copy file, `compared` with one. Sending a finding back to
the writer automatically is not part of this decision.

### 29. A play button with an empty video address is hidden by one CSS rule the kit names

Owner's decision, 2026-11-06. Measured on a bench site with the JA Boxing 1.0.11 kit: the plan hid every video id (no video in
the brief), the write step emptied them, and the four class pages still showed 16 play buttons over the new pictures, each
opening an empty YouTube player. The template's session cards (`html/com_content/article/classes.php`) print `a.video-btn` with
`data-src="https://www.youtube.com/embed/"` plus the id, with no check that the id is set. The block above them prints only with
an id, so decision 11's fallback already covers it; the cards print the picture, so nothing asked about the button.

This is the one exception to decision 2. The button is not a slot: it has no words a search engine reads and nothing the owner
edits, and removing it needs a template release that sites already made would not get. So:

- The kit names, per template, the selector of its play buttons with an empty address (`site.emptyVideoButtons`: `selector`,
  `why`), declared when packaging (`template-kit/cli.mjs video-buttons`). The selector must test the address
  (`[data-src$="/embed/"]`) and hold only plain selector characters (`lib/empty-video-buttons.js`). JA Boxing 1.0.11 is the
  first; another template adds its own when packaged, and `[]` says it has none.
- After the contract call, the write step writes `<selectors>{display:none!important}` between its own markers in the kit's
  head injection block (`write-step/video-buttons-stage.js`), the brand block kept, read back from the module. The rule keys
  on the empty address, so a video filled later shows its button again with nothing to take off. A kit without the field
  sends nothing; the block is written only when it differs.
- The look guard (decision 10) lets that block hold exactly the rule for the kit's selectors (`empty-video-buttons`), and
  judges the rest of the module as before.
- The host answers `videoButtons` per page (shown elements naming a video player's address). `empty-video-buttons` (block)
  fails every shown one whose address names no video: on step 9 when the kit names a rule or the report has its line, on
  step 0 when the kit names none. A host without the measure leaves it unmeasured (decision 18).

**Third use: a link in a kept row that leads to a page the plan hides (card AM).** Owner's decision, 2026-11-06. Measured on a
bench site with the JA Boxing 1.0.11 kit: the plan dropped the demo trainer's profile page (menu item 197, unpublished), and the
coach cards it kept on the home, About and Coaches pages still linked name and photo there (`block-163.8`, `.9`,
`block-178.16`, `.17`, value `index.php?Itemid=197`), so a click answered 404. The plugin empties such a slot only with its row
(`SLOT_NOT_HIDEABLE`). The kit names the containers of such links (`site.hiddenPageLinks`, `template-kit/cli.mjs
hidden-page-links`; JA Boxing 1.0.11 names `.teams-item`), and on a kit that does:

- Before the contract call, each link slot the plan empties whose address is a hidden page's (a page the plan drops, or a menu
  item left unpublished) is given the address of a living page of the plan: the nearest kept page above it (a profile goes to
  the page listing the coaches), else the first kept page that holds the block (`write-step/hidden-page-links-stage.js`). The
  contract call writes that address only when the plugin refuses the empty with `SLOT_NOT_HIDEABLE` (`contract-write.js`), and
  the line is written with the plugin's words and the address, read back like any slot. When the door refuses the address too,
  the line is failed and says both refusals.
- Last of the writes, one rule between its own markers in the head injection block makes a link in those containers whose
  address is still a hidden page's plain text: `pointer-events:none`, `cursor:default`, no underline, the colour around it. The
  rule names hidden pages by their exact addresses (`lib/hidden-page-links.js`), so a link to a living page is never touched; the
  look guard lets that block hold only it (`hidden-page-links`).
- The host's `shownLinks` say whether a link takes a click (`clickable`), and `hidden-page-links` (block, step 9) fails every
  shown link that does and leads to a hidden page. A host without the read leaves it unmeasured.

The plugin also has `template.files.write`, which could put the rule in a T4 template's `local/css/custom.css` (T4 reads it
local first, and a template update keeps `local/`). It was not used: an unlisted file under a locked template root reads as
presentation drift in every later contract call, and the head block is already the write step's door for CSS.


**Fourth use: a block every article prints that a created page must not show (card AT).** Owner's decision, 2026-11-06.
Measured on a bench site with the JA Boxing 1.0.11 kit: the created Privacy page, printed through `ja_boxing:default` (card AN),
ended with three share buttons (Facebook, X, Reddit) no other page of the site shows. The template's article file
(`html/com_content/article/default.php`) prints `div.share-social` hard coded, with no setting to turn it off, and none of the
template's three article files lacks both that bar and the class pages' action bar. Releasing the template, or turning off the
site's share plugin, would take the bar off every article the owner writes later too, so:

- The kit names, per template, the selectors of such blocks (`site.createdPageHide`: `selector`, `why`), declared when
  packaging (`template-kit/cli.mjs created-page-hide`). A selector is one compound selector, as for `selfLinkButtons`
  (`lib/created-page-hide.js`). JA Boxing 1.0.11 names `.share-social`; a kit that names nothing behaves as before.
- After the contract call, the write step writes between its own markers in the head injection block one rule per created
  page's menu item and selector (`body.com_content.view-article.item-244 .share-social{display:none!important}`), from the menu
  item that opens each page it created (its own item, or the category's hidden item on the template's route, whose articles
  are all created pages) (`write-step/created-page-hide-stage.js`). The body classes are T4's, built as for the self link rules.
- The look guard lets that block hold only such rules on the kit's selectors (`created-page-hide`).
- The site check is unchanged: `created-controls` (step 11) turns green once the bar is no longer shown.

**Second use: a "more" button that leads to the page it sits on (card AF).** Owner's decision, 2026-11-06. Measured on a bench
site with the JA Boxing 1.0.11 kit: the Coaches page showed a VIEW MORE button under the coach cards that opens the Coaches page
itself. The template's section chrome (`html/layouts/chromes/t4section.php`) prints `div.bottom-actions` from the module params
`title-btn` and `link-btn`, which no contract slot reaches (issue #369), and module-178 links it to its own menu item. The same
exception applies, with the same shape:

- The kit names, per template, the containers of such buttons (`site.selfLinkButtons`: `container`, `why`), declared when
  packaging (`template-kit/cli.mjs self-link-buttons`). A container is one compound selector, a tag, an id or classes with no
  combinator (`lib/self-link-buttons.js`). JA Boxing 1.0.11 names `.bottom-actions`.
- Last of the writes, after the route stage, the write step writes between its own markers in the head injection block one rule
  per kept page, menu item opening it, container and own address
  (`body.com_content.view-category.item-195 .bottom-actions a[href="/about-us/coaches"]{display:none!important}`, with
  `/index.php/...`, `index.php?Itemid=195` and `/index.php?Itemid=195`), from the kept pages at the address they answer now and
  the menu rows read then (`write-step/self-link-buttons-stage.js`). The body classes are T4's (option, view, menu item id); the
  view keeps the rule off an article opened under the same item, and a row whose view cannot be read gets no rule. Each rule
  names the page's own addresses exactly, so a link to another page is never hidden.
- The look guard lets that block hold only such rules on the kit's containers (`self-link-buttons`).
- The host's `selfLinks` carry `holders` (the elements around the link, nearest first). `self-links` blames step 9 for a shown
  button to its own page inside a container the kit names, and decides the owner as before otherwise (step 0 when no slot
  holds it).

### 30. A model may decide repairs in step 9, within closed orders, and only code writes; the second bounded CSS exception

Owner's decision, 2026-11-06 (spec #418, tickets #420 and #421). Decision 1 and the context above say step 9 writes with no
model. That holds for the write itself. After it, the finisher looks at the written site and repairs the customer-visible
faults of a closed list, and three model calls take part in it: a finder names faults on page screenshots, a fixer turns one
fault into one repair order, a checker compares the repaired block before and after. So:

- A model may DECIDE a repair inside step 9, never WRITE one. The fixer only answers with a typed order of a closed list
  (`write-step/finisher/repair-orders.js`); code checks the order against the kit, the fault it answers and what the site holds
  now, and only a valid order is written, through the doors the write step already uses, under the finisher's own apply id.
  An order of an unlisted kind, for a fault its kind does not answer, or for a slot or block the fault is not about, is
  dropped with its reason in the repair log and writes nothing. A repair the checker does not find better is undone.
- Repairs never invent a fact, never hide customer content, never change meaning, never edit template or plugin code.
- The fixer picks, it never guesses (2026-11-06, after a real run dropped 20 of 25 orders on guessed addresses). Each fault
  goes to it with a repair menu code builds from the kit and the page as served (`write-step/finisher/repair-menu.js`): the
  page's kit blocks, each slot with the words it holds, each picture frame with the slot of its alt, whether a style order may
  name the block, and the CSS targets inside it as served (tag and classes, so a heading printed as `<span class="h2">` is
  `span.h2`, never `h2`). An order that names anything off the menu is refused, and the fixer is asked once more with the
  order and the reason.
- Glued heading words at a hidden line break ("WHAT WECOACH") are repaired by code, with no model: the missing space goes
  before the break marker, every word and code kept (a slot stored as HTML takes the codes the writer ordered, then its tags
  again); code judges it on the served page (2026-11-06, after a real run lost 11 of 11 such orders to a fixer that dropped
  the break). A site check failure is confirmed by reading the page the way the check reads it (a hidden break glues the
  words, capitals set aside), so the same words are judged the same.
- Who judges a repair (2026-11-06, after a real run where the checker kept two spacing rules that changed nothing): every
  repair whose result code can read from the served page (fixed text, a glued heading's space, an alt, a link, a page title or
  description, an accent mark, a demo item) is judged by code on that page, never by the checker model. Only a style is judged
  by the checker, at high effort; a style aimed at glued words is kept only when the served page reads the words apart too.
- A fault's menu holds only the blocks whose words hold the words the fault quotes (all of the page's blocks when none does),
  so an order on another block is refused and asked again.
- The finisher's contract applies carry `contract-finisher-<hash>` apply ids: the site's contract door takes only `contract-`
  ids, and the id still names whose repair it is.
- A value the brief gives (a phone, an e-mail, a name, an address) is the customer's own: a demo fault on it is logged
  `not-demo`, never repaired. Pages compare as addresses: `/index.php/x`, `/x/` and `/x` are one page.
- Each role thinks at its own reasoning effort, set per door in /ops › Model & AI; a door with none set takes its role's
  default, the product owner's choice of 2026-11-06: finder max, fixer medium, checker high (low until a real run, see above). DeepSeek takes only low, high
  and max, so the fixer runs at high, the nearest level; an effort the door's model does not take refuses the run with the
  levels it does take (`lib/bench-harness.js` `MODEL_EFFORTS`).
- Pages run as a pipeline: each page is found, merged with the first check's failures on it, repaired and judged as soon
  as its own shots are in. Round two only retries the repairs the checker rejected (and a same-place fault that waited, while
  no limit is reached); it never shoots a page whole again or asks the finder again. A place two pages share is written once.
- Hard limits (#424), and their honest worst case. Time: one deadline at 8 minutes; new work stops at 6, the last 2 are kept
  for the final site check; a model call open at 6 minutes is let go; every site or host call is let go after 60 seconds or at
  the deadline. So the finisher answers by 8 minutes whatever a host or a model does; a final check that cannot end by then
  leaves the first check on the build, and the repair log says so. A call let go may still run on the host or at the provider.
  Cost: a model call reserves its estimated cost (the dearest call of its stage so far, else 0.05 USD for the finder and the
  checker, 0.02 for the fixer) and is not started when the spend and the reservations would pass 1.5 USD; at most 8 are open
  at once; a call let go is counted at its estimate. The run passes 1.5 USD only by what the open calls cost over their
  estimates: on DeepSeek Flash a call is capped by its output limit (131072 tokens, about 0.16 USD, plus its input), so the
  bound is under 3 USD, and a normal call costs about a cent. A finisher that throws leaves the written site and its first
  check; the build logs why.

**The second CSS exception: "style one block".** Unreadable text (text over a picture, text the colour of its ground) and a
broken layout (a long word running out of its box) often have no repair in the words. The fixer may order a style for one
kit block, and code accepts only a closed allow list (`lib/finisher-style-allow-list.js`): text colour, a backing layer
behind text (a colour or a gradient, never a picture), text shadow, font size, line height, spacing (padding, margins, letter
and word spacing) and the wrapping of long words. Any declaration that can take content off the page is refused:
display none, visibility hidden, a position, transform, offset or indent that moves it off screen, zero height or max-height,
a transparent text colour, a font size or line height too small to read, a value that loads a picture or reads another value,
a text colour too close to the backing colour the same rule sets (both colours known and opaque, a WCAG contrast under 3:1,
`lib/finisher-style-colours.js`), a padding, margin, letter or word spacing over 64px, 4em or 4rem (25% for padding and
margins), and a negative margin, letter or word spacing. `opacity` is refused entirely, whatever its value: the spec bans only
zero opacity, and this is stricter on purpose, since a faded text is a hidden text by degrees and no fault on the list is
repaired by fading. One refused declaration refuses the whole order; nothing is written, and the refusal is logged.

- The rule is written like the video button rule (decision 29): between its own markers
  (`<!-- tracy-finisher-style:start -->`) in the kit's head injection block, read back from the module first, every other
  byte kept, through `content.update` on that module (`write-step/finisher/style-write.js`). No new plugin door.
- One rule per block, on its own line behind a comment naming the block, scoped to the block's element by its module id
  (`#Mod<N>`, or `#acm-<name>-<N>` for an ACM block printed without that wrapper, the shapes the template kit measures), with a
  target inside the block of tags, classes or ids only. A rule names no words, so a later edit of the block's content leaves it
  in place. A template whose blocks carry neither shape is not reached; such a rule draws nothing, and the checker says so.
- The undo takes off only that block's rule (or puts back the rule the block held before), by reading the module again, never
  by reverting the module's apply id, which would take back a later repair in the same module too.
- The look guard (decision 10) lets that block hold only rules the allow list would write, one per block (`finisher-style`).
- The site agent reads the block like any module content, and a customer may ask it to remove a rule: the line says what added
  it and that deleting the line takes it off.

"Hide is never CSS" (decision 2) stays, and the refusals above make it true: nothing the allow list writes can take content
off the page. WordPress (Additional CSS)
and EmDash (a style file and a rebuild) get their own style doors when the finisher joins the live build.

## Consequences

- A plugin release carrying the kit's contract comes first (1.0.10 for the first kit). It is small and separate from the plugin changes in
  decision 2, so the picture step can be reviewed on a real site before hiding works.
- The site used for that early review still shows demo content in slots that are not hidden yet.
- Alt text stays open: only gallery modules and two articles have alt slots, and how the template prints alt for the
  other pictures must be measured on a site. If it needs a template change, it becomes its own ticket.
- A per-page share image needs the Joomla Open Graph plugin on, untested on this release. The site-wide image is the
  fallback.
- A failed slot is written around rather than stopping the run. That does not hide it, since step 11 fails on it.
- Since decision 26 a look guard finding no longer protects the site before the write: a value that changes the template's
  look reaches the site, and the site is held back by step 11 instead. The trial bench writes only to sites it created.
