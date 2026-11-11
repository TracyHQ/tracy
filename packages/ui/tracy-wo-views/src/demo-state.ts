/**
 * The demo state machine (spec #512, "Demo site block and progress"): one row's demo read as one of six states, and
 * per state the one primary button, the ⋯ menu and the one line under it. The list's Status piece and the Details
 * Demo site block both read this, so a place never says two different things about its demo.
 * Pure: no fetch, no clock read unless the caller leaves `now` out.
 */
import { type DemoFacts, demoView } from './demo.ts'
import type { Translate } from './types.ts'

export type DemoState = 'none' | 'queued' | 'building' | 'ready' | 'failed' | 'expired'

/** The parts of a My opportunities row (`GET /api/website-opportunities`) the demo state reads. */
export interface DemoStateRow {
  demoAction?: { id?: string; state?: string | null; step?: string | null; error?: string | null } | null
  demo?: DemoFacts | null
}

export interface DemoBlock {
  primary: { label: string; action: 'build' | 'open' | 'rebuild' | null; disabled: boolean }
  /** No Delete demo: no server door deletes a demo on its own (Delete removes the whole opportunity). */
  menu: Array<{ id: 'send' | 'rebuild'; label: string }>
  line: string | null
}

export function demoStateOf(row: DemoStateRow | null | undefined): DemoState {
  const action = row?.demoAction
  const demo = row?.demo
  if (action?.state === 'failed' || demo?.build?.status === 'failed') return 'failed'
  if (action?.state === 'queued' || action?.state === 'quality-queued-v1') return 'queued'
  // Any other state of an action that has not completed (running, a quality pass) is a build under way.
  if (action?.state && action.state !== 'completed') return 'building'
  if (!demo) return 'none'
  if (demo.deletedAt || demo.frozenAt) return 'expired'
  if (demo.build?.status === 'building' || !demo.siteKey) return 'building'
  return 'ready'
}

/**
 * Codes a failed demo carries (apps/tracy-web/src/opportunities-build, demo-runner and client-demo), each read as the
 * sentence a seller understands. A code missing here reads the generic sentence; the raw code is never shown.
 */
const REASONS: Record<string, string> = {
  DEMO_STEP_TIMEOUT: 'demo.reason.timeout',
  DEMO_STEP_FAILED: 'demo.reason.stepFailed',
  DEMO_LEASE_LOST: 'demo.reason.interrupted',
  AGENT_DEMO_TURN_LOST: 'demo.reason.interrupted',
  AGENT_DEMO_TURN_STOPPED: 'demo.reason.interrupted',
  DEMO_SELECTION_CHANGED: 'demo.reason.briefChanged',
  DEMO_WORKFLOW_CHANGED: 'demo.reason.briefChanged',
  TEMPLATE_VERSION_CHANGED: 'demo.reason.briefChanged',
  BRIEF_INVALID: 'demo.reason.briefChanged',
  DEMO_CHAT_UNAVAILABLE: 'demo.reason.chat',
  DEMO_SESSION_UNAVAILABLE: 'demo.reason.chat',
  DEMO_CHAT_NOT_PREPARED: 'demo.reason.chat',
  DEMO_BASELINE_UNAVAILABLE: 'demo.reason.check',
  DEMO_QA_UNAVAILABLE: 'demo.reason.check',
  DEMO_CHECK_BUDGET_EXHAUSTED: 'demo.reason.check',
  DEMO_CHECK_LOST: 'demo.reason.check',
  QA_RETRY_FAILED: 'demo.reason.check',
  AGENT_DEMO_ENDED_UNCHECKED: 'demo.reason.check',
  QUICKSTART_QA_INCOMPLETE: 'demo.reason.check',
  DEMO_LOGO_RESEARCH_PENDING: 'demo.reason.researchPending',
  DEMO_PICTURE_LABELS_PENDING: 'demo.reason.researchPending',
  DEMO_TEMPLATE_REQUIRED: 'demo.reason.template',
  DEMO_BUILD_DAILY_LIMIT: 'demo.reason.limit',
  DEMO_LIMIT_REACHED: 'demo.reason.limit',
  DEMO_CANCELLED: 'demo.reason.cancelled',
  DEMO_DELETED: 'demo.reason.deleted',
  DEMO_SITE_DELETED: 'demo.reason.deleted',
  DEMO_TEARDOWN_FAILED: 'demo.reason.teardown',
  BUILD_UNREACHABLE: 'demo.reason.server',
  BUILD_FAILED: 'demo.reason.server',
  PROVISION_FAILED: 'demo.reason.server',
  SITE_FILL_FAILED: 'demo.reason.fill',
  QUALITY_FILL_NEEDS_ATTENTION: 'demo.reason.fill',
  QUALITY_STEP_FAILED: 'demo.reason.fill',
  AGENT_DEMO_NOT_GRANTED: 'demo.reason.access',
  SITE_ACCESS_DENIED: 'demo.reason.access',
  ACCOUNT_NOT_FOUND: 'demo.reason.access',
  AGENT_DEMO_OTHER_WRITER: 'demo.reason.otherWriter'
}

