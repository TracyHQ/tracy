/**
 * The four Inbox doors of tracy-web (`apps/tracy-web/src/notifications/route.js`).
 *
 * ROOT-ABSOLUTE, NOT `dshUrl()`: like `/api/team` and `/auth/me`, these doors live at the host's
 * bare root, never under a plugin's `<base href>` mount. Every read here fails soft (null): the
 * Inbox says it could not load, it never invents rows.
 */
import { interfaceLocale } from '@tracy/core/interface-languages'

import type { InboxNotification } from './rows'

export type Filter = 'unread' | 'all'

export interface InboxPage {
  notifications: InboxNotification[]
  next: string | null
  unread: number
}

const JSON_HEADERS = { accept: 'application/json' }

/** One page of the list; `before` is the `next` of the page already shown. */
export async function readPage(filter: Filter, before: string | null): Promise<InboxPage | null> {
  const query = new URLSearchParams({ filter })
  if (before !== null) query.set('before', before)
  try {
    const res = await fetch(`/api/notifications?${query.toString()}`, {
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    })
    if (!res.ok) return null
    const body = (await res.json()) as Partial<InboxPage> | null
    if (body === null || !Array.isArray(body.notifications)) return null
    return {
      notifications: body.notifications,
      next: typeof body.next === 'string' ? body.next : null,
      unread: typeof body.unread === 'number' ? body.unread : 0
    }
  } catch {
    return null
  }
}

/**
 * The unread poll, naming the language the screen speaks right now (`?lang=`, Akemi 04/10/2026).
 * tracy-web stores it on the account, so mail someone else triggers goes out in the language this
 * person sees; the page knows it for certain, while a cookie or a browser header can be stale.
 * @param locale - `interfaceLocale()`: dsh's active language (`zh-CN` for Chinese), or undefined.
 */
export function unreadPath(locale: string | undefined): string {
  return locale ? `/api/notifications/unread?lang=${encodeURIComponent(locale)}` : '/api/notifications/unread'
}

export async function readUnread(): Promise<number | null> {
  try {
    const res = await fetch(unreadPath(interfaceLocale()), {
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    })
    if (!res.ok) return null
    const body = (await res.json()) as { unread?: unknown } | null
    return typeof body?.unread === 'number' ? body.unread : null
  } catch {
    return null
  }
}

/**
 * Answer an invitation from the Inbox: the same doors My Sites uses
 * (`POST /api/sites/:key/accept` and `/decline`). True when the server took it.
 */
export async function answerInvitation(siteKey: string, answer: 'accept' | 'decline'): Promise<boolean> {
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(siteKey)}/${answer}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    })
    return res.ok
  } catch {
    return false
  }
}

/** Mark one row read; true when the server took it. */
export async function markRead(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    })
    return res.ok
  } catch {
    return false
  }
}

export async function markAllRead(): Promise<boolean> {
  try {
    const res = await fetch('/api/notifications/read-all', {
      method: 'POST',
      headers: JSON_HEADERS,
      credentials: 'same-origin'
    })
    return res.ok
  } catch {
    return false
  }
}
