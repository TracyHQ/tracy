/**
 * Two sizes, and the small one is not decoration: it is what fits a settings row beside 14px
 * text without dragging the row height up.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import { Switch } from './switch'

const meta: Meta<typeof Switch> = {
  title: 'UI/Switch',
  component: Switch,
  argTypes: {
    size: { control: 'inline-radio', options: ['default', 'sm'] },
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Switch>

export const Default: Story = {
  render: (args) => (
    <div className="flex items-center gap-2">
      <Switch id="sw" {...args} />
      <Label htmlFor="sw">Notify me when a proposal is ready</Label>
    </div>
  )
}

export const AllStates: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(['default', 'sm'] as const).map((size) => (
        <div key={size} className="flex items-center gap-4">
          <span className="w-16 text-muted-foreground text-xs">{size}</span>
          <Switch size={size} />
          <Switch size={size} defaultChecked />
          <Switch size={size} disabled />
          <Switch size={size} disabled defaultChecked />
        </div>
      ))}
    </div>
  )
}

/** A settings row, which is where this control actually lives. */
export const SettingsRow: Story = {
  render: () => (
    <div className="w-[30rem] divide-y rounded-lg border">
      {[
        ['Write without asking', 'Every change goes straight to the site.'],
        ['Email me a daily summary', 'One message at 08:00 in your timezone.'],
        ['Keep a backup before each write', 'Stored on the fleet host for 30 days.']
      ].map(([title, note], i) => (
        <div key={title} className="flex items-center justify-between gap-4 p-3">
          <div>
            <p className="font-medium text-sm">{title}</p>
            <p className="text-muted-foreground text-xs">{note}</p>
          </div>
          <Switch size="sm" defaultChecked={i > 0} />
        </div>
      ))}
    </div>
  )
}
