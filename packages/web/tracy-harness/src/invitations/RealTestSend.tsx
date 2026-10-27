import { Button, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { SEND_STATE, andList, localTime } from './real-format'
import { type SendView, type SendingStatus, realRequest } from './real-api'
import { useT } from '../i18n'

/** Send this approved email to one address of the server's test list, and in pilot mode to the
 * customer it was written for. The server picks the customer's address and refuses any other test
 * address; the screen only asks. */
export function RealTestSend({
  campaignId,
  recipientId,
  customerEmail,
  draftRevision,
  approved,
  sending,
  busy,
  run,
  onSent
}: {
  campaignId: string
  recipientId: string
  customerEmail: string
  draftRevision: number
  approved: boolean
  sending: SendingStatus | null
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  onSent: () => void
}) {
  const t = useT()
  const [to, setTo] = useState(sending?.testRecipients[0] ?? '')
  const [sends, setSends] = useState<SendView[]>([])
  const [confirming, setConfirming] = useState(false)
  const alive = useRef(true)
  const base = `/campaigns/${campaignId}`
  async function load(signal?: AbortSignal) {
    const next = await realRequest<{ items: SendView[] }>({
      path: `${base}/recipients/${recipientId}/sends`,
      signal
    })
    if (alive.current && !signal?.aborted) setSends(next.items)
  }
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    setConfirming(false)
    if (sending?.mode === 'test' || sending?.mode === 'pilot') void load(controller.signal).catch(() => {})
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [campaignId, recipientId, sending?.mode])
  if (!sending) return null
  if (sending.mode !== 'test' && sending.mode !== 'pilot')
    return <p className="text-muted-foreground text-sm">{t('invitations-real.test.disabled')}</p>
  const mailboxReady = sending.mailbox.status === 'connected' && sending.mailbox.send
  const full = sending.testUsed >= sending.testDailyLimit
  const invited = sends.some((s) => s.kind === 'invitation' && s.state !== 'failed')
  const pilotFull = sending.pilotUsed >= sending.pilotMax
  const waitUntil = sending.nextInvitationAt && Date.parse(sending.nextInvitationAt) > Date.now()
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3" data-test-send>
      <h3 className="font-medium text-sm">{t('invitations-real.test.title')}</h3>
      <p className="text-muted-foreground text-sm">
        {t('invitations-real.test.intro', {
          from: sending.mailbox.from ?? t('invitations-real.common.invitationsMailbox'),
          used: sending.testUsed,
          limit: sending.testDailyLimit
        })}
      </p>
      {!approved ? <p className="text-sm">{t('invitations-real.test.approveFirst')}</p> : null}
      {!mailboxReady ? <p className="text-sm">{t('invitations-real.common.mailboxNotReady')}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label={t('invitations-real.test.addressAria')}
          value={to}
          disabled={busy}
          onChange={(e) => setTo(e.target.value)}
        >
          {sending.testRecipients.map((a) => (
            <NativeSelectOption key={a} value={a}>
              {a}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={busy || !approved || !mailboxReady || full || !to}
          onClick={() =>
            void run(async () => {
              await realRequest({
                path: `${base}/recipients/${recipientId}/send-test`,
                method: 'POST',
                body: { to, requestKey: crypto.randomUUID(), draftRevision }
              })
              await load()
              onSent()
            })
          }
        >
          {t('invitations-real.test.send')}
        </Button>
      </div>
      {sending.pilotMissing?.length ? (
        <p className="text-sm">
          {t('invitations-real.test.pilotMissing', { missing: andList(t, sending.pilotMissing) })}
        </p>
      ) : null}
      {sending.customersEnabled ? (
        <div className="flex flex-col gap-2 border-border border-t pt-2" data-customer-send>
          <h3 className="font-medium text-sm">{t('invitations-real.test.customer')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('invitations-real.test.customerIntro', {
              email: customerEmail,
              used: sending.pilotUsed,
              max: sending.pilotMax
            })}
          </p>
          {sending.opens ? (
            <p className="text-sm" data-estimated-opens>
              {t('invitations-real.test.opens', {
                opened: sending.opens.opened,
                tracked: sending.opens.tracked
              })}
            </p>
          ) : null}
          {invited ? <p className="text-sm">{t('invitations-real.test.invited')}</p> : null}
          {pilotFull ? <p className="text-sm">{t('invitations-real.test.pilotFull')}</p> : null}
          {waitUntil ? (
            <p className="text-sm">
              {t('invitations-real.test.nextAt', { when: localTime(sending.nextInvitationAt!) })}
            </p>
          ) : null}
          {confirming ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    setConfirming(false)
                    await realRequest({
                      path: `${base}/recipients/${recipientId}/send-invitation`,
                      method: 'POST',
                      body: { requestKey: crypto.randomUUID(), draftRevision }
                    })
                    await load()
                    onSent()
                  })
                }
              >
                {t('invitations-real.common.confirmSendTo', { email: customerEmail })}
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirming(false)}>
                {t('invitations-real.common.cancel')}
              </Button>
            </div>
          ) : (
            <div>
              <Button
                disabled={busy || !approved || !mailboxReady || invited || pilotFull || Boolean(waitUntil)}
                onClick={() => setConfirming(true)}
              >
                {t('invitations-real.test.customer')}
              </Button>
            </div>
          )}
        </div>
      ) : null}
      {sends.length ? (
        <ul className="flex flex-col gap-1 text-sm" aria-label={t('invitations-real.test.sendsAria')}>
          {sends.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2">
              <span className={s.state === 'sent' ? 'font-medium' : ''}>
                {t(
                  s.kind === 'invitation'
                    ? 'invitations-real.test.kindCustomer'
                    : 'invitations-real.test.kindTest',
                  {
                    state: t(SEND_STATE[s.state])
                  }
                )}
              </span>
              <span className="text-muted-foreground">
                {t('invitations-real.test.to', { to: s.to })} · {localTime(s.createdAt)}
                {s.errorCode && s.state !== 'sent' ? ` · ${s.errorCode}` : ''}
                {s.opens && s.state === 'sent'
                  ? ` · ${
                      s.opens.firstAt
                        ? t('invitations-real.common.opened', { when: localTime(s.opens.firstAt) })
                        : t('invitations-real.common.notOpened')
                    }`
                  : ''}
              </span>
              {s.state === 'send_unknown' ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await realRequest({ path: `${base}/sends/${s.id}/reconcile`, method: 'POST', body: {} })
                      await load()
                    })
                  }
                >
                  {t('invitations-real.common.checkGmail')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {sends.some((s) => s.state === 'send_unknown') ? (
        <p className="text-muted-foreground text-sm">
          {t('invitations-real.test.unknownNote', { state: t(SEND_STATE.send_unknown) })}
        </p>
      ) : null}
    </div>
  )
}
