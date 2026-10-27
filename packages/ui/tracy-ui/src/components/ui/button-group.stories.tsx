/**
 * ButtonGroup welds buttons into one control by flattening the inner radii. The separator is a
 * real element, not a border, which is why `ButtonGroupSeparator` exists — a border would double
 * up between two adjacent outline buttons.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AlignCenterIcon, AlignLeftIcon, AlignRightIcon, ChevronDownIcon } from 'lucide-react'

import { Button } from './button'
import { ButtonGroup, ButtonGroupSeparator, ButtonGroupText } from './button-group'

const meta: Meta<typeof ButtonGroup> = {
  title: 'UI/ButtonGroup',
  component: ButtonGroup,
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } }
}
export default meta
type Story = StoryObj<typeof ButtonGroup>

export const Default: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Preview</Button>
      <Button variant="outline">Changes</Button>
      <Button variant="outline">History</Button>
    </ButtonGroup>
  )
}

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline">Preview</Button>
      <Button variant="outline">Changes</Button>
      <Button variant="outline">History</Button>
    </ButtonGroup>
  )
}

/** Icon-only, the toolbar shape. */
export const IconOnly: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button variant="outline" size="icon-sm" aria-label="Align left">
        <AlignLeftIcon />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Align center">
        <AlignCenterIcon />
      </Button>
      <Button variant="outline" size="icon-sm" aria-label="Align right">
        <AlignRightIcon />
      </Button>
    </ButtonGroup>
  )
}

/** A split button: one action plus a menu trigger, held apart by a real separator. */
export const Split: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <Button>Apply all</Button>
      <ButtonGroupSeparator />
      <Button size="icon" aria-label="More apply options">
        <ChevronDownIcon />
      </Button>
    </ButtonGroup>
  )
}

/** `ButtonGroupText` is the non-interactive slot — a prefix, a unit, a label. */
export const WithText: Story = {
  render: (args) => (
    <ButtonGroup {...args}>
      <ButtonGroupText>Rollback to</ButtonGroupText>
      <Button variant="outline">Yesterday</Button>
      <Button variant="outline">Last week</Button>
    </ButtonGroup>
  )
}
