/**
 * `harness.tracy.ai` — two screens, and the button that links them.
 *
 * The story IMPORTS the real code from `@tracy/harness-web` (step 1a of the UI workflow). The mockup that used to live at
 * `Mockups/Harness` was deleted in the same pass: keeping it would mean two versions of one screen in the repo, and the
 * version nobody syncs is the one people read.
 *
 * The four states here are not assumptions — they are today's library: SEO/GEO has no skill
 * of its own, Joomla and Emdash contribute nothing, three of the four agents have no persona written yet, and
 * a row that comes from the platform cannot be switched off by the agent.
 */
import { App, CmsAgents, Inventory, Preset } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen } from 'storybook/test'

const meta = {
  component: App,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

/** Menu one: four agents side by side. Rows here are decisions people write, so they can be switched on/off. */
export const Agents: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('heading', { name: 'CMS agents' })).toBeVisible()
    // Editable: this screen READS the matrix, which people write.
    await expect(canvas.getAllByRole('switch').length).toBeGreaterThan(0)
    // And the file it is a reading of must be reachable, right at the top of the screen.
    await expect(canvas.getByRole('link', { name: /mode-matrix\.json/ })).toBeVisible()
    // Three of the four agents have no persona, and the left column says so without opening anything.
    await expect(canvas.getAllByText('no persona')).toHaveLength(3)
  }
}

/**
 * Switching a row off changes nothing for customers, and the screen must say so before someone leaves believing
 * the opposite (ADR 0008).
 */
export const EditedButNotShipped: Story = {
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.queryByRole('button', { name: /Create pull request/ })).toBeNull()
    await userEvent.click(canvas.getByRole('switch', { name: 'tool-bash on for this agent' }))
    await expect(canvas.getByRole('button', { name: /Create pull request/ })).toBeVisible()
    await expect(canvas.getByText(/Nothing has changed for a customer yet/)).toBeVisible()
  }
}

/** A platform row is not this agent's to switch off. */
export const PlatformRowIsLocked: Story = {
  play: async ({ canvas }) => {
    const locked = canvas.getByRole('switch', { name: 'tracy-webroot-read on for this agent' })
    await expect(locked).toBeChecked()
    await expect(locked).toBeDisabled()
    await expect(canvas.getByText('from WordPress')).toBeVisible()
  }
}

/** The only door to screen two, carrying the selected pair. */
export const OpenPresetCarriesTheChoice: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: 'Writer' }))
    await userEvent.click(canvas.getByRole('button', { name: 'Joomla' }))
    await userEvent.click(canvas.getByRole('button', { name: /Open preset/ }))

    await expect(canvas.getByText('writer-joomla')).toBeVisible()
    // Generated, so there is nothing to switch on: the difference between the two screens fits in one assertion.
    await expect(canvas.queryAllByRole('switch')).toHaveLength(0)
    await expect(canvas.getByText('Read-only · generated')).toBeVisible()
  }
}

/** Menu two, and the file the left-hand reading is a reading OF. */
export const PresetFile: StoryObj<typeof Preset> = {
  render: () => <Preset role="designer" platform="wordpress" onBack={() => {}} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('tab', { name: /agent\.cordis\.yml/ }))
    await expect(canvas.getByText(/@deepseek-ai\/dsh-tool-bash/)).toBeVisible()
    await expect(canvas.getByText(/customSkillDirs/)).toBeVisible()
    // Nothing to type into, anywhere.
    await expect(canvas.queryByRole('textbox')).toBeNull()
  }
}

/** SEO/GEO: the agent exists, the skills do not — the five it lists are borrowed from copy and competitive. */
export const SeoGeoBorrowsItsSkills: StoryObj<typeof CmsAgents> = {
  render: () => <CmsAgents role="seo-geo" platform="wordpress" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('seo-geo-wordpress')).toBeVisible()
    await expect(canvas.getByText('copywriting')).toBeVisible()
    await expect(canvas.getByText('marketing-psychology')).toBeVisible()
  }
}

/**
 * Emdash still contributes nothing, and that sentence sits right under the word Platform.
 *
 * This story USED to use Joomla. On 03/09 Joomla got the `t4-framework-knowledge` skill imported from
 * `TracyHQ/skills`, so it stopped being empty — and the story went red, exactly as it should: a screen saying "nothing yet"
 * about a platform that has something is a screen saying the wrong thing.
 */
export const PlatformWithNoOverlay: StoryObj<typeof CmsAgents> = {
  render: () => <CmsAgents role="developer" platform="emdash" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/EmDash adds nothing yet/)).toBeVisible()
    await expect(canvas.getByText('developer-emdash')).toBeVisible()
    await expect(canvas.queryByText(/^from /)).toBeNull()
  }
}

/** Joomla has had one skill since 03/09, and the screen must state that exact number. */
export const JoomlaHasOneSkillNow: StoryObj<typeof CmsAgents> = {
  render: () => <CmsAgents role="developer" platform="joomla" />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText(/Joomla adds 0 tools · 1 skill/)).toBeVisible()
    await expect(canvas.getByText('t4-framework-knowledge')).toBeVisible()
    await expect(canvas.getByText('from Joomla')).toBeVisible()
  }
}

/** Looking across: which agents have this row — the reverse question of the roster. */
export const MatrixView: StoryObj<typeof CmsAgents> = {
  render: () => <CmsAgents view="matrix" />,
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText('79 of 79 rows')).toBeVisible()
    // Every row says where it lives; skills can be linked, dsh plugins cannot.
    await expect(canvas.getByRole('link', { name: 'vendor/tracy/od-skill/skills/brandkit' })).toBeVisible()
    await expect(canvas.getByText('@deepseek-ai/dsh-tool-bash')).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /Agent/ }))
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Designer' }))
    await userEvent.keyboard('{Escape}')
    await expect(canvas.getByText('40 of 79 rows')).toBeVisible()
  }
}

