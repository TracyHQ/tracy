/**
 * Label's whole job is `htmlFor`, and the story that proves it works is the one where clicking
 * the text moves focus into the control. A label rendered without `htmlFor` looks identical and
 * does nothing — the failure has no visual signature at all.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent } from 'storybook/test'

import { Checkbox } from './checkbox'
import { Input } from './input'
import { Label } from './label'

const meta = {
  title: 'UI/Label',
  component: Label,
  args: { children: 'Site name' }
} satisfies Meta<typeof Label>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithInput: Story = {
  render: (args) => (
    <div className="flex w-[20rem] flex-col gap-2">
      <Label htmlFor="named" {...args} />
      <Input id="named" defaultValue="example.com" />
    </div>
  ),
  /** Click the label; focus must land in the input. This is the only test of `htmlFor` there is. */
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText('Site name'))
    await expect(canvas.getByDisplayValue('example.com')).toHaveFocus()
  }
}

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="lbl-cb" />
      <Label htmlFor="lbl-cb">Send me an email when a proposal is ready</Label>
    </div>
  )
}

/** Inside a disabled group the label dims with its control, via `group-data-disabled`. */
export const Disabled: Story = {
  render: () => (
    <div className="group flex w-[20rem] flex-col gap-2" data-disabled>
      <Label htmlFor="dis-input">Webroot</Label>
      <Input id="dis-input" disabled defaultValue="/srv/tracy/example/public" />
    </div>
  )
}
