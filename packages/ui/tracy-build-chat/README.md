# @tracy/dsh-build-chat

The build chat (TracyHQ/tracy#602, #609): the chat that builds a new site before the site exists.

- **Browser half** (`src/client/`, `lib/client.js`): the template card, the plan card, the build task list and the
  notice of a build that could not finish. Behind the UI switch `chat-build`. While the plan review waits, the review
  bar draws the plan card above itself (a turn tail shows only once its turn ends). A saved template pick is said in
  the chat as the owner ("I picked JA Boxing."), once, so the agent asks for the plan. While a `tracy_build` call
  waits, the input dock shows "Working on your site plan".
- **Host half** (`src/host/`, `lib/index.js`): the engine tool `tracy_build` and the guard on the build session's
  questions. It only forwards to tracy-web; it holds no secret and no engine logic.

## Where the tool is registered

Both bundles load this package with no config, so the cards can draw; that load registers nothing on the host. The
`site-builder` preset mounts the package again with `config.tool: true` (`scripts/gen-presets.ts`), which registers
`tracy_build` and the question guard in the build agent's own scope. No other session is sent the tool, and it is
never registered twice. The tool refuses any session that is not a build chat session (`isBuildChatSession`).

## What the tool does

| Action | Door | Result for the model |
|---|---|---|
| `research {links?, description?}` | `POST /research` | `{ profile: { business, counts }, ask? }` |
| `templates` | `GET /templates` | `{ options: TemplateOption[], none }` |
| `plan {request?}` | `POST /compose` | `{ plan: { id, revision }, review }`, or `{ ask, say?, next }` when the owner must answer first |
| `edit {changes}` | `POST /edit` | `{ plan: { id, revision }, review }` |
| `status` | `GET /engine` | whatever the running step gives when it finishes |

- `ask` is passed on from the door unchanged; `review` is `planReviewRequestOf(plan)`. The cards read the full plan
  from `GET /api/build-draft`.
- **Long work** (research: one model call; compose: up to two) is waited on for at most `BUILD_WAIT_MS` (90 seconds),
  polling `GET /engine`. Still running: `{ running: true, say }`, and the agent calls `status` to keep waiting.
- **Answers are never retyped by the model.** Before each call the tool reads the `ask_user_question` replies from the
  session log (`tool/call` and `tool/result` events), turns each into a Contract B answer with `answerOf` (an empty
  reply to a skippable question is a skip) and stores it with `PUT /answers`, once per answer.
- **An open question is not a fault.** A plan that needs the site name first (research keeps the business name off
  the site and nothing neutral names it) ends `asking`: the tool answers `{ ask, say?, next }`, the agent asks it and
  calls `plan` again. The site name question has no choice, so `ask` carries `options: []` and dsh's card shows its
  text box alone. A typed reply longer than its question's `freeText.maxLength` is never stored (dsh's text box sets
  no limit): the call answers the same `ask` again with `say`, the limit in plain words.
- **A fault is never a question.** A stopped step, a 403, a missing door, tracy-web unreachable, nobody to act as, or
  a plan without the business's own brand comes back as `{ stopped: true, say }`: one plain sentence, no `ask`.
- **The guard** (`ctx.tools.guard`): in a build chat session, `ask_user_question` passes only when every question id
  was issued by the engine for that session (the `questions` of a research result or of an `asking` compose, learned
  again from `GET /engine` after a restart), or is the plan review request handed out with a plan. The engine decides
  how many questions; the tool sets no limit.

## Door contract

Typed in [`src/host/doors.ts`](src/host/doors.ts). Every door is under `/api/build-draft`, implemented by tracy-web.

| Door | Request body | 2xx answer |
|---|---|---|
| `POST /research` | `{ links: string[], description?: string }` | `EngineState` (creates the draft when the account has none) |
| `GET /templates` | | `{ templates: TemplateOption[] }` |
| `POST /compose` | `{ request?: string }` | `EngineState` |
| `POST /edit` | `{ changes: { field, value }[] }` | `EngineState` (an edit applies to the current revision) |
| `GET /engine` | | `EngineState` of the session's latest step |
| `PUT /answers` (exists) | `{ question: BuildQuestion, answer: BuildAnswer }` | `{ draft }` |

`EngineState` is `{ step, state, result?, say? }`:

| `state` | Carries |
|---|---|
| `idle` | `step: null`: nothing started |
| `running` | `step`: `research`, `compose` or `edit` |
| `done` | `result`: research `{ profile, questions: BuildQuestion[], ask? }`; compose and edit `{ plan, brand: 'own' \| 'unavailable' }` |
| `asking` | compose only: `result: { questions: [BuildQuestion], ask }`, `say?`; no fault, the owner answers and the plan is asked for again |
| `stopped` | `say`: one plain sentence for the owner, after the step's one retry; `reason?` (`brand-unavailable`) for the team |

Headers and refusals:

| | |
|---|---|
| `x-tracy-actor` | the signed assertion for the person who typed (`tracyAssertion.mint` of the session's latest prompter) |
| `x-tracy-session` | the build session id, `session-build-<uuid>`; tracy-web binds the call to that account's build session |
| `403` | not this account's build session, or the build chat is switched off: the tool says `stopped` |
| `409` | `STALE_EDIT` (or any other code): stale, the plan moved on; the tool tells the agent to read `status` and try again. `NO_DRAFT`, `NO_RESEARCH`, `NO_TEMPLATE`, `NO_KIT`, `NO_PLAN`: a step not taken yet; the tool answers `{ missing, next }` naming the one action to take (research, templates, plan), never a retry |
| `422` | refused: `{ code, problems: string[] }`, problems the owner can read; never turned into a question |
