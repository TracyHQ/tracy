/**
 * Publishing a site at its Tracy address from the site's Publish tab — the real `PublishView` of
 * `@tracy/core/site-tabs`, as `@tracy/dsh-site-tabs` mounts it, one story per state. `Settings` is
 * the real `SettingsView` beside it: the same site head, the CMS's rows, and no Domains section. What shows here
 * is what a lane renders (minus dsh's tab strip), a domain of the customer's own included: one
 * story per state of its card (`Domain · …`), each drawn from the answer the door would give.
 *
 * Storybook has no tracy-web behind it, so `fetch` is answered here with the shapes its doors
 * return (`GET /api/sites/:key/settings`, `GET …/state`, `POST …/go-live`, and the address doors:
 * the check of a name, `PUT …/address`, `POST …/address/verify`, `DELETE …/address/domain`), as
 * `apps/tracy-web/test/site-publish.test.mjs` and `site-address.test.mjs` assert them. The little server keeps
 * its own state: a publish runs for a moment and then ends, so `Flow` can be clicked through. Every
 * value on screen is a fixture of this file — no site or address here exists.
 *
 * Width: the side card's narrow end (420px) by default; `Flow, wide` is its wide end (760px).
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type ReactNode, useEffect, useState } from 'react'
import { PublishView, SettingsView } from '@tracy/core/site-tabs'
import { expect, userEvent, waitFor, within } from 'storybook/test'

import '../../../../../site/tracy-site-tabs/src/client/site-tabs-rules.css'
import { en as siteTabsEn } from '../../../../../site/tracy-site-tabs/src/client/strings'

const SITE = 'acme-studio.tracy.site'
/** How long the fixture's publish runs before it ends. */
const JOB_MS = 1500

const t = (key: string, params?: Record<string, string | number>): string =>
  ((siteTabsEn as Record<string, string>)[key] ?? key).replace(/\{(\w+)\}/g, (m, name: string) =>
    params && name in params ? String(params[name]) : m
  )

interface Operation {
  op: 'live' | 'draft' | 'drop-domain'
  /** The own domains the operation carries. */
  domains?: string[]
  /** A cleanup that failed: pressing again asks for the same operation. */
  retry?: boolean
  state: 'running' | 'failed'
  confirmed?: boolean
  jobId: string | null
  startedAt: string
  code?: string
  endedAt?: string
}
interface Fixture {
  role: 'owner' | 'editor' | 'viewer'
  publish: 'draft' | 'published'
  operation?: Operation | null
  liveSince?: string
  /** The host has no tunnel configuration: a publish answers 501. */
  notSetUp?: boolean
  /** The running job never ends by itself: a still. */
  hold?: boolean
  /** The site's own domain, as the address door sends it (`ownDomain` below). */
  domain?: OwnDomainFixture
  width?: 420 | 760
  /** Which of the site's two tabs is drawn; the Publish tab unless said. */
  tab?: 'publish' | 'settings'
}

const at = (minutesAgo: number): string => new Date(Date.now() - minutesAgo * 60_000).toISOString()

const DOMAIN = 'shop.example.com'
const TOKEN = '5f1c0a9e7b3d4c2a8e6f1b0d9c7a5e3f1b2c4d6e8f0a1b3c'
const TARGET = '0f3c9a52-7b1e-4d6a-9c2f-5e8d1a4b7c90.cfargotunnel.com'
interface Reading {
  status: 'ok' | 'wrong' | 'missing' | 'unknown'
  observed?: string[]
  error?: string
}
type OwnDomainFixture = ReturnType<typeof ownDomain>
/** An own domain as `apps/tracy-web` `sites/address.js` sends it: the two records and their readings. */
function ownDomain({
  state = 'pending',
  ownership,
  routing
}: {
  state?: 'pending' | 'connected'
  ownership?: Reading
  routing?: Reading
} = {}) {
  const checkedAt = at(4)
  const reading = (given?: Reading) =>
    given
      ? {
          status: given.status,
          observed: given.observed ?? [],
          ...(given.error ? { error: given.error } : {}),
          checkedAt
        }
      : { status: 'unchecked' as const, observed: [] }
  return {
    name: DOMAIN,
    kind: 'custom',
    state,
    verification: { type: 'TXT', name: `_tracy.${DOMAIN}`, value: TOKEN },
    routing: { type: 'CNAME', name: DOMAIN, value: TARGET },
    readiness: { ownership: ownership?.status === 'ok', routing: routing?.status === 'ok', tls: false },
    checks: [
      { record: 'ownership', type: 'TXT', name: `_tracy.${DOMAIN}`, expected: TOKEN, ...reading(ownership) },
      { record: 'routing', type: 'CNAME', name: DOMAIN, expected: TARGET, ...reading(routing) }
    ],
    ...(ownership || routing ? { checkedAt } : {})
  }
}
const OWNED: Reading = { status: 'ok', observed: [TOKEN] }
const ROUTED: Reading = { status: 'ok', observed: [TARGET] }
const RUNNING: Operation = {
  op: 'live',
  state: 'running',
  confirmed: true,
  jobId: 'a1b2c3d4e5f6',
  startedAt: at(0)
}
const FAILED: Operation = {
  op: 'live',
  state: 'failed',
  jobId: 'a1b2c3d4e5f6',
  startedAt: at(3),
  endedAt: at(2),
  code: 'JOB_FAILED'
}

