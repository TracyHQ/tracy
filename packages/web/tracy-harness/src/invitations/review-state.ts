import type { InvitationsKey } from '../i18n/ns/invitations'
import type { Recipient } from './api'

/** Reasons are dictionary keys (empty when allowed); the screen translates them. */
type Reason = InvitationsKey | ''

export function draftActions(r: Recipient, subject: string, body: string, writable: boolean, busy: boolean) {
  const blocked: Reason =
    r.state === 'suppressed'
      ? 'invitations.review.blockedSuppressed'
      : r.attempts.length || ['simulated', 'sent', 'send_unknown'].includes(r.state)
        ? 'invitations.review.blockedAttempted'
        : r.state !== 'draft' || !r.draft
          ? 'invitations.review.blockedNoDraft'
          : !writable
            ? 'invitations.reason.ownerRequired'
            : busy
              ? 'invitations.reason.busy'
              : ''
  const changed = subject !== r.draft?.subject || body !== r.draft?.bodyText
  const invalid: Reason =
    !subject.trim() || !body.trim()
      ? 'invitations.review.invalidEmpty'
      : [...subject].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
        ? 'invitations.review.invalidSubject'
        : subject.length > 200 || body.length > 16000
          ? 'invitations.review.invalidLength'
          : ''
  const saveReason: Reason = blocked || invalid || (!changed ? 'invitations.reason.noChanges' : '')
  const approveReason: Reason =
    blocked ||
    invalid ||
    (changed ? 'invitations.review.saveFirst' : r.draft?.approved ? 'invitations.review.alreadyApproved' : '')
  return {
    editable: !blocked,
    saveReason,
    approveReason
  }
}
export function visibleRecipients(
  rows: Recipient[],
  view: string,
  group: string,
  status: string,
  search: string
) {
  return rows.filter(
    (r) =>
      (!group || r.group === group) &&
      (!search || r.email.toLowerCase().includes(search.toLowerCase())) &&
      (view !== 'review' || r.draft) &&
      (view !== 'conversations' || r.messages.length) &&
      (!status ||
        (status === 'needs_review'
          ? r.state === 'draft' && !r.draft?.approved
          : status === 'approved'
            ? r.state === 'draft' && r.draft?.approved
            : r.state === status))
  )
}
export function simulationReason(
  rows: Recipient[],
  writable: boolean,
  busy: boolean,
  dirty: boolean
): Reason {
  if (dirty) return 'invitations.review.simulateDirty'
  if (busy) return 'invitations.reason.busy'
  if (!writable) return 'invitations.reason.ownerRequired'
  if (!rows.some((r) => r.state === 'draft' && r.draft?.approved && !r.attempts.length))
    return 'invitations.review.simulateNoApproved'
  return ''
}
