/**
 * A vertical separator needs a height from its parent — the primitive sets width, not height. A
 * vertical separator in a container with no height is a zero-pixel element that renders nothing
 * and reports nothing, which is the only way this component goes wrong.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Separator } from './separator'

const meta: Meta<typeof Separator> = {
  title: 'UI/Separator',
  component: Separator,
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } }
}
export default meta
type Story = StoryObj<typeof Separator>

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-[24rem]">
      <p className="font-medium text-sm">Site settings</p>
      <Separator className="my-3" {...args} />
      <p className="text-muted-foreground text-sm">Connection, team, and language.</p>
    </div>
  )
}

/** The parent sets the height. Take `h-5` away and this story renders blank. */
export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <div className="flex h-5 items-center gap-3 text-sm">
      <span>Owner</span>
      <Separator {...args} />
      <span>4 seats</span>
      <Separator {...args} />
      <span>WordPress</span>
    </div>
  )
}
