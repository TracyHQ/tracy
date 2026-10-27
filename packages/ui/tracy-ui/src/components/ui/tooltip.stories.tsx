/**
 * `TooltipProvider` carries the delay and is mounted once, high up — `.storybook/preview.tsx`
 * already wraps every story in one, which is why these stories do not add their own.
 *
 * A tooltip is not a place for information the user needs: it never opens on touch, and it
 * disappears the moment focus moves. Use it for a name, not for an explanation.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { HelpCircleIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from './button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

const meta: Meta<typeof Tooltip> = {
  title: 'UI/Tooltip',
  component: Tooltip,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Tooltip>

export const Default: Story = {
  render: (args) => (
    <Tooltip {...args}>
      <TooltipTrigger render={<Button variant="outline" size="icon" aria-label="Add site" />}>
        <PlusIcon />
      </TooltipTrigger>
      <TooltipContent>Add site</TooltipContent>
    </Tooltip>
  )
}

export const Sides: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-8 p-12">
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger render={<Button variant="outline" size="sm" />}>{side}</TooltipTrigger>
          <TooltipContent side={side}>Opens {side}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** A named provider with a delay, for a toolbar where instant tooltips would flicker. */
export const WithDelay: Story = {
  render: () => (
    <TooltipProvider delay={600}>
      <div className="flex gap-2">
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Help" />}>
            <HelpCircleIcon />
          </TooltipTrigger>
          <TooltipContent>Opens after 600ms</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Delete" />}>
            <Trash2Icon />
          </TooltipTrigger>
          <TooltipContent>Delete proposal</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  )
}
