/**
 * The doors the Build tab knocks on: its own plugin's host half (`<prefix>/…`) and, read-only,
 * the design-inspiration plugin's — the inspiration's fixture and slot map draw the skeleton, the
 * site block fills it. Every path goes through `dshUrl` (LAW: `check-dsh-paths`).
 *
 * Made per plugin (`makeApi`): the prefix and the stage list are the CMS's own, everything else
 * is one recipe.
 */

import type { Workspace } from '../host/workspace'
import { dshUrl } from './dsh-url'
import { type JobRead, readJobAt } from './job-read.mjs'
import { currentSessionId } from './session-id.mjs'

export type { Comment, ReviewCheck, ReviewQuestion, Target, Workspace } from '../host/workspace'

export type StageStatus = 'pending' | 'running' | 'done' | 'skipped' | 'waiting' | 'failed'
export interface Stage {
  name: string
  status: StageStatus
  detail?: string
  /** Why it settled the way it did, when the stage knew: the Build tab decides with this, not with the sentence. */
  code?: string
  /** The code of `detail` when it is one of Tracy's own sentences (`hostText` reads it as `host.<code>`). */
  detailCode?: string
  /** The values that sentence was filled with. */
  detailParams?: Record<string, string | number>
  /**
   * What the stage measured, for the card to say in the customer's language (`detail` is the log's
   * English): `generated` values Tracy invented, `model` that wrote them (an id, never translated).
   */
  facts?: { generated?: number; model?: string }
  startedAt?: string
  endedAt?: string
}
/**
 * Which design a site is actually built with, as the fleet answered it.
 *
 * `requestedDesign` is what the customer picked in Design inspirations; `effectiveDesign` is what
 * the site gets. They differ whenever a picked inspiration has no Joomla template yet — the form
 * says so before the button, and nothing downstream is allowed to quietly conflate the two.
 */
export interface DesignPlan {
  requestedDesign: string
  effectiveDesign: string
  /** How a person reads the effective design: "Apple". */
  effectiveDesignName?: string
  baseQuickstart?: string
  template?: { element: string; version: string; source: string }
  contractProfile?: string | null
  registryRevision?: string
  workflow?: string
  fallback: boolean
  fallbackReason?: string
}

export interface Job {
  brief?: { questions?: Question[]; answers: Answers; updatedAt: string } | null
  contentRevision?: string
  job: string
  inspiration: string
  platform: string
  /** `paused`: stepped aside for a Tracy update, and continues by itself right after (#295). */
  status: 'running' | 'done' | 'waiting' | 'failed' | 'paused'
  startedAt: string
  endedAt?: string
  stages: Stage[]
  runs: number
  waiting?: string
  failed?: string
  rerun?: { stage: string; pages?: string[] }
  answers?: Answers
  /** The site this build dresses, when it is not the lane's own (tasks/todo-build-new-site.md). */
  targetSiteKey?: string
  /** That site's public address, as the fleet gave it — what the picture stage photographs. */
  targetUrl?: string
  /** What the fleet answered about this site's design when it created it. */
  designPlan?: DesignPlan
}

/** A question on the form the agent sent; the standard six are the tab's own when the agent sent none. */
export interface Question {
  id: string
  label: string
  /**
   * How the answer is drawn. `longtext` and `languages` used to be decided by the ids `about` and
   * `languages`; naming them lets a set of a release's own use either under any id (15/09).
   */
  kind: 'text' | 'longtext' | 'choice' | 'multi' | 'languages' | 'logo' | 'favicon'
  /** Which page of the form this question sits on, 1-based; absent is page one. */
  step?: number
  options?: string[]
  /** One language's label per option id, when the set ships them (tracy-questions/v1). */
  optionLabels?: Record<string, string>
  hint?: string
  /** Who reads the answer (`agent`, `seed.pages`, …) — carried so a message can say what was promised. */
  feeds?: string[]
  /** tracy-questions/v2: must be answered when shown. Absent (v1) means optional. */
  required?: boolean
  /** tracy-questions/v2: shown only when every clause holds on an EARLIER answer. */
  showWhen?: { all: { question: string; is?: string; has?: string }[] }
}

/** The exact candidate a form was served — what its submit is judged against, not the set of the day. */
export interface QuestionnaireSet {
  id: string
  revision: number
  contentHash: string
}

/** The snapshot a build carries: the set's identity and the questions as drawn. */
export interface Questionnaire {
  set: QuestionnaireSet
  questions: Question[]
}

