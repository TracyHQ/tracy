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
 *   the draft moved on (a stale plan revision), 422 when a request is refused, with `problems` the owner can read.
 *
 * Long work (research needs one model call for the needs profile; compose up to two) never holds a request open:
 * a door answers the engine state at once, `running` while the step works, and `GET /engine` reads it again.
 */

/** Contract B question (`tracy-build-question/v1`), as `docs/references/build-contract.md` describes it. */
export interface BuildQuestion {
  schema: 'tracy-build-question/v1'
  id: string
  topic: 'main-button' | 'contact-method' | 'site-language' | 'fact-conflict'
  fact?: string
  prompt: string
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

/** One `ask_user_question` request, as `askRequestOf` (`@tracy/core/build-chat`) makes it. */
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
export type EngineStep = 'research' | 'compose' | 'edit'

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
}

/**
 * The state of the session's engine work: what `POST /research`, `POST /compose`, `POST /edit` and `GET /engine`
 * answer. `state: 'done'` carries the step's `result`; `stopped` carries `say`, one plain sentence for the owner
 * (no fault reason, no code), after the step's one retry failed. `step: null` with `state: 'idle'`: nothing started.
 */
export type EngineState =
  | { step: null; state: 'idle' }
  | { step: EngineStep; state: 'running' }
  | { step: 'research'; state: 'done'; result: ResearchResult }
  | { step: 'compose' | 'edit'; state: 'done'; result: PlanResult }
  | { step: EngineStep; state: 'stopped'; say: string; reason?: 'brand-unavailable' | string }

/** `POST /api/build-draft/research`: starts research; creates the account's draft when it has none. */
export interface ResearchRequest {
  links: string[]
  description?: string
}

/** `POST /api/build-draft/compose`: composes the plan for the chosen template, gated by the rules gate. */
export interface ComposeRequest {
  /** The owner's request for a larger change, in their words; absent for the first plan. */
  request?: string
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
