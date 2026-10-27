import { Button, Card } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { SEND_STATE, andList, localTime } from './real-format'
import { type T, useT } from '../i18n'
import { RealQueuePanel } from './RealQueuePanel'
import {
  type CampaignView,
  type EligibilityView,
  type Page,
  type RecipientDetail,
  type RecipientSummary,
  type SendView,
  type SendingStatus,
  RealRequestError,
  realRequest
} from './real-api'

/** What a refusal at send time means (server code → one line the operator can act on). */
const REFUSAL: Record<string, string> = {
  REAL_NOT_MEMBER: 'invitations-real.send.refusal.notMember',
  REAL_MEMBERSHIP_UNKNOWN: 'invitations-real.send.refusal.membershipUnknown',
  REAL_SUPPRESSED: 'invitations-real.send.refusal.suppressed',
  REAL_ALREADY_INVITED: 'invitations-real.send.refusal.alreadyInvited',
  REAL_PILOT_PACING: 'invitations-real.send.refusal.pacing',
  REAL_PILOT_FULL: 'invitations-real.common.pilotFull',
  REAL_PILOT_OFF: 'invitations-real.send.refusal.pilotOff',
  REAL_NOT_APPROVED: 'invitations-real.send.refusal.notApproved',
  REAL_STALE_DRAFT: 'invitations-real.send.refusal.staleDraft',
  REAL_MAILBOX_NOT_READY: 'invitations-real.common.mailboxNotReady',
  REAL_SEND_BUSY: 'invitations-real.send.refusal.busy'
}
/** "3 of 25 (12%)". */
const rate = (t: T, part: number, whole: number) =>
  t('invitations-real.send.rate', { part, whole, percent: Math.round((100 * part) / whole) })

/** Send: every approved email of the campaign, one press (and a confirmation) per customer, with
 * the outcome and estimated opens beside it. The server picks each address and checks aMember,
 * pacing and the pilot limit; this screen only asks and shows the answer. */
