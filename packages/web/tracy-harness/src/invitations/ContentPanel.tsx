import { Badge, Button, Card, cn, Input, Label, NativeSelect, NativeSelectOption, Textarea } from '@tracy/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useT } from '../i18n'
import type { Campaign } from './api'
import { activeTemplate, contentSummary, TEMPLATE_TOKENS, templateErrors } from './content-state'

interface ContentPanelProps {
  campaign: Campaign
  groups: { key: string; label: string }[]
  writable: boolean
  busy: boolean
  onDirty: (dirty: boolean) => void
  onSave: (group: string, subject: string, bodyText: string) => Promise<void>
  onPreview: (
    group: string,
    recipientId: string
  ) => Promise<{
    subject: string
    bodyText: string
    templateVersion: number
    group: string
  }>
  onGenerate: (group?: string, replaceExisting?: boolean) => Promise<void>
}

export function ContentPanel(props: ContentPanelProps) {
  const t = useT()
  const { campaign, groups, onDirty } = props
  const [selected, setSelected] = useState(groups[0]?.key ?? '')
  const [dirty, setDirty] = useState(false)
  const group = groups.some((row) => row.key === selected) ? selected : (groups[0]?.key ?? '')
  const reportDirty = useCallback(
    (value: boolean) => {
      setDirty(value)
      onDirty(value)
    },
    [onDirty]
  )
  if (!groups.length)
    return <p className="text-muted-foreground text-sm">{t('invitations.content.noGroups')}</p>
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-lg">{t('invitations.tab.content')}</h2>
        <p className="text-muted-foreground text-sm">{t('invitations.content.intro')}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <div className="space-y-2" aria-label={t('invitations.content.groupsLabel')}>
          {groups.map((row) => {
            const summary = contentSummary(campaign, row.key)
            const template = activeTemplate(campaign, row.key)
            return (
              <button
                key={row.key}
                type="button"
                aria-pressed={group === row.key}
                disabled={props.busy}
                className={cn(
                  'w-full rounded-lg border border-border bg-card p-4 text-left text-card-foreground focus-visible:border-ring',
                  group === row.key && 'border-primary'
                )}
                onClick={() => {
                  if (
                    row.key === group ||
                    (dirty && !window.confirm(t('invitations.content.confirmChangeGroup')))
                  )
                    return
                  reportDirty(false)
                  setSelected(row.key)
                }}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{row.label}</span>
                  <Badge variant="secondary">
                    {template ? `v${template.version}` : t('invitations.content.noTemplate')}
                  </Badge>
                </span>
                <span className="mt-2 block text-muted-foreground text-xs">
                  {t('invitations.content.groupRecipients', { count: summary.recipients })} ·{' '}
                  {t('invitations.content.groupDrafts', { count: summary.drafts })} ·{' '}
                  {t('invitations.content.groupApproved', { count: summary.approved })}
                </span>
              </button>
            )
          })}
        </div>
        <TemplateEditor key={`${campaign.id}:${group}`} {...props} group={group} onDirty={reportDirty} />
      </div>
    </div>
  )
}

