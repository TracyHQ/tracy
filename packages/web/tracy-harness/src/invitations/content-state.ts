import type { InvitationsKey } from '../i18n/ns/invitations'
import type { Campaign } from './api'

export function activeTemplate(campaign: Campaign, group: string) {
  const content = campaign.content?.find((row) => row.group === group)
  return content?.versions.find((version) => version.version === content.activeVersion)
}

export function contentSummary(campaign: Campaign, group: string) {
  const recipients = campaign.recipients?.filter((row) => row.group === group) ?? []
  const eligible = recipients.filter((row) => ['ready', 'draft'].includes(row.state) && !row.attempts?.length)
  const existing = eligible.filter((row) => row.draft)
  return {
    recipients: recipients.length,
    drafts: recipients.filter((row) => row.draft).length,
    approved: recipients.filter((row) => row.draft?.approved).length,
    missing: eligible.filter((row) => !row.draft).length,
    replaceable: existing.length,
    approvalsReset: existing.filter((row) => row.draft?.approved).length,
    skipped: recipients.length - eligible.length,
    versions: [
      ...new Set(existing.flatMap((row) => (row.draft?.templateVersion ? [row.draft.templateVersion] : [])))
    ].sort((a, b) => a - b)
  }
}

export function templateErrors(subject: string, bodyText: string) {
  // Values are dictionary keys; the screen translates them with TEMPLATE_TOKENS.
  const errors: { subject?: InvitationsKey; bodyText?: InvitationsKey } = {}
  for (const [field, value] of Object.entries({ subject, bodyText })) {
    const key = field as keyof typeof errors
    if (!value.trim())
      errors[key] =
        field === 'subject' ? 'invitations.template.subjectRequired' : 'invitations.template.bodyRequired'
    else if (/\{\{|\}\}/.test(value.replace(/\{\{(?:first_name|group)\}\}/g, ''))) {
      errors[key] = 'invitations.template.tokensOnly'
    } else if (
      /https?:\/\/(?!invitations\.invalid(?:[/\s]|$))/i.test(value) ||
      (value.includes('@') &&
        [...value.matchAll(/[\w.!#$%&'*+\-/=?^`{|}~]+@([\w.-]+)/gi)].some(
          (match) => !/\.(?:test|invalid)$/i.test(match[1].replace(/\.$/, ''))
        ))
    ) {
      errors[key] = 'invitations.template.syntheticOnly'
    }
  }
  if (/[\p{Cc}\u2028\u2029]/u.test(subject)) {
    errors.subject = 'invitations.template.subjectOneLine'
  }
  if (subject.length > 200) errors.subject = 'invitations.template.subjectMax'
  if (bodyText.length > 16000) errors.bodyText = 'invitations.template.bodyMax'
  return errors
}

/** Parameters for the keys that name the supported tokens. */
export const TEMPLATE_TOKENS = { firstName: '{{first_name}}', group: '{{group}}' } as const
