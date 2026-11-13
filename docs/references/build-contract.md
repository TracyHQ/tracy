---
description: Format of Contract B, what the build engine and the chat exchange (build plan, progress events, outcome, questions and answers, plan edits), and the contract check that validates it in CI.
sources:
  - packages/wo/website-opportunities/domain/build-contract.mjs
  - packages/wo/website-opportunities/domain/build-contract-plan.mjs
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
- `choices` has at least one entry; at most one is `recommended`. `freeText.maxLength` is required: every question
  accepts a free text answer. `skippable: true` lets the customer skip it.
- An answer is `{schema, question, choice}`, `{schema, question, text}` or `{schema, question, skipped: true}`, exactly
  one of the three. It is valid only against its question: the choice is one of its choices, the text is not empty and
  holds at most `maxLength` characters, and only a skippable question is skipped.

## Build plan

The plan carries business facts with their sources, pages and their blocks, the data items each block shows, the look
section, the pictures summary, the assumptions and what was left out. **It carries no written copy**: headings, body
text and SEO text are written after approval. A block or page holding `heading`, `body`, `text`, `copy`, `lead`,
`paragraph`, `fields` or `seo` is rejected.

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
  `{kind: "own", source}` or `{kind: "text"}` (the business name set as text).
- **`pictures`**: `own.frames` filled by the business's own photos (with `from`, the sources), and `generated.frames`
  to be generated, at most 6 (`MAX_GENERATED_FRAMES`), with a `reason` when above zero.
- **`assumptions`**: what was assumed where sources were silent. Each names the plan `field` it set, which must be a
  field the customer can change, so every assumption is correctable by a plan edit. The list is required, even empty.
- **`leftOut`**: what was dropped, each with `kind` (`page`, `block`, `item`, `feature`) and its `reason`. Required,
  even empty.

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
- the edited plan, revision raised by one (`applyPlanEdit`), still passes the plan check; such a problem is reported at
  `plan <place>` with a message starting "after the edit".

## Progress events and outcome

A run is the full build after approval (`run: {id, kind: "build"}`) or a partial re-run after a plan edit
(`run: {id, kind: "partial", edit}`). Every progress event and the outcome carry `planId`, `planRevision`, `run`,
`elapsedSeconds` and the run's `steps`; progress events also carry `seq`, rising from 1.

```json
{ "id": "generated-pictures", "kind": "pictures", "label": "Generate 2 pictures for empty spots", "state": "running", "attempt": 2 }
```

- A step `kind` is `look`, `writer` (with the `page` it writes), `pictures` or `write`. The **write step is the last
  step, exactly once**. A site check is not a build step this round
  ([ADR 0047](../adr/0047-a-failing-build-step-stops-and-reports.md), decision 3): a step of kind `site-check` is
  rejected.
- `state` is `pending` (attempt 0), `running`, `done` or `failed`. A failing step is re-run once, so `attempt` is at
  most 2; a first failure shows as `running` with attempt 2, and **`failed` means the re-run failed too**.
- Every event of a run lists the same steps in the same order, and a done step stays done.

The outcome adds `result`:

- **`done`**: every step, ending with the write step, completed. An outcome of done that carries a failed, pending or
  running step is rejected. Done does not depend on a site check.
- **`stopped`**: exactly one step failed, and `stopped: {step, reason, teamNotified: true}` names it. The chat shows the
  could not finish state; the Tracy team is told.
- Any other result, such as `applied` or `complete`, is rejected: a build never reports those.

In a scenario a partial run builds the revision its edit produced, and a writer step names a page of that revision.

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
