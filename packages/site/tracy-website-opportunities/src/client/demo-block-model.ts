/**
 * The Demo site block of Details (#515) without the screen: the shared demo state machine (`@tracy/wo-views`
 * `demoBlock`) read for one place, and where each press goes. One primary button, a menu for the rest, one line.
 *
 * The shared menu has no Delete demo: no door removes a demo alone yet (only the whole place, from the header menu).
 */
import { type DemoBlock, type DemoFacts, type DemoState, demoBlock, demoStateOf } from '@tracy/wo-views'

import { demoFacts, demoSite } from './inspector-model.ts'
import type { OpportunityListRow } from './opportunity-row.ts'
import type { Translate } from './strings.ts'

type Body = Record<string, unknown>

export interface DemoBlockView extends DemoBlock {
  state: DemoState
}

/** Which press a control of the block makes. */
export type DemoControl = 'primary' | 'send' | 'rebuild'

/** What a press does: a row action (`runAction`), a demo press (`pressDemo`) or opening the demo in a new tab. */
export type DemoCommand =
  | { kind: 'action'; action: 'build' | 'retry-demo' | 'send-demo' }
  | { kind: 'press'; press: 'rebuild' | 'reopen' }
  | { kind: 'open'; href: string }
  | null

/** The row with its demo facts filled from the detail answer when the row itself carries none. */
function withDemo(row: OpportunityListRow, detail: Body | null): OpportunityListRow {
  return row.demo ? row : { ...row, demo: demoFacts(row, detail) }
}

export function demoBlockView(
  row: OpportunityListRow,
  detail: Body | null,
  t: Translate,
  opts: { now?: number; locale?: string } = {}
): DemoBlockView {
  const full = withDemo(row, detail)
  const state = demoStateOf(full)
  const block = demoBlock(state, full, t, opts)
  return { ...block, state }
}

/** Where the ready demo opens: its address, else the live link of its build, else its path on this host. */
function demoHref(demo: DemoFacts | null | undefined, detail: Body | null): string | null {
  if (demo?.url) return demo.url
  const live = demoSite(detail)?.links?.live
  if (live) return live
  return demo?.siteKey ? `/${encodeURIComponent(demo.siteKey)}/` : null
}

export function demoCommand(control: DemoControl, row: OpportunityListRow, detail: Body | null): DemoCommand {
  const full = withDemo(row, detail)
  if (control === 'send') return { kind: 'action', action: 'send-demo' }
  // Rebuild from the menu of a ready demo: a new build, with the template picker first.
  if (control === 'rebuild') return { kind: 'action', action: 'build' }
  const state = demoStateOf(full)
  switch (state) {
    case 'none':
      return { kind: 'action', action: 'build' }
    case 'failed':
      return { kind: 'action', action: 'retry-demo' }
    case 'ready': {
      const href = demoHref(full.demo, detail)
      return href === null ? null : { kind: 'open', href }
    }
    case 'expired':
      // A frozen demo comes back as it was; a deleted one is built again with its old choice.
      return { kind: 'press', press: full.demo?.frozenAt && !full.demo.deletedAt ? 'reopen' : 'rebuild' }
    default:
      return null
  }
}

/**
 * The Your site card of a built demo (#537, option A chosen by the owner): its address, the QA pill and the failing
 * checks, what the build took, when it expires and its home page picture. Read from the Details answer's `demo`
 * (`built`, `findings`, `preview`, new fields of `GET …/:id`); every missing part reads null and is left off the card.
 */
export interface SiteCardView {
  /** The address shown as the link; null when the demo has none yet. */
  host: string | null
  href: string | null
  /** passed: QA passed; review: QA asks a person to look; none: no QA verdict to show. */
  qa: 'passed' | 'review' | 'none'
  /** The failing checks of the last QA round, each as one plain sentence (an unknown check reads a generic one). */
  findings: string[]
  /** "Built Nov 11, 10:42 · 26 min · $1.84", or null when the build's facts are unknown. */
  builtLine: string | null
  /** "Expires in 14 days (Nov 25, 2026)", or null for a demo kept for good. */
  expiryLine: string | null
  /** The home page picture's address, or null: the card then draws the site's name on its brand colour. */
  preview: string | null
}

