/**
 * Host agents — what each fleet host's dsh is running, and where the hosts disagree.
 *
 * Data is `GET /api/host-agents` on this same origin (workers/harness → `POST /dsh-versions` on
 * every host's ear). Read-only, and that is a design decision rather than a missing feature: see
 * NO BUTTON below.
 *
 * ## What this replaces
 *
 * `Site agents` drew one row per SITE — twelve containers, grouped by platform, each with its own
 * Update button. ADR 0014 replaced that arrangement with one dsh per MACHINE shared by every site
 * on it, which left the old screen asking three questions the fleet no longer answers; it and its
 * Worker module went on 2026-09-06 (`fb51fe8e`). The question worth keeping is smaller and sharper:
 * two machines, built from one repo, and whether they are actually running the same thing.
 *
 * 🔒 NO BUTTON, ON PURPOSE. The old screen offered a per-row rebuild through `/lane-update`. A host
 * dsh is upgraded by `deploy-host-dsh.sh` ON the machine — it preflights three files, keeps the old
 * tag in `DSH_IMAGE_TAG_PREVIOUS`, waits for healthy, measures twice and rolls itself back when any
 * step fails. A button here would be a second path to the same change with none of that, and the
 * screen exists to make a bad deploy VISIBLE, not to start one.
 *
 * ⚠ NO ABSOLUTE "LATEST" EITHER, and its absence is the interesting part. The old screen asked a
 * private registry; that registry retired with ADR 0014 §6. What replaced it reads better anyway:
 * both images are built from THIS repo, so two hosts naming different versions of one package is a
 * finding on its own, with nothing to look up.
 *
 * ⚠ A DARK HOST IS A ROW. Carried through from `hosts.js` and from the module before it: a machine
 * that did not answer must still occupy its line and say so. The alternative — dropping it — makes
 * a fleet of two look like a fleet of one, and reads as "everything agrees".
 *
 * `fetchImpl` exists for the design bench, which has no Worker behind it; the app never passes it.
 */
import {
  Badge,
  Button,
  Card,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RefreshCw, Server } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { formatWith, type T, Trans, useT } from './i18n'

export type HostPackage = { name: string; version: string | null }

export type HostRow = {
  host: string
  ok: boolean
  image: { repository: string; tag: string | null; previous: string | null } | null
  container: {
    name: string
    status: string
    health: string | null
    startedAt: string | null
    image: string | null
  } | null
  packages: HostPackage[]
  /** The host answered, but only half: the script could not read its env file, say. */
  note: string | null
  error: string | null
}

export type HostAgentsPayload = {
  hosts: HostRow[]
  /** package name → host → version (or null where that host does not carry it at all). */
  drift: Record<string, Record<string, string | null>>
  error: string | null
  measuredAt: string
}

/**
 * The names people use for these machines, keyed by the names the fleet uses.
 *
 * A host absent from this map still renders — under its own key. A screen that hid a machine it had
 * no label for would hide exactly the machine somebody just added.
 */
const HOST_LABEL: Record<string, string> = {
  do: 'DigitalOcean',
  contabo: 'contabo',
  dev: 'dev'
}

function whenText(stamp: string | null, t: T): string {
  if (!stamp) return '—'
  const d = new Date(stamp)
  if (Number.isNaN(d.getTime())) return stamp
  const ageMs = Date.now() - d.getTime()
  if (ageMs < 60_000) return t('agents.host.justNow')
  if (ageMs < 3_600_000) return t('agents.host.minutesAgo', { n: Math.round(ageMs / 60_000) })
  if (ageMs < 86_400_000) return t('agents.host.hoursAgo', { n: Math.round(ageMs / 3_600_000) })
  return formatWith(d, { month: 'short', day: 'numeric' })
}

/** `@tracy/dsh-add-site` reads as `add-site` in a table of nothing but Tracy packages. */
function shortName(name: string): string {
  return name.replace('@tracy/dsh-', '').replace('@tracy/', '')
}