/** Answers every door the tab opens, and keeps the site's state between answers. */
function WithServer({ fixture, children }: { fixture: Fixture; children: ReactNode }) {
  const [real] = useState(() => {
    const original = window.fetch
    const s: {
      publish: Fixture['publish']
      operation: Operation | null
      liveSince: string | undefined
      domain: OwnDomainFixture | null
    } = {
      publish: fixture.publish,
      operation: fixture.operation ?? null,
      liveSince: fixture.liveSince,
      domain: fixture.domain ?? null
    }
    // ADR 0028: an Owner or an Editor publishes; a Viewer only reads the state.
    const mayPublish = fixture.role !== 'viewer'
    const publishing = () => ({
      publish: s.publish,
      mayPublish,
      operation: s.operation,
      ...(s.liveSince ? { liveSince: s.liveSince } : {})
    })
    const answer = (body: unknown, status = 200) =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      )
    const end = () => {
      const op = s.operation
      if (op?.state !== 'running') return
      s.operation = null
      if (op.op === 'live') {
        s.publish = 'published'
        s.liveSince = new Date().toISOString()
      }
    }
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const method = init?.method ?? 'GET'
      if (url.endsWith('/settings'))
        return answer({
          siteKey: SITE,
          siteUrl: `https://${SITE}/`,
          adminUrl: `https://${SITE}/wp-admin/`,
          platform: 'wordpress',
          role: fixture.role,
          state: 'ready',
          values: { title: 'Acme Studio', version: '7.0', language: 'en-US', timezone: 'UTC' },
          displayName: SITE,
          addressChange: {
            allowed: fixture.role === 'owner',
            managedDomain: 'tracy.site',
            status: s.domain?.state === 'pending' ? 'pending' : 'ready',
            ...(s.domain?.state === 'pending' ? { pending: s.domain } : {}),
            connected: s.domain?.state === 'connected' ? [s.domain] : []
          },
          publishing: publishing()
        })
      if (url.endsWith('/state')) return answer(publishing())
      if (url.endsWith('/go-live') && method === 'POST') {
        const { op } = JSON.parse(String(init?.body)) as { op: 'live' | 'draft' }
        if (s.operation?.state === 'running') return answer({ code: 'PUBLISH_BUSY', ...publishing() }, 409)
        if (fixture.notSetUp) {
          s.operation = {
            ...FAILED,
            op,
            jobId: null,
            code: 'NOT_CONFIGURED',
            startedAt: at(0),
            endedAt: at(0)
          }
          return answer({ code: 'NOT_CONFIGURED' }, 501)
        }
        s.operation = { ...RUNNING, op, startedAt: new Date().toISOString() }
        if (op === 'draft') {
          s.publish = 'draft'
          s.liveSince = undefined
        }
        if (!fixture.hold) window.setTimeout(end, JOB_MS)
        return answer({ jobId: RUNNING.jobId, op, state: 'running', ...publishing() }, 202)
      }
      if (url.includes('/address/availability')) {
        const query = new URL(url, 'http://story.test').searchParams
        const asked = (query.get('name') ?? '').toLowerCase()
        return answer({
          name: asked,
          kind: query.get('kind') === 'custom' ? 'custom' : 'managed',
          available: true
        })
      }
      // The own-domain doors: a save reserves the name, a check answers the reading the fixture
      // holds (nothing is looked up here), a removal of a reservation takes it away.
      if (url.endsWith('/address') && method === 'PUT') {
        s.domain = ownDomain()
        return answer({ state: 'pending', pending: s.domain }, 202)
      }
      if (url.endsWith('/address/verify') && s.domain)
        return answer({ state: s.domain.state, [s.domain.state]: s.domain }, 202)
      if (url.endsWith('/address/domain') && method === 'DELETE') {
        s.domain = null
        return answer({ ok: true, removed: DOMAIN })
      }
      return original(input, init)
    }
    if (s.operation?.state === 'running' && !fixture.hold) window.setTimeout(end, JOB_MS)
    return original
  })
  useEffect(
    () => () => {
      window.fetch = real
    },
    [real]
  )
  return children
}

