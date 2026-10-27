/**
 * `/ops/cms/inspiration` — what customers on THIS server are offered on Design inspiration, what is
 * held back and why, and the way to the card editor (`tasks/todo-ops-design-inspiration.md`).
 *
 * The story imports the real screen from `@tracy/harness-web` (step 1a of the UI workflow); the
 * mockup it was approved from (`Mockups/Ops Design inspiration`, Lee 04/10/2026) is deleted in the
 * same change. Storybook has no tracy-web behind it, so a stand-in `fetch` answers the doors the
 * screen calls for the length of each story.
 *
 * DATA: "Shown to customers" is `GET https://cowork.tracy.site/api/templates` as read on 04/10/2026
 * 17:36, reshaped into `GET /api/ops/inspiration` (`inspiration.dev-0410.json`). That read carried each
 * demo's VERSION, not its address, so the demo URLs in the file are PLACEHOLDERS: the list never
 * draws them, and the card sheet's "Demo on this server" line does — do not read it as dev's. The "Not shown" and "No card" rows are EXAMPLES — reading them needs a seat — and their
 * `why` sentences are the ones the server writes.
 */
import { App, Inspiration } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, waitFor, within } from 'storybook/test'

import DEV from './inspiration.dev-0410.json'

type Listing = typeof DEV

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  )

/** The card sheet's own door, answered from the listing: enough for the sheet to draw its body. */
function cardDetail(listing: Listing, tag: string) {
  const template = listing.shown.find((t) => t.platforms.some((p) => p.tag === tag))
  const platform = template?.platforms.find((p) => p.tag === tag)
  return {
    tag,
    writable: listing.writable,
    refusal: null,
    label: template?.label ?? tag,
    version: platform?.version ?? null,
    languages: ['en'],
    platform: platform?.platform ?? null,
    template: template?.id ?? null,
    demo: platform?.demo ?? null,
    platforms: (template?.platforms ?? []).map((p) => ({
      platform: p.platform,
      tag: p.tag,
      version: p.version
    })),
    card: template
      ? {
          provider: template.card.provider,
          category: template.card.category,
          blurb: template.card.blurb,
          image: '',
          layouts: [{ key: 'home', label: 'Home', path: '/', shots: {} }]
        }
      : null,
    published: Boolean(template),
    shots: [],
    categories: [template?.card.category ?? 'Starter'],
    reason: null
  }
}

/** Stand in for the doors the screen calls until the story ends. */
function doors(listing: Listing, { at }: { at?: string } = {}) {
  return () => {
    const original = window.fetch
    const address = window.location.href
    if (at) window.history.replaceState({}, '', at)
    window.fetch = (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), window.location.href)
      if (url.pathname === '/api/ops/inspiration') return json(200, listing)
      if (url.pathname === '/api/ops/quickstart/inspiration')
        return json(200, cardDetail(listing, url.searchParams.get('tag') ?? ''))
      if (url.pathname === '/api/ops/cms/environments')
        return json(200, { status: 'ok', generatedAt: listing.readAt, environments: [] })
      if (url.pathname === '/api/ops/me') return json(200, { email: 'owner@tracy.test', role: 'owner' })
      // Anything else is Storybook's own (its `index.json`): resolved against the address the
      // iframe had, so moving the page to `/ops/cms/…` does not send it to a path that is not there.
      return original(typeof input === 'string' ? new URL(input, address).href : input, init)
    }
    return () => {
      window.fetch = original
      if (at) window.history.replaceState({}, '', address)
    }
  }
}

const screenRender = () => (
  <div className="min-h-screen bg-background text-foreground">
    <Inspiration />
  </div>
)

const meta = {
  component: Inspiration,
  parameters: { layout: 'fullscreen' },
  render: screenRender,
  beforeEach: doors(DEV)
} satisfies Meta<typeof Inspiration>

export default meta
type Story = StoryObj<typeof meta>

const SWITCH = 'Design systems on Design templates'

/**
 * The whole `/ops` page at `/ops/cms/inspiration`: the screen sits directly above Quickstarts in
 * the rail, the catalogue reads as the repo's, and there is no environment picker — this screen
 * reads the server, not a ref.
 */