/** Why a demo stopped, as one plain sentence; an unknown or missing code reads the generic one. */
export function failureReason(code: string | null | undefined, t: Translate): string {
  return t(REASONS[code ?? ''] ?? 'demo.reason.unknown')
}

/** Step identifiers the demo action carries (the old four and the step chain's own), read for "Stopped at". */
const STEPS = new Set([
  'brief',
  'build',
  'fill',
  'check',
  'kit',
  'brand',
  'plan',
  'copy',
  'pictures',
  'write'
])
const stepLabel = (step: string | null | undefined, t: Translate): string =>
  t(step && STEPS.has(step) ? `demo.step.${step}` : 'demo.step.unknown')

const addressOf = (demo: DemoFacts | null | undefined): string | null => {
  if (demo?.siteKey) return demo.siteKey
  try {
    return demo?.url ? new URL(demo.url).host : null
  } catch {
    return null
  }
}

const dateText = (iso: string | null | undefined, locale: string | undefined): string | null => {
  const ms = iso ? Date.parse(iso) : Number.NaN
  if (!Number.isFinite(ms)) return null
  return new Intl.DateTimeFormat(locale ?? 'en', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(ms)
}

function readyLine(row: DemoStateRow, t: Translate, now: number): string {
  const view = demoView(row.demo, now)
  const address = addressOf(row.demo)
  const parts = [t('demo.line.ready')]
  if (address) parts.push(address)
  if (view.kind === 'live') {
    const days = view.unit === 'hour' ? 1 : view.left
    parts.push(t(days === 1 ? 'demo.line.daysLeft.one' : 'demo.line.daysLeft.other', { count: days }))
  }
  return parts.join(' · ')
}

export function demoBlock(
  state: DemoState,
  row: DemoStateRow | null | undefined,
  t: Translate,
  opts: { now?: number; locale?: string } = {}
): DemoBlock {
  const r = row ?? {}
  const now = opts.now ?? Date.now()
  switch (state) {
    case 'queued':
    case 'building':
      return {
        primary: { label: t('demo.primary.building'), action: null, disabled: true },
        menu: [],
        line: null
      }
    case 'ready':
      return {
        primary: { label: t('demo.primary.open'), action: 'open', disabled: false },
        menu: [
          { id: 'send', label: t('demo.menu.send') },
          { id: 'rebuild', label: t('demo.menu.rebuild') }
        ],
        line: readyLine(r, t, now)
      }
    case 'failed':
      return {
        primary: { label: t('demo.primary.again'), action: 'build', disabled: false },
        menu: [],
        line: t('demo.line.stopped', {
          step: stepLabel(r.demoAction?.step, t),
          reason: failureReason(r.demoAction?.error, t)
        })
      }
    case 'expired': {
      const date = dateText(r.demo?.expiresAt ?? r.demo?.frozenAt ?? r.demo?.deletedAt, opts.locale)
      return {
        primary: { label: t('demo.primary.again'), action: 'rebuild', disabled: false },
        menu: [],
        line: date ? t('demo.line.expired', { date }) : t('demo.line.expiredUndated')
      }
    }
    default:
      return {
        primary: { label: t('demo.primary.build'), action: 'build', disabled: false },
        menu: [],
        line: null
      }
  }
}