export function RealSendPanel({
  campaign,
  groups,
  sending,
  busy,
  run,
  onSendingChanged,
  onReview
}: {
  campaign: CampaignView
  groups: { key: string; label: string }[]
  sending: SendingStatus | null
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  onSendingChanged: () => void
  onReview: (recipientId: string) => void
}) {
  const t = useT()
  const [page, setPage] = useState<Page<RecipientSummary> | null>(null)
  const [sends, setSends] = useState<SendView[]>([])
  const [eligibility, setEligibility] = useState<Map<string, EligibilityView['items'][number]>>(new Map())
  const [confirming, setConfirming] = useState<string | null>(null)
  const [refusals, setRefusals] = useState<Record<string, string>>({})
  const [now, setNow] = useState(Date.now())
  const alive = useRef(true)
  const base = `/campaigns/${campaign.id}`
  async function loadSends(signal?: AbortSignal) {
    const next = await realRequest<{ items: SendView[] }>({ path: `${base}/sends`, signal })
    if (alive.current && !signal?.aborted) setSends(next.items)
  }
  async function loadPage(cursor: string | null, signal?: AbortSignal) {
    const next = await realRequest<Page<RecipientSummary>>({
      path: `${base}/recipients/query`,
      method: 'POST',
      body: { group: null, content: 'approved', search: '', cursor, limit: 100 },
      signal
    })
    if (!alive.current || signal?.aborted) return
    setPage((p) => (cursor && p ? { ...next, items: [...p.items, ...next.items] } : next))
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void Promise.all([
      loadPage(null, controller.signal),
      loadSends(controller.signal),
      realRequest<EligibilityView>({ path: `${base}/eligibility`, signal: controller.signal }).then((e) => {
        if (alive.current) setEligibility(new Map(e.items.map((i) => [i.recipientId, i])))
      })
    ]).catch(() => {})
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => {
      alive.current = false
      controller.abort()
      clearInterval(timer)
    }
  }, [campaign.id])
  if (!sending) return <p>{t('invitations-real.common.readingSending')}</p>
  const customers = sending.mode === 'pilot' && sending.customersEnabled
  const invitationOf = (rid: string) =>
    sends.find((s) => s.recipientId === rid && s.kind === 'invitation' && s.state !== 'failed') ??
    sends.find((s) => s.recipientId === rid && s.kind === 'invitation')
  const waitMs = sending.nextInvitationAt ? Date.parse(sending.nextInvitationAt) - now : 0
  const full = sending.pilotUsed >= sending.pilotMax
  const mailboxReady = sending.mailbox.status === 'connected' && sending.mailbox.send
  async function sendOne(rid: string) {
    setConfirming(null)
    setRefusals((r) => ({ ...r, [rid]: '' }))
    await run(async () => {
      try {
        const detail = await realRequest<RecipientDetail>({ path: `${base}/recipients/${rid}` })
        if (!detail.draft?.contentApproved) throw new RealRequestError('REAL_NOT_APPROVED', 409)
        await realRequest({
          path: `${base}/recipients/${rid}/send-invitation`,
          method: 'POST',
          body: { requestKey: crypto.randomUUID(), draftRevision: detail.draft.revision }
        })
      } catch (e) {
        // A refusal belongs to its row; only an unexpected failure goes to the page.
        if (!(e instanceof RealRequestError) || !REFUSAL[e.code]) throw e
        // The code is kept; its words are looked up at render, in the language on screen.
        if (alive.current) setRefusals((r) => ({ ...r, [rid]: e.code }))
      }
      await loadSends()
      onSendingChanged()
    })
  }
  const items = page?.items ?? []
  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-2 p-4" data-send-summary>
        <h2 className="font-semibold">{t('invitations-real.send.title')}</h2>
        {customers ? (
          <>
            <p className="text-sm">
              {t(mailboxReady ? 'invitations-real.send.used' : 'invitations-real.send.usedNoMailbox', {
                used: sending.pilotUsed,
                max: sending.pilotMax,
                from: sending.mailbox.from ?? t('invitations-real.common.invitationsMailbox')
              })}
            </p>
            <p className="text-sm">
              {full
                ? t('invitations-real.common.pilotFull')
                : waitMs > 0
                  ? t('invitations-real.send.nextIn', { seconds: Math.ceil(waitMs / 1000) })
                  : t('invitations-real.send.nextNow')}{' '}
              {t('invitations-real.send.pacing')}{' '}
              {campaign.audience === 'past_customers'
                ? t('invitations-real.send.askPast')
                : t('invitations-real.send.askActive')}
            </p>
            <p className="text-sm" data-estimated-opens>
              {sending.opens
                ? t('invitations-real.send.opens', {
                    opened: sending.opens.opened,
                    tracked: sending.opens.tracked,
                    percent: Math.round((100 * sending.opens.opened) / sending.opens.tracked)
                  })
                : t('invitations-real.send.opensNone')}
            </p>
            {sending.groups?.length && sending.campaignId === campaign.id ? (
              <ul className="text-sm" data-group-engagement>
                {sending.groups.map((g) => (
                  <li key={g.group}>
                    {[
                      t('invitations-real.send.group.sent', {
                        group: groups.find((x) => x.key === g.group)?.label ?? g.group,
                        sent: g.sent
                      }),
                      ...(g.opens
                        ? [
                            t('invitations-real.send.group.opened', {
                              rate: rate(t, g.opens.opened, g.opens.tracked)
                            })
                          ]
                        : []),
                      g.clicks
                        ? t('invitations-real.send.group.clicked', {
                            rate: rate(t, g.clicks.clicked, g.clicks.tracked)
                          })
                        : t('invitations-real.send.group.noClicks')
                    ].join(' · ')}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm">
            {sending.pilotMissing?.length
              ? t('invitations-real.send.offMissing', { missing: andList(t, sending.pilotMissing) })
              : t('invitations-real.send.off')}
          </p>
        )}
      </Card>
      {customers ? (
        <RealQueuePanel
          campaignId={campaign.id}
          groups={groups}
          approved={page?.total ?? 0}
          busy={busy}
          run={run}
          onChanged={() => {
            void loadSends().catch(() => {})
            onSendingChanged()
          }}
        />
      ) : null}
      <Card className="gap-2 p-3">
        <p className="px-1 text-muted-foreground text-sm">
          {page
            ? page.total > items.length
              ? t('invitations-real.send.countShowing', { total: page.total, shown: items.length })
              : t('invitations-real.send.count', { total: page.total })
            : t('invitations-real.send.reading')}
        </p>
        {page && !items.length ? <p className="p-2 text-sm">{t('invitations-real.send.empty')}</p> : null}
        <ul className="flex flex-col divide-y divide-border" aria-label={t('invitations-real.send.listAria')}>
          {items.map((r) => {
            const s = invitationOf(r.id)
            const done = Boolean(s && s.state !== 'failed')
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2" data-send-row={r.id}>
                <div className="min-w-0 flex-1">
                  <span className="block break-all font-medium">{r.email}</span>
                  <span className="block text-muted-foreground text-sm">
                    {r.groupLabel}
                    {(() => {
                      const e = eligibility.get(r.id)
                      if (!e) return ` · ${t('invitations-real.send.amember.unchecked')}`
                      const when = localTime(e.checkedAt)
                      return ` · ${t(
                        e.status === 'allow'
                          ? 'invitations-real.send.amember.allow'
                          : e.status === 'none'
                            ? 'invitations-real.send.amember.none'
                            : 'invitations-real.send.amember.unknown',
                        { when }
                      )}`
                    })()}
                  </span>
                </div>
                <div className="flex min-w-48 flex-col text-sm">
                  {s ? (
                    <>
                      <span className={s.state === 'sent' ? 'font-medium' : ''}>
                        {t(SEND_STATE[s.state])} · {localTime(s.createdAt)}
                        {s.errorCode && s.state !== 'sent' ? ` · ${s.errorCode}` : ''}
                      </span>
                      {s.state === 'sent' && s.opens ? (
                        <span className="text-muted-foreground">
                          {s.opens.firstAt
                            ? t('invitations-real.common.opened', { when: localTime(s.opens.firstAt) })
                            : t('invitations-real.common.notOpened')}
                        </span>
                      ) : null}
                      {s.state === 'sent' && s.clicks ? (
                        <span className={s.clicks.firstAt ? 'font-medium' : 'text-muted-foreground'}>
                          {s.clicks.firstAt
                            ? t('invitations-real.send.clicked', { when: localTime(s.clicks.firstAt) })
                            : t('invitations-real.send.noClick')}
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-muted-foreground">{t('invitations-real.common.state.failed')}</span>
                  )}
                  {refusals[r.id] ? (
                    <span role="alert" className="text-destructive">
                      {REFUSAL[refusals[r.id]] ? t(REFUSAL[refusals[r.id]]) : refusals[r.id]}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => onReview(r.id)}>
                    {t('invitations-real.send.review')}
                  </Button>
                  {s?.state === 'send_unknown' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await realRequest({
                            path: `${base}/sends/${s.id}/reconcile`,
                            method: 'POST',
                            body: {}
                          })
                          await loadSends()
                        })
                      }
                    >
                      {t('invitations-real.common.checkGmail')}
                    </Button>
                  ) : null}
                  {customers && !done ? (
                    confirming === r.id ? (
                      <>
                        <Button size="sm" disabled={busy} onClick={() => void sendOne(r.id)}>
                          {t('invitations-real.common.confirmSendTo', { email: r.email })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => setConfirming(null)}
                        >
                          {t('invitations-real.common.cancel')}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy || full || waitMs > 0 || !mailboxReady}
                        onClick={() => setConfirming(r.id)}
                      >
                        {t('invitations-real.send.send')}
                      </Button>
                    )
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
        {page?.nextCursor ? (
          <Button variant="outline" disabled={busy} onClick={() => void run(() => loadPage(page.nextCursor))}>
            {t('invitations-real.send.next')}
          </Button>
        ) : null}
      </Card>
    </div>
  )
}
