/**
 * base-ui builds this on `Menu`, so the checkbox and radio items are controlled the base-ui way:
 * `checked` + `onCheckedChange` on the item, and `value` + `onValueChange` on the radio group.
 * Everything else keeps the shadcn names.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { LogOutIcon, SettingsIcon, Trash2Icon, UserIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from './button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from './dropdown-menu'

const meta: Meta<typeof DropdownMenu> = {
  title: 'UI/DropdownMenu',
  component: DropdownMenu,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof DropdownMenu>

export const Default: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Account</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>hd@example.com</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <UserIcon />
            Profile
            <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <SettingsIcon />
            Settings
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Checkbox items, controlled. */
export const WithCheckboxes: Story = {
  render: function WithCheckboxesStory(args) {
    const [applied, setApplied] = React.useState(true)
    const [waiting, setWaiting] = React.useState(true)
    const [failed, setFailed] = React.useState(false)
    return (
      <DropdownMenu {...args}>
        <DropdownMenuTrigger render={<Button variant="outline" />}>Filter proposals</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={waiting} onCheckedChange={setWaiting}>
            Waiting for review
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={applied} onCheckedChange={setApplied}>
            Applied
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={failed} onCheckedChange={setFailed}>
            Failed
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
}

/** Radio items, controlled. */
export const WithRadios: Story = {
  render: function WithRadiosStory(args) {
    const [sort, setSort] = React.useState('newest')
    return (
      <DropdownMenu {...args}>
        <DropdownMenuTrigger render={<Button variant="outline" />}>Sort</DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
            <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">By file name</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }
}

/** A submenu, plus a destructive item and a disabled one. */
export const WithSubmenu: Story = {
  render: (args) => (
    <DropdownMenu {...args}>
      <DropdownMenuTrigger render={<Button variant="outline" />}>Site menu</DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuItem>Open site</DropdownMenuItem>
        <DropdownMenuItem disabled>Duplicate — not on your plan</DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem>Personal</DropdownMenuItem>
            <DropdownMenuItem>TracyHQ</DropdownMenuItem>
            <DropdownMenuItem>Archive</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">
          <Trash2Icon />
          Delete site
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