function Screen(fixture: Fixture) {
  return (
    <div className="flex h-screen justify-end bg-muted/40 text-foreground">
      <div
        data-side-card={fixture.width ?? 420}
        className="h-full overflow-auto border-border border-l bg-background"
        style={{ width: fixture.width ?? 420, maxWidth: '100%' }}
      >
        <div className="tracy-site-tabs text-sm">
          <WithServer fixture={fixture}>
            {fixture.tab === 'settings' ? (
              <SettingsView
                siteKey={SITE}
                role={fixture.role}
                sites={[{ siteKey: SITE, role: fixture.role }]}
                onPick={() => {}}
                pollMs={400}
                t={t}
              />
            ) : (
              <PublishView
                siteKey={SITE}
                role={fixture.role}
                sites={[{ siteKey: SITE, role: fixture.role }]}
                onPick={() => {}}
                pollMs={400}
                t={t}
              />
            )}
          </WithServer>
        </div>
      </div>
    </div>
  )
}

const meta = {
  title: 'Pages/In dsh/Site publish',
  component: Screen,
  parameters: { layout: 'fullscreen' },
  argTypes: { width: { control: 'inline-radio', options: [420, 760] } },
  render: (args) => <Screen key={JSON.stringify(args)} {...args} />
} satisfies Meta<typeof Screen>
export default meta
type Story = StoryObj<typeof meta>
type Play = NonNullable<Story['play']>

const SETTLE = { timeout: 10_000 }
const DRAFT: Fixture = { role: 'owner', publish: 'draft' }
const LIVE: Fixture = { role: 'owner', publish: 'published', liveSince: at(42) }

/** The one place the site's state is written on the tab: the chip beside the site's name. */
async function expectStatus(canvasElement: HTMLElement, label: string) {
  await waitFor(async () => {
    const chips = canvasElement.querySelectorAll('.tv-site-settings [data-status]')
    await expect(chips.length).toBe(1)
    await expect(canvasElement.querySelector('.tv-site-head [data-status]')).toHaveTextContent(label)
  }, SETTLE)
}
const domains = (canvasElement: HTMLElement) =>
  within(canvasElement.querySelector('[data-section="domains"]') as HTMLElement)

const flowPlay: Play = async ({ canvasElement }) => {
  await expectStatus(canvasElement, 'Draft')
  const section = domains(canvasElement)
  await userEvent.click(section.getByRole('button', { name: 'Publish' }))
  await expectStatus(canvasElement, 'Publishing…')
  await expect(section.getByText('Publishing… this takes about a minute.')).toBeVisible()
  await expect(section.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  await expectStatus(canvasElement, 'Live')

  // Back to draft, cancelled: still live.
  await userEvent.click(section.getByRole('button', { name: 'Back to draft' }))
  const asked = await within(document.body).findByRole('alertdialog', {
    name: 'Take Acme Studio back to draft?'
  })
  await userEvent.click(within(asked).getByRole('button', { name: 'Cancel' }))
  await waitFor(
    () => expect(within(document.body).queryByRole('alertdialog')).not.toBeInTheDocument(),
    SETTLE
  )
  await expectStatus(canvasElement, 'Live')

  // Back to draft, confirmed.
  await userEvent.click(section.getByRole('button', { name: 'Back to draft' }))
  const confirmed = await within(document.body).findByRole('alertdialog')
  await userEvent.click(within(confirmed).getByRole('button', { name: 'Back to draft' }))
  await expectStatus(canvasElement, 'Draft')
  await waitFor(() => expect(section.getByRole('button', { name: 'Publish' })).toBeEnabled(), SETTLE)
}

/** Click through at the side card's narrow end: draft → live → draft. */
export const Flow: Story = { args: DRAFT, play: flowPlay }

/** The Settings tab of the same site: the site head and the CMS's rows; Domains is the Publish tab's. */
export const Settings: Story = {
  args: { ...DRAFT, tab: 'settings' },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    await expect(canvasElement.querySelector('[data-section="domains"]')).toBeNull()
    await expect(canvasElement.querySelector('[data-action]')).toBeNull()
    await expect(canvasElement.querySelector('.tv-site-rows')).not.toBeNull()
    await expect(within(canvasElement).queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(
      within(canvasElement).queryByRole('button', { name: 'Connect domain' })
    ).not.toBeInTheDocument()
  }
}

/** The same click-through at the side card's wide end. */
export const FlowWide: Story = { name: 'Flow, wide', args: { ...DRAFT, width: 760 }, play: flowPlay }

/** A draft: where it answers and the one button that publishes it. */
export const Draft: Story = {
  args: DRAFT,
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await expect(section.getByText('Site address')).toBeVisible()
    await expect(section.getByRole('button', { name: 'Change' })).toBeEnabled()
    await expect(section.getByRole('button', { name: 'Publish' })).toBeEnabled()
    await expect(section.getByRole('button', { name: 'Copy address' })).toBeVisible()
  }
}

