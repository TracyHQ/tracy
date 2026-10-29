import { parseSocialUrl } from 'website-opportunities/domain/social-stats/handles.mjs'

export interface DemoUsage {
  used: number
  limit: number
  resetsAt: string
}
export interface DemoAction {
  workflow?: string
  chatMode?: string
  opportunityId?: string
  chat?: { siteKey: string; sessionId: string; href: string } | null
  id: string
  state: string
  step: string
  /** While the build waits for its photos to be labelled: how many were looked at so far. */
  photos?: { looked: number; total: number }
  error?: string | null
  acceptedAt?: string
  updatedAt?: string
}
export interface DemoChatPreparation {
  action: DemoAction
  chat: { siteKey: string; sessionId: string; href: string }
  brief: { text: string; hash: string }
  submission?: { nativeRequestId: string; state: string }
}
export interface OutreachDraft {
  contacts: Array<{ channel: string; value: string; url: string }>
  messageLanguage: { language: string; source: string; country?: string | null }
  url: string
  expiresAt: string | null
  message: { auto: string; local: string | null; english: string; subject: string }
}

export function usageFull(usage: DemoUsage | null | undefined, count = 1): boolean {
  return Boolean(usage && usage.limit > 0 && usage.used + count > usage.limit)
}

/** Channel URLs only open a compose window. No request here sends a message. */
export function composeLink(
  channel: string,
  contact: string,
  message: string,
  subject: string
): string | null {
  if (channel === 'email')
    return `mailto:${encodeURIComponent(contact)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
  if (channel === 'gmail')
    return `https://mail.google.com/mail/?${new URLSearchParams({ view: 'cm', fs: '1', to: contact, su: subject, body: message })}`
  let url: URL
  try {
    url = new URL(contact)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  if (channel === 'whatsapp') {
    if (!['wa.me', 'whatsapp.com'].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)))
      return null
    const phone = url.pathname.replace(/\D/g, '') || url.searchParams.get('phone')?.replace(/\D/g, '') || ''
    return phone ? `https://wa.me/${phone}?${new URLSearchParams({ text: message })}` : null
  }
  const hosts: Record<string, string[]> = {
    zalo: ['zalo.me'],
    messenger: ['m.me', 'messenger.com', 'facebook.com'],
    instagram: ['instagram.com', 'ig.me'],
    line: ['line.me']
  }
  if (!hosts[channel]?.some((h) => url.hostname === h || url.hostname.endsWith(`.${h}`))) return null
  if (
    channel === 'instagram' &&
    (url.hostname === 'instagram.com' || url.hostname.endsWith('.instagram.com'))
  ) {
    const profile = parseSocialUrl(url.href, { network: 'instagram' })
    if (profile?.handle) return `https://ig.me/m/${profile.handle}`
    return /^\/direct\/t\/\d+\/?$/.test(url.pathname) ? url.href : null
  }
  if (
    channel === 'messenger' &&
    (url.hostname === 'facebook.com' || url.hostname.endsWith('.facebook.com'))
  ) {
    if (/^\/messages\/t\/[a-z0-9._-]+\/?$/i.test(url.pathname)) return url.href
    const profile = parseSocialUrl(url.href, { network: 'facebook' })
    const recipient = profile?.pageId ?? profile?.pageSlug
    return recipient ? `https://m.me/${recipient}` : null
  }
  return url.href
}
