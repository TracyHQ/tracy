/**
 * `/ops/mail` — customer sites' own mail after go-live (tasks/todo-mail-site-khach.md).
 *
 * The story IMPORTS the real screen from `@tracy/harness-web` (step 1a of the UI workflow), so there
 * is no parallel drawing to drift. `fetchImpl` answers the three doors the screen calls on mount —
 * `/api/ops/mail`, `/api/ops/me`, `/api/ops/mail/log` — in the contract's shapes; Storybook has no
 * tracy-web behind it.
 *
 * FIVE STATES, the five things this screen exists to say, and four of them cannot be set up at will
 * on a real deployment: relay sending with one site near its cap, relay in log mode, site mail off
 * with nothing configured, a deployment whose tracy-web has no mail door yet, and Tracy's shared
 * Resend account with no slot left for another own domain.
 */
import { Mail } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

type Doors = { mail: unknown; mailStatus?: number; log?: unknown; me?: unknown }

const answering = ({
  mail,
  mailStatus = 200,
  log = { entries: [] },
  me = { email: 'ops@example.com', role: 'owner', writable: true }
}: Doors) =>
  (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('/api/ops/mail/log')) return json(log)
    if (url.startsWith('/api/ops/mail/sites/')) return json({ ok: true })
    // A release answers the site row; the story's list is fixed, so the row is simply read again.
    if (url.startsWith('/api/ops/mail')) return json(mail, mailStatus)
    if (url.startsWith('/api/ops/me')) return json(me)
    return json({}, 404)
  }) as unknown as typeof fetch

const sites = [
  {
    siteKey: 'joomlart.com',
    label: 'joomlart-com',
    mode: 'tracy',
    fromAddress: '"JoomlArt" <joomlart-com@sites.example>',
    hourly: 60,
    daily: 500,
    sentToday: 212,
    domain: null,
    domainStatus: null,
    lastError: null
  },
  {
    siteKey: 'lucas.example',
    label: 'lucaswp',
    mode: 'tracy-domain',
    fromAddress: '"Lucas" <hello@lucas.example>',
    hourly: null,
    daily: null,
    sentToday: 19,
    domain: 'lucas.example',
    domainStatus: 'verified',
    domainOwned: true,
    domainPendingSince: '2026-09-20T08:00:00Z',
    domainReleaseAt: null,
    domainReleasedAt: null,
    lastError: 'Refused: SITE_MAIL_LIMIT (site-day)'
  },
  {
    siteKey: 'bakery.example',
    label: 'bakery',
    mode: 'tracy-domain',
    fromAddress: '"Bakery" <bakery@sites.example>',
    hourly: null,
    daily: null,
    sentToday: 2,
    domain: 'bakery.example',
    domainStatus: 'pending',
    domainOwned: true,
    domainPendingSince: '2026-09-24T08:00:00Z',
    domainReleaseAt: '2026-09-27T08:00:00Z',
    domainReleasedAt: null,
    lastError: null
  },
  {
    siteKey: 'fijitrips.example',
    label: 'fijitrips',
    mode: 'own-cms',
    fromAddress: null,
    hourly: null,
    daily: null,
    sentToday: null,
    domain: null,
    domainStatus: null,
    lastError: null
  }
]

const meta = {
  component: Mail,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Mail>

export default meta
type Story = StoryObj<typeof meta>

/** Sending for real, one site lifted above the default, one refused at its daily limit today. */
export const Sending: Story = {
  args: {
    fetchImpl: answering({
      mail: {
        enabled: true,
        mode: 'smtp',
        domain: 'sites.example',
        globalDaily: 50,
        usedToday: 41,
        domainSlots: { used: 3, limit: 5 },
        domainPendingDays: 3,
        sites
      },
      log: {
        entries: [
          {
            at: '2026-09-23T09:12:00Z',
            siteKey: 'joomlart.com',
            status: 'sent',
            to: ['buyer@example.org'],
            subject: 'Order #1042'
          },
          { at: '2026-09-23T09:10:00Z', siteKey: 'lucas.example', status: 'refused', code: 'SITE_MAIL_LIMIT' }
        ]
      }
    })
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('Sending')).toBeVisible()
    await expect(canvas.getByText('41 of 50')).toBeVisible()
    await expect(await canvas.findByText('Order #1042')).toBeVisible()
    await expect(canvas.getAllByRole('button', { name: 'Edit' })[0]).toBeEnabled()
    await expect(canvas.getByText('3 of 5')).toBeVisible()
    await expect(canvas.getByText(/Waiting since/)).toBeVisible()
  }
}

/**
 * Tracy's Resend plan is full (Tracy's two sending domains plus one customer's): the slot card says
 * so in words, before a site admin runs into the refusal; each own domain can be released here.
 */
export const DomainSlotsFull: Story = {
  args: {
    fetchImpl: answering({
      mail: {
        enabled: true,
        mode: 'smtp',
        domain: 'sites.example',
        globalDaily: 50,
        usedToday: 4,
        domainSlots: { used: 3, limit: 3 },
        domainPendingDays: 3,
        sites: sites.filter((s) => s.siteKey === 'bakery.example')
      }
    })
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('3 of 3')).toBeVisible()
    await expect(canvas.getByText(/Full — a site asking for its own domain is refused/)).toBeVisible()
    await expect(canvas.getByText(/if unverified/)).toBeVisible()
    // Two presses, no browser dialog.
    await userEvent.click(canvas.getByRole('button', { name: 'Release domain' }))
    await expect(canvas.getByRole('button', { name: 'Confirm release' })).toBeVisible()
  }
}

/** `SITE_MAIL=log`: counts rise but nothing leaves — the status has to say so in the same breath. */
export const LogOnly: Story = {
  args: {
    fetchImpl: answering({
      mail: {
        enabled: true,
        mode: 'log',
        domain: 'sites.example',
        globalDaily: 50,
        usedToday: 3,
        sites: sites.slice(0, 1)
      },
      me: { email: 'dev@example.com', role: 'developer', writable: false }
    })
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/nothing is sent/)).toBeVisible()
    // A developer reads; the write door would refuse, so the button does not pretend otherwise.
    await expect(canvas.getByRole('button', { name: 'Edit' })).toBeDisabled()
    await expect(await canvas.findByText(/No mail logged yet/)).toBeVisible()
  }
}

/** The default on a fresh deployment: off, no domain, no sites. Empty, and saying why. */
export const Off: Story = {
  args: {
    fetchImpl: answering({
      mail: { enabled: false, mode: 'off', domain: null, globalDaily: 50, usedToday: 0, sites: [] }
    })
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/Site mail is off for this deployment/)).toBeVisible()
    await expect(canvas.getByText('Not set')).toBeVisible()
    await expect(canvas.getByText(/No site has mail settings/)).toBeVisible()
  }
}

/** A tracy-web older than the feature: the door is missing, and the screen says that, not "0 sent". */
export const NoDoor: Story = {
  args: { fetchImpl: answering({ mail: {}, mailStatus: 404 }) },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(/no site-mail door yet/)).toBeVisible()
    await expect(canvas.queryByText('Sites')).toBeNull()
  }
}
