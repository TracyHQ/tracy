/**
 * Same menu parts as `DropdownMenu`, opened by right-click instead of a trigger button. Which
 * means the story is only useful if you actually right-click the target area — there is no
 * button to press.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'

import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger
} from './context-menu'

const meta: Meta<typeof ContextMenu> = {
  title: 'UI/ContextMenu',
  component: ContextMenu,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof ContextMenu>

const Target = (
  <div className="flex h-40 w-[24rem] items-center justify-center rounded-lg border border-dashed text-muted-foreground text-sm">
    Right-click here
  </div>
)

export const Default: Story = {
  render: (args) => (
    <ContextMenu {...args}>
      <ContextMenuTrigger render={Target} />
      <ContextMenuContent className="w-56">
        <ContextMenuItem>
          Open
          <ContextMenuShortcut>⌘O</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          Copy path
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">Discard proposal</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export const Full: Story = {
  render: function FullStory(args) {
    const [preview, setPreview] = React.useState(true)
    const [pane, setPane] = React.useState('chat')
    return (
      <ContextMenu {...args}>
        <ContextMenuTrigger render={Target} />
        <ContextMenuContent className="w-60">
          <ContextMenuLabel>example.com</ContextMenuLabel>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem checked={preview} onCheckedChange={setPreview}>
            Show live preview
          </ContextMenuCheckboxItem>
          <ContextMenuSeparator />
          <ContextMenuRadioGroup value={pane} onValueChange={setPane}>
            <ContextMenuRadioItem value="chat">Open in Chat</ContextMenuRadioItem>
            <ContextMenuRadioItem value="changes">Open in Changes</ContextMenuRadioItem>
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>Share</ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem>Copy link</ContextMenuItem>
              <ContextMenuItem>Invite by email</ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem disabled>Export — coming later</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    )
  }
}