/** What `/api/sites/questions` answers: which tier the set came from, and the set in one language. */
export interface ServedQuestions {
  source: 'quickstart' | 'default' | 'standard'
  owner: string
  quickstart: string | null
  questions: Question[]
  /** Absent from a server older than 22/09; then the build carries no snapshot. */
  set?: QuestionnaireSet
  /** `one` when the design can never carry a second edition: the site is built in ONE language. */
  languages?: 'one'
}
export interface Ask {
  answers?: Answers
  at: string
  inspiration: string
  platform: string
  questions?: Question[]
}
export interface Answers {
  name?: string
  about?: string
  pages?: string[]
  tone?: string
  languages?: string[]
  contact?: string
  /** Whatever else the agent asked, by question id. */
  [extra: string]: string | string[] | undefined
}

const json = { accept: 'application/json' }
const jsonIn = { 'content-type': 'application/json', accept: 'application/json' }

/** A door's refusal: its English sentence, and the code of that sentence when it is Tracy's own. */
export interface Refused {
  message: string
  messageCode?: string
  messageParams?: Record<string, string | number>
}

/**
 * The interface language of this page (`<html lang>`, which dsh's locale plugin keeps equal to the
 * picked language). Sent with the requests whose answer the host writes into the session's task
 * list, so those lines are in the language the page shows. Undefined outside a browser.
 */
function pageLang(): string | undefined {
  return typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined
}

/** What one plugin's tab and cards call — made once per plugin. */
export interface BuildApi {
  /** The stage names, in the order the host runs them. */
  stages: readonly string[]
  /** The route prefix under dsh's root. */
  prefix: string
  fetchAsk: () => Promise<Ask | null>
  fetchJob: (siteKey?: string) => Promise<Job | null>
  /** The same read, telling the host's "no job" apart from a read that could not be made (`job-read.mjs`). */
  readJob: (siteKey?: string) => Promise<JobRead>
  /** What the fleet says this design will actually build with. Null when it cannot say. */
  fetchDesignPlan: (design: string, platform: string) => Promise<DesignPlan | null>
  /** The questionnaire a new site of this platform will be asked — three tiers, resolved by Tracy. */
  fetchQuestions: (platform: string, design: string, lang: string) => Promise<ServedQuestions | null>
  startBuild: (
    id: string,
    platform: string,
    answers: Answers,
    targetSiteKey?: string,
    targetUrl?: string,
    designPlan?: DesignPlan,
    questionnaire?: Questionnaire
  ) => Promise<{ ok: true; job: Job } | ({ ok: false } & Refused)>
  sendAnswers: (answers: Answers, siteKey?: string, questionnaire?: Questionnaire) => Promise<boolean>
  /** A provision step for the task list; `detail` is the reason of a stop, in the reader's language when the page had words for it. */
  reportProvision: (step: string, detail?: string) => Promise<void>
  rerun: (stage: string, pages?: string[], siteKey?: string) => Promise<boolean>
  shotUrl: (job: Job) => string
  /** The six views' data for one built site: receipt targets, the agent's review, checks, comments. */
  fetchWorkspace: (siteKey: string) => Promise<Workspace | null>
  /**
   * One comment to the agent. Ids only — the host resolves target, question and check from what it
   * showed; `reportAt` names the review those ids were read from. The same `requestId` sent twice
   * is one delivery.
   */
  sendComment: (
    siteKey: string,
    comment: {
      requestId: string
      body: string
      targetId: string
      questionId?: string
      checkId?: string
      reportAt?: string
    }
  ) => Promise<{ ok: true } | { ok: false; message: string }>
  /** Ask the agent for a read-only inspection that ends in a review; one per `requestId`. */
  inspect: (siteKey: string, requestId: string) => Promise<{ ok: true } | { ok: false; message: string }>
}

/**
 * @param spec.name - the plugin's cordis name, `tracy-site-build-wordpress`. Its host half answers
 *   at `/api/<name>` — the one convention the two halves share, spelled here and in `host.ts`.
 * @param spec.stages - its stage names, in order.
 */
