/**
 * Menubar is the desktop menu strip — it belongs to the Electron shell, not to a page inside
 * dsh. base-ui gives the roving focus for free: open one menu, then move left and right with the
 * arrow keys and the next menu opens without a click.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'

import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from './menubar'

const meta: Meta<typeof Menubar> = {
  title: 'UI/Menubar',
  component: Menubar
}
export default meta
type Story = StoryObj<typeof Menubar>

export const Default: Story = {
  render: function DefaultStory(args) {
    const [statusBar, setStatusBar] = React.useState(true)
    const [theme, setTheme] = React.useState('system')
    return (
      <Menubar {...args}>
        <MenubarMenu>
          <MenubarTrigger>File</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              New site
              <MenubarShortcut>⌘N</MenubarShortcut>
            </MenubarItem>
            <MenubarItem>
              Open…
              <MenubarShortcut>⌘O</MenubarShortcut>
            </MenubarItem>
            <MenubarSeparator />
            <MenubarSub>
              <MenubarSubTrigger>Recent sites</MenubarSubTrigger>
              <MenubarSubContent>
                <MenubarItem>example.com</MenubarItem>
                <MenubarItem>tracy.ai</MenubarItem>
              </MenubarSubContent>
            </MenubarSub>
            <MenubarSeparator />
            <MenubarItem variant="destructive">Close window</MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>Edit</MenubarTrigger>
          <MenubarContent>
            <MenubarItem>
              Undo
              <MenubarShortcut>⌘Z</MenubarShortcut>
            </MenubarItem>
            <MenubarItem disabled>
              Redo
              <MenubarShortcut>⇧⌘Z</MenubarShortcut>
            </MenubarItem>
          </MenubarContent>
        </MenubarMenu>

        <MenubarMenu>
          <MenubarTrigger>View</MenubarTrigger>
          <MenubarContent>
            <MenubarCheckboxItem checked={statusBar} onCheckedChange={setStatusBar}>
              Status bar
            </MenubarCheckboxItem>
            <MenubarSeparator />
            <MenubarRadioGroup value={theme} onValueChange={setTheme}>
              <MenubarRadioItem value="light">Light</MenubarRadioItem>
              <MenubarRadioItem value="dark">Dark</MenubarRadioItem>
              <MenubarRadioItem value="system">Follow the system</MenubarRadioItem>
            </MenubarRadioGroup>
          </MenubarContent>
        </MenubarMenu>
      </Menubar>
    )
  }
}
