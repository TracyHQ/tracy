/**
 * Demos — the public demo of every installable quickstart: the address it answers at, who pinned
 * that address, what is deployed there, and the press that puts a fresh copy up.
 *
 * LIVE, LIKE QUICKSTARTS: nothing here is a reading of a tree. The list comes from what this
 * server last read off GitHub joined with the demo host's sites, and every press talks to that
 * host. So the screen carries no ref and draws on its own.
 *
 * ONE ADDRESS PER DEMO, DERIVED UNLESS PINNED (Lee, 16/09): `<templateName>-<cms>.<zone>` is the
 * default for all 86 releases at once; a person writes a row only to say otherwise. The pin is
 * saved by revision, the same way Build base is — two tabs disagreeing are told, not merged.
 *
 * A REDEPLOY IS A FRESH INSTALL: the running copy is torn down first, then the release is
 * installed again at the same address. The poll follows both jobs; the row says which it is on.
 *
 * 🔒 TWO SERVERS, AND THEY ARE INDEPENDENT (Lee, 16/09). A demo lives either on Tracy's own demo
 * host or on `demo.joomlart.com` — 459 demos on a machine Tracy did not build and does not run,
 * where Tracy only writes the addresses down. A domain does not move between them. Because an
 * address alone does not say WHICH machine a press lands on, every control here spells out the
 * server and its IP: the picker, the row, and the button's own title.
 */
