/**
 * `/ops` › Beta: Signals, Attention and Waitlist (spec 4.7 §5.3, §5.4, 05/10 and 06/10/2026),
 * the real screens from `@tracy/harness-web` on stand-in doors. Each `play` holds one decision the
 * screen was reviewed on: the group sits first in the rail and apart from "Needs attention"; Signals splits
 * new users by the source of their first sign-in; Attention closes a row only by an owner or admin's
 * press, and a read-only seat sees why before pressing; the Waitlist number opens the people behind
 * it, turned away and form joined per address; New customers shows, per person, what became of each
 * site, how often they asked the agent, what it changed and on which days they came back, with tokens
 * marked not measured rather than guessed.
 */

import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CustomersPayload, SignalsPayload, StuckPayload, WaitlistPayload } from '@tracy/harness-web'
import { App, Signals, Stuck, Waitlist } from '@tracy/harness-web'
import { expect, waitFor, within } from 'storybook/test'

const READ_AT = '2026-10-08T03:00:00.000Z'
const empty = {
  email: 0,
  blog: 0,
  demo: 0,
  site: 0,
  forum: 0,
  'product-page': 0,
  helpdesk: 0,
  social: 0,
  video: 0,
  owned: 0,
  other: 0,
  none: 0
}
const days = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.parse('2026-10-08T12:00:00Z') - i * 86_400_000).toISOString().slice(0, 10)
    return i === 0
      ? {
          day: d,
          newUsers: 4,
          bySource: { ...empty, email: 2, blog: 1, none: 1 },
          created: 2,
          imported: 1,
          stuck: 3,
          waitlist: 6,
          discordLinked: 3,
          discordBugs: 1
        }
      : {
          day: d,
          newUsers: 0,
          bySource: { ...empty },
          created: 0,
          imported: 0,
          stuck: 0,
          waitlist: 0,
          discordLinked: 0,
          discordBugs: 0
        }
  })
const PLAN = [{ id: '10', name: 'JA Template', until: '2027-03-14' }]

const CUSTOMERS: CustomersPayload = {
  readAt: READ_AT,
  days: 14,
  total: 3,
  rows: [
    {
      email: 'lena@agency.example',
      firstSignInAt: '2026-10-08T02:10:00.000Z',
      badge: 'gate off',
      source: {
        source: 'joomlart',
        medium: 'email',
        campaign: 'tracy-beta-2026-10',
        content: 'ceo-invite-g1'
      },
      sites: [],
      requests: 0,
      lastRequestAt: null,
      edits: { done: 0, failed: 0, undone: 0, actions: {} },
      activeDays: ['2026-10-08'],
      tokens: null
    },
    {
      email: 'paulo@union.example',
      firstSignInAt: '2026-10-06T20:32:00.000Z',
      badge: 'gate off',
      source: {
        source: 'joomlart',
        medium: 'email',
        campaign: 'tracy-beta-2026-10',
        content: 'ceo-invite-g2'
      },
      sites: [
        {
          siteKey: 'union.example',
          kind: 'imported',
          platform: 'joomla',
          startedAt: '2026-10-06T20:36:00.000Z',
          state: 'built',
          failures: 0,
          live: false
        }
      ],
      requests: 7,
      lastRequestAt: '2026-10-08T01:44:00.000Z',
      edits: { done: 5, failed: 1, undone: 0, actions: { 'content.update': 5 } },
      activeDays: ['2026-10-07', '2026-10-08'],
      tokens: 123456,
      tokenCoverage: { measuredTurns: 5, partialTurns: 1 }
    },
    {
      email: 'theo@studio.example',
      firstSignInAt: '2026-10-06T11:25:00.000Z',
      badge: null,
      source: null,
      sites: [
        {
          siteKey: 'theo-studio.example',
          kind: 'imported',
          platform: 'joomla',
          startedAt: '2026-10-06T11:35:00.000Z',
          state: 'stuck',
          failures: 9,
          live: false
        }
      ],
      requests: 1,
      lastRequestAt: null,
      edits: { done: 0, failed: 0, undone: 0, actions: {} },
      activeDays: ['2026-10-06', '2026-10-07'],
      tokens: 0,
      tokenCoverage: { measuredTurns: 1, partialTurns: 0 }
    }
  ]
}