/**
 * QS Inventory, the operator screen at `/ops/cms/inventory`: a pool on "Hold for review" and the
 * one press that releases a held build (#795). The real `Inventory` is mounted; its doors
 * (`/api/ops/inventory/*`) are answered by a stand-in `fetch` for the length of the story, because
 * Storybook has no tracy-web behind it.
 */
const INVENTORY_GENERATION = '9f3c1a7be2d44c05a1b2c3d4e5f60718'
const INVENTORY_POOL = {
  poolKey: `dev:h1:wordpress:tracy-base/wp7:1.1.0:${INVENTORY_GENERATION}`,
  environment: 'dev',
  host: 'h1',
  platform: 'wordpress',
  quickstartTag: 'tracy-base/wp7',
  quickstartVersion: '1.1.0',
  generation: INVENTORY_GENERATION,
  policy: {
    enabled: true,
    lowWatermark: 1,
    targetReady: 2,
    maxStock: 4,
    maxConcurrentPrepares: 1,
    reviewHold: true,
    maxAttempts: 3,
    healthTtlSeconds: 86400,
    paused: false,
    pausedReason: null
  },
  revision: 1,
  supply: {
    ready: 0,
    preparing: 0,
    awaitingReview: 1,
    reserved: 0,
    assigned: 0,
    quarantined: 0,
    draining: 0,
    stock: 1,
    handedOver: 0
  }
}
const INVENTORY_HELD = {
  id: '11111111-1111-4111-8111-111111111111',
  poolKey: INVENTORY_POOL.poolKey,
  siteKey: 'stock-1111.tracy.test',
  label: 'stock-1111',
  url: 'http://stock-1111.tracy.test',
  host: 'h1',
  generation: INVENTORY_GENERATION,
  state: 'awaiting_review',
  jobId: null,
  attempts: 0,
  nextAttemptAt: null,
  healthOk: true,
  healthCheckedAt: null,
  healthDetail: null,
  hashes: { platform: 'wordpress', platformVersion: '7.0', cowork: '0.17.3', contractDeclared: null },
  reserved: false,
  reservedAt: null,
  lastError: null,
  createdAt: '2026-10-03T08:00:00Z',
  updatedAt: '2026-10-03T08:00:00Z'
}

/** Stand in for the inventory doors until the story ends; `approve` is the approve door's answer. */
function inventoryDoors(approve: { status: number; body: unknown }) {
  return () => {
    const original = window.fetch
    let released = false
    const answer = (status: number, body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
      )
    window.fetch = (input, init) => {
      const { pathname } = new URL(String(input instanceof Request ? input.url : input), window.location.href)
      if (pathname === '/api/ops/inventory/approve') {
        released = approve.status === 200
        return answer(approve.status, approve.body)
      }
      if (pathname === '/api/ops/inventory/instances')
        return answer(200, {
          instances: [{ ...INVENTORY_HELD, state: released ? 'ready' : 'awaiting_review' }]
        })
      if (pathname === '/api/ops/inventory/eligible') return answer(200, { recorded: 0, quickstarts: [] })
      if (pathname === '/api/ops/inventory')
        return answer(200, {
          pools: [
            released
              ? { ...INVENTORY_POOL, supply: { ...INVENTORY_POOL.supply, ready: 1, awaitingReview: 0 } }
              : INVENTORY_POOL
          ]
        })
      return original(input, init)
    }
    return () => {
      window.fetch = original
    }
  }
}

const inventoryRender = () => (
  <div className="bg-background text-foreground">
    <Inventory cms="wordpress" />
  </div>
)

/** A held build: the row offers Approve, and the review shows what is approved before any press. */
export const InventoryHeldForReview: StoryObj<typeof Inventory> = {
  render: inventoryRender,
  beforeEach: inventoryDoors({ status: 200, body: { released: true, alreadyApproved: false } }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /tracy-base\/wp7/ }))
    await expect(await canvas.findByText('awaiting_review')).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Approve' }))
    const review = await screen.findByRole('dialog')
    await expect(review).toHaveTextContent(INVENTORY_GENERATION)
    await expect(review).toHaveTextContent('platformVersion')
    await expect(review).toHaveTextContent('0.17.3')
    await expect(screen.getByRole('button', { name: 'Approve this generation' })).toBeEnabled()
  }
}

/** Confirmed by the door: the instance is released and the row is read again as ready. */
export const InventoryApproved: StoryObj<typeof Inventory> = {
  render: inventoryRender,
  beforeEach: inventoryDoors({ status: 200, body: { released: true, alreadyApproved: false } }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /tracy-base\/wp7/ }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Approve' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Approve this generation' }))
    await expect(await canvas.findByText(/stock-1111 is released to ready/)).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Approve' })).toBeNull()
  }
}

/** Refused because the instance changed after the review opened: said so, and nothing is released. */
export const InventoryApprovalRefused: StoryObj<typeof Inventory> = {
  render: inventoryRender,
  beforeEach: inventoryDoors({ status: 409, body: { code: 'HASH_MISMATCH' } }),
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: /tracy-base\/wp7/ }))
    await userEvent.click(await canvas.findByRole('button', { name: 'Approve' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Approve this generation' }))
    await expect(await screen.findByRole('alert')).toHaveTextContent(/nothing was approved/)
    // The review is still open over the page, so the row is read by its text, not by role.
    await expect(canvas.getByText('awaiting_review')).toBeVisible()
  }
}
