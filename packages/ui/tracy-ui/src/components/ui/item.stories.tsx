/**
 * Item is the generic list row: media on the left, title and description in the middle, actions
 * on the right. Reach for it before hand-rolling a flexbox row — most lists in this product are
 * this shape, and the ones that were hand-rolled are the ones whose paddings drifted.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ChevronRightIcon, GlobeIcon, MoreHorizontalIcon } from 'lucide-react'

import { Avatar, AvatarFallback } from './avatar'
import { Badge } from './badge'
import { Button } from './button'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle
} from './item'

const meta: Meta<typeof Item> = {
  title: 'UI/Item',
  component: Item,
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline', 'muted'] },
    size: { control: 'inline-radio', options: ['default', 'sm', 'xs'] }
  }
}
export default meta
type Story = StoryObj<typeof Item>

export const Default: Story = {
  args: { variant: 'outline' },
  render: (args) => (
    <Item className="w-[30rem]" {...args}>
      <ItemMedia variant="icon">
        <GlobeIcon />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>example.com</ItemTitle>
        <ItemDescription>WordPress 6.7 · 4 seats · connected 12 minutes ago</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="ghost" size="icon-sm" aria-label="Site menu">
          <MoreHorizontalIcon />
        </Button>
      </ItemActions>
    </Item>
  )
}

export const Variants: Story = {
  render: () => (
    <div className="flex w-[30rem] flex-col gap-3">
      {(['default', 'outline', 'muted'] as const).map((variant) => (
        <Item key={variant} variant={variant}>
          <ItemMedia variant="icon">
            <GlobeIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{variant}</ItemTitle>
            <ItemDescription>The same row in each of the three variants.</ItemDescription>
          </ItemContent>
        </Item>
      ))}
    </div>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex w-[30rem] flex-col gap-3">
      {(['default', 'sm', 'xs'] as const).map((size) => (
        <Item key={size} variant="outline" size={size}>
          <ItemContent>
            <ItemTitle>{size}</ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </div>
  )
}

/** A group with separators — the site list. */
export const Group: Story = {
  render: () => (
    <ItemGroup className="w-[30rem] rounded-lg border">
      {[
        ['example.com', 'Owner', 'HD'],
        ['tracy.ai', 'Editor', 'LT'],
        ['example.org', 'Viewer', 'AK']
      ].map(([name, role, initials], i, all) => (
        <div key={name}>
          <Item render={<button type="button" className="w-full text-left" />}>
            <ItemMedia>
              <Avatar>
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </ItemMedia>
            <ItemContent>
              <ItemTitle>{name}</ItemTitle>
              <ItemDescription>Last change 3 days ago</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Badge variant="secondary">{role}</Badge>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
          {i < all.length - 1 ? <ItemSeparator /> : null}
        </div>
      ))}
    </ItemGroup>
  )
}