function signals(n: number): SignalsPayload {
  return {
    readAt: READ_AT,
    days: n,
    sources: [
      'email',
      'blog',
      'demo',
      'site',
      'forum',
      'product-page',
      'helpdesk',
      'social',
      'video',
      'owned',
      'other',
      'none'
    ],
    totals: {
      newUsers: 4,
      created: 2,
      imported: 1,
      waitlist: 6,
      stuck: 2,
      discordLinked: 3,
      discordBugs: 1,
      bySource: { ...empty, email: 2, blog: 1, none: 1 }
    },
    previous: {
      newUsers: 1,
      created: 1,
      imported: 0,
      waitlist: 2,
      stuck: 0,
      discordLinked: 1,
      discordBugs: 0,
      bySource: { ...empty, email: 1 }
    },
    byDay: days(n),
    latest: [
      {
        at: '2026-10-08T02:40:00Z',
        email: 'mara@example.com',
        badge: 'JoomlArt member',
        plans: PLAN,
        via: 'email code',
        source: {
          source: 'joomlart',
          medium: 'email',
          campaign: 'tracy-beta-2026-10',
          content: 'members-cta'
        }
      },
      {
        at: '2026-10-08T02:10:00Z',
        email: 'studio@example.net',
        badge: 'JoomlArt member',
        plans: PLAN,
        via: 'Google',
        source: {
          source: 'joomlart',
          medium: 'blog',
          campaign: 'tracy-beta-2026-10',
          content: 'launch-post-cta'
        }
      },
      {
        at: '2026-10-08T01:20:00Z',
        email: 'ortiz@example.org',
        badge: 'seat invite',
        plans: [],
        via: 'email code',
        source: null
      },
      {
        at: '2026-10-08T00:30:00Z',
        email: 'kim@example.com',
        badge: 'JoomlArt member',
        plans: PLAN,
        via: 'email code',
        source: { source: 'joomlart', medium: 'email', campaign: 'tracy-beta-2026-10', content: 'mass-open' }
      }
    ]
  }
}

const stuckRow = (
  siteKey: string,
  email: string,
  step: string,
  reason: string,
  times: number,
  minutes: number
) => ({
  siteKey,
  email,
  operation: (step === 'import' ? 'import' : 'build') as 'import' | 'build',
  totalFailures: times,
  episodeCount: 1,
  historyAvailable: false,
  plans: PLAN,
  source: { medium: 'email' },
  platform: step === 'import' ? 'joomla' : 'wordpress',
  step,
  reason,
  times,
  firstAt: new Date(Date.now() - (minutes + 30) * 60_000).toISOString(),
  lastAt: new Date(Date.now() - minutes * 60_000).toISOString(),
  open: true,
  closed: null as StuckPayload['open'][number]['closed']
})

/** A tiny in-memory Attention door: the press really moves the row, so the screen redraws from it. */
function stuckStore(writable: boolean) {
  const open: StuckPayload['open'] = [
    stuckRow('mara.tracy.test', 'mara@example.com', 'build', 'QUICKSTART_UNREACHABLE', 2, 12),
    stuckRow('www.example.net', 'studio@example.net', 'import', 'IMPORT_FAILED', 1, 35)
  ]
  const handledToday: StuckPayload['open'] = []
  return {
    read: (): StuckPayload => ({
      readAt: new Date().toISOString(),
      count: open.length,
      sites: [...open, ...handledToday],
      history: { episodes: [], activity: [] },
      open: [...open],
      handledToday: [...handledToday],
      writable
    }),
    press(siteKey: string, reopen: boolean) {
      const from = reopen ? handledToday : open
      const i = from.findIndex((r) => r.siteKey === siteKey)
      if (i < 0) return { status: 409, body: { code: reopen ? 'NOT_HANDLED' : 'NOT_OPEN' } }
      const [row] = from.splice(i, 1)
      if (reopen) open.unshift({ ...row, open: true, closed: null })
      else
        handledToday.unshift({
          ...row,
          open: false,
          closed: { how: 'handled', at: new Date().toISOString(), by: 'owner@tracy.test' }
        })
      return { status: 200, body: { ok: true } }
    }
  }
}

