/**
 * Carousel wraps `embla-carousel-react`. The arrows are absolutely positioned outside the frame,
 * so the container needs room around it — drop this straight into a full-width card and the
 * previous button lands off-screen.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Card, CardContent } from './card'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './carousel'

const meta: Meta<typeof Carousel> = {
  title: 'UI/Carousel',
  component: Carousel,
  parameters: { layout: 'centered' },
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } }
}
export default meta
type Story = StoryObj<typeof Carousel>

export const Default: Story = {
  render: (args) => (
    <Carousel className="w-[20rem]" {...args}>
      <CarouselContent>
        {Array.from({ length: 5 }, (_, i) => (
          <CarouselItem key={i}>
            <Card>
              <CardContent className="flex aspect-square items-center justify-center">
                <span className="font-semibold text-3xl">{i + 1}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious label="Previous slide" />
      <CarouselNext label="Next slide" />
    </Carousel>
  )
}

/** Several per view — `basis` on the item is what decides how many. */
export const MultipleVisible: Story = {
  render: (args) => (
    <Carousel opts={{ align: 'start' }} className="w-[30rem]" {...args}>
      <CarouselContent>
        {Array.from({ length: 8 }, (_, i) => (
          <CarouselItem key={i} className="basis-1/3">
            <Card>
              <CardContent className="flex aspect-square items-center justify-center">
                <span className="font-semibold text-xl">{i + 1}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious label="Previous slide" />
      <CarouselNext label="Next slide" />
    </Carousel>
  )
}

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <Carousel opts={{ align: 'start' }} className="w-[16rem]" {...args}>
      <CarouselContent className="-mt-2 h-[16rem]">
        {Array.from({ length: 5 }, (_, i) => (
          <CarouselItem key={i} className="basis-1/2 pt-2">
            <Card>
              <CardContent className="flex h-28 items-center justify-center">
                <span className="font-semibold text-xl">{i + 1}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious label="Previous slide" />
      <CarouselNext label="Next slide" />
    </Carousel>
  )
}

/** Looping — the arrows never go disabled. */
export const Loop: Story = {
  render: (args) => (
    <Carousel opts={{ loop: true }} className="w-[20rem]" {...args}>
      <CarouselContent>
        {Array.from({ length: 4 }, (_, i) => (
          <CarouselItem key={i}>
            <Card>
              <CardContent className="flex aspect-video items-center justify-center">
                <span className="font-semibold text-2xl">{i + 1}</span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious label="Previous slide" />
      <CarouselNext label="Next slide" />
    </Carousel>
  )
}
