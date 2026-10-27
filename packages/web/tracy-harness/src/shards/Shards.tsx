/**
 * Shards — the machines new accounts are adopted into (docs/sre/2026-10-15-shard-beta-design.md §5).
 *
 * Data is `GET /api/ops/shards` on this same origin; a change is one `PATCH /api/ops/shards/:name`,
 * a new shard one `POST /api/ops/shards` (apps/tracy-web/src/shards/ops-routes.js;
 * docs/sre/hop-dong-cua-shard.md §8). Per shard: whether it takes new people, a pin that holds its
 * updater at the tags it runs, and target tags that replace this master's own for that shard alone —
 * how an update or a rollback is tried on one shard without redeploying the master.
 *
 * 🔒 A SECRET GOES ONE WAY. The Add dialog sends a shard's secret once (a password field, emptied as soon
 * as the answer comes and whenever the dialog closes); nothing on this screen ever reads one back.
 * Rotating it is SHARDS' (env wins).
 * 🔒 NO POLL, as on Host agents: the refresh button is the poll.
 */
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { AlertTriangle, ChevronDown, ChevronRight, Network, Plus, RefreshCw } from 'lucide-react'
import { Fragment, useCallback, useEffect, useState } from 'react'

import { type T, Trans, tr, useT } from '../i18n'
import {
  addShard,
  draftProblems,
  fetchShards,
  fillText,
  type MasterTags,
  onTarget,
  saveShard,
  type ShardChange,
  type ShardDraft,
  type ShardRow,
  type ShardState,
  type ShardsPayload,
  SHARD_REGIONS,
  shardState,
  targetFromInput,
  wantedTags
} from './shards-api'

const STATE_TONE: Record<ShardState, string> = {
  silent: 'border-destructive/50 text-destructive',
  failed: 'border-destructive/50 text-destructive',
  degraded: 'border-amber-500/50 text-amber-700',
  updating: 'border-sky-500/50 text-sky-700',
  pinned: 'border-amber-500/50 text-amber-700',
  closed: 'text-muted-foreground',
  open: 'border-emerald-500/50 text-emerald-700'
}

function when(t: T, stamp: string | null): string {
  if (!stamp) return t('shards.when.never')
  const ageMs = Date.now() - new Date(stamp).getTime()
  if (Number.isNaN(ageMs)) return stamp
  if (ageMs < 60_000) return t('shards.when.justNow')
  if (ageMs < 3_600_000) return t('shards.when.minutes', { n: Math.round(ageMs / 60_000) })
  return t('shards.when.hours', { n: Math.round(ageMs / 3_600_000) })
}

