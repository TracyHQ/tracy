/**
 * A `<kbd>` element, styled. `KbdGroup` is what keeps a chord from being read as three separate
 * keys by a screen reader, and what stops the pluses from wrapping mid-shortcut.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Kbd, KbdGroup } from './kbd'

const meta = {
  title: 'UI/Kbd',
  component: Kbd,
  args: { children: '⌘' }
} satisfies Meta<typeof Kbd>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Chord: Story = {
  render: () => (
    <KbdGroup>
      <Kbd>⌘</Kbd>
      <Kbd>K</Kbd>
    </KbdGroup>
  )
}

/** The shortcuts this product actually binds. */
export const Shortcuts: Story = {
  render: () => (
    <div className="flex flex-col gap-2 text-sm">
      {[
        ['Open the palette', ['⌘', 'K']],
        ['Add site', ['⌘', 'N']],
        ['Settings', ['⌘', ',']],
        ['Send a message', ['⌘', '⏎']]
      ].map(([label, keys]) => (
        <div key={label as string} className="flex w-[20rem] items-center justify-between gap-4">
          <span>{label as string}</span>
          <KbdGroup>
            {(keys as string[]).map((k) => (
              <Kbd key={k}>{k}</Kbd>
            ))}
          </KbdGroup>
        </div>
      ))}
    </div>
  )
}

/** Inside a button, where a shortcut hint usually lives. */
export const InButton: Story = {
  render: () => (
    <Button variant="outline">
      Open the palette
      <KbdGroup className="ml-2">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
    </Button>
  )
}