/** A publish under way: one line with a spinner in the button's place. */
export const Publishing: Story = {
  args: { ...DRAFT, operation: RUNNING, hold: true },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Publishing…')
    const section = domains(canvasElement)
    await expect(section.getByText('Publishing… this takes about a minute.')).toBeVisible()
    await expect(section.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(section.getByRole('button', { name: 'Change' })).toBeDisabled()
  }
}

/** A publish the server holds while the host has not confirmed it: said as a wait, with no button. */
export const Unconfirmed: Story = {
  args: { ...DRAFT, operation: { ...RUNNING, confirmed: false, jobId: null }, hold: true },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Publishing…')
    const section = domains(canvasElement)
    await expect(section.getByText(/Waiting for the server that runs this site to confirm/)).toBeVisible()
    await expect(section.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(section.queryByRole('alert')).not.toBeInTheDocument()
  }
}

/** Live at the Tracy address. */
export const Live: Story = {
  args: LIVE,
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Live')
    const section = domains(canvasElement)
    await expect(section.getByRole('button', { name: 'Back to draft' })).toBeEnabled()
    await expect(section.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
  }
}

/** The confirmation: what stops, said before the button that stops it. */
export const BackToDraft: Story = {
  name: 'Back to draft',
  args: { ...LIVE, hold: true },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Live')
    await userEvent.click(domains(canvasElement).getByRole('button', { name: 'Back to draft' }))
    const asked = await within(document.body).findByRole('alertdialog', {
      name: 'Take Acme Studio back to draft?'
    })
    await expect(
      within(asked).getByText(/hidden from search engines again and stops sending email/)
    ).toBeVisible()
    await expect(within(asked).getByRole('button', { name: 'Cancel' })).toHaveFocus()
  }
}

/** A Viewer: the state, and no action. */
export const Viewer: Story = {
  args: { ...DRAFT, role: 'viewer' },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await expect(section.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument()
    await expect(section.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    await expect(
      section.getByText('Only an Owner or an Editor can publish this site. Ask one of them to publish it.')
    ).toBeVisible()
  }
}

/** An Editor: publishes (ADR 0028); the address is the Owner's to change, so no Change is offered. */
export const Editor: Story = {
  args: { ...DRAFT, role: 'editor' },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await expect(section.getByRole('button', { name: 'Publish' })).toBeEnabled()
    await expect(section.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
  }
}

/** A publish that failed: one destructive line, Try again and Details. */
export const Failed: Story = {
  args: { ...DRAFT, operation: FAILED },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await expect(section.getByRole('alert')).toHaveTextContent("Couldn't publish. The site is still a draft.")
    await expect(section.getByRole('button', { name: 'Try again' })).toBeEnabled()
    await userEvent.click(section.getByRole('button', { name: 'Details' }))
    await expect(section.getByText(/The work stopped with an error/)).toBeVisible()
  }
}

