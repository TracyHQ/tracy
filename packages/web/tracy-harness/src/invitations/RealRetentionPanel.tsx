import { Button, Card, Input, Label } from '@tracy/ui'
import { useEffect, useState } from 'react'
import { type CampaignView, type RealWrite, realRequest } from './real-api'
import { useT } from '../i18n'
export function RealRetentionPanel({
  campaign,
  write,
  onExtended,
  busy,
  run,
  onError,
  onDirty
}: {
  campaign: CampaignView | null
  write: RealWrite
  onExtended: (expiresAt: string) => void
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
  onError: (e: unknown) => void
  onDirty: (v: boolean) => void
}) {
  const t = useT()
  const [saved, setSaved] = useState<number | null>(null),
    [days, setDays] = useState('')
  const [extension, setExtension] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    void realRequest<{ days: number }>({ path: '/settings', signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setSaved(value.days)
          setDays(String(value.days))
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) onError(e)
      })
    return () => controller.abort()
  }, [])
  const n = Number(days),
    valid = Number.isSafeInteger(n) && n >= 1 && n <= 365
  const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(extension) ? `${extension}T23:59:59.999Z` : ''
  const validExtension = Boolean(
    campaign &&
      expiresAt &&
      Date.parse(expiresAt) > Date.parse(campaign.expiresAt) &&
      Date.parse(expiresAt) <= Date.parse(campaign.firstImportedAt) + 365 * 86400000
  )
  return (
    <Card className="gap-3 p-4">
      <h2 className="font-semibold">{t('invitations-real.retention.title')}</h2>
      <p>{t('invitations-real.retention.intro')}</p>
      <Label>
        {t('invitations-real.retention.days')}
        <Input
          aria-label={t('invitations-real.retention.daysAria')}
          type="number"
          min={1}
          max={365}
          disabled={busy || saved === null}
          value={days}
          onChange={(e) => {
            setDays(e.target.value)
            onDirty(e.target.value !== String(saved) || Boolean(extension))
          }}
        />
      </Label>
      <Button
        disabled={busy || saved === null || !valid || n === saved}
        onClick={() =>
          void run(async () => {
            const next = await realRequest<{ days: number }>({
              path: '/settings',
              method: 'POST',
              body: { days: n }
            })
            setSaved(next.days)
            setDays(String(next.days))
            onDirty(Boolean(extension))
          })
        }
      >
        {t('invitations-real.retention.save')}
      </Button>
      {campaign ? (
        <>
          <h3 className="font-semibold">{t('invitations-real.retention.extensionTitle')}</h3>
          <p>{t('invitations-real.retention.extensionIntro', { expiresAt: campaign.expiresAt })}</p>
          <Label>
            {t('invitations-real.retention.newDate')}
            <Input
              aria-label={t('invitations-real.retention.dateAria')}
              type="date"
              disabled={busy}
              value={extension}
              onInput={(e) => {
                setExtension(e.currentTarget.value)
                onDirty(Boolean(e.currentTarget.value) || days !== String(saved))
              }}
            />
          </Label>
          <Button
            variant="outline"
            disabled={busy || !validExtension}
            onClick={() => {
              if (window.confirm(t('invitations-real.retention.confirmExtend', { expiresAt })))
                void write('/extend', { expiresAt, confirm: true })
                  .then(() => {
                    onExtended(expiresAt)
                    setExtension('')
                    onDirty(days !== String(saved))
                  })
                  .catch(() => {})
            }}
          >
            {t('invitations-real.retention.extend')}
          </Button>
        </>
      ) : null}
      <p className="text-muted-foreground text-sm">{t('invitations-real.retention.footer')}</p>
    </Card>
  )
}
