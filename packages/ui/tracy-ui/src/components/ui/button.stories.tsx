/**
 * Six variants times eight sizes, and two of those sizes exist nowhere in classic shadcn: `xs`
 * and `icon-xs`. They are what a dense toolbar inside a dsh panel needs, and they are the first
 * thing lost when someone copies a button snippet from the radix generation.
 *
 * `CssCheck` at the bottom is not decoration. It is the story that fails loudly when
 * `.storybook/preview.tsx` stops importing `src/style.css`: without Tailwind every button renders
 * as bare text on no background, and nothing else in Storybook reports it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { ArrowRightIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { expect } from 'storybook/test'

import { Button } from './button'

const VARIANTS = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const
const SIZES = ['default', 'xs', 'sm', 'lg'] as const
const ICON_SIZES = ['icon', 'icon-xs', 'icon-sm', 'icon-lg'] as const

const meta = {
  title: 'UI/Button',
  component: Button,
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    size: { control: 'inline-radio', options: [...SIZES, ...ICON_SIZES] },
    disabled: { control: 'boolean' }
  },
  args: { variant: 'default', size: 'default', children: 'Add site' }
} satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** The whole variant row, which is the comparison the controls panel cannot give you. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  )
}

/** Text sizes. `xs` and `lg` differ by 3px of height — worth seeing stacked, not one at a time. */
export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {SIZES.map((size) => (
        <Button key={size} size={size}>
          {size}
        </Button>
      ))}
    </div>
  )
}

/** Square sizes. An icon-only button with no accessible name is a bug; every one here has one. */
export const IconOnly: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {ICON_SIZES.map((size) => (
        <Button key={size} size={size} aria-label={`Add site (${size})`}>
          <PlusIcon />
        </Button>
      ))}
    </div>
  )
}

/**
 * `data-icon="inline-start"` / `"inline-end"` is how the button tightens the padding on the side
 * the icon sits. Leave it off and the icon looks glued to the label's centre.
 */
export const WithIcons: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button>
        <PlusIcon data-icon="inline-start" />
        Add site
      </Button>
      <Button variant="outline">
        Continue
        <ArrowRightIcon data-icon="inline-end" />
      </Button>
      <Button variant="destructive">
        <Trash2Icon data-icon="inline-start" />
        Delete
      </Button>
    </div>
  )
}

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      {VARIANTS.map((variant) => (
        <Button key={variant} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  )
}

/**
 * 🔒 THE CANARY FOR `import '../src/style.css'` IN `preview.tsx`.
 *
 * A default button must have a non-transparent background. If Tailwind never ran, it does not,
 * and every other story in this Storybook still looks "fine but plain" — which is exactly the
 * failure nobody catches by eye.
 */
export const CssCheck: Story = {
  play: async ({ canvas }) => {
    const button = canvas.getByRole('button', { name: 'Add site' })
    const background = getComputedStyle(button).backgroundColor
    await expect(background).not.toBe('rgba(0, 0, 0, 0)')
    await expect(background).not.toBe('transparent')
  }
}
