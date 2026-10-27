/**
 * Alert has two variants and a layout that changes shape when an icon is present: the grid drops
 * to `grid-cols-[0_1fr]` with no `svg` child. Both shapes are here, because a title-only alert
 * with a stray icon slot is a bug you only see side by side.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CircleAlertIcon, InfoIcon, TriangleAlertIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from './alert'

const meta: Meta<typeof Alert> = {
  title: 'UI/Alert',
  component: Alert,
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'destructive'] }
  },
  args: { variant: 'default' }
}
export default meta
type Story = StoryObj<typeof Alert>

export const Default: Story = {
  render: (args) => (
    <Alert className="w-[30rem]" {...args}>
      <InfoIcon />
      <AlertTitle>Site connected</AlertTitle>
      <AlertDescription>
        Tracy can read the webroot. Nothing has been changed yet — every write still goes through a proposal
        you approve.
      </AlertDescription>
    </Alert>
  )
}

export const Destructive: Story = {
  args: { variant: 'destructive' },
  render: (args) => (
    <Alert className="w-[30rem]" {...args}>
      <TriangleAlertIcon />
      <AlertTitle>Could not reach the site</AlertTitle>
      <AlertDescription>
        The tunnel answered but the webroot did not. Check that the container is running before retrying.
      </AlertDescription>
    </Alert>
  )
}

/** No icon: the grid collapses its first column. Compare the left edge with the stories above. */
export const NoIcon: Story = {
  render: (args) => (
    <Alert className="w-[30rem]" {...args}>
      <AlertTitle>Scheduled maintenance at 02:00 UTC</AlertTitle>
      <AlertDescription>Sites stay up. Only the agent lane pauses.</AlertDescription>
    </Alert>
  )
}

/** Title only — the shortest legitimate use, and the one that exposes vertical padding. */
export const TitleOnly: Story = {
  render: (args) => (
    <Alert className="w-[30rem]" {...args}>
      <CircleAlertIcon />
      <AlertTitle>Two people are editing this site right now.</AlertTitle>
    </Alert>
  )
}
