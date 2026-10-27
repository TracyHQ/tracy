/**
 * The `@base-ui/react` toast — the one that stays inside the React tree. It needs a provider
 * above it, which is what `ToastToaster` (exported from `@tracy/ui` under that name to keep
 * sonner's `Toaster`) mounts along with the portal and viewport.
 *
 * Prefer this one inside a dsh plugin: sonner attaches its stack to `document.body`, which
 * belongs to the host page, not to the plugin. See `DESIGN.md` §0.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Toaster, toast } from './toast'

const meta: Meta<typeof Toaster> = {
  title: 'UI/Toast',
  component: Toaster,
  parameters: { layout: 'centered' },
  args: { closeLabel: 'Close toast' }
}
export default meta
type Story = StoryObj<typeof Toaster>

/** Every type the manager knows. Fire several — they stack and peek. */
export const Types: Story = {
  render: (args) => (
    <Toaster {...args}>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => toast.add({ title: '12 changes applied' })}>
          Plain
        </Button>
        <Button variant="outline" onClick={() => toast.add({ type: 'success', title: 'Site connected' })}>
          Success
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.add({ type: 'info', title: 'A backup was taken first' })}
        >
          Info
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.add({ type: 'warning', title: 'The webroot is read-only' })}
        >
          Warning
        </Button>
        <Button
          variant="outline"
          onClick={() => toast.add({ type: 'error', title: 'Could not reach the site' })}
        >
          Error
        </Button>
      </div>
    </Toaster>
  )
}

/** With a description and an action button. */
export const WithAction: Story = {
  render: (args) => (
    <Toaster {...args}>
      <Button
        variant="outline"
        onClick={() =>
          toast.add({
            title: '12 changes applied',
            description: 'A backup was taken first, kept for 30 days.',
            actionProps: {
              children: 'Undo',
              onClick: () => toast.add({ type: 'success', title: 'Rolled back' })
            }
          })
        }
      >
        Show a toast with an action
      </Button>
    </Toaster>
  )
}

/** Several at once, so the stack, the peek and the swipe-to-dismiss are all visible. */
export const Stack: Story = {
  render: (args) => (
    <Toaster {...args}>
      <Button
        variant="outline"
        onClick={() => {
          toast.add({ type: 'success', title: 'example.com — 12 changes applied' })
          toast.add({ type: 'info', title: 'tracy.ai — backup taken' })
          toast.add({ type: 'warning', title: 'example.org — webroot is read-only' })
        }}
      >
        Add three at once
      </Button>
    </Toaster>
  )
}
