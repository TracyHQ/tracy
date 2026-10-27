/**
 * base-ui splits the progress bar into parts — `Track`, `Indicator`, `Label`, `Value` — and
 * `Progress` renders a plain track when given no children. `value={null}` is the indeterminate
 * state: a real one, not a CSS animation faked on top of a zero-width bar.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Progress, ProgressIndicator, ProgressLabel, ProgressTrack, ProgressValue } from './progress'

const meta: Meta<typeof Progress> = {
  title: 'UI/Progress',
  component: Progress,
  argTypes: { value: { control: { type: 'range', min: 0, max: 100, step: 1 } } },
  args: { value: 62 }
}
export default meta
type Story = StoryObj<typeof Progress>

export const Default: Story = { render: (args) => <Progress className="w-[24rem]" {...args} /> }

/** Steps, so the fill and the empty track can be compared at once. */
export const Steps: Story = {
  render: () => (
    <div className="flex w-[24rem] flex-col gap-3">
      {[0, 25, 50, 75, 100].map((value) => (
        <Progress key={value} value={value} />
      ))}
    </div>
  )
}

/** With a label and a readout — the shape a provisioning screen uses. */
export const WithLabel: Story = {
  render: (args) => (
    <Progress className="w-[24rem]" {...args}>
      <div className="flex items-center justify-between pb-2">
        <ProgressLabel>Provisioning example.com</ProgressLabel>
        <ProgressValue />
      </div>
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  )
}

/** `value={null}` — work is happening, the size of it is unknown. */
export const Indeterminate: Story = {
  args: { value: null },
  render: (args) => (
    <Progress className="w-[24rem]" {...args}>
      <ProgressLabel className="pb-2">Reading the webroot…</ProgressLabel>
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </Progress>
  )
}
