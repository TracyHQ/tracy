export interface RealCounts {
  total: number
  groups: number[]
  suppressed: number
  recheck: number
}
export interface CampaignView {
  id: string
  name?: string
  revision: number
  sourceDate: string
  firstImportedAt: string
  expiresAt: string
  expired?: boolean
  counts: RealCounts
  sendingEnabled: false
  eligibleNow: null
  unavailable?: string
  /** The campaign's own groups (its CSV values, renamed in settings); absent on aggregate rows. */
  groups?: { key: string; label: string }[]
  /** Who it sends to: active_plan (default) or past_customers. */
  audience?: RealAudience
}
export type RealAudience = 'active_plan' | 'past_customers'
export interface RealOverview {
  enabled: boolean
  writable: boolean
  sendingEnabled: false
  groups: { key: string; label: string }[]
  campaigns: CampaignView[]
}
export interface Page<T> {
  items: T[]
  nextCursor: string | null
  revision: number
  total: number
}
export interface RecipientSummary {
  id: string
  email: string
  firstName: string
  group: string
  groupLabel: string
  state: string
  contentStatus: string
  reasons: string[]
}
export interface AssetRef {
  id: string
  path: string
  sha256: string
  mediaType: string
  width: number
  height: number
  frames: number
}
export interface Rendered {
  subject: string
  html: string
  bodyText: string
  assets: AssetRef[]
}
export interface DraftView extends Rendered {
  revision: number
  templateVersion: number
  reviewedTemplateVersion: number
  customized: boolean
  contentApproved: boolean
  stale: boolean
  invalidationReason?: string | null
}
export interface RecipientDetail extends RecipientSummary {
  rawSource: { headers: string[]; values: string[] }
  values: Record<string, string>
  draft: DraftView | null
}
export interface Field {
  key: string
  label: string
  source: { kind: 'manual' | 'column'; column?: string }
  missing: 'required' | 'default' | 'omit'
  defaultValue?: string
}
export interface Registry {
  revision: number
  fields: Field[]
  campaignValues: Record<string, string>
  groupValues: Record<string, Record<string, string>>
}
export interface TemplateView {
  version: number
  subject: string
  html: string
  text: string | null
  assets: AssetRef[]
}
export interface ImportPreview {
  previewId: string
  digest: string
  revision: number
  counts: RealCounts
  issues: { row: number; code: string; blocking: boolean }[]
  expiresAt: string
}
export interface TemplatePreview {
  uploadId: string
  warnings: string[]
  removed?: { item: string; count: number }[]
  unknownTokens: string[]
  preview: { html: string; text: string | null; assets: AssetRef[] }
  expiresAt: string
}
export class RealRequestError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}
const BASE = '/api/ops/invitations/real'
export async function realResponse(response: Response) {
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new RealRequestError(
      typeof data?.code === 'string' && /^REAL_[A-Z0-9_]+$/.test(data.code) ? data.code : 'REAL_UNAVAILABLE',
      response.status
    )
  return data
}
export async function realRequest<T>({
  path = '',
  method = 'GET',
  body,
  signal
}: {
  path?: string
  method?: string
  body?: unknown
  signal?: AbortSignal
} = {}): Promise<T> {
  return realResponse(
    await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      ...(body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    })
  ) as Promise<T>
}
export async function uploadReal<T>({
  path,
  bytes,
  metadata,
  signal
}: {
  path: string
  bytes: Blob | ArrayBuffer | Uint8Array
  metadata: object
  signal?: AbortSignal
}): Promise<T> {
  const header = encodeURIComponent(JSON.stringify(metadata))
  if (header.length > 4096) throw new RealRequestError('REAL_METADATA_LIMIT', 413)
  return realResponse(
    await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      headers: { 'content-type': 'application/octet-stream', 'x-invitations-input': header },
      body: bytes as BodyInit
    })
  ) as Promise<T>
}
export type RealWrite = (
  path: string,
  body: object,
  refresh?: () => Promise<void>
) => Promise<{ revision: number; [key: string]: unknown }>

export interface SendingStatus {
  /** The campaign the per-group numbers belong to; null for the server-wide status. */
  campaignId?: string | null
  mode: 'off' | 'test' | 'pilot'
  testRecipients: string[]
  testDailyLimit: number
  testUsed: number
  pilotMax: number
  pilotUsed: number
  nextInvitationAt: string | null
  mailbox: { status: string; address: string | null; from: string | null; send: boolean }
  customersEnabled: boolean
  pilotMissing?: string[]
  /** Estimated opens of confirmed customer invitations; null = not measured. */
  opens?: { tracked: number; opened: number } | null
  /** Per recipient group: customer invitations sent, with estimated opens and clicks over the ones
   * that carried the image or the tracked links (null = not measured). */
  groups?: {
    group: string
    sent: number
    opens: { tracked: number; opened: number } | null
    clicks: { tracked: number; clicked: number } | null
  }[]
}
export interface SendView {
  id: string
  /** Present on the campaign-wide list (Send tab). */
  recipientId?: string
  kind: 'test' | 'invitation'
  to: string
  subject: string
  state: 'sending' | 'sent' | 'failed' | 'send_unknown'
  errorCode: string | null
  draftRevision: number
  createdAt: string
  updatedAt: string
  gmailMessageId: string | null
  reconcileAttempts: number
  nextReconcileAt: string | null
  /** Estimated opens; null = not measured (test sends). */
  opens?: { firstAt: string | null; count: number } | null
  /** Estimated clicks; null = not measured (switch off when sent, or a test send). */
  clicks?: { firstAt: string | null; count: number } | null
}
export interface EligibilityView {
  /** Recipients that are not suppressed: the ones Check eligibility asks about. */
  checkable: number
  checked: number
  counts: { allow: number; none: number; unknown: number }
  oldest: string | null
  newest: string | null
  items: {
    recipientId: string
    status: 'allow' | 'none' | 'unknown'
    reason: string | null
    checkedAt: string
  }[]
}
export interface QueueView {
  state: 'none' | 'running' | 'paused' | 'done'
  pauseReason: string | null
  startedAt: string | null
  /** The groups the queue covers, each with its number and how far it got. */
  groups: { group: string; limit: number; sent: number; skipped: number; pending: number }[]
  counts: { pending: number; sent: number; skipped: number }
  items: {
    recipientId: string
    state: 'pending' | 'sent' | 'skipped'
    reason: string | null
    sendId: string | null
  }[]
}
