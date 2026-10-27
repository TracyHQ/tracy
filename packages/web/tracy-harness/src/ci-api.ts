// Shapes returned by the staff-only CI doors. The browser never talks to GitHub's API directly.
import { relativeTime as relativeAge } from './cms/relative-time.ts'
import { en } from './i18n/ns/ci.ts'
import { type Params, translate } from './i18n/translator.ts'

export type CiT = (key: string, params?: Params) => string
/** English: the default for helpers called without the screen's `t`, and the agent text (read by a model). */
export const ciEnglish: CiT = (key, params) => translate('en', en, en, key, params)
/** A stored message: one of this namespace's keys, or text relayed verbatim (a browser or server error). */
export const ciMessage = (t: CiT, message: string) => (Object.hasOwn(en, message) ? t(message) : message)

export interface CiStep {
  name: string
  number: number
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
}
export interface CiCheck {
  id: string
  name: string
  workflow: string | null
  status: string
  conclusion: string | null
  url: string | null
  startedAt: string | null
  completedAt: string | null
  summary: string | null
  steps: CiStep[]
  stepsComplete?: boolean
}
export interface CiJob extends CiCheck {
  runId: number
  runAttempt: number
  runnerAssignment?: 'assigned' | 'unassigned' | 'unknown'
  labels: string[]
  runner: { id: number; name: string; status: 'online' | 'offline' | 'unknown'; busy: boolean | null } | null
  measuredAt: string
}
export interface CiExecution {
  jobs: CiJob[]
  complete: boolean
  error: string | null
  runnersMeasuredAt: string | null
  runnerError: string | null
}
export interface CiRow {
  id: number
  unread?: boolean
  readAt?: string | null
  title: string
  url: string
  authorId: string
  author: string
  login: string | null
  commit: string
  mergeCommit?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  committedAt: string | null
  mergedAt: string | null
  target: string
  state: string
  build: string
  next: string
  merged: boolean
  queue: number | null
  queuedAt: string | null
  queueState: string | null
  estimateSeconds: number | null
  queueEnabled: boolean
  mergeState: string
  review: string | null
  checks: CiCheck[]
  checksComplete: boolean
  progress: { value: number; label: string; tone: string } | null
  deployment: {
    label: string
    checks: CiCheck[]
    stage?: string | null
    failed?: boolean
    coverage?: { workflow: string; commit: string }[]
  }
  note: string
  detail: string
  outcome: string
  execution?: CiExecution
}
export interface CiPayload {
  rows: CiRow[]
  members: { id: string; name: string; login: string | null }[]
  viewer: { authorId: string | null; linked: boolean }
  readAccount?: string
  repo: string
  measuredAt: string | null
  truncated: boolean
  recentMergedLimit: number | null
  scope?: { branch: string; dateField: string; range: string; from: string | null; to: string | null } | null
  stale: boolean
  error: string | null
  configured: boolean
  runnerStatus?: { measuredAt: string | null; error: string | null }
}
export type SortKey =
  | 'id'
  | 'title'
  | 'author'
  | 'committedAt'
  | 'commit'
  | 'mergedAt'
  | 'queue'
  | 'state'
  | 'build'
  | 'target'
  | 'currentStep'
  | 'runner'
  | 'duration'
  | 'step'
const COLUMN_KEYS: readonly SortKey[] = [
  'id',
  'step',
  'title',
  'build',
  'currentStep',
  'runner',
  'duration',
  'author',
  'committedAt',
  'commit',
  'mergedAt',
  'queue',
  'state',
  'target'
]
export const ciColumns = (t: CiT = ciEnglish): { key: SortKey; label: string; hint: string }[] =>
  COLUMN_KEYS.map((key) => ({ key, label: t(`ci.column.${key}.label`), hint: t(`ci.column.${key}.hint`) }))