function TargetBox({
  label,
  value,
  disabled,
  onSave
}: {
  label: string
  value: string | null
  disabled: boolean
  onSave: (tag: string | null) => void
}) {
  const t = useT()
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  const parsed = targetFromInput(text)
  const changed = parsed !== undefined && parsed !== value
  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={label}
        aria-invalid={parsed === undefined}
        placeholder={t('shards.target.placeholder')}
        value={text}
        disabled={disabled}
        className="h-7 w-44 font-mono text-xs"
        onChange={(event) => setText(event.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-7 px-2"
        disabled={disabled || !changed}
        onClick={() => onSave(parsed ?? null)}
      >
        {t('shards.target.save')}
      </Button>
    </div>
  )
}

const EXAMPLE_ORIGIN = 'https://s3.example.com'

const EMPTY_DRAFT: ShardDraft = { name: '', origin: '', secret: '', tunnelId: '', provider: '', region: '' }

/**
 * Add (contract §8 (b)): one new row, closed until opened. One button opens a DIALOG with the form,
 * as Team's "Add member" does: the table underneath is what the new row joins, so it stays where the
 * eye left it instead of being pushed down by an inline card.
 * 🔒 The secret field empties on every answer AND whenever the dialog closes; nothing reads it back.
 */
function AddShardDialog({
  onAdd,
  disabled
}: {
  onAdd: (draft: ShardDraft) => Promise<string | null>
  disabled: boolean
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ShardDraft>(EMPTY_DRAFT)
  const [sending, setSending] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const problems = draftProblems(draft)
  const ready = Object.keys(problems).length === 0
  const close = () => {
    // A press that is still on its way decides what the dialog shows; closing under it would drop
    // a refusal on the floor (or show it to the next opening).
    if (sending) return
    setOpen(false)
    setRefusal(null)
    setDraft((current) => ({ ...current, secret: '' }))
  }
  const field = (key: keyof ShardDraft, label: string, extra: Record<string, string> = {}) => (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <Input
        aria-label={label}
        aria-invalid={draft[key] !== '' && Boolean(problems[key])}
        value={draft[key]}
        disabled={disabled || sending}
        className="h-8 w-full font-mono text-xs"
        onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        {...extra}
      />
      {draft[key] !== '' && problems[key] ? (
        <span className="text-destructive">{t(problems[key], { regions: SHARD_REGIONS.join(', ') })}</span>
      ) : null}
    </label>
  )
  const submit = async () => {
    setSending(true)
    const failure = await onAdd(draft)
    setSending(false)
    setRefusal(failure)
    setDraft(failure ? { ...draft, secret: '' } : EMPTY_DRAFT)
    if (!failure) setOpen(false)
  }
  return (
    <>
      <Button
        size="sm"
        className="flex-none"
        disabled={disabled}
        onClick={() => {
          setRefusal(null)
          setOpen(true)
        }}
      >
        <Plus /> {t('shards.add.title')}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent closeLabel={t('shards.add.close')} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('shards.add.title')}</DialogTitle>
            <DialogDescription>
              {t('shards.add.description', { takes: t('shards.column.takesPeople') })}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1 sm:grid-cols-2">
            {field('name', t('shards.add.name'))}
            {field('origin', t('shards.add.origin'), { placeholder: EXAMPLE_ORIGIN })}
            {field('secret', t('shards.add.secret'), { type: 'password', autoComplete: 'off' })}
            {field('tunnelId', t('shards.add.tunnelId'))}
            {field('provider', t('shards.add.provider'))}
            {field('region', t('shards.add.region'), { placeholder: SHARD_REGIONS.join(' | ') })}
          </div>
          {/* The refusal belongs INSIDE the dialog: the page behind it is covered while it is open. */}
          {refusal ? (
            <p className="text-destructive text-sm" role="alert">
              {refusal}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={sending} onClick={close}>
              {t('shards.add.cancel')}
            </Button>
            <Button disabled={disabled || sending || !ready} onClick={() => void submit()}>
              {t('shards.add.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ShardLine({
  row,
  master,
  writable,
  expanded,
  onToggle,
  onChange
}: {
  row: ShardRow
  master: MasterTags
  writable: boolean
  expanded: boolean
  onToggle: () => void
  onChange: (change: ShardChange) => void
}) {
  const t = useT()
  const state = shardState(row)
  const want = wantedTags(row, master)
  const matches = onTarget(row, master)
  const beat = row.heartbeat
  const last = beat?.last_update ?? null
  return (
    <Fragment>
      <TableRow>
        <TableCell>
          <button
            type="button"
            className="flex items-center gap-1 font-medium"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {row.name}
          </button>
          <div className="text-muted-foreground text-xs">
            {[row.provider, row.region].filter(Boolean).join(' · ') || '—'}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={STATE_TONE[state]}>
            {t(`shards.state.${state}`)}
          </Badge>
        </TableCell>
        <TableCell className="text-sm">{when(t, row.heartbeatAt)}</TableCell>
        <TableCell className="text-sm">
          {fillText(row)}
          <div className="text-muted-foreground text-xs">{t('shards.row.people', { count: row.people })}</div>
        </TableCell>
        <TableCell className="text-sm">
          {typeof beat?.mem_available_mb === 'number' ? `${Math.round(beat.mem_available_mb)} MB` : '—'}
        </TableCell>
        <TableCell className="font-mono text-xs">
          {beat?.app_tag ?? '?'} / {beat?.dsh_tag ?? '?'}
          <div className={cn('text-muted-foreground', matches === false && 'text-amber-700')}>
            {matches === null
              ? t('shards.row.targetUnknown')
              : matches
                ? t('shards.row.onTarget')
                : t('shards.row.wants', { app: want.app ?? '?', dsh: want.dsh ?? '?' })}
          </div>
        </TableCell>
        <TableCell>
          <Switch
            aria-label={t('shards.row.takesPeopleAria', { name: row.name })}
            checked={row.accepting}
            disabled={!writable}
            onCheckedChange={(on) => onChange({ accepting: on })}
          />
        </TableCell>
        <TableCell>
          <Switch
            aria-label={t('shards.row.pinnedAria', { name: row.name })}
            checked={row.pinned}
            disabled={!writable}
            onCheckedChange={(on) => onChange({ pinned: on })}
          />
        </TableCell>
        <TableCell>
          <TargetBox
            label={t('shards.row.targetAppAria', { name: row.name })}
            value={row.targetAppTag}
            disabled={!writable}
            onSave={(tag) => onChange({ targetAppTag: tag })}
          />
        </TableCell>
        <TableCell>
          <TargetBox
            label={t('shards.row.targetDshAria', { name: row.name })}
            value={row.targetDshTag}
            disabled={!writable}
            onSave={(tag) => onChange({ targetDshTag: tag })}
          />
        </TableCell>
      </TableRow>
      {expanded ? (
        <TableRow>
          <TableCell colSpan={10} className="bg-muted/30 text-xs">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              <dt>{t('shards.detail.origin')}</dt>
              <dd className="font-mono">{row.origin}</dd>
              <dt>{t('shards.detail.migrationHead')}</dt>
              <dd className="font-mono">
                {t('shards.detail.migrationMaster', {
                  head: beat?.migration_head ?? '—',
                  master: master.migrationHead ?? '?'
                })}
              </dd>
              <dt>{t('shards.detail.updater')}</dt>
              <dd>
                {beat?.updater_version ?? '—'}
                {beat?.updating ? ` · ${t('shards.detail.updatingNow')}` : ''}
                {row.updateGrantedAt
                  ? ` · ${t('shards.detail.turnGiven', { when: when(t, row.updateGrantedAt) })}`
                  : ''}
              </dd>
              <dt>{t('shards.detail.diskLoad')}</dt>
              <dd>
                {typeof beat?.disk_free_mb === 'number' ? `${Math.round(beat.disk_free_mb)} MB` : '—'} ·{' '}
                {typeof beat?.load1 === 'number' ? beat.load1 : '—'}
              </dd>
              <dt>{t('shards.detail.catalogue')}</dt>
              <dd>
                {beat?.releases_read_at ? when(t, beat.releases_read_at) : t('shards.detail.catalogueNever')}
              </dd>
              <dt>{t('shards.detail.passedOver')}</dt>
              <dd>{row.degradedUntil ?? '—'}</dd>
              <dt>{t('shards.detail.pinnedAt')}</dt>
              <dd className="font-mono">
                {row.pinned ? `${row.pinnedAppTag ?? '?'} / ${row.pinnedDshTag ?? '?'}` : '—'}
              </dd>
              <dt>{t('shards.detail.lowMem')}</dt>
              <dd>{row.lowMemBeats}</dd>
              <dt>{t('shards.detail.lastUpdate')}</dt>
              <dd>
                {last
                  ? `${t(last.ok ? 'shards.detail.ok' : 'shards.detail.failed')} · ${last.app_tag ?? '?'} / ${last.dsh_tag ?? '?'} · ${last.finished_at ?? '?'}${last.web_images_missing ? ` · ${t('shards.detail.webImagesMissing')}` : ''}`
                  : '—'}
              </dd>
              <dt>{t('shards.detail.lastBackup')}</dt>
              <dd>
                {beat?.last_backup
                  ? `${t(beat.last_backup.ok ? 'shards.detail.ok' : 'shards.detail.failed')} · ${beat.last_backup.at ?? '?'}`
                  : t('shards.detail.noneReported')}
              </dd>
            </dl>
            {last?.log_tail ? (
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-background p-2 font-mono">
                {last.log_tail}
              </pre>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </Fragment>
  )
}

export function Shards({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const t = useT()
  const doFetch = fetchImpl ?? fetch
  const [data, setData] = useState<ShardsPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setBusy(true)
    try {
      setData(await fetchShards(doFetch))
      setError(null)
    } catch (failure) {
      setError(tr('shards.readFailed', { error: String((failure as Error)?.message ?? failure) }))
    } finally {
      setBusy(false)
    }
  }, [doFetch])

  useEffect(() => {
    void load()
  }, [load])

  const change = async (name: string, patch: ShardChange) => {
    try {
      await saveShard(doFetch, name, patch)
      await load()
    } catch (failure) {
      setError(tr('shards.saveFailed', { name, error: String((failure as Error)?.message ?? failure) }))
    }
  }

  /** Null when added; otherwise what to tell the person next to the form. */
  const add = async (draft: ShardDraft): Promise<string | null> => {
    try {
      await addShard(doFetch, draft)
      await load()
      return null
    } catch (failure) {
      return tr('shards.addFailed', {
        name: draft.name.trim(),
        error: String((failure as Error)?.message ?? failure)
      })
    }
  }

  const writable = Boolean(data?.writable) && !busy
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <Network className="size-4.5" />
            {t('shards.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {data ? (
              <>
                {t('shards.summary.count', { count: data.shards.length })} ·{' '}
                {t('shards.summary.adopting', { who: t(`shards.summary.adopt.${data.adopt}`) })} ·{' '}
                {t(data.dns ? 'shards.summary.dnsOn' : 'shards.summary.dnsOff')} ·{' '}
                <Trans
                  i18nKey="shards.summary.master"
                  values={{ app: data.master.appTag ?? '?', dsh: data.master.dshTag ?? '?' }}
                  components={{ code: <span className="font-mono text-xs" /> }}
                />{' '}
                · {t('shards.summary.people', { count: data.master.people })}
              </>
            ) : error ? (
              error
            ) : (
              t('shards.reading')
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data?.writable ? <AddShardDialog onAdd={add} disabled={busy} /> : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label={t('shards.refresh')}
            onClick={() => void load()}
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </Button>
        </div>
      </div>
      {data && error ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-sm">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          <span>{error}</span>
        </p>
      ) : null}
      {data && data.shards.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('shards.empty', { add: t('shards.add.title') })}</p>
      ) : null}
      {data && data.shards.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('shards.column.shard')}</TableHead>
              <TableHead>{t('shards.column.state')}</TableHead>
              <TableHead>{t('shards.column.heartbeat')}</TableHead>
              <TableHead>{t('shards.column.sites')}</TableHead>
              <TableHead>{t('shards.column.memory')}</TableHead>
              <TableHead>{t('shards.column.running')}</TableHead>
              <TableHead>{t('shards.column.takesPeople')}</TableHead>
              <TableHead>{t('shards.column.pinned')}</TableHead>
              <TableHead>{t('shards.column.targetApp')}</TableHead>
              <TableHead>{t('shards.column.targetDsh')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.shards.map((row) => (
              <ShardLine
                key={row.name}
                row={row}
                master={data.master}
                writable={writable}
                expanded={open === row.name}
                onToggle={() => setOpen(open === row.name ? null : row.name)}
                onChange={(patch) => void change(row.name, patch)}
              />
            ))}
          </TableBody>
        </Table>
      ) : null}
    </div>
  )
}
