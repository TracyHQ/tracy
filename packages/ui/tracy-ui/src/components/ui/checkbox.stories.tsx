/**
 * Three states, and the third is the one that gets forgotten: base-ui spells indeterminate as
 * `indeterminate`, a boolean prop beside `checked`, not as `checked="indeterminate"`. A
 * select-all header built the radix way renders permanently unchecked here, with no error.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Checkbox } from './checkbox'
import { Label } from './label'

const meta: Meta<typeof Checkbox> = {
  title: 'UI/Checkbox',
  component: Checkbox,
  argTypes: {
    checked: { control: 'boolean' },
    indeterminate: { control: 'boolean' },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Checkbox>

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Checkbox id="terms" {...args} />
      <Label htmlFor="terms">Let Tracy write to this site</Label>
    </div>
  )
}

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Checkbox id="s-off" />
        <Label htmlFor="s-off">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="s-on" defaultChecked />
        <Label htmlFor="s-on">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="s-mixed" indeterminate />
        <Label htmlFor="s-mixed">Indeterminate — some pages selected</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="s-dis" disabled />
        <Label htmlFor="s-dis">Disabled</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="s-dis-on" disabled defaultChecked />
        <Label htmlFor="s-dis-on">Disabled, checked</Label>
      </div>
    </div>
  )
}

/** A list with a select-all header — the real reason indeterminate exists. */
export const SelectAll: Story = {
  render: () => (
    <div className="w-[20rem] rounded-lg border p-3">
      <div className="flex items-center gap-2 border-b pb-2">
        <Checkbox id="all" indeterminate />
        <Label htmlFor="all" className="font-medium">
          18 pages
        </Label>
      </div>
      <div className="flex flex-col gap-2 pt-2">
        {['Home', 'About', 'Pricing', 'Contact'].map((page, i) => (
          <div key={page} className="flex items-center gap-2">
            <Checkbox id={`p-${page}`} defaultChecked={i < 2} />
            <Label htmlFor={`p-${page}`}>{page}</Label>
          </div>
        ))}
      </div>
    </div>
  )
}
