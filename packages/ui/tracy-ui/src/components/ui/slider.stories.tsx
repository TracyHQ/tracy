/**
 * One thumb or two, decided by whether `value` is a number or an array — there is no `range`
 * prop. base-ui reads the `DirectionProvider`, so under `rtl` the track runs the other way; the
 * toolbar switch is how to check that.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import { Slider } from './slider'

const meta: Meta<typeof Slider> = {
  title: 'UI/Slider',
  component: Slider,
  argTypes: {
    min: { control: 'number' },
    max: { control: 'number' },
    step: { control: 'number' },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Slider>

export const Default: Story = {
  render: (args) => <Slider className="w-[24rem]" defaultValue={40} {...args} />
}

/** An array makes it a range. */
export const Range: Story = {
  render: (args) => <Slider className="w-[24rem]" defaultValue={[20, 70]} {...args} />
}

export const Steps: Story = {
  render: (args) => (
    <div className="flex w-[24rem] flex-col gap-2">
      <Label>Keep backups for</Label>
      <Slider defaultValue={30} min={0} max={90} step={30} {...args} />
      <div className="flex justify-between text-muted-foreground text-xs">
        <span>Off</span>
        <span>30d</span>
        <span>60d</span>
        <span>90d</span>
      </div>
    </div>
  )
}

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <Slider className="w-[24rem]" defaultValue={40} {...args} />
}

export const Vertical: Story = {
  render: (args) => (
    <div className="h-48">
      <Slider orientation="vertical" defaultValue={40} {...args} />
    </div>
  )
}