export const executionColumn = (key: SortKey) => ['build', 'currentStep', 'runner', 'duration'].includes(key)
export function runnerLabel(runner: CiJob['runner'], t: CiT = ciEnglish): string {
  if (!runner) return t('ci.runner.notAssigned')
  return t(
    runner.status === 'offline'
      ? 'ci.runner.offline'
      : runner.status === 'online'
        ? runner.busy === null
          ? 'ci.runner.online'
          : runner.busy
            ? 'ci.runner.onlineBusy'
            : 'ci.runner.onlineIdle'
        : 'ci.runner.availabilityUnknown'
  )
}
export function durationLabel(seconds: number | null, t: CiT = ciEnglish): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return t('ci.duration.seconds', { s: Math.floor(seconds) })
  return seconds < 3600
    ? t('ci.duration.minutes', { m: Math.floor(seconds / 60), s: Math.floor(seconds % 60) })
    : t('ci.duration.hours', { h: Math.floor(seconds / 3600), m: Math.floor(seconds / 60) % 60 })
}
export function jobDuration(job: CiJob, now: number) {
  if (!job.startedAt) return null
  const finish = job.status === 'COMPLETED' ? Date.parse(job.completedAt ?? '') : now
  const seconds = (finish - Date.parse(job.startedAt)) / 1000
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null
}
export function releaseDuration(row: CiRow, now: number, stage = row.deployment.stage) {
  const checks = row.deployment.checks.filter((check) =>
    stage === 'Building image'
      ? check.name === 'build'
      : stage === 'Deploying' && check.name.startsWith('deploy-')
  )
  const started = checks.filter(
    (check) => ['IN_PROGRESS', 'COMPLETED'].includes(check.status) && check.startedAt
  )
  if (!started.length) return null
  const starts = started.map((check) => Date.parse(check.startedAt!))
  const ends = started.map((check) =>
    check.status === 'COMPLETED' ? Date.parse(check.completedAt ?? '') : now
  )
  if ([...starts, ...ends].some((time) => !Number.isFinite(time))) return null
  return Math.max(0, (Math.max(...ends) - Math.min(...starts)) / 1000)
}

export function rowDuration(row: CiRow, now = Date.now()) {
  if (!row.merged) return executionSummary(row, now).duration
  return releaseDuration(row, now, row.deployment.stage === 'Live' ? 'Deploying' : row.deployment.stage)
}

export function executionSummary(row: CiRow, now = Date.now(), t: CiT = ciEnglish) {
  const jobs = row.execution?.jobs ?? []
  const active = jobs.filter((job) => job.status === 'IN_PROGRESS')
  const waiting = jobs.filter((job) => job.status !== 'COMPLETED' && job.status !== 'IN_PROGRESS')
  const runningStep = active[0]?.steps.find((step) => step.status === 'IN_PROGRESS')
  const currentRunners = new Map(
    jobs.filter((job) => job.status !== 'COMPLETED' && job.runner).map((job) => [job.runner!.id, job.runner!])
  )
  const displayedRunners = jobs.some((job) => job.status !== 'COMPLETED')
    ? [...currentRunners.values()]
    : [...new Map(jobs.filter((job) => job.runner).map((job) => [job.runner!.id, job.runner!])).values()]
  const displayedNames = displayedRunners.map((runner) => runner.name)
  const waitingLabel = t('ci.execution.jobsWaiting', { count: waiting.length })
  const starts = jobs.map((job) => Date.parse(job.startedAt ?? '')).filter(Number.isFinite)
  const unfinished = jobs.some((job) => job.status !== 'COMPLETED')
  const finishes = jobs.filter((job) => job.startedAt).map((job) => Date.parse(job.completedAt ?? ''))
  const end = unfinished
    ? now
    : finishes.length && finishes.every(Number.isFinite)
      ? Math.max(...finishes)
      : null
  const duration =
    row.execution?.complete && starts.length && end !== null
      ? Math.max(0, (end - Math.min(...starts)) / 1000)
      : null
  // A running step's name is the workflow's own text, shown verbatim.
  const step =
    active.length > 1
      ? t('ci.execution.jobsRunning', { count: active.length })
      : runningStep
        ? runningStep.name
        : active.length
          ? t('ci.execution.starting')
          : waiting.length
            ? waitingLabel
            : row.build === 'Not started'
              ? t('ci.execution.notStarted')
              : row.execution?.complete && jobs.length
                ? t('ci.execution.checksFinished')
                : row.execution?.error
                  ? t('ci.execution.detailsIncomplete')
                  : t('ci.execution.noDetails')
  const runner =
    displayedNames.length > 1
      ? t('ci.runner.count', { count: displayedNames.length })
      : (displayedNames[0] ??
        (waiting.length
          ? waiting.some((job) => job.runnerAssignment === 'unknown')
            ? t('ci.runner.unknown')
            : t('ci.runner.notAssigned')
          : row.build === 'Not started'
            ? '—'
            : t('ci.runner.unknown')))
  const unassigned = waiting.some((job) => !job.runner && job.runnerAssignment !== 'unknown')
  return {
    step,
    runner,
    duration,
    waitingNote: waiting.length
      ? unassigned
        ? `${waitingLabel} · ${t('ci.runner.notAssignedYet')}`
        : waitingLabel
      : null
  }
}
const BUILD_ORDER = [
  'Failed',
  'Building',
  'Queued',
  'Ready',
  'Incomplete',
  'Cancelled',
  'Not started',
  'Unknown'
]
export const needsAttention = (row: CiRow) =>
  Boolean(failureGuidance(row)) ||
  [
    'Needs a fix',
    'Waiting for review',
    'Changes requested',
    'Merge conflict',
    'Merge blocked',
    'Checks incomplete',
    'Status unknown'
  ].includes(row.state)
