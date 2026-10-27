/**
 * AspectRatio is a `div` with `aspect-ratio` set inline — no ResizeObserver, no padding hack.
 * The three stories are the three ratios this product actually shows: a site preview, a square
 * avatar tile, and a wide hero.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { AspectRatio } from './aspect-ratio'

const meta: Meta<typeof AspectRatio> = {
  title: 'UI/AspectRatio',
  component: AspectRatio,
  argTypes: { ratio: { control: { type: 'number', step: 0.1 } } },
  args: { ratio: 16 / 9 }
}
export default meta
type Story = StoryObj<typeof AspectRatio>

function Fill({ label }: { label: string }) {
  return (
    <div className="flex size-full items-center justify-center rounded-lg bg-muted font-medium text-muted-foreground text-sm">
      {label}
    </div>
  )
}

export const Widescreen: Story = {
  render: (args) => (
    <div className="w-[24rem]">
      <AspectRatio {...args}>
        <Fill label="16 / 9 — site preview" />
      </AspectRatio>
    </div>
  )
}

export const Square: Story = {
  args: { ratio: 1 },
  render: (args) => (
    <div className="w-[12rem]">
      <AspectRatio {...args}>
        <Fill label="1 / 1" />
      </AspectRatio>
    </div>
  )
}

export const Ultrawide: Story = {
  args: { ratio: 21 / 9 },
  render: (args) => (
    <div className="w-[30rem]">
      <AspectRatio {...args}>
        <Fill label="21 / 9 — hero" />
      </AspectRatio>
    </div>
  )
}
