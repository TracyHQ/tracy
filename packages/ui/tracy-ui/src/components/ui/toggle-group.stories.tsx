/**
 * `multiple` decides whether this behaves like a set of checkboxes or like a radio group —
 * base-ui's name, not radix's `type="single|multiple"`. Get it wrong and the group silently lets
 * every item stay pressed.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  BoldIcon,
  ItalicIcon,
  UnderlineIcon
} from 'lucide-react'

import { ToggleGroup, ToggleGroupItem } from './toggle-group'

const meta: Meta<typeof ToggleGroup> = {
  title: 'UI/ToggleGroup',
  component: ToggleGroup,
  argTypes: {
    multiple: { control: 'boolean' },
    variant: { control: 'inline-radio', options: ['default', 'outline'] },
    size: { control: 'inline-radio', options: ['default', 'sm', 'lg'] },
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] },
    spacing: { control: { type: 'number', min: 0, max: 8 } }
  }
}
export default meta
type Story = StoryObj<typeof ToggleGroup>

/** One at a time — an alignment picker. */
export const Single: Story = {
  args: { variant: 'outline' },
  render: (args) => (
    <ToggleGroup defaultValue={['left']} {...args}>
      <ToggleGroupItem value="left" aria-label="Align left">
        <AlignLeftIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="center" aria-label="Align center">
        <AlignCenterIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="right" aria-label="Align right">
        <AlignRightIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** Several at once — text styles, which are not mutually exclusive. */
export const Multiple: Story = {
  args: { multiple: true, variant: 'outline' },
  render: (args) => (
    <ToggleGroup defaultValue={['bold']} {...args}>
      <ToggleGroupItem value="bold" aria-label="Bold">
        <BoldIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="italic" aria-label="Italic">
        <ItalicIcon />
      </ToggleGroupItem>
      <ToggleGroupItem value="underline" aria-label="Underline">
        <UnderlineIcon />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

/** `spacing={0}` welds the items into one control, the segmented-control look. */
export const Welded: Story = {
  args: { variant: 'outline', spacing: 0 },
  render: (args) => (
    <ToggleGroup defaultValue={['week']} {...args}>
      <ToggleGroupItem value="day">Day</ToggleGroupItem>
      <ToggleGroupItem value="week">Week</ToggleGroupItem>
      <ToggleGroupItem value="month">Month</ToggleGroupItem>
    </ToggleGroup>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col items-start gap-3">
      {(['sm', 'default', 'lg'] as const).map((size) => (
        <ToggleGroup key={size} size={size} variant="outline" defaultValue={['week']}>
          <ToggleGroupItem value="day">Day</ToggleGroupItem>
          <ToggleGroupItem value="week">Week</ToggleGroupItem>
          <ToggleGroupItem value="month">Month</ToggleGroupItem>
        </ToggleGroup>
      ))}
    </div>
  )
}

export const Vertical: Story = {
  args: { orientation: 'vertical', variant: 'outline' },
  render: (args) => (
    <ToggleGroup defaultValue={['chat']} {...args}>
      <ToggleGroupItem value="chat">Chat</ToggleGroupItem>
      <ToggleGroupItem value="changes">Changes</ToggleGroupItem>
      <ToggleGroupItem value="preview">Preview</ToggleGroupItem>
    </ToggleGroup>
  )
}
