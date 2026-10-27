/**
 * `/ops` › Beta › Usage (plan `tasks/todo-do-dung-that.md` U7): the real screen from `@tracy/harness-web`
 * on stand-in doors. Synthetic fixtures exercise direct counts, restricted customer text and hover details;
 * the screen is imported unchanged, never redrawn for Storybook.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { UsagePayload, UsageSamplePayload } from '@tracy/harness-web'
import { Usage } from '@tracy/harness-web'
import { expect, userEvent, waitFor, within } from 'storybook/test'

const rate = (a: number, b: number) => {
  if (b < 20) return { a, b, rate: null, low: null, high: null }
  const p = a / b
  const z = 1.96
  const d = 1 + (z * z) / b
  const c = (p + (z * z) / (2 * b)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / b + (z * z) / (4 * b * b))) / d
  return { a, b, rate: p, low: Math.max(0, c - h), high: Math.min(1, c + h) }
}
const q = (n: number, p50: number, p90: number) => ({
  n: Math.max(0, n),
  p50: n >= 20 ? p50 : null,
  p90: n >= 100 ? p90 : null
})

/** One platform's figures, scaled from `turns`. */
function turnsOf(turns: number) {
  const changed = Math.round(turns * 0.7)
  const unchangedCompleted = Math.max(0, turns - changed - 4)
  const shown = Math.floor(changed * 0.55)
  const skipped = Math.floor(changed * 0.3)
  const notShown = Math.min(3, changed - shown - skipped)
  const cannotTell = Math.min(2, changed - shown - skipped - notShown)
  const rated = Math.min(11, turns)
  return {
    turns,
    endings: {
      completed: Math.max(0, turns - 4),
      'max-tokens': Math.min(1, turns),
      error: Math.min(2, turns),
      aborted: Math.min(1, turns),
      blocked: 0,
      interrupted: 0,
      running: 0,
      stale: 0,
      unknown: 0
    },
    changes: {
      changed,
      added: Math.round(changed * 0.15),
      text: Math.round(changed * 0.6),
      image: Math.round(changed * 0.15),
      look: Math.round(changed * 0.2),
      delete: Math.min(1, changed),
      files: Math.min(2, changed),
      other: 0,
      outcomeUnknown: 0,
      unchangedCut: Math.min(1, turns),
      unchangedCompleted,
      unchangedCompletedRefused: Math.min(2, unchangedCompleted),
      unchangedNotCompleted: Math.min(3, turns)
    },
    time: { turn: q(turns - 1, 24.8, 96), firstWrite: q(changed, 11.2, 48) },
    work: {
      known: Math.max(0, turns - 1),
      steps: q(turns - 1, 3, 9),
      calls: q(turns - 1, 4, 14),
      withFailedCalls: rate(Math.min(9, turns), Math.max(0, turns - 1))
    },
    visual: {
      changed,
      shown,
      not_shown: notShown,
      broken: 0,
      cannot_tell: cannotTell,
      skipped,
      unknown: changed - shown - skipped - notShown - cannotTell
    },
    feedback: {
      coverage: rate(rated, turns),
      positive: rated - Math.min(3, rated),
      negative: Math.min(3, rated),
      bad: rate(Math.min(3, rated), rated)
    },
    undo: {
      within24h: rate(Math.min(4, changed), Math.max(0, changed - 2)),
      fromChat: Math.min(3, changed),
      fromSiteChanges: Math.min(1, Math.max(0, changed - 3))
    },
    followUp: rate(Math.round(turns * 0.4), Math.max(0, turns - 2)),
    rework: rate(Math.min(5, changed), Math.round(changed * 0.8))
  }
}

function funnelOf(created: number) {
  return {
    created,
    built: { done: Math.max(0, created - 2), failed: created > 0 ? 1 : 0, pending: created > 1 ? 1 : 0 },
    ready: q(created - 3, 187, 508),
    warm: created > 2 ? 1 : 0,
    readyUnknown: 0,
    customize: {
      none: Math.round(created / 2),
      applied: Math.max(0, created - Math.round(created / 2) - 2),
      failed: created > 0 ? 1 : 0,
      inProgress: created > 1 ? 1 : 0
    },
    entered: rate(Math.max(0, created - 2), created),
    firstRequestWithin24h: rate(Math.round(created * 0.6), Math.max(0, created - 1)),
    returnedAnotherDay: rate(Math.round(created * 0.3), Math.max(0, created - 1))
  }
}