const TIME_COLUMN: Record<string, string> = {
  'Waiting to run': 'waitingToRun',
  'Checking/Testing': 'checking',
  'Ready to merge': 'readyToMerge',
  Merged: 'merged',
  'Merged / Building image': 'mergedBuilding',
  'Building image': 'buildingImage',
  Deploying: 'deploying',
  Live: 'live',
  'Needs attention': 'attention'
}
export function filterTimeColumn(filter: string, t: CiT = ciEnglish) {
  const id = Object.hasOwn(TIME_COLUMN, filter) ? TIME_COLUMN[filter] : 'default'
  return { label: t(`ci.time.${id}.label`), hint: t(`ci.time.${id}.hint`) }
}
export function filterTime(row: CiRow, filter: string): string | null {
  const times = (values: (string | null | undefined)[], latest: boolean) => {
    const dates = values.map((value) => Date.parse(value ?? '')).filter(Number.isFinite)
    return dates.length ? new Date((latest ? Math.max : Math.min)(...dates)).toISOString() : null
  }
  if (filter === 'Merged / Building image')
    return row.deployment.stage === 'Building image' ? filterTime(row, 'Building image') : row.mergedAt
  if (filter === 'Waiting to run') return null
  if (filter === 'Merged') return row.mergedAt
  if (filter === 'Checking/Testing')
    return times(
      (row.execution?.jobs ?? [])
        .filter((job) => ['IN_PROGRESS', 'COMPLETED'].includes(job.status))
        .map((job) => job.startedAt),
      false
    )
  if (filter === 'Ready to merge')
    return times(
      row.checks
        .filter((check) => check.status === 'COMPLETED' && check.conclusion !== 'SKIPPED')
        .map((check) => check.completedAt),
      true
    )
  if (['Building image', 'Deploying', 'Live'].includes(filter)) {
    const checks = row.deployment.checks.filter((check) =>
      filter === 'Building image' ? check.name === 'build' : check.name.startsWith('deploy-')
    )
    if (filter === 'Live') {
      if (
        row.deployment.stage !== 'Live' ||
        !checks.length ||
        checks.some(
          (check) =>
            check.status !== 'COMPLETED' ||
            check.conclusion !== 'SUCCESS' ||
            !Number.isFinite(Date.parse(check.completedAt ?? ''))
        )
      )
        return null
      return times(
        checks.map((check) => check.completedAt),
        true
      )
    }
    return times(
      checks
        .filter((check) => ['IN_PROGRESS', 'COMPLETED'].includes(check.status))
        .map((check) => check.startedAt),
      false
    )
  }
  if (filter === 'Needs attention')
    return times(
      [...row.checks, ...row.deployment.checks]
        .filter((check) =>
          ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(check.conclusion ?? '')
        )
        .map((check) => check.completedAt),
      true
    )
  return row.committedAt
}

