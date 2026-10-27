/**
 * `/ops/cms/inventory` — the warm stock: CMS instances built before a customer asks for one.
 *
 * WHAT AN OPERATOR COMES HERE TO ANSWER. How much is on the shelf, why it is not being refilled,
 * what one of them looks like when opened, and how to get rid of one that is no use.
 *
 * 🔒 THREE THINGS THIS SCREEN SAYS THAT THE DOORS DO NOT SAY FOR THEMSELVES, each one a way to be
 * quietly wrong about the stock:
 *
 *   1. `ready` IS NOT THE SAME AS THE STATE COLUMN. `supply.ready` already excludes an instance
 *      whose health check has aged past the pool's TTL — that instance still reads `ready` on its
 *      own row, is never handed to a customer, and holds a container the whole time. The row is
 *      marked stale so the two numbers stop disagreeing on screen.
 *   2. THRESHOLDS DO NOT SURVIVE A PUBLISH. A pool's key contains `generation`, a checksum of what
 *      gets installed, so a new release under the same tag is a NEW pool whose thresholds start at
 *      the defaults. Two pools for one tag is the visible symptom, and the screen names it.
 *   3. DELETING REFILLS. Tearing one down drops the stock below the floor, so the reconciler
 *      builds a replacement within ~30s. Without saying so, a person presses Remove, watches the
 *      count return, and concludes the button does nothing.
 */
import {
  Badge,
  Button,
  Card,
  cn,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@tracy/ui'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  type ApproveAnswer,
  approveInstance,
  createPool,
  type EligibleRow,
  fetchEligible,
  fetchInstances,
  fetchPools,
  type InstanceRow,
  type PoolRow,
  prepareMore,
  retireInstance,
  reviewable,
  SWEEP_SECONDS,
  type Sweep,
  savePolicy,
  saveSweep
} from './inventory-api'
import {
  approvalBlock,
  begin,
  eligibleAnswer,
  instancesAnswer,
  listUnconfirmed,
  NOTHING_READ,
  neverRead,
  poolsAnswer,
  type ReadState,
  settle,
  unconfirmedPools,
  withHold
} from './inventory-read-state'
import { CMS_LABEL, type Cms } from './route'
import { Trans, tr, useT } from '../i18n'

/** `86400` → `24h`. A TTL in seconds is a number people have to divide in their heads. */
function shortSeconds(n: number): string {
  if (n % 86400 === 0) return `${n / 86400}d`
  if (n % 3600 === 0) return `${n / 3600}h`
  if (n % 60 === 0) return `${n / 60}m`
  return `${n}s`
}

function ago(iso: string | null): string | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms)) return null
  const m = Math.round(ms / 60000)
  if (m < 1) return tr('cms-inventory.ago.justNow')
  if (m < 60) return tr('cms-inventory.ago.minutesShort', { n: m })
  const h = Math.round(m / 60)
  return h < 48
    ? tr('cms-inventory.ago.hoursShort', { n: h })
    : tr('cms-inventory.ago.daysShort', { n: Math.round(h / 24) })
}

/** `30000` → `30 seconds`, `120000` → `2 minutes` — the period in the words a sentence needs. */
function periodWords(ms: number): string {
  const s = Math.round(ms / 1000)
  return s % 60 !== 0 || s < 60
    ? tr('cms-inventory.unit.seconds', { count: s })
    : tr('cms-inventory.unit.minutes', { count: s / 60 })
}

/**
 * "12 seconds ago", "3 minutes ago", "2 hours ago" — for the timer only, in words (Lee, 23/09).
 *
 * Not `ago()`: that one rounds to the minute, which is right for a health check and wrong here — a
 * 30-second timer that last ran "just now" and one that last ran 50 seconds ago read the same, and
 * only the second is late.
 */
function agoWords(iso: string | null, now: number): string | null {
  if (!iso) return null
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000))
  if (!Number.isFinite(s)) return null
  if (s < 60) return tr('cms-inventory.agoWords.seconds', { count: s })
  const m = Math.floor(s / 60)
  if (m < 60) return tr('cms-inventory.agoWords.minutes', { count: m })
  const h = Math.floor(m / 60)
  return h < 48
    ? tr('cms-inventory.agoWords.hours', { count: h })
    : tr('cms-inventory.agoWords.days', { count: Math.floor(h / 24) })
}

/**
 * The refill timer, said out loud: how often it runs, when it last ran, and what that run did.
 *
 * 🔒 "LATE" IS THE SIGNAL, NOT "FAILED". A timer that stopped does not report an error — it simply
 * stops writing — so the only way a person notices is that the last run is older than the period
 * says it should be. Twice the period plus slack is the line: one missed tick is a busy host, two is
 * a process that is not running the timer at all.
 */
