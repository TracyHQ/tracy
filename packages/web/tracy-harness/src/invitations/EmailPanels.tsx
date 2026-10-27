import { Badge, Button, Card, Input, Label, Textarea } from '@tracy/ui'
import { useEffect, useState } from 'react'
import { formatDateTime, useT } from '../i18n'
import type { InvitationsKey } from '../i18n/ns/invitations'
import type { Recipient } from './api'
import { draftActions } from './review-state'

interface SharedProps {
  recipient: Recipient
  writable: boolean
  busy: boolean
  onDirty: (dirty: boolean) => void
}

export function ReviewPanel({
  recipient,
  writable,
  busy,
  onDirty,
  onSave,
  onApprove
}: SharedProps & {
  onSave: (subject: string, body: string) => Promise<void>
  onApprove: () => Promise<void>
}) {
  const t = useT()
  const [subject, setSubject] = useState(recipient.draft?.subject ?? '')
  const [body, setBody] = useState(recipient.draft?.bodyText ?? '')
  const changed = subject !== (recipient.draft?.subject ?? '') || body !== (recipient.draft?.bodyText ?? '')
  const actions = draftActions(recipient, subject, body, writable, busy)
  useEffect(() => {
    onDirty(changed)
  }, [changed, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  return (
    <Card className="min-w-0 gap-4 p-4" data-invitations-review>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="break-all font-semibold">{recipient.email}</h3>
        <Badge variant="outline">{recipient.state}</Badge>
      </div>
      <p className="text-muted-foreground text-sm">
        {recipient.group} ·{' '}
        {recipient.draft?.templateVersion
          ? t('invitations.review.templateVersion', { version: recipient.draft.templateVersion })
          : t('invitations.review.noTemplateVersion')}{' '}
        · {t('invitations.review.emailRevision', { revision: recipient.draft?.revision ?? '—' })}
      </p>
      {recipient.draft ? (
        <>
          <div className="grid gap-2">
            <Label htmlFor="draft-subject">{t('invitations.reason.subject')}</Label>
            <Input
              id="draft-subject"
              value={subject}
              maxLength={200}
              disabled={!actions.editable}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="draft-body">{t('invitations.review.body')}</Label>
            <Textarea
              id="draft-body"
              className="min-h-72"
              value={body}
              maxLength={16000}
              disabled={!actions.editable}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <p className="text-muted-foreground text-sm">{t('invitations.review.customizeNote')}</p>
          {changed ? <Badge variant="secondary">{t('invitations.reason.unsaved')}</Badge> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid content-start gap-2">
              <Button
                aria-describedby="draft-save-reason"
                disabled={Boolean(actions.saveReason)}
                onClick={() => void onSave(subject, body).catch(() => {})}
              >
                {t('invitations.review.save')}
              </Button>
              <p id="draft-save-reason" className="text-muted-foreground text-sm">
                {t(actions.saveReason || 'invitations.review.saveHint')}
              </p>
            </div>
            <div className="grid content-start gap-2">
              <Button
                variant="outline"
                aria-describedby="draft-approve-reason"
                disabled={Boolean(actions.approveReason)}
                onClick={() => void onApprove().catch(() => {})}
              >
                {t('invitations.review.approve')}
              </Button>
              <p id="draft-approve-reason" className="text-muted-foreground text-sm">
                {t(actions.approveReason || 'invitations.review.approveHint')}
              </p>
            </div>
          </div>
        </>
      ) : (
        <p>{t('invitations.review.noDraft')}</p>
      )}
    </Card>
  )
}

export function ConversationPanel({
  recipient,
  writable,
  busy,
  onDirty,
  onMessage
}: SharedProps & {
  onMessage: (body: string, direction: string) => Promise<void>
}) {
  const t = useT()
  const [message, setMessage] = useState('')
  useEffect(() => {
    onDirty(Boolean(message))
  }, [message, onDirty])
  useEffect(() => () => onDirty(false), [onDirty])
  const common: InvitationsKey | '' = busy
    ? 'invitations.reason.busy'
    : !writable
      ? 'invitations.reason.ownerRequired'
      : !message.trim()
        ? 'invitations.conversation.writeFirst'
        : ''
  const replyReason: InvitationsKey | '' =
    recipient.state === 'suppressed'
      ? 'invitations.conversation.replySuppressed'
      : !recipient.attempts.some((a) => a.state === 'simulated')
        ? 'invitations.conversation.replyNeedsSimulation'
        : common
  return (
    <Card className="min-w-0 gap-4 p-4" data-invitations-conversation>
      <div>
        <h3 className="break-all font-semibold">{recipient.email}</h3>
        <p className="text-muted-foreground text-sm">{t('invitations.conversation.note')}</p>
      </div>
      <div className="grid max-h-96 gap-3 overflow-auto">
        {recipient.messages.map((m) => (
          <article key={m.id} className="rounded-lg border p-3">
            <p className="mb-2 text-muted-foreground text-xs">
              {t(
                m.direction === 'inbound'
                  ? 'invitations.conversation.received'
                  : 'invitations.conversation.sent'
              )}{' '}
              · {formatDateTime(m.createdAt)}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">{m.bodyText}</p>
          </article>
        ))}
      </div>
      <Label htmlFor="sandbox-message">{t('invitations.conversation.compose')}</Label>
      <Textarea
        id="sandbox-message"
        className="min-h-32"
        value={message}
        maxLength={16000}
        disabled={!writable || busy}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('invitations.conversation.placeholder')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Button
            variant="outline"
            disabled={Boolean(common)}
            aria-describedby="inbound-reason"
            onClick={() => void onMessage(message, 'inbound').catch(() => {})}
          >
            {t('invitations.conversation.simulateInbound')}
          </Button>
          <p id="inbound-reason" className="text-muted-foreground text-sm">
            {t(common || 'invitations.conversation.inboundHint')}
          </p>
        </div>
        <div className="grid content-start gap-2">
          <Button
            disabled={Boolean(replyReason)}
            aria-describedby="reply-reason"
            onClick={() => void onMessage(message, 'outbound').catch(() => {})}
          >
            {t('invitations.conversation.simulateReply')}
          </Button>
          <p id="reply-reason" className="text-muted-foreground text-sm">
            {t(replyReason || 'invitations.conversation.replyHint')}
          </p>
        </div>
      </div>
    </Card>
  )
}
