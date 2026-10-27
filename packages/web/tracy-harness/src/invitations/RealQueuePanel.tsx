import { Button, Card, Input } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { type QueueView, realRequest } from './real-api'
import { andList } from './real-format'
import { useT } from '../i18n'

/** Why a queue paused (server code → words the operator can act on). */
const PAUSED: Record<string, string> = {
  BY_OPERATOR: 'invitations-real.queue.paused.byOperator',
  SEND_UNKNOWN: 'invitations-real.queue.paused.sendUnknown',
  SEND_FAILED: 'invitations-real.queue.paused.sendFailed',
  REAL_MEMBERSHIP_UNKNOWN: 'invitations-real.queue.paused.membershipUnknown',
  REAL_PILOT_FULL: 'invitations-real.common.pilotFull',
  REAL_PILOT_OFF: 'invitations-real.queue.paused.pilotOff',
  REAL_MAILBOX_NOT_READY: 'invitations-real.common.mailboxNotReady'
}

/** Send approved emails: the operator gives each group a number for today; the server sends them one
 * at a time, 3 minutes apart, the groups taking turns, under the same checks as the Send button, and
 * keeps going with this tab closed. Each group stops at its own number of emails actually sent. */
export function RealQueuePanel({
  campaignId,
  groups,
  approved,
  busy,
  run,
  onChanged
}: {
  campaignId: string
  groups: { key: string; label: string }[]
  approved: number
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  onChanged: () => void
}) {
  const t = useT()
  const [queue, setQueue] = useState<QueueView | null>(null)
  const [confirming, setConfirming] = useState(false)
  // What the operator typed per group; empty means that group is not sent.
  const [numbers, setNumbers] = useState<Record<string, string>>({})
  const alive = useRef(true)
  const base = `/campaigns/${campaignId}/queue`
  async function load() {
    const next = await realRequest<QueueView>({ path: base })
    if (alive.current) setQueue(next)
  }
  useEffect(() => {
    alive.current = true
    void load().catch(() => {})
    // The cron moves the queue once a minute; follow it while the tab is open.
    const timer = setInterval(() => {
      void load().catch(() => {})
      onChanged()
    }, 30_000)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [campaignId])
  if (!queue) return null
  const label = (key: string) => groups.find((g) => g.key === key)?.label ?? key
  const chosen = groups
    .map((g) => ({ key: g.key, raw: (numbers[g.key] ?? '').trim() }))
    .filter((g) => g.raw !== '')
    .map((g) => ({ key: g.key, n: Number(g.raw) }))
  const invalid = chosen.filter((g) => !(Number.isSafeInteger(g.n) && g.n >= 1 && g.n <= 10_000))
  const total = chosen.reduce((sum, g) => sum + g.n, 0)
  const act = (path: string) =>
    void run(async () => {
      setConfirming(false)
      const body = path === 'start' ? { groups: Object.fromEntries(chosen.map((g) => [g.key, g.n])) } : {}
      const next = await realRequest<QueueView>({ path: `${base}/${path}`, method: 'POST', body })
      if (alive.current) setQueue(next)
      onChanged()
    })
  const { sent, skipped } = queue.counts
  // Emails still to go: per group, what is pending up to what its number still allows.
  const left = queue.groups.reduce((sum, g) => sum + Math.min(g.pending, Math.max(g.limit - g.sent, 0)), 0)
  const perGroup = queue.groups
    .map((g) =>
      t(g.skipped ? 'invitations-real.queue.groupSentSkipped' : 'invitations-real.queue.groupSent', {
        group: label(g.group),
        sent: g.sent,
        limit: g.limit,
        skipped: g.skipped
      })
    )
    .join(' · ')
  return (
    <Card className="gap-2 p-4" data-send-queue>
      <h2 className="font-semibold">{t('invitations-real.queue.title')}</h2>
      {queue.state === 'running' || queue.state === 'paused' ? (
        <p className="text-sm">
          {queue.state === 'paused'
            ? t('invitations-real.queue.pausedLine', { groups: perGroup, left })
            : left
              ? t('invitations-real.queue.runningEta', { groups: perGroup, left, minutes: left * 3 })
              : t('invitations-real.queue.running', { groups: perGroup, left })}
        </p>
      ) : null}
      {queue.state === 'paused' ? (
        <p role="alert" className="text-sm">
          {PAUSED[queue.pauseReason ?? '']
            ? t(PAUSED[queue.pauseReason ?? ''])
            : t('invitations-real.queue.paused.code', { code: String(queue.pauseReason) })}
        </p>
      ) : null}
      {queue.state === 'done' ? (
        <p className="text-sm">
          {perGroup
            ? t('invitations-real.queue.doneGroups', { sent, skipped, groups: perGroup })
            : t('invitations-real.queue.done', { sent, skipped })}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('invitations-real.queue.explain')}</p>
      {queue.state !== 'running' ? (
        <div className="flex flex-col gap-2">
          {groups.map((g) => (
            <label key={g.key} className="flex items-center gap-2 text-sm">
              <span className="w-48">{g.label}</span>
              <Input
                aria-label={t('invitations-real.queue.howManyAria', { group: g.label })}
                className="w-32"
                type="number"
                min={1}
                max={10000}
                step={1}
                inputMode="numeric"
                placeholder={t('invitations-real.queue.notSent')}
                value={numbers[g.key] ?? ''}
                disabled={busy}
                onChange={(e) => {
                  setNumbers((current) => ({ ...current, [g.key]: e.target.value }))
                  setConfirming(false)
                }}
              />
            </label>
          ))}
          {invalid.length ? (
            <span className="text-sm">
              {t('invitations-real.queue.invalid', {
                groups: andList(
                  t,
                  invalid.map((g) => label(g.key))
                )
              })}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {queue.state === 'running' ? (
          <Button variant="outline" disabled={busy} onClick={() => act('pause')}>
            {t('invitations-real.queue.pause')}
          </Button>
        ) : null}
        {queue.state === 'paused' ? (
          <Button disabled={busy} onClick={() => act('resume')}>
            {t('invitations-real.queue.resume')}
          </Button>
        ) : null}
        {queue.state !== 'running' ? (
          confirming ? (
            <>
              <Button disabled={busy} onClick={() => act('start')}>
                {t('invitations-real.queue.confirm', {
                  items: andList(
                    t,
                    chosen.map((g) =>
                      t('invitations-real.queue.confirmItem', { n: g.n, group: label(g.key) })
                    )
                  )
                })}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                {t('invitations-real.common.cancel')}
              </Button>
            </>
          ) : (
            <Button
              variant={queue.state === 'paused' ? 'outline' : 'default'}
              disabled={busy || !approved || !chosen.length || invalid.length > 0}
              onClick={() => setConfirming(true)}
            >
              {queue.state === 'paused'
                ? chosen.length && !invalid.length
                  ? t('invitations-real.queue.restartTotal', { total })
                  : t('invitations-real.queue.restart')
                : chosen.length && !invalid.length
                  ? t('invitations-real.queue.send', { total })
                  : t('invitations-real.queue.typeNumber')}
            </Button>
          )
        ) : null}
      </div>
    </Card>
  )
}
