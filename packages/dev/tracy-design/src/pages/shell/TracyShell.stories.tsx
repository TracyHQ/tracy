/**
 * The dsh frame redrawn with shadcn-admin tokens — see `./index.tsx` for where the measurements come from.
 *
 * Does NOT use `AuthenticatedLayout`: this drawing REPLACES the admin shell rather than living inside it. That is also
 * why it needs no fake router — there is no navigation hook inside.
 *
 * Moved over from `vendor/shadcn-admin` on 02/09: the old place is in `.gitignore`, so no repo kept
 * this drawing. Imports changed from `@/components/ui/*` to `@tracy/ui`; the rest is kept verbatim.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'

import { TracyShell } from './index'

const meta = {
  component: TracyShell,
  parameters: { layout: 'fullscreen' },
  tags: ['ai-generated']
} satisfies Meta<typeof TracyShell>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/**
 * Collapse the left column and hide the right column — the only two things with behaviour in this drawing.
 *
 * `play` here proves exactly what the render cannot say by itself: the column really DISAPPEARS from the tree, rather
 * than being pushed off screen. Hiding by pushing it away keeps the rest of the layout computed on the old
 * width, and that is a drawing lying about the space it has.
 */
export const Collapsed: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /collapse sidebar/i }))
    // The label disappears BUT the column stays: the way back must sit inside the collapsed column, not
    // somewhere else. This is exactly what the first version got wrong — it removed the column from the tree.
    await expect(canvas.queryByText('Sitespaces')).toBeNull()
    await expect(canvas.getByRole('button', { name: /expand sidebar/i })).toBeVisible()

    await userEvent.click(canvas.getByRole('button', { name: /hide tool panel/i }))
    await expect(canvas.queryByText('Source Control')).toBeNull()
  }
}

/**
 * The Settings dialog — 800×690, a 241px navigation column, seven sections.
 *
 * Query through `ownerDocument`, not the canvas: `Dialog` renders through a portal outside the canvas,
 * so `canvas.getByText` would see nothing and the story would "go red from measuring in the wrong place".
 */
export const Settings: Story = {
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('button', { name: /^settings$/i }))
    const body = within(canvasElement.ownerDocument.body)

    // Nine sections, two groups — order copied from dsh and from `tracy-settings`.
    await expect(await body.findByText('Password Gate')).toBeVisible()
    await expect(body.getByText('User settings')).toBeVisible()
    await expect(body.getByText('Sitespace')).toBeVisible()

    // Opens on General by default.
    await expect(body.getByText('Provider presets')).toBeVisible()

    // Switching section must switch the content — what the first version did NOT do: clicking another section left
    // the content standing still, and at a glance it looked done.
    await userEvent.click(body.getByRole('button', { name: 'Plugins' }))
    await expect(await body.findByText('Tracy UI gallery')).toBeVisible()

    await userEvent.click(body.getByRole('button', { name: 'Password Gate' }))
    await expect(await body.findByText('Gateway port')).toBeVisible()
  }
}
