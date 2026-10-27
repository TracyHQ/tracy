import { Badge, Button, Card, Input, Label, Textarea } from '@tracy/ui'
import { useState } from 'react'
import { HtmlPreview } from './HtmlPreview'
import { RealTestSend } from './RealTestSend'
import { contentStatusLabel } from './real-format'
import { useT } from '../i18n'
import type { RecipientDetail, RealWrite, Registry, SendingStatus } from './real-api'
export function RealReviewPanel({
  recipient,
  campaignId,
  onError,
  registry,
  busy,
  onDirty,
  write,
  onSaved,
  onOpenTemplates,
  onPrevious,
  onNext,
  editing,
  onEditing,
  sending = null,
  run,
  onSendingChanged
}: {
  recipient: RecipientDetail
  campaignId: string
  onError: (e: unknown) => void
  registry: Registry | null
  busy: boolean
  onDirty: (dirty: boolean) => void
  write: RealWrite
  onSaved: () => Promise<void>
  onOpenTemplates: () => void
  onPrevious: (() => void) | null
  onNext: (() => void) | null
  // Held by the workspace so a refresh after saving keeps the editor open.
  editing: boolean
  onEditing: (editing: boolean) => void
  // Test sending (server list only); absent in stories and while it loads.
  sending?: SendingStatus | null
  run?: (work: () => Promise<void>) => Promise<boolean>
  onSendingChanged?: () => void
}) {
  const t = useT()
  const d = recipient.draft
  const [subject, setSubject] = useState(d?.subject ?? '')
  const [html, setHtml] = useState(d?.html ?? '')
  const [text, setText] = useState(d?.bodyText ?? '')
  const [values, setValues] = useState(recipient.values)
  const valuesDirty = JSON.stringify(values) !== JSON.stringify(recipient.values)
  const dirty = Boolean(d && (subject !== d.subject || html !== d.html || text !== d.bodyText))
  function edit(field: 'subject' | 'html' | 'text', value: string) {
    const next = { subject, html, text, [field]: value }
    if (field === 'subject') setSubject(value)
    if (field === 'html') setHtml(value)
    if (field === 'text') setText(value)
    onDirty(
      valuesDirty ||
        Boolean(d && (next.subject !== d.subject || next.html !== d.html || next.text !== d.bodyText))
    )
  }
  function cancel() {
    setSubject(d?.subject ?? '')
    setHtml(d?.html ?? '')
    setText(d?.bodyText ?? '')
    onEditing(false)
    onDirty(valuesDirty)
  }
  const status = !d ? 'not_created' : d.contentApproved ? 'approved' : d.stale ? 'needs_review' : 'draft'
  const manualFields = registry?.fields.filter((f) => f.source.kind === 'manual' && f.key !== 'group') ?? []
  const manual = manualFields.length ? (
    <details className="rounded-md border border-border p-3">
      <summary className="cursor-pointer font-medium text-sm">
        {t('invitations-real.review.manualSummary')}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-muted-foreground text-sm">{t('invitations-real.review.manualHint')}</p>
        {manualFields.map((f) => (
          <Label key={f.key}>
            {f.label}
            <Input
              aria-label={t('invitations-real.review.valueAria', { key: f.key })}
              autoComplete="off"
              disabled={busy}
              value={values[f.key] ?? ''}
              onChange={(e) => {
                const next = { ...values }
                if (e.target.value) next[f.key] = e.target.value
                else delete next[f.key]
                setValues(next)
                onDirty(dirty || JSON.stringify(next) !== JSON.stringify(recipient.values))
              }}
            />
          </Label>
        ))}
        <Button
          variant="outline"
          disabled={busy || !valuesDirty || dirty}
          onClick={() =>
            void write(`/recipients/${recipient.id}/fields`, { values }, async () => {
              await onSaved()
              onDirty(false)
            }).catch(() => {})
          }
        >
          {t('invitations-real.review.saveValues')}
        </Button>
      </div>
    </details>
  ) : null
  const navigation = (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={busy || !onPrevious} onClick={() => onPrevious?.()}>
        {t('invitations-real.review.previous')}
      </Button>
      <Button variant="outline" size="sm" disabled={busy || !onNext} onClick={() => onNext?.()}>
        {t('invitations-real.review.next')}
      </Button>
    </div>
  )
  return (
    <Card className="gap-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-all font-semibold">{recipient.email}</h2>
          <p className="text-muted-foreground text-sm">{recipient.groupLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={status === 'approved' ? 'default' : 'secondary'}>
            {contentStatusLabel(t, status)}
          </Badge>
          {navigation}
        </div>
      </div>
      {!d ? (
        <div className="flex flex-col gap-3">
          <p>{t('invitations-real.review.noDraft', { group: recipient.groupLabel })}</p>
          <div>
            <Button disabled={busy} onClick={onOpenTemplates}>
              {t('invitations-real.review.openTemplates')}
            </Button>
          </div>
          {manual}
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t('invitations-real.review.template')}</dt>
            <dd>
              {d.reviewedTemplateVersion !== d.templateVersion
                ? t('invitations-real.review.versionReviewed', {
                    version: d.templateVersion,
                    reviewed: d.reviewedTemplateVersion
                  })
                : `v${d.templateVersion}`}
            </dd>
            <dt className="text-muted-foreground">{t('invitations-real.review.customized')}</dt>
            <dd>
              {d.customized ? t('invitations-real.review.yes') : t('invitations-real.review.generated')}
            </dd>
            <dt className="text-muted-foreground">{t('invitations-real.common.sourceState')}</dt>
            <dd>
              {recipient.state}
              {recipient.reasons.length ? ` · ${recipient.reasons.join(' · ')}` : ''}
            </dd>
            <dt className="text-muted-foreground">{t('invitations-real.review.sending')}</dt>
            <dd>{t('invitations-real.review.sendingDisabled')}</dd>
          </dl>
          {d.stale && d.invalidationReason ? (
            <p className="text-sm" role="status">
              {t('invitations-real.review.changed', { reason: d.invalidationReason })}
            </p>
          ) : null}
          {editing ? (
            <div className="flex flex-col gap-3">
              <Label>
                {t('invitations-real.common.subject')}
                <Input
                  aria-label={t('invitations-real.review.subjectAria')}
                  autoComplete="off"
                  disabled={busy}
                  value={subject}
                  onChange={(e) => edit('subject', e.target.value)}
                />
              </Label>
              <Label>
                {t('invitations-real.common.html')}
                <Textarea
                  aria-label={t('invitations-real.review.htmlAria')}
                  disabled={busy}
                  value={html}
                  onInput={(e) => edit('html', e.currentTarget.value)}
                />
              </Label>
              <Label>
                {t('invitations-real.review.textFallback')}
                <Textarea
                  aria-label={t('invitations-real.review.textAria')}
                  disabled={busy}
                  value={text}
                  onInput={(e) => edit('text', e.currentTarget.value)}
                />
              </Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || !dirty || valuesDirty || !subject.trim()}
                  onClick={() =>
                    void write(
                      `/recipients/${recipient.id}/draft`,
                      { subject, html, text, draftRevision: d.revision },
                      async () => {
                        await onSaved()
                        onDirty(false)
                      }
                    ).catch(() => {})
                  }
                >
                  {t('invitations-real.review.save')}
                </Button>
                <Button variant="outline" disabled={busy} onClick={cancel}>
                  {t('invitations-real.common.cancel')}
                </Button>
              </div>
              {dirty ? <p className="text-sm">{t('invitations-real.review.unsaved')}</p> : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-2 border-border border-t pt-3">
            <p className="text-sm">
              <span className="text-muted-foreground">{t('invitations-real.review.to')} </span>
              {recipient.email}
            </p>
            <p>
              <span className="text-muted-foreground">{t('invitations-real.common.subjectPrefix')} </span>
              <strong>{d.subject}</strong>
            </p>
            <HtmlPreview html={d.html} assets={d.assets} campaignId={campaignId} onError={onError} />
          </div>
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <Button variant="outline" disabled={busy} onClick={() => onEditing(true)}>
                {t('invitations-real.review.edit')}
              </Button>
            ) : null}
            <Button
              disabled={busy || dirty || valuesDirty || d.contentApproved}
              onClick={() =>
                // Move on only after the write has finished, so loading the next email is not refused
                // as a second concurrent request.
                void write(`/recipients/${recipient.id}/approve`, { draftRevision: d.revision }, onSaved)
                  .then(() => onNext?.())
                  .catch(() => {})
              }
            >
              {d.contentApproved
                ? t('invitations-real.format.status.approved')
                : t('invitations-real.review.approveNext')}
            </Button>
          </div>
          {run ? (
            <RealTestSend
              campaignId={campaignId}
              recipientId={recipient.id}
              customerEmail={recipient.email}
              draftRevision={d.revision}
              approved={d.contentApproved && !dirty}
              sending={sending}
              busy={busy}
              run={run}
              onSent={() => onSendingChanged?.()}
            />
          ) : null}
          {manual}
        </>
      )}
    </Card>
  )
}
