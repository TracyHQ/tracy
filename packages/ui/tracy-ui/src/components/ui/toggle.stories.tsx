/**
 * A Toggle is a button that stays pressed; a Switch is a setting that is on or off. They look
 * different for a reason — a toggle belongs in a toolbar, a switch belongs in a settings row.
 * Using one where the other belongs is the mistake this pair exists to prevent.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { BoldIcon, ItalicIcon, UnderlineIcon } from 'lucide-react'

import { Toggle } from './toggle'

const meta: Meta<typeof Toggle> = {
  title: 'UI/Toggle',
  component: Toggle,
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline'] },
    size: { control: 'inline-radio', options: ['default', 'sm', 'lg'] },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Toggle>

export const Default: Story = {
  render: (args) => (
    <Toggle aria-label="Bold" {...args}>
      <BoldIcon />
    </Toggle>
  )
}

export const Variants: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Toggle aria-label="Bold">
        <BoldIcon />
      </Toggle>
      <Toggle variant="outline" aria-label="Italic">
        <ItalicIcon />
      </Toggle>
      <Toggle defaultPressed aria-label="Underline">
        <UnderlineIcon />
      </Toggle>
      <Toggle variant="outline" defaultPressed aria-label="Bold, pressed">
        <BoldIcon />
      </Toggle>
    </div>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      {(['sm', 'default', 'lg'] as const).map((size) => (
        <Toggle key={size} size={size} variant="outline" aria-label={`Bold ${size}`}>
          <BoldIcon />
        </Toggle>
      ))}
    </div>
  )
}

export const WithText: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Toggle variant="outline">
        <BoldIcon data-icon="inline-start" />
        Bold
      </Toggle>
      <Toggle variant="outline" disabled>
        <ItalicIcon data-icon="inline-start" />
        Italic
      </Toggle>
    </div>
  )
}
