/**
 * AlertDialog is the one dialog with no dismiss-by-backdrop and no close button: the user must
 * answer. Every story here is therefore a decision that cannot be un-made by clicking away.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger
} from './alert-dialog'
import { Button } from './button'

const meta: Meta<typeof AlertDialog> = {
  title: 'UI/AlertDialog',
  component: AlertDialog,
  parameters: {
    // The popup renders in a portal; centring the trigger keeps both in frame.
    layout: 'centered'
  }
}
export default meta
type Story = StoryObj<typeof AlertDialog>

export const Default: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger render={<Button variant="outline" />}>Remove seat</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove this person's seat?</AlertDialogTitle>
          <AlertDialogDescription>
            They lose access to the site immediately. Their past proposals stay in the history.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Remove seat</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Destructive: the confirming button carries the weight, the cancel stays quiet. */
export const Destructive: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        <Trash2Icon />
        Delete site
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogMedia>
          <TriangleAlertIcon className="size-5 text-destructive" />
        </AlertDialogMedia>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete example.com?</AlertDialogTitle>
          <AlertDialogDescription>
            The container, the database and the webroot go away. This cannot be undone from here — only from a
            fleet backup.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction variant="destructive">Delete permanently</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** `size="sm"` for a one-line question that does not deserve a full-width popup. */
export const Small: Story = {
  render: (args) => (
    <AlertDialog {...args}>
      <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>Sign out</AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Sign out of Tracy?</AlertDialogTitle>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="sm">Stay</AlertDialogCancel>
          <AlertDialogAction size="sm">Sign out</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Open on load, so the resting style is readable in the docs page without a click. */
export const Open: Story = {
  render: (args) => (
    <AlertDialog defaultOpen {...args}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Apply 12 proposed changes?</AlertDialogTitle>
          <AlertDialogDescription>
            Tracy writes them to the site in one pass. You can roll back from the history for the next 30
            days.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Review again</AlertDialogCancel>
          <AlertDialogAction>Apply all</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