export function sortedRows(
  rows: CiRow[],
  key: SortKey,
  descending: boolean,
  now = Date.now(),
  filter = 'All PRs'
) {
  function value(row: CiRow) {
    if (key === 'step') return prStep(row)?.index ?? null
    if (key === 'committedAt') return filterTime(row, filter)
    if (key === 'currentStep') return executionSummary(row, now).step
    if (key === 'runner') return executionSummary(row, now).runner
    if (key === 'duration') return rowDuration(row, now)
    return row[key]
  }
  return [...rows].sort((a, b) => {
    const x = value(a),
      y = value(b)
    if (x == null || y == null) return x === y ? a.id - b.id : x == null ? 1 : -1
    const delta =
      key === 'build'
        ? BUILD_ORDER.indexOf(a.build) - BUILD_ORDER.indexOf(b.build)
        : key === 'queue' && a.target !== b.target
          ? a.target.localeCompare(b.target)
          : key === 'committedAt' || key === 'mergedAt'
            ? Date.parse(String(x)) - Date.parse(String(y))
            : typeof x === 'number' && typeof y === 'number'
              ? x - y
              : String(x).localeCompare(String(y), 'en')
    return (descending ? -delta : delta) || a.id - b.id
  })
}
/** One reading of "N minutes ago" for every screen (`cms/relative-time.ts`); a dash when there is no time. */
export const relativeTime = (time: string | null, now = Date.now()) => relativeAge(time, now) ?? '—'
export const exactTime = (time: string | null, t: CiT = ciEnglish) =>
  time ? new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : t('ci.time.unknown')
export function githubLink(value: string | null) {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      url.pathname.toLowerCase().startsWith('/tracyhq/tch/')
      ? url.href
      : null
  } catch {
    return null
  }
}

export function checkLabel(check: { status: string; conclusion: string | null }, t: CiT = ciEnglish): string {
  const result = check.conclusion
  if (result === 'SUCCESS') return t('ci.check.passed')
  if (result === 'SKIPPED') return t('ci.check.skipped')
  if (result === 'NEUTRAL') return t('ci.check.neutral')
  if (result === 'CANCELLED') return t('ci.check.cancelled')
  if (result) return t('ci.check.attention')
  return t(check.status === 'IN_PROGRESS' ? 'ci.check.running' : 'ci.check.waiting')
}

export function waitingToRun(row: CiRow): boolean {
  if (row.merged) return false
  if (row.build === 'Queued') return true
  return Boolean(
    row.execution?.jobs.some((job) => ['QUEUED', 'WAITING', 'PENDING', 'REQUESTED'].includes(job.status))
  )
}

export function failureGuidance(row: CiRow, t: CiT = ciEnglish) {
  const failed = row.checks.filter((check) =>
    ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE'].includes(check.conclusion ?? '')
  )
  if (!failed.length && row.build !== 'Failed') return null
  const startup = failed.some((check) => check.conclusion === 'STARTUP_FAILURE')
  const authorCheck = failed.some(
    (check) =>
      check.conclusion === 'FAILURE' &&
      (/^(lint|typecheck|type check|regression|unit tests?|tests?)(\b|:)/i.test(check.name) ||
        check.steps.some(
          (step) =>
            step.conclusion === 'FAILURE' &&
            /^(lint|typecheck|type check|regression|unit tests?|tests?)(\b|:)/i.test(step.name)
        ))
  )
  const cause = startup && !authorCheck ? 'startup' : authorCheck && !startup ? 'author' : 'unconfirmed'
  const label = t(
    {
      startup: 'ci.failure.ciReview',
      author: 'ci.failure.authorReview',
      unconfirmed: 'ci.failure.unconfirmed'
    }[cause]
  )
  const reason = t(
    {
      startup: 'ci.failure.reasonStartup',
      author: 'ci.failure.reasonAuthor',
      unconfirmed: 'ci.failure.reasonUnconfirmed'
    }[cause]
  )
  return {
    label,
    note: row.merged ? t('ci.failure.mergedNote', { label }) : label,
    explanation: row.merged ? t('ci.failure.mergedExplanation', { reason }) : reason,
    checks: failed.map((check) => check.name)
  }
}

