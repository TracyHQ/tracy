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
replaces. A finding names the step at fault; since decision 26 the value is written all the same and step 11 blocks on it. An exception states its reason in the guard, such
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