function TemplateEditor({
  campaign,
  groups,
  group,
  writable,
  busy,
  onDirty,
  onSave,
  onPreview,
  onGenerate
}: ContentPanelProps & { group: string }) {
  const t = useT()
  const template = activeTemplate(campaign, group)
  const [saved, setSaved] = useState({ subject: template?.subject ?? '', bodyText: template?.bodyText ?? '' })
  const [subject, setSubject] = useState(saved.subject)
  const [bodyText, setBodyText] = useState(saved.bodyText)
  const [recipientId, setRecipientId] = useState('')
  const [preview, setPreview] = useState<Awaited<ReturnType<ContentPanelProps['onPreview']>> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [replacement, setReplacement] = useState<number | null>(null)
  const dirty = subject !== saved.subject || bodyText !== saved.bodyText
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const id = useId()
  const recipients = campaign.recipients?.filter((row) => row.group === group) ?? []
  const summary = contentSummary(campaign, group)
  const errors = templateErrors(subject, bodyText)
  const locked = busy || pending
  const selection = recipients.find((row) => row.id === recipientId)
  const previewContext = JSON.stringify([
    campaign.id,
    campaign.revision,
    group,
    template?.version,
    recipientId
  ])
  const currentPreviewContext = useRef(previewContext)
  currentPreviewContext.current = previewContext
  const previewRequest = useRef(0)
  const saveReason = !writable
    ? t('invitations.reason.readOnly')
    : locked
      ? t('invitations.reason.busy')
      : Object.keys(errors).length
        ? t('invitations.content.fixFields')
        : !dirty
          ? t('invitations.reason.noChanges')
          : ''
  const discardReason = locked
    ? t('invitations.reason.busy')
    : !dirty
      ? t('invitations.content.noDiscard')
      : ''
  const readyGroups = groups.filter((row) => contentSummary(campaign, row.key).missing > 0)
  const allMissing = readyGroups.reduce((sum, row) => sum + contentSummary(campaign, row.key).missing, 0)
  const missingTemplate = readyGroups.some((row) => !activeTemplate(campaign, row.key))
  const generationReason = !writable
    ? t('invitations.reason.readOnly')
    : dirty
      ? t('invitations.content.saveBeforeGenerate')
      : !template
        ? t('invitations.content.saveTemplateFirst')
        : ''

  useEffect(() => {
    onDirty(dirty)
  }, [dirty, onDirty])
  useEffect(() => {
    if (!dirtyRef.current) {
      const next = { subject: template?.subject ?? '', bodyText: template?.bodyText ?? '' }
      setSaved(next)
      setSubject(next.subject)
      setBodyText(next.bodyText)
    }
    setPreview(null)
  }, [template?.version, template?.subject, template?.bodyText])
  useEffect(() => {
    setReplacement(null)
  }, [campaign.revision])
  useEffect(
    () => () => {
      previewRequest.current += 1
    },
    []
  )
  useEffect(() => {
    setPreview(null)
  }, [previewContext])

  async function perform(action: () => Promise<void>) {
    if (locked) return
    setPending(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('invitations.content.actionFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className="min-w-0 gap-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{groups.find((row) => row.key === group)?.label}</h3>
        <Badge variant="outline">
          {dirty
            ? t('invitations.reason.unsaved')
            : template
              ? t('invitations.content.savedVersion', { version: template.version })
              : t('invitations.content.newTemplate')}
        </Badge>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-subject`}>{t('invitations.reason.subject')}</Label>
        <Input
          id={`${id}-subject`}
          value={subject}
          disabled={!writable || locked}
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? `${id}-subject-error` : undefined}
          onChange={(event) => {
            setSubject(event.target.value)
            setPreview(null)
          }}
        />
        {errors.subject && (
          <p id={`${id}-subject-error`} className="text-destructive text-sm">
            {t(errors.subject, TEMPLATE_TOKENS)}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-body`}>{t('invitations.content.body')}</Label>
        <Textarea
          id={`${id}-body`}
          rows={10}
          value={bodyText}
          disabled={!writable || locked}
          aria-invalid={!!errors.bodyText}
          aria-describedby={`${id}-tokens${errors.bodyText ? ` ${id}-body-error` : ''}`}
          onChange={(event) => {
            setBodyText(event.target.value)
            setPreview(null)
          }}
        />
        <p id={`${id}-tokens`} className="text-muted-foreground text-xs">
          {t('invitations.content.tokens', TEMPLATE_TOKENS)}
        </p>
        {errors.bodyText && (
          <p id={`${id}-body-error`} className="text-destructive text-sm">
            {t(errors.bodyText, TEMPLATE_TOKENS)}
          </p>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <Button
            disabled={!!saveReason}
            aria-describedby={saveReason ? `${id}-save-reason` : undefined}
            onClick={() =>
              perform(async () => {
                await onSave(group, subject, bodyText)
                setSaved({ subject, bodyText })
                onDirty(false)
                setPreview(null)
                setNotice(t('invitations.content.saved'))
              })
            }
          >
            {t('invitations.content.saveVersion')}
          </Button>
          {saveReason && (
            <p id={`${id}-save-reason`} className="text-muted-foreground text-sm">
              {saveReason}
            </p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <Button
            variant="outline"
            disabled={!!discardReason}
            aria-describedby={discardReason ? `${id}-discard-reason` : undefined}
            onClick={() => {
              setSubject(saved.subject)
              setBodyText(saved.bodyText)
              setPreview(null)
              setError('')
            }}
          >
            {t('invitations.content.discard')}
          </Button>
          {discardReason && (
            <p id={`${id}-discard-reason`} className="text-muted-foreground text-sm">
              {discardReason}
            </p>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      <section className="space-y-3 border-t pt-4" aria-label={t('invitations.content.previewLabel')}>
        <Label htmlFor={`${id}-recipient`}>{t('invitations.content.previewRecipient')}</Label>
        <NativeSelect
          id={`${id}-recipient`}
          className="w-full"
          value={recipientId}
          disabled={locked || !recipients.length}
          onChange={(event) => {
            setRecipientId(event.target.value)
            setPreview(null)
          }}
        >
          <NativeSelectOption value="">{t('invitations.content.chooseRecipient')}</NativeSelectOption>
          {recipients.map((row) => (
            <NativeSelectOption key={row.id} value={row.id}>
              {row.firstName || t('invitations.content.noFirstName')} · {row.email}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button
          variant="outline"
          disabled={locked || dirty || !template || !selection}
          onClick={() =>
            perform(async () => {
              const request = ++previewRequest.current
              const context = previewContext
              let result: Awaited<ReturnType<typeof onPreview>>
              try {
                result = await onPreview(group, recipientId)
              } catch (reason) {
                if (request !== previewRequest.current || context !== currentPreviewContext.current) return
                throw reason
              }
              if (
                request !== previewRequest.current ||
                context !== currentPreviewContext.current ||
                dirtyRef.current
              )
                return
              if (result.group !== group) throw new Error(t('invitations.content.previewGroupMismatch'))
              if (result.templateVersion !== template?.version) {
                setNotice(t('invitations.content.previewStale'))
                return
              }
              setPreview(result)
            })
          }
        >
          {t('invitations.content.previewSaved')}
        </Button>
        {!recipients.length ? (
          <p className="text-muted-foreground text-xs">{t('invitations.content.previewNeedsRecipients')}</p>
        ) : dirty ? (
          <p className="text-muted-foreground text-xs">{t('invitations.content.previewNeedsSave')}</p>
        ) : !template ? (
          <p className="text-muted-foreground text-xs">{t('invitations.content.previewNeedsTemplate')}</p>
        ) : (
          !selection && (
            <p className="text-muted-foreground text-xs">{t('invitations.content.previewChoose')}</p>
          )
        )}
        {preview && (
          <div className="space-y-2 rounded-lg border bg-muted p-4">
            <p className="text-muted-foreground text-xs">
              {t('invitations.content.previewHeader', { version: preview.templateVersion })}
            </p>
            <p className="break-words font-medium">{preview.subject}</p>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm">{preview.bodyText}</pre>
          </div>
        )}
      </section>
      <section className="space-y-3 border-t pt-4" aria-label={t('invitations.generate.title')}>
        <h4 className="font-medium">{t('invitations.generate.title')}</h4>
        <p className="text-muted-foreground text-sm">
          {t('invitations.generate.thisGroup', {
            missing: t('invitations.generate.missing', {
              count: summary.missing,
              source: template ? `v${template.version}` : t('invitations.generate.noSavedTemplate')
            }),
            kept: t('invitations.generate.kept', { count: summary.drafts }),
            blocked: t('invitations.generate.blocked', { count: summary.skipped })
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={locked || !!generationReason || summary.missing === 0}
            onClick={() => perform(() => onGenerate(group, false))}
          >
            {t('invitations.generate.missingButton')}
          </Button>
          <Button
            variant="outline"
            disabled={locked || !writable || dirty || !allMissing || missingTemplate}
            onClick={() => perform(() => onGenerate(undefined, false))}
          >
            {t('invitations.generate.allButton')}
          </Button>
        </div>
        {generationReason && <p className="text-muted-foreground text-xs">{generationReason}</p>}
        {!summary.missing && (
          <p className="text-muted-foreground text-xs">{t('invitations.generate.noneMissing')}</p>
        )}
        <p className="text-muted-foreground text-xs">
          {t('invitations.generate.allGroups', { count: allMissing })}{' '}
          {readyGroups
            .map((row) => {
              const active = activeTemplate(campaign, row.key)
              return t('invitations.generate.groupLine', {
                group: row.label,
                count: contentSummary(campaign, row.key).missing,
                source: active ? `v${active.version}` : t('invitations.generate.noTemplateInline')
              })
            })
            .join(' · ')}
        </p>
        {missingTemplate && (
          <p className="text-muted-foreground text-xs">{t('invitations.generate.needAllTemplates')}</p>
        )}
        <Button
          variant="outline"
          disabled={locked || !!generationReason || !summary.replaceable}
          onClick={() => setReplacement(campaign.revision)}
        >
          {t('invitations.generate.regenerate')}
        </Button>
        {replacement === campaign.revision && (
          <div className="space-y-3 rounded-lg border border-destructive p-4">
            <p className="text-sm">
              {t('invitations.replace.question', {
                existing: t('invitations.replace.existing', { count: summary.replaceable }),
                version: template?.version ?? '',
                missing: t('invitations.replace.missing', { count: summary.missing })
              })}{' '}
              {t('invitations.replace.approvals', { count: summary.approvalsReset })}{' '}
              {t('invitations.replace.editsReplaced')}
            </p>
            <p className="text-muted-foreground text-xs">
              {t('invitations.replace.versions', {
                versions: summary.versions.length
                  ? summary.versions.map((version) => `v${version}`).join(', ')
                  : t('invitations.replace.notRecorded')
              })}{' '}
              {t('invitations.replace.excluded', { count: summary.skipped })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                disabled={locked || !!generationReason}
                onClick={() =>
                  perform(async () => {
                    await onGenerate(group, true)
                    setReplacement(null)
                  })
                }
              >
                {t('invitations.replace.confirm')}
              </Button>
              <Button variant="outline" disabled={locked} onClick={() => setReplacement(null)}>
                {t('invitations.replace.cancel')}
              </Button>
            </div>
          </div>
        )}
      </section>
    </Card>
  )
}
