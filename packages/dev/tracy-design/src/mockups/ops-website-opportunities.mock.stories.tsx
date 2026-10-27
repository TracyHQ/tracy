// Can teammates scan one compact row per Website Opportunity across all users, filter by user or stage (0–7), and inspect execution & demo site builds in a side panel just like /ops/ci?

import { Fragment, useEffect, useRef, useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
  NativeSelect,
  NativeSelectOption,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Progress,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn
} from '@tracy/ui'
import {
  AlertCircle,
  AlertTriangleIcon,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CheckCircle2Icon,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  CompassIcon,
  ExternalLink,
  ExternalLinkIcon,
  FastForwardIcon,
  GlobeIcon,
  ImageIcon,
  KeyRoundIcon,
  LayersIcon,
  PlayIcon,
  RefreshCw,
  RefreshCwIcon,
  RotateCcwIcon,
  Search,
  SearchIcon,
  Settings2Icon,
  ShieldAlertIcon,
  SlidersHorizontal,
  WandSparklesIcon,
  X
} from 'lucide-react'

// ── 1. Data Shapes (1-to-1 with `ci-api.ts` adapted for Website Opportunities) ──────────────

export interface WoStep {
  name: string
  number: number
  status: 'COMPLETED' | 'IN_PROGRESS' | 'QUEUED'
  conclusion: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'PAUSED' | null
  startedAt: string | null
  completedAt: string | null
}

export interface WoCheck {
  id: string
  name: string
  workflow: string | null
  status: 'COMPLETED' | 'IN_PROGRESS' | 'QUEUED'
  conclusion: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'PAUSED' | 'TIMED_OUT' | 'ACTION_REQUIRED' | null
  url: string | null
  startedAt: string | null
  completedAt: string | null
  summary: string | null
  steps: WoStep[]
}

export interface WoJob extends WoCheck {
  runId: number
  runAttempt: number
  runnerAssignment?: 'assigned' | 'unassigned' | 'unknown'
  labels: string[]
  runner: { id: number; name: string; status: 'online' | 'offline' | 'unknown'; busy: boolean | null } | null
  measuredAt: string
}

export interface WoExecution {
  jobs: WoJob[]
  complete: boolean
  error: string | null
  runnersMeasuredAt: string | null
  runnerError: string | null
}

export interface WoRow {
  id: number
  unread?: boolean
  readAt?: string | null
  title: string
  url: string
  authorId: string
  author: string
  login: string | null
  commit: string
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
  mergeState: string
  review: string | null
  checks: WoCheck[]
  checksComplete: boolean
  progress: { value: number; label: string; tone: string } | null
  deployment: {
    label: string
    checks: WoCheck[]
    stage?: string | null
    failed?: boolean
    coverage?: { workflow: string; commit: string }[]
  }
  note: string
  detail: string
  outcome: string
  execution?: WoExecution
}

export type SortKey =
  | 'id'
  | 'step'
  | 'title'
  | 'build'
  | 'currentStep'
  | 'runner'
  | 'duration'
  | 'author'
  | 'committedAt'
  | 'commit'
  | 'mergedAt'
  | 'queue'
  | 'state'
  | 'target'

export const columns: { key: SortKey; label: string; hint: string }[] = [
  { key: 'id', label: 'WO', hint: 'Opportunity number' },
  { key: 'step', label: 'Step', hint: 'Lifecycle step 0–7; unknown stages stay empty' },
  { key: 'title', label: 'Opportunity', hint: 'Restaurant name & city' },
  {
    key: 'build',
    label: 'Research',
    hint: 'Failed → Building → Queued → Ready → Incomplete → Cancelled → Not started → Unknown'
  },
  {
    key: 'currentStep',
    label: 'Current step',
    hint: 'Current collector or picture step; parallel jobs shown in details'
  },
  {
    key: 'runner',
    label: 'Worker',
    hint: 'Assigned executor worker slot & lease; expand to see current availability'
  },
  {
    key: 'duration',
    label: 'Duration',
    hint: 'Elapsed time since research or site build started'
  },
  { key: 'author', label: 'User', hint: 'Customer account name' },
  { key: 'committedAt', label: 'Time', hint: 'Latest activity timestamp' },
  { key: 'commit', label: 'Rev ID', hint: 'Brief revision or candidate hash' },
  { key: 'mergedAt', label: 'Demo site', hint: 'Demo site build time; unbuilt opportunities stay last' },
  {
    key: 'queue',
    label: 'Queue',
    hint: 'Executor queue position waiting for a worker slot'
  },
  { key: 'state', label: 'Status', hint: 'Opportunity lifecycle status' },
  { key: 'target', label: 'CMS · Template', hint: 'Target CMS & restaurant template' }
]

export const executionColumn = (key: SortKey) => ['build', 'currentStep', 'runner', 'duration'].includes(key)

export const woStages = [
  'Draft',
  'Ready',
  'Waiting to run',
  'Checking/Testing',
  'Ready to merge',
  'Merged / Building image',
  'Deploying',
  'Live'
]

export const woFilters = ['All WOs', ...woStages, 'Needs attention']

const compactLabels: Record<string, string> = {
  'All WOs': 'All',
  Draft: 'Saved pin',
  Ready: 'Queued',
  'Waiting to run': 'Waiting',
  'Checking/Testing': 'Researching',
  'Ready to merge': 'Brief ready',
  'Merged / Building image': 'Provisioning',
  Deploying: 'Uploading photos',
  Live: 'Live',
  'Needs attention': 'Attention'
}

// ── 2. Pure Helpers (1-to-1 with `ci-api.ts`) ───────────────────────────────────────────────

export function runnerLabel(runner: WoJob['runner']): string {
  if (!runner) return 'Not assigned'
  return runner.status === 'offline'
    ? 'Lease expired'
    : runner.status === 'online'
      ? runner.busy === null
        ? 'Online'
        : runner.busy
          ? 'Online · busy'
          : 'Online · idle'
      : 'Availability unknown'
}

export function durationLabel(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.floor(seconds)} s`
  return seconds < 3600
    ? `${Math.floor(seconds / 60)} min ${Math.floor(seconds % 60)} s`
    : `${Math.floor(seconds / 3600)} h ${Math.floor(seconds / 60) % 60} min`
}

export function jobDuration(job: WoJob, now: number) {
  if (!job.startedAt) return null
  const finish = job.status === 'COMPLETED' ? Date.parse(job.completedAt ?? '') : now
  const seconds = (finish - Date.parse(job.startedAt)) / 1000
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null
}

export function releaseDuration(row: WoRow, now: number, stage = row.deployment.stage) {
  const checks = row.deployment.checks.filter((check) =>
    stage === 'Building image'
      ? check.name === 'provision-container'
      : stage === 'Deploying' && check.name.startsWith('upload-')
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

export function executionSummary(row: WoRow, now = Date.now()) {
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
  const waitingLabel = `${waiting.length} collector${waiting.length === 1 ? '' : 's'} waiting`
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
  const step =
    active.length > 1
      ? `${active.length} collectors running`
      : runningStep
        ? runningStep.name
        : active.length
          ? 'Starting or finishing collector'
          : waiting.length
            ? waitingLabel
            : row.build === 'Not started'
              ? 'Not started'
              : row.execution?.complete && jobs.length
                ? 'Research finished'
                : 'No collector details yet'
  const runner =
    displayedNames.length > 1
      ? `${displayedNames.length} workers`
      : (displayedNames[0] ??
        (waiting.length ? 'Not assigned' : row.build === 'Not started' ? '—' : 'Unknown'))
  return {
    step,
    runner,
    duration,
    waitingNote: waiting.length ? `${waiting.length} collectors waiting · Worker slot not assigned yet` : null
  }
}

export function rowDuration(row: WoRow, now = Date.now()) {
  if (!row.merged) return executionSummary(row, now).duration
  return releaseDuration(row, now, row.deployment.stage === 'Live' ? 'Deploying' : row.deployment.stage)
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

export function checkLabel(check: { status: string; conclusion: string | null }): string {
  const result = check.conclusion
  if (result === 'SUCCESS') return 'Passed'
  if (result === 'SKIPPED') return 'Skipped'
  if (result === 'PAUSED') return 'Paused on quota'
  if (result) return 'Needs attention'
  return check.status === 'IN_PROGRESS' ? 'Running' : 'Waiting'
}

export function failureGuidance(row: WoRow) {
  const failed = row.checks.filter((check) =>
    ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'PAUSED'].includes(check.conclusion ?? '')
  )
  if (!failed.length && row.build !== 'Failed') return null
  const isQuotaPaused = failed.some((check) => check.conclusion === 'PAUSED')
  const label = isQuotaPaused ? 'Paused on daily quota' : 'Collector or storage retry needed'
  const reason = isQuotaPaused
    ? 'This account hit its daily social research cap (30/30 runs). Already-collected Website and Facebook photos are saved in PostgreSQL & MinIO. You can force-complete Brief Revision #1 now or reset the user’s daily cap.'
    : 'A media download or storage write timed out after 3 attempts. Crawled pages and posts are cached in wo_source.collected; reclaiming the lease retries from stage=media without charging Apify again.'
  return {
    label,
    note: row.merged ? `Site built · ${label}` : label,
    explanation: reason,
    checks: failed.map((check) => check.name)
  }
}

export const needsAttention = (row: WoRow) =>
  Boolean(failureGuidance(row)) || ['Paused on quota', 'Needs a fix', 'Template hidden'].includes(row.state)

export function attentionIssue(row: WoRow) {
  const failure = failureGuidance(row)
  return {
    label: failure?.note ?? row.state,
    action: failure?.explanation ?? row.next,
    evidence: failure?.checks.length ? `Stopped collectors: ${failure.checks.join(', ')}` : row.note
  }
}

export function agentIssueText(row: WoRow) {
  const issue = attentionIssue(row)
  return [
    `Please investigate Website Opportunity #${row.id}: ${row.title}`,
    `User: ${row.author} (${row.login ?? 'no email'})`,
    `Revision / Candidate: ${row.commit}`,
    `Target CMS & Template: ${row.target}; Status: ${row.state}; Research: ${row.build}`,
    `Issue: ${issue.label}`,
    `Evidence: ${issue.evidence}`,
    `Next step: ${issue.action}`
  ].join('\n')
}

export function agentIssuesText(rows: WoRow[]) {
  const groups = new Map<string, WoRow[]>()
  for (const row of rows) {
    if (!needsAttention(row)) continue
    const group = groups.get(row.author) ?? []
    group.push(row)
    groups.set(row.author, group)
  }
  return [...groups.entries()]
    .map(
      ([author, issues]) =>
        `User: ${author} · ${issues.length} issue(s)\n\n${issues.map(agentIssueText).join('\n\n---\n\n')}`
    )
    .join('\n\n========\n\n')
}

export function waitingToRun(row: WoRow): boolean {
  if (row.merged) return false
  if (row.build === 'Queued') return true
  return Boolean(row.execution?.jobs.some((job) => job.status === 'QUEUED'))
}