/** Publishing is not set up on the server: no screen of its own — the press answers with the failure line. */
export const NotSetUp: Story = {
  name: 'Not set up',
  args: { ...DRAFT, notSetUp: true },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await userEvent.click(section.getByRole('button', { name: 'Publish' }))
    await expect(await section.findByRole('alert')).toHaveTextContent(
      "Couldn't publish. The site is still a draft."
    )
    await userEvent.click(section.getByRole('button', { name: 'Details' }))
    await expect(section.getByText(/Publishing is not set up on this server yet/)).toBeVisible()
  }
}

// ── A domain of the customer's own ──────────────────────────────────────────────────────────────

const domainCard = (canvasElement: HTMLElement) =>
  waitFor(async () => {
    const card = canvasElement.querySelector<HTMLElement>('[data-card="own-domain"]')
    await expect(card).not.toBeNull()
    return card as HTMLElement
  }, SETTLE)
/** The card names one state, once, and it is the one the fixture's answer means. */
async function expectDomain(canvasElement: HTMLElement, state: string, label: string) {
  const card = await domainCard(canvasElement)
  await expect(card).toHaveAttribute('data-domain-state', state)
  await expect(card.querySelectorAll('[data-domain-chip]').length).toBe(1)
  await expect(card.querySelector('[data-domain-chip]')).toHaveTextContent(label)
  return within(card)
}

/** The way in: an Owner whose site has no domain of its own opens the form for one. */
export const ConnectDomain: Story = {
  name: 'Domain · connect',
  args: DRAFT,
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Draft')
    const section = domains(canvasElement)
    await userEvent.click(section.getByRole('button', { name: 'Connect domain' }))
    const field = section.getByLabelText('Domain')
    await expect(field).toHaveFocus()
    await userEvent.type(field, DOMAIN)
    await userEvent.click(section.getByRole('button', { name: 'Check availability' }))
    await userEvent.click(await section.findByRole('button', { name: 'Save' }))
    const card = await expectDomain(canvasElement, 'waiting', 'Waiting for DNS')
    await expect(card.getAllByText('Not checked yet.').length).toBeGreaterThan(0)
    await expect(card.getByText(TOKEN)).toBeVisible()
    await expect(card.getByText(TARGET)).toBeVisible()
  }
}

/** Saved, the records not found yet: what to create, and that nothing was found — with the time. */
export const DomainWaiting: Story = {
  name: 'Domain · waiting for DNS',
  args: {
    ...DRAFT,
    domain: ownDomain({
      ownership: { status: 'missing', error: 'NXDOMAIN' },
      routing: { status: 'missing', error: 'NODATA' }
    })
  },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'waiting', 'Waiting for DNS')
    await expect(card.getByText(`No TXT record was found at _tracy.${DOMAIN}.`)).toBeVisible()
    await expect(card.getByText(/No CNAME record was found at shop\.example\.com\./)).toBeVisible()
    await expect(card.getByText(/Last checked/)).toBeVisible()
    await expect(card.getByRole('button', { name: 'Check again' })).toBeEnabled()
    await expect(card.queryByText('Verified')).not.toBeInTheDocument()
    // The record rows: the name and the value each have their copy button right after the text,
    // the type has none, and every label sits on the baseline of its value.
    for (const type of ['TXT', 'CNAME']) {
      await expect(card.getByRole('button', { name: `Copy ${type} record name` })).toBeVisible()
      await expect(card.getByRole('button', { name: `Copy ${type} record value` })).toBeVisible()
    }
    const baseline = (el: Element): number => {
      const probe = document.createElement('span')
      probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline'
      el.prepend(probe)
      const y = probe.getBoundingClientRect().bottom
      probe.remove()
      return y
    }
    for (const record of canvasElement.querySelectorAll('.tv-domain-record')) {
      const box = record.getBoundingClientRect()
      for (const label of record.querySelectorAll('dt')) {
        const value = label.nextElementSibling as HTMLElement
        const text = value.querySelector('[data-record-name], [data-record-value]') ?? value
        await expect(Math.abs(baseline(label) - baseline(text))).toBeLessThanOrEqual(0.5)
        await expect(text.getBoundingClientRect().right).toBeLessThanOrEqual(box.right)
        const copy = value.querySelector('[data-copy]')
        await expect(copy === null).toBe(value.hasAttribute('data-record-type'))
        if (copy !== null) await expect(text.nextElementSibling).toBe(copy)
      }
    }
  }
}