// `row.next` and `row.note` are the server's own sentences, shown verbatim.
export function attentionIssue(row: CiRow, t: CiT = ciEnglish) {
  const failure = failureGuidance(row, t)
  return {
    label: failure?.note ?? stateLabel(row.state, t),
    action: failure?.explanation ?? row.next,
    evidence: failure?.checks.length
      ? t('ci.failure.checks', { checks: failure.checks.join(', ') })
      : row.note
  }
}
// English on purpose in every interface language: the reader is the operator's agent.
export function agentIssueText(row: CiRow) {
  const issue = attentionIssue(row, ciEnglish)
  const prUrl = githubLink(row.url)
  return [
    `Please investigate PR #${row.id}: ${row.title}`,
    `Repository: ${prUrl?.split('/pull/')[0] ?? 'Repository unavailable'}`,
    `PR: ${githubLink(row.url) ?? 'Link unavailable'}`,
    `Author: ${row.author}`,
    `Latest observed commit: ${row.commit}`,
    `Target: ${row.target}; PR status: ${row.state}; CI: ${row.build}`,
    `Issue: ${issue.label}`,
    `Evidence: ${issue.evidence}`,
    `Next step: ${issue.action}`,
    'Verify the current PR head and GitHub job logs first; this dashboard is a snapshot. Explain the cause, fix any confirmed issue in the PR branch, and report the relevant validation results.'
  ].join('\n')
}

export function agentIssuesText(rows: CiRow[]) {
  const groups = new Map<string, CiRow[]>()
  for (const row of rows) {
    if (!needsAttention(row)) continue
    const group = groups.get(row.author) ?? []
    group.push(row)
    groups.set(row.author, group)
  }
  return [...groups.entries()]
    .map(
      ([author, issues]) =>
        `Author: ${author} · ${issues.length} issue(s)\n\n${issues.map(agentIssueText).join('\n\n---\n\n')}`
    )
    .join('\n\n========\n\n')
}

export const prStages = [
  'Draft',
  'Ready',
  'Waiting to run',
  'Checking/Testing',
  'Ready to merge',
  'Merged / Building image',
  'Deploying',
  'Live'
]
export const prFilters = ['All PRs', ...prStages, 'Needs attention']

/** Filter ids are English and stay ids; these give each its words. An unknown value shows as sent. */
const FILTER_SLUG: Record<string, string> = {
  'All PRs': 'all',
  Draft: 'draft',
  Ready: 'ready',
  'Waiting to run': 'waitingToRun',
  'Checking/Testing': 'checking',
  'Ready to merge': 'readyToMerge',
  'Merged / Building image': 'mergedBuilding',
  Deploying: 'deploying',
  Live: 'live',
  'Needs attention': 'attention'
}
const COMPACT_FILTERS = new Set(['all', 'waitingToRun', 'checking', 'readyToMerge', 'deploying', 'attention'])
const labelFrom =
  (slugs: Record<string, string>, prefix: string) =>
  (value: string, t: CiT = ciEnglish) =>
    Object.hasOwn(slugs, value) ? t(`${prefix}.${slugs[value]}`) : value
