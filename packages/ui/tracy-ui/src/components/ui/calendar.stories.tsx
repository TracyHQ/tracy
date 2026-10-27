/**
 * Calendar wraps `react-day-picker`, so its API is that library's, not base-ui's: `mode`,
 * `selected`, `onSelect`, `captionLayout`. The single/range/multiple split lives there too.
 *
 * `buttonVariant` is the one prop this wrapper adds — it decides how the day cells look, and
 * `ghost` is what keeps a month grid from turning into a wall of buttons.
 *
 * 🔒 THE META IS TYPED ON A HAND-WRITTEN `Shared`, NOT ON `typeof Calendar`, AND THAT IS NOT
 * LAZINESS. `react-day-picker` types `selected`/`onSelect` as a union discriminated by `mode`;
 * spreading one `args` object into every story collapses that union to whichever branch
 * TypeScript picks first, and then `mode="single"` fails to accept a `Date`. Naming only the
 * props the toolbar actually controls keeps `mode` where it belongs — on each story.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'
import type { DateRange } from 'react-day-picker'

import { Calendar } from './calendar'

type Shared = {
  captionLayout?: 'label' | 'dropdown' | 'dropdown-months' | 'dropdown-years'
  showOutsideDays?: boolean
  buttonVariant?: 'ghost' | 'outline' | 'secondary'
}

const meta: Meta<Shared> = {
  title: 'UI/Calendar',
  component: Calendar as React.ComponentType<Shared>,
  parameters: { layout: 'centered' },
  argTypes: {
    captionLayout: {
      control: 'inline-radio',
      options: ['label', 'dropdown', 'dropdown-months', 'dropdown-years']
    },
    showOutsideDays: { control: 'boolean' },
    buttonVariant: { control: 'inline-radio', options: ['ghost', 'outline', 'secondary'] }
  },
  args: { captionLayout: 'label', showOutsideDays: true, buttonVariant: 'ghost' }
}
export default meta
type Story = StoryObj<Shared>

const SEPT_3 = new Date(2026, 8, 3)

export const Default: Story = {
  render: function DefaultStory(args) {
    const [date, setDate] = React.useState<Date | undefined>(SEPT_3)
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        defaultMonth={SEPT_3}
        className="rounded-lg border"
        {...args}
      />
    )
  }
}

/** A range — what a "backups kept between" control needs. */
export const Range: Story = {
  render: function RangeStory(args) {
    const [range, setRange] = React.useState<DateRange | undefined>({
      from: SEPT_3,
      to: new Date(2026, 8, 12)
    })
    return (
      <Calendar
        mode="range"
        selected={range}
        onSelect={setRange}
        defaultMonth={SEPT_3}
        className="rounded-lg border"
        {...args}
      />
    )
  }
}

/** Several loose days. */
export const Multiple: Story = {
  render: function MultipleStory(args) {
    const [days, setDays] = React.useState<Date[] | undefined>([
      SEPT_3,
      new Date(2026, 8, 7),
      new Date(2026, 8, 18)
    ])
    return (
      <Calendar
        mode="multiple"
        selected={days}
        onSelect={setDays}
        defaultMonth={SEPT_3}
        className="rounded-lg border"
        {...args}
      />
    )
  }
}

/** Dropdown caption — how someone jumps back a year without twelve clicks. */
export const DropdownCaption: Story = {
  args: { captionLayout: 'dropdown' },
  render: function DropdownStory(args) {
    const [date, setDate] = React.useState<Date | undefined>(SEPT_3)
    return (
      <Calendar
        mode="single"
        selected={date}
        onSelect={setDate}
        defaultMonth={SEPT_3}
        startMonth={new Date(2020, 0)}
        endMonth={new Date(2030, 11)}
        className="rounded-lg border"
        {...args}
      />
    )
  }
}

/** Two months side by side, with everything before today disabled. */
export const TwoMonthsWithDisabled: Story = {
  render: function TwoMonthsStory(args) {
    const [range, setRange] = React.useState<DateRange | undefined>()
    return (
      <Calendar
        mode="range"
        numberOfMonths={2}
        selected={range}
        onSelect={setRange}
        defaultMonth={SEPT_3}
        disabled={{ before: SEPT_3 }}
        className="rounded-lg border"
        {...args}
      />
    )
  }
}
