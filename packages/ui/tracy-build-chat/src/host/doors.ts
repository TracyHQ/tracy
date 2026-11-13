/**
 * The build draft doors of tracy-web that `tracy_build` calls (TracyHQ/tracy#609): request and response shapes.
 *
 * tracy-web owns these doors and the engine behind them; this plugin only forwards to them. The README of this
 * package has the same contract as a table. Every door:
 *
 * - is called as the person who typed, with `x-tracy-actor` (the signed assertion the dsh gate mints for the latest
 *   prompter of the session) and `x-tracy-session` (the build session id, `session-build-<uuid>`), so tracy-web binds
 *   the call to that account's build session and draft;
 * - answers 403 when the session is not that account's build session or the build chat is switched off, 409 when
 *   the draft moved on (`STALE_EDIT`, a stale plan revision) or a step was not taken yet (`NO_DRAFT`, `NO_RESEARCH`,
 *   `NO_TEMPLATE`, `NO_KIT`, `NO_PLAN`), 422 when a request is refused, with `problems` the owner can read.
 *
 * Long work (research needs one model call for the needs profile; compose up to two) never holds a request open:
 * a door answers the engine state at once, `running` while the step works, and `GET /engine` reads it again.
 */

/** Contract B question (`tracy-build-question/v1`), as `docs/references/build-contract.md` describes it. */
export interface BuildQuestion {
  schema: 'tracy-build-question/v1'
  id: string
  topic: 'main-button' | 'contact-method' | 'site-language' | 'fact-conflict' | 'site-name'
  fact?: string
  prompt: string
  /** The buttons; an empty list on a `site-name` question, which is free text only. */
  choices: { id: string; label: string; detail?: string; recommended?: boolean }[]
  freeText: { maxLength: number; placeholder?: string }
  skippable?: boolean
}

/** Contract B answer (`tracy-build-answer/v1`): exactly one of `choice`, `text`, `skipped`. */
export type BuildAnswer = { schema: 'tracy-build-answer/v1'; question: string } & (
  | { choice: string }
  | { text: string }
  | { skipped: true }
)

/**
 * One `ask_user_question` request, as `askRequestOf` (`@tracy/core/build-chat`) makes it. A question with no choice has
 * `options: []`: dsh's card shows its text box alone.
 */
export interface AskRequest {
  questions: {
    id: string
    question: string
    options: { label: string; description?: string }[]
    multiSelect: boolean
    recommended?: string
  }[]
}

/** The engine steps a door can run. */
/**
 * `brand` is the pre-site brand step (#616): it runs once research and a template are in the draft (choosing the
 * template starts it), and `POST /compose` starts it instead of composing when the draft has no look record yet.
 * `revise` is a written change request on a living plan (#617): `POST /compose` with `request` on a draft that holds a
 * plan starts it.
 */
export type EngineStep = 'research' | 'brand' | 'compose' | 'revise' | 'edit'

/** What research found, small: the business's name and how many facts and services it holds. */
export interface ProfileSummary {
  business: string
  counts: Record<string, number>
}

/** The result of a finished research step. */
export interface ResearchResult {
  profile: ProfileSummary
  /** Every question the engine issued for this session from the needs profile; no fixed count. */
  questions: BuildQuestion[]
  /** The next card to show, for the questions not answered yet; absent when nothing is left to ask. */
  ask?: AskRequest
}

/** The result of a finished compose or edit step. */
export interface PlanResult {
  /** A Contract B plan (`tracy-build-plan/v1`) that passed the rules gate. */
  plan: any
  /** `own` when the plan carries the business's own colour and logo; `unavailable` is a stop, never a stand-in. */
  brand: 'own' | 'unavailable'
  /** Where the plan's accent and logo came from, as the plan composer answered them (#616). */
  lookSources?: { accent?: { from: string; name: string }; logo?: { from: string; name: string } }
  /**
   * Compose only: `true` when the draft already held a plan and compose kept it as it is, with the owner's edits
   * (#609). Nothing was composed; the answer's `say` tells the owner so.
   */
  unchanged?: true
}