/** A record found with another value: which record, what was found, what is expected. */
export const DomainWrong: Story = {
  name: 'Domain · DNS wrong',
  args: {
    ...DRAFT,
    domain: ownDomain({
      ownership: OWNED,
      routing: { status: 'wrong', observed: ['parked.registrar.example'] }
    })
  },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'wrong', 'DNS needs fixing')
    await expect(card.getByText('Found with a different value: parked.registrar.example')).toBeVisible()
    await expect(card.getByText(TARGET)).toBeVisible()
    await expect(card.getByText('Found, with the right value.')).toBeVisible()
  }
}

/** A lookup that got no answer: said as that, never as found or as missing. */
export const DomainUnknown: Story = {
  name: 'Domain · DNS could not be read',
  args: {
    ...DRAFT,
    domain: ownDomain({ ownership: { status: 'unknown', error: 'TIMEOUT' }, routing: ROUTED })
  },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'unknown', 'DNS not checked')
    await expect(card.getByText(/The lookup got no usable answer \(TIMEOUT\)/)).toBeVisible()
  }
}

/** Both records found on a draft: publishing the site is what connects the domain. */
export const DomainVerified: Story = {
  name: 'Domain · verified',
  args: { ...DRAFT, domain: ownDomain({ ownership: OWNED, routing: ROUTED }) },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'verified', 'Verified')
    await expect(
      card.getByText(`Both records were found. Publish the site to connect ${DOMAIN}.`)
    ).toBeVisible()
    await expect(domains(canvasElement).getByRole('button', { name: 'Publish' })).toBeEnabled()
  }
}

/** Connected on a published site; Back to draft says the domain stops opening it. */
export const DomainLive: Story = {
  name: 'Domain · live',
  args: { ...LIVE, hold: true, domain: ownDomain({ state: 'connected', ownership: OWNED, routing: ROUTED }) },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'live', 'Live')
    await expect(card.getByText('The site answers at this domain.')).toBeVisible()
    await userEvent.click(domains(canvasElement).getByRole('button', { name: 'Back to draft' }))
    const asked = await within(document.body).findByRole('alertdialog')
    await expect(within(asked).getByText(`${DOMAIN} stops opening the site`)).toBeVisible()
  }
}

/** The site went live and the host did not say it connected the domain. */
export const DomainFailed: Story = {
  name: 'Domain · failed',
  args: {
    ...LIVE,
    domain: ownDomain({ ownership: OWNED, routing: ROUTED }),
    operation: { ...FAILED, domains: [DOMAIN], code: 'DOMAIN_NOT_ROUTED' }
  },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Live')
    const card = await expectDomain(canvasElement, 'failed', 'Not connected')
    await expect(card.getByRole('alert')).toHaveTextContent(
      `The site is live, but ${DOMAIN} was not connected.`
    )
    await expect(card.getByRole('button', { name: `Publish on ${DOMAIN}` })).toBeEnabled()
  }
}

/** A removal under way: the card and the address card both wait. */
export const DomainRemoving: Story = {
  name: 'Domain · removing',
  args: {
    ...LIVE,
    hold: true,
    domain: ownDomain({ state: 'connected', ownership: OWNED, routing: ROUTED }),
    operation: { ...RUNNING, op: 'drop-domain', domains: [DOMAIN] }
  },
  play: async ({ canvasElement }) => {
    await expectStatus(canvasElement, 'Live')
    const card = await expectDomain(canvasElement, 'removing', 'Removing…')
    await expect(card.queryByRole('button', { name: 'Remove domain' })).not.toBeInTheDocument()
    await expect(
      domains(canvasElement).queryByRole('button', { name: 'Back to draft' })
    ).not.toBeInTheDocument()
  }
}

/** A removal that did not finish: said on the card, with its own Try again. */
export const DomainCleanup: Story = {
  name: 'Domain · removal not finished',
  args: {
    ...LIVE,
    domain: ownDomain({ state: 'connected', ownership: OWNED, routing: ROUTED }),
    operation: { ...FAILED, op: 'drop-domain', domains: [DOMAIN], code: 'DOMAIN_STILL_ROUTED', retry: true }
  },
  play: async ({ canvasElement }) => {
    const card = await expectDomain(canvasElement, 'cleanup', 'Removal not finished')
    await expect(card.getByRole('alert')).toHaveTextContent(
      /could not be removed, so it may still open the site/
    )
    await expect(card.getByRole('button', { name: 'Try again' })).toBeEnabled()
  }
}