/** Four people: turned away and sent the form; a form from before its answers were kept; a form WordPress held back; turned away, then in. */
function waitlist(n: number): WaitlistPayload {
  return {
    readAt: READ_AT,
    days: n,
    totals: { people: 4, turnedAway: 2, form: 3, both: 1, signedIn: 1 },
    rows: [
      {
        email: 'linh@example.com',
        lastAt: '2026-10-08T02:00:00Z',
        turnedAway: {
          times: 2,
          firstAt: '2026-10-06T09:00:00Z',
          lastAt: '2026-10-08T01:30:00Z',
          via: 'google'
        },
        form: {
          at: '2026-10-08T02:00:00Z',
          updatedAt: '2026-10-08T02:00:00Z',
          name: 'Linh Studio',
          website: 'https://linh.example.vn/',
          platforms: ['WordPress', 'Joomla'],
          role: 'clients',
          siteCount: '2-10',
          source: { source: 'pricing', content: 'plan-card' }
        },
        confirmation: { status: 'sent', sentAt: '2026-10-08T02:00:30Z' },
        signedInAt: null
      },
      {
        email: 'old-form@example.com',
        lastAt: '2026-10-05T01:00:00Z',
        turnedAway: null,
        form: {
          at: '2026-10-05T01:00:00Z',
          updatedAt: null,
          name: null,
          website: null,
          platforms: [],
          role: null,
          siteCount: null,
          source: null
        },
        confirmation: { status: 'queued', sentAt: null },
        signedInAt: null
      },
      {
        email: 'held@example.net',
        lastAt: '2026-10-04T02:00:00Z',
        turnedAway: null,
        form: {
          at: '2026-10-04T02:00:00Z',
          updatedAt: '2026-10-04T02:00:00Z',
          name: 'Held Back',
          website: null,
          platforms: ['Other'],
          role: 'own',
          siteCount: 'none',
          source: null
        },
        confirmation: null,
        signedInAt: null
      },
      {
        email: 'came-in@example.org',
        lastAt: '2026-10-03T04:00:00Z',
        turnedAway: {
          times: 1,
          firstAt: '2026-10-03T04:00:00Z',
          lastAt: '2026-10-03T04:00:00Z',
          via: 'email code'
        },
        form: null,
        confirmation: null,
        signedInAt: '2026-10-04T05:00:00Z'
      }
    ]
  }
}

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  )

function doors({ at, writable = true }: { at?: string; writable?: boolean } = {}) {
  return () => {
    const store = stuckStore(writable)
    const original = window.fetch
    const address = window.location.href
    if (at) window.history.replaceState({}, '', at)
    window.fetch = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), window.location.href)
      if (url.pathname === '/api/ops/beta/signals')
        return json(200, signals(Number(url.searchParams.get('days')) || 14))
      if (url.pathname === '/api/ops/beta/customers')
        return json(200, { ...CUSTOMERS, days: Number(url.searchParams.get('days')) || 14 })
      if (url.pathname === '/api/ops/beta/waitlist')
        return json(200, waitlist(Number(url.searchParams.get('days')) || 30))
      if (url.pathname === '/api/ops/beta/stuck') return json(200, store.read())
      if (url.pathname === '/api/ops/beta/stuck/handled') {
        const body = JSON.parse(String(init?.body ?? '{}'))
        const answer = store.press(body.siteKey, body.reopen === true)
        return json(answer.status, answer.body)
      }
      if (url.pathname === '/api/ops/attention')
        return json(200, { readAt: READ_AT, count: 90, counts: {}, offered: 93, subjects: [] })
      if (url.pathname === '/api/ops/me')
        return json(200, {
          email: writable ? 'owner@tracy.test' : 'dev@tracy.test',
          role: writable ? 'owner' : 'developer'
        })
      return original(typeof input === 'string' ? new URL(input, address).href : input, init)
    }
    return () => {
      window.fetch = original
      if (at) window.history.replaceState({}, '', address)
    }
  }
}

const meta = {
  title: 'pages/fleet/Beta',
  component: Signals,
  parameters: { layout: 'fullscreen' },
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Signals />
    </div>
  ),
  beforeEach: doors()
} satisfies Meta<typeof Signals>

export default meta
type Story = StoryObj<typeof meta>

/** The group sits first in the rail, Signals and Attention under it; "Needs attention" keeps its place. */
export const InTheRail: StoryObj<typeof App> = {
  render: () => <App />,
  beforeEach: doors({ at: '/ops/signals' }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'User Growth Statistics' })).toBeVisible()
    const links = canvas.getAllByRole('link').map((a) => a.textContent?.trim() ?? '')
    const signalsAt = links.findIndex((l) => l.startsWith('User Growth Statistics'))
    const attentionAt = links.findIndex((l) => l.startsWith('Stuck Customer Sites'))
    await expect(signalsAt).toBeGreaterThan(-1)
    await expect(attentionAt).toBe(signalsAt + 1)
    await expect(links.findIndex((l) => l.startsWith('CMS agents'))).toBeGreaterThan(attentionAt)
    // The template team's attention list keeps its own place in the rail (its label is Vietnamese,
    // so it is found by where it goes).
    const hrefs = canvas.getAllByRole('link').map((a) => a.getAttribute('href') ?? '')
    await expect(hrefs.some((h) => h.endsWith('/ops/attention'))).toBe(true)
    await waitFor(() => expect(canvas.getByText('2', { selector: '[data-stuck-count]' })).toBeVisible())
  }
}

