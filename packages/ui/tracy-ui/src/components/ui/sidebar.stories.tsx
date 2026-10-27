/**
 * Sidebar is the biggest composed component here — 24 exports, a provider, a cookie, and a
 * breakpoint that changes the DOM rather than the layout: under 768px `Sidebar` renders as a
 * `Sheet`, not as a narrow column. Switch the viewport toolbar to Mobile on any story below and
 * watch it become an overlay.
 *
 * ⚠ INSIDE A dsh PAGE, THE LEFT RAIL BELONGS TO dsh. This component is for surfaces Tracy owns
 * — the design bench, Storybook, a Worker-rendered page. Drawing one inside a plugin puts two
 * navigations on top of each other, which is the mistake measured on 30/08/2026. See
 * `DESIGN.md` §0.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { GlobeIcon, InboxIcon, LifeBuoyIcon, PlusIcon, SettingsIcon } from 'lucide-react'

import { Separator } from './separator'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger
} from './sidebar'

const meta: Meta<typeof Sidebar> = {
  title: 'UI/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  args: { mobileTitle: 'Sidebar', mobileDescription: 'Displays the mobile sidebar.' },
  argTypes: {
    side: { control: 'inline-radio', options: ['left', 'right'] },
    variant: { control: 'inline-radio', options: ['sidebar', 'floating', 'inset'] },
    collapsible: { control: 'inline-radio', options: ['offcanvas', 'icon', 'none'] }
  }
}
export default meta
type Story = StoryObj<typeof Sidebar>

const SITES = [
  { name: 'example.com', count: 12 },
  { name: 'tracy.ai', count: 0 },
  { name: 'cowork.tracy.ai', count: 3 }
]

function Body({ ...args }: React.ComponentProps<typeof Sidebar>) {
  return (
    <SidebarProvider>
      <Sidebar {...args}>
        <SidebarHeader>
          <SidebarInput placeholder="Search sites…" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Sites</SidebarGroupLabel>
            <SidebarGroupAction aria-label="Add site">
              <PlusIcon />
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {SITES.map((site, i) => (
                  <SidebarMenuItem key={site.name}>
                    <SidebarMenuButton isActive={i === 0} tooltip={site.name}>
                      <GlobeIcon />
                      <span>{site.name}</span>
                    </SidebarMenuButton>
                    {site.count > 0 ? <SidebarMenuBadge>{site.count}</SidebarMenuBadge> : null}
                    {i === 0 ? (
                      <SidebarMenuSub>
                        {['Chat', 'Changes', 'Preview'].map((pane) => (
                          <SidebarMenuSubItem key={pane}>
                            <SidebarMenuSubButton isActive={pane === 'Chat'}>{pane}</SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    ) : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>You</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Inbox">
                    <InboxIcon />
                    <span>Inbox</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge>4</SidebarMenuBadge>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton tooltip="Settings">
                    <SettingsIcon />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Help">
                <LifeBuoyIcon />
                <span>Help</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail label="Toggle Sidebar" />
      </Sidebar>

      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-3">
          <SidebarTrigger label="Toggle Sidebar" />
          <Separator orientation="vertical" className="h-4" />
          <p className="font-medium text-sm">example.com — Chat</p>
        </header>
        <div className="p-6 text-muted-foreground text-sm">
          Press the trigger, or ⌘B, to collapse the sidebar. Switch the viewport to Mobile and it becomes a
          sheet instead.
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export const Default: Story = { render: (args) => <Body {...args} /> }

/** `collapsible="icon"` — collapses to a rail of glyphs, where the `tooltip` prop earns its keep. */
export const CollapsibleIcon: Story = {
  args: { collapsible: 'icon' },
  render: (args) => <Body {...args} />
}

/** `variant="floating"` — the panel detaches from the window edge. */
export const Floating: Story = {
  args: { variant: 'floating' },
  render: (args) => <Body {...args} />
}

/** `variant="inset"` — the content pane is what floats instead. */
export const Inset: Story = {
  args: { variant: 'inset' },
  render: (args) => <Body {...args} />
}

/** On the right. Inside a dsh page this is the ONLY side a Tracy panel may take. */
export const RightSide: Story = {
  args: { side: 'right' },
  render: (args) => <Body {...args} />
}

/** Loading: `SidebarMenuSkeleton` keeps the rail from collapsing to nothing while sites load. */
export const Loading: Story = {
  render: () => (
    <SidebarProvider>
      <Sidebar mobileTitle="Sidebar" mobileDescription="Displays the mobile sidebar.">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Sites</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {Array.from({ length: 5 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div className="p-6 text-muted-foreground text-sm">Loading your sites…</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