export const InTheRail: StoryObj<typeof App> = {
  render: () => <App />,
  beforeEach: doors(DEV, { at: '/ops/cms/inspiration' }),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('heading', { name: 'Design templates' })).toBeVisible()
    const links = canvas.getAllByRole('link').map((a) => a.textContent?.trim())
    await expect(links.indexOf('Design templates')).toBeGreaterThan(-1)
    await expect(links.indexOf('Design templates')).toBe(links.indexOf('Quickstarts') - 1)
    await expect(canvas.getByRole('link', { name: 'Design templates' })).toHaveAttribute(
      'aria-current',
      'page'
    )
    await expect(canvas.getByRole('link', { name: 'Repo catalogue' })).toBeVisible()
    await expect(screen.queryByRole('combobox', { name: /environment/i })).toBeNull()
    // The area's CMS bar would be a second CMS control with nothing to change here.
    await expect(canvas.queryByRole('group', { name: 'CMS' })).toBeNull()
    await expect(await canvas.findByText('30 of 30')).toBeVisible()
  }
}

/** The 30 cards dev offered on 04/10 — one row per TEMPLATE, grouped by category. */
export const ShownToCustomers: Story = {
  play: async ({ canvas }) => {
    await expect(await canvas.findByText('30 of 30')).toBeVisible()
    await expect(canvas.getAllByRole('button', { name: 'Edit card' })).toHaveLength(30)
    // Tracy Business builds on three CMSes and is still one row.
    const row = canvas.getByText('Tracy Business').closest('tr') as HTMLElement
    await expect(within(row).getByText('Joomla')).toBeVisible()
    await expect(within(row).getByText('WordPress')).toBeVisible()
    await expect(within(row).getByText('EmDash')).toBeVisible()
    await expect(canvas.getByText('Shown to customers · 30')).toBeVisible()
    await expect(canvas.getByText('cowork.tracy.site')).toBeVisible()
    // The library switch lives here, not on Quickstarts.
    await expect(canvas.getByRole('switch', { name: SWITCH })).toBeVisible()
    // A warning is drawn ON a shown card, not as a reason it is off.
    const tracy = canvas.getByText('Tracy Base').closest('tr') as HTMLElement
    await expect(within(tracy).getByText('1 warning')).toBeVisible()
  }
}

/** EmDash narrows the list to the one card that builds on it. */
export const FilterEmDash: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('30 of 30')
    await userEvent.click(canvas.getByRole('button', { name: 'EmDash' }))
    await expect(canvas.getByText('1 of 30')).toBeVisible()
    await expect(canvas.getByText('Tracy Business')).toBeVisible()
  }
}

/** Held back: a card exists, customers do not get it, and the row says why. */
export const NotShown: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('tab', { name: 'Not shown · 2' }))
    await expect(canvas.getByText('Unpublished from Design inspiration')).toBeVisible()
    await expect(canvas.getByText('A draft is not published, so nothing could install it.')).toBeVisible()
  }
}

/** A release a site can start from, with no card: the press that makes one. */
export const NoCard: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('tab', { name: 'No card · 2' }))
    await expect(canvas.getAllByRole('button', { name: 'Create card' })).toHaveLength(2)
  }
}

/** Edit opens the existing editor on one of the template's releases, and says how far a publish reaches. */
export const EditCard: Story = {
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText('30 of 30')
    const row = canvas.getByText('Tracy Business').closest('tr') as HTMLElement
    await userEvent.click(within(row).getByRole('button', { name: 'Edit card' }))
    const sheet = await screen.findByRole('dialog')
    // The sheet slides in; wait for it to settle rather than read it mid-animation.
    await waitFor(() => expect(within(sheet).getByText(/One card, 3 builds/)).toBeVisible(), {
      timeout: 3000
    })
    await expect(within(sheet).getByRole('combobox', { name: 'Release' })).toBeVisible()
    await expect(
      await within(sheet).findByText(/other servers pick it up at their next refresh/)
    ).toBeVisible()
  }
}

/** A seat that may read /ops but not write: everything readable, nothing pressable. */
export const ReadOnly: Story = {
  beforeEach: doors({ ...DEV, writable: false }),
  play: async ({ canvas }) => {
    await canvas.findByText('30 of 30')
    // base-ui's switch is a <span>, so "disabled" is its aria state, not the DOM attribute.
    await expect(canvas.getByRole('switch', { name: SWITCH })).toHaveAttribute('aria-disabled', 'true')
    await expect(canvas.getByRole('button', { name: /Refresh from GitHub/ })).toBeDisabled()
  }
}
