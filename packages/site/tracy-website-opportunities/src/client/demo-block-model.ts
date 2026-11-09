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
  | { kind: 'action'; action: 'build' | 'send-demo' }
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
    case 'failed':
      return { kind: 'action', action: 'build' }
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
