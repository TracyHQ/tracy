/**
 * `harness.tracy.ai` → Host agents: which build each fleet host runs, and whether the machines match.
 *
 * The story IMPORTS the real code from `@tracy/harness-web` (step 1a of the UI workflow), so there is no parallel mockup
 * to drift.
 *
 * `fetchImpl` is injected in each story: the screen calls `/api/host-agents` on mount, and there is no
 * Worker behind Storybook. The answer's shape is copied from `payloadFrom` in
 * `packages/fleet/tracy-fleet-operation/scripts/provision/dsh-versions.mjs` and `listHostAgents`
 * in `workers/harness/src/hosts.js` — not made up.
 *
 * ⚠ THE FOUR STATES BELOW ARE THE FOUR THINGS THIS SCREEN EXISTS TO SAY, and three of the four can only be seen
 * here: a fleet in step, a fleet with a version drift, a dark host, and a Worker missing its key. On the
 * real fleet we cannot set up the last three at will, so this is the only place they are reviewed
 * by eye before reaching users.
 */
import { HostAgents, type HostAgentsPayload } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'

const packages = (bundle: string, addSite: string) => [
  { name: '@tracy/dsh-add-site', version: addSite },
  { name: '@tracy/dsh-brand', version: '0.4.2' },
  { name: '@tracy/dsh-my-sites', version: '0.6.1' },
  { name: '@tracy/dsh-native-bundle', version: bundle },
  { name: '@tracy/dsh-site-build', version: '0.3.0' },
  { name: '@tracy/dsh-subprocess-docker', version: '0.2.4' },
  { name: '@tracy/dsh-webroot-read', version: '0.3.1' }
]

const live = (host: string, tag: string, pkgs: ReturnType<typeof packages>) => ({
  host,
  ok: true,
  image: { repository: 'ghcr.io/tracyhq/tracy-dsh', tag, previous: '2026-09-06-9a8b7c6' },
  container: {
    name: 'tracy-dsh',
    status: 'running',
    health: 'healthy',
    startedAt: '2026-09-08T02:10:00Z',
    image: `ghcr.io/tracyhq/tracy-dsh:${tag}`
  },
  packages: pkgs,
  note: null,
  error: null
})

const dark = (host: string, error: string) => ({
  host,
  ok: false,
  image: null,
  container: null,
  packages: [],
  note: null,
  error
})

const answering = (body: HostAgentsPayload): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch

const meta = {
  component: HostAgents,
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof HostAgents>

export default meta
type Story = StoryObj<typeof meta>

/** A good day: all three machines answer, same image, no package drifts. */
export const InStep: Story = {
  args: {
    fetchImpl: answering({
      hosts: [
        live('do', '2026-09-07-a1b2c3d', packages('0.9.6', '0.4.0')),
        live('contabo', '2026-09-07-a1b2c3d', packages('0.9.6', '0.4.0')),
        dark('dev', 'fetch failed')
      ],
      drift: {},
      error: null,
      measuredAt: new Date().toISOString()
    })
  }
}

/**
 * One machine not redeployed yet — exactly what this screen was made to show.
 *
 * One repo builds both images, so a drift here is not "which machine is right" but "which machine has not
 * been rebuilt". And `@tracy/dsh-site-build` is ENTIRELY ABSENT on contabo: a worse drift than a version drift, because
 * the old image simply lacks that folder and nothing says so by itself.
 */
export const Drifted: Story = {
  args: {
    fetchImpl: answering({
      hosts: [
        live('do', '2026-09-08-ffee001', packages('0.9.6', '0.4.0')),
        {
          ...live('contabo', '2026-09-05-1122334', packages('0.9.4', '0.3.9')),
          packages: packages('0.9.4', '0.3.9').filter((p) => p.name !== '@tracy/dsh-site-build')
        },
        dark('dev', 'fetch failed')
      ],
      drift: {
        '@tracy/dsh-add-site': { do: '0.4.0', contabo: '0.3.9' },
        '@tracy/dsh-native-bundle': { do: '0.9.6', contabo: '0.9.4' },
        '@tracy/dsh-site-build': { do: '0.3.0', contabo: null }
      },
      error: null,
      measuredAt: new Date().toISOString()
    })
  }
}

/**
 * A half-done deploy: the env file has the new tag, the container has not restarted yet.
 *
 * `image.tag` (what the machine CLAIMS to run) and `container.image` (what docker SAYS is running) disagree, and that is
 * why the screen carries both, not just one. The container has no healthcheck here either — a grey dot,
 * not a red one: "not saying" differs from "not healthy".
 */
export const HalfDeployed: Story = {
  args: {
    fetchImpl: answering({
      hosts: [
        {
          ...live('do', '2026-09-08-ffee001', packages('0.9.6', '0.4.0')),
          container: {
            name: 'tracy-dsh',
            status: 'running',
            health: null,
            startedAt: '2026-09-05T02:10:00Z',
            image: 'ghcr.io/tracyhq/tracy-dsh:2026-09-05-1122334'
          }
        },
        dark('contabo', 'The operation was aborted due to timeout'),
        dark('dev', 'fetch failed')
      ],
      drift: {},
      error: null,
      measuredAt: new Date().toISOString()
    })
  }
}

/**
 * The Worker is missing `FLEET_RELAY_SECRET`: no host gets asked, and the screen must say exactly that.
 *
 * Quite different from "the whole fleet is dark", though it looks identical at a glance — and it is fixed somewhere entirely
 * different, so it gets its own line instead of three red rows.
 */
export const WorkerHasNoKey: Story = {
  args: {
    fetchImpl: answering({
      hosts: [],
      drift: {},
      error: 'FLEET_RELAY_SECRET is not set on this Worker',
      measuredAt: new Date().toISOString()
    })
  }
}
