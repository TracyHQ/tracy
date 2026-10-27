/**
 * `field-sizing-content` means this grows with what is typed instead of scrolling — no
 * ResizeObserver, no auto-grow hook. Type into the first story to see it.
 *
 * ⚠ This file differs from the base-nova registry: upstream also carries
 * `disabled:bg-input/50 dark:disabled:bg-input/80`, and Tracy's copy does not. The disabled story
 * is where that shows — compare it against `Input`'s disabled state, which does have the fill.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import { Textarea } from './textarea'

const meta = {
  title: 'UI/Textarea',
  component: Textarea,
  argTypes: { disabled: { control: 'boolean' }, placeholder: { control: 'text' } },
  args: { placeholder: 'Tell Tracy what to change on this site…' }
} satisfies Meta<typeof Textarea>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = { render: (args) => <Textarea className="w-[26rem]" {...args} /> }

export const WithLabel: Story = {
  render: (args) => (
    <div className="flex w-[26rem] flex-col gap-2">
      <Label htmlFor="ta">Note for your team</Label>
      <Textarea id="ta" {...args} />
    </div>
  )
}

export const States: Story = {
  render: () => (
    <div className="flex w-[26rem] flex-col gap-3">
      <Textarea placeholder="Empty" />
      <Textarea defaultValue={'Two lines of content,\nso the field has grown once already.'} />
      <Textarea placeholder="Disabled" disabled />
      <Textarea aria-invalid defaultValue="Invalid" />
      <Textarea readOnly defaultValue="Read-only" />
    </div>
  )
}
