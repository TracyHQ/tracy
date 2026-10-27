import { useRef, useState } from 'react'
import { Copy, Mail, MessageCircle, MoreHorizontal, Phone, QrCode, Share2, X } from 'lucide-react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  NativeSelect,
  NativeSelectOption,
  Textarea,
  buttonVariants
} from '@tracy/ui'
import { cn } from '@tracy/ui/cn'
import QRCode from 'qrcode'
import { WhatsappIcon } from '@tracy/ui/icons/platforms/whatsapp'
import { InstagramIcon } from '@tracy/ui/icons/platforms/instagram'
import { FacebookIcon } from '@tracy/ui/icons/platforms/facebook'
import type { OutreachDraft } from './outreach-model.ts'
import { composeLink } from './outreach-model.ts'
import type { Translate } from './strings.ts'

const CHANNEL: Record<string, string> = {
  email: 'Email',
  gmail: 'Gmail',
  phone: 'Phone',
  whatsapp: 'WhatsApp',
  zalo: 'Zalo',
  messenger: 'Messenger',
  instagram: 'Instagram',
  line: 'LINE'
}
const channelName = (t: Translate, channel: string) =>
  channel === 'phone'
    ? t('v3.phone')
    : channel === 'email'
      ? t('advanced.has.email')
      : (CHANNEL[channel] ?? channel)

