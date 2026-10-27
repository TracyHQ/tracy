import { MailIcon, PhoneIcon } from 'lucide-react'

import { WhatsappMark } from '../brand-icons.tsx'
import type { ChatApp, PlaceRow, Translate } from '../types.ts'

/** Product names, shown as written. */
const APP_NAME: Record<ChatApp, string> = {
  zalo: 'Zalo',
  whatsapp: 'WhatsApp',
  messenger: 'Messenger',
  line: 'LINE'
}
const APP_BASE: Partial<Record<ChatApp, string>> = { zalo: 'https://zalo.me/', whatsapp: 'https://wa.me/' }

/** A chat link as given, or a bare number turned into the app's own chat link. */
function chatHref(app: ChatApp, value: string): string | null {
  if (/^https?:\/\//i.test(value)) return value
  const digits = value.replace(/\D/g, '')
  const base = APP_BASE[app]
  return base && digits ? base + digits : null
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

/** tel: and mailto: links; a chat chip only for an app the place has a link for. */
export function ContactCell({ t, row }: { t: Translate; row: PlaceRow }) {
  const chats = (Object.keys(APP_NAME) as ChatApp[]).flatMap((app) => {
    const value = row.contacts?.[app]
    const href = value ? chatHref(app, value) : null
    return href ? [{ app, href }] : []
  })
  const chips = chats.map(({ app, href }) => (
    <a
      key={app}
      className="tracy-wo-chat"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={t('cell.contact.chat', { app: APP_NAME[app] })}
      aria-label={t('cell.contact.chat', { app: APP_NAME[app] })}
    >
      {app === 'whatsapp' ? (
        <WhatsappMark className="tracy-wo-glyph-sm" aria-hidden />
      ) : (
        <span className="tracy-wo-chat-name">{APP_NAME[app]}</span>
      )}
    </a>
  ))
  if (!row.phone && !row.email && !chips.length)
    return <span className="tracy-wo-muted">{t('cell.contact.none')}</span>
  return (
    <div className="tracy-wo-contact">
      {row.phone ? (
        <span className="tracy-wo-contact-line">
          <a href={telHref(row.phone)} title={t('cell.contact.call', { phone: row.phone })}>
            <PhoneIcon aria-hidden />
            <span>{row.phone}</span>
          </a>
          {chips}
        </span>
      ) : chips.length ? (
        <span className="tracy-wo-contact-line">{chips}</span>
      ) : null}
      {row.email ? (
        <span className="tracy-wo-contact-line">
          <a href={`mailto:${row.email}`} title={t('cell.contact.email', { email: row.email })}>
            <MailIcon aria-hidden />
            <span>{row.email}</span>
          </a>
        </span>
      ) : null}
    </div>
  )
}