/** New users split by the source of their first sign-in; the window changes the day rows. */
export const SignalsBySource: Story = {
  play: async ({ canvas, userEvent }) => {
    const tile = await canvas.findByText('New users', { selector: '[data-signal-tile] div' })
    const card = tile.closest('[data-signal-tile]') as HTMLElement
    await expect(within(card).getByText('4')).toBeVisible()
    await expect(within(card).getByText('+3 vs previous 14 days')).toBeVisible()
    await expect(
      [...card.querySelectorAll('[data-signal-legend]')].map((e) => e.getAttribute('data-signal-legend'))
    ).toEqual(['email', 'blog', 'none'])
    const row = canvas.getByText('mara@example.com').closest('tr') as HTMLElement
    for (const chip of ['joomlart', 'email', 'tracy-beta-2026-10', 'members-cta'])
      await expect(within(row).getByText(chip)).toBeVisible()
    await expect(
      within(canvas.getByText('ortiz@example.org').closest('tr') as HTMLElement).getByText('none')
    ).toBeVisible()
    await expect(canvas.getAllByRole('row').filter((r) => r.hasAttribute('data-signal-day'))).toHaveLength(14)
    const discord = (
      await canvas.findByText('Discord verified', { selector: '[data-signal-tile] div' })
    ).closest('[data-signal-tile]') as HTMLElement
    await expect(within(discord).getByText('3')).toBeVisible()
    await expect(within(discord).getByText('1 bug report on Discord · +2 vs previous 14 days')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: '7 days' }))
    await waitFor(() =>
      expect(canvas.getAllByRole('row').filter((r) => r.hasAttribute('data-signal-day'))).toHaveLength(7)
    )
  }
}

/** One row per new customer: each site and whether it built, requests, agent changes, days active, tokens not guessed. */
export const NewCustomers: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('3 · staff and demo sites left out · counts only, never their words')
    ).toBeVisible()
    const row = (await canvas.findByText('paulo@union.example')).closest('tr') as HTMLElement
    await expect(within(row).getByText('imported · built')).toBeVisible()
    await expect(within(row).getByText('7')).toBeVisible()
    await expect(within(row).getByText('content edited')).toBeVisible()
    await expect(within(row).getByText('1 failed')).toBeVisible()
    await expect(within(row).getByText('active on 07/10, 08/10')).toBeVisible()
    await expect(within(row).getByText('123,456')).toBeVisible()
    await expect(within(row).getByText('5 of 7 requests measured · 1 partial')).toBeVisible()
    await expect(within(row).getByText('recorded')).toBeVisible()
    const stuck = canvas.getByText('theo@studio.example').closest('tr') as HTMLElement
    await expect(within(stuck).getByText('imported · stuck')).toBeVisible()
    await expect(within(stuck).getByText('9 failures')).toBeVisible()
    const fresh = canvas.getByText('lena@agency.example').closest('tr') as HTMLElement
    await expect(within(fresh).getByText('no site yet')).toBeVisible()
    await expect(within(fresh).getByText('not measured')).toBeVisible()
    await expect(within(stuck.lastElementChild as HTMLElement).getByText('0')).toBeVisible()
    await expect(within(stuck).getByText('1 of 1 requests measured')).toBeVisible()
  }
}

/** An owner closes a row; it moves to Handled today with who closed it, and Reopen brings it back. */
export const AttentionAsOwner: StoryObj<typeof Stuck> = {
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Stuck />
    </div>
  ),
  play: async ({ canvas, userEvent }) => {
    const row = (await canvas.findByText('mara@example.com')).closest('tr') as HTMLElement
    await expect(within(row).getByText('Template download failed')).toBeVisible()
    await userEvent.click(within(row).getByRole('button', { name: 'Mark handled' }))
    await waitFor(() => expect(canvas.queryByText('mara@example.com')).toBeNull())
    await userEvent.click(canvas.getByRole('button', { name: /Closed in period/ }))
    const closed = (await canvas.findByText('mara@example.com')).closest('tr') as HTMLElement
    await userEvent.hover(within(closed).getByRole('button', { name: 'Case status' }))
    await expect(await within(document.body).findByText(/Marked handled by owner@tracy\.test/)).toBeVisible()
    await userEvent.click(within(closed).getByRole('button', { name: 'Reopen' }))
    await userEvent.click(canvas.getByRole('button', { name: /Needs help/ }))
    await expect(await canvas.findByText('mara@example.com')).toBeVisible()
  }
}