export function HostAgents({ fetchImpl }: { fetchImpl?: typeof fetch } = {}) {
  const t = useT()
  const doFetch = fetchImpl ?? fetch
  const [data, setData] = useState<HostAgentsPayload | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const res = await doFetch('/api/host-agents', { headers: { accept: 'application/json' } })
      if (!res.ok) throw new Error(`${res.status}`)
      setData((await res.json()) as HostAgentsPayload)
      setLoadError(null)
    } catch (error) {
      setLoadError(String((error as Error)?.message ?? error))
    } finally {
      setBusy(false)
    }
  }, [doFetch])

  useEffect(() => {
    void load()
  }, [load])

  // 🔒 NO POLL. The old screen polled every four seconds because it was watching jobs it had
  // started. Nothing here changes on its own, and one refresh is three signed calls to three
  // production machines; a screen left open in a tab would knock on the fleet all day to redraw
  // numbers that move once a week. The button is the poll.

  const hosts = data?.hosts ?? []
  const answered = hosts.filter((h) => h.ok)
  const dark = hosts.filter((h) => !h.ok)
  const driftNames = useMemo(() => Object.keys(data?.drift ?? {}), [data])

  const toggle = (host: string) =>
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(host)) n.delete(host)
      else n.add(host)
      return n
    })

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-semibold text-lg tracking-tight">
            <Server className="size-4.5" />
            {t('agents.host.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {data ? (
              <>
                {t('agents.host.hosts', { count: hosts.length })} ·{' '}
                {t('agents.host.answered', { n: answered.length })}
                {dark.length > 0 ? <> · {t('agents.host.dark', { n: dark.length })}</> : null}
                {answered.length > 1 ? (
                  <>
                    {' · '}
                    {driftNames.length === 0 ? (
                      t('agents.host.agree')
                    ) : (
                      <span className="text-amber-700">
                        {t('agents.host.disagree', { count: driftNames.length })}
                      </span>
                    )}
                  </>
                ) : null}
              </>
            ) : loadError ? (
              t('agents.host.readFailed', { error: loadError })
            ) : (
              t('agents.host.asking')
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {data ? t('agents.host.measured', { time: whenText(data.measuredAt, t) }) : null}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => void load()}
            aria-label={t('agents.host.refresh')}
          >
            <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {/* The Worker refusing for want of its secret is a different fact from a host being down, and
          it is fixed somewhere else entirely — so it gets its own line rather than three dark rows. */}
      {data?.error ? (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-destructive text-sm">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          <span>
            <Trans
              i18nKey="agents.host.secretMissing"
              values={{ error: data.error, command: 'wrangler secret put FLEET_RELAY_SECRET' }}
              components={{ code: <span className="font-mono text-xs" /> }}
            />
          </span>
        </p>
      ) : null}

      {dark.length > 0 ? (
        <p className="flex items-start gap-2 text-destructive text-sm">
          <AlertTriangle className="mt-0.5 size-4 flex-none" />
          <span>
            {dark
              .map((h) =>
                t('agents.host.didNotAnswer', { host: HOST_LABEL[h.host] ?? h.host, error: h.error ?? '' })
              )
              .join(' · ')}
          </span>
        </p>
      ) : null}

      <Card className="gap-0 py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>{t('agents.host.column.host')}</TableHead>
              <TableHead>{t('agents.host.column.dsh')}</TableHead>
              <TableHead>{t('agents.host.column.tag')}</TableHead>
              <TableHead>{t('agents.host.column.packages')}</TableHead>
              <TableHead>{t('agents.host.column.started')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hosts.map((row) => (
              <HostRows
                key={row.host}
                row={row}
                drift={data?.drift ?? {}}
                expanded={expanded.has(row.host)}
                onToggle={() => toggle(row.host)}
              />
            ))}
            {!data && !loadError ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground text-sm">
                  {t('agents.host.asking')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>

      {driftNames.length > 0 ? (
        <Card className="gap-0 px-4 py-3">
          <h2 className="flex items-center gap-2 pb-2 font-medium text-sm">
            <AlertTriangle className="size-4 text-amber-600" />
            {t('agents.host.drift.heading', { count: driftNames.length })}
          </h2>
          <p className="pb-3 text-muted-foreground text-xs">
            <Trans
              i18nKey="agents.host.drift.explain"
              values={{ missing: '—' }}
              components={{ code: <span className="font-mono" /> }}
            />
          </p>
          <table className="w-full text-xs">
            <tbody>
              {driftNames.map((name) => (
                <tr key={name} className="border-border/60 border-b last:border-0">
                  <td className="py-1 pr-4 font-mono" title={name}>
                    {shortName(name)}
                  </td>
                  {answered.map((h) => (
                    <td key={h.host} className="py-1 pr-4 font-mono text-muted-foreground">
                      <span className="text-muted-foreground/70">{HOST_LABEL[h.host] ?? h.host}</span>{' '}
                      <span className="text-foreground">{data?.drift[name]?.[h.host] ?? '—'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : answered.length > 1 ? (
        <p className="flex items-center gap-2 text-muted-foreground text-sm">
          <CheckCircle2 className="size-4 text-emerald-600" />
          {t('agents.host.allAgree')}
        </p>
      ) : null}
    </div>
  )
}

/** One host: its row, and the detail beneath it when opened. */
function HostRows({
  row,
  drift,
  expanded,
  onToggle
}: {
  row: HostRow
  drift: Record<string, Record<string, string | null>>
  expanded: boolean
  onToggle: () => void
}) {
  const t = useT()
  const label = HOST_LABEL[row.host] ?? row.host
  const status = row.container?.status ?? null
  const health = row.container?.health ?? null
  const driftHere = Object.keys(drift).length

  return (
    <>
      <TableRow className={cn('cursor-pointer', !row.ok && 'opacity-70')} onClick={onToggle}>
        <TableCell className="pe-0">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </TableCell>
        <TableCell className="font-medium">
          {label}
          <span className="ps-2 font-mono text-muted-foreground text-xs">{row.host}</span>
        </TableCell>
        <TableCell>
          {!row.ok ? (
            <Badge variant="outline" className="text-destructive">
              {t('agents.host.noAnswer')}
            </Badge>
          ) : status === 'running' ? (
            <Badge variant="secondary" className="gap-1.5">
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  // No healthcheck is not ill health — `hosts.js` keeps the two apart, and so does
                  // the dot: grey for "did not say", green only for a real healthy answer.
                  health === 'healthy' ? 'bg-emerald-500' : health ? 'bg-amber-500' : 'bg-muted-foreground/50'
                )}
              />
              {t('agents.host.running')}
              {health ? ` · ${health}` : ''}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-amber-700">
              {status ?? t('agents.host.unknownStatus')}
            </Badge>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{row.image?.tag ?? '—'}</TableCell>
        <TableCell className="text-sm">{row.ok ? row.packages.length : '—'}</TableCell>
        <TableCell className="text-muted-foreground text-sm">
          {whenText(row.container?.startedAt ?? null, t)}
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow className="bg-muted/30 hover:bg-muted/30">
          <TableCell colSpan={6} className="px-6 py-4">
            {!row.ok ? (
              <p className="text-muted-foreground text-sm">
                {t('agents.host.darkDetail')} <span className="font-mono text-xs">{row.error}</span>
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <Block title={t('agents.host.packagesBlock', { n: row.packages.length })}>
                  {row.packages.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t('agents.host.notRunning')}</p>
                  ) : (
                    <table className="w-full table-fixed text-xs">
                      <tbody>
                        {row.packages.map((pkg) => (
                          <tr key={pkg.name} className="border-border/60 border-b last:border-0">
                            <td className="truncate py-1 pr-3 font-mono" title={pkg.name}>
                              {shortName(pkg.name)}
                            </td>
                            <td
                              className={cn('truncate py-1 font-mono', pkg.name in drift && 'text-amber-700')}
                            >
                              {pkg.version ?? '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {driftHere > 0 ? (
                    <p className="text-muted-foreground text-xs">{t('agents.host.amber')}</p>
                  ) : null}
                </Block>

                <Block title={t('agents.host.image')}>
                  <Fact label={t('agents.host.repository')} value={row.image?.repository} />
                  <Fact label={t('agents.host.envTag')} value={row.image?.tag} />
                  <Fact label={t('agents.host.previousTag')} value={row.image?.previous} />
                  {/* These two disagree exactly when a deploy half-succeeded — the env file
                      rewritten, the container never restarted. Showing only one would hide it. */}
                  <Fact label={t('agents.host.runningImage')} value={row.container?.image} />
                </Block>

                <Block title={t('agents.host.container')}>
                  <Fact label={t('agents.host.name')} value={row.container?.name} />
                  <Fact label={t('agents.host.status')} value={row.container?.status} />
                  <Fact
                    label={t('agents.host.health')}
                    value={row.container?.health ?? t('agents.host.noHealthcheck')}
                  />
                  <Fact
                    label={t('agents.host.column.started')}
                    value={row.container?.startedAt?.replace('T', ' ')}
                  />
                  {row.note ? <Fact label={t('agents.host.note')} value={row.note} /> : null}
                </Block>
              </div>
            )}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 overflow-hidden">
      <h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">{title}</h3>
      {children}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate text-right font-mono text-xs">{value ?? '—'}</span>
    </div>
  )
}
