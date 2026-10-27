/**
 * The scrollbar only appears while the pointer is over the area or a scroll is in flight, which
 * is why a still screenshot of this component often shows no bar at all. Scroll to see it.
 *
 * The area needs a fixed size from its parent — `ScrollArea` does not set one, and without it
 * the content simply grows and nothing scrolls.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { ScrollArea, ScrollBar } from './scroll-area'
import { Separator } from './separator'

const meta: Meta<typeof ScrollArea> = {
  title: 'UI/ScrollArea',
  component: ScrollArea
}
export default meta
type Story = StoryObj<typeof ScrollArea>

export const Vertical: Story = {
  render: (args) => (
    <ScrollArea className="h-64 w-[20rem] rounded-lg border" {...args}>
      <div className="p-4">
        <p className="font-medium text-sm">Pages found</p>
        {Array.from({ length: 30 }, (_, i) => (
          <div key={i}>
            <p className="py-2 font-mono text-xs">/page-{i + 1}</p>
            <Separator />
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}

/** Horizontal needs an explicit `ScrollBar orientation="horizontal"`. */
export const Horizontal: Story = {
  render: (args) => (
    <ScrollArea className="w-[24rem] whitespace-nowrap rounded-lg border" {...args}>
      <div className="flex gap-3 p-4">
        {Array.from({ length: 12 }, (_, i) => (
          <div
            key={i}
            className="flex size-28 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground text-sm"
          >
            {i + 1}
          </div>
        ))}
      </div>
      <ScrollBar orientation="horizontal" />
    </ScrollArea>
  )
}