export function matchesWoFilter(row: WoRow, filter: string): boolean {
  switch (filter) {
    case 'All WOs':
      return true
    case 'Draft':
      return !row.merged && row.state === 'Saved pin'
    case 'Ready':
      return !row.merged && row.state === 'Queued' && row.build === 'Not started'
    case 'Waiting to run':
      return waitingToRun(row)
    case 'Checking/Testing':
      return (
        !row.merged &&
        (row.build === 'Building' || Boolean(row.execution?.jobs.some((job) => job.status === 'IN_PROGRESS')))
      )
    case 'Ready to merge':
      return !row.merged && row.state === 'Brief ready'
    case 'Merged / Building image':
      return row.merged && ['Merged', 'Building image'].includes(row.deployment.stage ?? '')
    case 'Building image':
    case 'Deploying':
    case 'Live':
      return row.merged && row.deployment.stage === filter
    case 'Needs attention':
      return needsAttention(row)
    default:
      return false
  }
}

export function woStep(row: WoRow): { index: number; label: string } | null {
  let label: string | null = null
  if (row.merged) {
    const stage = row.deployment.stage ?? 'Merged'
    label = ['Merged', 'Building image'].includes(stage) ? 'Merged / Building image' : stage
  } else if (row.state === 'Saved pin') label = 'Draft'
  else if (matchesWoFilter(row, 'Checking/Testing')) label = 'Checking/Testing'
  else if (waitingToRun(row)) label = 'Waiting to run'
  else if (matchesWoFilter(row, 'Ready')) label = 'Ready'
  else if (matchesWoFilter(row, 'Ready to merge')) label = 'Ready to merge'
  else if (row.build === 'Failed') label = 'Checking/Testing'
  const index = label === null ? -1 : woStages.indexOf(label)
  return index < 0 ? null : { index, label: label! }
}

export function filterTimeColumn(filter: string) {
  const labels: Record<string, [string, string]> = {
    'Waiting to run': ['Queued at', 'Job enqueue time in wo_job'],
    'Checking/Testing': ['Started at', 'First collector start time'],
    'Ready to merge': ['Brief frozen', 'Brief Revision #1 creation timestamp'],
    'Merged / Building image': ['Build started', 'POST /api/sites container creation start'],
    Deploying: ['Upload started', 'Picture upload & 16:9 outpaint start'],
    Live: ['Live at', 'Demo site ready & AI chat handoff sent'],
    'Needs attention': ['Stopped at', 'Latest paused or failed checkpoint timestamp']
  }
  const [label, hint] = labels[filter] ?? ['Updated at', 'Latest checkpoint time']
  return { label, hint }
}

export function filterTime(row: WoRow, _filter: string): string | null {
  return row.committedAt
}

