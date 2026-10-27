/**
 * Six variants, and the one worth looking at twice is `destructive`: in base-nova it is a tinted
 * badge (`bg-destructive/10` + destructive text), not a solid red one like classic shadcn. Put it
 * next to `default` and the difference is obvious; read it in isolation and it is not.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckIcon, CircleDotIcon, XIcon } from 'lucide-react'

import { Badge } from './badge'

const VARIANTS = ['default', 'secondary', 'destructive', 'outline', 'ghost', 'link'] as const

const meta = {
  title: 'UI/Badge',
  component: Badge,
  argTypes: { variant: { control: 'inline-radio', options: VARIANTS } },
  args: { variant: 'default', children: 'Connected' }
} satisfies Meta<typeof Badge>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** Every variant at once — the sheet a designer actually reads. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {VARIANTS.map((variant) => (
        <Badge key={variant} variant={variant}>
          {variant}
        </Badge>
      ))}
    </div>
  )
}

/** With an icon: the badge grows its inline padding via `has-data-[icon=inline-start]`. */
export const WithIcon: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>
        <CheckIcon data-icon="inline-start" />
        Applied
      </Badge>
      <Badge variant="secondary">
        <CircleDotIcon data-icon="inline-start" />
        In review
      </Badge>
      <Badge variant="destructive">
        <XIcon data-icon="inline-start" />
        Failed
      </Badge>
    </div>
  )
}

/** The seat roles this product actually renders, so the words are checked as well as the style. */
export const SeatRoles: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge>Owner</Badge>
      <Badge variant="secondary">Editor</Badge>
      <Badge variant="outline">Viewer</Badge>
      <Badge variant="ghost">Invited</Badge>
    </div>
  )
}
