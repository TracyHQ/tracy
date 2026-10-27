/**
 * Popover takes focus; `HoverCard` does not. That is the line between them, and it decides
 * whether the content may contain a control: anything with an input or a button belongs here.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

const meta: Meta<typeof Popover> = {
  title: 'UI/Popover',
  component: Popover,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Popover>

export const Default: Story = {
  render: (args) => (
    <Popover {...args}>
      <PopoverTrigger render={<Button variant="outline" />}>Rename site</PopoverTrigger>
      <PopoverContent className="w-72">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-sm">Rename</p>
            <p className="text-muted-foreground text-xs">Only the label changes.</p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pop-name">Name</Label>
            <Input id="pop-name" defaultValue="example.com" />
          </div>
          <Button size="sm">Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Alignment, so the offsets can be judged against the trigger's edges. */
export const Alignment: Story = {
  render: () => (
    <div className="flex gap-3">
      {(['start', 'center', 'end'] as const).map((align) => (
        <Popover key={align}>
          <PopoverTrigger render={<Button variant="outline" size="sm" />}>{align}</PopoverTrigger>
          <PopoverContent align={align} className="w-48">
            <p className="text-sm">Aligned to {align}.</p>
          </PopoverContent>
        </Popover>
      ))}
    </div>
  )
}

export const Open: Story = {
  render: (args) => (
    <Popover defaultOpen {...args}>
      <PopoverTrigger render={<Button variant="outline" />}>Open on load</PopoverTrigger>
      <PopoverContent className="w-64">
        <p className="text-sm">
          The popup's resting style, visible in the docs page without pressing anything.
        </p>
      </PopoverContent>
    </Popover>
  )
}