/** A read-only seat sees the button disabled, with the reason on it, before any press. */
export const AttentionReadOnly: StoryObj<typeof Stuck> = {
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Stuck />
    </div>
  ),
  beforeEach: doors({ writable: false }),
  play: async ({ canvas }) => {
    const row = (await canvas.findByText('mara@example.com')).closest('tr') as HTMLElement
    const button = within(row).getByRole('button', { name: 'Mark handled' })
    await expect(button).toBeDisabled()
    await expect(button).toHaveAttribute('title', 'Only an owner or admin can change case status.')
  }
}

/** The Waitlist number on Signals opens the people behind it, and the rail lists the screen under Beta. */
export const WaitlistFromTheTile: StoryObj<typeof App> = {
  render: () => <App />,
  beforeEach: doors({ at: '/ops/signals' }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'User Growth Statistics' })).toBeVisible()
    const links = canvas.getAllByRole('link').map((a) => a.textContent?.trim() ?? '')
    const attentionAt = links.findIndex((l) => l.startsWith('Stuck Customer Sites'))
    await expect(links.findIndex((l) => l.startsWith('Waitlist'))).toBe(attentionAt + 1)
    const tile = await waitFor(() => {
      const open = canvas
        .getAllByRole('link')
        .find((a) => a.getAttribute('href') === '/ops/waitlist' && a.hasAttribute('data-signal-open'))
      if (!open) throw new Error('no waitlist tile link')
      return open
    })
    await expect(tile.textContent).toContain('See who is on the waitlist')
    tile.click()
    await expect(await canvas.findByRole('heading', { name: 'Waitlist' })).toBeVisible()
    await expect(window.location.pathname).toBe('/ops/waitlist')
    await waitFor(() => expect(canvas.getAllByRole('row').length).toBe(5))
  }
}

/** One row per address: when and how it was turned away, the form answers, the mail, and whether it got in. */
export const WaitlistRows: StoryObj<typeof Waitlist> = {
  render: () => (
    <div className="min-h-screen bg-background text-foreground">
      <Waitlist />
    </div>
  ),
  beforeEach: doors(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByRole('heading', { name: 'Waitlist' })).toBeVisible()
    await waitFor(() => expect(canvasElement.querySelectorAll('[data-waitlist-row]').length).toBe(4))
    const tile = (label: string) =>
      canvasElement.querySelector(`[data-waitlist-tile="${label}"]`)?.textContent ?? ''
    await expect(tile('On the list')).toContain('4')
    await expect(tile('On the list')).toContain('1 both turned away and sent the form')
    await expect(tile('Signed in later')).toContain('1')
    const row = (email: string) =>
      canvasElement.querySelector(`[data-waitlist-row="${email}"]`) as HTMLElement
    const linh = row('linh@example.com')
    await expect(linh.textContent).toContain('2 times · by google')
    await expect(linh.textContent).toContain('Linh Studio')
    await expect(linh.textContent).toContain("clients' sites · 2-10 sites")
    await expect(linh.querySelector('[data-waitlist-mail]')?.textContent).toBe('sent')
    await expect(linh.querySelector('[data-waitlist-signed-in]')?.textContent).toBe('not yet')
    await expect(linh.querySelector('[data-waitlist-source]')?.textContent).toBe('frompricingplan-card')
    const held = row('held@example.net')
    await expect(held.querySelector('[data-waitlist-mail]')?.getAttribute('data-waitlist-mail')).toBe(
      'not-asked'
    )
    await expect(held.querySelector('[data-waitlist-mail]')?.textContent).toBe('not sent yet')
    const old = row('old-form@example.com')
    await expect(old.textContent).toContain('never signed in')
    await expect(old.textContent).toContain('its answers were not kept')
    await expect(old.querySelector('[data-waitlist-mail]')?.textContent).toBe('waiting to send')
    const cameIn = row('came-in@example.org')
    await expect(cameIn.textContent).toContain('no form')
    await expect(
      cameIn.querySelector('[data-waitlist-signed-in]')?.getAttribute('data-waitlist-signed-in')
    ).toBe('yes')
  }
}
