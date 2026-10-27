/**
 * base-ui's Select is not a native `<select>` and not radix's. Two things differ enough to break
 * a copied snippet: `SelectValue` renders the selected item itself (there is no `placeholder`
 * prop — pass children as the fallback), and `SelectContent` aligns its selected item with the
 * trigger by default (`alignItemWithTrigger`), so the popup can open over the trigger rather than
 * below it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Label } from './label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue
} from './select'

const meta: Meta<typeof Select> = {
  title: 'UI/Select',
  component: Select,
  parameters: { layout: 'centered' },
  argTypes: { disabled: { control: 'boolean' } }
}
export default meta
type Story = StoryObj<typeof Select>

export const Default: Story = {
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-[16rem]">
        <SelectValue>Pick a role</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="owner">Owner</SelectItem>
        <SelectItem value="editor">Editor</SelectItem>
        <SelectItem value="viewer">Viewer</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** `size="sm"` — the trigger a table row or a toolbar wants. */
export const Small: Story = {
  render: (args) => (
    <Select {...args}>
      <SelectTrigger size="sm" className="w-[12rem]">
        <SelectValue>Editor</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="owner">Owner</SelectItem>
        <SelectItem value="editor">Editor</SelectItem>
        <SelectItem value="viewer">Viewer</SelectItem>
      </SelectContent>
    </Select>
  )
}

/** Groups with labels and a separator between them. */
export const Grouped: Story = {
  render: (args) => (
    <Select defaultValue="wp" {...args}>
      <SelectTrigger className="w-[18rem]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Content systems</SelectLabel>
          <SelectItem value="wp">WordPress</SelectItem>
          <SelectItem value="joomla">Joomla</SelectItem>
          <SelectItem value="drupal">Drupal</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>Static</SelectLabel>
          <SelectItem value="astro">Astro</SelectItem>
          <SelectItem value="eleventy">Eleventy</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

/** A long list, so the scroll arrows at the top and bottom of the popup show up. */
export const Scrolling: Story = {
  render: (args) => (
    <Select {...args}>
      <SelectTrigger className="w-[16rem]">
        <SelectValue>Pick a timezone</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: 24 }, (_, i) => (
          <SelectItem key={i} value={`utc${i}`}>
            UTC{i >= 12 ? '+' : '-'}
            {Math.abs(i - 12)}:00
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      <Select disabled>
        <SelectTrigger className="w-[16rem]">
          <SelectValue>Whole control disabled</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">A</SelectItem>
        </SelectContent>
      </Select>
      <Select>
        <SelectTrigger className="w-[16rem]">
          <SelectValue>One item disabled</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">Owner</SelectItem>
          <SelectItem value="editor" disabled>
            Editor — no seats left
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-[16rem] flex-col gap-2">
      <Label htmlFor="role">Role on this site</Label>
      <Select defaultValue="editor">
        <SelectTrigger id="role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="owner">Owner</SelectItem>
          <SelectItem value="editor">Editor</SelectItem>
          <SelectItem value="viewer">Viewer</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
