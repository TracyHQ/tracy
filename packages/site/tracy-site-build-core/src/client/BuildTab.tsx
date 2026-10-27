/**
 * The Build tab of the side card (todo-build-with-experience.md §D1), one per CMS, four screens on one job:
 * Waiting (the tab opened, the agent has not sent its questions yet) → Form (the agent's questions,
 * or the standard six; three ways out) → Building (the inspiration's own layout as a skeleton
 * filling in stage by stage) → Built (the page with every word in, Tweaks above it). Ported from
 * `Mockups/Build with` (Lee, 07/09 16:50) and reshaped after Claude Design (Lee, 07/09 17:40: the
 * form is the agent's). Mode B, plain @tracy/ui.
 */
import { Button, cn, Skeleton, TabLoadingScope, useTabLoading } from '@tracy/ui'
import { AlertCircle, Loader2, Pencil, RotateCcw } from 'lucide-react'
import { type JSX, useEffect, useMemo, useRef, useState } from 'react'
import { nudgePaint } from '../../../../design/tracy-design-inspiration/src/client/fixture'
import {
  type Ask,
  type BuildApi,
  fetchFixture,
  fetchSite,
  fetchSlots,
  type Job,
  type Question,
  type SitePreview,
  type Slot,
  type Stage
} from './api'
import { BuildForm, PAGES } from './BuildForm'
import { readCarry, writeCarry } from './carry.mjs'
import { currentSiteKey, inOnboarding } from './dsh-url'
import { inspirationOf } from './inspiration.mjs'
import { savedPress } from './new-site.mjs'
import { filledAt, filledDoc, skeletonDoc } from './skeleton'
import { stageDetail } from './host-text'
import type { Translate } from './strings'
import { provisionBlocked, staleJob } from './whose-job.mjs'
import { interfaceLocale } from '@tracy/core/interface-languages'

export interface Meta {
  setupFailed?: boolean
  setupPending?: boolean
  /**
   * A provision that failed on a site that exists. Kept in the tab's meta, not in a component's
   * state, because the customer leaves this workspace while they wait — see `BuildForm`'s own note.
   */
  provisionFailed?: { siteKey: string; message: string }
  siteKey?: string
  id?: string
  name?: string
  platform?: string
  /**
   * When "Create with" was pressed. A tab the side card RESTORED from an earlier visit carries an
   * old one, and must not claim a site on its own — measured 15/09: a stale Build tab in the
   * creation workspace claimed a new site every time the page was opened.
   */
  pressedAt?: number
}

/** How long after the press a Build tab in the creation workspace still counts as that press. */
const PRESS_FRESH_MS = 120_000

const POLL_MS = 1500

/** What the tab knows about its plugin, beyond the api. */
export interface TabSpec {
  api: BuildApi
  platform: string
  platformName: string
  allowedLanguages?: readonly string[]
  onStarted?: (job: Job) => void
  /**
   * Persist a failed provision into the tab's meta — the same road `onStarted` takes for the
   * siteKey. `null` is the customer pressing Try again: the mark is forgotten so the form returns.
   */
  onProvisionFailed?: (failed: { siteKey: string; message: string } | null) => void
}

/** The person's language, the way the language question already reads it. */
function pageLang(): string {
  return document.documentElement.lang || 'en'
}

/** Index of the running stage, or the count when none runs (everything before it is settled). */
function stageIndex(job: Job | null, total: number): number {
  if (!job) return 0
  // Paused between stages: the next one to run is the first not yet settled.
  const i =
    job.status === 'paused'
      ? job.stages.findIndex((s) => s.status !== 'done' && s.status !== 'skipped')
      : job.stages.findIndex((s) => s.status === 'running' || s.status === 'waiting' || s.status === 'failed')
  return i === -1 ? total : i
}

// ─── The fixture, as skeleton or filled ───────────────────────────────────────────────────────