export const filterLabel = labelFrom(FILTER_SLUG, 'ci.filter')
export function filterCompactLabel(filter: string, t: CiT = ciEnglish) {
  const slug = Object.hasOwn(FILTER_SLUG, filter) ? FILTER_SLUG[filter] : ''
  return COMPACT_FILTERS.has(slug) ? t(`ci.filter.compact.${slug}`) : filterLabel(filter, t)
}
/** The server's `build`, `state` and `deployment.stage` values, in words. */
export const buildLabel = labelFrom(
  {
    Failed: 'failed',
    Building: 'building',
    Queued: 'queued',
    Ready: 'ready',
    Incomplete: 'incomplete',
    Cancelled: 'cancelled',
    'Not started': 'notStarted',
    Unknown: 'unknown'
  },
  'ci.build'
)
export const stateLabel = labelFrom(
  {
    'Waiting to start': 'waitingToStart',
    Merged: 'merged',
    Closed: 'closed',
    Draft: 'draft',
    'Status unknown': 'unknown',
    'Merge conflict': 'conflict',
    'Needs a fix': 'needsFix',
    'Checks incomplete': 'incomplete',
    Testing: 'testing',
    'Changes requested': 'changesRequested',
    'Waiting for review': 'waitingForReview',
    'Merge blocked': 'blocked',
    'Ready to merge': 'readyToMerge'
  },
  'ci.state'
)
export const stageLabel = labelFrom(
  { Merged: 'merged', 'Building image': 'buildingImage', Deploying: 'deploying', Live: 'live' },
  'ci.stage'
)
export function matchesPrFilter(row: CiRow, filter: string): boolean {
  switch (filter) {
    case 'All PRs':
      return true
    case 'Draft':
      return !row.merged && row.state === 'Draft'
    case 'Ready':
      return (
        !row.merged &&
        row.state !== 'Draft' &&
        row.checksComplete &&
        ['Not started', 'Incomplete'].includes(row.build) &&
        !waitingToRun(row) &&
        !row.checks.some((check) => check.workflow === 'Tracy CI' && check.conclusion !== 'SKIPPED') &&
        !row.execution?.jobs.some((job) => job.status === 'IN_PROGRESS')
      )
    case 'Waiting to run':
      return waitingToRun(row)
    case 'Checking/Testing':
      return (
        !row.merged &&
        (row.build === 'Building' || Boolean(row.execution?.jobs.some((job) => job.status === 'IN_PROGRESS')))
      )
    case 'Ready to merge':
      return !row.merged && row.state === 'Ready to merge'
    case 'Merged / Building image':
      return row.merged && ['Merged', 'Building image'].includes(row.deployment.stage ?? '')
    case 'Building image':
    case 'Deploying':
    case 'Live':
      return row.merged && row.deployment.stage === filter
    case 'Merged':
      return row.merged && row.deployment.stage === 'Merged'
    case 'Needs attention':
      return needsAttention(row)
    default:
      return false
  }
}

export function observePrIds(seen: ReadonlySet<number> | null, rows: Pick<CiRow, 'id'>[]) {
  const added = seen === null ? [] : rows.filter((row) => !seen.has(row.id)).map((row) => row.id)
  return { seen: new Set([...(seen ?? []), ...rows.map((row) => row.id)]), added }
}

export function prStep(row: CiRow): { index: number; label: string } | null {
  let label: string | null = null
  if (row.merged) {
    const stage = row.deployment.stage ?? 'Merged'
    label = ['Merged', 'Building image'].includes(stage) ? 'Merged / Building image' : stage
  } else if (row.state === 'Draft') label = 'Draft'
  else if (matchesPrFilter(row, 'Checking/Testing')) label = 'Checking/Testing'
  else if (waitingToRun(row)) label = 'Waiting to run'
  else if (matchesPrFilter(row, 'Ready')) label = 'Ready'
  else if (matchesPrFilter(row, 'Ready to merge')) label = 'Ready to merge'
  else if (
    row.build !== 'Unknown' &&
    (['Failed', 'Cancelled'].includes(row.build) ||
      row.checks.some((check) => check.workflow === 'Tracy CI' && check.conclusion !== 'SKIPPED'))
  )
    label = 'Checking/Testing'
  const index = label === null ? -1 : prStages.indexOf(label)
  return index < 0 ? null : { index, label: label! }
}

// Custom dates are inclusive local calendar days; the server receives an exclusive UTC upper bound.
export function ciScopeQuery({
  branch,
  dateField,
  range,
  from,
  to
}: {
  branch: string
  dateField: string
  range: string
  from: string
  to: string
}) {
  const params = new URLSearchParams({ branch, dateField, range })
  if (range === 'custom') {
    if (from) params.set('from', new Date(`${from}T00:00:00`).toISOString())
    if (to) {
      const end = new Date(`${to}T00:00:00`)
      end.setDate(end.getDate() + 1)
      params.set('to', end.toISOString())
    }
  }
  return params.toString()
}
