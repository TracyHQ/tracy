/**
 * `DirectionProvider` is a re-export of base-ui's, with no styling of its own. It tells every
 * base-ui primitive below it which way the writing runs — which side a menu opens on, which end
 * of a slider is zero.
 *
 * It does NOT set `dir` on the DOM. CSS that keys off `[dir='rtl']` — `cn-rtl-flip`, and the
 * logical properties every component uses — needs the attribute too. `.storybook/preview.tsx`
 * sets both, and this story exists to show what happens when only one of them is in place.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { DirectionProvider } from './direction'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from './pagination'
import { Slider } from './slider'

const meta: Meta<typeof DirectionProvider> = {
  title: 'UI/Direction',
  component: DirectionProvider,
  argTypes: { direction: { control: 'inline-radio', options: ['ltr', 'rtl'] } },
  args: { direction: 'rtl' }
}
export default meta
type Story = StoryObj<typeof DirectionProvider>

function Sample() {
  return (
    <div className="flex flex-col items-start gap-4">
      <Slider className="w-[20rem]" defaultValue={30} />
      <Pagination label="Pagination">
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
      <Button variant="outline">A button, for the text baseline</Button>
    </div>
  )
}

/** Provider only. The slider flips; the chevrons do not, because `dir` is not on the element. */
export const ProviderOnly: Story = {
  render: (args) => (
    <DirectionProvider {...args}>
      <Sample />
    </DirectionProvider>
  )
}

/** Provider plus `dir` — the combination that is actually correct. */
export const ProviderAndAttribute: Story = {
  render: (args) => (
    <DirectionProvider {...args}>
      <div dir={args.direction}>
        <Sample />
      </div>
    </DirectionProvider>
  )
}