export function makeApi(spec: { name: string; stages: readonly string[] }, sessionId?: string): BuildApi {
  const prefix = `/api/${spec.name}`
  /**
   * A door on this plugin's host half, carrying the session the page is showing.
   *
   * WHY THE SESSION RIDES ALONG. These are plain GETs from a page, so the host cannot ask dsh which
   * session they belong to; it used to answer from the site the last TOOL call worked in, which is
   * wrong the moment two sessions on one lane build at once (measured 09/09). The address already
   * names the session; saying so costs one query parameter.
   */
  const door = (rest: string, siteKey?: string): string => {
    const base = dshUrl(`${prefix}/${rest}`)
    const url = siteKey ? `${base}${base.includes('?') ? '&' : '?'}site=${encodeURIComponent(siteKey)}` : base
    const id = sessionId ?? currentSessionId()
    return id === null ? url : `${url}${url.includes('?') ? '&' : '?'}session=${encodeURIComponent(id)}`
  }

  async function fetchAsk(): Promise<Ask | null> {
    try {
      const res = await fetch(door('ask'), { headers: json })
      if (!res.ok) return null
      return (await res.json()) as Ask
    } catch {
      return null
    }
  }

  function readJob(siteKey?: string): Promise<JobRead> {
    return readJobAt(door(siteKey ? `job?site=${encodeURIComponent(siteKey)}` : 'job'), { headers: json })
  }

  /** The job, or null for no job and for a read that failed alike. */
  async function fetchJob(siteKey?: string): Promise<Job | null> {
    const read = await readJob(siteKey)
    return read.state === 'job' ? (read.job as Job) : null
  }

  /**
   * The fleet's own answer to "what does this design actually build with".
   *
   * Asked of `/api/sites/design-plan`, which is Tracy's door and not this plugin's — the registry
   * that decides lives with the fleet, so the lane asks rather than keeps a copy that could age.
   * Null on any failure: a plan that cannot be fetched must not block a build, it only means the
   * form has nothing extra to say (same rule the add-site wizard's platform sniff follows).
   */
  async function fetchDesignPlan(design: string, platform: string): Promise<DesignPlan | null> {
    try {
      const res = await fetch(
        `/api/sites/design-plan?design=${encodeURIComponent(design)}&platform=${encodeURIComponent(platform)}`,
        { headers: json }
      )
      if (!res.ok) return null
      const body = (await res.json()) as { plan?: DesignPlan }
      return body.plan && typeof body.plan.effectiveDesign === 'string' ? body.plan : null
    } catch {
      return null
    }
  }

  /**
   * The questionnaire, asked of `/api/sites/questions` — Tracy's door, because the three tiers it
   * resolves (the archive's own set, the CMS default an administrator chose, the standard file) live
   * with the catalogue and the database, not in this lane. Null on any failure: the tab then draws
   * the CMS default it carries itself, so a form never waits on this.
   */
  async function fetchQuestions(
    platform: string,
    design: string,
    lang: string
  ): Promise<ServedQuestions | null> {
    try {
      const res = await fetch(
        `/api/sites/questions?platform=${encodeURIComponent(platform)}&design=${encodeURIComponent(design)}&lang=${encodeURIComponent(lang)}`,
        { headers: json }
      )
      if (!res.ok) return null
      const body = (await res.json()) as ServedQuestions
      return Array.isArray(body.questions) && body.questions.length > 0 ? body : null
    } catch {
      return null
    }
  }

  async function startBuild(
    id: string,
    platform: string,
    answers: Answers,
    /** The site this build dresses, when it is not the lane's own (tasks/todo-build-new-site.md). */
    targetSiteKey?: string,
    /** Its public address, from the fleet's job row — never assembled here. */
    targetUrl?: string,
    /** What the fleet answered about this site's design, carried so the job can say it. */
    designPlan?: DesignPlan,
    /** The questionnaire as served to this form — the snapshot the engine judges the answers by. */
    questionnaire?: Questionnaire
  ): Promise<{ ok: true; job: Job } | ({ ok: false } & Refused)> {
    try {
      const res = await fetch(door('start'), {
        method: 'POST',
        headers: jsonIn,
        body: JSON.stringify({
          id,
          platform,
          answers,
          targetSiteKey,
          targetUrl,
          designPlan,
          questionnaire,
          lang: pageLang()
        })
      })
      const body = (await res.json().catch(() => ({}))) as Partial<Job> & Partial<Refused> & { code?: string }
      if (res.status !== 202)
        return {
          ok: false,
          message: body.message ?? body.code ?? `${res.status}`,
          ...(typeof body.messageCode === 'string' ? { messageCode: body.messageCode } : {}),
          ...(body.messageParams && typeof body.messageParams === 'object'
            ? { messageParams: body.messageParams }
            : {})
        }
      return { ok: true, job: body as Job }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }

  async function sendAnswers(
    answers: Answers,
    siteKey?: string,
    questionnaire?: Questionnaire
  ): Promise<boolean> {
    try {
      const res = await fetch(door(siteKey ? `answers?site=${encodeURIComponent(siteKey)}` : 'answers'), {
        method: 'POST',
        headers: jsonIn,
        body: JSON.stringify({ answers, questionnaire })
      })
      return res.status === 202
    } catch {
      return false
    }
  }

  async function reportProvision(step: string, detail?: string): Promise<void> {
    try {
      await fetch(door('provision'), {
        method: 'POST',
        headers: jsonIn,
        body: JSON.stringify({ step, ...(detail ? { detail } : {}), lang: pageLang() })
      })
    } catch {
      // The Build tab remains the source of truth when an older host does not expose this route.
    }
  }

  async function rerun(stage: string, pages?: string[], siteKey?: string): Promise<boolean> {
    try {
      const res = await fetch(door(siteKey ? `rerun?site=${encodeURIComponent(siteKey)}` : 'rerun'), {
        method: 'POST',
        headers: jsonIn,
        body: JSON.stringify(pages ? { stage, pages } : { stage })
      })
      return res.status === 202
    } catch {
      return false
    }
  }

  async function fetchWorkspace(siteKey: string): Promise<Workspace | null> {
    try {
      const res = await fetch(door('workspace', siteKey), { headers: json })
      if (!res.ok) return null
      return (await res.json()) as Workspace
    } catch {
      return null
    }
  }

  const post = async (
    rest: string,
    siteKey: string,
    body: unknown
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const res = await fetch(door(rest, siteKey), {
        method: 'POST',
        headers: jsonIn,
        body: JSON.stringify(body)
      })
      if (res.ok) return { ok: true }
      const parsed = (await res.json().catch(() => ({}))) as { message?: string; code?: string }
      return { ok: false, message: parsed.message ?? parsed.code ?? `${res.status}` }
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
  }
  const sendComment: BuildApi['sendComment'] = (siteKey, comment) => post('comment', siteKey, comment)
  const inspect: BuildApi['inspect'] = (siteKey, requestId) => post('inspect', siteKey, { requestId })

  /** The picture the shot stage took, with a cache-buster so a rerun's picture replaces the old one. */
  const shotUrl = (job: Job): string =>
    `${door('home.png', job.targetSiteKey)}${door('home.png', job.targetSiteKey).includes('?') ? '&' : '?'}v=${encodeURIComponent(job.endedAt ?? job.job)}`

  return {
    stages: spec.stages,
    prefix,
    fetchAsk,
    fetchJob,
    readJob,
    fetchDesignPlan,
    fetchQuestions,
    startBuild,
    sendAnswers,
    reportProvision,
    rerun,
    shotUrl,
    fetchWorkspace,
    sendComment,
    inspect
  }
}

const inspiration = (rest: string): string => dshUrl(`/api/tracy-design-inspiration/${rest}`)

/** design-inspiration's site block — the words the skeleton fills with. */
export interface SitePreview {
  site: Record<string, unknown> & { name?: string | null; url?: string }
  pages: { path: string; type: string; label: string; data?: Record<string, unknown> }[]
}
export async function fetchSite(): Promise<SitePreview | null> {
  try {
    const res = await fetch(inspiration('site'), { headers: json })
    if (!res.ok) return null
    const body = (await res.json()) as { present?: boolean; site?: SitePreview }
    return body.present && body.site ? body.site : null
  } catch {
    return null
  }
}

const textCache = new Map<string, Promise<string>>()
/** The inspiration's own page, as text for `srcDoc` (see design-inspiration's `fetchFixture`). */
export function fetchFixture(id: string): Promise<string> {
  let p = textCache.get(id)
  if (!p) {
    p = fetch(inspiration(`systems/${encodeURIComponent(id)}/components.html`), {
      headers: { accept: 'text/html' }
    }).then(async (r) => {
      if (!r.ok) throw new Error(`fixture of ${id}: ${r.status}`)
      return r.text()
    })
    p.catch(() => textCache.delete(id))
    textCache.set(id, p)
  }
  return p
}

export interface Slot {
  id: string
  tag: string
  n: number
  role: string
  words: number
  text: string
  inNav?: boolean
}
const slotsCache = new Map<string, Promise<Slot[]>>()
export function fetchSlots(id: string): Promise<Slot[]> {
  let p = slotsCache.get(id)
  if (!p) {
    p = fetch(inspiration(`systems/${encodeURIComponent(id)}/slots`), { headers: json }).then(async (r) => {
      if (!r.ok) throw new Error(`slots of ${id}: ${r.status}`)
      const body = (await r.json()) as { slots?: Slot[] }
      return body.slots ?? []
    })
    p.catch(() => slotsCache.delete(id))
    slotsCache.set(id, p)
  }
  return p
}

export interface Inspiration {
  id: string
  name: string
  category?: string
}
let catalogOnce: Promise<Inspiration[]> | null = null
export function fetchCatalog(): Promise<Inspiration[]> {
  catalogOnce ??= fetch(inspiration('catalog'), { headers: json })
    .then(async (r) => {
      if (!r.ok) throw new Error(`catalog: ${r.status}`)
      const body = (await r.json()) as { systems?: Inspiration[] }
      return body.systems ?? []
    })
    .catch((error: unknown) => {
      catalogOnce = null
      throw error
    })
  return catalogOnce
}
