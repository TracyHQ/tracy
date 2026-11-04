# 0042. Site writer trial bench: the site-copy/1 contract and the copy check

Status: (binding) for the copy file shape and the check; the bench itself follows in #326.

Builds on [ADR 0041](0041-site-planner-trial-bench-in-ops.md) (the site planner bench and its plan checker).
Amended: footer column headings are ordinary writer slots, a new `pages` key carries the pages that have no kit
slots, and W11 only notes a long dash in a planner label (contract gaps found while drafting the writer prompt;
version strings unchanged because nothing shipped yet).
Amended again: W06 exempts runs wholly inside a brief fact value; the checker version moved to `site-copy-check/2`
because bench runs scored by `/1` exist.
Amended a third time: the main menu dropdowns (section 1, "Main menu dropdowns"); W02 requires the dropdown slots
and fails a slot the plan words differently in two places; the checker version moved to `site-copy-check/3`.
Amended a fourth time (#334): the writer prompt is locked. The owner approved its output after the first real run on
dev; `apps/tracy-web/src/site-writer/writer-prompt.md` has sha256
`bd4a4f3a1087a109496251b3e971d064775d9730fb16b657744d204a92f987c5`, pinned by `test/site-writer-prompt.test.mjs`.
Changing a byte of it needs the owner's approval and a new hash here. Fix round answers are read as in section 5.
Amended a fifth time (2026-11-04, owner's ruling): a plan label is a suggestion the writer keeps or rewrites
(section 7), a created page's title is its on-page heading, never a browser title (section 8), and a created privacy
page is a complete policy (section 9). The prompt gained these rules; its sha256 is now
`925896a07c9d7ebacb483305fd4fbe7bf725391d3f426318209cf80d2ec30380`. The checker version moved to `site-copy-check/5`.
Spec: #326. This ADR is the part that stands alone and is frozen first: the file the writer produces, and the
script that grades it.

## Context

The site planner (step 3) decides every page, block, slot and picture and states, in note form, what each slot must
get across. It writes no final sentence. The writer (step 6) turns that plan into the words a visitor reads, and the
copy check (step 7) grades them. Earlier writers failed in known ways: code overwrote the author's text, only a
ceiling on length was checked, labels were cut at a word boundary, sentences describing the page reached the site,
and the same sentence repeated across pages built from one block layout. This ADR fixes the contract and the checks
that stop those failures.

## Decisions

### 1. The copy file is `site-copy/1`

One JSON object, English keys, plain text only (no HTML; markup is the write step's job, read from the kit).

| Key | Content |
|---|---|
| `version` | `"site-copy/1"` |
| `fingerprint` | `{ kit, planSha256, briefSha256, promptSha256 }`: the kit id and three 64 character hex hashes. A later step refuses copy written for a different plan. The check does not recompute them. |
| `slots` | `[{ slot, owner, text, factIds }]`, one entry per kept text slot, keyed by kit slot id. `owner` is `writer` or `plan-label`. `text` is a string, or a non-empty list of strings when the kit shows several paragraphs or bullets. `factIds` lists the brief facts the text rests on (may be empty). |
| `alts` | `[{ frame, text }]`, one per planned picture frame, written from the plan's picture wish. |
| `seo` | `[{ page, title, description }]`, one per kept page, including the page the plan creates for the privacy notice. The home entry also covers the two slots the brand step hands over (document title and meta description). |
| `pages` | `[{ page, title, body }]`, one per page that has no kit slots: every plan legal page with `use: "create"` (keyed by its plan `id`, e.g. `legal:privacy`) and one entry keyed `notFound`. `title` is a string, `body` a non-empty list of paragraph strings. |
| `notebook` | `[{ page, points[], openings[], calls[], phrases[] }]`, the copy notebook. |
| `returns` | `[{ slot?, page?, reason }]`, at least one of `slot` and `page`, the returns to planner. |

Footer column headings are not labels. The plan decides them in `site.footerMenu[].{group, heading:{says, page}}`
(never in `copy`), and the kit's `site.navigationGroups[]` entry with the same `id` names the kit slot in
`titleSlot` (its `heading` is the demo text). The writer writes each heading in `slots` under that `titleSlot` id
with `owner: "writer"`, and the check expects it like any slot of the plan. The created legal page and the 404
page have no kit slots at all, so their words live in `pages`; the created legal page also keeps its `seo` entry,
`notFound` has none.

Not in the file: hidden slots, link targets, label propagation to other menus and URL slots. The plan and the kit
already hold them. Label slots (the plan gives them `text`) keep the plan's words as `owner: "plan-label"` unless the
writer rewrote them, which is `owner: "writer"` with `replacedPlanLabel` (section 7); every other slot has
`owner: "writer"`. Every slot has exactly one owner.

**Main menu dropdowns.** The kit's header block names only the top-level menu items, and the kit has no menu tree.
The tree lives in the template's content map (`content-map.json` beside `template-kit.json` in the contract folder,
the file step 9 writes into): `entities[]` of kind `menuItem`, each with `identity.menutype` and `identity.path`. The
main menu is the menu type of the top-level labels the kit's header block shows; an item's parent is the item whose
path is its path minus the last segment. Plan pages map to menu items through the kit's `pages[].path`
(`/about-us/our-trainers` opens the item with path `about-us/our-trainers`). Code (`site-writer/main-menu.js`) then
decides:

- an item under a kept top-level item (its label slot is in a kept block decision, not hidden), whose parent is
  shown and whose page the plan's `mainMenu[]` keeps as a child of that top-level item, is shown. When no kept block
  already labels it, it is a writer slot (`menuItem-<n>.0`, `owner: "writer"`, role menu label), with the kit's own
  `maxCharacters` for that slot, else the parent top-level slot's, and the plan child's `intent` as its note. When a
  kept block labels it already, that one label stands: it is not asked twice.
- every other main menu item (children the plan does not keep, items under a hidden item, every item under a hidden
  top-level item, and the hidden top-level items themselves) is hidden.
- a plan child whose page the kit does not know, or that opens no main menu item under its parent, is a problem
  returned to the planner (a note on W02), never guessed.

The hidden menu items are **not in the copy file**: they are not words, the writer does not own them, and code
derives them from the plan and the content map every time. The contract mapping export (`contract-mapping.js`)
carries them for step 9 in `extras.mainMenu.hide` (`{ item, slot, path, why }`), beside the whole menu with each
item's final label; the dropdown labels themselves are ordinary slots in `mapping.changes`. A run stores the sha256
of the content map it read in its frozen `kit` (`contentMapSha256`, null when the contract has none) and stops with
`SITE_WRITER_CONTENT_MAP_CHANGED` when the file changed.

### 2. The copy notebook

Per page: the main points made, the opening lines, the calls to action and the notable phrases used. The writer
fills it as it goes. Later pages are written from the notebook, not from the full text of earlier pages, so a large
site stays fast and does not repeat itself. An interrupted run continues from it. The check only validates its shape.

### 3. Returns to planner

A slot or page the writer cannot write truthfully from the plan's facts goes into `returns` with the reason. The
writer never changes the plan (adds, drops or moves slots, pages or blocks). A returned slot may be absent from
`slots` without failing W02. Returns are listed for the owner; nothing is sent back to the planner automatically.

### 4. The copy check is `site-copy-check/3`

A pure module, `checkCopy({ copy, plan, kit, brief, contentMap })` (`contentMap` optional: without it no dropdown
slot is derived), in `apps/tracy-web/src/site-writer/copy-check/`. Same
calling shape and result shape as the plan checker: `{ meta, inputErrors, summary, rules: [{ id, title, status:
pass|fail|skip, cause, causes, failures: [{ where, detail, cause }], notes }] }`. `failureListText(result)` gives one
line per failure, `<rule id> | <title> | <where> | <detail>`, which is what a fix round sends back. It never throws:
a malformed copy file is reported under W01, and the rules run on the entries that are valid. The result is the same
on every run. Bump `CHECKER_VERSION` on any change to a rule, a threshold, a failure text or the result shape.

| Rule | Fails when |
|---|---|
| W01 | the file does not match section 1 (including the `pages` entries) |
| W02 | a kept slot is missing (and not returned) or written twice; a hidden slot has text; a slot is unknown to the plan; a label differs from the plan's words; the owner does not match (label or not); a `pages` entry is missing (and not returned), written twice or unknown to the plan; the plan gives one slot different text in two places (two labels, or a label and a writer slot) |
| W03 | text is empty, over the limit, under the floor, or has more paragraphs than the kit allows; a `pages` title is over 60 characters or empty, or a `pages` paragraph is empty |
| W04 | a number, time, price, phone, email or link is not in the facts the slot cites (a `pages` text cites no fact: see W04 details) |
| W05 | a quoted review passage is not an exact passage of a review in the brief |
| W06 | a sentence equals or nearly equals another sentence on the site |
| W07 | a demo sentence or a demo proper name is left in the copy |
| W08 | a phrase from the voice avoid list, the forbidden list or the brief's missing list appears |
| W09 | an alt, a page title or a page description is missing or too long, or two titles are equal (the created legal page needs a `seo` entry, `notFound` needs none) |
| W10 | a sentence describes the page or section itself |
| W11 | a long dash appears in writer text (in a planner label it is only a note) |

Thresholds and decisions (named constants in the code):

- **W03 limit.** The kit and the plan give a character limit; the smaller applies. For a slot with several
  paragraphs the limit applies to the total of all items joined with one space. **Floor:** 60% of the demo text
  length (`FLOOR_RATIO`), only when the demo text is longer than 40 characters (`FLOOR_DEMO_MIN`), never above the
  limit. Paragraph count allowed: the larger of the kit's `paragraphs` and `bullets`, at least 1.
- **Footer heading limits.** The limit is the kit slot's `maxCharacters` (the smaller of it and the plan's, as for
  any slot). When the kit lists no limit for the `titleSlot`, the fallback is `HEADING_LIMIT_FACTOR` (2) times the
  demo heading length, at least `HEADING_LIMIT_MIN` (20) characters.
- **Pages entries.** W03: title at most `PAGE_TITLE_MAX` (60) characters and not empty, every body paragraph not
  empty, no demo floor (there is no demo text). W04 reads them like alt text: details must exist in some fact of
  the brief. W06 compares body paragraphs with the rest of the site (titles excluded). W07, W08, W10 and W11 read
  title and body.
- **W04 details.** Extracted from the text: emails, links (`http(s)://` or `www.`), phone numbers (7 or more digits
  with `+ ( ) . - space`), times (`06:00`, `6.30 pm`, `6pm`) and every other digit-bearing number. Each must appear,
  whitespace and case normalised, as a whole token in the values of the facts the slot cites; phones compare by
  digits only. The cited facts are the plan's `factIds` for the slot plus the writer's own; an unknown fact id fails.
  Alt text, titles and descriptions cite no fact, so their details must exist in some fact of the brief. Number
  words ("two coaches") are not extracted.
- **W05 quoted passage.** Text between double quote marks (`"..."`, curly, or guillemets) in a slot that is under a
  reviews or testimonial block, or whose plan `says` mentions a quote, review or testimonial. After collapsing
  whitespace, unifying apostrophes and trimming end punctuation, it must be a substring of a review text. Reviews
  come from `brief.reviews[]` and from facts whose field names a review. A paraphrase without quote marks is not
  checked.
- **W06 near-duplicate.** Sentences (split at `. ! ?` and line breaks) are compared as lowercase words with
  punctuation stripped. Two sentences are near-duplicates when they share a run of 5 consecutive words
  (`RUN_WORDS`), or are equal with at least 3 words. Compared across the whole site: writer slots and page
  descriptions. Alt text, titles and label slots are excluded (alts and titles repeat the business name on purpose;
  labels are the planner's words). The later place is reported and names the earlier one.
  A shared run or an equal sentence that lies wholly inside the normalised value of any brief fact (phone, address,
  opening hours, name) is not a repeat, so fact values may appear wherever they are needed (`site-copy-check/2`).
- **W07 demo leftovers.** Demo sentences are the kit slot samples, split into sentences of at least 3 words.
  Demo proper names are the template name, the logo and title name samples in `site.nameSlots`, and the samples of
  `person.name` slots. A name is matched as a whole phrase, case-insensitive, in every written text.
- **W08 phrases.** Whole phrase, case-insensitive, over every written text: `site.voice.avoid[]`,
  `site.forbidden[].what` and the `withheld[].values` of the brief's `missing`. Ideas without a phrase ("prices") are
  covered by W04.
- **W09 lengths.** Alt at most 125 characters, title at most 60, description at most 160. Titles are compared
  case-insensitively.
- **W10 patterns.** Case-insensitive: "this section/page/block/row/card/banner/layout/template", "here you will/can
  find", "shows the shape of", "made to show", "section/block/page above/below", "demo text/content", "lorem
  ipsum". The list is in `rules-bans.js`.
- **W11.** U+2014 and U+2013, in any written text. In a `plan-label` slot the writer cannot fix it, so it is
  reported as a note on W11 ("planner label, return to planner"), not a failure. The same holds for any rule the
  writer cannot fix: labels never fail W04 to W10.
- Emoji use is left to the owner's eye, not a rule.

### 5. Code never edits writer text

The check only reports. In a fix round the failing slots go back to the same writer with the measured numbers
(length against limit, which sentence repeats where) and only those slots are rewritten. At most **2 fix rounds**.
A slot still failing after that keeps the writer's own text and is shown in red. Code never deletes or rewrites it.

A fix round answer is read as corrected entries whenever it holds no `notebook` (only a whole writing turn writes
one), even when it repeats `version` and `fingerprint` (code's own, ignored): the first run on dev lost its whole copy
when a fix answer repeated them and was read as a whole file. A fix answer may also hold `returns`: each entry
withdraws the writer's own text for that slot or pages entry. A slot the plan keeps becomes a return; a slot the plan
does not keep (written by mistake, W02 unknown) only leaves the copy, which is the one way a fix round can clear it.
A return of a label slot is rejected, since code writes labels.

### 6. Bench run loop in lib/

The writer bench reuses the planner bench's run loop instead of forking it (#327). The loop, the round, the change
list machinery, the store and the run files live in `apps/tracy-web/src/lib/` (`bench-run-loop.js`,
`bench-run-round.js`, `bench-changes.js`, `bench-change-edits.js`, `bench-change-size.js`, `bench-answer.js`,
`bench-run-store.js`, `bench-run-read.js`, `bench-turn-store.js`, `bench-export.js`, `provider-balance.js`). A
step is a plain object: queue name and error code prefix, store, fix round limit, prompt `{ text, sha256 }`, checker
`{ version, check, failureListText }`, change rules (part kinds, removable kinds, sections, where the parts are, the
document's noun) with their messages, the input preparation hook and the agent request hook. The planner is
`SITE_PLANNER_STEP` in `site-planner/bench-worker.js`, and runs exactly as before.

**Store: each step gets its own three tables, with the planner's shape.** The store takes the table names and the
name of the round column that holds the document (`plan` for the planner). The planner's tables and rows stay as
they are, with no migration. A shared table with a step column was rejected: it would have to rename or widen
`site_planner_*` and its constraints (rounds 0 to 2, the frozen input trigger, the one active run index), and two
steps would then block each other through one active run index. The state words of rounds and runs (`planning`,
`checked`, `not_a_plan`; steps `waiting`, `planning`, `fixing`, `checking`, `done`) are part of the shape and are
reused as they are. Starting a run (its insert) stays the step's own, since each step is started on different
inputs.

### 7. A plan label is a suggestion (2026-11-04)

The writer used to skip label slots and code copied the planner's words in unchanged. On one example site 27 of 159
text slots were labels and 26 were fine; the one that was not was a page masthead whose kit slot the kit grouped into
a stat row (demo "Our Classes", limit 18, role `editorial.menu_label`), so the planner wrote half of a stat
("Coaching for") and the template printed it alone as the page's big heading.

- The writer reads every label slot (`plan-labels.js`, the fixed part's "Label slots" list): the planner's label
  (`planLabel`), the plan's `says`, and from the kit the demo `sample`, `role`, `maxCharacters` and where it
  `prints` (its block and block role, the menus and page titles it also changes, a content map menu item).
- It keeps the label when it fits (menus, buttons) by leaving the slot out, and rewrites it when the sample shows
  the slot is something else, such as a heading that must stand alone.
- Code records what happened, in a whole answer and in a fix round alike: a text equal to the label (spaces aside)
  or a left out slot is `owner: "plan-label"` with the plan's words; any other text is `owner: "writer"` with
  `replacedPlanLabel` set to the label it replaced. W02 fails a writer entry on a label slot without that trace, and
  a trace on a slot the plan gives no label. A rewritten label is the writer's text, so W03 to W12 judge it.
- A return of a label slot stays rejected: to give the plan's words back, the writer writes them as the text.
- The site check's `unfinished-heading` (ADR 0044) is blamed on step 6 (copy), whoever's words the heading holds,
  since the writer now owns the final text of every slot.

### 8. A created page's title is its heading on the page (2026-11-04)

A writer wrote the created privacy page's `pages[].title` in browser title style (the page name, " | ", the business
name), and the write step printed it as that page's main heading. The owner ruled that the browser title is never
printed on the page as a heading.

- `pages[].title` (a created legal page, `notFound`) is the heading printed on that page: short, no " | " separator,
  no business name added. The browser title stays in `seo[]`. The prompt says so.
- **W13** fails a `pages` title that holds " | " or ends with the business name (a brief fact whose field is `name`
  or `business.name`), unless the title is the name alone.
- The write step (`page-create-stage.js`) writes the heading to the article title, the menu item title and the item's
  `page_heading` param; `page_title` (Joomla's browser title) keeps the seo title. The look guard allows
  `page_heading` on a created page's item only. A kept page's menu item is not changed here.
- The site check's `heading-separator` measure stays as it is, blamed on step 6.

### 9. A created privacy page is a complete policy (2026-11-04)

The plan's line for a created privacy page said the site collects no personal data itself, and the writer retold it
in two sentences. A customer expects a policy for the kind of business it is. The planner prompt is locked, so the
plan's `says` stays one input and the writer does the rest.

- The prompt asks for a policy built from the brief facts (what the business is, who its customers are, how they
  reach it, whether it has forms) covering what is collected and when, photos and videos only with consent (children
  named when the business serves them), sharing with third parties, how long data is kept, the customer's rights and
  how to get in touch. Policy promises are not business facts; facts (addresses, named officers, laws) are still never
  invented. The `body[]` shape is unchanged: the write step prints each item as one paragraph, so a section opens with
  a short heading sentence.
- **W14**, only when the plan creates a privacy page (`site.legalPages[]` with `kind: "privacy"`, `use: "create"`):
  fails a body under 5 paragraphs, or one that names fewer than 4 of six themes by keyword (collect or data; photo,
  video or image; share or third party; retain, keep or retention; right, request or delete; contact). No site check
  measure is added.

## Consequences

- The writer bench (#326) and the future write step read one stable file shape.
- Every threshold above is a named constant; changing one is a deliberate new checker version.
- Judgement items (is the prose good, are emojis fine) stay with the owner reading real output.
