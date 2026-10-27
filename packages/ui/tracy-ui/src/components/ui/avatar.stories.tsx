/**
 * The fallback is the story that matters. `AvatarImage` only reveals itself once the image
 * loads, so a broken or slow URL leaves the fallback on screen — and that is the state most
 * seats are in, because most people never upload a picture.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Avatar, AvatarFallback, AvatarImage } from './avatar'

const meta: Meta<typeof Avatar> = {
  title: 'UI/Avatar',
  component: Avatar
}
export default meta
type Story = StoryObj<typeof Avatar>

export const WithImage: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="https://github.com/shadcn.png" alt="Seat holder" />
      <AvatarFallback>HD</AvatarFallback>
    </Avatar>
  )
}

/** Broken URL on purpose: this is the path every seat without a picture takes. */
export const Fallback: Story = {
  render: (args) => (
    <Avatar {...args}>
      <AvatarImage src="/nothing-here.png" alt="Seat holder" />
      <AvatarFallback>HD</AvatarFallback>
    </Avatar>
  )
}

/** Size is a class, not a prop — the primitive has no size variants. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-3">
      {['size-6', 'size-8', 'size-10', 'size-14'].map((size) => (
        <Avatar key={size} className={size}>
          <AvatarFallback>HD</AvatarFallback>
        </Avatar>
      ))}
    </div>
  )
}

/** A stack, the way a site's team is shown in a list row. */
export const Stack: Story = {
  render: () => (
    <div className="flex -space-x-2">
      {['HD', 'LT', 'AK', 'NV'].map((initials) => (
        <Avatar key={initials} className="ring-2 ring-background">
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  )
}
