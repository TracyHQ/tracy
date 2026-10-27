import { Button, Card, Input, Label, NativeSelect, NativeSelectOption, Textarea } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { HtmlPreview } from './HtmlPreview'
import { draftProgress, templateNotes } from './real-format'
import { tr, useT } from '../i18n'
import {
  type CampaignView,
  type Page,
  type RecipientSummary,
  type Rendered,
  type TemplatePreview,
  type TemplateView,
  type RealWrite,
  RealRequestError,
  realRequest,
  uploadReal
} from './real-api'
export function RealContentPanel({
  campaign,
  groups,
  busy,
  run,
  write,
  onDirty,
  onError,
  onConfigure
}: {
  campaign: CampaignView
  groups: { key: string; label: string }[]
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  write: RealWrite
  onDirty: (v: boolean) => void
  onError: (e: unknown) => void
  onConfigure: () => void
}) {
  const t = useT()
  const [group, setGroup] = useState('group_1'),
    [subject, setSubject] = useState('')
  const [template, setTemplate] = useState<TemplateView | null>(null)
  const [html, setHtml] = useState(''),
    [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<TemplatePreview | null>(null)
  const [recipients, setRecipients] = useState<RecipientSummary[]>([]),
    [selected, setSelected] = useState('')
  const [rendered, setRendered] = useState<Rendered | null>(null)
  const [replaceCursor, setReplaceCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false),
    [notice, setNotice] = useState('')
  const [progress, setProgress] = useState<{ total: number; drafted: number } | null>(null)
  const requestKey = useRef(crypto.randomUUID()),
    alive = useRef(true),
    generation = useRef(0),
    edits = useRef(0)
  const dirty = Boolean(
    file ||
      subject !== (template?.subject ?? '') ||
      html !== (template?.html ?? '') ||
      text !== (template?.text ?? '')
  )
  async function reload(signal?: AbortSignal) {
    const gen = generation.current,
      editRevision = edits.current
    const next = await realRequest<TemplateView | null>({
      path: `/campaigns/${campaign.id}/templates/${group}`,
      signal
    })
    if (!alive.current || signal?.aborted || gen !== generation.current || editRevision !== edits.current)
      return
    setTemplate(next)
    setSubject(next?.subject ?? '')
    setHtml(next?.html ?? '')
    setText(next?.text ?? '')
    onDirty(false)
  }
  useEffect(() => {
    alive.current = true
    generation.current++
    const controller = new AbortController()
    setLoading(true)
    setPreview(null)
    setRendered(null)
    setReplaceCursor(null)
    setNotice('')
    setRecipients([])
    setSelected('')
    setProgress(null)
    void Promise.all([
      reload(controller.signal),
      loadProgress(controller.signal),
      realRequest<Page<RecipientSummary>>({
        path: `/campaigns/${campaign.id}/recipients/query`,
        method: 'POST',
        body: { group, limit: 100 },
        signal: controller.signal
      }).then((p) => {
        if (!controller.signal.aborted) setRecipients(p.items)
      })
    ])
      .catch((e) => {
        if (!controller.signal.aborted) onError(e)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      alive.current = false
      generation.current++
      controller.abort()
    }
  }, [campaign.id, group])
  async function loadProgress(signal?: AbortSignal) {
    const next = await realRequest<{ groups: { key: string; total: number; drafted: number }[] }>({
      path: `/campaigns/${campaign.id}/drafts/progress`,
      signal
    })
    if (alive.current && !signal?.aborted) setProgress(next?.groups?.find((g) => g.key === group) ?? null)
  }
  // Each page only reads recipients that still lack a draft, so pages are pressed in a loop here
  // until the group is done, instead of asking the operator to press once per hundred.
  async function generateMissing() {
    let next: string | null = null,
      created = 0
    do {
      const r = await write('/generate', { group, cursor: next, limit: 100, replaceExisting: false })
      created += Number(r.created ?? 0)
      next = (r.nextCursor as string | null) ?? null
      if (alive.current)
        setProgress({ total: Number(r.groupTotal ?? 0), drafted: Number(r.groupDrafted ?? 0) })
    } while (next && alive.current)
    // Read at the end of a long loop, so in the language on screen then.
    setNotice(tr('invitations-real.content.created', { created }))
  }
  function edit(field: 'subject' | 'html' | 'text', value: string) {
    edits.current++
    const next = { subject, html, text, [field]: value }
    if (field === 'subject') setSubject(value)
    if (field === 'html') setHtml(value)
    if (field === 'text') setText(value)
    onDirty(
      Boolean(
        file ||
          next.subject !== (template?.subject ?? '') ||
          next.html !== (template?.html ?? '') ||
          next.text !== (template?.text ?? '')
      )
    )
    setPreview(null)
    setRendered(null)
    requestKey.current = crypto.randomUUID()
  }
  const blocked = busy || loading
  return (
    <Card className="gap-3 p-4">
      <h2 className="font-semibold">{t('invitations-real.content.title')}</h2>
      <NativeSelect
        aria-label={t('invitations-real.content.groupAria')}
        value={group}
        disabled={blocked}
        onChange={(e) => {
          if (blocked) return
          if (!dirty || window.confirm(t('invitations-real.content.confirmDiscard'))) {
            onDirty(false)
            setGroup(e.target.value)
            setFile(null)
          }
        }}
      >
        {groups.map((g) => (
          <NativeSelectOption key={g.key} value={g.key}>
            {g.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <p>
        {template
          ? t('invitations-real.content.savedVersion', { version: template.version })
          : t('invitations-real.content.noTemplate')}{' '}
        {t('invitations-real.content.limits')}
      </p>
      {template ? (
        <p className="text-muted-foreground text-sm" data-template-replace-hint>
          {t('invitations-real.content.replaceHint', { version: template.version + 1 })}
        </p>
      ) : null}
      <Label>
        {t('invitations-real.common.subject')}
        <Input
          aria-label={t('invitations-real.content.subjectAria')}
          autoComplete="off"
          disabled={blocked}
          value={subject}
          placeholder={t('invitations-real.content.subjectPlaceholder')}
          onChange={(e) => edit('subject', e.target.value)}
        />
      </Label>
      {!subject.trim() ? (
        <p className="text-muted-foreground text-sm">{t('invitations-real.content.subjectFirst')}</p>
      ) : null}
      <Label>
        {t('invitations-real.content.zip')}
        <Input
          type="file"
          accept=".zip,application/zip"
          disabled={blocked}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null
            setFile(next)
            onDirty(
              Boolean(next) ||
                subject !== (template?.subject ?? '') ||
                html !== (template?.html ?? '') ||
                text !== (template?.text ?? '')
            )
            setPreview(null)
            requestKey.current = crypto.randomUUID()
          }}
        />
      </Label>
      <Button
        disabled={blocked || !file || !subject.trim()}
        onClick={() =>
          void run(async () => {
            if (!file || file.size > 10 * 1024 * 1024) throw new RealRequestError('REAL_UPLOAD_LIMIT', 413)
            const value = await uploadReal<TemplatePreview>({
              path: `/campaigns/${campaign.id}/templates/preview`,
              bytes: file,
              metadata: { group, subject, revision: campaign.revision, requestKey: requestKey.current }
            })
            if (alive.current) setPreview(value)
          })
        }
      >
        {t('invitations-real.content.previewZip')}
      </Button>
      {preview ? (
        <div className="flex flex-col gap-2">
          <p>{t('invitations-real.content.previewOnly')}</p>
          {templateNotes(t, preview.warnings, preview.removed).map((w, i) => (
            <p key={i}>{w}</p>
          ))}
          {preview.unknownTokens.length ? (
            <>
              <p>
                {t('invitations-real.content.unknownFields', { fields: preview.unknownTokens.join(', ') })}
              </p>
              <Button variant="outline" disabled={blocked} onClick={onConfigure}>
                {t('invitations-real.content.configureUnknown')}
              </Button>
            </>
          ) : null}
          <p>
            <span className="text-muted-foreground">{t('invitations-real.common.subjectPrefix')} </span>
            <strong>{subject}</strong>
          </p>
          <HtmlPreview
            html={preview.preview.html}
            assets={preview.preview.assets}
            campaignId={campaign.id}
            onError={onError}
          />
          <p className="text-muted-foreground text-sm">{t('invitations-real.content.cleaned')}</p>
          <Button
            disabled={
              blocked || preview.unknownTokens.length > 0 || Date.now() >= Date.parse(preview.expiresAt)
            }
            onClick={() =>
              void write(
                '/templates/commit',
                { uploadId: preview.uploadId, requestKey: requestKey.current },
                async () => {
                  setPreview(null)
                  setFile(null)
                  await reload()
                }
              ).catch(() => {})
            }
          >
            {t('invitations-real.content.confirm')}
          </Button>
        </div>
      ) : null}
      {template ? (
        <>
          <Label>
            {t('invitations-real.content.savedHtml')}
            <Textarea
              aria-label={t('invitations-real.content.htmlAria')}
              disabled={blocked}
              value={html}
              onInput={(e) => edit('html', e.currentTarget.value)}
            />
          </Label>
          <Label>
            {t('invitations-real.content.textFallback')}
            <Textarea
              aria-label={t('invitations-real.content.textAria')}
              disabled={blocked}
              value={text}
              onInput={(e) => edit('text', e.currentTarget.value)}
            />
          </Label>
          <Button
            disabled={blocked || !dirty || !subject.trim()}
            onClick={() =>
              void write(
                '/templates/edit',
                {
                  group,
                  subject,
                  html,
                  text: text || null,
                  assetIds: template.assets.map((a) => a.id),
                  requestKey: requestKey.current
                },
                async () => {
                  await reload()
                  setReplaceCursor(null)
                }
              ).catch(() => {})
            }
          >
            {t('invitations-real.content.saveVersion')}
          </Button>
          <NativeSelect
            aria-label={t('invitations-real.content.recipientAria')}
            value={selected}
            disabled={blocked}
            onChange={(e) => {
              setSelected(e.target.value)
              setRendered(null)
            }}
          >
            <NativeSelectOption value="">{t('invitations-real.content.chooseRecipient')}</NativeSelectOption>
            {recipients.map((r) => (
              <NativeSelectOption value={r.id} key={r.id}>
                {r.email}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            disabled={blocked || dirty || !selected}
            onClick={() =>
              void run(async () => {
                const value = await realRequest<Rendered>({
                  path: `/campaigns/${campaign.id}/content-preview`,
                  method: 'POST',
                  body: { group, recipientId: selected, revision: campaign.revision }
                })
                if (alive.current) setRendered(value)
              })
            }
          >
            {t('invitations-real.content.previewSaved')}
          </Button>
          {rendered ? (
            <div className="flex flex-col gap-2">
              <p>
                <span className="text-muted-foreground">{t('invitations-real.common.subjectPrefix')} </span>
                <strong>{rendered.subject}</strong>
              </p>
              <HtmlPreview
                html={rendered.html}
                assets={rendered.assets}
                campaignId={campaign.id}
                onError={onError}
              />
              <pre className="whitespace-pre-wrap break-words">{rendered.bodyText}</pre>
            </div>
          ) : null}
          {progress ? <p role="status">{draftProgress(t, progress)}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={blocked || dirty || (progress !== null && progress.drafted >= progress.total)}
              onClick={() => {
                setReplaceCursor(null)
                setNotice('')
                void generateMissing().catch(() => {})
              }}
            >
              {t('invitations-real.content.generate')}
            </Button>
            <Button
              variant="outline"
              disabled={blocked || dirty}
              onClick={() => {
                if (window.confirm(t('invitations-real.content.confirmReplace')))
                  void write('/generate', { group, cursor: replaceCursor, limit: 100, replaceExisting: true })
                    .then((r) => {
                      setReplaceCursor(r.nextCursor as string | null)
                      setProgress({ total: Number(r.groupTotal ?? 0), drafted: Number(r.groupDrafted ?? 0) })
                      setNotice(
                        tr(
                          r.nextCursor
                            ? 'invitations-real.content.replacedNext'
                            : 'invitations-real.content.replacedDone',
                          { created: String(r.created) }
                        )
                      )
                    })
                    .catch(() => {})
              }}
            >
              {replaceCursor
                ? t('invitations-real.content.continueReplace')
                : t('invitations-real.content.replaceFirst')}
            </Button>
          </div>
        </>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
    </Card>
  )
}