/** QA check ids (`apps/tracy-web/src/opportunities-build/demo-qa.js` REPAIR) the card says in plain words. */
const FINDINGS = new Set([
  'pages-load',
  'css-intact',
  'no-demo-pictures',
  'native-structure',
  'no-demo-words',
  'look-kept',
  'collected-used',
  'facts-from-brief',
  'cta-real',
  'no-horizontal-scroll',
  'content-reachable',
  'no-third-party-demo',
  'contrast-readable',
  'no-text-overlap',
  'looks-finished',
  'no-broken-assets-and-links',
  'no-cms-error-leak',
  'no-raw-placeholders',
  'picture-frames-kept'
])

const rec = (v: unknown): Record<string, unknown> | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** The checks as sentences, each sentence once (two unknown checks read one generic line). */
export function findingLines(ids: readonly unknown[], t: Translate): string[] {
  const lines = ids
    .filter((id): id is string => typeof id === 'string')
    .map((id) => t(FINDINGS.has(id) ? `siteCard.finding.${id}` : 'siteCard.finding.other'))
  return [...new Set(lines)]
}

function builtLineOf(built: Record<string, unknown> | null, t: Translate, locale: string): string | null {
  if (!built) return null
  const at = Date.parse(str(built.at) ?? '')
  const minutes = num(built.minutes)
  const usd = num(built.usd)
  const parts: string[] = []
  if (Number.isFinite(at))
    parts.push(
      t('siteCard.built', {
        date: new Intl.DateTimeFormat(locale, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }).format(at)
      })
    )
  if (minutes !== null) parts.push(t('siteCard.minutes', { n: Math.max(1, Math.round(minutes)) }))
  if (usd !== null)
    parts.push(new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd))
  return parts.length > 0 ? parts.join(' · ') : null
}

function expiryLineOf(expiresAt: string | null, t: Translate, now: number, locale: string): string | null {
  const at = Date.parse(expiresAt ?? '')
  if (!Number.isFinite(at)) return null
  const ms = Math.max(0, at - now)
  const date = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(at)
  if (ms < 86_400_000)
    return t('siteCard.expiresHours', { count: Math.max(1, Math.ceil(ms / 3_600_000)), date })
  const days = Math.ceil(ms / 86_400_000)
  return t(days === 1 ? 'siteCard.expiresDay' : 'siteCard.expiresDays', { count: days, date })
}

export function siteCardView(
  row: OpportunityListRow,
  detail: Body | null,
  t: Translate,
  opts: { now?: number; locale?: string } = {}
): SiteCardView {
  const now = opts.now ?? Date.now()
  const locale = opts.locale ?? 'en'
  const full = withDemo(row, detail)
  const demo = full.demo
  // The card's own facts are on the Details answer's demo (the list row's demo does not carry them).
  const own = rec(rec(detail)?.demo)
  const href = demoHref(demo, detail)
  let host: string | null = null
  try {
    host = href && /^https?:\/\//i.test(href) ? new URL(href).host : (demo?.siteKey ?? null)
  } catch {
    host = demo?.siteKey ?? null
  }
  const qaState = demo?.qa ?? null
  const qa =
    qaState === 'passed' ? 'passed' : qaState === 'needs-review' || qaState === 'failed' ? 'review' : 'none'
  const preview = rec(own?.preview)
  return {
    host,
    href,
    qa,
    findings: qa === 'review' ? findingLines(Array.isArray(own?.findings) ? own.findings : [], t) : [],
    builtLine: builtLineOf(rec(own?.built), t, locale),
    expiryLine: expiryLineOf(demo?.expiresAt ?? null, t, now, locale),
    preview: str(preview?.url)
  }
}