import {
  Badge,
  Button,
  cn,
  Input,
  NativeSelect,
  NativeSelectOption,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { Check, ExternalLink, Globe, History, Pencil, RefreshCw, Rocket, Trash2, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Trans, tr, useT } from '../i18n'
import { CMS_LABEL, type Cms } from './App'
import { stepInWords } from './demo-failure-guides'
import { RowDrawer } from './parts'
import { relativeTime } from './relative-time'
import { jsonObject, type Refusals, readAnswer, refusedBy, textField, thrownText } from './response-error'

export interface DemoRow {
  tag: string
  platform: Cms
  label: string | null
  defaultLabel: string | null
  address: string | null
  pinned: boolean
  revision: number
  updatedBy: string | null
  updatedAt: string | null
  deployed: DeployedDemo | null
}

export interface DeployedDemo {
  label: string
  /** Which of the listing's `servers` the demo sits on. */
  host?: string
  address: string
  version: string | null
  jobId: string | null
  /** provision, teardown, remove or prefetch: what the latest job is doing, so a reload names it right. */
  kind?: JobView['kind'] | null
  state: string | null
  step: string | null
  /** The line a failed job died on (tracy-web `failureReason`) — null when it did not fail. */
  reason?: string | null
  /** When the latest job was recorded — what the "Deployed" column reads as "2 hours ago". */
  deployedAt: string | null
  live: boolean
}

/** One row of a demo's deploy history — a provision or teardown, with when it was recorded. */
export interface DeployJob {
  jobId: string
  kind: string
  state: string
  step: string | null
  reason?: string | null
  createdAt: string
}

export interface DemoListing {
  host: string | null
  /** The target this listing is of, and every target this deployment knows. */
  target?: string
  targets?: DemoTarget[]
  /**
   * The machines a demo may be put on (Brian, 22/09: any demo on any server), and the one it goes
   * to when nobody chose. One entry means there is nothing to choose, and no picker is drawn.
   */
  servers?: DemoServer[]
  defaultServer?: string | null
  zone: string
  writable: boolean
  reason: string | null
  demos: DemoRow[]
}

interface JobView {
  jobId: string
  kind: 'provision' | 'teardown' | 'remove' | 'prefetch'
  state: string
  step: string | null
  live: boolean
  reason?: string | null
  /** The demo is gone and its row with it — said once, by the poll that removed it. */
  removed?: boolean
  error?: string
  hostStatus?: number
  /** False when this deployment has no way to publish at all (no Cloudflare) — not a failure. */
  publicHere?: boolean
}

/**
 * "Failed at provision", with the line the script actually died on as its hover title. The step
 * alone is the same word for every failure the host reports (it writes `step: 'provision'` whatever
 * broke), so without the reason a checksum mismatch and a missing minimum Claude Cowork plugin
 * version read identically — but printed in the cell, a CLI usage dump (2 000 px on one release,
 * measured 30/09) set the width of the whole Demo column for every row.
 */
function Failed({ at, reason }: { at: string; reason?: string | null }) {
  const t = useT()
  return (
    <span
      className={cn(
        'text-destructive text-xs',
        reason && 'cursor-help underline decoration-dotted underline-offset-2'
      )}
      title={reason ?? undefined}
    >
      {t('cms-demos.state.failedAt', { step: at })}
    </span>
  )
}

const when = (iso: string | null) => (iso ? `${iso.slice(0, 16).replace('T', ' ')}Z` : '—')

/** A demo listing the server answered with an error status; `status` lets a screen say it in words. */
export class DemoLoadError extends Error {
  constructor(readonly status: number) {
    super(tr('cms-demos.door.answered', { status }))
  }
}

export async function fetchDemos(target?: string): Promise<DemoListing> {
  const query = target ? `?target=${encodeURIComponent(target)}` : ''
  const response = await fetch(`/api/ops/demos${query}`, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new DemoLoadError(response.status)
  return response.json()
}

/**
 * A demo's deploy history — the jobs behind the "Deployed" column, newest first. Fetched LAZILY
 * when the history drawer opens (like `fetchPresent`), never on table paint: one round-trip per
 * open, not one per row. Target-aware like the listing — the history is per (tag, target).
 */
export async function fetchDemoHistory(tag: string, target?: string): Promise<DeployJob[]> {
  const params = new URLSearchParams({ tag })
  if (target) params.set('target', target)
  const response = await fetch(`/api/ops/demos/history?${params.toString()}`, {
    headers: { accept: 'application/json' }
  })
  if (!response.ok) throw new Error(tr('cms-demos.door.answered', { status: response.status }))
  const body = (await response.json()) as { jobs?: DeployJob[] }
  return body.jobs ?? []
}

/**
 * Ask for a demo (or a fresh copy of one). Answers the job to follow, or the refusal by name.
 */
/**
 * Which recorded addresses that server really serves.
 *
 * ⚠ ASKED AFTER THE TABLE IS DRAWN, NEVER BEFORE. The far side costs ~3.3s for the whole list
 * (measured 16/09), and nothing in a row needs the answer to paint. A null means the machine did
 * not reply — which must not look like "serves nothing", because only one of those two is a reason
 * to go and look at the server.
 */
/** An install running on a server Tracy does not own: start it, then follow it. */
export interface SshJob {
  id: string
  server: string
  label: string
  address: string
  state: 'running' | 'done' | 'failed'
  step: string
  error: string | null
}

export async function startSshInstall(
  tag: string,
  target: string
): Promise<{ jobId: string } | { error: string }> {
  const response = await fetch('/api/ops/demos/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tag, target })
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok)
    return { error: body.error ?? tr('cms-demos.install.answered', { status: response.status }) }
  return { jobId: body.jobId }
}

export async function fetchSshJob(id: string): Promise<SshJob | null> {
  const response = await fetch(`/api/ops/demos/install-job?id=${encodeURIComponent(id)}`, {
    headers: { accept: 'application/json' }
  })
  return response.ok ? response.json() : null
}

export async function fetchPresent(
  target: string
): Promise<{ present: Set<string> | null; why: string | null }> {
  let response: Response
  try {
    response = await fetch(`/api/ops/demos/present?target=${encodeURIComponent(target)}`, {
      headers: { accept: 'application/json' }
    })
  } catch (e) {
    return { present: null, why: tr('cms-demos.present.dropped', { error: thrownText(e) }) }
  }
  const { body } = await readAnswer(response)
  if (!response.ok)
    return {
      present: null,
      why: textField(body, 'detail', 'error') ?? tr('cms-demos.present.answered', { status: response.status })
    }
  // 🔒 ONLY A LIST OF NAMES IS AN ANSWER (#800). A 200 with `{}` or `present: null` used to read as
  // "serves nothing", which is the one reading this door exists to keep apart from "did not say".
  const names: unknown = jsonObject(body)?.present
  if (!Array.isArray(names) || !names.every((n) => typeof n === 'string'))
    return { present: null, why: tr('cms-demos.present.noList', { status: response.status }) }
  return { present: new Set<string>(names), why: null }
}

/**
 * Send one press that starts a job, and answer the job to follow or the reason there is none.
 *
 * 🔒 IT NEVER THROWS AND NEVER GUESSES A JOB (#800). A request that drops used to reject past every
 * caller (the press did nothing on screen), and a 2xx with no `jobId` was followed as job
 * `undefined`. Both now come back as an `error` the screen prints. Neither can say the press did
 * not land — the teardown may already be running — so the sentence says to look before pressing
 * again, and nothing here retries.
 *
 * 🔒 A REFUSAL IS READ PER DOOR, NEVER OFF THE STATUS. Past its own checks tracy-web claims the
 * demo's row and then asks the host, and hands the host's answer back with the host's status — a
 * 4xx included (`ops/demos.js`). So "nothing started" is only what `notStarted` names: the codes
 * that door answers BEFORE it writes or starts anything, each at the status it sends it with, and
 * the bodiless 403 of its guard. Any other answer leaves the same doubt as a dropped request.
 */
type NotStarted = Refusals
/** `POST /api/ops/demos/install`, every return above `upsertDemoSite` and the claim's own refusal. */
const INSTALL_NOT_STARTED: NotStarted = {
  NO_DEMO_HOST: [503],
  UNKNOWN_QUICKSTART: [400, 404],
  UNKNOWN_TARGET: [404],
  NO_SSH_FOR_TARGET: [503],
  NOT_AN_INSTALLER_QUICKSTART: [409],
  NO_DEMO_ADDRESS: [400],
  UNKNOWN_HOST: [400, 404],
  LABEL_TAKEN: [409],
  // A job is already running for this demo: the door refused before starting another.
  DEMO_BUSY: [409]
}
/** `DELETE /api/ops/demos`, every return above the host's `/teardown`. */
const REMOVE_NOT_STARTED: NotStarted = { NO_DEMO: [404], NO_DEMO_HOST: [503] }

async function startJob(
  what: 'install' | 'remove',
  notStarted: NotStarted,
  send: () => Promise<Response>
): Promise<{ jobId: string; warning?: string } | { error: string }> {
  const unsure = tr('cms-demos.job.unsure')
  let response: Response
  try {
    response = await send()
  } catch (e) {
    return { error: tr(`cms-demos.job.${what}.dropped`, { error: thrownText(e), unsure }) }
  }
  const answer = await readAnswer(response)
  if (!response.ok) {
    // Only text is printed: a `reason` or `error` of any other shape falls back to the status.
    const told =
      textField(answer.body, 'reason', 'error') ??
      tr(what === 'install' ? 'cms-demos.install.answered' : 'cms-demos.door.answered', {
        status: response.status
      })
    const sure = refusedBy(notStarted, answer, response.status)
    return {
      error: sure ? told : tr('cms-demos.job.toldUnsure', { told: told.replace(/[.。]$/, ''), unsure })
    }
  }
  const jobId = textField(answer.body, 'jobId')
  if (jobId === null) return { error: tr(`cms-demos.job.${what}.noJob`, { status: response.status, unsure }) }
  const warning = textField(answer.body, 'warning')
  return { jobId, ...(warning === null ? {} : { warning }) }
}

export function installDemo(
  tag: string,
  target?: string,
  badge = true,
  override = true,
  server?: string
): Promise<{ jobId: string; warning?: string } | { error: string }> {
  return startJob('install', INSTALL_NOT_STARTED, () =>
    fetch('/api/ops/demos/install', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // `badge`: with or without the Tracy badge on the demo (Lee, 16/09). The door reads
      // `badge !== false`, so leaving it out installs one — a demo exists to advertise.
      // `override`: replace a demo already at this address rather than refusing the name. Same
      // `!== false` rule, so an older caller that sends neither behaves as the screen does.
      // `host`: which machine. Absent means where the demo already is, else the default demo host —
      // so a caller that never picks keeps behaving as before.
      body: JSON.stringify({ tag, target, badge, override, ...(server ? { host: server } : {}) })
    })
  )
}

/**
 * Take a demo off its host and forget the row — the press that returns a tag to "Not installed".
 *
 * Like an install it answers a JOB, not a done: a teardown takes as long as a build, and the row
 * disappears when the poll sees the host finish. The caller follows it with the same `follow` the
 * install uses.
 */
export function removeDemo(tag: string): Promise<{ jobId: string } | { error: string }> {
  return startJob('remove', REMOVE_NOT_STARTED, () =>
    fetch(`/api/ops/demos?tag=${encodeURIComponent(tag)}`, { method: 'DELETE' })
  )
}

/**
 * The job the server still has in flight for a row, read off the row itself (its latest job is
 * queued or running), or undefined when it has settled. It is what a screen shows and holds its
 * presses on before its own poll of that job has answered — a job started earlier, from another
 * tab or before a reload, included — so the busy state never rests on a click alone.
 */
export function inFlightJobOf(row: DemoRow): JobView | undefined {
  const d = row.deployed
  if (!d?.jobId || (d.state !== 'queued' && d.state !== 'running')) return undefined
  return { jobId: d.jobId, kind: d.kind ?? 'provision', state: d.state, step: d.step, live: false }
}

/**
 * The words of a job still running: a removal is never "Installing" (11/10/2026, the Demos row read
 * "Installing · taking the old copy down" while Remove ran).
 */
export function runningInWords(kind: JobView['kind'] | null | undefined, step: string | null): string {
  if (kind === 'remove') return tr('cms-demos.running.removing')
  // An update's first step: the new release is fetched while the current demo keeps serving.
  // `step` is the host's own value, compared as data.
  if (kind === 'prefetch') {
    const detail = step && step !== 'fetching the new release' ? ` · ${stepInWords(step)}` : ''
    return `${tr('cms-demos.running.prefetch')}${detail}`
  }
  return `${tr(kind === 'teardown' ? 'cms-demos.running.teardown' : 'cms-demos.running.install')}${step ? ` · ${stepInWords(step)}` : ''}`
}

async function pollDemoJob(jobId: string): Promise<JobView | null> {
  const response = await fetch(`/api/ops/demos/job?id=${encodeURIComponent(jobId)}`, {
    headers: { accept: 'application/json' }
  })
  if (!response.ok) return null
  return response.json()
}

/**
 * Follow one demo's job until it is live or failed. The job id MOVES when a teardown finishes
 * (the poll starts the provision and answers with the new id), so the caller keeps whatever id
 * the last answer carried.
 */
export function useDemoJob(onSettled: () => void) {
  const [following, setFollowing] = useState<Record<string, JobView>>({})
  const timers = useRef<Record<string, number>>({})
  // Moves when the rows on screen become another server's (`forget`): a poll answered after that
  // is about a row that is no longer shown, and the two listings share tags.
  const epoch = useRef(0)

  const stop = (tag: string) => {
    window.clearTimeout(timers.current[tag])
    delete timers.current[tag]
  }

  /** `seed`: what is already known of the job (the row's own reading), shown until the poll answers. */
  const follow = (tag: string, jobId: string, kind: JobView['kind'] = 'provision', seed?: JobView) => {
    stop(tag)
    const began = epoch.current
    // 🔒 THE NEW JOB STANDS FOR THE ROW AT ONCE (11/10/2026). Until its first poll answered, the
    // row still showed the LAST job it followed; when that one had failed the row read as settled,
    // its press came back on while the new job ran, and one Retry install on dev became three jobs.
    setFollowing((f) => ({
      ...f,
      [tag]: seed?.jobId === jobId ? seed : { jobId, kind, state: 'queued', step: null, live: false }
    }))
    const tick = async () => {
      const view = await pollDemoJob(jobId)
      if (epoch.current !== began) return
      if (!view) {
        // The server no longer knows the job (a removal the sweep finished drops the row it is
        // read through): the row's own state is the truth now, so it is read again, never left
        // on a job that can no longer settle.
        setFollowing(({ [tag]: _gone, ...rest }) => rest)
        onSettled()
        return
      }
      setFollowing((f) => ({ ...f, [tag]: view }))
      // ⚠ `removed` IS A SETTLED STATE OF ITS OWN. A removal ends `done` and NOT live, which reads
      // as "still working" to the two tests above — so the poll would run once more, meet the 404
      // that the deleted row now answers with, and stop without ever refreshing the list. The row
      // would sit there until somebody reloaded the page.
      const settled = view.live || view.removed || view.state === 'failed' || view.error
      if (settled) {
        onSettled()
        return
      }
      if (view.jobId !== jobId) {
        follow(tag, view.jobId)
        return
      }
      timers.current[tag] = window.setTimeout(() => void tick(), 3000)
    }
    void tick()
  }

  /** Stop following everything: the rows on screen are no longer the ones these jobs belong to. */
  const forget = () => {
    epoch.current += 1
    Object.keys(timers.current).forEach(stop)
    setFollowing({})
  }

  useEffect(
    () => () => {
      epoch.current += 1
      Object.keys(timers.current).forEach(stop)
    },
    []
  )
  return { following, follow, forget }
}

/**
 * Where a demo can live: a SERVER AND A DOMAIN TOGETHER.
 *
 * 🔒 `serverName` AND `serverIp` EXIST TO BE SHOWN, nothing reads them. While there was one demo
 * host there was nothing to confuse; with two independent servers an address alone does not say
 * which machine a press lands on, and pressing the wrong one answers 200 and starts a job. The
 * cheapest place to stop that is under the reader's finger (Lee, 16/09).
 *
 * `kind: 'record'` is a target Tracy writes addresses down for and never installs onto —
 * `demo.joomlart.com` is JoomlArt's machine, 459 demos that Tracy did not build.
 */
export interface DemoTarget {
  name: string
  kind: 'host' | 'record'
  zone: string
  serverName: string
  serverIp: string | null
}

/** One machine a demo may be put on — a `host` this deployment holds a signed channel to. */
export interface DemoServer {
  name: string
  serverName: string
  serverIp: string | null
}

/** `demo-host · 203.0.113.10`, or just the name when no address was declared. */
export function serverOf(target: DemoTarget | DemoServer | undefined): string {
  if (!target) return ''
  return target.serverIp ? `${target.serverName} · ${target.serverIp}` : target.serverName
}

/**
 * What an SSH install is doing, in that server's own words.
 *
 * The steps come from the script running over there (`step …` lines it prints as it goes), so the
 * row says "running Joomla's own installer" rather than spinning on "Installing" for four minutes.
 */
export function SshJobState({ job }: { job: SshJob }) {
  const t = useT()
  if (job.state === 'failed')
    return <span className="text-destructive text-xs">{job.error ?? t('cms-demos.state.failed')}</span>
  if (job.state === 'done')
    return <span className="text-xs">{t('cms-demos.state.installedOn', { server: job.server })}</span>
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
      <RefreshCw size={12} className="animate-spin" />
      {job.step}
    </span>
  )
}