function SweepPanel({ sweep, onSaved }: { sweep: Sweep; onSaved: () => Promise<unknown> }) {
  const t = useT()
  const [now, setNow] = useState(() => Date.now())
  const [editing, setEditing] = useState(false)
  const [seconds, setSeconds] = useState(String(sweep.periodMs / 1000))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // "12 seconds ago" is only worth reading if it counts.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const started = sweep.lastStartedAt ? new Date(sweep.lastStartedAt).getTime() : null
  const finished = sweep.lastFinishedAt ? new Date(sweep.lastFinishedAt).getTime() : null
  const running = started !== null && (finished === null || started > finished)
  const late = started !== null && now - started > sweep.periodMs * 2 + 15_000
  const took = !running && started !== null && finished !== null ? (finished - started) / 1000 : null
  const out = sweep.lastOutcome
  const did = out
    ? [
        out.enqueued ? t('cms-inventory.sweep.did.queued', { n: out.enqueued }) : null,
        out.started ? t('cms-inventory.sweep.did.started', { n: out.started }) : null,
        out.ready ? t('cms-inventory.sweep.did.ready', { n: out.ready }) : null,
        out.retired ? t('cms-inventory.sweep.did.retired', { n: out.retired }) : null,
        out.failed ? t('cms-inventory.sweep.did.failed', { n: out.failed }) : null
      ].filter(Boolean)
    : []

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">{t('cms-inventory.sweep.title')}</span>
        {editing ? (
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">{t('cms-inventory.sweep.runsEvery')}</span>
            <Input
              type="number"
              min={SWEEP_SECONDS.min}
              max={SWEEP_SECONDS.max}
              className="h-7 w-20 tabular-nums"
              value={seconds}
              onChange={(e) => setSeconds(e.target.value)}
            />
            <span className="text-muted-foreground">{t('cms-inventory.sweep.seconds')}</span>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                setError(null)
                const answer = await saveSweep(Math.round(Number(seconds) * 1000), sweep.revision)
                if (answer?.code) setError(refusalSentence(answer))
                else setEditing(false)
                await onSaved()
                setBusy(false)
              }}
            >
              {t('cms-inventory.sweep.save')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false)
                setError(null)
                setSeconds(String(sweep.periodMs / 1000))
              }}
            >
              {t('cms-inventory.sweep.cancel')}
            </Button>
          </span>
        ) : (
          <span className="flex items-center gap-2 text-muted-foreground">
            {t('cms-inventory.sweep.runsEveryPeriod', { period: periodWords(sweep.periodMs) })}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => {
                setSeconds(String(sweep.periodMs / 1000))
                setEditing(true)
              }}
            >
              {t('cms-inventory.sweep.change')}
            </Button>
          </span>
        )}
        <span className={cn('text-muted-foreground', late && 'font-medium text-destructive')}>
          {started === null
            ? t('cms-inventory.sweep.notRunYet')
            : running
              ? t('cms-inventory.sweep.running', { ago: agoWords(sweep.lastStartedAt, now) ?? '' })
              : took !== null
                ? t('cms-inventory.sweep.lastRunTook', {
                    ago: agoWords(sweep.lastStartedAt, now) ?? '',
                    duration:
                      took < 1
                        ? t('cms-inventory.sweep.underSecond')
                        : t('cms-inventory.unit.seconds', { count: Math.round(took) })
                  })
                : t('cms-inventory.sweep.lastRun', { ago: agoWords(sweep.lastStartedAt, now) ?? '' })}
          {late ? t('cms-inventory.sweep.late') : ''}
        </span>
        {!running && started !== null ? (
          sweep.lastError ? (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3.5" />
              {sweep.lastError}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {did.length > 0 ? did.join(' · ') : t('cms-inventory.sweep.nothingToDo')}
            </span>
          )
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        {t('cms-inventory.sweep.explain')}
        {sweep.updatedBy ? t('cms-inventory.sweep.changedBy', { who: sweep.updatedBy }) : ''}
      </p>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Why this pool is not filling up, in one word — the same ladder `deficitOf` walks on the server.
 * Recomputed here from the numbers the door already sends rather than asking for a new field.
 */
function bottleneckOf(row: PoolRow): { label: string; tone: 'idle' | 'warn' } | null {
  const p = row.policy
  const s = row.supply
  if (p.paused)
    return {
      label: tr('cms-inventory.neck.paused', { reason: p.pausedReason ?? tr('cms-inventory.neck.noReason') }),
      tone: 'warn'
    }
  if (!p.enabled) return { label: tr('cms-inventory.neck.off'), tone: 'idle' }
  if (s.ready >= p.targetReady) return null
  if (s.stock >= p.maxStock) return { label: tr('cms-inventory.neck.atMax'), tone: 'warn' }
  if (s.preparing >= p.maxConcurrentPrepares)
    return { label: tr('cms-inventory.neck.oneAtATime'), tone: 'idle' }
  if (s.awaitingReview > 0) return { label: tr('cms-inventory.neck.review'), tone: 'warn' }
  return null
}

/**
 * What a refusal from the teardown door means, in words a person can act on.
 *
 * 🔒 ONLY TEXT IS PRINTED. `host`, `detail` and `code` come from a body nobody checked; one that is
 * not text is left out, so a refusal is always a sentence and never something React cannot draw.
 */
function refusalSentence(answer: { code?: unknown; host?: unknown; detail?: unknown } | null): string {
  const said = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)
  const code = said(answer?.code)
  const host = said(answer?.host)
  const detail = said(answer?.detail)
  if (!code) return tr('cms-inventory.refusal.noAnswer')
  if (code === 'HOST_UNREACHABLE')
    return tr('cms-inventory.refusal.hostUnreachable', { host: host ?? tr('cms-inventory.refusal.theHost') })
  if (code === 'TEARDOWN_REFUSED') {
    const who = host ?? tr('cms-inventory.refusal.theHostStart')
    return detail
      ? tr('cms-inventory.refusal.teardownRefusedDetail', { host: who, detail })
      : tr('cms-inventory.refusal.teardownRefused', { host: who })
  }
  if (code === 'HAS_OWNER') return tr('cms-inventory.refusal.hasOwner')
  if (code === 'HTTP_403') return tr('cms-inventory.refusal.forbidden')
  if (code === 'NO_ANSWER') return tr('cms-inventory.refusal.noAnswerUnchanged')
  if (code === 'REVISION_CONFLICT') return tr('cms-inventory.refusal.revisionConflict')
  if (code === 'NOT_ELIGIBLE') return tr('cms-inventory.refusal.notEligible')
  if (code === 'POOL_PAUSED') return tr('cms-inventory.refusal.poolPaused')
  // 🔒 THE DOOR'S OWN SENTENCE WINS OVER ITS CODE. `setPolicy` answers `INVALID` with a `detail`
  // that names the actual problem — `maxStock below targetReady`, `out of bounds: targetReady` —
  // and printing the bare code threw that away, leaving a reader with nothing to fix (Lee, 23/09).
  return detail ?? code
}

/**
 * The approve door's refusals that are decided before anything is written, in words. Everything
 * else — a dropped request, a 5xx, an answer that is not the door's — is NOT in here on purpose:
 * the door writes the approval and then moves the instance, so an answer that failed in between
 * cannot be read as "nothing happened".
 */
function approvalRefusal(answer: ApproveAnswer): string | null {
  if (answer.code === 'HASH_MISMATCH') return tr('cms-inventory.approval.hashMismatch')
  if (answer.code === 'NOT_AWAITING_REVIEW')
    return typeof answer.state === 'string' && answer.state
      ? tr('cms-inventory.approval.notAwaitingState', { state: answer.state })
      : tr('cms-inventory.approval.notAwaiting')
  if (answer.code === 'NOT_FOUND' || answer.code === 'BAD_INSTANCE_ID')
    return tr('cms-inventory.approval.notFound')
  if (answer.code === 'HTTP_401' || answer.code === 'HTTP_403') return tr('cms-inventory.approval.refused')
  return null
}

/** What one approve press came to. Only `released: true` from the door itself is `done`. */
type ApprovalOutcome = { done: true; already: boolean } | { done: false; said: string }

function approvalOutcome(answer: ApproveAnswer | null): ApprovalOutcome {
  if (answer !== null && typeof answer === 'object' && !Array.isArray(answer)) {
    if (answer.code === undefined && answer.released === true)
      return { done: true, already: answer.alreadyApproved === true }
    const refused = answer.code === undefined ? null : approvalRefusal(answer)
    if (refused) return { done: false, said: refused }
    // 🔒 `released: false` IS THE DOOR SAYING THE INSTANCE DID NOT MOVE — the approval itself may
    // well be recorded, so this is neither a success nor "nothing was changed".
    if (answer.code === undefined && answer.released === false)
      return { done: false, said: tr('cms-inventory.approval.notReleased') }
  }
  return { done: false, said: tr('cms-inventory.approval.notConfirmed') }
}

/** One read-back value as text: a string as it is, anything else as the JSON the door stored. */
function hashText(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/**
 * How long a build may sit untouched before a person should be allowed to give up on it.
 *
 * The reconciler re-claims a `preparing` row after 60 seconds, so anything still sitting after ten
 * minutes has been re-claimed nine times and got nowhere. The report on this feature names the
 * case it cannot recover from by itself: a host that died mid-provision leaves a row in
 * `preparing` forever, because the job it is waiting on will never answer.
 */
const STUCK_AFTER_MS = 10 * 60 * 1000

/**
 * An instance nobody can use and nobody is waiting on — what `Clear stuck` offers to remove.
 *
 * 🔒 A CUSTOMER'S IS NEVER IN HERE. `reserved`, `assigning` and `assigned` are excluded before the
 * door gets a chance to refuse them; the door refuses too (`HAS_OWNER`), and both is deliberate —
 * this list is shown to a person about to press a destructive button, so it must not contain one
 * row the press would then skip.
 */
function isStuck(row: InstanceRow): boolean {
  if (row.reserved || ['reserved', 'assigning', 'assigned', 'draining', 'retired'].includes(row.state))
    return false
  if (row.state === 'quarantined') return true
  if (!['queued', 'preparing', 'verifying'].includes(row.state)) return false
  return Date.now() - new Date(row.updatedAt).getTime() > STUCK_AFTER_MS
}

/**
 * Whether there is anything at this instance's address yet.
 *
 * 🔒 A LINK TO A SITE THAT HAS NOT BEEN BUILT IS WORSE THAN NO LINK. `queued` and `preparing` have
 * a computed address and nothing serving it, so offering it invites somebody to click through to a
 * failure the screen already knew about (Lee hit exactly that, 22/09, on a queued row whose
 * provision the host had refused). The address appears once the site is actually standing.
 */
const isServing = (row: InstanceRow) =>
  ['verifying', 'awaiting_review', 'ready', 'reserved', 'assigning', 'assigned', 'draining'].includes(
    row.state
  )

/** Health that has aged past the pool's TTL: the row says `ready`, the allocator disagrees. */
const healthStale = (row: InstanceRow, pool: PoolRow) =>
  row.state === 'ready' &&
  (!row.healthCheckedAt ||
    Date.now() - new Date(row.healthCheckedAt).getTime() > pool.policy.healthTtlSeconds * 1000)

const STATE_TONE: Record<string, string> = {
  ready: 'bg-primary/10 text-primary',
  quarantined: 'bg-destructive/10 text-destructive',
  draining: 'bg-muted text-muted-foreground',
  assigned: 'bg-muted text-muted-foreground'
}

function InstanceRowView({
  row,
  pool,
  settling,
  onRetire,
  onReview
}: {
  row: InstanceRow
  pool: PoolRow
  /** An approval of this instance was answered and its row has not been read again yet. */
  settling: boolean
  onRetire: (row: InstanceRow, to: 'quarantined' | 'retired') => void
  onReview: (row: InstanceRow) => void
}) {
  const t = useT()
  const stale = healthStale(row, pool)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-border border-t px-4 py-2.5 text-sm">
      <span className="w-40 flex-none truncate font-mono text-[12px]">{row.label}</span>
      <Badge variant="secondary" className={cn('flex-none text-[11px]', STATE_TONE[row.state])}>
        {row.state}
      </Badge>

      {/* The link an operator came here for. `target=_blank` with `rel=noreferrer noopener`: the
          stock site is a real CMS, and a page opened from here must not keep a handle on /ops. */}
      {row.url && isServing(row) ? (
        <a
          href={row.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex min-w-0 items-center gap-1 font-mono text-[12px] text-primary underline-offset-2 hover:underline"
        >
          <span className="truncate">{row.url}</span>
          <ExternalLink className="size-3 flex-none" aria-label={t('cms-inventory.row.opensNewTab')} />
        </a>
      ) : (
        // Named for WHY there is no link: "not built yet" is a state somebody waits out, while a
        // missing address on a running instance would be a fault worth chasing.
        <span className="text-muted-foreground text-xs">
          {row.url ? t('cms-inventory.row.notBuilt') : t('cms-inventory.row.noAddress')}
        </span>
      )}

      <span className="ms-auto flex flex-none items-center gap-3 text-muted-foreground text-xs">
        {stale ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="flex cursor-help items-center gap-1 text-amber-700 dark:text-amber-400" />
              }
            >
              <AlertTriangle className="size-3.5" />
              {t('cms-inventory.row.healthStale')}
            </TooltipTrigger>
            <TooltipContent side="top">
              {t('cms-inventory.row.staleTip', {
                ago: ago(row.healthCheckedAt) ?? t('cms-inventory.ago.never'),
                ttl: shortSeconds(pool.policy.healthTtlSeconds)
              })}
            </TooltipContent>
          </Tooltip>
        ) : row.healthCheckedAt && row.state !== 'retired' ? (
          <span>{t('cms-inventory.row.checked', { ago: ago(row.healthCheckedAt) ?? '' })}</span>
        ) : null}
        {row.attempts > 0 && row.state !== 'retired' ? (
          <span>{t('cms-inventory.row.tries', { n: row.attempts, max: pool.policy.maxAttempts })}</span>
        ) : null}
        {row.lastError ? (
          <Tooltip>
            <TooltipTrigger render={<span className="max-w-[16rem] cursor-help truncate text-destructive" />}>
              {row.lastError}
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[28rem]">
              {row.lastError}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </span>

      <span className="flex flex-none items-center gap-1">
        {/* The way out of `awaiting_review`. Without it "Hold for review" parks every build of the
            pool where nothing on this screen can release it (#795). It opens the review; nothing
            is sent until the person has been shown what they approve. */}
        {row.state === 'awaiting_review' ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="sm"
                  variant="outline"
                  data-approve={row.id}
                  disabled={!reviewable(row) || settling}
                  onClick={() => onReview(row)}
                />
              }
            >
              <Check />
              {t('cms-inventory.row.approve')}
            </TooltipTrigger>
            <TooltipContent side="top">
              {settling
                ? t('cms-inventory.row.tip.settling')
                : reviewable(row)
                  ? t('cms-inventory.row.tip.reviewable')
                  : row.reserved
                    ? t('cms-inventory.row.tip.reserved')
                    : t('cms-inventory.row.tip.nothing')}
            </TooltipContent>
          </Tooltip>
        ) : null}
        {/* Two presses, and the difference that matters is whether the site survives. Both are
            spelled out on hover, because "quarantine" only reads as "keeps it" to somebody who
            already knows. */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                disabled={
                  row.reserved || ['assigned', 'quarantined', 'retired', 'draining'].includes(row.state)
                }
                onClick={() => onRetire(row, 'quarantined')}
              />
            }
          >
            {t('cms-inventory.row.quarantine')}
          </TooltipTrigger>
          <TooltipContent side="top">{t('cms-inventory.row.quarantineTip')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="sm"
                variant="ghost"
                // A site already torn down has nothing left to tear down.
                disabled={row.reserved || ['assigned', 'retired', 'draining'].includes(row.state)}
                onClick={() => onRetire(row, 'retired')}
              />
            }
          >
            <Trash2 />
            {t('cms-inventory.row.remove')}
          </TooltipTrigger>
          <TooltipContent side="top">{t('cms-inventory.row.removeTip')}</TooltipContent>
        </Tooltip>
      </span>
    </div>
  )
}

