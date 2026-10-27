/**
 * Bubble is the speech-balloon skin a `Message` can wear: seven variants, a tail decided by
 * `align`, and a reaction strip that floats off one corner. It is separate from `Message` on
 * purpose — a chat that shows plain rows uses `Message` alone and never pulls this in.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Bubble, BubbleContent, BubbleGroup, BubbleReactions } from './bubble'

const VARIANTS = ['default', 'secondary', 'muted', 'tinted', 'outline', 'ghost', 'destructive'] as const

const meta: Meta<typeof Bubble> = {
  title: 'UI/Bubble',
  component: Bubble,
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    align: { control: 'inline-radio', options: ['start', 'end'] }
  }
}
export default meta
type Story = StoryObj<typeof Bubble>

export const Default: Story = {
  render: (args) => (
    <Bubble className="max-w-[24rem]" {...args}>
      <BubbleContent>I read the webroot and found 18 pages. Nothing has been written yet.</BubbleContent>
    </Bubble>
  )
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex w-[26rem] flex-col gap-3">
      {VARIANTS.map((variant) => (
        <Bubble key={variant} variant={variant}>
          <BubbleContent>{variant}</BubbleContent>
        </Bubble>
      ))}
    </div>
  )
}

/** Both sides, which is the only way the tail is visible. */
export const Alignment: Story = {
  render: () => (
    <BubbleGroup className="w-[30rem]">
      <Bubble align="start" variant="muted">
        <BubbleContent>18 pages found. Three carry placeholder text.</BubbleContent>
      </Bubble>
      <Bubble align="end">
        <BubbleContent>Draft replacements, but leave the pricing page alone.</BubbleContent>
      </Bubble>
      <Bubble align="start" variant="muted">
        <BubbleContent>Done — three proposals are waiting in Changes.</BubbleContent>
      </Bubble>
    </BubbleGroup>
  )
}

/** With reactions hanging off the corner. */
export const WithReactions: Story = {
  render: () => (
    <Bubble className="max-w-[24rem]" variant="muted">
      <BubbleContent>Three proposals are waiting in Changes.</BubbleContent>
      <BubbleReactions>
        <span className="rounded-full border bg-background px-1.5 py-0.5 text-xs">👍 2</span>
        <span className="rounded-full border bg-background px-1.5 py-0.5 text-xs">🎉 1</span>
      </BubbleReactions>
    </Bubble>
  )
}
