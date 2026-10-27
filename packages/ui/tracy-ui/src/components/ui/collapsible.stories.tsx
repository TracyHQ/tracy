/**
 * Tracy's copy of this file adds an animation the registry does not ship — the panel height
 * transitions through `--collapsible-panel-height`. That is a deliberate local difference, and
 * this story is where it is visible: click the trigger and the panel should glide, not snap.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronsUpDownIcon } from 'lucide-react'

import { Button } from './button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'

const meta: Meta<typeof Collapsible> = {
  title: 'UI/Collapsible',
  component: Collapsible,
  argTypes: { disabled: { control: 'boolean' } }
}
export default meta
type Story = StoryObj<typeof Collapsible>

export const Default: Story = {
  render: (args) => (
    <Collapsible className="w-[26rem] rounded-lg border p-3" {...args}>
      <div className="flex items-center justify-between">
        <p className="font-medium text-sm">Advanced connection settings</p>
        <CollapsibleTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label="Toggle advanced settings" />}
        >
          <ChevronsUpDownIcon />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pt-3 font-mono text-muted-foreground text-xs">
          <p>SSH host — fleet-01.internal</p>
          <p>Webroot — /srv/tracy/example/public</p>
          <p>Tunnel — cloudflared, no public DNS</p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const DefaultOpen: Story = {
  args: { defaultOpen: true },
  render: (args) => (
    <Collapsible className="w-[26rem] rounded-lg border p-3" {...args}>
      <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
        Show what changed
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pt-3 text-muted-foreground text-sm">
          Three files, all under wp-content/themes. No database write.
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}

export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => (
    <Collapsible className="w-[26rem] rounded-lg border p-3" {...args}>
      <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
        Locked while a proposal is running
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="pt-3 text-sm">You should not be able to reach this.</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
