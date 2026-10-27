// Plain-language text for what the real campaign doors return, kept apart from the panels so it can
// be tested without a browser. Each helper takes the screen's `t` so it follows the language on screen.
import { formatDateTime } from '../i18n/format.ts'
import type { T } from '../i18n'
import type { SendView } from './real-api'

export interface Removed {
  item: string
  count: number
}

export function templateNotes(t: T, warnings: string[], removed: Removed[] = []): string[] {
  return warnings.map((w) => {
    if (w === 'ZIP_METADATA_IGNORED') return t('invitations-real.format.notes.zipMetadata')
    if (w === 'HTML_CONTENT_REMOVED')
      return removed.length
        ? t('invitations-real.format.notes.htmlRemovedItems', {
            items: removed.map((r) => (r.count > 1 ? `${r.item} (${r.count})` : r.item)).join(', ')
          })
        : t('invitations-real.format.notes.htmlRemoved')
    return w
  })
}

export function localTime(iso: string, locale?: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  return formatDateTime(time, 'medium', { lang: locale })
}

/** Content review states the server knows, in the order the review filter lists them. */
export const CONTENT_STATUSES = ['not_created', 'draft', 'needs_review', 'approved'] as const

const CONTENT_STATUS_KEYS: Record<string, string> = {
  not_created: 'invitations-real.format.status.notCreated',
  draft: 'invitations-real.format.status.draft',
  needs_review: 'invitations-real.format.status.needsReview',
  approved: 'invitations-real.format.status.approved'
}

/** A known state in words; an unknown one as the server sent it. */
export function contentStatusLabel(t: T, status: string): string {
  const key = CONTENT_STATUS_KEYS[status]
  return key ? t(key) : status
}

export function draftProgress(t: T, p: { total: number; drafted: number }): string {
  if (!p.total) return t('invitations-real.format.progress.none')
  return p.drafted >= p.total
    ? t('invitations-real.format.progress.all', { total: p.total })
    : t('invitations-real.format.progress.some', { drafted: p.drafted, total: p.total })
}

/** Items joined with the language's "and", as the server's lists of missing settings read. */
export function andList(t: T, items: readonly string[]): string {
  return items.length ? items.reduce((first, last) => t('invitations-real.common.and', { first, last })) : ''
}

/** A send's state, as a dictionary key. */
export const SEND_STATE: Record<SendView['state'], string> = {
  sending: 'invitations-real.common.state.sending',
  sent: 'invitations-real.common.state.sent',
  failed: 'invitations-real.common.state.failed',
  send_unknown: 'invitations-real.common.state.sendUnknown'
}
