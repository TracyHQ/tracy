/**
 * The empty state is the screen most seats meet first, so it is worth having under controls.
 * `EmptyMedia variant="icon"` draws the boxed glyph; `variant="default"` leaves the slot free for
 * an illustration or an avatar stack.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { InboxIcon, PlusIcon, SearchIcon } from 'lucide-react'

import { Button } from './button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from './empty'
import { Spinner } from './spinner'

const meta: Meta<typeof Empty> = {
  title: 'UI/Empty',
  component: Empty
}
export default meta
type Story = StoryObj<typeof Empty>

export const NoSites: Story = {
  render: (args) => (
    <Empty className="w-[28rem]" {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <InboxIcon />
        </EmptyMedia>
        <EmptyTitle>No sites yet</EmptyTitle>
        <EmptyDescription>
          Add a site Tracy can work on. You can create a new one on the fleet, or connect a site that is
          already running.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button>
          <PlusIcon data-icon="inline-start" />
          Add site
        </Button>
      </EmptyContent>
    </Empty>
  )
}

/** Nothing matched a filter — different words, same shape. */
export const NoResults: Story = {
  render: (args) => (
    <Empty className="w-[28rem]" {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchIcon />
        </EmptyMedia>
        <EmptyTitle>Nothing matched "wordpres"</EmptyTitle>
        <EmptyDescription>Check the spelling, or clear the filter to see all 7 sites.</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button variant="outline">Clear filter</Button>
      </EmptyContent>
    </Empty>
  )
}

/** Still loading — an empty state that must not read as "nothing here". */
export const Loading: Story = {
  render: (args) => (
    <Empty className="w-[28rem]" {...args}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Spinner label="Loading" />
        </EmptyMedia>
        <EmptyTitle>Provisioning the site</EmptyTitle>
        <EmptyDescription>
          The container is being built on the fleet. This takes about two minutes.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
