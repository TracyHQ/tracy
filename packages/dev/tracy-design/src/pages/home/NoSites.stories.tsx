/**
 * Three states of the same page, side by side — what the bench cannot show, because the bench registers
 * ONE view per ONE path and that view can only render one state.
 *
 * `Empty` is the case measured on production on 02/09 with a real account: an account, no
 * seat anywhere, and today it gets exactly one 403 line.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect } from 'storybook/test'

import { NoSites } from './NoSites'

const meta = {
  component: NoSites,
  parameters: { layout: 'fullscreen' },
  args: { email: 'samfounder@example.com' }
} satisfies Meta<typeof NoSites>

export default meta
type Story = StoryObj<typeof meta>

/**
 * No site, no invitation — what real users are seeing.
 *
 * `play` guards the thing most likely to drift: BOTH branches of the Add site flow must be present. Drawing only
 * "Create a new site" names half the flow and drops the other half — exactly what
 * `docs/references/vocabulary.md` §2 forbids.
 */
export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('button', { name: 'Create a new site' })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Import existing site' })).toBeVisible()
    // No invitation means no invitation block: an empty block with a title is an empty promise.
    await expect(canvas.queryByText('Waiting for you')).toBeNull()
  }
}

/** No site BUT already invited: the seat is already in the book, waiting to be accepted. */
export const WithInvitations: Story = {
  args: {
    invitations: [
      { site: 'joomlart.com', role: 'Editor', from: 'Mai' },
      { site: 'acme.com', role: 'Owner', from: 'Lee' }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Waiting for you')).toBeVisible()
    await expect(canvas.getAllByRole('button', { name: 'Join team' })).toHaveLength(2)
    // An invitation must NOT replace Add site: people may decline and build their own site.
    await expect(canvas.getByRole('button', { name: 'Create a new site' })).toBeVisible()
  }
}

/**
 * Just pressed create. The page must change its whole story, not just add a spinner in a corner.
 *
 * `play` proves both buttons are GONE: leaving them is inviting the user to press create a second time
 * while the first lane is building — and every press is a real container.
 */
export const Building: Story = {
  args: { building: 'acme.com' },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('progressbar')).toBeVisible()
    await expect(canvas.queryByRole('button', { name: 'Create a new site' })).toBeNull()
    await expect(canvas.queryByRole('button', { name: 'Import existing site' })).toBeNull()
  }
}
