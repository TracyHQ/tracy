/**
 * `/ops/waitlist`: User Data Analytics › Waitlist, the people behind the Waitlist number on Signals (Sarah
 * 06/10/2026): everyone turned away at sign-in or who sent the whitelist form on tracy.ai, one row per
 * address, with the form's answers, the confirmation mail and whether they signed in later.
 *
 * Read only. Every value comes from `GET /api/ops/beta/waitlist` (`apps/tracy-web/src/ops/beta.js`);
 * this file adds no count of its own.
 */
import {
  Badge,
  Button,
  Card,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@tracy/ui'
import { RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { type T, useT } from '../i18n'
import { en } from '../i18n/ns/beta.ts'
import { fetchWaitlist, type Source, type Waitlist as WaitlistBody, type WaitlistRow } from './api'
import { vnTime } from './strings'

const WINDOWS = [7, 14, 30] as const

const ROLE_KEYS: Record<string, string> = {
  clients: 'beta.waitlist.roleClients',
  own: 'beta.waitlist.roleOwn'
}
const MAIL_KEYS: Record<string, string> = {
  sent: 'beta.waitlist.mailSent',
  queued: 'beta.waitlist.mailQueued',
  review: 'beta.waitlist.mailReview'
}
const roleText = (t: T, role: string | null) => (role && ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : '')
function sitesText(t: T, count: string | null) {
  if (count === 'none') return t('beta.waitlist.sitesNone')
  if (count === 'one') return t('beta.waitlist.sitesOne')
  return count ? t('beta.waitlist.sitesMany', { value: count }) : ''
}
// An unknown status is the door's own word, shown as itself.
const mailText = (t: T, status: string | null) =>
  status ? (MAIL_KEYS[status] ? t(MAIL_KEYS[status]) : status) : ''

function Tile({ labelKey, value, note }: { labelKey: keyof typeof en; value: number; note: string }) {
  const t = useT()
  return (
    // The attribute keeps the English label, whatever the language on screen.
    <Card className="gap-1 p-4" data-waitlist-tile={en[labelKey]}>
      <div className="text-muted-foreground text-xs">{t(labelKey)}</div>
      <div className="font-semibold text-3xl tabular-nums">{value}</div>
      <div className="text-muted-foreground text-xs">{note}</div>
    </Card>
  )
}

function Tried({ row }: { row: WaitlistRow }) {
  const t = useT()
  const away = row.turnedAway
  if (!away) return <span className="text-muted-foreground">{t('beta.waitlist.notTried')}</span>
  return (
    <div className="flex flex-col gap-0.5" data-waitlist-tried={away.times}>
      <span className="tabular-nums">{vnTime(away.lastAt)}</span>
      <span className="text-muted-foreground text-xs">
        {[
          t('beta.waitlist.times', { count: away.times }),
          away.via ? t('beta.waitlist.via', { via: away.via }) : ''
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  )
}

function FormSource({ source }: { source: Source | null }) {
  const t = useT()
  if (!source) return null
  const parts = [source.source, source.medium, source.campaign, source.content].filter(Boolean) as string[]
  if (!parts.length) return null
  return (
    <span className="flex flex-wrap items-center gap-1" data-waitlist-source>
      <span className="text-muted-foreground text-xs">{t('beta.waitlist.from')}</span>
      {parts.map((p) => (
        <Badge key={p} variant="outline" className="font-mono text-[11px]">
          {p}
        </Badge>
      ))}
    </span>
  )
}

function Answers({ row }: { row: WaitlistRow }) {
  const t = useT()
  const f = row.form
  if (!f) return <span className="text-muted-foreground">{t('beta.waitlist.noForm')}</span>
  if (f.name === null)
    return (
      <div className="flex flex-col gap-0.5" data-waitlist-form="no-answers">
        {f.at ? <span className="tabular-nums">{vnTime(f.at)}</span> : null}
        <span className="text-muted-foreground text-xs">{t('beta.waitlist.formNoAnswers')}</span>
      </div>
    )
  return (
    <div className="flex flex-col gap-1" data-waitlist-form="answers">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-medium">{f.name}</span>
        {f.website ? (
          <a
            href={f.website}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary text-xs underline-offset-2 hover:underline"
          >
            {f.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          </a>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {f.platforms.map((p) => (
          <Badge key={p} variant="secondary" className="text-[11px]">
            {p}
          </Badge>
        ))}
        <span className="text-muted-foreground text-xs">
          {[roleText(t, f.role), sitesText(t, f.siteCount), f.at ? vnTime(f.at) : '']
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <FormSource source={f.source} />
    </div>
  )
}

export function Waitlist() {
  const t = useT()
  const [days, setDays] = useState<number>(30)
  const [body, setBody] = useState<WaitlistBody | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      const answer = await fetchWaitlist(days, signal)
      if (signal?.aborted) return
      setLoading(false)
      if (answer.ok) {
        setBody(answer.body)
        setError(null)
      } else setError(t('beta.waitlist.loadFailed', { status: answer.status }))
    },
    [days, t]
  )
  useEffect(() => {
    const ac = new AbortController()
    void load(ac.signal)
    return () => ac.abort()
  }, [load])

  const totals = body?.totals

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto" data-waitlist-screen>
      <div className="flex flex-none flex-wrap items-start justify-between gap-3 px-8 pt-7 pb-4">
        <div>
          <h1 className="font-semibold text-xl tracking-tight">{t('beta.nav.waitlist')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">{t('beta.waitlist.intro')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="flex w-fit gap-1 rounded-lg bg-muted p-[3px]"
            role="group"
            aria-label={t('beta.waitlist.window')}
          >
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                data-waitlist-window={w}
                aria-pressed={w === days}
                onClick={() => setDays(w)}
                className={cn(
                  'rounded-md px-3 py-1.5 font-medium text-sm transition-colors',
                  w === days
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('beta.common.days', { count: w })}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => void load()}
            disabled={loading}
            aria-label={t('beta.common.reload')}
            title={t('beta.common.reload')}
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-8 pb-10">
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        {!body || !totals ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Tile
                labelKey="beta.waitlist.people"
                value={totals.people}
                note={t('beta.waitlist.peopleNote', { n: totals.both })}
              />
              <Tile
                labelKey="beta.waitlist.turnedAway"
                value={totals.turnedAway}
                note={t('beta.waitlist.turnedAwayNote')}
              />
              <Tile labelKey="beta.waitlist.form" value={totals.form} note={t('beta.waitlist.formNote')} />
              <Tile
                labelKey="beta.waitlist.signedIn"
                value={totals.signedIn}
                note={t('beta.waitlist.signedInNote')}
              />
            </div>
            <Card className="gap-0 overflow-hidden p-0">
              {body.rows.length === 0 ? (
                <p className="px-4 py-6 text-muted-foreground text-sm" data-waitlist-empty>
                  {t('beta.waitlist.empty')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('beta.waitlist.email')}</TableHead>
                      <TableHead>{t('beta.waitlist.turnedAway')}</TableHead>
                      <TableHead>{t('beta.waitlist.answers')}</TableHead>
                      <TableHead>{t('beta.waitlist.confirmation')}</TableHead>
                      <TableHead>{t('beta.waitlist.later')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {body.rows.map((row) => (
                      <TableRow key={row.email} data-waitlist-row={row.email} className="align-top">
                        <TableCell className="font-mono text-xs">{row.email}</TableCell>
                        <TableCell>
                          <Tried row={row} />
                        </TableCell>
                        <TableCell>
                          <Answers row={row} />
                        </TableCell>
                        <TableCell
                          className="text-sm"
                          data-waitlist-mail={row.confirmation?.status ?? (row.form ? 'not-asked' : '')}
                        >
                          {row.confirmation ? (
                            mailText(t, row.confirmation.status)
                          ) : row.form ? (
                            <span className="text-amber-700 dark:text-amber-400">
                              {t('beta.waitlist.mailNotAsked')}
                            </span>
                          ) : (
                            ''
                          )}
                        </TableCell>
                        <TableCell
                          className="text-sm"
                          data-waitlist-signed-in={row.signedInAt ? 'yes' : 'no'}
                        >
                          {row.signedInAt ? (
                            <span className="tabular-nums">{vnTime(row.signedInAt)}</span>
                          ) : (
                            <span className="text-muted-foreground">{t('beta.waitlist.notYet')}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  )
}
