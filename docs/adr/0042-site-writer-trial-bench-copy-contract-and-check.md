# 0042. Site writer trial bench: the site-copy/1 contract and the copy check

Status: (binding) for the copy file shape and the check; the bench itself follows in #326.

Builds on [ADR 0041](0041-site-planner-trial-bench-in-ops.md) (the site planner bench and its plan checker).
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
| `notebook` | `[{ page, points[], openings[], calls[], phrases[] }]`, the copy notebook. |
| `returns` | `[{ slot?, page?, reason }]`, at least one of `slot` and `page`, the returns to planner. |

Not in the file: hidden slots, link targets, label propagation to other menus and URL slots. The plan and the kit
already hold them. Label slots (the plan gives them `text`) are filled by code from the plan and carry
`owner: "plan-label"`; every other slot has `owner: "writer"`. Every slot has exactly one owner.

### 2. The copy notebook

Per page: the main points made, the opening lines, the calls to action and the notable phrases used. The writer
fills it as it goes. Later pages are written from the notebook, not from the full text of earlier pages, so a large
site stays fast and does not repeat itself. An interrupted run continues from it. The check only validates its shape.

### 3. Returns to planner

A slot or page the writer cannot write truthfully from the plan's facts goes into `returns` with the reason. The
writer never changes the plan (adds, drops or moves slots, pages or blocks). A returned slot may be absent from
`slots` without failing W02. Returns are listed for the owner; nothing is sent back to the planner automatically.

### 4. The copy check is `site-copy-check/1`

A pure module, `checkCopy({ copy, plan, kit, brief })`, in `apps/tracy-web/src/site-writer/copy-check/`. Same
calling shape and result shape as the plan checker: `{ meta, inputErrors, summary, rules: [{ id, title, status:
pass|fail|skip, cause, causes, failures: [{ where, detail, cause }], notes }] }`. `failureListText(result)` gives one
line per failure, `<rule id> | <title> | <where> | <detail>`, which is what a fix round sends back. It never throws:
a malformed copy file is reported under W01, and the rules run on the entries that are valid. The result is the same
on every run. Bump `CHECKER_VERSION` on any change to a rule, a threshold, a failure text or the result shape.

| Rule | Fails when |
|---|---|
| W01 | the file does not match section 1 |
| W02 | a kept slot is missing (and not returned) or written twice; a hidden slot has text; a slot is unknown to the plan; a label differs from the plan's words; the owner does not match (label or not) |
| W03 | text is empty, over the limit, under the floor, or has more paragraphs than the kit allows |
| W04 | a number, time, price, phone, email or link is not in the facts the slot cites |
| W05 | a quoted review passage is not an exact passage of a review in the brief |
| W06 | a sentence equals or nearly equals another sentence on the site |
| W07 | a demo sentence or a demo proper name is left in the copy |
| W08 | a phrase from the voice avoid list, the forbidden list or the brief's missing list appears |
| W09 | an alt, a page title or a page description is missing or too long, or two titles are equal |
| W10 | a sentence describes the page or section itself |
| W11 | a long dash appears |

Thresholds and decisions (named constants in the code):

- **W03 limit.** The kit and the plan give a character limit; the smaller applies. For a slot with several
  paragraphs the limit applies to the total of all items joined with one space. **Floor:** 60% of the demo text
  length (`FLOOR_RATIO`), only when the demo text is longer than 40 characters (`FLOOR_DEMO_MIN`), never above the
  limit. Paragraph count allowed: the larger of the kit's `paragraphs` and `bullets`, at least 1.
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
- **W11.** U+2014 and U+2013, in any text including labels.
- Emoji use is left to the owner's eye, not a rule.

### 5. Code never edits writer text

The check only reports. In a fix round the failing slots go back to the same writer with the measured numbers
(length against limit, which sentence repeats where) and only those slots are rewritten. At most **2 fix rounds**.
A slot still failing after that keeps the writer's own text and is shown in red. Code never deletes or rewrites it.

## Consequences

- The writer bench (#326) and the future write step read one stable file shape.
- Every threshold above is a named constant; changing one is a deliberate `site-copy-check/2`.
- Judgement items (is the prose good, are emojis fine) stay with the owner reading real output.