function useFixture(id: string | null): { html: string; slots: Slot[] } | null {
  const [files, setFiles] = useState<{ id: string; html: string; slots: Slot[] } | null>(null)
  useEffect(() => {
    if (!id) return
    let live = true
    Promise.all([fetchFixture(id), fetchSlots(id)])
      .then(([html, slots]) => {
        if (live) setFiles({ id, html, slots })
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [id])
  return files && files.id === id ? files : null
}

function PageFrame({
  id,
  site,
  stage,
  total,
  height = 460,
  bar,
  label
}: {
  /** The frame's accessible name, already translated. */
  label: string
  id: string | null
  site: SitePreview | null
  /** Index of the running stage; past `copy` fills the prose, past the end fills everything. */
  stage: number
  /** How many stages this build has. */
  total: number
  height?: number
  bar?: string
}): JSX.Element {
  const files = useFixture(id)
  const doc = useMemo(() => {
    if (!files) return null
    return stage >= total
      ? filledDoc(files.html, files.slots, site)
      : skeletonDoc(files.html, files.slots, site, filledAt(stage, total))
  }, [files, site, stage, total])
  const [width, setWidth] = useState(400)
  const scale = width / 1280
  return (
    <div
      className="overflow-hidden rounded-lg border border-border bg-card"
      ref={(el) => {
        if (el && el.clientWidth > 0 && el.clientWidth !== width) setWidth(el.clientWidth)
      }}
    >
      {bar ? (
        <div className="flex items-center gap-2 border-border border-b bg-muted/40 px-3 py-1.5 text-muted-foreground text-xs">
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="size-2 rounded-full bg-border" />
          <span className="ml-2 truncate">{bar}</span>
        </div>
      ) : null}
      <div style={{ height }} className="relative overflow-hidden">
        {doc ? (
          <iframe
            title={label}
            sandbox=""
            onLoad={(e) => nudgePaint(e.currentTarget)}
            tabIndex={-1}
            aria-hidden
            srcDoc={doc}
            className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
            style={{ width: 1280, height: height / scale, transform: `scale(${scale})` }}
          />
        ) : (
          <div className="flex flex-col gap-3 p-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The inspiration's picture and name over the form and the waiting screen.
 *
 * EXPORTED for the design bench alone (`Pages/In dsh/Build tab`), where the form is reviewed as its
 * own story: a header redrawn by hand there would be the one strip of that screen not coming from
 * this file, and the first thing to drift.
 */
export function BuildHeader({
  id,
  name,
  platformName,
  site,
  t
}: {
  id: string | null
  name: string
  /** How the customer reads the platform: "WordPress". */
  platformName: string
  site: SitePreview | null
  t: Translate
}): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0">
        <PageFrame id={id} site={site} stage={1} total={1} height={64} label={t('preview.title')} />
      </div>
      <div className="min-w-0">
        <div className="font-medium">{t('form.title', { platform: platformName })}</div>
        <div className="text-muted-foreground text-sm">{t('form.sub', { name })}</div>
      </div>
    </div>
  )
}

// ─── Waiting for the agent's questions ────────────────────────────────────────────────────────

function WaitingScreen({
  header,
  onSkip,
  t
}: {
  header: JSX.Element
  onSkip: () => void
  t: Translate
}): JSX.Element {
  return (
    <div className="flex flex-col gap-5 p-4">
      {header}
      <div className="flex items-start gap-3 rounded-md border border-border px-3 py-3">
        <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-primary" />
        <div className="flex flex-col gap-1">
          <span className="font-medium">{t('waiting.title')}</span>
          <span className="text-muted-foreground text-sm">{t('waiting.sub')}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
      <button
        type="button"
        className="self-start text-primary text-sm underline underline-offset-4"
        onClick={onSkip}
      >
        {t('waiting.skip')}
      </button>
    </div>
  )
}

// ─── Building ─────────────────────────────────────────────────────────────────────────────────

function stageWords(stage: Stage, t: Translate): string {
  return stage.status === 'done'
    ? t(`stage.${stage.name}.done` as never)
    : t(`stage.${stage.name}.run` as never)
}

function BuildingScreen({
  api,
  job,
  site,
  t
}: {
  api: BuildApi
  job: Job
  site: SitePreview | null
  t: Translate
}): JSX.Element {
  const total = api.stages.length
  const index = stageIndex(job, total)
  const failed = job.stages.find((s) => s.status === 'failed')
  const doneCount = job.stages.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const current = job.stages[index]
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center gap-2">
        {failed ? (
          <AlertCircle size={16} className="text-destructive" />
        ) : (
          <Loader2 size={16} className="animate-spin text-primary" />
        )}
        <span className="font-medium">
          {failed
            ? t('building.failed', { stage: stageWords(failed, t) })
            : job.status === 'paused'
              ? t('building.paused')
              : current
                ? `${stageWords(current, t)}…`
                : t(`stage.${api.stages[total - 1]}.done` as never)}
        </span>
        <span className="ml-auto text-muted-foreground text-xs tabular-nums">
          {t('building.count', { done: doneCount, total })}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full transition-all', failed ? 'bg-destructive' : 'bg-primary')}
          style={{ width: `${((doneCount + (failed ? 0 : 0.5)) / total) * 100}%` }}
        />
      </div>
      <PageFrame id={job.inspiration} site={site} stage={index} total={total} label={t('preview.title')} />
      {failed ? (
        <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
          <span>{stageDetail(t, failed)}</span>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void api.rerun(failed.name, undefined, job.targetSiteKey)}
            >
              <RotateCcw size={14} /> {t('building.retry')}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t('building.note')}</p>
      )}
    </div>
  )
}

// ─── The brief, read back ─────────────────────────────────────────────────────────────────────

/** A standard answer as the customer reads it: page and tone by their dictionary word, a language by its name. */
function answerWords(questionId: string, item: string, t: Translate): string {
  if (questionId === 'pages' && (PAGES as readonly string[]).includes(item)) return t(`page.${item}` as never)
  if (questionId === 'tone' && ['plain', 'warm', 'bold'].includes(item)) return t(`tone.${item}` as never)
  if (questionId === 'languages') {
    try {
      return (
        new Intl.DisplayNames([document.documentElement.lang || 'en'], { type: 'language' }).of(item) ?? item
      )
    } catch {
      return item
    }
  }
  return item
}

/**
 * The questionnaire as it was sent, read-only: the questions the form showed (the agent's own,
 * else the standard ones) and the answers under them, nothing summarised in. A question the
 * snapshot does not carry is not drawn; an answer it does not carry reads "Not provided".
 */
export function BriefSummary({
  job,
  fallback,
  onEdit,
  t
}: {
  job: Job
  /** The set to draw when the job carries no brief of its own — what the form showed. */
  fallback: Question[]
  onEdit: () => void
  t: Translate
}): JSX.Element {
  const questions = job.brief?.questions ?? fallback
  const answers = job.brief?.answers ?? job.answers ?? {}
  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="m-0 font-semibold text-base">{t('workspace.brief')}</h2>
          {job.brief?.updatedAt ? (
            <p className="m-0 text-muted-foreground text-xs">
              {t('brief.updated', { at: new Date(job.brief.updatedAt).toLocaleString(interfaceLocale()) })}
            </p>
          ) : null}
        </div>
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Pencil size={14} /> {t('brief.edit')}
        </Button>
      </div>
      <dl className="m-0 divide-y divide-border">
        {questions.map((question) => {
          const value = answers[question.id]
          const shown = Array.isArray(value)
            ? value.map((item) => answerWords(question.id, String(item), t)).join(', ')
            : typeof value === 'string' && value.trim() !== ''
              ? answerWords(question.id, value, t)
              : ''
          return (
            <div key={question.id} className="grid gap-1 py-3 sm:grid-cols-[140px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{question.label}</dt>
              <dd
                className={cn('m-0 whitespace-pre-wrap break-words', shown === '' && 'text-muted-foreground')}
              >
                {shown === '' ? t('brief.empty') : shown}
              </dd>
            </div>
          )
        })}
      </dl>
    </div>
  )
}

// ─── The tab ──────────────────────────────────────────────────────────────────────────────────

/** How long the opener's own waits may take before a pending mark is treated as stale. */
const PENDING_BUDGET_MS = 15000

/**
 * How long this tab waits for the agent's own questions before serving the standard ones.
 *
 * 🔒 WAITING FOR A QUESTION NOBODY WAS ASKED TO WRITE IS NOT WAITING, IT IS STOPPING. `WaitingScreen`
 * says "Tracy is preparing a few questions… They land here in a moment", and until now the only way
 * out of it was a link the customer had to notice and press. Nothing on the other side is obliged to
 * send an `ask`: measured 20/09/2026 on `site-4x82yk` (EmDash, `tracy-saas`), the session opened at
 * 09:04:08, took its preset, wrote its provision to-dos at 09:04:18 — and then ran NO turn at all.
 * Not a refusal, not an error: no first turn was ever started, so no `ask.json` was ever written,
 * and the panel promised "in a moment" for forty minutes.
 *
 * The rule is already this file's own, one state along: `pendingExpired` exists because "a form the
 * customer can fill beats a skeleton that never ends". The same sentence decides this one. The
 * budget is generous rather than tight — the agent's questions ARE better when they come, and they
 * come after a model round-trip on a site that may still be settling — but it is finite, because a
 * promise with no deadline is the part the customer reads as broken.
 */
const ASK_BUDGET_MS = 45000

/**
 * The Build tab: its body, under the one loading bar every Tracy tab shares (Akemi, 30/09) — the
 * bar runs while the tab reads the job it may already have, and the body stays empty meanwhile.
 */
export function BuildTab(props: { spec: TabSpec; meta: Meta; t: Translate }): JSX.Element {
  return (
    <TabLoadingScope label={props.t('loading.label')}>
      <BuildTabBody {...props} />
    </TabLoadingScope>
  )
}

function BuildTabBody({ spec, meta, t }: { spec: TabSpec; meta: Meta; t: Translate }): JSX.Element {
  const { api } = spec
  const openedAt = useRef(Date.now())
  const [job, setJob] = useState<Job | null | undefined>(undefined)
  const [ask, setAsk] = useState<Ask | null>(null)
  const [site, setSite] = useState<SitePreview | null>(null)
  const [standard, setStandard] = useState(false)
  const [editing, setEditing] = useState(false)
  /**
   * The questionnaire Tracy resolved for this platform and inspiration (three tiers: the archive's
   * own set, the CMS default an administrator chose, the standard file), or null while unasked or
   * unanswered. The bundled CMS default below is what the form draws in the meantime and whenever
   * the door does not answer — never an empty form, never a wait.
   */
  const [served, setServed] = useState<Question[] | null>(null)
  /** The design can never carry a second edition: the form asks for exactly one language. */
  const [oneLanguage, setOneLanguage] = useState(false)
  /** The exact candidate those questions came from (22/09) — carried into the build as its snapshot. */
  const [servedSet, setServedSet] = useState<{ id: string; revision: number; contentHash: string } | null>(
    null
  )
  /**
   * 🔒 "PENDING" IS A MOMENT, NOT A STATE TO KEEP. The opener marks the tab pending while it starts
   * the session and selects the preset (two bounded waits, 8 s + 5 s), then patches the meta. A
   * tab the side card restored from a previous page load carries that mark with nobody left to
   * clear it — "Preparing your … assistant…" for ever, measured 15/09 on the local stand. After
   * the opener's own budget the form is shown regardless: a form the customer can fill beats a
   * skeleton that never ends.
   */
  const [pendingExpired, setPendingExpired] = useState(false)
  useEffect(() => {
    if (!meta.setupPending) return undefined
    const timer = window.setTimeout(() => setPendingExpired(true), PENDING_BUDGET_MS)
    return () => window.clearTimeout(timer)
  }, [meta.setupPending])
  /**
   * The same budget, for the wait that had none — see `ASK_BUDGET_MS`. It runs from the moment the
   * tab opened, not from a render, so a tab restored by the side card does not start its promise
   * over; `openedAt` is already what the rest of this component dates itself by.
   *
   * It only ever moves TOWARDS a form. If the agent's `ask` lands first, `askMatches` wins on the
   * next render and this flag is never consulted — an arriving question is not overridden by a
   * timer that happened to fire.
   */
  const [askExpired, setAskExpired] = useState(false)
  useEffect(() => {
    const spent = Date.now() - openedAt.current
    const timer = window.setTimeout(() => setAskExpired(true), Math.max(0, ASK_BUDGET_MS - spent))
    return () => window.clearTimeout(timer)
  }, [])
  const [questionsFailed, setQuestionsFailed] = useState(false)
  const [questionsTry, setQuestionsTry] = useState(0)
  // Which inspiration this tab is about — ONE answer, shared by the fetch below and the header
  // further down. See `inspiration.mjs` for why deciding it twice drew a card over nothing.
  const inspirationId = inspirationOf({ job, meta, ask, carry: readCarry() })
  const askedFor = inspirationId
  useEffect(() => {
    let live = true
    setServed(null)
    setQuestionsFailed(false)
    if (!askedFor) return undefined
    // Tracy's door first (three tiers), the plugin's own door second (its questions.json). Both
    // out of reach is said, with a retry — never an empty form and never a form of guesses.
    void api.fetchQuestions(spec.platform, askedFor, pageLang()).then((r) => {
      if (!live) return
      if (r) {
        setServed(r.questions)
        setServedSet(r.set ?? null)
        setOneLanguage(r.languages === 'one')
      } else setQuestionsFailed(true)
    })
    return () => {
      live = false
    }
  }, [api, spec.platform, askedFor, questionsTry])

  useEffect(() => {
    fetchSite()
      .then(setSite)
      .catch(() => undefined)
  }, [])

  // The job and the form the agent sent, polled together while anything can change. Once this tab
  // has a job it follows THAT site's — a customer with two builds going has two tabs, and each
  // must keep reading its own (build.mjs: one job per site).
  const following = meta.siteKey ?? job?.targetSiteKey
  useEffect(() => {
    let live = true
    const read = async () => {
      const [nextJob, nextAsk] = await Promise.all([api.fetchJob(following), api.fetchAsk()])
      if (!live) return
      setJob(nextJob)
      setAsk(nextAsk)
    }
    void read()
    const timer = window.setInterval(() => {
      void read()
    }, POLL_MS)
    return () => {
      live = false
      window.clearInterval(timer)
    }
  }, [api, following])

  // 🔒 A CLOSED TAB TAKES ITS CARRY WITH IT, NOT ITS PRESS. Everything above that knows a press is
  // being continued reads the carry — which inspiration this tab is about, whether the questions show
  // at once — and the carry lives in `sessionStorage`, which dies with the tab. Without it a customer
  // who pressed Build and closed the tab came back to "They land here in a moment" and, once the
  // questions came, had to answer them again (measured 23/09/2026 on Joomla and WordPress). The press
  // is also on the site's creation row; the press door hands it back to the account that made it
  // while its build has not started, and it is put back where the rest of this tab already looks:
  // the carry, with the provision job, so the form's resume waits for the handover and builds.
  const [pressRestored, setPressRestored] = useState(false)
  useEffect(() => {
    if (job !== null || pressRestored || inOnboarding()) return undefined
    const here = currentSiteKey()
    if (!here) return undefined
    if (readCarry(undefined, { platform: spec.platform })?.siteKey === here) return undefined
    let live = true
    void savedPress(here).then((saved) => {
      if (!live || saved === null) return
      writeCarry({
        id: saved.id,
        platform: spec.platform,
        answers: saved.answers,
        siteKey: here,
        pressedAt: Date.now(),
        ...(saved.jobId ? { jobId: saved.jobId } : {})
      })
      setPressRestored(true)
    })
    return () => {
      live = false
    }
  }, [job, pressRestored, spec.platform])

  // Only the first read of the job is "the tab loading". Preparing the assistant (below) is a
  // process the customer is told about in words, and keeps them.
  const readingJob = job === undefined && !meta.setupFailed && !(meta.setupPending && !pendingExpired)
  useTabLoading(readingJob)

  if (meta.setupFailed) {
    return (
      <div role="alert" className="tracy-site-build p-4 text-destructive">
        {t('form.setupFailed')}
      </div>
    )
  }
  if (meta.setupPending && !pendingExpired) {
    return (
      <div role="status" className="tracy-site-build flex flex-col gap-2 p-4 text-muted-foreground">
        <Skeleton className="h-6 w-1/2" />
        <span>{t('form.preparing', { platform: spec.platformName })}</span>
      </div>
    )
  }
  if (job === undefined) return <></>

  const stale = staleJob(job, meta, openedAt.current)
  /**
   * This page is the site a press already claimed, and the build has not started: the carry names
   * it. What the form draws here is the rest of that same press's questions.
   */
  const continuingClaim = (() => {
    const c = readCarry()
    return c?.siteKey !== undefined && c.siteKey === currentSiteKey() && job == null
  })()
  const current = stale ? null : job
  const needsForm =
    editing || current === null || (current.status === 'waiting' && current.waiting?.startsWith('form:'))
  // One resolution, decided above with `askedFor`, so the header names exactly what was asked
  // about. The sign-in carry is part of it: signing in ends in a reload, and it is the only thing
  // that remembers what the customer picked (tasks/todo-build-new-site.md).
  const id = current?.inspiration ?? inspirationId
  // This tab builds one platform; the rest of the meta says which inspiration.
  const platform = spec.platform
  const name = meta.name ?? id ?? ''
  const header = <BuildHeader id={id} name={name} platformName={spec.platformName} site={site} t={t} />

  if (needsForm && id) {
    // The agent's questions, or the standard six once it sent none and the customer waved the wait
    // off (or the engine came back for answers — then the standard ones name the missing fields).
    //
    // 🔒 IN THE CREATION WORKSPACE THE STANDARD QUESTIONS SHOW AT ONCE. There is no site for an
    // agent to read and nothing was asked of it; a first form that waited on a model round-trip
    // — or on a preset that could not run there — showed "Tracy is preparing a few questions…"
    // and nothing else. The agent's own questions are for a site that already exists.
    // …and in a site that was CLAIMED but not yet built, for the same reason: the form there is the
    // second half of the same press (`todo-claim-then-workspace.md`), and the site has no content
    // for an agent to read yet.
    const standardAtOnce = inOnboarding() || continuingClaim
    const askMatches = !standardAtOnce && ask !== null && ask.inspiration === id
    const questions = current?.brief?.questions ?? (askMatches && ask.questions ? ask.questions : served)
    if (questions === null) {
      return (
        <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
          {questionsFailed ? (
            <div className="flex flex-col gap-3 p-4">
              {header}
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
                {t('form.questionsFailed')}
              </div>
              <Button variant="outline" onClick={() => setQuestionsTry((n) => n + 1)}>
                {t('form.retry')}
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-4">
              {header}
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-2/3" />
            </div>
          )}
        </div>
      )
    }
    /**
     * 🔒 A SITE THAT COULD NOT BE STOOD UP IS NOT A SITE WAITING FOR QUESTIONS.
     *
     * `WaitingScreen` says "Tracy is preparing a few questions… Answer them, and the build starts".
     * For a site whose provision died there is nothing preparing and nothing to start, and the
     * spinner never ends. Measured 19/09/2026 on `site-5big32`: provision failed after 2.04
     * seconds on a 404 from the quickstart release, the chat's task list said exactly that, and
     * this panel — the one the customer was looking at — span indefinitely. They read it as the
     * build refusing to run alongside their other site.
     *
     * It is checked HERE, ahead of every form branch, because a failed provision outranks both the
     * agent's questions and the standard ones: none of them can be answered into a site that does
     * not exist. `BuildForm` still shows its own notice and Retry while the tab is alive; this is
     * what survives the customer leaving the workspace and coming back.
     */
    if (provisionBlocked(meta, job)) {
      return (
        <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
          <div className="flex flex-col gap-3 p-4">
            {header}
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm"
            >
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-destructive" />
              <span>{t('form.provisionFailed')}</span>
            </div>
            <Button variant="outline" onClick={() => spec.onProvisionFailed?.(null)}>
              <RotateCcw size={14} /> {t('form.retry')}
            </Button>
          </div>
        </div>
      )
    }
    // 🔒 THE BUDGET ONLY ENDS THE WAIT WHEN THERE IS SOMETHING TO END IT WITH. Flipping to the
    // standard set while `served` is still null would swap this promise for the questionnaire
    // skeleton below — a second spinner with no words on it, which is strictly worse than the one
    // that at least says what it is waiting for. So the wait ends on a form, or on an error that
    // offers Retry, and never on a timer alone.
    const waitedLongEnough = askExpired && (served !== null || questionsFailed)
    if (!standardAtOnce && !askMatches && !standard && !waitedLongEnough && current === null) {
      return (
        <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
          <WaitingScreen header={header} onSkip={() => setStandard(true)} t={t} />
        </div>
      )
    }
    return (
      <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
        {editing ? (
          <div className="flex items-center justify-between gap-2 px-4 pt-4">
            <p className="m-0 text-muted-foreground text-xs">{t('brief.editNote')}</p>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              {t('brief.cancel')}
            </Button>
          </div>
        ) : null}
        <BuildForm
          key={`${id}:${ask?.at ?? 'standard'}`}
          api={api}
          id={id}
          name={name}
          platform={platform}
          platformName={spec.platformName}
          questions={questions}
          questionnaireSet={servedSet}
          allowedLanguages={spec.allowedLanguages}
          oneLanguage={oneLanguage}
          uiLang={pageLang()}
          prefill={askMatches ? ask?.answers : undefined}
          agentSent={askMatches || Boolean(current?.brief?.questions)}
          site={site}
          job={current?.brief ? { ...current, answers: current.brief.answers } : current}
          fresh={typeof meta.pressedAt === 'number' && Date.now() - meta.pressedAt < PRESS_FRESH_MS}
          t={t}
          header={header}
          onProvisionFailed={spec.onProvisionFailed}
          onStarted={(next) => {
            setJob(next)
            setEditing(false)
            spec.onStarted?.(next)
          }}
        />
      </div>
    )
  }
  if (current === null) {
    return <div className="tracy-site-build p-4 text-muted-foreground text-sm">{t('waiting.sub')}</div>
  }
  return (
    <div className="tracy-site-build h-full overflow-y-auto text-foreground text-sm">
      {current.status === 'done' ? (
        <BriefSummary job={current} fallback={served ?? []} onEdit={() => setEditing(true)} t={t} />
      ) : (
        <BuildingScreen api={api} job={current} site={site} t={t} />
      )}
    </div>
  )
}
