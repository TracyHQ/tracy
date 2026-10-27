/**
 * The strip on the Quickstarts list that decides whether Design inspiration offers design systems.
 *
 * The story imports the real strip from `@tracy/harness-web` (step 1a of the UI workflow). Four
 * states: off (a fresh server), on, read-only for a person who may see /ops but not change it, and
 * not read yet — where the switch must wait rather than draw a guess.
 */
import { DesignSystemsSwitch } from '@tracy/harness-web'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect } from 'storybook/test'

const meta = {
  component: DesignSystemsSwitch,
  parameters: { layout: 'fullscreen' },
  // The ops screen paints its own page (`cms/App.tsx`); without it the dark theme draws on white.
  decorators: [
    (Story) => (
      <div className="bg-background p-6 text-foreground">
        <Story />
      </div>
    )
  ],
  args: { shown: false, writable: true, onChange: () => {} }
} satisfies Meta<typeof DesignSystemsSwitch>

export default meta
type Story = StoryObj<typeof meta>

const NAME = 'Design systems on Design templates'

/** A fresh server: off, and an owner can turn it on from here. */
export const OffByDefault: Story = {
  render: (args) => {
    const [shown, setShown] = useState<boolean | null>(args.shown)
    return <DesignSystemsSwitch {...args} shown={shown} onChange={setShown} />
  },
  play: async ({ canvas, userEvent }) => {
    await expect(canvas.getByText(NAME)).toBeVisible()
    await expect(canvas.getByText('Applies to Joomla, WordPress and EmDash.')).toBeVisible()
    const toggle = canvas.getByRole('switch', { name: NAME })
    await expect(toggle).not.toBeChecked()
    await userEvent.click(toggle)
    await expect(toggle).toBeChecked()
  }
}

export const On: Story = {
  args: { shown: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('switch', { name: NAME })).toBeChecked()
  }
}

/** An editor sees where the switch stands but cannot press it — the door would answer 403. */
export const ReadOnly: Story = {
  args: { shown: true, writable: false },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: NAME })
    await expect(toggle).toBeChecked()
    await expect(toggle).toBeDisabled()
  }
}

/** Before the read answers, the switch is neither on nor pressable. */
export const NotReadYet: Story = {
  args: { shown: null },
  play: async ({ canvas }) => {
    const toggle = canvas.getByRole('switch', { name: NAME })
    await expect(toggle).not.toBeChecked()
    await expect(toggle).toBeDisabled()
  }
}
