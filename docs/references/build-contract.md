---
description: Format of Contract B, what the build engine and the chat exchange (build plan, progress events, outcome, questions and answers, plan edits), and the contract check that validates it in CI.
sources:
  - packages/wo/website-opportunities/domain/build-contract.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-parts.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-rows.mjs
  - packages/wo/website-opportunities/domain/build-contract-shapes.mjs
  - packages/wo/website-opportunities/domain/build-contract-scenario-runs.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan-edit.mjs
  - packages/wo/website-opportunities/domain/build-contract-questions.mjs
  - packages/wo/website-opportunities/domain/build-contract-run.mjs
  - scripts/build-contract/check.mjs
  - docs/adr/0046-the-model-sees-one-cms-neutral-site-form.md
  - docs/adr/0047-a-failing-build-step-stops-and-reports.md
---

# Contract B: build plan, progress, outcome, questions and plan edits

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
  "freeText": { "maxLength": 40, "placeholder": "Type the correct number" }
}
```

- `topic` is `main-button`, `contact-method`, `site-language` (the three agreed cases of spec #577) or `fact-conflict`
  (facts that disagree between sources); a `fact-conflict` names its `fact`, a fact role.
- `choices` has at least one entry; at most one is `recommended` (`true` or `false`). `freeText.maxLength` is
  required: every question accepts a free text answer. `freeText.placeholder` is optional, a short text.
  `skippable: true` lets the customer skip it.
- An answer is `{schema, question, choice}`, `{schema, question, text}` or `{schema, question, skipped: true}`, exactly
  one of the three. It is valid only against its question: the choice is one of its choices, the text is not empty,
  holds no control character (line breaks included) and at most `maxLength` characters counted by code point, and only
  a skippable question is skipped.

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
  A source `kind` is `website`, `google`, `social`, `answer` or `assumption`.
- **`items`**: the data items blocks show (services, people, reviews, photos). `kind` is a group kind of
  `place-content-roles/3`; `count` (optional) is how many like things one item stands for, such as a set of photos.
  Facts and items share one id space.
- **`pages`**: `id`, `name` (what its menu item shows), `pageType` (its recipe) and at least one block. Each block has
  `type` (a block type), `block` (the block of the store it places), `source` (`template` or `library`), a `label`
  and a `reason` the customer can read, and **`data`**: the facts and items it shows, at least one. An item must fit
  the block type (a `team` block shows `person` items); a block type without items, such as `contact`, shows facts
  only.
- **`look`**: the chosen `template` `{slug, name, version}`, the brand `accent` as `#rrggbb`, and the `logo`, either
  `{kind: "own", source}` or `{kind: "text"}` (the business name set as text). An optional `accentDark` (`#rrggbb`,
  #616) is the accent of the dark theme when it differs from the light one: a logo with no hue gives black on the
  light theme (`accent`) and white on the dark theme (`accentDark`). Without it, `accent` is worn on both themes.
  `accent` is the light theme's colour, or the only theme's colour when the template has one theme (a dark only
  template with a logo of no hue has `accent` white and no `accentDark`).
- **`pictures`**: `own.frames` filled by the business's own photos (with `from`, the sources), and `generated.frames`
  to be generated, at most 6 (`MAX_GENERATED_FRAMES`), with a `reason` when above zero.
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
`items[<id>].label`, `pages[<id>].name`, `pages[<id>].blocks[<id>].data`, `pictures.generated.frames`.

An edit is valid only against the plan it applies to (`checkPlanEdit(edit, plan)`):

- it names that plan's id and its current revision; an edit for an older revision is stale and is not applied;
- each field appears once, resolves in the plan and is one the customer can change;
- each new value has the kind the field holds (text for text, a list for a list);
- the edited plan, revision raised by one (`applyPlanEdit`), still passes the plan check, closed shapes and text limits
  included, so a new `look.template` or `look.logo` value with an extra key is rejected; such a problem is reported at
  `plan <place>` with a message starting "after the edit".

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

- 13/11/2026 (#597), additive: a step may carry `noRerun: true` (failed on attempt 1, stopped without a re-run), and an
  outcome may have `result: "cancelled"` with `cancelled: {teamNotified: false}` and no `stopped`. Every earlier
  document stays valid. A reader that switches on `result` must handle `cancelled` (show it as cancelled, not as could
  not finish), and a reader of a failed step must not assume attempt 2. Samples:
  `sunrise-tennis-club-stopped-without-rerun` and `sunrise-tennis-club-cancelled` in
  `packages/wo/website-opportunities/test/fixtures/build-contract/`.

## Closed shapes

Each object accepts exactly these fields (`CONTRACT_SHAPES`, `build-contract-shapes.mjs`); `?` marks an optional field.
Any other key is reported as `"<key>" is not a field of <object>`. A test compares this table with the code.

| Object | Fields |
|---|---|
| `build scenario` | `schema`, `name`, `plan`, `summary?`, `questions?`, `answers?`, `edits?`, `runs?` |
| `scenario run` | `events?`, `outcome?` |
| `question` | `schema`, `id`, `topic`, `prompt`, `choices`, `freeText`, `fact?`, `skippable?` |
| `choice` | `id`, `label`, `detail?`, `recommended?` |
| `free text` | `maxLength`, `placeholder?` |
| `answer` | `schema`, `question`, `choice?`, `text?`, `skipped?` |
| `plan` | `schema`, `id`, `revision`, `language`, `facts`, `items`, `pages`, `look`, `pictures`, `assumptions`, `leftOut`, `rows?` |
| `fact` | `id`, `kind`, `label`, `value`, `sources` |
| `item` | `id`, `kind`, `label`, `sources`, `count?` |
| `source` | `kind`, `name` |
| `page` | `id`, `name`, `pageType`, `blocks` |
| `block` | `id`, `type`, `block`, `source`, `label`, `data`, `reason`, `lists?` |
| `row` | `id`, `label`, `sources` |
| `child list` | `name`, `rows`, `item?` |
| `planned row` | `data?`, `page?`, `lists?` |
| `look` | `template`, `accent`, `logo`, `accentDark?` |
| `template` | `slug`, `name`, `version` |
| `logo` | `kind`, `source?` |
| `pictures` | `own`, `generated` |
| `own pictures` | `frames`, `from?` |
| `generated pictures` | `frames`, `reason?` |
| `assumption` | `id`, `field`, `said`, `alternatives?` |
| `alternative` | `value`, `sources` |
| `left out entry` | `what`, `kind`, `reason` |
| `plan edit` | `schema`, `id`, `plan`, `changes` |
| `plan reference` | `id`, `revision` |
| `change` | `field`, `value` |
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
| `what` | 80 | a left out entry |
| `detail` | 80 | a choice detail |
| `placeholder` | 80 | a free text placeholder |
| `look.template.name` | 80 | the template name |
| `look.logo.source` | 80 | where an own logo came from |
| `pictures.own.from[]` | 80 | each source of the own photos |
| `facts[].value` | 200 | a fact value, and a fact alternative's value |
| `reason` | 200 | block, left out entry, generated pictures and stop report reasons |
| `said` | 200 | an assumption |
| `prompt` | 200 | a question |

## The contract check

`checkBuildDocument(doc)` (WO domain) checks one document by its `schema`, and `checkBuildScenario(scenario)` a whole
exchange. Both report **every** problem, each as `{at, message}`, for example
`runs[0].outcome.steps[write].state: done means every step, ending with the write step, completed; this step is pending`.
`checkAnswer(answer, question)` and `checkPlanEdit(edit, plan)` check those two against what they belong to.

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
- Adding or removing a page or a block is not a plan edit this round; a plan edit changes field values only.
- Per block picture counts are not part of the plan; the pictures summary is for the whole site.