function usage(canReadText: boolean): UsagePayload {
  const wp = turnsOf(64)
  const jo = turnsOf(41)
  const em = turnsOf(12)
  return {
    readAt: '2026-10-17T05:00:00.000Z',
    days: 14,
    since: '2026-10-03T17:00:00.000Z',
    rules: { minForRate: 20, minForP90: 100 },
    platforms: ['wordpress', 'joomla', 'emdash', 'unknown', 'all'],
    turns: { wordpress: wp, joomla: jo, emdash: em, unknown: turnsOf(0), all: turnsOf(117) },
    siteUndos: { restores: 2, rowReverts: 5 },
    funnel: {
      wizard: {
        opened: 58,
        reachedCreate: 31,
        pending: 4,
        leftBeforeCreate: 23,
        reachedCreateRate: rate(29, 52)
      },
      byPlatform: {
        wordpress: funnelOf(14),
        joomla: funnelOf(12),
        emdash: funnelOf(5),
        unknown: funnelOf(0),
        all: funnelOf(31)
      }
    },
    canReadText
  }
}

const SAMPLE: UsageSamplePayload = {
  group: 'bad',
  days: 14,
  turns: [
    {
      turnId: 'session-a:2',
      siteKey: 'kapsalon.tracy.site',
      platform: 'joomla',
      source: 'panel',
      request: 'Zet het telefoonnummer in de footer op 020 123 4567',
      reply: 'I changed the phone number in the footer to 020 123 4567.',
      openedAt: '2026-10-16T09:12:00.000Z',
      seconds: 58.3,
      ending: 'completed',
      changed: ['text'],
      steps: 8,
      calls: 9,
      failedCalls: 2,
      visual: 'not_shown',
      visualNote: null,
      rating: 'negative',
      undone: true
    }
  ]
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  )

function doors(canReadText: boolean) {
  return () => {
    const original = window.fetch
    window.fetch = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), window.location.href)
      if (url.pathname === '/api/ops/usage') return json(200, usage(canReadText))
      if (url.pathname === '/api/ops/usage/turns')
        return canReadText ? json(200, SAMPLE) : Promise.resolve(new Response(null, { status: 403 }))
      return original(input, init)
    }
    return () => {
      window.fetch = original
    }
  }
}

const meta = {
  title: 'pages/fleet/Usage',
  component: Usage,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Usage />
    </div>
  ),
  beforeEach: doors(false)
} satisfies Meta<typeof Usage>

export default meta
type Story = StoryObj<typeof meta>

/** Real screen fixture: small CMS groups keep direct counts and customer text stays permission-gated. */
export const ByCms: Story = {
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByRole('heading', { name: 'Chat Usage Statistics' })).toBeVisible()
    await waitFor(() => expect(canvasElement.querySelector('[data-signal-table="usage-cms"]')).not.toBeNull())
    const table = canvasElement.querySelector('[data-signal-table="usage-cms"]') as HTMLElement
    await waitFor(() => expect(table.querySelector('[data-signal-row="emdash"]')).not.toBeNull())
    const row = table.querySelector('[data-signal-row="emdash"]') as HTMLElement
    const cells = within(row).getAllByRole('cell')
    await expect(cells[1]).toHaveTextContent('12')
    await expect(cells[3]).toHaveTextContent('8')
    await expect(cells[4]).toHaveTextContent('3')
    await expect(canvas.queryByText('Restricted request samples')).toBeNull()
    await expect(table.querySelector('[data-signal-row="unknown"]')).toBeNull()
  }
}

/** Named readers retain the same sampled words, now in a hover card instead of an expanded row. */
export const WithTheWords: Story = {
  beforeEach: doors(true),
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText('Restricted request samples')).toBeVisible()
    const sample = await canvas.findByRole('button', { name: 'Request sample for kapsalon.tracy.site' })
    await userEvent.hover(sample)
    const page = within(canvasElement.ownerDocument.body)
    await waitFor(() =>
      expect(page.getByText('Zet het telefoonnummer in de footer op 020 123 4567')).toBeVisible()
    )
    await expect(page.getByText('Confirmed change recorded · Undone')).toBeVisible()
  }
}
