/**
 * Accordion is a base-ui `Accordion`, so `multiple` (not radix's `type="single|multiple"`)
 * is the prop that decides whether two panels can be open at once. Both stories exist because
 * that difference is the one thing a snippet copied off the internet will get wrong.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion'

const meta: Meta<typeof Accordion> = {
  title: 'UI/Accordion',
  component: Accordion,
  argTypes: {
    multiple: { control: 'boolean', description: 'Allow more than one open panel' },
    disabled: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Accordion>

const ITEMS = [
  {
    value: 'seat',
    q: 'What is a seat?',
    a: 'A seat is one person on one site. Someone with no seat anywhere sees the onboarding lane, not an empty list.'
  },
  {
    value: 'lane',
    q: 'What is a lane?',
    a: 'A lane is one running copy of the product for one customer, provisioned on the fleet and reached through a Cloudflare tunnel.'
  },
  {
    value: 'fleet',
    q: 'Where does a site actually run?',
    a: 'On the fleet host, under /srv/tracy/<label>/ in Docker. Tracy never runs a customer site on this machine.'
  }
]

function Body({ ...props }: React.ComponentProps<typeof Accordion>) {
  return (
    <Accordion className="w-[28rem]" {...props}>
      {ITEMS.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}

/** One panel at a time — the default, and what a FAQ wants. */
export const Default: Story = { render: (args) => <Body {...args} /> }

/** `multiple` lets several stay open; useful for a settings page, wrong for a FAQ. */
export const Multiple: Story = {
  args: { multiple: true },
  render: (args) => <Body {...args} />
}

/** Opened from the start, so the panel's resting style is visible without a click. */
export const DefaultOpen: Story = {
  args: { defaultValue: ['seat'] },
  render: (args) => <Body {...args} />
}

/** Every trigger inert. Worth a story: the disabled state is easy to leave unstyled. */
export const Disabled: Story = {
  args: { disabled: true },
  render: (args) => <Body {...args} />
}
