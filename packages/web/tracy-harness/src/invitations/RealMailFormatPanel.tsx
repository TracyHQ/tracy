import { Button, Card, NativeSelect, NativeSelectOption } from '@tracy/ui'
import { useEffect, useRef, useState } from 'react'
import { realRequest } from './real-api'
import { useT } from '../i18n'

export interface MailFormat {
  oneClickHeader: boolean
  footer: 'notice' | 'personal'
  messageIdDomain: 'tracy' | 'sender'
  html: 'full' | 'simple'
  openImage: boolean
  clickTracking: boolean
}

/** Setup › Email format: how every real send (test and customer) is packaged. Read at the moment
 * of each send. The defaults follow the spec; the switches exist to keep mail out of Promotions. */
export function RealMailFormatPanel({
  busy,
  run
}: {
  busy: boolean
  run: (work: () => Promise<void>) => Promise<boolean>
}) {
  const t = useT()
  const [saved, setSaved] = useState<MailFormat | null>(null)
  const [value, setValue] = useState<MailFormat | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    void realRequest<MailFormat>({ path: '/mail-format', signal: controller.signal })
      .then((v) => {
        if (alive.current) {
          setSaved(v)
          setValue(v)
        }
      })
      .catch(() => {})
    return () => {
      alive.current = false
      controller.abort()
    }
  }, [])
  if (!value || !saved) return <p>{t('invitations-real.mail.reading')}</p>
  const changed = JSON.stringify(value) !== JSON.stringify(saved)
  const set = <K extends keyof MailFormat>(key: K, v: MailFormat[K]) =>
    setValue((current) => (current ? { ...current, [key]: v } : current))
  return (
    <Card className="gap-3 p-4" data-mail-format>
      <h2 className="font-semibold">{t('invitations-real.mail.title')}</h2>
      <p className="text-muted-foreground text-sm">{t('invitations-real.mail.intro')}</p>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.mail.oneClick')}
        <NativeSelect
          aria-label={t('invitations-real.mail.oneClick')}
          value={value.oneClickHeader ? 'on' : 'off'}
          disabled={busy}
          onChange={(e) => set('oneClickHeader', e.target.value === 'on')}
        >
          <NativeSelectOption value="on">{t('invitations-real.mail.oneClick.on')}</NativeSelectOption>
          <NativeSelectOption value="off">{t('invitations-real.mail.oneClick.off')}</NativeSelectOption>
        </NativeSelect>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.mail.footer')}
        <NativeSelect
          aria-label={t('invitations-real.mail.footer')}
          value={value.footer}
          disabled={busy}
          onChange={(e) => set('footer', e.target.value as MailFormat['footer'])}
        >
          <NativeSelectOption value="notice">{t('invitations-real.mail.footer.notice')}</NativeSelectOption>
          <NativeSelectOption value="personal">
            {t('invitations-real.mail.footer.personal')}
          </NativeSelectOption>
        </NativeSelect>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.mail.messageId')}
        <NativeSelect
          aria-label={t('invitations-real.mail.messageId')}
          value={value.messageIdDomain}
          disabled={busy}
          onChange={(e) => set('messageIdDomain', e.target.value as MailFormat['messageIdDomain'])}
        >
          <NativeSelectOption value="tracy">{t('invitations-real.mail.messageId.tracy')}</NativeSelectOption>
          <NativeSelectOption value="sender">
            {t('invitations-real.mail.messageId.sender')}
          </NativeSelectOption>
        </NativeSelect>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.common.html')}
        <NativeSelect
          aria-label={t('invitations-real.common.html')}
          value={value.html}
          disabled={busy}
          onChange={(e) => set('html', e.target.value as MailFormat['html'])}
        >
          <NativeSelectOption value="full">{t('invitations-real.mail.html.full')}</NativeSelectOption>
          <NativeSelectOption value="simple">{t('invitations-real.mail.html.simple')}</NativeSelectOption>
        </NativeSelect>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.mail.openImage')}
        <NativeSelect
          aria-label={t('invitations-real.mail.openImage')}
          value={value.openImage ? 'on' : 'off'}
          disabled={busy}
          onChange={(e) => set('openImage', e.target.value === 'on')}
        >
          <NativeSelectOption value="on">{t('invitations-real.mail.openImage.on')}</NativeSelectOption>
          <NativeSelectOption value="off">{t('invitations-real.mail.openImage.off')}</NativeSelectOption>
        </NativeSelect>
      </label>
      <label className="flex flex-wrap items-center gap-2 text-sm">
        {t('invitations-real.mail.clicks')}
        <NativeSelect
          aria-label={t('invitations-real.mail.clicks')}
          value={value.clickTracking ? 'on' : 'off'}
          disabled={busy}
          onChange={(e) => set('clickTracking', e.target.value === 'on')}
        >
          <NativeSelectOption value="off">{t('invitations-real.mail.clicks.off')}</NativeSelectOption>
          <NativeSelectOption value="on">{t('invitations-real.mail.clicks.on')}</NativeSelectOption>
        </NativeSelect>
      </label>
      {value.clickTracking && !saved.clickTracking ? (
        <p className="text-sm" role="note">
          {t('invitations-real.mail.clicksNote')}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          disabled={busy || !changed}
          onClick={() =>
            void run(async () => {
              const next = await realRequest<MailFormat>({
                path: '/mail-format',
                method: 'POST',
                body: value
              })
              if (alive.current) {
                setSaved(next)
                setValue(next)
              }
            })
          }
        >
          {t('invitations-real.mail.save')}
        </Button>
        <Button variant="outline" disabled={busy || !changed} onClick={() => setValue(saved)}>
          {t('invitations-real.mail.discard')}
        </Button>
      </div>
    </Card>
  )
}