/** One part of a change request that was not done: what, and why in words the owner reads; `reason` is for the team. */
export interface NotDone {
  what: string
  reason: 'no_recipe' | 'no_data' | 'fact_missing' | 'kept_private' | 'outside_plan'
  why: string
}

/**
 * The result of a finished revise step: the plan as it is now and the lines the owner reads, written by the plan step
 * in English (show `changed` and `why` verbatim, never `reason`). `unchanged: true` is no fault: the same plan, the same
 * revision, and `notDone` says why.
 */
export interface RevisionResult {
  plan: any
  brand: 'own'
  unchanged: boolean
  revision: { changed: string[]; notDone: NotDone[] }
}

/** A compose that needs one more answer from the owner first (the site name, #593 G4): the question to ask. */
export interface AskingResult {
  /** The one question the engine issued for this turn. */
  questions: BuildQuestion[]
  /** Its card. */
  ask: AskRequest
}

/**
 * The state of the session's engine work: what `POST /research`, `POST /compose`, `POST /edit` and `GET /engine`
 * answer. `state: 'done'` carries the step's `result`; `stopped` carries `say`, one plain sentence for the owner
 * (no fault reason, no code), after the step's one retry failed. `asking` is no fault: compose needs the owner's
 * answer first, its `result` carries the question and `say?` why it is asked again (a name too long for the design).
 * `step: null` with `state: 'idle'`: nothing started.
 */
export type EngineState =
  | { step: null; state: 'idle' }
  | { step: EngineStep; state: 'running' }
  | { step: 'research'; state: 'done'; result: ResearchResult }
  | { step: 'brand'; state: 'done'; result: { look: 'ready' } }
  | { step: 'compose' | 'edit'; state: 'done'; say?: string; result: PlanResult }
  | { step: 'revise'; state: 'done'; result: RevisionResult }
  | { step: 'compose'; state: 'asking'; say?: string; result: AskingResult }
  | { step: EngineStep; state: 'stopped'; say: string; reason?: 'brand-unavailable' | string }

/** `POST /api/build-draft/research`: starts research; creates the account's draft when it has none. */
export interface ResearchRequest {
  links: string[]
  description?: string
}

/**
 * `POST /api/build-draft/compose`: composes the plan for the chosen template, gated by the rules gate. On a draft that
 * already holds a plan it never composes, unless `restart` is set: with `request` it starts the `revise` step (422
 * `REQUEST_TOO_LONG` or `REQUEST_EMPTY` with `problems` when the text cannot be read), without one it answers that plan
 * as it is, `{step: 'compose', state: 'done', say, result: {..., unchanged: true}}`.
 */
export interface ComposeRequest {
  /** On a living plan: the owner's change request, in their own words, at most 1000 characters. Ignored otherwise. */
  request?: string
  /** Only when the owner asked to start the plan over: discards the living plan and its edits, then composes anew. */
  restart?: boolean
}

/** `POST /api/build-draft/edit`: one simple change applied to the current plan revision. */
export interface EditRequest {
  changes: { field: string; value: unknown }[]
}

/** `GET /api/build-draft/templates`: the templates the card may offer (`TemplateOption` of `@tracy/core/build-chat`). */
export interface TemplatesResponse {
  templates: {
    slug: string
    name: string
    version: string
    picture: string
    reason: string
    quickstart: string
    fits: boolean
    recommended?: boolean
  }[]
}

/** `PUT /api/build-draft/answers` (the existing draft door): one Contract B answer with its question. */
export interface AnswerRequest {
  question: BuildQuestion
  answer: BuildAnswer
}

/** Every refusal: a code for the team, a `next` for a developer, `problems` the owner can read (422 only). */
export interface DoorRefusal {
  code: string
  next?: string
  problems?: string[]
  say?: string
}

/** The doors, by name, as paths under `/api/build-draft`. */
export const BUILD_DOORS = {
  research: { method: 'POST', path: '/research' },
  compose: { method: 'POST', path: '/compose' },
  edit: { method: 'POST', path: '/edit' },
  engine: { method: 'GET', path: '/engine' },
  templates: { method: 'GET', path: '/templates' },
  answers: { method: 'PUT', path: '/answers' }
} as const
