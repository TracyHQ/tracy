/**
 * Command is the one component in this library that is NOT base-ui: it wraps `cmdk`, the same
 * package classic shadcn uses. So its filtering, its `value` matching and its keyboard handling
 * follow cmdk's rules, not base-ui's — worth knowing before debugging why an item will not
 * highlight.
 *
 * `CommandDialog` is the ⌘K palette; `Command` on its own is the same list embedded in a page.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GlobeIcon, PlusIcon, SettingsIcon, UsersIcon } from 'lucide-react'
import * as React from 'react'

import { Button } from './button'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut
} from './command'

const meta: Meta<typeof Command> = {
  title: 'UI/Command',
  component: Command
}
export default meta
type Story = StoryObj<typeof Command>

function List() {
  return (
    <CommandList>
      <CommandEmpty>Nothing matched.</CommandEmpty>
      <CommandGroup heading="Sites">
        <CommandItem>
          <GlobeIcon />
          example.com
        </CommandItem>
        <CommandItem>
          <GlobeIcon />
          tracy.ai
        </CommandItem>
        <CommandItem>
          <GlobeIcon />
          cowork.tracy.ai
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="Actions">
        <CommandItem>
          <PlusIcon />
          Add site
          <CommandShortcut>⌘N</CommandShortcut>
        </CommandItem>
        <CommandItem>
          <UsersIcon />
          Invite someone
        </CommandItem>
        <CommandItem>
          <SettingsIcon />
          Settings
          <CommandShortcut>⌘,</CommandShortcut>
        </CommandItem>
        <CommandItem disabled>Export — coming later</CommandItem>
      </CommandGroup>
    </CommandList>
  )
}

/** Embedded in a page. Type in the input; cmdk filters the list. */
export const Default: Story = {
  render: (args) => (
    <Command className="w-[24rem] rounded-lg border" {...args}>
      <CommandInput placeholder="Search sites and actions…" />
      <List />
    </Command>
  )
}

/** The ⌘K palette. Press the button, or ⌘K / Ctrl-K. */
export const Palette: Story = {
  render: function PaletteStory() {
    const [open, setOpen] = React.useState(false)
    React.useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          setOpen((o) => !o)
        }
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [])
    return (
      <>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Open palette
          <CommandShortcut>⌘K</CommandShortcut>
        </Button>
        <CommandDialog open={open} onOpenChange={setOpen}>
          <CommandInput placeholder="Search sites and actions…" />
          <List />
        </CommandDialog>
      </>
    )
  }
}

/** The empty result, which is a real state and needs its own words. */
export const NoResults: Story = {
  render: (args) => (
    <Command className="w-[24rem] rounded-lg border" {...args}>
      <CommandInput defaultValue="zzzz" placeholder="Search…" />
      <CommandList>
        <CommandEmpty>Nothing matched "zzzz".</CommandEmpty>
        <CommandGroup heading="Sites">
          <CommandItem>example.com</CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
