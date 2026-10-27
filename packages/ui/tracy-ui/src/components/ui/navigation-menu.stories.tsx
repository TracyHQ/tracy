/**
 * NavigationMenu is a marketing-site menu bar, not app navigation: it opens a panel on hover and
 * animates between panels. Inside the product, `Sidebar` or `Tabs` is almost always the right
 * component — this one belongs on a page a visitor sees before they have a seat.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle
} from './navigation-menu'

const meta: Meta<typeof NavigationMenu> = {
  title: 'UI/NavigationMenu',
  component: NavigationMenu,
  parameters: { layout: 'centered' },
  argTypes: { align: { control: 'inline-radio', options: ['start', 'center', 'end'] } }
}
export default meta
type Story = StoryObj<typeof NavigationMenu>

export const Default: Story = {
  render: (args) => (
    <NavigationMenu {...args}>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Product</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[24rem] gap-1 p-2">
              {[
                ['Sites', 'Every site you hold a seat on, in one place.'],
                ['Proposals', 'Nothing is written until you say so.'],
                ['Fleet', 'Where a customer site actually runs.']
              ].map(([title, note]) => (
                <li key={title}>
                  <NavigationMenuLink href="#" className="flex flex-col gap-1 rounded-lg p-3">
                    <span className="font-medium text-sm">{title}</span>
                    <span className="text-muted-foreground text-xs">{note}</span>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuTrigger>Docs</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-[20rem] gap-1 p-2">
              {['Getting started', 'Connecting a site', 'Seats and roles'].map((title) => (
                <li key={title}>
                  <NavigationMenuLink href="#" className="rounded-lg p-3 text-sm">
                    {title}
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            Pricing
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
