import { Button, Card, Input, Label } from '@tracy/ui'
import { useRef, useState } from 'react'
import { type CampaignView, type ImportPreview, uploadReal, realRequest, RealRequestError } from './real-api'
import { formatNumber, useT } from '../i18n'
export function RealImportPanel({
  campaign,
  busy,
  run,
  onImported
}: {
  campaign: CampaignView | null
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  onImported: (c: CampaignView) => void
}) {
  const t = useT()
  const [name, setName] = useState('Snapshot 07/10/2026')
  const [sourceDate, setDate] = useState('2026-10-07')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const requestKey = useRef(crypto.randomUUID())
  function reset() {
    setPreview(null)
    requestKey.current = crypto.randomUUID()
  }
  return (
    <Card className="gap-3 p-4">
      <h2 className="font-semibold">
        {campaign ? t('invitations-real.import.titleInto') : t('invitations-real.import.titleNew')}
      </h2>
      <p className="text-muted-foreground text-sm">{t('invitations-real.import.intro')}</p>
      <Label>
        {t('invitations-real.import.name')}
        <Input
          aria-label={t('invitations-real.import.name')}
          autoComplete="off"
          disabled={busy}
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            reset()
          }}
        />
      </Label>
      <Label>
        {t('invitations-real.import.sourceDate')}
        <Input
          aria-label={t('invitations-real.import.sourceDate')}
          type="date"
          disabled={busy}
          value={sourceDate}
          onChange={(e) => {
            setDate(e.target.value)
            reset()
          }}
        />
      </Label>
      <Label>
        {t('invitations-real.import.sourceCsv')}
        <Input
          type="file"
          accept=".csv,text/csv"
          disabled={busy}
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            reset()
          }}
        />
      </Label>
      <Button
        disabled={busy || !file || !name.trim()}
        onClick={() =>
          void run(async () => {
            if (!file || file.size > 10 * 1024 * 1024) throw new RealRequestError('REAL_UPLOAD_LIMIT', 413)
            setPreview(
              await uploadReal<ImportPreview>({
                path: '/imports/preview',
                bytes: file,
                metadata: { name, sourceDate, ...(campaign ? { campaignId: campaign.id } : {}) }
              })
            )
          })
        }
      >
        {t('invitations-real.import.previewCsv')}
      </Button>
      {preview ? (
        <div className="flex flex-col gap-2">
          <p>
            {t('invitations-real.common.counts', {
              total: formatNumber(preview.counts.total),
              blocked: preview.counts.suppressed,
              recheck: preview.counts.recheck
            })}
          </p>
          <p>{t('invitations-real.import.groups', { counts: preview.counts.groups.join(' / ') })}</p>
          {preview.issues.map((issue, i) => (
            <p key={i}>
              {t(issue.blocking ? 'invitations-real.import.issueBlocking' : 'invitations-real.import.issue', {
                row: issue.row,
                code: issue.code
              })}
            </p>
          ))}
          <p className="text-muted-foreground text-sm">{t('invitations-real.import.publishes')}</p>
          <Button
            disabled={
              busy || preview.issues.some((i) => i.blocking) || Date.now() >= Date.parse(preview.expiresAt)
            }
            onClick={() =>
              void run(async () => {
                const c = await realRequest<CampaignView>({
                  path: '/imports/commit',
                  method: 'POST',
                  body: {
                    previewId: preview.previewId,
                    digest: preview.digest,
                    revision: preview.revision,
                    requestKey: requestKey.current
                  }
                })
                setFile(null)
                reset()
                onImported(c)
              })
            }
          >
            {t('invitations-real.import.confirm')}
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