/** The one-line state of a demo: what the host is doing, or where it answers. */
export function DemoState({
  row,
  job,
  present
}: {
  row: DemoRow
  job: JobView | undefined
  /** What the far server said it has: undefined = not asked, null = it did not answer. */
  present?: Set<string> | null
}) {
  const t = useT()
  // A recorded address is not a demo. Whether that machine really serves it is the far side's to
  // say, and it says so a few seconds after this table drew — so "not asked yet" reads as nothing
  // rather than as an answer.
  if (present !== undefined) {
    if (present === null)
      return <span className="text-muted-foreground text-xs">{t('cms-demos.state.serverSilent')}</span>
    if (!row.label)
      return <span className="text-muted-foreground text-xs">{t('cms-demos.state.noAddressHere')}</span>
    return present.has(row.label) ? (
      <span className="text-xs">{t('cms-demos.state.served')}</span>
    ) : (
      <span className="text-destructive text-xs">{t('cms-demos.state.recordedOnly')}</span>
    )
  }
  // A removal that finished: nothing is installed, whatever the row read before it was forgotten.
  if (job?.removed)
    return <span className="text-muted-foreground text-xs">{t('cms-demos.state.notInstalled')}</span>
  if (job && !job.live) {
    // An absence, not a fault: this deployment cannot publish anything, so the row says what it
    // IS rather than what did not happen. Every real go-live failure still reads as one.
    if (job.publicHere === false)
      return <span className="text-muted-foreground text-xs">{t('cms-demos.state.localhostOnly')}</span>
    if (job.error)
      return (
        // Capped like `Failed`: an error string is not ours to size, and one long one widens the column.
        <span className="block max-w-[16rem] truncate text-destructive text-xs" title={job.error}>
          {job.error}
        </span>
      )
    if (job.state === 'failed') return <Failed at={job.step ?? job.kind} reason={job.reason} />
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <RefreshCw size={12} className="animate-spin" />
        {runningInWords(job.kind, job.step)}
      </span>
    )
  }
  const d = row.deployed
  if (!d) return <span className="text-muted-foreground text-xs">{t('cms-demos.state.notInstalled')}</span>
  if (!d.live) {
    if (d.state === 'failed') return <Failed at={d.step ?? 'install'} reason={d.reason} />
    return (
      <span className="text-muted-foreground text-xs">
        {d.state === 'done'
          ? t('cms-demos.state.notPublished')
          : d.kind === 'remove'
            ? t('cms-demos.running.removing')
            : t('cms-demos.state.inProgress', { step: d.step ? stepInWords(d.step) : (d.state ?? '…') })}
      </span>
    )
  }
  return (
    <a
      href={d.address}
      title={d.address}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      <Globe size={12} className="flex-none" />
      <span className="max-w-[13rem] truncate">
        {d.address.replace(/^https?:\/\//, '').replace(/\/$/, '')}
      </span>
      <span className="font-mono text-muted-foreground">{d.version ?? ''}</span>
      <ExternalLink size={11} className="text-muted-foreground" />
    </a>
  )
}

/**
 * The Demos screen's "Deployed" reading for a demo Tracy runs (a `host` target). Unlike the shared
 * `DemoState` (which the Quickstarts screen uses and which links to the address), a LIVE demo here
 * shows only HOW LONG AGO it was deployed and its version — the address is already the "Demo
 * address" column to the left, so repeating it would say the same thing twice. The in-flight and
 * failed states are unchanged from `DemoState`, `publicHere` included.
 */
function DeployedState({ row, job }: { row: DemoRow; job: JobView | undefined }) {
  const t = useT()
  if (job?.removed)
    return <span className="text-muted-foreground text-xs">{t('cms-demos.state.notInstalled')}</span>
  if (job && !job.live) {
    if (job.publicHere === false)
      return <span className="text-muted-foreground text-xs">{t('cms-demos.state.localhostOnly')}</span>
    if (job.error)
      return (
        // Capped like `Failed`: an error string is not ours to size, and one long one widens the column.
        <span className="block max-w-[16rem] truncate text-destructive text-xs" title={job.error}>
          {job.error}
        </span>
      )
    if (job.state === 'failed') return <Failed at={job.step ?? job.kind} reason={job.reason} />
    return (
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <RefreshCw size={12} className="animate-spin" />
        {runningInWords(job.kind, job.step)}
      </span>
    )
  }
  const d = row.deployed
  if (!d) return <span className="text-muted-foreground text-xs">{t('cms-demos.state.notInstalled')}</span>
  if (!d.live) {
    if (d.state === 'failed') return <Failed at={d.step ?? 'install'} reason={d.reason} />
    return (
      <span className="text-muted-foreground text-xs">
        {d.state === 'done'
          ? t('cms-demos.state.notPublished')
          : d.kind === 'remove'
            ? t('cms-demos.running.removing')
            : t('cms-demos.state.inProgress', { step: d.step ? stepInWords(d.step) : (d.state ?? '…') })}
      </span>
    )
  }
  const ago = relativeTime(d.deployedAt)
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <Globe size={12} className="text-muted-foreground" />
      <span>{ago ?? t('cms-demos.state.deployed')}</span>
      {d.version ? <span className="font-mono text-muted-foreground">{d.version}</span> : null}
    </span>
  )
}

