/**
 * Drawer is base-ui's own, not vaul: it swipes, it snaps, and `swipeDirection` decides which way.
 * It differs from `Sheet` in exactly that — a Sheet is a panel that appears, a Drawer is a panel
 * you can drag. Use the Drawer when a thumb will reach it.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger
} from './drawer'

const meta: Meta<typeof Drawer> = {
  title: 'UI/Drawer',
  component: Drawer,
  parameters: { layout: 'centered' },
  argTypes: {
    swipeDirection: { control: 'inline-radio', options: ['up', 'down', 'left', 'right'] },
    showSwipeHandle: { control: 'boolean' }
  }
}
export default meta
type Story = StoryObj<typeof Drawer>

export const Default: Story = {
  args: { showSwipeHandle: true },
  render: (args) => (
    <Drawer {...args}>
      <DrawerTrigger render={<Button variant="outline" />}>Open drawer</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Apply 12 proposals?</DrawerTitle>
          <DrawerDescription>
            Tracy writes them in one pass. Swipe down to dismiss, or use the buttons.
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <Button>Apply all</Button>
          <DrawerClose render={<Button variant="outline" />}>Cancel</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

/** Snap points: the drawer rests part-way before it opens fully. */
export const SnapPoints: Story = {
  args: { showSwipeHandle: true, snapPoints: [0.4, 1] },
  render: (args) => (
    <Drawer {...args}>
      <DrawerTrigger render={<Button variant="outline" />}>Open with snap points</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>18 pages found</DrawerTitle>
          <DrawerDescription>Drag the handle to see the whole list.</DrawerDescription>
        </DrawerHeader>
        <div className="max-h-[60vh] overflow-y-auto px-4 pb-4">
          {Array.from({ length: 18 }, (_, i) => (
            <p key={i} className="border-b py-2 font-mono text-xs last:border-0">
              /page-{i + 1}
            </p>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
