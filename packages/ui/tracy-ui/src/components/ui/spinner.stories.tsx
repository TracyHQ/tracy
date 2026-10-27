/**
 * A spinner with no accessible name is invisible to a screen reader, so this one ships
 * `role="status"` and `aria-label="Loading"` built in. Do not strip them to reuse the shape as a
 * decorative icon — use a plain lucide icon for that.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Spinner } from './spinner'

const meta: Meta<typeof Spinner> = {
  title: 'UI/Spinner',
  component: Spinner,
  args: { label: 'Loading' }
}
export default meta
type Story = StoryObj<typeof Spinner>

export const Default: Story = {}

/** Size comes from a class; the default is `size-4`. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      {['size-3', 'size-4', 'size-6', 'size-8'].map((size) => (
        <Spinner key={size} className={size} label="Loading" />
      ))}
    </div>
  )
}

/** Inside a button — the pending state of an action. */
export const InButton: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button disabled>
        <Spinner data-icon="inline-start" label="Loading" />
        Provisioning…
      </Button>
      <Button variant="outline" size="icon-sm" disabled aria-label="Working">
        <Spinner label="Loading" />
      </Button>
    </div>
  )
}
