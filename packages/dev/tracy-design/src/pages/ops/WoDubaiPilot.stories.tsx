// Production pilot component with synthetic, provider-free API records.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { WoDubaiPilot } from '../../../../../web/tracy-harness/src/Wo'
import type { WoDubaiPrefetch } from '../../../../../web/tracy-harness/src/wo-api'

function transport({ empty = false, failed = false, sourceUnavailable = false } = {}): typeof fetch {
  const at = '2026-10-20T12:00:00Z'
  const data: WoDubaiPrefetch = {
    available: true,
    campaign: empty
      ? null
      : {
          enabled: true,
          seed_source: {
            url: 'https://fixtures.example.test/google',
            fetchedAt: at,
            revision: 'synthetic-source-hash',
            osmBase: at,
            attribution: 'Synthetic Google Places fixture'
          },
          selection_rule: 'Synthetic restaurant fixture; not real Dubai observations',
          last_tick_at: at,
          next_tick_at: at,
          tick_count: 2,
          last_error: null
        },
    seeds: empty
      ? []
      : [
          {
            external_id: 'node/1',
            place_id: 'fixture-place',
            job_id: 'fixture-job',
            state: 'completed',
            stage: 'done',
            attempt: 1,
            snapshot_id: 'fixture-snapshot',
            enrichment_scope: 'full',
            published_at: at,
            last_error: null,
            facts: {
              name: 'Synthetic restaurant',
              website: null,
              rank: 1,
              opportunity: {
                score: 78,
                grade: 'A',
                pending: false,
                reasons: [
                  ['web.none', 40],
                  ['demand.reviews', 28],
                  ['marketing.unknown', null],
                  ['contact.reachable', 10]
                ]
              },
              sourceUrl: 'https://fixtures.example.test/google/node/1',
              fetchedAt: at
            },
            profile: {
              name: 'Synthetic restaurant',
              bio: 'Observed fixture website bio',
              phone: '+000 fixture',
              address: 'Synthetic address'
            },
            sources: [
              {
                source: 'website',
                status: 'partial',
                reason: 'limit',
                fetchedAt: at,
                coverage: { fetched: 2 }
              }
            ],
            socials: [
              {
                network: 'instagram',
                url: 'https://www.instagram.com/fixture.restaurant/',
                verifiedBy: 'website',
                observedAt: at
              }
            ]
          }
        ],
    controls: {
      tickSeconds: 15,
      maxPlaces: 50,
      maxPrefetchConcurrency: 1,
      websitePages: 40,
      providerStarts: 0,
      providerCostCents: 0,
      paidSocialEnabled: false
    },
    socialStatus: 'blocked',
    sharedPlaceDistribution: 'unavailable'
  }
  if (sourceUnavailable && data.campaign) {
    data.seeds = []
    data.campaign.enabled = false
    data.campaign.seed_source.fetchedAt = null
    data.campaign.seed_source.revision = null
    data.campaign.last_error = 'Synthetic source timeout; no verified seeds imported.'
  }
  return (async (_url, init) => {
    if (failed) return new Response('{}', { status: 503 })
    if (init?.method === 'POST') {
      const { action, concurrency } = JSON.parse(String(init.body))
      if (action === 'concurrency') data.controls.maxPrefetchConcurrency = concurrency
      else if (data.campaign) data.campaign.enabled = action === 'start'
      return Response.json({ updated: true })
    }
    return Response.json(data)
  }) as typeof fetch
}
const meta = {
  title: 'Screens/Ops/Dubai pilot',
  component: WoDubaiPilot,
  args: { writable: true },
  parameters: { layout: 'padded' }
} satisfies Meta<typeof WoDubaiPilot>
export default meta
type Story = StoryObj<typeof meta>
export const Running: Story = {
  args: { fetchImpl: transport() },
  play: async ({ canvasElement }) => {
    const c = within(canvasElement)
    await c.findByRole('button', { name: 'Stop pilot' })
    await expect(c.getByText('The same Research customers run')).toBeVisible()
    await expect(c.getByText('No website listed')).toBeVisible()
    await userEvent.click(c.getByText('Latest published profile'))
    await expect(c.getByText('Observed fixture website bio')).toBeVisible()
    await userEvent.click(c.getByRole('button', { name: 'Stop pilot' }))
    await waitFor(() => expect(c.queryByRole('button', { name: 'Stop pilot' })).not.toBeInTheDocument())
    await expect(c.getByRole('button', { name: 'Start pilot' })).toBeVisible()
  }
}
export const Empty: Story = { args: { fetchImpl: transport({ empty: true }) } }
export const ErrorState: Story = { args: { fetchImpl: transport({ failed: true }) } }
export const ReadOnly: Story = { args: { writable: false, fetchImpl: transport() } }

export const SourceUnavailable: Story = { args: { fetchImpl: transport({ sourceUnavailable: true }) } }
