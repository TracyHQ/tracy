/**
 * Card carries a `size` the classic shadcn card does not have, and a `CardAction` slot that only
 * lands correctly when a `CardHeader` is present — the header is a grid, and the action is its
 * second column. A card with an action but no header silently stacks instead.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { MoreHorizontalIcon } from 'lucide-react'

import { Badge } from './badge'
import { Button } from './button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  argTypes: { size: { control: 'inline-radio', options: ['default', 'sm'] } }
}
export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: (args) => (
    <Card className="w-[24rem]" {...args}>
      <CardHeader>
        <CardTitle>example.com</CardTitle>
        <CardDescription>WordPress 6.7 · 4 seats · connected 12 minutes ago</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Tracy has read the webroot and found 18 pages. Nothing has been written yet.
        </p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Open site</Button>
      </CardFooter>
    </Card>
  )
}

/** `CardAction` sits in the header's right column — the menu button pattern. */
export const WithAction: Story = {
  render: (args) => (
    <Card className="w-[24rem]" {...args}>
      <CardHeader>
        <CardTitle>example.com</CardTitle>
        <CardDescription>Owner · Vietnamese</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label="Site menu">
            <MoreHorizontalIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">12 proposals waiting</Badge>
      </CardContent>
    </Card>
  )
}

/** `size="sm"` — the density a list of sites wants. */
export const Small: Story = {
  args: { size: 'sm' },
  render: (args) => (
    <Card className="w-[20rem]" {...args}>
      <CardHeader>
        <CardTitle>tracy.ai</CardTitle>
        <CardDescription>Viewer</CardDescription>
      </CardHeader>
    </Card>
  )
}

/** Content only — no header, no footer. The shape a stat tile uses. */
export const ContentOnly: Story = {
  render: (args) => (
    <Card className="w-[14rem]" {...args}>
      <CardContent>
        <p className="text-muted-foreground text-xs">Seats in use</p>
        <p className="font-semibold text-2xl tabular-nums">7 / 10</p>
      </CardContent>
    </Card>
  )
}