function ContactIcon({ channel }: { channel: string }) {
  const Icon =
    channel === 'phone'
      ? Phone
      : channel === 'email'
        ? Mail
        : channel === 'whatsapp'
          ? WhatsappIcon
          : channel === 'instagram'
            ? InstagramIcon
            : channel === 'messenger'
              ? FacebookIcon
              : MessageCircle
  return <Icon aria-hidden="true" />
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** The complete send menu, flat inside the Inspector; all edits and language choices die on unmount. */
export function SendDemo({
  t,
  draft,
  locale,
  onClose
}: {
  t: Translate
  draft: OutreachDraft
  locale: string
  onClose: () => void
}) {
  const [mode, setMode] = useState<'auto' | 'local' | 'english'>('auto')
  const [message, setMessage] = useState(draft.message.auto)
  const [notice, setNotice] = useState<string | null>(null)
  const [manual, setManual] = useState<string | null>(null)
  const editor = useRef<HTMLDivElement>(null)
  const language =
    new Intl.DisplayNames([locale], { type: 'language' }).of(draft.messageLanguage.language) ??
    draft.messageLanguage.language
  const copy = async (text: string) => {
    const ok = await copyText(text)
    setNotice(t(ok ? 'v3.copied' : 'v3.copyManual'))
    setManual(ok ? null : text)
    if (!ok && text === message) {
      const field = editor.current?.querySelector('textarea')
      field?.focus()
      field?.select()
    }
    return ok
  }
  const send = async (channel: string, value: string) => {
    const href = composeLink(channel, value, message, draft.message.subject)
    if (!href) return
    // Open from the click itself, before awaiting clipboard permission (popup blockers).
    window.open(href, '_blank', 'noopener,noreferrer')
    if (['email', 'gmail', 'whatsapp'].includes(channel))
      setNotice(t('v3.composeOpened', { channel: channelName(t, channel) }))
    else {
      const copied = await copy(message)
      if (copied) setNotice(t('v3.chatOpened', { channel: channelName(t, channel) }))
    }
  }
  const qr = async () => {
    try {
      const link = document.createElement('a')
      link.href = await QRCode.toDataURL(draft.url, { type: 'image/png', width: 512, margin: 2 })
      link.download = 'demo-qr.png'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setNotice(t('v3.qrDownloaded'))
    } catch {
      setNotice(t('action.failed'))
    }
  }
  const share = () => {
    void navigator
      .share({ title: draft.message.subject, text: message, url: draft.url })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setNotice(t('action.failed'))
      })
  }
  const more = (full = false) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: 'outline', size: 'icon-xs' }))}
        aria-label={t(full ? 'v3.shareOptions' : 'v3.sendTo')}
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="tracy-wo-send-menu">
        {full ? (
          <>
            <DropdownMenuItem onClick={() => void copy(draft.url)}>
              <Copy aria-hidden="true" />
              {t('v3.copyLink')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void qr()}>
              <QrCode aria-hidden="true" />
              {t('v3.qrCode')}
            </DropdownMenuItem>
            {typeof navigator.share === 'function' ? (
              <DropdownMenuItem onClick={share}>
                <Share2 aria-hidden="true" />
                {t('v3.share')}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : (
          <>
            <DropdownMenuLabel>{t('v3.sendTo')}</DropdownMenuLabel>
            {draft.contacts
              .filter((c) => c.channel !== 'phone')
              .map((c) => (
                <DropdownMenuItem
                  key={c.channel + c.value}
                  onClick={() => void send(c.channel, c.channel === 'email' ? c.value : c.url)}
                >
                  {channelName(t, c.channel)}
                </DropdownMenuItem>
              ))}
            {draft.contacts
              .filter((c) => c.channel === 'email')
              .map((c) => (
                <DropdownMenuItem key={'gmail' + c.value} onClick={() => void send('gmail', c.value)}>
                  {CHANNEL.gmail}
                </DropdownMenuItem>
              ))}
            {draft.contacts.every((c) => c.channel === 'phone') ? (
              <DropdownMenuItem onClick={() => void copy(`${draft.url}\n\n${message}`)}>
                {t('v3.copyBoth')}
              </DropdownMenuItem>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  return (
    <section className="tracy-wo-send" data-wo-send aria-label={t('v3.sendDemo')}>
      <div className="tracy-wo-between tracy-wo-row">
        <h3 className="tracy-wo-h3">{t('v3.sendDemo')}</h3>
        <div className="tracy-wo-row">
          {more(true)}
          <Button size="icon-xs" variant="ghost" aria-label={t('results.map.close')} onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </div>
      <p className="tracy-wo-muted">
        {t(draft.message.local ? 'v3.languageNote' : 'v3.englishNote', { language })}
      </p>
      <span className="tracy-wo-label">{t('v3.contacts')}</span>
      <div className="tracy-wo-send-contacts">
        {draft.contacts.map((c) => (
          <button
            type="button"
            key={c.channel + c.value}
            className="tracy-wo-send-contact"
            onClick={() => void copy(c.value)}
          >
            <ContactIcon channel={c.channel} />
            <span>
              <b>{channelName(t, c.channel)}</b>
              <span className="tracy-wo-muted">{c.value}</span>
            </span>
            <Copy aria-hidden="true" />
          </button>
        ))}
        {!draft.contacts.length ? <p className="tracy-wo-muted">{t('v3.noContacts')}</p> : null}
      </div>
      {draft.message.local ? (
        <label className="tracy-wo-row">
          <span className="tracy-wo-label">{t('v3.language')}</span>
          <NativeSelect
            value={mode}
            onChange={(e) => {
              const value = e.target.value as 'auto' | 'local' | 'english'
              setMode(value)
              setMessage(draft.message[value] ?? draft.message.english)
              setNotice(null)
              setManual(null)
            }}
          >
            <NativeSelectOption value="auto">{t('v3.languageAuto', { language })}</NativeSelectOption>
            <NativeSelectOption value="local">{language}</NativeSelectOption>
            <NativeSelectOption value="english">
              {new Intl.DisplayNames([locale], { type: 'language' }).of('en')}
            </NativeSelectOption>
          </NativeSelect>
        </label>
      ) : null}
      <div className="tracy-wo-row tracy-wo-between">
        <span className="tracy-wo-label">{t('v3.message')}</span>
        <span className="tracy-wo-muted tracy-wo-small">{t('v3.editOnce')}</span>
      </div>
      <div ref={editor} className="tracy-wo-message-editor">
        <div className="tracy-wo-message-tools">
          <Button variant="outline" size="xs" onClick={() => void copy(message)}>
            <Copy aria-hidden="true" />
            {t('v3.copy')}
          </Button>
          {more()}
        </div>
        <Textarea
          aria-label={t('v3.message')}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={12}
        />
      </div>
      {notice ? (
        <p className="tracy-wo-muted" role="status">
          {notice}
        </p>
      ) : null}
      {manual && manual !== message ? (
        <Textarea
          aria-label={t('v3.copyManual')}
          readOnly
          value={manual}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
      <p className="tracy-wo-muted tracy-wo-small">{t('v3.nothingSent')}</p>
    </section>
  )
}

export function MessageCell({
  t,
  draft,
  onOpen
}: {
  t: Translate
  draft: OutreachDraft | null | undefined
  onOpen: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [failed, setFailed] = useState(false)
  if (!draft) return <span className="tracy-wo-muted">—</span>
  return (
    <div className="tracy-wo-message-cell" onClick={(e) => e.stopPropagation()}>
      <span className="tracy-wo-muted tracy-wo-small">
        {draft.message.local ? `${draft.messageLanguage.language.toUpperCase()} + EN` : 'EN'}
      </span>
      <p className="tracy-wo-message-line">{draft.message.auto.split('\n')[0]}</p>
      <div className="tracy-wo-row">
        <Button
          variant="outline"
          size="xs"
          onClick={() =>
            void copyText(draft.message.auto).then((ok) => {
              setCopied(ok)
              setFailed(!ok)
            })
          }
        >
          <Copy aria-hidden="true" />
          {t(copied ? 'v3.copied' : 'v3.copy')}
        </Button>
        <Button variant="outline" size="icon-xs" aria-label={t('v3.sendDemo')} onClick={onOpen}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </div>
      {failed ? (
        <>
          <p className="tracy-wo-muted" role="status">
            {t('v3.copyManual')}
          </p>
          <Textarea
            readOnly
            aria-label={t('v3.message')}
            value={draft.message.auto}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      ) : null}
    </div>
  )
}
