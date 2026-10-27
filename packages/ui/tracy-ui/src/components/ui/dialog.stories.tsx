/**
 * Dialog is dismissible — backdrop click and Escape both close it. That is the whole difference
 * from `AlertDialog`, and picking the wrong one is how a destructive confirmation ends up
 * cancellable by a stray click.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from './dialog'
import { Input } from './input'
import { Label } from './label'

const meta: Meta<typeof Dialog> = {
  title: 'UI/Dialog',
  component: Dialog,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Dialog>

export const Default: Story = {
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger render={<Button variant="outline" />}>Invite someone</DialogTrigger>
      <DialogContent closeLabel="Close" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite to example.com</DialogTitle>
          <DialogDescription>
            They get a seat on this site only. Sending the invitation does not create an account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" type="email" placeholder="name@example.com" />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button>Send invitation</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Open on load, so the docs page shows the popup instead of a lone trigger. */
export const Open: Story = {
  render: (args) => (
    <Dialog defaultOpen {...args}>
      <DialogContent closeLabel="Close" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename site</DialogTitle>
          <DialogDescription>Only the label changes. The domain stays as it is.</DialogDescription>
        </DialogHeader>
        <Input defaultValue="example.com" />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** `showCloseButton={false}` — for a dialog whose only exits are its own buttons. */
export const NoCloseButton: Story = {
  render: (args) => (
    <Dialog defaultOpen {...args}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Finish setting up this site</DialogTitle>
          <DialogDescription>Two steps left. You can come back to this later.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Later</DialogClose>
          <Button>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Long body: the popup scrolls its content, not the page behind it. */
export const Scrolling: Story = {
  render: (args) => (
    <Dialog defaultOpen {...args}>
      <DialogContent closeLabel="Close" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>18 proposed changes</DialogTitle>
          <DialogDescription>Review before Tracy writes anything.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto rounded-lg border p-3">
          {Array.from({ length: 18 }, (_, i) => (
            <p key={i} className="border-b py-2 font-mono text-xs last:border-0">
              wp-content/themes/tracy/page-{i + 1}.php
            </p>
          ))}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button>Apply all</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