function PolicyEditor({ row, onSaved }: { row: PoolRow; onSaved: () => Promise<unknown> }) {
  const t = useT()
  const [draft, setDraft] = useState(row.policy)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const field = (key: keyof typeof draft, label: string, hint?: string) => (
    <label className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">
        {label}
        {hint ? <span className="ms-1 text-muted-foreground/70">{hint}</span> : null}
      </span>
      <Input
        type="number"
        className="w-28 tabular-nums"
        value={String(draft[key] ?? '')}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  )

  return (
    <div className="flex flex-col gap-3 border-border border-t bg-muted/30 px-4 py-3">
      <div className="flex flex-wrap items-end gap-4">
        {field('lowWatermark', t('cms-inventory.policy.floor'), t('cms-inventory.policy.floorHint'))}
        {field('targetReady', t('cms-inventory.policy.target'))}
        {field('maxStock', t('cms-inventory.policy.ceiling'))}
        {field('maxConcurrentPrepares', t('cms-inventory.policy.atOnce'))}
        {field('maxAttempts', t('cms-inventory.policy.tries'))}
        <label className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{t('cms-inventory.policy.healthTtl')}</span>
          <Input
            type="number"
            className="w-32 tabular-nums"
            value={String(draft.healthTtlSeconds)}
            onChange={(e) => setDraft({ ...draft, healthTtlSeconds: Number(e.target.value) })}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-5">
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} />
          {t('cms-inventory.policy.inService')}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch checked={draft.reviewHold} onCheckedChange={(v) => setDraft({ ...draft, reviewHold: v })} />
          {t('cms-inventory.policy.reviewHold')}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <Switch
            checked={draft.paused}
            onCheckedChange={(v) =>
              setDraft({
                ...draft,
                paused: v,
                pausedReason: v ? (draft.pausedReason ?? 'paused by hand') : null
              })
            }
          />
          {t('cms-inventory.policy.paused')}
        </label>
        {draft.paused ? (
          <Input
            className="w-64 text-xs"
            placeholder={t('cms-inventory.policy.pausedPlaceholder')}
            value={draft.pausedReason ?? ''}
            onChange={(e) => setDraft({ ...draft, pausedReason: e.target.value })}
          />
        ) : null}
        <Button
          size="sm"
          className="ms-auto"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            const answer = await savePolicy(row.poolKey, row.revision, draft)
            // 🔒 The door uses `revision` as an optimistic lock, so a second tab that saved first
            // wins and this one is told to re-read — never silently overwritten.
            if (answer?.code) setError(refusalSentence(answer))
            await onSaved()
            setBusy(false)
          }}
        >
          {t('cms-inventory.policy.save')}
        </Button>
      </div>
      {error ? (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * @param cms - the CMS chosen in this area's top bar. Every other screen here reads it, and one
 *   that did not looked broken: the picker highlighted EmDash while the page listed all three
 *   (Lee, 22/09).
 */
export function Inventory({ cms }: { cms: Cms }) {
  const t = useT()
  /**
   * 🔒 EVERYTHING DRAWN FROM THE INVENTORY DOORS IS ONE `ReadState`, CHANGED ONLY BY `read` AND BY
   * THE HOLD OF AN APPROVAL. The pools and the instances of a pool are two doors, and a count from
   * one read beside rows from another is a screen that contradicts itself — so the snapshot, the
   * order of reads, what could not be read again and which instances are held all live in
   * `inventory-read-state`, and this component only draws them. The ref decides (two presses in
   * one tick, an answer landing between renders); the state draws.
   */
  const machine = useRef<ReadState>(NOTHING_READ)
  const [view, setView] = useState<ReadState>(NOTHING_READ)
  const commit = (next: ReadState) => {
    machine.current = next
    setView(next)
  }
  const [open, setOpen] = useState<string | null>(null)
  const openNow = useRef<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<{ row: InstanceRow; pool: PoolRow } | null>(null)
  const [eligible, setEligible] = useState<EligibleRow[] | null>(null)
  const [sweeping, setSweeping] = useState<{ pool: PoolRow; rows: InstanceRow[] } | null>(null)
  const [swept, setSwept] = useState<{ done: number; total: number } | null>(null)
  /**
   * 🔒 A `retired` ROW IS NOT STOCK — the site behind it is gone, torn down and reclaimed. Listing
   * them beside the live ones made a pool of two look like a pool of twelve, and offered Remove on
   * something already removed (Lee, 23/09). They are kept behind a count, because "what did I
   * clear out this week" is a real question and the rows are the only record of it.
   */
  const [showRetired, setShowRetired] = useState<Record<string, boolean>>({})
  /**
   * The review a person has open: the instance AS IT WAS when they opened it. The hashes sent with
   * the approval are these, never the ones a later read brought. When a later read shows anything
   * else for that instance, the review is not sent at all (`approvalBlock`): the person closes it
   * and opens the row that is on screen now.
   * `key` tells one opening from the next, so an answer that lands late finds its own review or none.
   */
  const [review, setReview] = useState<{
    key: number
    row: InstanceRow
    pool: PoolRow
    error: string | null
  } | null>(null)
  const reviewKey = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /**
   * THE ONLY WAY ANYTHING FROM THE INVENTORY DOORS REACHES THE SCREEN: read the pools together
   * with the instances of `targets` and of the pool that is open, and hand every answer to
   * `settle`, which applies all of it or none. Refresh, Reload, opening a pool, the read after a
   * press and the read after an approval all come through here, so they share one order and one
   * ledger. Answers whether the read was applied.
   */
  const read = useCallback(async (targets: string[] = []) => {
    const started = begin(machine.current, targets, openNow.current)
    machine.current = started.state
    const { ticket } = started
    const [poolsBody, ...bodies] = await Promise.all([
      fetchPools(),
      ...ticket.covered.map((poolKey) => fetchInstances(poolKey))
    ])
    if (!mounted.current) return false
    const settled = settle(
      machine.current,
      ticket,
      poolsAnswer(poolsBody),
      ticket.covered.map((poolKey, i) => instancesAnswer(bodies[i], poolKey))
    )
    commit(settled.state)
    return settled.applied
  }, [])

  useEffect(() => {
    read()
    // What COULD be stocked, beside what is. Without this the screen answers "one pool" to the
    // question "what is in the warm stock", and never says that five more quickstarts are ready
    // to have one — which is the question somebody actually arrives with (Lee, 22/09).
    // Checked whole like every other answer: a list that cannot be drawn is no list, not half of one.
    fetchEligible().then((body) => {
      if (mounted.current) setEligible(eligibleAnswer(body) ?? [])
    })
  }, [read])

  const snap = view.snapshot
  const pools = snap?.pools ?? null
  const sweep = snap?.sweep ?? null
  const instances = snap?.instances ?? {}
  const marked = unconfirmedPools(view)
  const listMarked = listUnconfirmed(view)
  /** Why the review that is open cannot be sent, as drawn: the same rule the press applies. */
  const blocked = review ? approvalBlock(view, review.row, review.pool.poolKey) : null

  const approve = async () => {
    const target = review
    if (!target) return
    const { id, label } = target.row
    const { poolKey } = target.pool
    // 🔒 DECIDED ON THE LATEST STATE, not on the render this press came from: nothing is sent while
    // a request for this instance is on its way or its answer is not read back, nor when the
    // screen has read something else for this instance since the review was opened.
    if (approvalBlock(machine.current, target.row, poolKey) !== null) return
    commit(withHold(machine.current, id, { phase: 'sending' }))
    setReview((now) => (now?.key === target.key ? { ...now, error: null } : now))
    const outcome = approvalOutcome(await approveInstance(id, target.row.hashes))
    if (!mounted.current) return
    // 🔒 HELD UNTIL ITS ROW IS READ AGAIN, whatever the answer was. The row on screen still says
    // `awaiting_review`, and a second approval sent before a read shows where the instance stands
    // is refused by the door for a press the screen just reported. Only `settle` lifts this, on a
    // read started after this answer that carried this pool — never the request ending, and never
    // a re-read that failed.
    commit(withHold(machine.current, id, { phase: 'settling', poolKey, since: machine.current.started }))
    const short = target.row.generation.slice(0, 8)
    setNotice(
      outcome.done
        ? outcome.already
          ? tr('cms-inventory.approval.doneAlready', { label, short })
          : tr('cms-inventory.approval.done', { label, short })
        : `${label}: ${outcome.said}`
    )
    // 🔒 ONLY THE REVIEW OF THIS INSTANCE IS TOUCHED. A person may have closed it and opened
    // another instance's while the answer was on its way; that one keeps its own state, and the
    // outcome is said in the notice above, by name. A review of the SAME instance opened again in
    // the meantime closes on a confirmed release (there is nothing left to approve) and is
    // otherwise left as it is.
    setReview((now) => {
      if (!now) return now
      if (outcome.done) return now.row.id === id ? null : now
      return now.key === target.key ? { ...now, error: outcome.said } : now
    })
    await read([poolKey])
  }

  const toggle = async (poolKey: string) => {
    const next = open === poolKey ? null : poolKey
    openNow.current = next
    setOpen(next)
    if (next) await read([next])
  }

  const shown = (pools ?? []).filter((p) => p.platform === cms)
  const shownEligible = (eligible ?? []).filter((q) => q.platform === cms)

  /**
   * Tag → how many pools carry it. More than one means a publish left the old thresholds behind.
   *
   * ⚠ COUNTED ACROSS EVERY CMS, NOT JUST THE ONE ON SCREEN. The warning is about a tag having two
   * builds; hiding the other CMS must not hide the second pool and turn the warning off.
   */
  const tagCounts = (pools ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.quickstartTag] = (acc[p.quickstartTag] ?? 0) + 1
    return acc
  }, {})

  if (neverRead(view))
    return (
      <div className="px-6 py-6">
        <p className="text-muted-foreground text-sm">{t('cms-inventory.screen.unreadable')}</p>
      </div>
    )

  return (
    <TooltipProvider delay={0}>
      <div className="px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-semibold text-xl tracking-tight">{t('cms-inventory.screen.title')}</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">{t('cms-inventory.screen.intro')}</p>
          </div>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => read()}>
            <RefreshCw className={cn(busy && 'animate-spin')} />
            {t('cms-inventory.screen.refresh')}
          </Button>
        </div>

        {notice ? (
          <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm" role="status">
            {notice}
          </p>
        ) : null}

        {/*
          🔒 EACH MARK SAYS WHAT IT IS ABOUT. The list's sentence is for a read that could not be
          drawn at all — every count is older than it. A pool's sentence stays until a read that
          carried THAT pool's instances is drawn; a read of another pool does not clear it.
        */}
        {listMarked || marked.length > 0 ? (
          <div
            className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/30 px-3 py-2 text-destructive text-sm"
            role="alert"
            data-unconfirmed
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {listMarked ? (
                <span data-unconfirmed-list>{t('cms-inventory.screen.listUnconfirmed')}</span>
              ) : null}
              {marked.length > 0 ? (
                <span data-unconfirmed-pools={marked.join(' ')}>
                  {t('cms-inventory.screen.poolsUnconfirmed', {
                    count: marked.length,
                    pools: marked
                      .map((key) => {
                        const pool = (pools ?? []).find((p) => p.poolKey === key)
                        return pool ? `${pool.quickstartTag} ${pool.generation.slice(0, 8)}` : key
                      })
                      .join(', ')
                  })}
                </span>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={() => read(unconfirmedPools(machine.current))}>
              <RefreshCw />
              {t('cms-inventory.screen.reload')}
            </Button>
          </div>
        ) : null}

        {sweep ? <SweepPanel sweep={sweep} onSaved={read} /> : null}

        {!pools ? (
          <Skeleton className="mt-5 h-40 w-full" />
        ) : shown.length === 0 ? (
          <p className="mt-5 text-muted-foreground text-sm">
            {t(pools.length > 0 ? 'cms-inventory.screen.emptyOther' : 'cms-inventory.screen.empty', {
              cms: CMS_LABEL[cms]
            })}
          </p>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {shown.map((row) => {
              const neck = bottleneckOf(row)
              const isOpen = open === row.poolKey
              const short = row.generation.slice(0, 8)
              return (
                <Card key={row.poolKey} className="gap-0 p-0">
                  <button
                    type="button"
                    onClick={() => toggle(row.poolKey)}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="size-4 flex-none text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 flex-none text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{row.quickstartTag}</span>
                    <Badge variant="outline" className="text-[11px]">
                      {row.platform}
                    </Badge>
                    <span className="text-muted-foreground text-xs">
                      {row.quickstartVersion} · {row.host} · {row.environment}
                    </span>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className="cursor-help font-mono text-[11px] text-muted-foreground/80" />
                        }
                      >
                        {short}
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[30rem]">
                        {t('cms-inventory.pool.generationTip')}
                      </TooltipContent>
                    </Tooltip>

                    <span className="ms-auto flex flex-none items-center gap-4 text-xs">
                      <span className="tabular-nums">
                        <strong className={cn(row.supply.ready === 0 && 'text-destructive')}>
                          {row.supply.ready}
                        </strong>
                        <span className="text-muted-foreground">
                          {' '}
                          {t('cms-inventory.pool.readyOf', { target: row.policy.targetReady })}
                        </span>
                      </span>
                      {row.supply.preparing > 0 ? (
                        <span className="text-muted-foreground">
                          {t('cms-inventory.pool.building', { n: row.supply.preparing })}
                        </span>
                      ) : null}
                      {row.supply.quarantined > 0 ? (
                        <span className="text-destructive">
                          {t('cms-inventory.pool.quarantined', { n: row.supply.quarantined })}
                        </span>
                      ) : null}
                      {neck ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[11px]',
                            neck.tone === 'warn' && 'border-amber-500/40 text-amber-700'
                          )}
                        >
                          {neck.label}
                        </Badge>
                      ) : null}
                    </span>
                  </button>

                  {/* ⚠ Two pools for one tag: the older one's thresholds did not carry over. */}
                  {tagCounts[row.quickstartTag] > 1 ? (
                    <p className="flex items-start gap-1.5 border-border border-t bg-amber-500/5 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="mt-px size-3 flex-none" />
                      <span>
                        <Trans
                          i18nKey="cms-inventory.pool.twoPools"
                          values={{ n: tagCounts[row.quickstartTag], tag: row.quickstartTag }}
                          components={{ b: <strong /> }}
                        />
                      </span>
                    </p>
                  ) : null}

                  {isOpen ? (
                    <>
                      <div className="flex flex-wrap items-center gap-2 border-border border-t bg-muted/20 px-4 py-2 text-muted-foreground text-xs">
                        <span>
                          {t('cms-inventory.pool.summary', {
                            floor: row.policy.lowWatermark,
                            target: row.policy.targetReady,
                            ceiling: row.policy.maxStock,
                            atOnce: row.policy.maxConcurrentPrepares,
                            ttl: shortSeconds(row.policy.healthTtlSeconds)
                          })}
                        </span>
                        <span className="ms-auto flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true)
                              const answer = await prepareMore(row.poolKey, 1)
                              setNotice(
                                answer?.code === 'AT_MAX_STOCK'
                                  ? tr('cms-inventory.pool.atCeiling', {
                                      stock: String(answer.stock),
                                      max: String(answer.maxStock)
                                    })
                                  : answer?.code
                                    ? refusalSentence(answer)
                                    : // The press queues the work; the timer's next run installs it.
                                      tr('cms-inventory.pool.queued', {
                                        n: answer?.enqueued ?? 0,
                                        period: periodWords(sweep?.periodMs ?? 30_000)
                                      })
                              )
                              await read([row.poolKey])
                              setBusy(false)
                            }}
                          >
                            <Plus />
                            {t('cms-inventory.pool.buildOne')}
                          </Button>
                          {/* Only offered when there IS something to clear — a button that does
                              nothing on most pools teaches people to ignore it. */}
                          {(instances[row.poolKey] ?? []).some(isStuck) ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setSweeping({
                                  pool: row,
                                  rows: (instances[row.poolKey] ?? []).filter(isStuck)
                                })
                              }
                            >
                              <Trash2 />
                              {t('cms-inventory.pool.clearStuck', {
                                n: (instances[row.poolKey] ?? []).filter(isStuck).length
                              })}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditing(editing === row.poolKey ? null : row.poolKey)}
                          >
                            {editing === row.poolKey
                              ? t('cms-inventory.pool.close')
                              : t('cms-inventory.pool.thresholds')}
                          </Button>
                        </span>
                      </div>

                      {editing === row.poolKey ? (
                        <PolicyEditor
                          row={row}
                          onSaved={async () => {
                            await read()
                          }}
                        />
                      ) : null}

                      {(() => {
                        const all = instances[row.poolKey]
                        // Not covered by the read on screen: no rows are drawn, rather than rows
                        // from an older read beside this count, or an empty pool nobody read.
                        if (!all)
                          return (
                            <p
                              className="border-border border-t px-4 py-4 text-muted-foreground text-sm"
                              data-unread={row.poolKey}
                            >
                              {marked.includes(row.poolKey)
                                ? t('cms-inventory.pool.unreadable')
                                : t('cms-inventory.pool.reading')}
                            </p>
                          )
                        const gone = all.filter((i) => i.state === 'retired')
                        const live = showRetired[row.poolKey] ? all : all.filter((i) => i.state !== 'retired')
                        return (
                          <>
                            {live.length === 0 ? (
                              <p className="border-border border-t px-4 py-4 text-muted-foreground text-sm">
                                {t('cms-inventory.pool.empty')}
                              </p>
                            ) : (
                              live.map((inst) => (
                                <InstanceRowView
                                  key={inst.id}
                                  row={inst}
                                  pool={row}
                                  settling={view.holds[inst.id]?.phase === 'settling'}
                                  onReview={(target) => {
                                    if (
                                      !reviewable(target) ||
                                      machine.current.holds[target.id]?.phase === 'settling'
                                    )
                                      return
                                    reviewKey.current += 1
                                    setReview({ key: reviewKey.current, row: target, pool: row, error: null })
                                  }}
                                  onRetire={async (target, to) => {
                                    if (to === 'retired') {
                                      setConfirm({ row: target, pool: row })
                                      return
                                    }
                                    const answer = await retireInstance(target.id, to)
                                    if (answer?.code) setNotice(refusalSentence(answer))
                                    await read([row.poolKey])
                                  }}
                                />
                              ))
                            )}
                            {gone.length > 0 ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setShowRetired((prev) => ({ ...prev, [row.poolKey]: !prev[row.poolKey] }))
                                }
                                className="w-full border-border border-t px-4 py-2 text-left text-muted-foreground text-xs hover:bg-muted/40"
                              >
                                {t(
                                  showRetired[row.poolKey]
                                    ? 'cms-inventory.pool.hideRemoved'
                                    : 'cms-inventory.pool.showRemoved',
                                  { n: gone.length }
                                )}
                              </button>
                            ) : null}
                          </>
                        )
                      })()}
                    </>
                  ) : null}
                </Card>
              )
            })}
          </div>
        )}

        {/*
          Quickstarts that MAY be stocked and have no pool — and, for the ones that may not, the
          sentence saying why. A release only becomes eligible once a demo install has vouched for
          it, so "why not" is nearly always something a person can go and fix.
        */}
        {shownEligible.length > 0 ? (
          <div className="mt-8">
            <h2 className="font-medium text-base">{t('cms-inventory.eligible.title')}</h2>
            <p className="mt-0.5 text-muted-foreground text-xs">{t('cms-inventory.eligible.intro')}</p>
            <div className="mt-3 flex flex-col gap-1.5">
              {shownEligible
                .filter((q) => !(pools ?? []).some((p) => p.quickstartTag === q.tag))
                .map((q) => (
                  <div
                    key={q.tag}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-4 py-2.5 text-sm"
                  >
                    <span className="font-medium">{q.tag}</span>
                    <Badge variant="outline" className="text-[11px]">
                      {q.platform}
                    </Badge>
                    {q.currentVersion ? (
                      <span className="text-muted-foreground text-xs">{q.currentVersion}</span>
                    ) : null}
                    {q.eligible ? null : (
                      <span className="flex items-center gap-1.5 text-amber-700 text-xs dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        {q.reason}
                      </span>
                    )}
                    <span className="ms-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!q.eligible || busy}
                        onClick={async () => {
                          setBusy(true)
                          const answer = await createPool(q.tag)
                          setNotice(
                            answer?.pool
                              ? tr('cms-inventory.eligible.created', { tag: q.tag })
                              : tr('cms-inventory.eligible.failed', {
                                  tag: q.tag,
                                  why: refusalSentence(answer)
                                })
                          )
                          await read()
                          setBusy(false)
                        }}
                      >
                        <Plus />
                        {t('cms-inventory.eligible.stock')}
                      </Button>
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ) : null}
      </div>

      {/*
        Clearing several at once. Every row still goes through the SAME door as the single press —
        one teardown each, each refusable on its own — rather than a bulk endpoint that would need
        its own rules about half-failures.
      */}
      <Dialog open={sweeping !== null} onOpenChange={(v) => !v && (setSweeping(null), setSwept(null))}>
        <DialogContent closeLabel={t('cms-inventory.review.close')}>
          <DialogHeader>
            <DialogTitle>{t('cms-inventory.clear.title', { count: sweeping?.rows.length ?? 0 })}</DialogTitle>
            <DialogDescription>{t('cms-inventory.clear.description')}</DialogDescription>
          </DialogHeader>
          <div className="max-h-56 overflow-auto rounded-lg border border-border">
            {(sweeping?.rows ?? []).map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-2 border-border border-b px-3 py-1.5 text-xs last:border-0"
              >
                <span className="w-36 flex-none truncate font-mono">{r.label}</span>
                <Badge variant="secondary" className="text-[11px]">
                  {r.state}
                </Badge>
                <span className="truncate text-muted-foreground">
                  {r.lastError ?? t('cms-inventory.clear.since', { ago: ago(r.updatedAt) ?? '' })}
                </span>
              </div>
            ))}
          </div>
          {swept ? (
            <p className="text-muted-foreground text-xs">
              {t('cms-inventory.clear.progress', { done: swept.done, total: swept.total })}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t('cms-inventory.clear.keep')}</Button>} />
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!sweeping) return
                setBusy(true)
                let done = 0
                const refused: string[] = []
                for (const r of sweeping.rows) {
                  const answer = await retireInstance(r.id, 'retired', 'cleared from /ops')
                  // One refusal does not stop the rest: a host that is briefly unreachable for one
                  // site should not leave the other six standing.
                  if (answer?.code) refused.push(`${r.label}: ${refusalSentence(answer)}`)
                  else done += 1
                  setSwept({ done, total: sweeping.rows.length })
                }
                setNotice(
                  refused.length === 0
                    ? tr('cms-inventory.clear.done', { count: done })
                    : tr('cms-inventory.clear.partial', {
                        done,
                        total: sweeping.rows.length,
                        refused: refused.join(' ')
                      })
                )
                await read([sweeping.pool.poolKey])
                setSweeping(null)
                setSwept(null)
                setBusy(false)
              }}
            >
              <Trash2 />
              {t('cms-inventory.clear.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        🔒 AN APPROVAL IS FOR THE GENERATION, AND THE DIALOG SAYS SO BEFORE THE PRESS. The door
        records "this build is good" for the whole generation of this pool: every later instance of
        it skips review. So the person is shown the full generation and what was read back from
        THIS instance — the same hashes the request then carries — not just a name and a button.
      */}
      <Dialog open={review !== null} onOpenChange={(v) => !v && setReview(null)}>
        <DialogContent closeLabel={t('cms-inventory.review.close')} data-review={review?.row.id}>
          <DialogHeader>
            <DialogTitle>{t('cms-inventory.review.title', { label: review?.row.label ?? '' })}</DialogTitle>
            <DialogDescription>{t('cms-inventory.review.description')}</DialogDescription>
          </DialogHeader>
          {review ? (
            <dl className="flex flex-col gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">{t('cms-inventory.review.generation')}</dt>
                <dd className="break-all font-mono" data-review-generation>
                  {review.row.generation}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('cms-inventory.review.readBack')}</dt>
                <dd className="mt-1 max-h-56 overflow-auto rounded-lg border border-border">
                  {Object.entries(review.row.hashes).map(([name, value]) => (
                    <div
                      key={name}
                      data-review-hash={name}
                      className="flex gap-3 border-border border-b px-3 py-1.5 last:border-0"
                    >
                      <span className="w-40 flex-none text-muted-foreground">{name}</span>
                      <span className="break-all font-mono">{hashText(value)}</span>
                    </div>
                  ))}
                </dd>
              </div>
            </dl>
          ) : null}
          {review?.error ? (
            <p className="text-destructive text-xs" role="alert" data-review-error>
              {review.error}
            </p>
          ) : null}
          {/*
            🔒 A REVIEW IS ONLY SENT FOR THE ROW THAT IS ON SCREEN. After any read that shows this
            instance in another state, with another generation or other hashes, held by a
            customer, or not at all, sending what this review shows can only be refused — so the
            press is locked and the person is told to open the row as it is now.
          */}
          {blocked === 'moved' ? (
            <p className="text-destructive text-xs" role="alert" data-review-moved>
              {t('cms-inventory.review.moved')}
            </p>
          ) : null}
          {/* Answered, and the re-read that would say where it stands failed: said here, because
              the lock on the button below does not explain itself. */}
          {blocked === 'settling' && review && marked.includes(review.pool.poolKey) ? (
            <p className="text-destructive text-xs" role="alert" data-review-unread>
              {t('cms-inventory.review.unread')}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t('cms-inventory.review.notYet')}</Button>} />
            <Button data-review-confirm disabled={blocked !== null} onClick={approve}>
              <Check />
              {blocked === 'sending'
                ? t('cms-inventory.review.approving')
                : t('cms-inventory.review.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        🔒 REMOVE IS DESTRUCTIVE AND ASKS FIRST. It tears the site down on the host — container,
        volume, port, webroot — and there is no undo. The dialog also says what happens NEXT,
        because the count coming straight back is the confusing part.
      */}
      <Dialog open={confirm !== null} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent closeLabel={t('cms-inventory.review.close')}>
          <DialogHeader>
            <DialogTitle>{t('cms-inventory.remove.title', { label: confirm?.row.label ?? '' })}</DialogTitle>
            <DialogDescription>
              {t('cms-inventory.remove.description', { host: confirm?.row.host ?? '' })}
              {confirm && confirm.pool.supply.ready - 1 < confirm.pool.policy.targetReady ? (
                <>
                  {' '}
                  {t('cms-inventory.remove.refill', {
                    left: Math.max(0, confirm.pool.supply.ready - 1),
                    target: confirm.pool.policy.targetReady,
                    period: periodWords(sweep?.periodMs ?? 30_000)
                  })}
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">{t('cms-inventory.remove.keep')}</Button>} />
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!confirm) return
                setBusy(true)
                const answer = await retireInstance(confirm.row.id, 'retired', 'removed from /ops')
                setNotice(
                  answer?.code
                    ? `${confirm.row.label}: ${refusalSentence(answer)}`
                    : tr('cms-inventory.remove.tearing', { label: confirm.row.label })
                )
                await read([confirm.pool.poolKey])
                setConfirm(null)
                setBusy(false)
              }}
            >
              <Trash2 />
              {t('cms-inventory.remove.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  )
}
