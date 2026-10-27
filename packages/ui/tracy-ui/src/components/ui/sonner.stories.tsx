/**
 * Two toasters exist in this library and they are not interchangeable.
 *
 * `Toaster` (this file) is sonner: it opens a portal on `document.body` and a module-level
 * `toast()` call reaches it from anywhere. That is convenient on a page Tracy owns, and wrong
 * inside a dsh plugin — a plugin lives in the host's document and must not attach a stack to the
 * host's body. See `DESIGN.md` §0.
 *
 * `ToastToaster` (see UI/Toast) is the `@base-ui/react` primitive: it stays inside the React tree
 * and needs a provider. That is the one a plugin can use.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { toast as sonnerToast } from 'sonner'

import { Button } from './button'
import { Toaster } from './sonner'

const meta: Meta<typeof Toaster> = {
  title: 'UI/Sonner',
  component: Toaster,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Toaster>

/** Every kind sonner draws, so the icons and colours can be compared in one pass. */
export const Kinds: Story = {
  render: (args) => (
    <>
      <Toaster {...args} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => sonnerToast('12 changes applied to example.com')}>
          Plain
        </Button>
        <Button variant="outline" onClick={() => sonnerToast.success('Site connected')}>
          Success
        </Button>
        <Button variant="outline" onClick={() => sonnerToast.info('A backup was taken first')}>
          Info
        </Button>
        <Button variant="outline" onClick={() => sonnerToast.warning('The webroot is read-only')}>
          Warning
        </Button>
        <Button variant="outline" onClick={() => sonnerToast.error('Could not reach the site')}>
          Error
        </Button>
        <Button variant="outline" onClick={() => sonnerToast.loading('Provisioning…')}>
          Loading
        </Button>
      </div>
    </>
  )
}

/** With a description and an action — the shape a real notification takes. */
export const WithAction: Story = {
  render: (args) => (
    <>
      <Toaster {...args} />
      <Button
        variant="outline"
        onClick={() =>
          sonnerToast('12 changes applied', {
            description: 'A backup was taken first, kept for 30 days.',
            action: { label: 'Undo', onClick: () => sonnerToast('Rolled back') }
          })
        }
      >
        Show a toast with an action
      </Button>
    </>
  )
}

/** A promise: pending, then resolved or rejected, without wiring three calls by hand. */
export const Promise: Story = {
  render: (args) => (
    <>
      <Toaster {...args} />
      <Button
        variant="outline"
        onClick={() =>
          sonnerToast.promise(new window.Promise((resolve) => setTimeout(resolve, 1800)), {
            loading: 'Provisioning example.com…',
            success: 'Site is up',
            error: 'Provisioning failed'
          })
        }
      >
        Run a promise toast
      </Button>
    </>
  )
}
