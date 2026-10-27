/**
 * InputGroup puts an addon inside the field's border rather than beside it, so the whole thing
 * keeps one focus ring. The four `align` values are the four corners an addon can take, and
 * `block-start` / `block-end` are the ones that make a textarea into a composer.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowUpIcon, PaperclipIcon, SearchIcon } from 'lucide-react'

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea
} from './input-group'

const meta: Meta<typeof InputGroup> = {
  title: 'UI/InputGroup',
  component: InputGroup
}
export default meta
type Story = StoryObj<typeof InputGroup>

export const Search: Story = {
  render: (args) => (
    <InputGroup className="w-[24rem]" {...args}>
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
      <InputGroupInput placeholder="Search sites…" />
    </InputGroup>
  )
}

/** A prefix and a suffix — the shape a domain field wants. */
export const PrefixSuffix: Story = {
  render: (args) => (
    <InputGroup className="w-[24rem]" {...args}>
      <InputGroupAddon>
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example" />
      <InputGroupAddon align="inline-end">
        <InputGroupText>.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** A button inside the field. */
export const WithButton: Story = {
  render: (args) => (
    <InputGroup className="w-[24rem]" {...args}>
      <InputGroupInput placeholder="Invite by email" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton variant="default" size="sm">
          Invite
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** `block-end` under a textarea — this is the composer at the bottom of the chat pane. */
export const Composer: Story = {
  render: (args) => (
    <InputGroup className="w-[30rem]" {...args}>
      <InputGroupTextarea placeholder="Tell Tracy what to change on this site…" />
      <InputGroupAddon align="block-end">
        <InputGroupButton size="icon-sm" aria-label="Attach a file">
          <PaperclipIcon />
        </InputGroupButton>
        <InputGroupButton className="ml-auto" variant="default" size="icon-sm" aria-label="Send">
          <ArrowUpIcon />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/** `block-start` — a header strip above the field. */
export const BlockStart: Story = {
  render: (args) => (
    <InputGroup className="w-[30rem]" {...args}>
      <InputGroupAddon align="block-start">
        <InputGroupText>Note on example.com</InputGroupText>
      </InputGroupAddon>
      <InputGroupTextarea placeholder="Visible to everyone with a seat." />
    </InputGroup>
  )
}
