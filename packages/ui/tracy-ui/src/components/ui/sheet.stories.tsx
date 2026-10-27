/**
 * Four sides, and the choice is not cosmetic: `right` is the drawer this product uses for a
 * site's details, `bottom` is what a phone gets, and `left` collides with dsh's own sidebar — so
 * a plugin must never open one there.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Button } from './button'
import { Input } from './input'
import { Label } from './label'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from './sheet'

const meta: Meta<typeof Sheet> = {
  title: 'UI/Sheet',
  component: Sheet,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof Sheet>

export const Default: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger render={<Button variant="outline" />}>Site details</SheetTrigger>
      <SheetContent closeLabel="Close">
        <SheetHeader>
          <SheetTitle>example.com</SheetTitle>
          <SheetDescription>WordPress 6.7 on the fleet, 4 seats.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sh-name">Label</Label>
            <Input id="sh-name" defaultValue="example.com" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sh-root">Webroot</Label>
            <Input id="sh-root" readOnly defaultValue="/srv/tracy/example/public" />
          </div>
        </div>
        <SheetFooter>
          <Button>Save</Button>
          <SheetClose render={<Button variant="outline" />}>Cancel</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/** All four sides on one screen. */
export const Sides: Story = {
  render: () => (
    <div className="flex gap-2">
      {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
        <Sheet key={side}>
          <SheetTrigger render={<Button variant="outline" size="sm" />}>{side}</SheetTrigger>
          <SheetContent side={side} closeLabel="Close">
            <SheetHeader>
              <SheetTitle>Opens from {side}</SheetTitle>
              <SheetDescription>
                {side === 'left'
                  ? 'Do not use this inside a dsh page — the host owns the left edge.'
                  : `The ${side} edge.`}
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      ))}
    </div>
  )
}

/** No close button: the sheet must be dismissed by its own footer. */
export const NoCloseButton: Story = {
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger render={<Button variant="outline" />}>Finish setup</SheetTrigger>
      <SheetContent showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Two steps left</SheetTitle>
          <SheetDescription>Grant write access, then pick a language.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <Button>Continue</Button>
          <SheetClose render={<Button variant="outline" />}>Later</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Opt in to a drag handle on the inner edge. The handle is a hairline that only shows on hover,
 * takes arrow keys once focused, and a double-click puts the sheet back to the width its classes
 * give it. `resizeId` is what remembers the width for the next visit, per browser.
 *
 * Only `left` and `right` grow a handle: the other two sides would be a height, and nothing asks
 * for one — pass `resizable` there and the sheet simply stays as it was.
 */
export const Resizable: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Drag my edge</SheetTrigger>
      <SheetContent
        className="w-full sm:max-w-4xl"
        resizable
        resizeLabel="Resize panel"
        resizeId="storybook-sheet"
        closeLabel="Close"
      >
        <SheetHeader>
          <SheetTitle>example.com</SheetTitle>
          <SheetDescription>
            Grab the left edge, or focus it and press the arrow keys. Double-click resets it.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="sh-wide">A field wide enough to notice the change</Label>
          <Input id="sh-wide" defaultValue="/srv/tracy/example/public/wp-content/themes/tracy" />
        </div>
      </SheetContent>
    </Sheet>
  )
}