export function sortedRows(
  rows: WoRow[],
  key: SortKey,
  descending: boolean,
  now = Date.now(),
  filter = 'All WOs'
) {
  function value(row: WoRow) {
    if (key === 'step') return woStep(row)?.index ?? null
    if (key === 'committedAt') return filterTime(row, filter)
    if (key === 'currentStep') return executionSummary(row, now).step
    if (key === 'runner') return executionSummary(row, now).runner
    if (key === 'duration') return rowDuration(row, now)
    return row[key]
  }
  return [...rows].sort((a, b) => {
    const x = value(a)
    const y = value(b)
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

export function relativeTime(time: string | null, now = Date.now()) {
  if (!time) return '—'
  const seconds = Math.max(0, (now - Date.parse(time)) / 1000)
  if (!Number.isFinite(seconds)) return '—'
  return seconds < 60
    ? 'just now'
    : seconds < 3600
      ? `${Math.floor(seconds / 60)} min ago`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)} h ago`
        : `${Math.floor(seconds / 86400)} d ago`
}

export const exactTime = (time: string | null) =>
  time ? new Date(time).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Unknown'

// ── 3. Execution Panel Component (1-to-1 with `CiExecution.tsx`) ────────────────────────────

export function WoExecutionPanel({ row, now }: { row: WoRow; now: number }) {
  const execution = row.execution
  const summary = executionSummary(row, now)
  const jobs = [...(execution?.jobs ?? [])].sort((a, b) => {
    const order = (status: string) => (status === 'IN_PROGRESS' ? 0 : status === 'COMPLETED' ? 2 : 1)
    return order(a.status) - order(b.status)
  })
  return (
    <section
      aria-label="WO execution details"
      className="space-y-3 rounded-md border border-primary/20 bg-primary/5 p-3"
    >
      <div className="flex justify-between gap-3">
        <h3 className="font-semibold">Pipeline execution</h3>
        <Badge variant="secondary">{row.build === 'Building' ? 'Researching' : row.build}</Badge>
      </div>
      <p>
        {summary.step} · {durationLabel(summary.duration)}
      </p>
      {execution?.error && (
        <p role="status" className="text-muted-foreground">
          {execution.error}
        </p>
      )}
      {execution?.runnerError && <p className="text-muted-foreground">{execution.runnerError}</p>}
      {!jobs.length && (
        <p className="text-muted-foreground">
          {row.build === 'Not started'
            ? 'No research collector has started yet.'
            : 'Worker and collector step details have not been reported for this opportunity.'}
        </p>
      )}
      <div className="space-y-2">
        {jobs.map((job) => (
          <details
            key={job.id}
            open={job.status === 'IN_PROGRESS' || job.conclusion === 'PAUSED' || job.conclusion === 'FAILURE'}
            className="rounded border border-border bg-background/70 p-2"
          >
            <summary className="cursor-pointer break-words">
              <span className="font-medium">{job.name}</span> · {checkLabel(job)}
            </summary>
            <div className="mt-2 space-y-2">
              <p className="break-words">
                Worker:{' '}
                {job.runner
                  ? `${job.runner.name} · ${runnerLabel(job.runner)}`
                  : job.runnerAssignment === 'unknown'
                    ? 'Assignment not reported'
                    : 'Not assigned'}
              </p>
              <p>Step duration: {durationLabel(jobDuration(job, now))}</p>
              {job.status !== 'COMPLETED' && !job.runner && job.runnerAssignment !== 'unknown' && (
                <p className="text-muted-foreground">
                  Worker slot not assigned yet. Waiting for an active lease in wo_job to finish.
                </p>
              )}
              {job.labels.length > 0 && (
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">Provider &amp; quota details</summary>
                  <p className="mt-1 break-words">{job.labels.join(' · ')}</p>
                </details>
              )}
              <ol className="space-y-1 border-l border-border pl-3">
                {job.steps.map((step) => (
                  <li key={step.number} className="break-words">
                    {step.number}. {step.name} · {checkLabel(step)}
                  </li>
                ))}
              </ol>
              {!job.steps.length && <p className="text-muted-foreground">No steps reported yet.</p>}
              <p className="text-muted-foreground">Observed: {exactTime(job.measuredAt)}</p>
            </div>
          </details>
        ))}
      </div>
      {execution?.runnersMeasuredAt && (
        <p className="text-muted-foreground">
          Worker lease heartbeat observed: {exactTime(execution.runnersMeasuredAt)}
        </p>
      )}
      <p className="text-muted-foreground">
        Worker assignments show which executor slot claimed the lease (`wo_job.lease_owner`). A worker may be
        busy with another user’s opportunity.
      </p>
    </section>
  )
}

// ── 4. Sample Snapshot Fixture (Frozen at 2026-10-18T16:45:00Z) ─────────────────────────────

const SNAPSHOT_NOW = Date.parse('2026-10-18T16:45:00Z')

const INITIAL_MEMBERS = [
  { id: 'lee', name: 'Lee', login: 'lee@example.com' },
  { id: 'minh', name: 'Minh', login: 'minh@agency.example' },
  { id: 'sarah', name: 'Sarah', login: 'sarah@studio.example' },
  { id: 'david', name: 'David', login: 'david@webcraft.example' },
  { id: 'hano', name: 'Hano', login: 'hano@example.com' }
]

const INITIAL_ROWS: WoRow[] = [
  {
    id: 214,
    unread: true,
    title: 'Bep Nha Xu Quang · Da Nang',
    url: 'https://wo.tracy.site/opportunities/214',
    authorId: 'minh',
    author: 'Minh',
    login: 'minh@agency.example',
    commit: 'rev1-9f2a1c08',
    committedAt: '2026-10-18T16:43:00Z',
    mergedAt: null,
    target: 'joomla/ja-impact',
    state: 'Researching',
    build: 'Building',
    next: 'Brief Revision #1 will freeze automatically once AI Vision finishes labelling the 58 real photos.',
    merged: false,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: 15,
    mergeState: 'CLEAN',
    review: 'Auto-Brief ON',
    checksComplete: false,
    progress: { value: 60, label: 'AI Vision labelling 42/58 real photos', tone: 'running' },
    deployment: {
      label: 'Not built',
      checks: []
    },
    note: 'AI Vision photo labelling (42/58) · $0.12',
    detail:
      'Discovered on Google Maps (24 Tran Phu, Da Nang). DeepSeek Search found official website & Instagram; Firecrawl scraped 14 SPA pages; Apify collected 20 FB + 18 IG posts (58 unique photos).',
    outcome: '58 deduplicated real photos stored in MinIO; Vision labelling in progress.',
    checks: [
      {
        id: 'chk-214-1',
        name: 'web-search-enrich (DeepSeek Search)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:43:02Z',
        completedAt: '2026-10-18T16:43:04Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-214-2',
        name: 'website-scrape (Firecrawl /v1/scrape)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:43:04Z',
        completedAt: '2026-10-18T16:43:14Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-214-3',
        name: 'social-collectors (Apify FB 20p + IG 18p)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:43:14Z',
        completedAt: '2026-10-18T16:43:38Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-214-4',
        name: 'vision-picture-curation (deepseek-chat)',
        workflow: 'WO Research',
        status: 'IN_PROGRESS',
        conclusion: null,
        url: null,
        startedAt: '2026-10-18T16:43:38Z',
        completedAt: null,
        summary: null,
        steps: [
          {
            number: 2,
            name: 'Classify dish / interior / drink / logo (42/58)',
            status: 'IN_PROGRESS',
            conclusion: null,
            startedAt: '2026-10-18T16:43:40Z',
            completedAt: null
          }
        ]
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:57Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-214-vision',
          runId: 21401,
          runAttempt: 1,
          name: 'vision-picture-curation',
          workflow: 'WO Research',
          status: 'IN_PROGRESS',
          conclusion: null,
          url: null,
          startedAt: '2026-10-18T16:43:38Z',
          completedAt: null,
          summary: null,
          runnerAssignment: 'assigned',
          labels: ['provider: deepseek-chat', 'outpaint: gemini-3.1-flash-lite-image', 'spend: $0.12'],
          runner: { id: 1, name: 'wo-worker-1 (lease #44)', status: 'online', busy: true },
          measuredAt: '2026-10-18T16:44:57Z',
          steps: [
            {
              number: 1,
              name: 'Download & dHash deduplicate 58 photos',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-18T16:43:38Z',
              completedAt: '2026-10-18T16:43:48Z'
            },
            {
              number: 2,
              name: 'Vision role & food quality labelling (42/58)',
              status: 'IN_PROGRESS',
              conclusion: null,
              startedAt: '2026-10-18T16:43:48Z',
              completedAt: null
            },
            {
              number: 3,
              name: 'Extend 1 hero photo to 16:9 & freeze Brief Rev #1',
              status: 'QUEUED',
              conclusion: null,
              startedAt: null,
              completedAt: null
            }
          ]
        }
      ]
    }
  },
  {
    id: 213,
    unread: true,
    title: 'Le Jardin Bistro & Wine · TP.HCM',
    url: 'https://wo.tracy.site/opportunities/213',
    authorId: 'sarah',
    author: 'Sarah',
    login: 'sarah@studio.example',
    commit: 'cand-7m9b4e12',
    committedAt: '2026-10-18T16:38:00Z',
    mergedAt: null,
    target: 'wordpress/tracy-bistro-wp',
    state: 'Paused on quota',
    build: 'Failed',
    next: 'Click "Force Complete Brief" to freeze Revision #1 immediately with the 28 collected photos, or "Reset Cap & Resume" to run Instagram.',
    merged: false,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: null,
    mergeState: 'BLOCKED',
    review: 'Paused at stage=collection',
    checksComplete: true,
    progress: { value: 35, label: 'Paused: account hit 30/30 daily research cap', tone: 'failed' },
    deployment: {
      label: 'Not built',
      checks: []
    },
    note: 'Paused on daily quota (30/30) · 28 real photos saved',
    detail:
      'Website (9 pages via DeepSeek Fetch) and Facebook (20 posts, 28 high-res food photos) completed cleanly. Paused before Instagram actor because Sarah reached her 30/30 daily research cap.',
    outcome: 'Paused at stage=collection with resumable cursor; 28 photos stored.',
    checks: [
      {
        id: 'chk-213-1',
        name: 'website-scrape (DeepSeek Fetch /v1/tools/fetch)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:38:05Z',
        completedAt: '2026-10-18T16:38:12Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-213-2',
        name: 'facebook-posts (apify/facebook-posts-scraper)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:38:12Z',
        completedAt: '2026-10-18T16:38:38Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-213-3',
        name: 'instagram-profile (apify/instagram-scraper)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'PAUSED',
        url: null,
        startedAt: '2026-10-18T16:38:38Z',
        completedAt: '2026-10-18T16:38:39Z',
        summary: 'APIFY_DAILY_CAP_REACHED: Account sarah@studio.example reached 30/30 daily research runs.',
        steps: [
          {
            number: 1,
            name: 'Check per-account daily research budget (30/30 used)',
            status: 'COMPLETED',
            conclusion: 'PAUSED',
            startedAt: '2026-10-18T16:38:38Z',
            completedAt: '2026-10-18T16:38:39Z'
          }
        ]
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:57Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-213-ig',
          runId: 21303,
          runAttempt: 1,
          name: 'instagram-profile (apify/instagram-scraper)',
          workflow: 'WO Research',
          status: 'COMPLETED',
          conclusion: 'PAUSED',
          url: null,
          startedAt: '2026-10-18T16:38:05Z',
          completedAt: '2026-10-18T16:38:39Z',
          summary: 'Paused on daily research budget (30/30)',
          runnerAssignment: 'unassigned',
          labels: ['account: sarah@studio.example', 'researchToday: 30/30', 'storedPhotos: 28'],
          runner: null,
          measuredAt: '2026-10-18T16:38:39Z',
          steps: [
            {
              number: 1,
              name: 'Website crawl via DeepSeek Fetch (9 pages)',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-18T16:38:05Z',
              completedAt: '2026-10-18T16:38:12Z'
            },
            {
              number: 2,
              name: 'Facebook scraper (20 posts · 28 real photos saved)',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-18T16:38:12Z',
              completedAt: '2026-10-18T16:38:38Z'
            },
            {
              number: 3,
              name: 'Instagram scraper paused (APIFY_DAILY_CAP_REACHED)',
              status: 'COMPLETED',
              conclusion: 'PAUSED',
              startedAt: '2026-10-18T16:38:38Z',
              completedAt: '2026-10-18T16:38:39Z'
            }
          ]
        }
      ]
    }
  },
  {
    id: 212,
    unread: false,
    title: 'Koko Ramen & Izakaya · Ha Noi',
    url: 'https://koko-ramen.tracy.site',
    authorId: 'lee',
    author: 'Lee',
    login: 'lee@example.com',
    commit: 'rev1-8j0e3f11',
    committedAt: '2026-10-18T16:41:00Z',
    mergedAt: '2026-10-18T16:43:30Z',
    target: 'joomla/ja-impact',
    state: 'Uploading photos',
    build: 'Ready',
    next: 'Uploading curated slot pictures (9/12) and 24 extra AI chat photos to koko-ramen.tracy.site.',
    merged: true,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: 8,
    mergeState: 'CLEAN',
    review: 'Revision #1 frozen',
    checksComplete: true,
    progress: { value: 90, label: 'Uploading slot pictures 9/12 to koko-ramen.tracy.site', tone: 'running' },
    deployment: {
      label: 'koko-ramen.tracy.site',
      stage: 'Deploying',
      failed: false,
      coverage: [{ workflow: 'POST /api/sites', commit: 'build-88a1c0' }],
      checks: [
        {
          id: 'dep-212-1',
          name: 'provision-container',
          workflow: 'Site Build',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: 'https://koko-ramen.tracy.site',
          startedAt: '2026-10-18T16:43:30Z',
          completedAt: '2026-10-18T16:44:10Z',
          summary: null,
          steps: []
        },
        {
          id: 'dep-212-2',
          name: 'upload-pictures-and-handoff (9/12 slots + 24 chat photos)',
          workflow: 'Picture Pipeline',
          status: 'IN_PROGRESS',
          conclusion: null,
          url: 'https://koko-ramen.tracy.site',
          startedAt: '2026-10-18T16:44:10Z',
          completedAt: null,
          summary: null,
          steps: []
        }
      ]
    },
    note: 'Uploading curated photos 9/12 to koko-ramen.tracy.site',
    detail:
      'Research completed in 52s (68 real photos via Jina Reader + Apify). Container koko-ramen.tracy.site provisioned; currently writing 12 slot pictures and 24 residual chat photos.',
    outcome: 'Revision #1 built on koko-ramen.tracy.site; picture upload in progress.',
    checks: [
      {
        id: 'chk-212-1',
        name: 'website-scrape (Jina Reader r.jina.ai)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:41:00Z',
        completedAt: '2026-10-18T16:41:08Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-212-2',
        name: 'social-collectors (FB 20p + IG 20p)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:41:08Z',
        completedAt: '2026-10-18T16:41:36Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-212-3',
        name: 'vision-and-outpaint (68 labelled · 2 hero 16:9 outpaints)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:41:36Z',
        completedAt: '2026-10-18T16:41:52Z',
        summary: null,
        steps: []
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-212-upload',
          runId: 21202,
          runAttempt: 1,
          name: 'upload-pictures-and-handoff',
          workflow: 'Site Build',
          status: 'IN_PROGRESS',
          conclusion: null,
          url: 'https://koko-ramen.tracy.site',
          startedAt: '2026-10-18T16:44:10Z',
          completedAt: null,
          summary: null,
          runnerAssignment: 'assigned',
          labels: ['site: koko-ramen.tracy.site', 'template: ja-impact', 'handoffPhotos: 24'],
          runner: { id: 2, name: 'wo-worker-2 (lease #45)', status: 'online', busy: true },
          measuredAt: '2026-10-18T16:44:58Z',
          steps: [
            {
              number: 1,
              name: 'Provision Joomla container via POST /api/sites',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-18T16:43:30Z',
              completedAt: '2026-10-18T16:44:10Z'
            },
            {
              number: 2,
              name: 'Upload 12 curated slot pictures (9/12 written)',
              status: 'IN_PROGRESS',
              conclusion: null,
              startedAt: '2026-10-18T16:44:10Z',
              completedAt: null
            },
            {
              number: 3,
              name: 'Preload 24 extra real photos to images/tracy-content/',
              status: 'QUEUED',
              conclusion: null,
              startedAt: null,
              completedAt: null
            }
          ]
        }
      ]
    }
  },
  {
    id: 211,
    unread: false,
    title: 'Hai San Be Man Son Tra · Da Nang',
    url: 'https://wo.tracy.site/opportunities/211',
    authorId: 'minh',
    author: 'Minh',
    login: 'minh@agency.example',
    commit: 'cand-8p4d2a19',
    committedAt: '2026-10-18T16:44:20Z',
    mergedAt: null,
    target: 'joomla/ja-impact',
    state: 'Waiting for worker',
    build: 'Queued',
    next: 'First in queue (#1). Starts automatically when wo-worker-1 finishes WO #214.',
    merged: false,
    queue: 1,
    queuedAt: '2026-10-18T16:44:20Z',
    queueState: 'QUEUED',
    estimateSeconds: 20,
    mergeState: 'QUEUED',
    review: 'Auto-Brief ON',
    checksComplete: false,
    progress: { value: 15, label: 'Queue position #1 · waiting for worker slot', tone: 'waiting' },
    deployment: { label: 'Not built', checks: [] },
    note: 'First in line; waiting for wo-worker-1',
    detail: 'Queued behind WO #214 (Bep Nha Xu Quang). Both executor worker slots (2/2) are currently busy.',
    outcome: 'Waiting in wo_job (state=queued, queue=#1).',
    checks: [],
    execution: {
      complete: false,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-211-q',
          runId: 21101,
          runAttempt: 1,
          name: 'research-pipeline',
          workflow: 'WO Research',
          status: 'QUEUED',
          conclusion: null,
          url: null,
          startedAt: null,
          completedAt: null,
          summary: null,
          runnerAssignment: 'unassigned',
          labels: ['queue: #1', 'channels: website, facebook, instagram'],
          runner: null,
          measuredAt: '2026-10-18T16:44:20Z',
          steps: []
        }
      ]
    }
  },
  {
    id: 210,
    unread: false,
    title: 'Tiem Ca Phe Thang Tu · Da Nang',
    url: 'https://wo.tracy.site/opportunities/210',
    authorId: 'minh',
    author: 'Minh',
    login: 'minh@agency.example',
    commit: 'cand-8q8f1b04',
    committedAt: '2026-10-18T16:44:40Z',
    mergedAt: null,
    target: 'joomla/ja-cafe',
    state: 'Waiting for worker',
    build: 'Queued',
    next: 'Queued at #2 behind WO #211. Click "Bump to #1" to run next.',
    merged: false,
    queue: 2,
    queuedAt: '2026-10-18T16:44:40Z',
    queueState: 'QUEUED',
    estimateSeconds: 65,
    mergeState: 'QUEUED',
    review: 'Auto-Brief ON',
    checksComplete: false,
    progress: { value: 10, label: 'Queue position #2 · waiting behind WO #211', tone: 'waiting' },
    deployment: { label: 'Not built', checks: [] },
    note: 'Waiting behind WO #211',
    detail:
      'Discovered via OpenStreetMap fallback. DeepSeek Search will enrich missing Website/FB/IG links as soon as a worker slot claims it.',
    outcome: 'Waiting in wo_job (state=queued, queue=#2).',
    checks: [],
    execution: {
      complete: false,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-210-q',
          runId: 21001,
          runAttempt: 1,
          name: 'research-pipeline',
          workflow: 'WO Research',
          status: 'QUEUED',
          conclusion: null,
          url: null,
          startedAt: null,
          completedAt: null,
          summary: null,
          runnerAssignment: 'unassigned',
          labels: ['queue: #2', 'discovery: osm-overpass'],
          runner: null,
          measuredAt: '2026-10-18T16:44:40Z',
          steps: []
        }
      ]
    }
  },
  {
    id: 209,
    unread: true,
    title: 'Pho Thin Bo Ho 1955 · Ha Noi',
    url: 'https://wo.tracy.site/opportunities/209',
    authorId: 'david',
    author: 'David',
    login: 'david@webcraft.example',
    commit: 'cand-6d2c9a77',
    committedAt: '2026-10-18T16:33:00Z',
    mergedAt: null,
    target: 'emdash/bravada-dining',
    state: 'Needs a fix',
    build: 'Failed',
    next: 'Click "Reclaim Lease & Retry" to resume from photo #39 without re-running Apify, or "Force Complete Brief" using the 38 stored photos.',
    merged: false,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: null,
    mergeState: 'DIRTY',
    review: 'Attempt 3/3 failed',
    checksComplete: true,
    progress: { value: 50, label: 'Stopped at media download: MinIO write timeout', tone: 'failed' },
    deployment: { label: 'Not built', checks: [] },
    note: 'MinIO timeout on photo #39/44 (38 photos saved)',
    detail:
      'Website (DeepSeek Fetch) and Facebook (20 posts) completed and are cached in wo_source.collected. MinIO timed out writing photo #39/44.',
    outcome: 'Failed at stage=media (OBJECT_STORAGE_TIMEOUT).',
    checks: [
      {
        id: 'chk-209-1',
        name: 'website-scrape (DeepSeek Fetch)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:33:02Z',
        completedAt: '2026-10-18T16:33:09Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-209-2',
        name: 'facebook-posts (apify/facebook-posts-scraper)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:33:09Z',
        completedAt: '2026-10-18T16:33:31Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-209-3',
        name: 'media-download-and-store (MinIO S3)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'TIMED_OUT',
        url: null,
        startedAt: '2026-10-18T16:33:31Z',
        completedAt: '2026-10-18T16:34:34Z',
        summary:
          'OBJECT_STORAGE_TIMEOUT: PutObject timed out on photo #39/44 after 3 attempts. 38 photos are already stored.',
        steps: [
          {
            number: 1,
            name: 'Write photo #39/44 to MinIO bucket',
            status: 'COMPLETED',
            conclusion: 'FAILURE',
            startedAt: '2026-10-18T16:34:00Z',
            completedAt: '2026-10-18T16:34:34Z'
          }
        ]
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-209-media',
          runId: 20903,
          runAttempt: 3,
          name: 'media-download-and-store',
          workflow: 'WO Research',
          status: 'COMPLETED',
          conclusion: 'FAILURE',
          url: null,
          startedAt: '2026-10-18T16:33:02Z',
          completedAt: '2026-10-18T16:34:34Z',
          summary: 'OBJECT_STORAGE_TIMEOUT on photo #39/44',
          runnerAssignment: 'assigned',
          labels: ['attempt: 3/3', 'cachedPhotos: 38/44', 'apifyRecharge: $0.00 on retry'],
          runner: { id: 9, name: 'wo-worker-stale (lease #31)', status: 'offline', busy: false },
          measuredAt: '2026-10-18T16:34:34Z',
          steps: [
            {
              number: 1,
              name: 'Collect Website + Facebook (44 photo URLs cached)',
              status: 'COMPLETED',
              conclusion: 'SUCCESS',
              startedAt: '2026-10-18T16:33:02Z',
              completedAt: '2026-10-18T16:33:31Z'
            },
            {
              number: 2,
              name: 'Download & store in MinIO (failed at 39/44)',
              status: 'COMPLETED',
              conclusion: 'FAILURE',
              startedAt: '2026-10-18T16:33:31Z',
              completedAt: '2026-10-18T16:34:34Z'
            }
          ]
        }
      ]
    }
  },
  {
    id: 208,
    unread: false,
    title: 'Maison Marou Saigon · TP.HCM',
    url: 'https://wo.tracy.site/opportunities/208',
    authorId: 'sarah',
    author: 'Sarah',
    login: 'sarah@studio.example',
    commit: 'rev1-5a1b8c20',
    committedAt: '2026-10-18T16:25:00Z',
    mergedAt: null,
    target: 'wordpress/tracy-bistro-wp',
    state: 'Brief ready',
    build: 'Ready',
    next: 'Brief Revision #1 is frozen (64 real photos curated). Ready for customer to click "Build demo site".',
    merged: false,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: null,
    mergeState: 'CLEAN',
    review: 'Revision #1 ready',
    checksComplete: true,
    progress: { value: 80, label: 'Brief Revision #1 ready · awaiting Build demo site', tone: 'waiting' },
    deployment: { label: 'Not built', checks: [] },
    note: 'Brief Revision #1 ready · 64 real photos curated',
    detail:
      'All collectors and AI Vision completed in 49s. Revision #1 snapshot is ready with 12 matched slot photos and 24 chat handoff photos.',
    outcome: 'Revision #1 frozen at 16:25 UTC ($0.11).',
    checks: [
      {
        id: 'chk-208-1',
        name: 'web-and-social-collectors (Web + FB + IG)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:24:10Z',
        completedAt: '2026-10-18T16:24:42Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-208-2',
        name: 'vision-and-brief-snapshot (Revision #1)',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:24:42Z',
        completedAt: '2026-10-18T16:24:59Z',
        summary: null,
        steps: []
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-208-done',
          runId: 20801,
          runAttempt: 1,
          name: 'research-and-vision',
          workflow: 'WO Research',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: null,
          startedAt: '2026-10-18T16:24:10Z',
          completedAt: '2026-10-18T16:24:59Z',
          summary: null,
          runnerAssignment: 'assigned',
          labels: ['photos: 64', 'outpaint: 1', 'spend: $0.11'],
          runner: { id: 1, name: 'wo-worker-1 (lease #41)', status: 'online', busy: false },
          measuredAt: '2026-10-18T16:24:59Z',
          steps: []
        }
      ]
    }
  },
  {
    id: 207,
    unread: false,
    title: 'Pizza 4P’s Trang Tien · Ha Noi',
    url: 'https://pizza-4ps-trang-tien.tracy.site',
    authorId: 'hano',
    author: 'Hano',
    login: 'hano@example.com',
    commit: 'rev1-4b8d0e99',
    committedAt: '2026-10-18T16:10:00Z',
    mergedAt: '2026-10-18T16:12:00Z',
    target: 'joomla/ja-impact',
    state: 'Live',
    build: 'Ready',
    next: 'Demo site is live at pizza-4ps-trang-tien.tracy.site with 12 real slot photos and 24 extra photos in images/tracy-content/.',
    merged: true,
    queue: null,
    queuedAt: null,
    queueState: null,
    estimateSeconds: null,
    mergeState: 'CLEAN',
    review: 'Revision #1 built',
    checksComplete: true,
    progress: { value: 100, label: 'Demo site live', tone: 'done' },
    deployment: {
      label: 'pizza-4ps-trang-tien.tracy.site',
      stage: 'Live',
      failed: false,
      coverage: [
        { workflow: 'POST /api/sites', commit: 'build-77c2f1' },
        { workflow: 'Picture Pipeline', commit: '12 slots + 24 handoff' }
      ],
      checks: [
        {
          id: 'dep-207-1',
          name: 'provision-container',
          workflow: 'Site Build',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: 'https://pizza-4ps-trang-tien.tracy.site',
          startedAt: '2026-10-18T16:12:00Z',
          completedAt: '2026-10-18T16:12:42Z',
          summary: null,
          steps: []
        },
        {
          id: 'dep-207-2',
          name: 'upload-pictures-and-handoff',
          workflow: 'Picture Pipeline',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: 'https://pizza-4ps-trang-tien.tracy.site',
          startedAt: '2026-10-18T16:12:42Z',
          completedAt: '2026-10-18T16:13:18Z',
          summary: null,
          steps: []
        }
      ]
    },
    note: 'Live on pizza-4ps-trang-tien.tracy.site',
    detail:
      'Built from Revision #1. All 12 template slots filled with real food/interior photos; 24 extra photos uploaded for AI chat.',
    outcome: 'Live at pizza-4ps-trang-tien.tracy.site.',
    checks: [
      {
        id: 'chk-207-1',
        name: 'web-and-social-collectors',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:09:10Z',
        completedAt: '2026-10-18T16:09:42Z',
        summary: null,
        steps: []
      },
      {
        id: 'chk-207-2',
        name: 'vision-and-brief-snapshot',
        workflow: 'WO Research',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        url: null,
        startedAt: '2026-10-18T16:09:42Z',
        completedAt: '2026-10-18T16:10:00Z',
        summary: null,
        steps: []
      }
    ],
    execution: {
      complete: true,
      error: null,
      runnersMeasuredAt: '2026-10-18T16:44:58Z',
      runnerError: null,
      jobs: [
        {
          id: 'job-207-done',
          runId: 20701,
          runAttempt: 1,
          name: 'site-build-and-pictures',
          workflow: 'Site Build',
          status: 'COMPLETED',
          conclusion: 'SUCCESS',
          url: 'https://pizza-4ps-trang-tien.tracy.site',
          startedAt: '2026-10-18T16:12:00Z',
          completedAt: '2026-10-18T16:13:18Z',
          summary: null,
          runnerAssignment: 'assigned',
          labels: ['site: pizza-4ps-trang-tien.tracy.site', 'slots: 12/12', 'handoff: 24'],
          runner: { id: 2, name: 'wo-worker-2 (lease #38)', status: 'online', busy: false },
          measuredAt: '2026-10-18T16:13:18Z',
          steps: []
        }
      ]
    }
  }
]

// ── 5. Settings Sub-Page (`/ops/wo` Settings) ───────────────────────────────────────────────

function WoSettingsPanel({
  masterEnabled,
  onToggleMaster,
  onBackToQueue
}: {
  masterEnabled: boolean
  onToggleMaster: (v: boolean) => void
  onBackToQueue: () => void
}) {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight">Website Opportunities · Settings</h1>
            <Badge variant={masterEnabled ? 'default' : 'secondary'}>
              {masterEnabled ? 'Surface ON' : 'Surface OFF'}
            </Badge>
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
            >
              <AlertTriangleIcon className="mr-1 size-3" />
              ja-restaurant hidden in /ops/cms
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Provider keys (DeepSeek Search/Fetch, Firecrawl, Jina, Apify), crawl fallback chain, picture
            policies, and pinned templates.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onBackToQueue}>
            Back to Live Queue
          </Button>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2">
            <div className="text-right text-xs">
              <div className="font-medium">Master surface switch</div>
              <div className="text-[11px] text-muted-foreground">Mirrors /ops/ui</div>
            </div>
            <Switch checked={masterEnabled} onCheckedChange={(v) => onToggleMaster(Boolean(v))} />
          </div>
        </div>
      </div>

      {!masterEnabled && (
        <div className="flex items-center justify-between gap-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
          <span className="flex items-center gap-2">
            <ShieldAlertIcon className="size-4 shrink-0 text-amber-600" />
            Website Opportunities is currently hidden from customer sidebars.
          </span>
          <Button size="sm" variant="outline" onClick={() => onToggleMaster(true)}>
            Turn surface ON
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <CompassIcon className="size-4 text-primary" />
          <div className="min-w-0 text-xs">
            <div className="text-muted-foreground">Map Discovery</div>
            <div className="truncate font-semibold">Google Maps + OSM fallback</div>
            <div className="text-muted-foreground">Radius 2,000m · max 40 places</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <GlobeIcon className="size-4 text-primary" />
          <div className="min-w-0 text-xs">
            <div className="text-muted-foreground">Web Search &amp; Crawl</div>
            <div className="truncate font-semibold">DeepSeek → Jina → Firecrawl</div>
            <div className="text-muted-foreground">Enriches missing Website / FB / IG</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <ImageIcon className="size-4 text-primary" />
          <div className="min-w-0 text-xs">
            <div className="text-muted-foreground">Picture Pipeline</div>
            <div className="truncate font-semibold">Vision (80) + Outpaint (3)</div>
            <div className="text-muted-foreground">+24 real photos for AI Chat</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <LayersIcon className="size-4 text-amber-600" />
          <div className="min-w-0 text-xs">
            <div className="text-muted-foreground">Pinned Template (Joomla)</div>
            <div className="truncate font-semibold">ja-restaurant → ja-impact</div>
            <div className="text-amber-600 dark:text-amber-400">Hidden in /ops/cms · fallback active</div>
          </div>
        </div>
      </div>

      {/* Card 1: 4 Provider Keys */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRoundIcon className="size-4 text-muted-foreground" />
                1. Search, Scrape &amp; Discovery Provider Keys
              </CardTitle>
              <CardDescription className="text-xs">
                Stored encrypted in <code className="font-mono">sealed</code>. DeepSeek Search/Fetch, Jina,
                and Firecrawl offload website discovery &amp; SPA scraping from Apify.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <RefreshCwIcon className="mr-1.5 size-3.5" />
              Test all 4 providers
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table className="text-xs">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="pl-5">Provider</TableHead>
                <TableHead>Endpoints &amp; Role</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Live Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                {
                  name: 'DeepSeek Search & Fetch API',
                  note: '$0.75 / 1k calls (Free promo until 01/11/2026)',
                  role: 'Primary web search enrichment & clean markdown fetch',
                  endpoints: 'POST /v1/tools/search · POST /v1/tools/fetch',
                  source: 'system-fallback',
                  hint: 'sk-•••6f3a',
                  status: '200 OK · search 1.4s · fetch 1.1s'
                },
                {
                  name: 'Firecrawl API',
                  note: '1 credit / scrape · 2 credits / search',
                  role: 'Anti-bot & SPA JS-rendered website scraper',
                  endpoints: 'POST /v1/scrape · POST /v1/search',
                  source: 'sealed',
                  hint: 'fc-•••91d4',
                  status: '200 OK · 4,820 / 5,000 credits left'
                },
                {
                  name: 'Jina Reader & Search API',
                  note: '500 RPM with JINA_API_KEY',
                  role: 'Fast LLM-ready markdown reader & search',
                  endpoints: 'GET r.jina.ai/<url> · GET s.jina.ai/<q>',
                  source: 'sealed',
                  hint: 'jina_•••88c1',
                  status: '200 OK · 892k tokens left'
                },
                {
                  name: 'Apify API',
                  note: 'Pay-per-event ($0.25 cap per run)',
                  role: 'Google Maps Places + Facebook, Instagram, TikTok, YouTube',
                  endpoints: 'compass/crawler-google-places · apify/facebook-posts-scraper',
                  source: 'sealed',
                  hint: 'apify_api_•••4e2b',
                  status: '200 OK · $38.40 / $49.00 left'
                }
              ].map((p) => (
                <TableRow key={p.name}>
                  <TableCell className="pl-5">
                    <div className="font-semibold text-sm">{p.name}</div>
                    <div className="text-muted-foreground">{p.note}</div>
                  </TableCell>
                  <TableCell>
                    <div>{p.role}</div>
                    <code className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {p.endpoints}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{p.source}</Badge> <code className="font-mono">{p.hint}</code>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CheckCircle2Icon className="size-3.5 text-emerald-600" />
                      {p.status}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Card 2 & 3 */}
      <Card>
        <CardHeader className="border-b border-border pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <SearchIcon className="size-4 text-muted-foreground" />
            2. Search, Web Enrichment, Picture Curation &amp; Template Policies
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border px-6 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div>
              <div className="font-semibold text-sm">Web Search Enrichment Before Social Crawl</div>
              <div className="text-muted-foreground">
                Finds missing official Website, Facebook Page, and Instagram Profile omitted from Google Maps
                / OSM pins.
              </div>
            </div>
            <NativeSelect size="sm" defaultValue="auto">
              <NativeSelectOption value="auto">
                Auto Chain: DeepSeek Search → Jina Search → Firecrawl (Recommended)
              </NativeSelectOption>
              <NativeSelectOption value="deepseek">
                DeepSeek Search API only (/v1/tools/search)
              </NativeSelectOption>
              <NativeSelectOption value="jina">Jina Search API only (s.jina.ai)</NativeSelectOption>
              <NativeSelectOption value="firecrawl">
                Firecrawl Search API only (/v1/search)
              </NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div>
              <div className="font-semibold text-sm">Website Crawl &amp; JS-Render Fallback Chain</div>
              <div className="text-muted-foreground">
                Escalates through markdown extractors when direct HTTP returns a JS shell (&lt; 400 chars).
              </div>
            </div>
            <NativeSelect size="sm" defaultValue="chain-1">
              <NativeSelectOption value="chain-1">
                Direct HTTP → DeepSeek Fetch → Jina Reader → Firecrawl → Apify (Recommended)
              </NativeSelectOption>
            </NativeSelect>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div>
              <div className="font-semibold text-sm">Auto-collected Sources on Research Start</div>
              <div className="text-muted-foreground">
                TikTok &amp; YouTube are off by default for faster research (~45s), unless pasted directly in
                By link.
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {(['Website', 'Facebook', 'Instagram'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5">
                  <Checkbox defaultChecked /> <span>{s}</span>
                </label>
              ))}
              {(['TikTok (+35s)', 'YouTube (+25s)'] as const).map((s) => (
                <label key={s} className="flex items-center gap-1.5 text-muted-foreground">
                  <Checkbox /> <span>{s}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div>
              <div className="font-semibold text-sm">Split Daily Account Budgets &amp; Extra Chat Photos</div>
              <div className="text-muted-foreground">
                Separates Map Search cap from Social Research cap; preloads extra real photos for Cowork chat.
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Searches/day</Label>
                <Input type="number" defaultValue={15} className="h-7 w-16 text-xs" />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Research/day</Label>
                <Input type="number" defaultValue={30} className="h-7 w-16 text-xs" />
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Chat photos</Label>
                <Input type="number" defaultValue={24} className="h-7 w-16 text-xs" />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 py-3.5">
            <div>
              <div className="font-semibold text-sm">
                <WandSparklesIcon className="mr-1.5 inline size-3.5 text-muted-foreground" />
                Hero 16:9 Picture Policy &amp; Pinned Joomla Template
              </div>
              <div className="text-amber-600 dark:text-amber-400">
                <code>ja-restaurant</code> is hidden in{' '}
                <a href="#/ops/cms" className="underline">
                  /ops/cms <ExternalLinkIcon className="inline size-3" />
                </a>{' '}
                → fallback <strong>ja-impact</strong> is active.
              </div>
            </div>
            <NativeSelect size="sm" defaultValue="outpaint-and-scene">
              <NativeSelectOption value="outpaint-and-scene">
                Outpaint real photos + Reference scene fallback (Max 3 / site · ~$0.10)
              </NativeSelectOption>
              <NativeSelectOption value="outpaint">Outpaint real photos only</NativeSelectOption>
              <NativeSelectOption value="real-only">Strict real photos only</NativeSelectOption>
            </NativeSelect>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── 6. Main Component: `WoQueue` (Exact Twin of `Ci` in `packages/web/tracy-harness/src/Ci.tsx`) ──

export function WoQueueMock({
  initial = 213,
  initialSubPage = 'queue',
  initialFilter = 'All WOs',
  viewer = 'All',
  mode = 'loaded'
}: {
  initial?: number | null
  initialSubPage?: 'queue' | 'settings'
  initialFilter?: string
  viewer?: string
  mode?: 'loaded' | 'empty' | 'unavailable' | 'stale'
}) {
  const [subPage, setSubPage] = useState<'queue' | 'settings'>(initialSubPage)
  const [masterEnabled, setMasterEnabled] = useState(true)
  const [cmsBranch, setCmsBranch] = useState('All')
  const [date, setDate] = useState('24h')
  const [dateField, setDateField] = useState('updated')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [draftField, setDraftField] = useState('updated')
  const [draftFrom, setDraftFrom] = useState('')
  const [draftTo, setDraftTo] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [rowsState, setRowsState] = useState<WoRow[]>(
    mode === 'empty' || mode === 'unavailable' ? [] : INITIAL_ROWS
  )
  const [expanded, setExpanded] = useState<number | null>(initial ?? null)
  const [filter, setFilter] = useState(initialFilter)
  const [person, setPerson] = useState(viewer)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('id')
  const [descending, setDescending] = useState(true)
  const [briefWidth, setBriefWidth] = useState(260)
  const briefDrag = useRef<{ x: number; width: number } | null>(null)
  const memberTabs = useRef<HTMLDivElement>(null)
  const [copyStatus, setCopyStatus] = useState<{ id: number; message: string } | null>(null)
  const [copyAllStatus, setCopyAllStatus] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)

  const tick = SNAPSHOT_NOW
  const unavailable = mode === 'unavailable'
  const stale = mode === 'stale'

  useEffect(() => {
    memberTabs.current
      ?.querySelector<HTMLElement>('[role=tab][aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [person])

  const resizeBrief = (next: number) => setBriefWidth(Math.max(180, Math.min(600, next)))

  const available = rowsState.filter((r) => cmsBranch === 'All' || r.target.startsWith(`${cmsBranch}/`))
  const authored = available.filter((row) => person === 'All' || row.authorId === person)
  const timeColumn = filterTimeColumn(filter)
  const matchingRows = sortedRows(
    authored.filter(
      (p) =>
        matchesWoFilter(p, filter) &&
        `${p.id} ${p.title} ${p.author} ${p.commit} ${p.target} ${p.deployment.label}`
          .toLowerCase()
          .includes(query.toLowerCase())
    ),
    sort,
    descending,
    tick,
    filter
  )
  const pages = Math.max(1, Math.ceil(matchingRows.length / pageSize))
  const currentPage = Math.min(page, pages)
  const rows = matchingRows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const p = rows.find((row) => row.id === expanded) ?? available.find((row) => row.id === expanded) ?? null

  const toggle = (id: number) => {
    setExpanded((current) => (current === id ? null : id))
    setRowsState((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)))
  }

  function selectFilter(next: string) {
    setFilter(next)
    setPage(1)
    setCopyStatus(null)
    setCopyAllStatus(null)
  }

  async function copyIssue(row: WoRow) {
    try {
      await navigator.clipboard.writeText(agentIssueText(row))
      setCopyStatus({ id: row.id, message: 'Copied to clipboard' })
    } catch {
      setCopyStatus({ id: row.id, message: 'Copied to clipboard' })
    }
  }

  async function copyAllIssues() {
    try {
      await navigator.clipboard.writeText(agentIssuesText(rows))
      setCopyAllStatus(`Copied ${rows.length} issue(s) to clipboard`)
    } catch {
      setCopyAllStatus(`Copied ${rows.length} issue(s) to clipboard`)
    }
  }

  function markAllRead() {
    setRowsState((prev) =>
      prev.map((r) => (person === 'All' || r.authorId === person ? { ...r, unread: false } : r))
    )
  }

  // Operator actions on WO rows
  function forceCompleteBrief(id: number) {
    setRowsState((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              unread: false,
              state: 'Brief ready',
              build: 'Ready',
              commit: `rev1-${r.commit.slice(-6)}`,
              progress: {
                value: 80,
                label: 'Brief Revision #1 ready · awaiting Build demo site',
                tone: 'waiting'
              },
              note: 'Brief Revision #1 frozen by operator from collected photos',
              checks: r.checks.map((c) =>
                c.conclusion === 'PAUSED' || c.conclusion === 'TIMED_OUT'
                  ? { ...c, conclusion: 'SKIPPED', summary: null }
                  : c
              )
            }
          : r
      )
    )
    setActionNotice(
      `WO #${id}: Skipped blocked collector and froze Brief Revision #1 from already-stored photos.`
    )
  }

  function resetCapAndResume(id: number, author: string) {
    setRowsState((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              unread: false,
              state: 'Researching',
              build: 'Building',
              progress: { value: 50, label: 'Resumed Instagram scraper after cap reset', tone: 'running' },
              note: 'Resumed Instagram scraper · lease #46',
              checks: r.checks.map((c) =>
                c.conclusion === 'PAUSED'
                  ? { ...c, status: 'IN_PROGRESS', conclusion: null, summary: null }
                  : c
              )
            }
          : r
      )
    )
    setActionNotice(`Reset today's 30/30 research cap for ${author} and resumed WO #${id}.`)
  }

  function columnHeader(c: (typeof columns)[number]) {
    const label = c.key === 'committedAt' ? timeColumn.label : c.label
    const hint = c.key === 'committedAt' ? timeColumn.hint : c.hint
    const isBrief = c.key === 'title'
    return (
      <TableHead
        key={c.key}
        aria-sort={sort === c.key ? (descending ? 'descending' : 'ascending') : 'none'}
        style={isBrief ? { width: briefWidth, minWidth: briefWidth, maxWidth: briefWidth } : undefined}
        className={cn(
          isBrief && 'sticky left-0 z-20 bg-muted/90 backdrop-blur',
          executionColumn(c.key) && 'bg-primary/5',
          c.key === 'build' && 'border-l border-primary/20',
          c.key === 'duration' && 'border-r border-primary/20'
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-0 text-xs"
          title={hint}
          aria-label={`Sort by ${label}`}
          onClick={() => {
            setSort(c.key)
            setDescending(sort === c.key ? !descending : c.key === 'committedAt' || c.key === 'mergedAt')
          }}
        >
          {label}
          {sort === c.key ? (
            descending ? (
              <ArrowDown className="size-3" />
            ) : (
              <ArrowUp className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3 text-muted-foreground" />
          )}
        </Button>
        {isBrief && (
          <div
            role="separator"
            aria-label="Resize Opportunity column"
            aria-orientation="vertical"
            aria-valuemin={180}
            aria-valuemax={600}
            aria-valuenow={briefWidth}
            tabIndex={0}
            className="absolute inset-y-0 right-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center hover:bg-primary/10 focus-visible:outline-ring"
            title="Drag to resize Opportunity column"
            onPointerDown={(event) => {
              event.preventDefault()
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              briefDrag.current = { x: event.clientX, width: briefWidth }
            }}
            onPointerMove={(event) => {
              if (briefDrag.current)
                resizeBrief(briefDrag.current.width + event.clientX - briefDrag.current.x)
            }}
            onPointerUp={() => {
              briefDrag.current = null
            }}
          >
            <span className="h-4 w-0.5 rounded bg-border" />
          </div>
        )}
      </TableHead>
    )
  }

  const searchBox = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 size-4 text-muted-foreground" />
        <Input
          className="h-8 w-52 pl-8"
          aria-label="Search WOs"
          placeholder="WO, restaurant, user or site…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <NativeSelect aria-label="CMS" value={cmsBranch} onChange={(e) => setCmsBranch(e.target.value)}>
        {['All', 'joomla', 'wordpress', 'emdash'].map((value) => (
          <option key={value} value={value}>
            CMS: {value}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Date range"
        value={date}
        onChange={(e) => {
          const value = e.target.value
          if (value === 'custom') {
            setDraftField(dateField)
            setDraftFrom(from)
            setDraftTo(to)
            setAdvancedOpen(true)
          } else setDate(value)
        }}
      >
        <option value="24h">Date: Last 24h</option>
        <option value="7d">Date: Last 7 days</option>
        <option value="30d">Date: Last 30 days</option>
        <option value="90d">Date: Last 90 days</option>
        <option value="any">Date: Any time</option>
        <option value="custom">Date: Custom range…</option>
      </NativeSelect>
      <Popover
        open={advancedOpen}
        onOpenChange={(open) => {
          setAdvancedOpen(open)
          if (open) {
            setDraftField(dateField)
            setDraftFrom(from)
            setDraftTo(to)
          }
        }}
      >
        <PopoverTrigger render={<Button variant="outline" size="sm" />}>
          <SlidersHorizontal className="size-3.5" />
          Filter{dateField !== 'updated' || date === 'custom' ? ' · 1' : ''}
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-4" align="end">
          <div>
            <h2 className="font-semibold">Advanced filters</h2>
            <p className="mt-1 text-xs text-muted-foreground">CMS and dates apply before paging.</p>
          </div>
          <label className="block space-y-1 text-sm">
            <span>Date field</span>
            <NativeSelect
              aria-label="Date field"
              value={draftField}
              onChange={(e) => setDraftField(e.target.value)}
            >
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="merged">Demo site built</option>
            </NativeSelect>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-sm">
              <span>From</span>
              <Input
                aria-label="From date"
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>To</span>
              <Input
                aria-label="To date"
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
              />
            </label>
          </div>
          <div className="flex justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setCmsBranch('All')
                setDate('24h')
                setDateField('updated')
                setFrom('')
                setTo('')
                setAdvancedOpen(false)
              }}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setDateField(draftField)
                setFrom(draftFrom)
                setTo(draftTo)
                if (draftFrom || draftTo) setDate('custom')
                setAdvancedOpen(false)
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      <Button
        variant={subPage === 'settings' ? 'secondary' : 'outline'}
        size="sm"
        onClick={() => setSubPage(subPage === 'settings' ? 'queue' : 'settings')}
      >
        <Settings2Icon className="size-3.5" />
        Settings
      </Button>
    </div>
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 text-sm">
        <span>
          <strong>tracy</strong>
          <span className="mx-3 text-muted-foreground">/ Operations /</span>Website Opportunities
        </span>
        <Badge variant="outline">Mockup · sample data</Badge>
      </header>

      <div className="space-y-4 p-5">
        {subPage === 'settings' ? (
          <WoSettingsPanel
            masterEnabled={masterEnabled}
            onToggleMaster={setMasterEnabled}
            onBackToQueue={() => setSubPage('queue')}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Website Opportunities</h1>
              {searchBox}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                wo.tracy.site · {cmsBranch === 'All' ? 'joomla, wordpress and emdash' : cmsBranch} ·{' '}
                {available.length} WOs ·{' '}
                {dateField === 'updated' ? 'Updated' : dateField === 'created' ? 'Created' : 'Built'} ·
                Updates automatically every 30 seconds
              </span>
              <div className="flex items-center gap-2">
                <span>{stale ? 'Updated 18 min ago' : 'Updated just now'}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActionNotice('Refreshed Website Opportunities queue snapshot.')}
                >
                  <RefreshCw className="size-3.5" />
                  Refresh
                </Button>
              </div>
            </div>

            {actionNotice && (
              <div
                role="status"
                className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-xs"
              >
                <span>{actionNotice}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => setActionNotice(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}

            {(stale || unavailable) && (
              <div
                role="status"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-2 text-sm"
              >
                {unavailable
                  ? 'Queue status could not be read. Check your staff session and try again.'
                  : 'Updates are delayed. Showing the last known snapshot; statuses may have changed.'}
              </div>
            )}

            <Tabs
              value={person}
              onValueChange={(value) => {
                const member = String(value)
                setPerson(member)
                setQuery('')
                setFilter(
                  available.some(
                    (row) => (member === 'All' || row.authorId === member) && needsAttention(row)
                  )
                    ? 'Needs attention'
                    : 'All WOs'
                )
                setCopyStatus(null)
              }}
              className="min-w-0 gap-4"
            >
              {/* Member Line-Tabs (exact /ops/ci layout) */}
              <div className="flex min-w-0 items-center gap-3 border-b border-border">
                <div
                  className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain pb-1"
                  aria-label="Scroll member tabs"
                  ref={memberTabs}
                >
                  <TabsList
                    variant="line"
                    aria-label="Filter by user"
                    className="h-10 min-w-max justify-start gap-1"
                  >
                    {[{ id: 'All', name: 'All', login: null }, ...INITIAL_MEMBERS].map((member) => (
                      <TabsTrigger
                        key={member.id}
                        value={member.id}
                        className="h-9 flex-none px-3 data-active:text-primary after:bg-primary"
                        onFocus={(event) =>
                          event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                        }
                      >
                        {member.name}
                        {member.id === 'lee' && <span className="text-xs text-muted-foreground">(you)</span>}
                        <span className="text-xs text-muted-foreground">
                          {unavailable
                            ? '—'
                            : available.filter((row) => member.id === 'All' || row.authorId === member.id)
                                .length}
                        </span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
                {person !== 'All' && (
                  <span className="hidden shrink-0 pb-1 text-xs text-muted-foreground sm:block">
                    Viewing {INITIAL_MEMBERS.find((m) => m.id === person)?.name ?? 'the selected user'}
                  </span>
                )}
              </div>

              {/* Numbered Stage Filter Bar (0–7 + Attention — exact /ops/ci layout) */}
              <div className="min-w-0 overflow-x-auto pb-1">
                <div className="flex w-max items-center gap-0.5" aria-label="Filter WOs">
                  {woFilters.map((stage) => {
                    const count = unavailable ? '—' : authored.filter((p) => matchesWoFilter(p, stage)).length
                    const step = woStages.indexOf(stage)
                    const attention = stage === 'Needs attention'
                    return (
                      <Button
                        key={stage}
                        size="sm"
                        variant={attention ? 'outline' : filter === stage ? 'secondary' : 'ghost'}
                        aria-pressed={filter === stage}
                        aria-label={`${step >= 0 ? `${step}. ` : ''}${compactLabels[stage] ?? stage} ${count}`}
                        title={stage}
                        className={cn(
                          'h-7 shrink-0 gap-1 px-2 text-xs',
                          count === 0 && filter !== stage && 'opacity-45',
                          typeof count === 'number' && count > 0 && 'font-semibold',
                          !attention && filter === stage && 'font-semibold',
                          attention &&
                            'ml-2 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive',
                          attention && filter === stage && 'border-destructive/50 bg-destructive/10'
                        )}
                        onClick={() => selectFilter(stage)}
                      >
                        {step >= 0 && <span className="text-muted-foreground">{step}.</span>}
                        {compactLabels[stage] ?? stage}
                        <span
                          className={cn(
                            'text-muted-foreground',
                            attention &&
                              !unavailable &&
                              authored.some(needsAttention) &&
                              'rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive'
                          )}
                        >
                          {count}
                        </span>
                      </Button>
                    )
                  })}
                </div>
              </div>

              <TabsContent value={person} className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {authored.filter((row) => row.unread === true).length} unread · Read status is saved for
                    your account
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!authored.some((row) => row.unread === true)}
                    onClick={markAllRead}
                  >
                    Mark all as read
                  </Button>
                </div>

                {/* Issues to review section when filter === 'Needs attention' (exact /ops/ci layout) */}
                {filter === 'Needs attention' && rows.length > 0 && (
                  <section
                    aria-label="Issues to review"
                    className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold">Issues to review · {rows.length}</h2>
                      <Button size="sm" variant="outline" onClick={() => void copyAllIssues()}>
                        Copy all issues to Agent
                      </Button>
                    </div>
                    {copyAllStatus && (
                      <p role="status" className="text-xs text-muted-foreground">
                        {copyAllStatus}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Each item explains why the opportunity stopped and how to unblock it. You can
                      force-complete Brief Revision #1 from already-collected photos or reset the user’s daily
                      cap.
                    </p>
                    {rows.map((row) => {
                      const issue = attentionIssue(row)
                      return (
                        <div
                          key={row.id}
                          className="space-y-2 rounded-md border border-border bg-background p-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <button
                              type="button"
                              className="text-left text-sm font-medium hover:underline"
                              onClick={() => setExpanded(row.id)}
                            >
                              #{row.id} · {row.title}
                              {row.unread === true && (
                                <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                                  New
                                </Badge>
                              )}
                            </button>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-medium">{row.author}</span>
                              <Button size="sm" variant="outline" onClick={() => forceCompleteBrief(row.id)}>
                                <FastForwardIcon className="mr-1 size-3.5" />
                                Force Complete Brief
                              </Button>
                              {row.state === 'Paused on quota' ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resetCapAndResume(row.id, row.author)}
                                >
                                  <PlayIcon className="mr-1 size-3.5" />
                                  Reset Cap &amp; Resume
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resetCapAndResume(row.id, row.author)}
                                >
                                  <RotateCcwIcon className="mr-1 size-3.5" />
                                  Reclaim Lease &amp; Retry
                                </Button>
                              )}
                              <Button size="sm" variant="outline" onClick={() => void copyIssue(row)}>
                                Copy to send to Agent
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs font-medium">{issue.label}</p>
                          <p className="text-xs text-muted-foreground">{issue.evidence}</p>
                          <p className="text-sm">{issue.action}</p>
                          {copyStatus?.id === row.id && (
                            <p role="status" className="text-xs text-muted-foreground">
                              {copyStatus.message}
                            </p>
                          )}
                          <details className="text-xs text-muted-foreground">
                            <summary className="cursor-pointer">Agent text</summary>
                            <pre className="mt-2 whitespace-pre-wrap break-words">{agentIssueText(row)}</pre>
                          </details>
                        </div>
                      )
                    })}
                  </section>
                )}

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {rows.length} WOs shown · Sorted by{' '}
                    {sort === 'committedAt' ? timeColumn.label : columns.find((c) => c.key === sort)?.label},{' '}
                    {descending ? 'descending' : 'ascending'}
                    {sort === 'build' && ' · Failed → Researching → Queued → Ready → Not started'}
                  </span>
                  <span>
                    Waiting counts opportunities with queued collectors waiting for one of the executor worker
                    slots.
                  </span>
                </div>

                {/* Main Split Grid: 15-Column Table + Right-Hand Sticky Panel (`lg:grid-cols-[minmax(0,1fr)_480px]`) */}
                <div className={cn('grid items-start gap-4', p && 'lg:grid-cols-[minmax(0,1fr)_480px]')}>
                  <div className="min-w-0 overflow-hidden rounded-lg border border-border">
                    <Table
                      className="text-xs"
                      style={{ minWidth: 1500 + briefWidth }}
                      aria-label="Website Opportunities"
                    >
                      <TableHeader className="bg-muted/50">
                        <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="w-9">
                            <span className="sr-only">Details</span>
                          </TableHead>
                          {columns.map((c) => columnHeader(c))}
                          <TableHead className="text-xs">Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={16} className="py-14 text-center text-muted-foreground">
                              {unavailable ? 'Status unavailable' : 'No WOs to show'}
                              {!unavailable && (
                                <p className="mt-1">
                                  {filter === 'Waiting to run'
                                    ? 'No opportunities currently have collectors waiting for a worker slot.'
                                    : available.length === 0
                                      ? 'New Website Opportunities will appear here.'
                                      : 'Try another filter or search.'}
                                </p>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                        {rows.map((p) => {
                          const open = expanded === p.id
                          const step = woStep(p)
                          const progress = p.progress
                          const ci = executionSummary(p, tick)
                          const singleRunner = p.execution?.jobs.find(
                            (job) => job.runner?.name === ci.runner
                          )?.runner
                          const note = failureGuidance(p)?.note ?? ci.waitingNote ?? p.note
                          return (
                            <Fragment key={p.id}>
                              <TableRow
                                data-wo={p.id}
                                data-read-state={
                                  p.unread === true ? 'unread' : p.unread === false ? 'read' : 'unknown'
                                }
                                onClick={(event) => {
                                  if (
                                    (event.target as HTMLElement).closest('button, a, input, select') ||
                                    window.getSelection()?.toString()
                                  )
                                    return
                                  toggle(p.id)
                                }}
                                className={cn(
                                  'cursor-pointer border-border',
                                  progress && 'border-b-0',
                                  open && 'bg-muted/40',
                                  p.unread === true
                                    ? 'font-semibold [&_td]:font-semibold [&_td_*]:font-semibold'
                                    : 'font-normal [&_td]:font-normal [&_td_*]:font-normal'
                                )}
                              >
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-7"
                                    aria-label={`${open ? 'Collapse' : 'Expand'} WO ${p.id}`}
                                    aria-expanded={open}
                                    aria-controls={open ? `wo-details-${p.id}` : undefined}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      toggle(p.id)
                                    }}
                                  >
                                    {open ? (
                                      <ChevronDown className="size-3.5" />
                                    ) : (
                                      <ChevronRight className="size-3.5" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground">#{p.id}</TableCell>
                                <TableCell>
                                  {step ? (
                                    <span
                                      className="text-xs tabular-nums"
                                      title={`${step.index}. ${compactLabels[step.label] ?? step.label}`}
                                      aria-label={`Step ${step.index}: ${compactLabels[step.label] ?? step.label}`}
                                    >
                                      {step.index}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell
                                  className="sticky left-0 z-10 bg-background"
                                  style={{ width: briefWidth, minWidth: briefWidth, maxWidth: briefWidth }}
                                >
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      toggle(p.id)
                                    }}
                                    aria-expanded={open}
                                    aria-controls={open ? `wo-details-${p.id}` : undefined}
                                    className="flex items-center gap-2 text-left text-sm font-medium hover:underline focus-visible:outline-ring"
                                    style={{ width: briefWidth - 24 }}
                                    title={p.title}
                                  >
                                    {p.unread === true && (
                                      <Badge
                                        variant="outline"
                                        className="shrink-0 border-primary/30 text-primary"
                                      >
                                        New
                                      </Badge>
                                    )}
                                    <span className="min-w-0 truncate">{p.title}</span>
                                  </button>
                                </TableCell>

                                {/* Primary-tinted Execution Columns (exact /ops/ci layout) */}
                                <TableCell className="border-l border-primary/20 bg-primary/5">
                                  <span
                                    className={cn(
                                      'flex items-center gap-1.5',
                                      p.build === 'Failed' && 'text-destructive',
                                      p.build === 'Building' && 'text-primary'
                                    )}
                                  >
                                    {p.build === 'Ready' ? (
                                      <CheckCircle2 className="size-3.5" />
                                    ) : p.build === 'Failed' ? (
                                      <AlertCircle className="size-3.5" />
                                    ) : p.build === 'Building' ? (
                                      <Clock3 className="size-3.5" />
                                    ) : (
                                      <Circle className="size-3.5" />
                                    )}
                                    {p.build === 'Building' ? 'Researching' : p.build}
                                  </span>
                                </TableCell>
                                <TableCell className="max-w-[190px] truncate bg-primary/5" title={ci.step}>
                                  {ci.step}
                                </TableCell>
                                <TableCell className="max-w-[175px] bg-primary/5" title={ci.runner}>
                                  <span className="block truncate font-mono">{ci.runner}</span>
                                  {singleRunner && (
                                    <span className="block text-[10px] text-muted-foreground">
                                      {runnerLabel(singleRunner)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="border-r border-primary/20 bg-primary/5 font-mono">
                                  {durationLabel(rowDuration(p, tick))}
                                  <p className="mt-1 text-xs font-sans text-muted-foreground">
                                    {!p.merged
                                      ? 'Research'
                                      : p.deployment.stage === 'Building image'
                                        ? 'Provisioning'
                                        : ['Deploying', 'Live'].includes(p.deployment.stage ?? '')
                                          ? 'Uploading photos'
                                          : 'Not confirmed'}
                                  </p>
                                </TableCell>

                                <TableCell>{p.author}</TableCell>
                                <TableCell>
                                  <time
                                    dateTime={filterTime(p, filter) ?? undefined}
                                    title={exactTime(filterTime(p, filter))}
                                  >
                                    {relativeTime(filterTime(p, filter), tick)}
                                  </time>
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground" title={p.commit}>
                                  {p.commit.slice(0, 10)}
                                </TableCell>
                                <TableCell>
                                  {p.mergedAt ? (
                                    <div>
                                      <time dateTime={p.mergedAt} title={exactTime(p.mergedAt)}>
                                        {relativeTime(p.mergedAt, tick)}
                                      </time>
                                      <p
                                        className={cn(
                                          'mt-1 text-xs',
                                          p.deployment.failed ? 'text-destructive' : 'text-muted-foreground'
                                        )}
                                        title={p.deployment.label}
                                      >
                                        {p.deployment.stage === 'Deploying'
                                          ? 'Uploading photos'
                                          : (p.deployment.stage ?? 'Live')}
                                        {releaseDuration(p, tick) !== null &&
                                          ` · ${durationLabel(releaseDuration(p, tick))}`}
                                      </p>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground">Not built</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {p.queue ? (
                                    <Badge variant="outline" className="border-primary/30 text-primary">
                                      #{p.queue} {p.queue === 1 ? '· Next' : '· Waiting'}
                                    </Badge>
                                  ) : (
                                    <span className="text-muted-foreground">
                                      {p.state === 'Brief ready' ? 'Ready to build' : '—'}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      ['Needs a fix', 'Paused on quota'].includes(p.state)
                                        ? 'destructive'
                                        : 'secondary'
                                    }
                                    className="whitespace-nowrap"
                                  >
                                    {p.state}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-muted-foreground">{p.target}</TableCell>
                                <TableCell
                                  className="max-w-[220px] truncate text-muted-foreground"
                                  title={note}
                                >
                                  {note}
                                </TableCell>
                              </TableRow>
                              {progress && (
                                <TableRow className="border-0 hover:bg-transparent">
                                  <TableCell colSpan={16} className="h-[2px] p-0">
                                    <Progress
                                      value={progress.value}
                                      aria-label={`Progress for WO ${p.id}`}
                                      aria-valuetext={progress.label}
                                      title={progress.label}
                                      className={cn(
                                        'gap-0 [&_[data-slot=progress-track]]:h-[2px] [&_[data-slot=progress-track]]:rounded-none [&_[data-slot=progress-track]]:bg-border [&_[data-slot=progress-indicator]]:motion-reduce:transition-none',
                                        progress.tone === 'done' &&
                                          '[&_[data-slot=progress-indicator]]:bg-success',
                                        progress.tone === 'failed' &&
                                          '[&_[data-slot=progress-indicator]]:bg-destructive',
                                        progress.tone === 'running' &&
                                          !stale &&
                                          '[&_[data-slot=progress-indicator]]:motion-safe:animate-pulse'
                                      )}
                                    />
                                  </TableCell>
                                </TableRow>
                              )}
                            </Fragment>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Right-Hand Sticky Details Panel (exact /ops/ci layout) */}
                  {p && (
                    <div
                      id={`wo-details-${p.id}`}
                      role="region"
                      aria-label={`Details for WO ${p.id}`}
                      className="space-y-5 rounded-lg border border-border bg-card p-5 text-xs text-card-foreground lg:sticky lg:top-4"
                    >
                      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-medium">
                            WO #{p.id} · {p.author}
                          </span>
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline focus-visible:outline-ring"
                          >
                            {p.merged ? 'Open demo site' : 'View opportunity'}{' '}
                            <ExternalLink className="size-3" aria-hidden="true" />
                          </a>
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label="Close WO details"
                          onClick={() => setExpanded(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>

                      <div>
                        <h2 className="text-sm font-semibold">{p.title}</h2>
                        <p className="mt-2 text-sm text-muted-foreground">{p.detail}</p>
                      </div>

                      <WoExecutionPanel key={`${p.id}:${p.commit}`} row={p} now={tick} />

                      <div>
                        <h3 className="font-semibold">What happens next</h3>
                        <p className="mt-1 text-sm">{failureGuidance(p)?.note ?? p.next}</p>
                        {failureGuidance(p) && (
                          <div className="mt-2 space-y-2 text-sm text-muted-foreground">
                            <p>{failureGuidance(p)!.explanation}</p>
                            {failureGuidance(p)!.checks.length > 0 && (
                              <p>Stopped collectors: {failureGuidance(p)!.checks.join(', ')}</p>
                            )}
                            <div className="flex flex-wrap gap-2 pt-1">
                              <Button size="sm" variant="outline" onClick={() => forceCompleteBrief(p.id)}>
                                <FastForwardIcon className="mr-1 size-3.5" />
                                Force Complete Brief
                              </Button>
                              <Button size="sm" onClick={() => resetCapAndResume(p.id, p.author)}>
                                <PlayIcon className="mr-1 size-3.5" />
                                {p.state === 'Paused on quota'
                                  ? 'Reset Cap & Resume'
                                  : 'Reclaim Lease & Retry'}
                              </Button>
                            </div>
                          </div>
                        )}
                        <p className="mt-2 text-muted-foreground">
                          {!stale && p.estimateSeconds !== null
                            ? `Estimated completion in about ${p.estimateSeconds} s.`
                            : 'No confirmed completion time.'}
                        </p>
                      </div>

                      <div>
                        <h3 className="mb-3 font-semibold">Collectors on {p.commit.slice(0, 10)}</h3>
                        <ol className="space-y-3">
                          {p.checks.map((check) => (
                            <li key={check.id}>
                              <div className="flex justify-between gap-3">
                                <span className="min-w-0 break-words">{check.name}</span>
                                <span className="shrink-0 text-muted-foreground">{checkLabel(check)}</span>
                              </div>
                              {check.steps
                                .filter(
                                  (step) =>
                                    step.status === 'IN_PROGRESS' ||
                                    ['FAILURE', 'PAUSED'].includes(step.conclusion ?? '')
                                )
                                .map((step) => (
                                  <p key={step.number} className="mt-1 text-muted-foreground">
                                    {step.name}: {checkLabel(step)}
                                  </p>
                                ))}
                              {check.summary &&
                                ['FAILURE', 'TIMED_OUT', 'ACTION_REQUIRED', 'PAUSED'].includes(
                                  check.conclusion ?? ''
                                ) && (
                                  <p className="mt-1 whitespace-pre-wrap break-words text-destructive">
                                    {check.summary}
                                  </p>
                                )}
                            </li>
                          ))}
                        </ol>
                        {!p.checks.length && (
                          <p className="text-muted-foreground">
                            No collectors have started on this opportunity yet.
                          </p>
                        )}
                        <p className="mt-3 text-muted-foreground">
                          Collectors run in stage order: web search enrichment → website &amp; social scrape →
                          AI Vision photo labelling → Brief Revision #1 snapshot.
                        </p>
                      </div>

                      <div>
                        <h3 className="font-semibold">
                          {p.build === 'Failed' ? 'What went wrong' : 'Latest result'}
                        </h3>
                        <p className="mt-2 text-sm text-muted-foreground">{p.outcome}</p>
                        <div className="mt-3 flex gap-2">
                          <span className="font-medium">Demo site</span>
                          <span>
                            {p.deployment.stage && `${p.deployment.stage} · `}
                            {p.deployment.label}
                            {releaseDuration(p, tick) !== null &&
                              ` · ${durationLabel(releaseDuration(p, tick))}`}
                          </span>
                        </div>
                        {p.deployment.checks.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs">
                            {p.deployment.checks.map((check) => (
                              <li key={`${check.workflow}:${check.id}`}>
                                {check.workflow} · {check.name} · {checkLabel(check)}
                              </li>
                            ))}
                          </ul>
                        )}
                        <details className="mt-3">
                          <summary className="cursor-pointer text-muted-foreground">
                            Technical details &amp; timestamps
                          </summary>
                          <p className="mt-2 break-words font-mono text-muted-foreground">
                            {`Pipeline: ${p.mergeState} · Brief: ${p.review ?? 'None'} · Queue: ${p.queueState ?? 'Not queued'}`}
                          </p>
                          <p className="mt-2">Updated: {exactTime(p.committedAt)}</p>
                          <p>Demo site built: {p.mergedAt ? exactTime(p.mergedAt) : 'Not built'}</p>
                          {p.deployment.coverage?.map((proof) => (
                            <p key={proof.workflow}>
                              {proof.workflow}: {proof.commit}
                            </p>
                          ))}
                        </details>
                      </div>
                    </div>
                  )}
                </div>

                {/* Pagination & Milestone Footer (exact /ops/ci layout) */}
                <nav
                  aria-label="WO pagination"
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm"
                >
                  <span role="status">
                    {matchingRows.length ? (currentPage - 1) * pageSize + 1 : 0}–
                    {Math.min(currentPage * pageSize, matchingRows.length)} of {matchingRows.length} WOs
                  </span>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-muted-foreground">
                      Items per page
                      <NativeSelect
                        aria-label="Items per page"
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                      >
                        {[25, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </NativeSelect>
                    </label>
                    <label className="flex items-center gap-2">
                      Page
                      <NativeSelect
                        aria-label="Page"
                        value={currentPage}
                        onChange={(e) => {
                          setPage(Number(e.target.value))
                          setExpanded(null)
                        }}
                      >
                        {Array.from({ length: pages }, (_, i) => (
                          <option key={i + 1} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </NativeSelect>
                      of {pages}
                    </label>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Previous page"
                      disabled={currentPage === 1}
                      onClick={() => {
                        setPage(currentPage - 1)
                        setExpanded(null)
                      }}
                    >
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label="Next page"
                      disabled={currentPage === pages}
                      onClick={() => {
                        setPage(currentPage + 1)
                        setExpanded(null)
                      }}
                    >
                      Next
                    </Button>
                  </div>
                </nav>
                <p className="text-xs text-muted-foreground">
                  Row lines show milestones: collectors → Vision curation → Brief Rev #1 → demo site live.
                  Green full line = demo site live. Progress is by stage, not elapsed time.
                </p>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </main>
  )
}

// ── 7. Storybook Meta & Stories (Matches `ops-ci.mock.stories.tsx`) ─────────────────────────

const meta = {
  title: 'Mockups/Ops/WebsiteOpportunities',
  component: WoQueueMock,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof WoQueueMock>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  args: {
    viewer: 'All',
    initial: 213
  }
}

export const NeedsAttention: Story = {
  args: {
    initialFilter: 'Needs attention',
    initial: 213
  }
}

export const BrowseByUserSarah: Story = {
  args: {
    viewer: 'sarah',
    initialFilter: 'Needs attention',
    initial: 213
  }
}

export const UploadingDemoSite: Story = {
  args: {
    initial: 212
  }
}

export const SettingsPage: Story = {
  args: {
    initialSubPage: 'settings'
  }
}

export const Empty: Story = {
  args: {
    mode: 'empty'
  }
}

export const Stale: Story = {
  args: {
    mode: 'stale',
    initial: 209
  }
}
