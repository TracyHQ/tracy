/**
 * base-ui splits this in two: `RadioGroup` holds the value, `RadioGroupItem` is a `Radio.Root`.
 * There is no `RadioGroupIndicator` to place — the item draws its own dot, which is why a radix
 * snippet with an explicit indicator will not compile here.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import { RadioGroup, RadioGroupItem } from './radio-group'

const meta: Meta<typeof RadioGroup> = {
  title: 'UI/RadioGroup',
  component: RadioGroup,
  argTypes: { disabled: { control: 'boolean' } }
}
export default meta
type Story = StoryObj<typeof RadioGroup>

export const Default: Story = {
  render: (args) => (
    <RadioGroup defaultValue="editor" className="flex flex-col gap-3" {...args}>
      {[
        ['owner', 'Owner — can delete the site'],
        ['editor', 'Editor — can propose and apply changes'],
        ['viewer', 'Viewer — can read and comment']
      ].map(([value, label]) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`r-${value}`} />
          <Label htmlFor={`r-${value}`}>{label}</Label>
        </div>
      ))}
    </RadioGroup>
  )
}

export const Horizontal: Story = {
  render: (args) => (
    <RadioGroup defaultValue="light" className="flex gap-4" {...args}>
      {['light', 'dark', 'system'].map((value) => (
        <div key={value} className="flex items-center gap-2">
          <RadioGroupItem value={value} id={`t-${value}`} />
          <Label htmlFor={`t-${value}`}>{value}</Label>
        </div>
      ))}
    </RadioGroup>
  )
}

export const WithDisabledOption: Story = {
  render: (args) => (
    <RadioGroup defaultValue="new" className="flex flex-col gap-3" {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="new" id="k-new" />
        <Label htmlFor="k-new">Create a new site on the fleet</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="import" id="k-import" />
        <Label htmlFor="k-import">Connect a site that is already running</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="clone" id="k-clone" disabled />
        <Label htmlFor="k-clone">Clone an existing site — not available on your plan</Label>
      </div>
    </RadioGroup>
  )
}

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <RadioGroup defaultValue="a" className="flex flex-col gap-3" {...args}>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="a" id="d-a" />
        <Label htmlFor="d-a">Locked while the site provisions</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="b" id="d-b" />
        <Label htmlFor="d-b">Also locked</Label>
      </div>
    </RadioGroup>
  )
}
