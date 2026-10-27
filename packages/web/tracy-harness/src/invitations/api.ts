import { tr } from '../i18n'

export interface Draft {
  subject: string
  bodyText: string
  revision: number
  contentHash: string
  approved: boolean
  templateGroup?: string
  templateVersion?: number
}
export interface Recipient {
  id: string
  email: string
  group: string
  state: string
  firstName: string
  draft: Draft | null
  messages: { id: string; direction: string; bodyText: string; createdAt: string }[]
  attempts: { id: string; state: string }[]
}
export interface Campaign {
  id: string
  name: string
  revision: number
  counts: Record<string, number>
  content?: {
    group: string
    activeVersion: number
    versions: { version: number; subject: string; bodyText: string; createdAt: string }[]
  }[]
  recipients?: Recipient[]
  audit?: { action: string; createdAt: string }[]
}
export interface Overview {
  enabled: boolean
  mode: string
  writable: boolean
  groups: { key: string; label: string }[]
  campaigns: Campaign[]
  integrations: { gmail: string; amember: string; sendy: string }
}
export interface GmailStatus {
  status: string
  configured: boolean
  address: string | null
  from: string | null
  read: boolean
  send: boolean
  generation: number
  lastVerifiedAt: string | null
  lastSyncAt: string | null
  errorCode: string | null
  redirectUri: string
  sendingEnabled: boolean
}
export interface Preview {
  id?: string
  readOnly?: boolean
  mapping?: Record<string, string>
  ignoredColumns?: string[]
  digest: string
  counts: Record<string, number>
  candidates: { normalizedEmail: string; sourceGroup: string; state: string }[]
  issues: { row: number; code: string }[]
}
const BASE = '/api/ops/invitations'
export async function request<T>(path = '', body?: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'same-origin',
    ...(body
      ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : {})
  })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error(data?.code ?? tr('invitations.request.failedStatus', { status: response.status }))
  return data as T
}
/** Reserved domains, identifiers and names: this fixture contains no customer data. */
export function sampleCsv() {
  const rows = ['email,source_member_id,group_key,first_name,global_unsubscribed,internal']
  for (let i = 1; i <= 12; i++) {
    rows.push(
      `sandbox-${i}@invitations.test,sandbox-${i},group_${((i - 1) % 5) + 1},Sandbox ${i},${i === 11 ? '1' : '0'},0`
    )
  }
  return rows.join('\n')
}
