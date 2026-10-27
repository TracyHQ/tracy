/**
 * The previous/next chevrons carry `cn-rtl-flip`. Flip the `Dir` toolbar to `rtl`: they must
 * point the other way. If they do not, `[dir='rtl'] .cn-rtl-flip` fell out of `tokens.css` —
 * the registry does not ship that rule, Tracy adds it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from './pagination'

const meta: Meta<typeof Pagination> = {
  title: 'UI/Pagination',
  component: Pagination,
  args: { label: 'Pagination' }
}
export default meta
type Story = StoryObj<typeof Pagination>

export const Default: Story = {
  render: (args) => (
    <Pagination {...args}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" text="Previous" label="Go to previous page" />
        </PaginationItem>
        {[1, 2, 3].map((n) => (
          <PaginationItem key={n}>
            <PaginationLink href="#" isActive={n === 2}>
              {n}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href="#" text="Next" label="Go to next page" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

/** With an ellipsis — what a long range collapses to. */
export const WithEllipsis: Story = {
  render: (args) => (
    <Pagination {...args}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" text="Previous" label="Go to previous page" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">1</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationEllipsis label="More pages" />
        </PaginationItem>
        {[7, 8, 9].map((n) => (
          <PaginationItem key={n}>
            <PaginationLink href="#" isActive={n === 8}>
              {n}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationEllipsis label="More pages" />
        </PaginationItem>
        <PaginationItem>
          <PaginationLink href="#">42</PaginationLink>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext href="#" text="Next" label="Go to next page" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}

/** Icon-only ends: pass an empty `text` to drop the word and keep the chevron. */
export const IconsOnly: Story = {
  render: (args) => (
    <Pagination {...args}>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious href="#" text="" label="Previous page" />
        </PaginationItem>
        {[1, 2, 3, 4].map((n) => (
          <PaginationItem key={n}>
            <PaginationLink href="#" isActive={n === 1}>
              {n}
            </PaginationLink>
          </PaginationItem>
        ))}
        <PaginationItem>
          <PaginationNext href="#" text="" label="Next page" />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
