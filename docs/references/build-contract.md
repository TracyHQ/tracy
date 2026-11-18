---
description: Format of Contract B, what the build engine and the chat exchange (build plan, progress events, outcome, questions and answers, plan edits, change requests and plan revisions), and the contract check that validates it in CI.
sources:
  - packages/wo/website-opportunities/domain/build-contract.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-parts.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-rows.mjs
  - packages/wo/website-opportunities/domain/build-contract-shapes.mjs
  - packages/wo/website-opportunities/domain/build-contract-scenario-runs.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-edit.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-request.mjs
  - packages/wo/website-opportunities/domain/build-contract-questions.mjs
  - packages/wo/website-opportunities/domain/build-contract-run.mjs
  - scripts/build-contract/check.mjs
  - docs/adr/0046-the-model-sees-one-cms-neutral-site-form.md
  - docs/adr/0047-a-failing-build-step-stops-and-reports.md
---

# Contract B: build plan, progress, outcome, questions, plan edits and change requests

Contract B (#575) is what the build engine and the chat exchange when a site is built from an AI quickstart
([ADR 0045](../adr/0045-sites-are-built-from-an-ai-quickstart-not-from-the-demo.md)). The chat renders only from these
documents and never reads engine internals. Contract A, the declarations an AI quickstart carries, is
[`ai-quickstart-contract.md`](ai-quickstart-contract.md).

| Document | `schema` | Sent by | Says |
|---|---|---|---|
| Question | `tracy-build-question/v1` | engine | one thing the customer must decide, with choices shown as buttons and a free text answer |
| Answer | `tracy-build-answer/v1` | chat | the customer's choice, free text, or a skip |
| Build plan | `tracy-build-plan/v1` | engine | everything the customer approves before anything is written |
| Plan edit | `tracy-build-plan-edit/v1` | chat | a change to one or more plan fields; the partial re-run consumes it |
| Change request | `tracy-build-plan-request/v1` | chat | what the customer wants changed on the plan, in their own words |
| Plan revision | `tracy-build-plan-revision/v1` | engine | what a change request changed, and what could not be done and why |
| Progress event | `tracy-build-progress/v1` | engine | a snapshot of the run's steps while it runs |
| Outcome | `tracy-build-outcome/v1` | engine | how the run ended: `done` or `stopped` |

A **build scenario** (`tracy-build-scenario/v1`, file name `*.build-scenario.json`) bundles one customer's exchange in
order, so the check can also hold each answer to its question, each edit to its plan and each run to its plan
revision. The sample scenarios the chat mock renders from are
[`packages/wo/website-opportunities/test/fixtures/build-contract/`](../../packages/wo/website-opportunities/test/fixtures/build-contract/):
an invented tennis club whose build finishes and is then edited, and the same club whose build stops. The snippets
below are excerpts of them.

Data kinds are the roles of `place-content-roles/3` and block types are `BLOCK_TYPES`, as in Contract A.

**Every object is a closed shape**: it accepts only the fields listed for it in [Closed shapes](#closed-shapes), and any
other key is reported, whatever its name or case. Short texts have a length limit, counted by code point (one emoji
counts once), listed in [Text limits](#text-limits).

## Build scenario

```json
{
  "schema": "tracy-build-scenario/v1",
  "name": "sunrise-tennis-club",
  "summary": "An invented tennis club: ...",
  "questions": [],
  "answers": [],
  "plan": {},
  "edits": [],
  "runs": [{ "events": [], "outcome": {} }]
}
```

- `name` is required; `summary` is an optional note for people reading the sample. `questions`, `answers`, `edits`
  and `runs` are optional lists, `plan` is required.
- A question id appears once, and **a question is answered once**; every answer names a question asked.
- `edits` apply in order, each to the plan revision the previous one produced.
- Each entry of `runs` holds its progress `events`, its `outcome`, or both. Every document of a run names the scenario's
  plan, the same `run` and the same `planRevision`.

## Question and answer

```json
{
  "schema": "tracy-build-question/v1",
  "id": "phone",
  "topic": "fact-conflict",
  "fact": "contact.phone",
  "prompt": "Two sources show different phone numbers. Which is correct?",
  "choices": [
    { "id": "website", "label": "04 000 0000", "detail": "From your website", "recommended": true },
    { "id": "maps", "label": "04 000 0009", "detail": "From Google Maps" }
  ],
  "freeText": { "maxLength": 1000, "placeholder": "Type the correct number" }
}
```

- `topic` is `main-button`, `contact-method`, `site-language` (the three agreed cases of spec #577), `fact-conflict`
  (facts that disagree between sources), `site-name` (research keeps the business name off the site and nothing
  neutral names it: the customer types a name the site may show) or `place-choice` (the customer's Google link matches
  more than one place, and research asks which one is theirs before it reads anything) or `business-trade` (research
  could name no trade for the business, so no template list could be offered: the customer says what kind of business
  it is) or `brief-gap` (a business known only by the customer's words: what its content brief still misses, read from
  the brief's readiness, `brief-gap-questions.mjs`) or `held-hours` (opening hours the content brief holds until the
  customer confirms them, `held-hours-question.mjs`); a `fact-conflict` names its `fact`, a fact role.
- `choices` has at least one entry, except on a `site-name` question, whose `choices` is an empty list: the name is
  the customer's own words, and a choice could show the held name, so a `site-name` question with a choice is
  rejected. At most one choice is `recommended` (`true` or `false`). `freeText.maxLength` is
  required: every question accepts a free text answer. `freeText.placeholder` is optional, a short text.
  `skippable: true` lets the customer skip it.
- An answer is `{schema, question, choice}`, `{schema, question, text}` or `{schema, question, skipped: true}`, exactly
  one of the three. It is valid only against its question: the choice is one of its choices, the text is not empty,
  holds no control character (line breaks included) and at most `maxLength` characters counted by code point, and only
  a skippable question is skipped.
- A free text answer to a `main-button` or `fact-conflict` question is an owner statement, never a field value: the
  plan step never holds it to a template field's limit and never writes it into a field, it reaches the page writer as
  an owner fact tied to its question (with the conflict's candidate values), and a conflict answered that way stays
  open. A text that is exactly an offered choice (label, id or code, equal after trimming and case folding) is that
  choice. Their `freeText.maxLength` is not capped by the template; only the offered choices fit its fields.
- Every question but `site-name` takes a typed answer of up to 1000 characters (`TYPED_ANSWER_MAX_LENGTH`, the same
  bound as a written change request): a transport bound only, never the size of a field. A `site-name` answer is
  pasted into the name fields, so it keeps its real limit (at most 120, lowered to the template's name fields).
- A free text answer to a `contact-method`, `site-language`, `place-choice` or `business-trade` question is read the
  same way: the contact facts, the language tag, the offered place or the offered trade the model reads in it; code never reads the text itself.
- Before the plan, one model call reads those typed answers (the answer reading, `answer-reading.mjs`): the choice an
  answer means and the values it states, each quoting the owner's words. What it reads enters the profile with origin
  `answer`: the question's own value settles its conflict over every source, the website included; a second value of
  a kind the profile holds once is flagged on the owner statement (`mention`). Code checks the reply's structure only
  and never interprets the owner's words. An unusable reply leaves the answer an owner statement; nothing stops.
- A question and a choice may carry a text `code` and its `params`, under the same rules as the plan's codes (a code is
  lower case words joined by underscores; params are camel case names with a short text, a whole number or true or
  false, and only beside a code). The chat may show the text in the customer's language from the code and its params;
  `prompt` and `label` are the English fallback. The answer still names the choice by its `id`. The needs profile
  (`needs-profile-questions.mjs`, `needs-profile-conflict-questions.mjs`) gives every question and choice it asks a code:

| Question `code` | Question `params` | Choice `id` | Choice `code` | Choice `params` | English label |
|---|---|---|---|---|---|
| `main_button` | `{}` | `book`, `call`, `email`, `message`, `visit`, `contact` | `main_button_<id>` | `{}` | Book online, Call us, Email us, Message us, Visit us, Contact us |
| `main_button` | `{}` | same ids, when the long labels do not fit the template's button | `main_button_<id>_short` | `{}` | Book, Call, Email, Message, Visit, Contact |
| `contact_method` | `{}` | `phone`, `email`, `link` | `contact_method_<id>` | `{}` | A phone number, An email address, A booking or contact link |
| `site_language` | `{}` | the language tag (`en`, `pt-BR`) | `site_language_option` | `{language}` (the tag) | the English name of the language |
| `fact_conflict_business` | `{fact}` (a fact role, `contact.phone`) | `value-1`, `value-2`, ... | `fact_conflict_value` | `{value, from}` | the value as a source writes it |
| `fact_conflict_item` | `{fact, item}` (the item's name) | `value-1`, `value-2`, ... | `fact_conflict_value` | `{value, from}` | the value as a source writes it |

  `from` names where the value was found, comma separated: `website`, `google_maps`, `owner_answer`, `instagram`,
  `facebook`, `tiktok` or `social` (the choice `detail` says the same in English). The `site-name` question
  (`plan-site-name-question.mjs`) carries no code yet. The `place-choice` question (`place-choice-question.mjs`) is
  asked by research, not by the needs profile: question code `place_choice` (`{}`); one choice per candidate place, at
  most five, its id the Google place id, code `place_choice_option` with `{name, address?}`, its label the name and
  address (no two labels alike); then the choice `none`, code `place_choice_none` (`{}`), label "None of these".

## Build plan

The plan carries business facts with their sources, pages and their blocks, the data items each block shows, the look
section, the pictures summary, the assumptions and what was left out. **It carries no written copy**: headings, body
text and SEO text are written after approval. Every object of the plan is a closed shape, so a key such as `heading`,
`title`, `description` or `cta` on the plan, a page, a block, a fact, an item, the look section or any of its parts is
rejected; and labels, reasons and other short texts are held to their [text limits](#text-limits).

```json
{
  "schema": "tracy-build-plan/v1",
  "id": "plan-sunrise-tennis",
  "revision": 1,
  "language": "en",
  "facts": [
    { "id": "phone", "kind": "contact.phone", "label": "Phone", "value": "04 000 0000",
      "sources": [{ "kind": "answer", "name": "Your answer" }, { "kind": "website", "name": "Website" }] }
  ],
  "items": [
    { "id": "s4", "kind": "service", "label": "Cardio tennis", "sources": [{ "kind": "social", "name": "Instagram post" }] },
    { "id": "photos", "kind": "gallery", "label": "Photos of courts and classes", "count": 12, "sources": [{ "kind": "social", "name": "Instagram" }] }
  ],
  "pages": [
    { "id": "home", "name": "Home", "pageType": "home", "blocks": [
      { "id": "h3", "type": "reviews", "block": "tracy-reviews", "source": "library", "label": "Reviews",
        "data": ["r1", "r2", "r3", "r4", "r5", "r6"],
        "reason": "The template has no reviews block, so your Google reviews use the Tracy reviews block." }
    ] }
  ],
  "look": {
    "template": { "slug": "example-sports-template", "name": "Example Sports", "version": "1.0.0" },
    "accent": "#1f7a4d",
    "logo": { "kind": "own", "source": "Instagram profile picture" }
  },
  "pictures": {
    "own": { "frames": 31, "from": ["Instagram", "Website"] },
    "generated": { "frames": 2, "reason": "Two spots have no fitting photo; generated pictures show no people." }
  },
  "assumptions": [{ "id": "language", "field": "language", "said": "Every source is in English, so the site is in English." }],
  "leftOut": [{ "what": "Prices page", "kind": "page", "reason": "No public prices found." }]
}
```

- **`revision`** starts at 1; each applied plan edit adds one. **`language`** is a tag like `en` or `pt-BR`.
- **`facts`**: `kind` is a role of `place-content-roles/3`; each has a `label`, a `value` and at least one source.
  A source `kind` is `website`, `google`, `listing` (a business directory's page), `social`, `answer` or `assumption`.
- **`items`**: the data items blocks show (services, people, reviews, photos). `kind` is a group kind of
  `place-content-roles/3`; `count` (optional) is how many like things one item stands for, such as a set of photos.
  Facts and items share one id space.
- **`pages`**: `id`, `name` (what its menu item shows), `pageType` (its recipe) and at least one block. Each block has
  `type` (a block type), `block` (the block of the store it places), `source` (`template` or `library`), a `label`
  and a `reason` the customer can read, and **`data`**: the facts and items it shows, at least one. An item must fit
  the block type (a `team` block shows `person` items); a block type without items, such as `contact`, shows facts
  only. A block whose written copy comes from general knowledge of the owner's trade (how a first visit runs, what
  to bring: the step chain's "Trade knowledge") carries **`basis: "trade"`** and **`factIds`**, the facts or items
  that show the business does that activity, at least one; its `data` may then be empty.
- **`look`**: the chosen `template` `{slug, name, version}`, the brand `accent` as `#rrggbb`, and the `logo`, either
  `{kind: "own", source}` or `{kind: "text"}` (the business name set as text). An optional `accentDark` (`#rrggbb`,
  #616) is the accent of the dark theme when it differs from the light one: a logo with no hue gives black on the
  light theme (`accent`) and white on the dark theme (`accentDark`). Without it, `accent` is worn on both themes.
  `accent` is the light theme's colour, or the only theme's colour when the template has one theme (a dark only
  template with a logo of no hue has `accent` white and no `accentDark`).
  A logo with a hue the brand step could not wear (D44) keeps its hue with the lightness moved until buttons read 3:1
  on every theme, each theme on its own (`accent`, `accentDark`); when no lightness reads, black on light and white on
  dark as for a logo with no hue. Never the template's accent.
- **`pictures`**: `own.frames` filled by the business's own photos (with `from`, the sources), and `generated.frames`
  to be generated. `own.frames` counts spots, not photos: one photo may fill several. The photos are counted apart
  (`picture-tally.mjs`): `own.photos` the owner's photos the plan holds, `own.placed` those that fill a spot, and
  `own.unused` the others as `{code, count}` entries, so photos = placed + every unused count. A photo is placed or
  unused, never both: a photo that fills any spot (a gallery, the hero, another section picture) is not in `leftOut`,
  and an unused photo whose item a `leftOut` entry names is counted under that entry's `code`, so the photos left out
  as `no_gallery_room` are exactly the `no_gallery_room` unused count (`plan-picture-count.mjs`; the composer's gate
  refuses a plan where they differ, code `picture_count`). A photo the owner keeps off the site or asked to take off
  fills no spot of the plan. Which spot outside the galleries takes which photo is
  decided by the pictures step once the photos are labelled, so the plan names no spot; `empty` lists the spots
  left without a picture the same way. The three own counts are given together or not at all. `generated.frames` has
  a `reason` when above zero. `generated.frames` is an estimate, never a cap (D45): the
  customer reads "about N pictures will be drawn", and the pictures step draws every drawable frame left without a
  fitting own photo once the photos are labelled. An item shown in several frames on different pages whose aspect
  ratios lie within 15% of each other is drawn once and counted once, at the largest width and height among them;
  another ratio, the same page or a frame without a declared size gets its own drawing.
- **`look`** also: an own logo names its `source`; a text logo has none.
- **`assumptions`**: what was assumed where sources were silent or disagree. Each has a unique `id`, says what was
  assumed (`said`) and names the plan `field` it set, which must be a field the customer can change, so every
  assumption is correctable by a plan edit. The list is required, even empty.
- **`alternatives`** (optional, on an assumption whose `field` is a `facts[<id>].value` or `items[<id>].label`): the
  values the sources disagree on, so the chat can show the customer the other values. At least two entries, each
  `{value, sources}` with a distinct `value` (held to the field's text limit) and at least one source. In the plan as
  composed (revision 1) the field's current value is one of them. A plan edit may set the field to any alternative, or
  to the customer's own value; after an edit the value need not be among them.

```json
{ "id": "hours", "field": "facts[hours].value", "said": "Google Maps lists the same hours every day; ...",
  "alternatives": [
    { "value": "Every day, 6:00 to 22:00", "sources": [{ "kind": "google", "name": "Google Maps" }] },
    { "value": "Weekdays 6:00 to 22:00, weekends 8:00 to 18:00", "sources": [{ "kind": "website", "name": "Website" }] }
  ] }
```

- **`leftOut`**: what was dropped, each with `kind` (`page`, `block`, `item`, `feature`) and its `reason`. Required,
  even empty. A row the plan does not show is reported with kind `item`.
  `code` (optional): the stable code of the reason beside its sentence, lower case words joined by underscores, by
  which the plan card translates the entry; the composer's gate gives every entry one (`model_reason`: a sentence the
  model wrote and code could not derive, to translate as written; `stated`: a code made sentence without a code of
  its own). `what` names a section, a page or the data in the customer's words, never a block id. `item`
  (optional): the id of the fact, item or row the entry reports, when the plan lists it; a fact listed in `facts`
  and named by a left out entry is known to the plan but not shown on the site. `params` (optional, only beside a
  `code`): the values the code's sentence is worded with (`no_gallery_room` `{count}`, the photos left out that way;
  `gallery_photo_shown_elsewhere` `{count}`, one entry per gallery, the photos it does not show because each already
  shows in a gallery on another page and a photo shows once on the site,
  so one sentence agrees for one photo and for many; `section_below_minimum` `{min, shown}` for a section, `{min}`
  for an item it showed). The owner's videos the plan has no place for are one entry of kind `feature`, code
  `no_place_in_design`, `params` `{count, known}`: `count` the videos left out, `known` the videos the plan knows,
  each video frame of the plan counting as taking one, so known = placed + left out (`plan-videos.mjs`). A photo the
  left out list names with any code but `no_gallery_room` fills no frame, at compose time and in the pictures step.
- **`legalPages`** (optional, #575, the step chain's `site.legalPages`): one entry of `kind: "privacy"`, either the
  template's own page of the plan (`use` and `id` both the plan's page id) or one the build creates (`use: "create"`,
  `id: "legal:privacy"`, a `says` line for the writer and `factIds`, the facts or items it rests on, at least one).
  **`notFound`** (optional): what the not-found page says (`says`) and the plan's pages it leads to (`leadsTo`, at
  least one). Neither is shown on the plan card; a created page is no page of `pages`, so it gets no menu item and no
  left out line. A plan the composer gates always carries both; a plan stored before them may not.
- **`display`** (optional, on a fact): the value as the customer reads it, written by code from a structured value,
  with its `code` and `params`. Opening hours (`contact.hours`, value `Mo-Fr 06:00-21:00; Sa 08:00-16:00`) read
  `Monday to Friday, 6:00 to 21:00; Saturday, 8:00 to 16:00`, code `opening_hours`, params `{groups, fromN, toN,
  hoursN}` (N from 1; days as two letter codes `mo` to `su`; `hoursN` is `HH:MM-HH:MM`, ranges joined by a comma, or
  `closed`), so the card says the day names in the customer's language. `value` stays the structured value; a value
  that does not read as a week has no `display`.
- **Intent for the writer** (optional, #575, the step chain's `visitorQuestion`, `keyMessage`, `seo`, `endAction`,
  block `message`, `site.primaryAction` and `ownerTasks`): notes in note form, never final copy, and none is shown as
  words on the site. A page may carry `visitorQuestion` (what a visitor came to find out), `keyMessage` (the one thing
  they should leave with), `seo` (`searchTerms`, at least one, the words a visitor searches for, made by code from the
  plan's data; `titleIntent` and `descriptionIntent`, what the search title and description must get across) and
  `endAction` (`block`, a block of the same page that leads to the main action, and `factIds`, the facts it carries).
  A block may carry `message` (its point in one line) and `carries` (the ids of the plan's `keyMessages` it gets
  across). The plan may carry `keyMessages` (`{id, label}`, the brief's points the site leads with), `primaryAction`
  (`factIds`: the main button's facts) and `later` (`{what, reason, code, params?}`: what the owner can send after
  approval and what it opens, built by code; codes `later_<field>`). The page writer reads them; the plan card may.
- **`labelCode`** (optional, on a block): the stable key of the section the block is (its block type, or
  `page_header` for a page title hero; the key a change line names as `section`), by which the card translates the
  section name. `label` is the composer's own words and stays the English fallback.

### Child list rows (optional)

A block of the template may hold lists inside it or inside each of its items (Contract A child lists: the session
times of a class card, the steps of a project). Two **optional** keys carry their rows; a plan without them is valid,
and a block without `lists` shows no rows.

```json
"rows": [
  { "id": "service-wheel-basics-row-1", "label": "Tue and Thu, 18:00 to 20:00",
    "sources": [{ "kind": "website", "name": "Website" }] }
],
"pages": [{ "id": "home", "blocks": [
  { "id": "home-b3", "block": "classes-grid", "data": ["service-wheel-basics"],
    "lists": [{ "name": "sessions", "item": "service-wheel-basics",
                "rows": [{ "data": "service-wheel-basics-row-1" }] }] }
] }]
```

- **`rows`** (on the plan): the rows the business stated, each `{id, label, sources}`, in the same id space as facts
  and items. A label is held to the `label` limit. A block's `data` never names a row.
- **`lists`** (on a block): one entry per child list of the block, `{name, rows}`, and per item for a list inside
  each item, `{name, item, rows}` where `item` is an item (never a fact) of the block's `data`. `name` is held to the
  `lists[].name` limit. `rows` may be empty: a list with no business data is planned empty, never filled with invented
  rows.
- **Item N of a block's `data` is written to stored place N.** The rules put a block's items in the order of the
  places that hold their rows (the item with the most rows that fit in the place that stores the most), so the order
  of `data` is the place order; no extra key says it. After a customer's plan edit the customer's item order is kept,
  and each item's rows are cut at the place it lands in, the rows that no longer fit reported as left out.
- **A planned row** is `{data}`, a row or a fact of the plan (a social link fact is one row of a links list), or
  `{page}`, a page of the plan, for a list whose rows are keyed to pages. It may hold `lists`, the nested lists of
  that row, at most three levels deep. A row appears once per list.
- How many rows a list shows, and which data kinds a row may hold, come from the block store; the rules gate holds the
  plan to them (`plan-rows-check.mjs`). The contract check holds the shape: closed objects, known ids, text limits.
- **Left out entries the rules add** (no new key or kind): a row not shown is kind `item`; a business fact a list
  cannot show (a shortened or repeated social link, one beyond the rows a list holds) is kind `feature`; a list left
  under its `items.min` is kind `block` (its label); a fact longer than the field of its block, or an item whose
  naming value is (a required role of its kind), is taken off that block before anything is written
  (`data_over_limit`) and, when no other block shows it, is kind `feature` or `item`; an over long optional value of
  an item leaves only that value off (the field follows its no-data rule), reported as kind `feature`
  ("Schedule of Invented Boxing"). The gate's `rows` report (each entry with its `code` and `reason`) says, for a row
  dropped with `row_value_over_limit`, which `field`, its `limit` and the part's `length`. A schedule of one part is
  never lost and never cut inside a range: it is split into days and times only when the whole text is one day group,
  one separator and one time expression (`Mo-Fr 7 bis 22 Uhr`, `Sat 9 - noon`, `Mon-Fri until 5pm`), else kept whole
  and unchanged, in the times when it holds a digit (`Mon-Fri 9-5, Sat 10-2`) and in the days when it holds none
  (`By appointment`); only a value over its field's limit drops the row. A customer's answer is never dropped that way: it is held to the template's limits when it is settled, and
  the gate reports one too long as the problem `answer_over_limit`.
- A row field declaring `textOf: "network"` (Contract A) names the network of the row's link: the writer fills it from
  the link with the icon step's network detection (`from: 'data'`), never sends it to the model, and hides it when
  the row has no usable link.

## Plan edit

```json
{
  "schema": "tracy-build-plan-edit/v1",
  "id": "edit-1",
  "plan": { "id": "plan-sunrise-tennis", "revision": 1 },
  "changes": [{ "field": "items[s2].label", "value": "Junior academy" }]
}
```

A field is a path into the plan: a key, or a list entry selected by its id in brackets. The fields a customer can
change (`EDITABLE_FIELDS`): `language`, `look.template`, `look.accent`, `look.logo`, `facts[<id>].value`,
`items[<id>].label`, `pages[<id>].name`, `pages[<id>].blocks[<id>].data`, `pictures.generated.frames`, and the intent
notes for the writer (#575 plan card): `keyMessages[<id>].label`, `pages[<id>].keyMessage`,
`pages[<id>].visitorQuestion`, `pages[<id>].seo.titleIntent`, `pages[<id>].seo.descriptionIntent`,
`pages[<id>].seo.searchTerms`, `pages[<id>].blocks[<id>].message`.

A search term list the owner sets marks the page's terms (`seo.ownerAdded`: the terms the owner typed that code does
not make; `seo.ownerRemoved`: terms code makes that the owner took off). Code makes the terms again from the data after
every edit (`withSearchTerms`): the terms it makes but those the owner took off, then the owner's own, at most 10. A
list the gate cannot save is refused with its code: `search_terms_empty`, `search_term_too_long` (over 60 characters),
`search_term_twice`, `too_many_search_terms`.

An edit is valid only against the plan it applies to (`checkPlanEdit(edit, plan)`):

- it names that plan's id and its current revision; an edit for an older revision is stale and is not applied;
- each field appears once, resolves in the plan and is one the customer can change;
- each new value has the kind the field holds (text for text, a list for a list);
- the edited plan, revision raised by one (`applyPlanEdit`), still passes the plan check, closed shapes and text limits
  included, so a new `look.template` or `look.logo` value with an extra key is rejected; such a problem is reported at
  `plan <place>` with a message starting "after the edit".

### Plan operations

Instead of `changes`, an edit may carry one `operation` (#575 plan card), a structured click with no free text:

```json
{
  "schema": "tracy-build-plan-edit/v1",
  "id": "edit-2",
  "plan": { "id": "plan-sunrise-tennis", "revision": 2 },
  "operation": { "op": "remove-block", "page": "home", "block": "home-b4" }
}
```

| `op` | Keys | What it does |
|---|---|---|
| `remove-page` | `page` | takes a page off (and off `notFound.leadsTo`) |
| `remove-block` | `page`, `block` | takes a section off one page |
| `remove-item` | `page`, `block`, `item` | takes one item (a service, a person, a photo, a review) off a section |
| `remove-key-message` | `message` | takes a key message off, and off every block's `carries` |
| `remove-channel` | `fact` | takes a contact channel off every footer block (and off `legalPages[].factIds`, `endAction.factIds`) |
| `remove-later` | `later` | takes the `later` entry with that code off |
| `restore` | `removal` | brings back what one removal of this review took, exactly, where it was |
| `revert` | | goes back to the plan (and needs profile) as they were before the review's first change |

`gateOperatedPlan` (`plan-edit-gate.mjs`, the pure code in `plan-operations.mjs`) applies it and holds the result to the
same checks as an edit (main blocks, item counts, rows planned again, pictures, search terms, the whole document); the
revision rises by one. What the owner cannot take off is decided from the kit and the plan (`planLocksOf`), each with a
refusal code: the first page (`first_page`), the page the privacy page is (`privacy_page`), the main block of a page's
recipe (`main_block`), a block the build writes in place, which every page shares (`site_chrome`), the block a page
ends on (`end_action`), a fact of the main button (`main_button`), an item that would leave a block under its
`items.min` (`too_few_items`) or with no detail (`block_empty`). A restore whose place is gone (a section that carried
it was taken off later) is refused with `restore_target_gone`.

A removal adds left out entries with code `owner_removed` (reason "You took this off the plan.") and `params.removal`,
the removal's id: the part itself (kind `page`, `block` or `feature`) and every fact or item it leaves shown nowhere.
Assumptions that named a part taken with it go with it. The removal record (what was taken and its neighbours) is kept
beside the plan by the draft store, never in the plan; a restore removes the entries and puts each piece back between
its nearest neighbours still there. A change request treats data left out by `owner_removed` as the customer's
(`customerTakenOffOf`).

## Change request and plan revision

```json
{
  "schema": "tracy-build-plan-request/v1",
  "id": "request-1",
  "plan": { "id": "plan-sunrise-tennis", "revision": 2 },
  "text": "Drop the prices page and add a page about the team."
}
```

- `text` is what the customer typed, at most **1000** code points (`request.text`, `PLAN_REQUEST_MAX_LENGTH`). An
  empty or blank text, a text with no visible character (only format characters such as zero width spaces or a byte
  order mark, or combining marks attached to nothing), or a longer text is refused before any model reads it
  (`request_empty`, `request_too_long`), and a request for another plan or any other revision (0 included) is stale
  (`checkPlanRequest(request, plan)`, `request_stale`).
- The text is data for the plan, never an instruction: it cannot change a rule of the plan gate.

```json
{
  "schema": "tracy-build-plan-revision/v1",
  "request": "request-1",
  "plan": { "id": "plan-sunrise-tennis", "revision": 3 },
  "changed": ["The Prices page is removed.", "A Team page is added."],
  "notDone": [{ "what": "A blog", "reason": "no_recipe", "why": "Your template has no blog page." }]
}
```

- `plan` names the plan the request produced: the next revision, or the same revision when nothing changed.
- `changed` lists, in sentences the customer reads, the real differences between the two revisions, and only those:
  each is written by code from the difference (in English, as the gate's own reasons), never by the model, and names
  the final state of what it describes (a page renamed twice shows its last name). Code writes one line for: a page
  removed, added, renamed, the page order, a section removed, added, its data, the order of a page's sections, the data
  no longer shown, the data newly shown, the data shown again that the customer took off earlier ("Now shown again:
  ..., which you had taken off earlier."), and a changed pictures estimate (photos of the customer used, pictures
  drawn). Pages and sections are matched by id: a revision keeps the id of every page and section it keeps; a new one
  gets an id tagged with the revision (`services-r3`, `home-r3-b8`), never one this plan used before. Two changes have
  no line: an assumption dropped because its page or section was removed (the removal has its line), and a left out
  entry renamed after the customer's own label for its item.
- `notDone` lists what could not be done, each with a `reason` of the closed set `no_recipe` (the template has no page
  of that kind), `no_data` (nothing of the business fills that section), `fact_missing` (the business does not have
  that fact), `kept_private` (the customer keeps it off the site), `outside_plan` (a request cannot change it: values,
  the look, the language and the pictures count are changed with a plan edit) and `why`, a sentence.

## Progress events and outcome

A run is the full build after approval (`run: {id, kind: "build"}`) or a partial re-run after a plan edit
(`run: {id, kind: "partial", edit}`). Every progress event and the outcome carry `planId`, `planRevision`, `run`,
`elapsedSeconds` and the run's `steps`; progress events also carry `seq`, rising from 1.

```json
{ "id": "generated-pictures", "kind": "pictures", "label": "Generate 2 pictures for empty spots", "state": "running", "attempt": 2 }
```

- A step `kind` is `look`, `writer` (with the `page` it writes; only a writer step names a page), `pictures` or
  `write`. The **write step is the last step, exactly once**. There is at most one writer step per page.
- **A full build** (`kind: "build"`) carries no plan edit and, before the write step, at least one `look` step, at least
  one `pictures` step and **one writer step for every page of the plan** (checked against the plan in a scenario).
- **A partial re-run** (`kind: "partial"`) carries only the steps its plan edit needs, at least one besides the write
  step: it may omit the look, writer and pictures steps (a colour change re-runs a look step only). Its writer steps
  name pages of the revision it builds. A site check is not a build step this round
  ([ADR 0047](../adr/0047-a-failing-build-step-stops-and-reports.md), decision 3): a step of kind `site-check` is
  rejected.
- `state` is `pending` (attempt 0), `running`, `done` or `failed`. A failing step is re-run once, so `attempt` is at
  most 2; a first failure shows as `running` with attempt 2, and **`failed` means the re-run failed too**. A step that
  failed on its first attempt and then completed on its second is `done` with attempt 2, a valid run.
- **A step that stops without a re-run** (a deterministic failure a re-run would repeat, the run's deadline, the run
  frame failing outside the steps) is `failed` on **attempt 1** and carries `noRerun: true`. `noRerun` is only ever
  `true`, only on a `failed` step, and only with attempt 1; a `failed` step without it is on attempt 2.
- **Parallel group**: in a run, every `look`, `pictures` and `writer` step forms one parallel group: once the plan
  is approved (or the plan edit applied) they may run at the same time, in any order. The `write` step is not in the group:
  it runs alone, after every step of the group is done.
- **A failed step is final**: at most one step of a run is failed, and every later event, and the outcome, still shows
  it `failed` on the same attempt; the outcome is `stopped` naming that step. In the document where a step is failed
  and in every later one:
  - no step is `running` (the build has stopped);
  - the write step is never `running` and never `done` (unless it is the failed step);
  - another step may be `done` only if it was `running` or `done` in an earlier event of the same run: steps of the
    parallel group were running beside the failed one and may have finished; a step that had not started stays
    `pending` (checked in a scenario, when the run has an earlier event);
  - when the failed step is the write step, every other step is `done`: they completed before it ran.
- Every event of a run lists the same steps in the same order, `seq` rises, elapsed time never goes back, and a done
  step stays done. The outcome lists the same steps as the events and its `elapsedSeconds` is not below the last
  event's.

The outcome adds `result`:

- **`done`**: every step, ending with the write step, completed. An outcome of done that carries a failed, pending or
  running step is rejected. Done does not depend on a site check.
- **`stopped`**: exactly one step failed, and `stopped: {step, reason, teamNotified: true}` names it. The write step is
  never `done` in a stopped outcome. The chat shows the could not finish state; the Tracy team is told.
- **`cancelled`**: the customer cancelled the run. No step is failed, every unfinished step is `pending`, the write step
  is not `done`, there is no `stopped` report, and `cancelled: {teamNotified: false}`: a cancel is the customer's choice,
  not a fault, so the Tracy team is not told.
- Any other result, such as `applied` or `complete`, is rejected: a build never reports those.

In a scenario a partial run builds the revision its edit produced, and a writer step names a page of that revision.

### Changes for consumers

- 17/11/2026 (#575), additive: a build plan may carry the step chain's intent for the writer: on a page
  `visitorQuestion`, `keyMessage`, `seo` (`searchTerms`, `titleIntent?`, `descriptionIntent?`) and `endAction`
  (`block`, `factIds`); on a block `message` and `carries` (key message ids); on the plan `keyMessages` (`{id, label}`),
  `primaryAction` (`factIds`) and `later` (`{what, reason, code, params?}`). Every earlier plan stays valid and the
  schema stays `tracy-build-plan/v1`. A reader that does not know them ignores them; the plan card shows none yet.
- 17/11/2026 (#575), additive: a build plan may carry `legalPages` (one Privacy Policy page, the template's own or
  one created with the id `legal:privacy`, a `says` line and `factIds`) and `notFound` (`says`, `leadsTo`), as the step
  chain's site plan does. The plan card shows neither; the draft write builds neither yet and lists both under its
  `notBuilt` with a reason.
- 17/11/2026 (#575), additive: research may ask `topic: "held-hours"`, id `held-hours`, when its content brief holds
  the opening hours until the customer confirms them: question code `held_hours_unconfirmed` (one source alone says
  open 24 hours every day; choices `keep`, `edit`, `leave`) or `held_hours_disagree` (the sources disagree; choices
  `edit`, `leave`), choice codes `held_hours_<id>`, and free text read by the answer reading as `contact.hours`. The
  answer is kept on the business as the Profile card's `hoursPick`, and the brief is made again with it before the
  plan. The schema stays `tracy-build-question/v1`.
- 17/11/2026 (#575), additive: a left out entry may carry `params.page` (the template page's name) with the code
  `page_nothing_to_show` or `model_reason`; a page of one item (a single post) is never a left out entry.
- 17/11/2026 (#575), changed: every left out page is written by code from the template's page types the plan does not
  keep, with `params.page` and the code `page_nothing_to_show` or `page_not_planned` (no longer `model_reason`, and no
  longer `page_main_section_empty`); a page the customer removed on a change request has the code `page_removed` and
  `params.pageType`. A left out fact of kind `contact.hours`, `business.name`, `contact.phone`, `contact.address` or
  `contact.cta_label`, or one the owner answered, stays among the plan card's business facts; its entry says the site
  does not show it. Opening hours are shown only by a block with a field of kind `contact.hours`.
- 17/11/2026 (#575), additive: a left out entry of code `library_section_refused` (a review the Tracy reviews section
  does not show) may carry `params.why`, the reason's code: `not_google_review`, `no_text`, `no_star_rating`,
  `stars_below_four`, `stars_not_whole`, `reviewer_anonymous`, `no_reviewer_name`, `reviewer_name_too_long`,
  `review_too_long`. The held hours answer is never one of the plan's answers.

- 17/11/2026 (#575), additive: research with no link may ask `topic: "place-choice"` with question code
  `place_choice_found` (the places the business name and city found), and `topic: "brief-gap"`, id
  `brief-gap.<field>` (`offerings`, `menu`, `offering-descriptions`, `prices`, `hours`, `phone`, `address`, `booking`,
  `story`), question code `brief_gap_<field>` with non letters as `_`, one choice `skip` (code `brief_gap_skip`, "Leave
  it out for now") and free text, which is an owner statement the brief is made again with. The schema stays
  `tracy-build-question/v1`.

- 17/11/2026 (#575), additive: a question may have `topic: "business-trade"`, asked by the build chat when research
  names no trade (`business-trade-question.mjs`): question code `business_trade` (`{}`), one choice per trade the
  template catalogue offers (id the trade code, code `business_trade_<trade>`), then `other` ("Something else"). The
  schema stays `tracy-build-question/v1`; a reader that does not know the code shows `prompt` and `label`.

- 16/11/2026 (#609), additive: a question may have `topic: "place-choice"`, asked by the build chat's research when
  the customer's Google link matches more than one place (section "Question and answer"). Every earlier document
  stays valid and the schema stays `tracy-build-question/v1`. A reader that switches on `topic` must handle
  `place-choice`; its answer names a choice by id as any other.

- 15/11/2026 (#609), additive: a question and a choice may carry `code` and `params` (section "Question and answer");
  the needs profile's questions carry them. Every earlier document stays valid and the schema stays
  `tracy-build-question/v1`. A reader that does not know a code shows `prompt` and `label` as before. An answer
  names its choice by `id`, as it always has.

- 14/11/2026 (#593), additive: a question may have `topic: "site-name"` with `choices: []` (and only that topic may
  have no choice); its answer is `{schema, question, text}`. Every earlier document stays valid and the schema stays
  `tracy-build-question/v1`. A reader that switches on `topic` must handle `site-name`, and one that renders the
  choices as buttons must show the free text field alone when there is none. The engine stops with
  `site_name_missing` while the question is open, `site_name_too_long` (`details.limit`, `length`, `problems`) when the
  name is longer than the template's business name fields, and `site_name_invalid` (`details.problems`) when it is
  empty or holds a control character, markup or markdown. All three carry `details.question` (the whole question to
  ask again) and `details.questionId` (`"site-name"`). Sample:
  `sunrise-tennis-club-site-name` in `packages/wo/website-opportunities/test/fixtures/build-contract/`.

- 16/11/2026, additive: a fact of only white space is no fact (a blank address stops nothing: the plan lists no
  address fact and its places stay unwritten). A gallery the model repeats on
  another page with photos an earlier gallery shows takes the business's photos the plan shows nowhere (`placed`,
  `how: "gallery photo shown once"`); the photos it still cannot show are the left out entry
  `gallery_photo_shown_elsewhere` `{count}`.

- 13/11/2026 (#597), additive: a step may carry `noRerun: true` (failed on attempt 1, stopped without a re-run), and an
  outcome may have `result: "cancelled"` with `cancelled: {teamNotified: false}` and no `stopped`. Every earlier
  document stays valid. A reader that switches on `result` must handle `cancelled` (show it as cancelled, not as could
  not finish), and a reader of a failed step must not assume attempt 2. Samples:
  `sunrise-tennis-club-stopped-without-rerun` and `sunrise-tennis-club-cancelled` in
  `packages/wo/website-opportunities/test/fixtures/build-contract/`.

## Model usage from the build model door

The build chat's steps call the model through one function, `model({system, user, format, images?}) -> reply text`
(`apps/tracy-web/src/build-draft/build-model.js`). That shape is unchanged: every existing caller still gets a string.
What a call used and cost is told on the side, so the engine can settle each step's ledger row at its real cost instead
of its ceiling (`cost_reported` true).

- **The callback.** `modelCallOf(door, {onUsage})` and `buildModelDoor(...)({onUsage})` take an optional
  `onUsage(usage)`; a call may also pass its own, `model({system, user, onUsage})`. It is called once for every call
  that was sent (also one that failed or got no usable text), before the reply is returned or the error thrown. A
  callback that throws never fails the call.
- **The object.** `{provider, model, inputTokens, outputTokens, cachedInputTokens, costCents}`. `provider` is the
  endpoint host, `model` the model asked for. A token count is `null` when the provider did not report it, and
  `cachedInputTokens` is `null` when the provider does not say. `costCents` (a number, not rounded) is present only when
  the answer reported its tokens and `opportunities-build/quality-prices.json` lists that host and model and is still
  valid; otherwise it is `null`, never an estimate. A call that failed carries `failed: true` and a `null` cost.
- **The step rule.** The engine gives each compose and each change request its own door with its own collector
  (`model-usage.js` `usageCollector`). Every model call of the step, including the second run of the rerun rule, goes
  through that door, so the engine sees all of them. The ledger row settles at the sum when the step made at least one
  call and every call has a cost; else it keeps the ceiling.
- **What the WO package has to do.** Nothing for compose, revise and the needs profile: they call only the `model` they
  are given. Their results need no usage field. A step that spends money OUTSIDE this door (research's place details,
  crawl and business reading) must return `costCents` for the whole step in its result, and only when it knows the cost
  of everything it spent; until then research keeps its ceiling.

## Closed shapes

Each object accepts exactly these fields (`CONTRACT_SHAPES`, `build-contract-shapes.mjs`); `?` marks an optional field.
Any other key is reported as `"<key>" is not a field of <object>`. A test compares this table with the code.

| Object | Fields |
|---|---|
| `build scenario` | `schema`, `name`, `plan`, `summary?`, `questions?`, `answers?`, `edits?`, `runs?` |
| `scenario run` | `events?`, `outcome?` |
| `question` | `schema`, `id`, `topic`, `prompt`, `choices`, `freeText`, `fact?`, `skippable?`, `code?`, `params?` |
| `choice` | `id`, `label`, `detail?`, `recommended?`, `code?`, `params?` |
| `free text` | `maxLength`, `placeholder?` |
| `answer` | `schema`, `question`, `choice?`, `text?`, `skipped?` |
| `plan` | `schema`, `id`, `revision`, `language`, `facts`, `items`, `pages`, `look`, `pictures`, `assumptions`, `leftOut`, `rows?`, `legalPages?`, `notFound?`, `keyMessages?`, `primaryAction?`, `later?` |
| `fact` | `id`, `kind`, `label`, `value`, `sources`, `display?`, `code?`, `params?` |
| `item` | `id`, `kind`, `label`, `sources`, `count?`, `namedBy?` |
| `source` | `kind`, `name` |
| `page` | `id`, `name`, `pageType`, `blocks`, `visitorQuestion?`, `keyMessage?`, `seo?`, `endAction?` |
| `block` | `id`, `type`, `block`, `source`, `label`, `data`, `reason`, `lists?`, `labelCode?`, `basis?`, `factIds?`, `message?`, `carries?` |
| `page seo` | `searchTerms`, `titleIntent?`, `descriptionIntent?`, `ownerAdded?`, `ownerRemoved?` |
| `end action` | `block`, `factIds` |
| `key message` | `id`, `label` |
| `primary action` | `factIds` |
| `later entry` | `what`, `reason`, `code`, `params?` |
| `row` | `id`, `label`, `sources` |
| `child list` | `name`, `rows`, `item?` |
| `planned row` | `data?`, `page?`, `lists?` |
| `look` | `template`, `accent`, `logo`, `accentDark?` |
| `template` | `slug`, `name`, `version` |
| `logo` | `kind`, `source?`, `code?`, `sourceKind?` |
| `pictures` | `own`, `generated`, `empty?` |
| `own pictures` | `frames`, `from?`, `fromKinds?`, `photos?`, `placed?`, `unused?` |
| `generated pictures` | `frames`, `reason?`, `code?`, `params?` |
| `assumption` | `id`, `field`, `said`, `alternatives?`, `code?`, `params?` |
| `alternative` | `value`, `sources` |
| `left out entry` | `what`, `kind`, `reason`, `code?`, `item?`, `params?` |
| `legal page` | `kind`, `use`, `id`, `says?`, `factIds?` |
| `not found page` | `says`, `leadsTo` |
| `plan edit` | `schema`, `id`, `plan`, `changes?`, `operation?` |
| `plan operation` | `op`, `page?`, `block?`, `item?`, `message?`, `fact?`, `later?`, `removal?` |
| `plan reference` | `id`, `revision` |
| `change` | `field`, `value` |
| `plan request` | `schema`, `id`, `plan`, `text` |
| `plan revision` | `schema`, `request`, `plan`, `changed`, `notDone` |
| `not done entry` | `what`, `reason`, `why` |
| `progress event` | `schema`, `planId`, `planRevision`, `run`, `seq`, `elapsedSeconds`, `steps` |
| `outcome` | `schema`, `planId`, `planRevision`, `run`, `result`, `elapsedSeconds`, `steps`, `stopped?`, `cancelled?` |
| `run` | `id`, `kind`, `edit?` |
| `step` | `id`, `kind`, `label`, `state`, `attempt`, `page?`, `noRerun?` |
| `stop report` | `step`, `reason`, `teamNotified` |
| `cancel report` | `teamNotified` |

`own pictures.from` is required when `frames` is above zero, `generated pictures.reason` when `frames` is above zero,
`logo.source` for an own logo, `run.edit` for a partial run, `step.page` for a writer step, `outcome.stopped` for a
stopped outcome, `outcome.cancelled` for a cancelled outcome, and `question.fact` for a `fact-conflict`. A `planned row` names exactly one of `data` and `page`.

## Text limits

The longest text, in code points (`TEXT_LIMITS`, `build-contract-shapes.mjs`). A card shows a label on one line and a
reason in a sentence or two. A test compares this table with the code.

| Field | Limit | Applies to |
|---|---|---|
| `label` | 80 | fact, item, block, step and choice labels; an item alternative's value |
| `lists[].name` | 64 | the name of a child list of a block |
| `pages[].name` | 40 | a page name, what its menu item shows |
| `sources[].name` | 80 | a source name, of a fact, an item or an alternative |
| `what` | 80 | a left out entry, a not done entry |
| `detail` | 80 | a choice detail |
| `placeholder` | 80 | a free text placeholder |
| `look.template.name` | 80 | the template name |
| `look.logo.source` | 80 | where an own logo came from |
| `pictures.own.from[]` | 80 | each source of the own photos |
| `facts[].value` | 200 | a fact value, and a fact alternative's value |
| `reason` | 200 | block, left out entry, generated pictures and stop report reasons; a not done entry's `why` |
| `said` | 200 | an assumption |
| `says` | 200 | what a created legal page or the not-found page must get across, for the writer |
| `intent` | 160 | a page's `visitorQuestion`, `keyMessage`, `seo.titleIntent` and `seo.descriptionIntent`; a block's `message` |
| `searchTerms[]` | 60 | each search term of a page |
| `prompt` | 200 | a question |
| `request.text` | 1000 | the text of a change request |
| `changed[]` | 200 | each line of what a change request changed |

## The contract check

`checkBuildDocument(doc)` (WO domain) checks one document by its `schema`, and `checkBuildScenario(scenario)` a whole
exchange. Both report **every** problem, each as `{at, message}`, for example
`runs[0].outcome.steps[write].state: done means every step, ending with the write step, completed; this step is pending`.
`checkAnswer(answer, question)`, `checkPlanEdit(edit, plan)` and `checkPlanRequest(request, plan)` check those three
against what they belong to.

```
node scripts/build-contract/check.mjs               every *.build-scenario.json under packages/ and apps/
node scripts/build-contract/check.mjs <path>...     only those files (any Contract B document) or folders
```

It runs in CI as gate `build-contract` of `scripts/check-all.ts`, and fails when the tree holds no scenario file at
all, so the chat sample data cannot quietly disappear. Its unit tests are
`packages/wo/website-opportunities/test/domain-build-contract.test.mjs` and
`scripts/test/build-contract-check.test.mjs` (the command).

## Choices made where the ticket is silent

- Progress events are full snapshots of the step list, not deltas, so the chat can render any event on its own.
- The template choice is not a question: the plan's `look.template` is changed by a plan edit.
- Adding a page or a block is not a plan edit; removing one is a plan operation (#575), and so is bringing it back.
- Per block picture counts are not part of the plan; the pictures summary is for the whole site.