/** The deploy history of one demo, read when the drawer opens (mount), not when the table paints. */
function DeployHistoryBody({ tag, target }: { tag: string; target?: string }) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; jobs: DeployJob[] }
  >({ status: 'loading' })
  const t = useT()

  useEffect(() => {
    let live = true
    fetchDemoHistory(tag, target)
      .then((jobs) => {
        if (live) setState({ status: 'ready', jobs })
      })
      .catch((e) => {
        if (live) setState({ status: 'error', message: thrownText(e) })
      })
    return () => {
      live = false
    }
  }, [tag, target])

  if (state.status === 'loading')
    return <p className="py-6 text-muted-foreground text-sm">{t('cms-demos.history.reading')}</p>
  if (state.status === 'error')
    return (
      <p className="py-6 text-destructive text-sm">
        {t('cms-demos.history.failed', { error: state.message })}
      </p>
    )
  if (state.jobs.length === 0)
    return <p className="py-6 text-muted-foreground text-sm">{t('cms-demos.history.empty')}</p>
  return (
    <ul className="divide-y divide-border">
      {state.jobs.map((j) => (
        <li key={j.jobId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2.5 text-xs">
          <span className="font-medium capitalize">{j.kind}</span>
          <span className="text-muted-foreground">
            {j.state}
            {j.step ? ` · ${j.step}` : ''}
          </span>
          <span className="ms-auto text-muted-foreground tabular-nums" title={j.jobId}>
            {when(j.createdAt)}
          </span>
          {j.reason ? (
            <span className="basis-full break-words font-mono text-[11px] text-destructive">{j.reason}</span>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

/** The "Deployed" cell: how long ago the demo was deployed, plus a drawer of its full history. */
function DeployedCell({
  row,
  job,
  zone,
  target
}: {
  row: DemoRow
  job: JobView | undefined
  zone: string
  target?: string
}) {
  const t = useT()
  const address = row.label ? `${row.label}.${zone}` : row.tag
  return (
    <span className="flex items-center gap-2">
      <DeployedState row={row} job={job} />
      {row.deployed ? (
        <RowDrawer
          label={t('cms-demos.history.label', { tag: row.tag })}
          trigger={<History size={14} />}
          title={t('cms-demos.history.title', { address })}
          description={t('cms-demos.history.description')}
        >
          <DeployHistoryBody tag={row.tag} target={target} />
        </RowDrawer>
      ) : null}
    </span>
  )
}

/** The deploy history drawer of one demo, opened from any row that shows the demo. */
export function DemoHistoryDrawer({
  tag,
  target,
  address,
  trigger
}: {
  tag: string
  target?: string
  address: string
  trigger: ReactNode
}) {
  const t = useT()
  return (
    <RowDrawer
      label={t('cms-demos.history.installLabel', { tag })}
      trigger={trigger}
      title={t('cms-demos.history.title', { address })}
      description={t('cms-demos.history.description')}
    >
      <DeployHistoryBody tag={tag} target={target} />
    </RowDrawer>
  )
}

/** Install / Redeploy — one button whose label says which of the two it would do. */
export function DemoAction({
  row,
  job,
  writable,
  releaseVersion,
  target,
  badge = true,
  onBadgeChange,
  override = true,
  onOverrideChange,
  onPress,
  onRemove,
  servers = [],
  server,
  onServerChange,
  present
}: {
  row: DemoRow
  job: JobView | undefined
  writable: boolean
  releaseVersion: string | null
  target?: DemoTarget
  /** What a `record` server said it serves: undefined = not asked, null = it did not answer. */
  present?: Set<string> | null
  /** Every machine a demo may go on; the picker is drawn only when there are two or more. */
  servers?: DemoServer[]
  /** The machine the next press lands on. */
  server?: string
  onServerChange?: (next: string) => void
  badge?: boolean
  onBadgeChange?: (next: boolean) => void
  /** Replace a demo that is already at this address, instead of refusing the name. */
  override?: boolean
  onOverrideChange?: (next: boolean) => void
  /** A promise, when the press sends a request: the row holds further presses until it settles. */
  onPress: () => void | Promise<unknown>
  /** Absent on a target Tracy only records addresses for — there is nothing there to tear down. */
  onRemove?: () => void | Promise<unknown>
}) {
  const t = useT()
  // A press whose request has not answered yet. The ref is the lock a second click meets before
  // React has redrawn the button as disabled; the state is what draws it.
  const sending = useRef(false)
  const [waiting, setWaiting] = useState(false)
  // `removed` counts as settled here too: without it the row keeps a job that is never live and
  // never failed, so every button on it would stay disabled until the page was reloaded.
  const jobBusy = Boolean(job && !job.live && !job.removed && job.state !== 'failed' && !job.error)
  const busy = waiting || jobBusy
  // Two presses, no modal: the first arms, the second acts. A `confirm()` would block the whole
  // page (and every other poll running on it), and a demo removal is not worth that.
  //
  // 🔒 EVERY PRESS THAT TAKES A DEMO DOWN ARMS FIRST, NOT ONLY REMOVE (#800). Redeploy, Update and
  // Move tear a copy down before anything goes up again: tracy-web tears down the live copy, or
  // for a move whatever the demo left on the machine it is leaving (`old = live ?? leaving`). An
  // install over a recorded row that is not live and stays on its machine tears nothing down, but
  // it builds over what is recorded there, so it asks too and says only that. Only an install where
  // there is no demo yet is one press.
  //
  // What is armed is remembered WITH what it was asked about (`armKey`): another server picked,
  // another release, another target or another row is a different question, never an answer.
  const [armed, setArmed] = useState<{ what: 'press' | 'remove'; key: string } | null>(null)
  const deployed = row.deployed
  const behind = deployed?.live && releaseVersion && deployed.version !== releaseVersion
  // Picking another machine for a demo that is up turns the press into a move: the copy comes down
  // where it is and goes up on the new one, at the same address.
  const moving = Boolean(deployed?.host && server && deployed.host !== server)
  const chosen = servers.find((s) => s.name === server)
  const label = moving
    ? t('cms-demos.action.moveTo', { server: chosen?.serverName ?? server ?? '' })
    : deployed?.live
      ? behind
        ? t('cms-demos.action.updateTo', { version: releaseVersion ?? '' })
        : t('cms-demos.action.redeploy')
      : deployed?.state === 'failed'
        ? t('cms-demos.action.retryInstall')
        : t('cms-demos.action.installDemo')
  // 🔒 A RECORD TARGET HAS NO `deployed`, AND ITS ADDRESS MAY STILL HOLD A DEMO. tracy-web answers
  // `deployed: null` for every row of a server it only records addresses for, so what is at the
  // address is that server's to say (`present`) — and what it said is a reading from when the table
  // was drawn, while the install lands minutes later. With Override ticked the install replaces
  // whatever is there BY THEN, so every such press asks, whatever the reading was; the reading only
  // chooses the words. Override off cannot replace (the far side refuses the name): one press.
  const served =
    target?.kind !== 'record'
      ? 'none'
      : present instanceof Set && row.label
        ? present.has(row.label)
          ? 'served'
          : 'free'
        : 'unknown'
  const replacing = override && target?.kind === 'record'
  // The demo by the address a person knows it by; the tag when the row has none.
  const name = (deployed?.address || row.address || row.label || row.tag).replace(/^https?:\/\//, '')
  const from = servers.find((s) => s.name === deployed?.host)?.serverName ?? deployed?.host
  const onto = chosen ? serverOf(chosen) : target ? serverOf(target) : server
  const ask = moving
    ? t('cms-demos.action.askMove', { name, server: chosen?.serverName ?? server ?? '' })
    : deployed?.live
      ? behind
        ? t('cms-demos.action.askUpdate', { name, version: releaseVersion ?? '' })
        : t('cms-demos.action.askRedeploy', { name })
      : t('cms-demos.action.askInstallOver', { name })
  const release = releaseVersion
    ? t('cms-demos.action.releaseVersion', { version: releaseVersion ?? '' })
    : t('cms-demos.action.thisRelease')
  const askTitle =
    target?.kind === 'record'
      ? t(
          !override
            ? 'cms-demos.action.confirm.record'
            : served === 'served'
              ? 'cms-demos.action.confirm.recordServed'
              : served === 'free'
                ? 'cms-demos.action.confirm.recordFree'
                : 'cms-demos.action.confirm.recordUnknown',
          { release, name, server: serverOf(target) }
        )
      : moving || deployed?.live
        ? t(
            from
              ? onto
                ? 'cms-demos.action.confirm.tearDownFromOnto'
                : 'cms-demos.action.confirm.tearDownFrom'
              : onto
                ? 'cms-demos.action.confirm.tearDownOnto'
                : 'cms-demos.action.confirm.tearDown',
            { name, from: from ?? '', release, onto: onto ?? '' }
          )
        : // Not live and not moving: tracy-web tears nothing down here, so the title does not say it does.
          t(onto ? 'cms-demos.action.confirm.overOnto' : 'cms-demos.action.confirm.over', {
            release,
            name,
            onto: onto ?? ''
          })
  // 🔒 THE KEY HOLDS THE QUESTION ITSELF, NOT A LIST OF WHAT USUALLY CHANGES IT. A reload can give
  // the same tag another address (a record target has no `deployed` to notice it by), and a press
  // on the armed button would then install over a name nobody was asked about. So the key is what
  // the request is sent with, plus the very words the person was shown (`ask`, `askTitle`).
  const armKey = JSON.stringify([
    row.tag,
    row.label,
    row.address,
    target?.name,
    deployed?.host,
    deployed?.jobId,
    deployed?.address,
    server,
    releaseVersion,
    label,
    override,
    served,
    ask,
    askTitle
  ])
  // Changing what was asked about withdraws the question for good: going back to the same server,
  // release or Override tick later must not find it still armed.
  useEffect(() => setArmed(null), [armKey])
  const arming = armed?.what === 'remove' && armed.key === armKey
  const confirming = armed?.what === 'press' && armed.key === armKey
  /** Run one press; a second one is dropped while the first is still being sent. */
  const run = (act: () => void | Promise<unknown>) => {
    if (sending.current) return
    const sent = act()
    if (!(sent instanceof Promise)) return
    sending.current = true
    setWaiting(true)
    // The caller prints its own failure; this only gives the row back.
    void sent
      .catch(() => undefined)
      .finally(() => {
        sending.current = false
        setWaiting(false)
      })
  }
  return (
    <div className="flex items-center gap-2">
      {/* 🔒 THE MACHINE IS NAMED ON THE CONTROL THAT CHOOSES IT. Same rule as the target picker: an
          address does not say which server a press lands on, so the server and its IP are spelled
          out here, beside the button. Only on a host target: a `record` server is not Tracy's. */}
      {onServerChange && servers.length > 1 && target?.kind !== 'record' ? (
        <NativeSelect
          size="sm"
          // Wide enough for "tracy-fleet-01 (current)", the longest name + marker on the fleet
          // today; at 10.5rem it read "tracy-fleet-01 (curr" (measured 30/09).
          className="w-[12.5rem]"
          aria-label={t('cms-demos.action.serverFor', { tag: row.tag })}
          // ⚠ THE OPTION SAYS THE NAME, THE TITLE SAYS THE ADDRESS. A `<select>` cannot widen to its
          // content, and `host-02 · 203.0.113.41` was cut mid-IP at every width that still fits
          // beside three other controls (measured on dev, 23/09) — a half-printed address is worse
          // than none. The machine a press lands on is still spelled out in full on hover and on
          // the button's own title.
          title={t('cms-demos.action.serverTitle', { server: serverOf(chosen) })}
          value={server ?? ''}
          disabled={!writable || busy}
          onChange={(event) => onServerChange(event.target.value)}
        >
          {servers.map((s) => (
            <NativeSelectOption key={s.name} value={s.name} title={serverOf(s)}>
              {deployed?.host === s.name
                ? t('cms-demos.action.currentServer', { name: s.serverName })
                : s.serverName}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : null}
      {onBadgeChange ? (
        <label
          className="text-muted-foreground flex items-center gap-1.5 text-xs whitespace-nowrap"
          title={t('cms-demos.action.badgeTitle')}
        >
          <input
            type="checkbox"
            checked={badge}
            disabled={!writable || busy}
            onChange={(event) => onBadgeChange(event.currentTarget.checked)}
          />
          {t('cms-demos.action.badge')}
        </label>
      ) : null}
      {/* Only where an address can already be taken by a demo Tracy did not build. On Tracy's own
          host a redeploy is the normal path and has always replaced; on JoomlArt's server the
          address may hold one of their live demos, so replacing it is a thing to tick. */}
      {onOverrideChange && target?.kind === 'record' ? (
        <label
          className="flex items-center gap-1.5 whitespace-nowrap text-muted-foreground text-xs"
          title={t('cms-demos.action.overrideTitle')}
        >
          <input
            type="checkbox"
            checked={override}
            disabled={!writable || busy}
            onChange={(event) => onOverrideChange(event.currentTarget.checked)}
          />
          {t('cms-demos.action.override')}
        </label>
      ) : null}
      <Button
        size="sm"
        variant={confirming ? 'destructive' : deployed?.live && !behind && !moving ? 'outline' : 'default'}
        disabled={!writable || busy || !row.label}
        title={
          !row.label
            ? t('cms-demos.action.noAddress')
            : !writable
              ? t('cms-demos.action.ownersOnly')
              : confirming
                ? askTitle
                : moving
                  ? t('cms-demos.action.moveTitle', {
                      from:
                        servers.find((s) => s.name === deployed?.host)?.serverName ?? deployed?.host ?? '',
                      onto: serverOf(chosen)
                    })
                  : deployed?.live
                    ? t('cms-demos.action.redeployTitle')
                    : target?.kind === 'record'
                      ? t('cms-demos.action.recordTitle', { server: target.serverName })
                      : // The machine, not only the address. Two independent servers means the address
                        // alone does not say where this lands.
                        serverOf(chosen ?? target)
                        ? t('cms-demos.action.installAtOn', {
                            address: String(row.address),
                            server: serverOf(chosen ?? target)
                          })
                        : t('cms-demos.action.installAt', { address: String(row.address) })
        }
        onClick={(e) => {
          e.stopPropagation()
          if (sending.current) return
          // A demo is recorded at this address, or may be served there: the first press only asks.
          if ((deployed || replacing) && !confirming) {
            setArmed({ what: 'press', key: armKey })
            return
          }
          setArmed(null)
          run(onPress)
        }}
        onBlur={() => setArmed((was) => (was?.what === 'press' ? null : was))}
      >
        {busy ? <RefreshCw size={14} className="animate-spin" /> : <Rocket size={14} />}
        {busy
          ? job && jobBusy
            ? job.kind === 'remove'
              ? t('cms-demos.action.removing')
              : t('cms-demos.action.installing')
            : t('cms-demos.action.working')
          : confirming
            ? ask
            : label}
      </Button>
      {/* Only where there IS a demo, and only on a host Tracy installs onto: a `record` target's
          demos belong to JoomlArt and are not Tracy's to tear down. */}
      {onRemove && deployed && target?.kind !== 'record' ? (
        <Button
          size="sm"
          variant={arming ? 'destructive' : 'ghost'}
          disabled={!writable || busy}
          title={arming ? t('cms-demos.action.removeConfirmTitle') : t('cms-demos.action.removeTitle')}
          onClick={(e) => {
            e.stopPropagation()
            if (sending.current) return
            if (!arming) {
              setArmed({ what: 'remove', key: armKey })
              return
            }
            setArmed(null)
            run(onRemove)
          }}
          onBlur={() => setArmed((was) => (was?.what === 'remove' ? null : was))}
        >
          <Trash2 size={14} />
          {arming ? t('cms-demos.action.removeConfirm') : t('cms-demos.action.remove')}
        </Button>
      ) : null}
    </div>
  )
}

function AddressCell({
  row,
  zone,
  target,
  writable,
  onSaved,
  onError
}: {
  row: DemoRow
  zone: string
  /** Which target this address belongs to — the pin is per target, not per tag. */
  target: string
  writable: boolean
  onSaved: () => void
  onError: (message: string) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.label ?? '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch('/api/ops/demos/domain', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tag: row.tag,
          target,
          label: draft.trim().toLowerCase(),
          revision: row.revision
        })
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        onError(
          body.error === 'LABEL_TAKEN'
            ? t('cms-demos.address.taken', { label: draft, by: String(body.by) })
            : body.error === 'DEMO_CHANGED'
              ? t('cms-demos.address.changed')
              : body.error === 'INVALID_LABEL'
                ? t('cms-demos.address.invalid')
                : t('cms-demos.address.saveAnswered', { status: response.status })
        )
        if (body.error === 'DEMO_CHANGED') onSaved()
        return
      }
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  if (editing)
    return (
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-7 w-44 font-mono text-xs"
          aria-label={t('cms-demos.address.labelOf', { tag: row.tag })}
        />
        <span className="text-muted-foreground text-xs">.{zone}</span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          type="submit"
          disabled={saving}
          aria-label={t('cms-demos.address.save')}
        >
          <Check size={14} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          type="button"
          onClick={() => {
            setDraft(row.label ?? '')
            setEditing(false)
          }}
          aria-label={t('cms-demos.address.cancel')}
        >
          <X size={14} />
        </Button>
      </form>
    )
  return (
    <span className="flex items-center gap-1.5">
      {row.label ? (
        row.address ? (
          <a
            href={row.address}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 font-mono text-xs hover:underline"
            title={t('cms-demos.address.open', { address: row.address })}
          >
            {`${row.label}.${zone}`}
            <ExternalLink size={11} className="text-muted-foreground" />
          </a>
        ) : (
          <span className="font-mono text-xs">{`${row.label}.${zone}`}</span>
        )
      ) : (
        <span className="text-muted-foreground font-mono text-xs">— {t('cms-demos.address.none')}</span>
      )}
      {row.pinned ? (
        <Badge
          variant="outline"
          className="font-normal text-[10px]"
          title={t('cms-demos.address.pinnedBy', { by: row.updatedBy ?? '?', when: when(row.updatedAt) })}
        >
          {t('cms-demos.address.pinned')}
        </Badge>
      ) : null}
      {writable ? (
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => setEditing(true)}
          aria-label={t('cms-demos.address.change', { tag: row.tag })}
        >
          <Pencil size={12} />
        </Button>
      ) : null}
    </span>
  )
}

export function Demos({ cms }: { cms: Cms | 'all' }) {
  const t = useT()
  const [listing, setListing] = useState<DemoListing | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [versions, setVersions] = useState<Record<string, string | null>>({})
  // Which server's demos are on screen. The listing carries the whole set, so the picker only
  // appears once there is a second one — a deployment with one demo host looks unchanged.
  const [targetName, setTargetName] = useState('tracy')
  // What the far server says it really has. `undefined` = not asked yet, `null` = it did not
  // answer, a Set = the truth. Three states because two would make silence look like emptiness.
  const [present, setPresent] = useState<Set<string> | null | undefined>(undefined)
  const [presentWhy, setPresentWhy] = useState<string | null>(null)
  const targets = listing?.targets ?? []
  const active = targets.find((t) => t.name === targetName) ?? targets[0]

  // The server on screen, for anything that answers after the person switched: the two listings
  // share tags, so a listing, a job or a problem of one must not land on the rows of the other.
  const shownTarget = useRef(targetName)
  const loads = useRef(0)
  // Which server the listing in hand was read for. Until the newly picked server's own listing
  // arrives there are no rows: the old ones would be pressed against the new server.
  const [listedFor, setListedFor] = useState<string | null>(null)
  /**
   * Read the listing of the server ON SCREEN. It is called from presses and polls that began under
   * another server, so it reads the ref rather than the `targetName` it was created with, and only
   * the newest read is applied.
   */
  const load = async () => {
    const asked = shownTarget.current
    loads.current += 1
    const mine = loads.current
    const current = () => loads.current === mine && shownTarget.current === asked
    setError(null)
    try {
      const [demos, quickstarts] = await Promise.all([
        fetchDemos(asked),
        fetch('/api/ops/quickstarts', { headers: { accept: 'application/json' } }).then((r) =>
          r.ok ? r.json() : null
        )
      ])
      if (!current()) return
      setListing(demos)
      setListedFor(asked)
      if (quickstarts) {
        const map: Record<string, string | null> = {}
        for (const r of quickstarts.releases as { tag: string; version: string | null }[])
          map[r.tag] = r.version
        setVersions(map)
      }
    } catch (e) {
      if (current()) setError(thrownText(e))
    }
  }
  const { following, follow, forget } = useDemoJob(() => void load())
  // The SSH install's own follower, keyed by tag like the other one so the row reads either.
  const [sshJobs, setSshJobs] = useState<Record<string, SshJob>>({})
  useEffect(() => {
    // Jobs followed on the server that was on screen are not this one's rows' jobs.
    if (shownTarget.current !== targetName) {
      forget()
      setSshJobs({})
    }
    shownTarget.current = targetName
    void load()
    // Switching server re-reads: the two listings are different machines' demos, never a filter
    // over one list.
  }, [targetName])

  useEffect(() => {
    setPresent(undefined)
    setPresentWhy(null)
    if (active?.kind !== 'record') return
    let stale = false
    void fetchPresent(active.name).then(({ present: got, why }) => {
      if (stale) return
      setPresent(got)
      setPresentWhy(why)
    })
    return () => {
      stale = true
    }
  }, [active?.name, active?.kind])
  const followSsh = (tag: string, id: string) => {
    let stop = false
    const on = active
    const shown = shownTarget.current
    const tick = async () => {
      const job = await fetchSshJob(id)
      // Another server is on screen now: this job is not one of its rows'.
      if (stop || !job || shownTarget.current !== shown) return
      setSshJobs((was) => ({ ...was, [tag]: job }))
      if (job.state === 'running') setTimeout(() => void tick(), 2000)
      else {
        // It finished on a server this process does not run: re-ask that server what it now has,
        // rather than believing a job record about somebody else's disk.
        if (on?.kind === 'record')
          void fetchPresent(on.name).then((r) => {
            if (shownTarget.current === shown) setPresent(r.present)
          })
        void load()
      }
    }
    void tick()
    return () => {
      stop = true
    }
  }

  /** With or without the Tracy badge, per row — the press's own choice, not a saved setting. */
  const [badges, setBadges] = useState<Record<string, boolean>>({})
  const badgeFor = (tag: string) => badges[tag] !== false
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const overrideFor = (tag: string) => overrides[tag] !== false
  /** The machine each row's next press lands on: a person's pick, else where the demo is, else the default. */
  const [picks, setPicks] = useState<Record<string, string>>({})
  const servers = listing?.servers ?? []
  const serverFor = (row: DemoRow) =>
    picks[row.tag] ?? row.deployed?.host ?? listing?.defaultServer ?? undefined

  /** What a late answer says when the screen has moved on: whose press it was, never a bare line. */
  const elsewhere = (row: DemoRow, pressedOn: string) =>
    shownTarget.current === pressedOn
      ? null
      : t('cms-demos.screen.elsewhere', {
          tag: row.tag,
          server: targets.find((x) => x.name === pressedOn)?.serverName ?? pressedOn
        })

  const press = async (row: DemoRow) => {
    setError(null)
    const pressedOn = targetName
    const started = await installDemo(
      row.tag,
      active?.name,
      badgeFor(row.tag),
      overrideFor(row.tag),
      servers.length > 1 ? serverFor(row) : undefined
    )
    const away = elsewhere(row, pressedOn)
    if ('error' in started) {
      setError(away ? `${away}: ${started.error}` : started.error)
      return
    }
    // The move started, but its old DNS record could not be taken off: said, not swallowed — the
    // address would otherwise answer 404 later with nothing on screen to explain it.
    if (started.warning) setError(away ? `${away}: ${started.warning}` : started.warning)
    if (away) return
    setPicks(({ [row.tag]: _done, ...rest }) => rest)
    // ⚠ TWO KINDS OF JOB, AND THEY ARE NOT INTERCHANGEABLE. A host target's job lives on the host
    // and is followed through `/api/ops/demos/job`; a record target's install runs from THIS
    // process over SSH and is followed through `/api/ops/demos/install-job`. Polling the wrong one
    // answers 404 for the whole install and the row would sit on "Installing" until reload.
    if (active?.kind === 'record') followSsh(row.tag, started.jobId)
    else follow(row.tag, started.jobId)
    void load()
  }

  /**
   * Take a demo down for good. Followed by the same poll as an install: the row is forgotten by
   * the advance that sees the host finish, and `removed` is what stops the follower.
   */
  const remove = async (row: DemoRow) => {
    setError(null)
    const pressedOn = targetName
    const started = await removeDemo(row.tag)
    const away = elsewhere(row, pressedOn)
    if ('error' in started) {
      setError(away ? `${away}: ${started.error}` : started.error)
      return
    }
    if (away) return
    follow(row.tag, started.jobId, 'remove')
    void load()
  }

  const rows = (listedFor === targetName ? (listing?.demos ?? []) : []).filter(
    (d) => cms === 'all' || d.platform === cms
  )
  const writable = Boolean(listing?.writable)

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="min-w-0">
        <h1 className="font-semibold text-lg tracking-tight">{t('cms-demos.screen.title')}</h1>
        <p className="mt-0.5 max-w-3xl text-muted-foreground text-sm">
          <Trans
            i18nKey="cms-demos.screen.intro"
            values={{
              server: serverOf(active) || (listing?.host ?? '—'),
              pattern: `${active?.name === 'joomlart' ? '<template>' : '<template>-<cms>'}.${listing?.zone ?? 'tracy.ai'}`
            }}
            components={{ m: <span className="font-mono" /> }}
          />{' '}
          {active?.kind === 'record' ? t('cms-demos.screen.recordNote') : t('cms-demos.screen.hostNote')}
        </p>
      </div>

      {/* 🔒 THE PICKER IS ALSO THE WARNING. Two independent servers means a row's address does not
          say which machine it lands on, so the server and its IP are spelled out on the control
          that chooses them — the cheapest place to stop the mix-up (Lee, 16/09). */}
      {targets.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          {targets.map((x) => (
            <Button
              key={x.name}
              size="sm"
              variant={x.name === active?.name ? 'default' : 'outline'}
              onClick={() => {
                setTargetName(x.name)
              }}
            >
              <span className="font-mono">{x.zone}</span>
              {/* 🔒 OPACITY, NOT A COLOUR. `text-muted-foreground` is a light-background grey, and
                  the selected target's pill is solid primary — the server and its IP came out
                  terracotta-on-terracotta and were all but invisible (Lee, 17/09). Fading the
                  button's OWN foreground reads on both variants and in both themes, and it cannot
                  be broken again by a palette change. */}
              <span className="text-xs opacity-70">· {serverOf(x)}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {listing && listing.reason ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-destructive text-xs">
          {listing.reason}
        </div>
      ) : null}
      {/* Why the far server could not be asked. Without this the rows say "Server did not answer"
          and the reader has nowhere to go: a refused key and an unreachable machine are two
          different errands. */}
      {presentWhy ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-destructive text-xs">
          {active
            ? t('cms-demos.screen.serverSilent', { server: active.serverName, why: presentWhy })
            : presentWhy}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-destructive text-xs">
          {error}
        </div>
      ) : null}

      <div className="rounded-lg border border-border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('cms-demos.screen.col.quickstart')}</TableHead>
                <TableHead>{t('cms-demos.screen.col.cms')}</TableHead>
                <TableHead>{t('cms-demos.screen.col.release')}</TableHead>
                <TableHead>{t('cms-demos.screen.col.address')}</TableHead>
                <TableHead>{t('cms-demos.screen.col.deployed')}</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.tag}>
                  <TableCell>
                    <span className="block font-mono text-xs">{row.tag}</span>
                  </TableCell>
                  <TableCell className="text-xs">{CMS_LABEL[row.platform]}</TableCell>
                  <TableCell className="font-mono text-xs">{versions[row.tag] ?? '—'}</TableCell>
                  <TableCell>
                    <AddressCell
                      row={row}
                      zone={listing?.zone ?? ''}
                      target={active?.name ?? 'tracy'}
                      writable={writable}
                      onSaved={() => void load()}
                      onError={setError}
                    />
                  </TableCell>
                  <TableCell>
                    {sshJobs[row.tag] ? (
                      <SshJobState job={sshJobs[row.tag]} />
                    ) : active?.kind === 'record' ? (
                      // A recorded address on a machine Tracy does not run has no deploy of its own
                      // to time, and no job history to open: the far server's `present` answer is all
                      // there is to say, so the shared reading stands here untouched.
                      <DemoState row={row} job={following[row.tag]} present={present} />
                    ) : (
                      <DeployedCell
                        row={row}
                        job={following[row.tag]}
                        zone={listing?.zone ?? ''}
                        target={active?.name ?? 'tracy'}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <DemoAction
                      row={row}
                      job={following[row.tag]}
                      writable={writable}
                      releaseVersion={versions[row.tag] ?? null}
                      target={active}
                      badge={badgeFor(row.tag)}
                      onBadgeChange={(next) => setBadges((was) => ({ ...was, [row.tag]: next }))}
                      override={overrideFor(row.tag)}
                      onOverrideChange={(next) => setOverrides((was) => ({ ...was, [row.tag]: next }))}
                      servers={servers}
                      server={serverFor(row)}
                      onServerChange={(next) => setPicks((was) => ({ ...was, [row.tag]: next }))}
                      present={active?.kind === 'record' ? present : undefined}
                      onPress={() => press(row)}
                      onRemove={() => remove(row)}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {listing && listedFor === targetName && rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground text-xs">
                    <Trans
                      i18nKey="cms-demos.screen.empty"
                      components={{ m: <span className="font-mono" /> }}
                    />
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
