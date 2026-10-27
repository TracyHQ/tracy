/**
 * HoverCard is built on base-ui's `PreviewCard`, not on a hover-only popover — which means it
 * opens on focus too, so a keyboard user reaches it. Tab to the trigger to see that; it is the
 * behaviour a hand-rolled `onMouseEnter` version loses.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CalendarIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from './avatar'
import { Button } from './button'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card'

const meta: Meta<typeof HoverCard> = {
  title: 'UI/HoverCard',
  component: HoverCard,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof HoverCard>

export const Default: Story = {
  render: (args) => (
    <HoverCard {...args}>
      <HoverCardTrigger render={<Button variant="link" />}>@hd</HoverCardTrigger>
      <HoverCardContent className="w-72">
        <div className="flex gap-3">
          <Avatar>
            <AvatarFallback>HD</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <p className="font-medium text-sm">HD</p>
            <p className="text-muted-foreground text-sm">Owner of 4 sites, editor on 2 more.</p>
            <p className="flex items-center gap-1 text-muted-foreground text-xs">
              <CalendarIcon className="size-3" />
              Seat since March 2026
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/** Four sides, so the arrow and the offset can be judged in one screen. */
export const Sides: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8 p-12">
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <HoverCard key={side}>
          <HoverCardTrigger render={<Button variant="outline" size="sm" />}>{side}</HoverCardTrigger>
          <HoverCardContent side={side} className="w-48">
            <p className="text-sm">Opens on the {side}.</p>
          </HoverCardContent>
        </HoverCard>
      ))}
    </div>
  )
}
