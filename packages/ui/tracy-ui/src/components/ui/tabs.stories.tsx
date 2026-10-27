/**
 * Two list variants: the filled pill (`default`) and the underline (`line`). They are not
 * interchangeable — the pill reads as a control, the underline as navigation, and the product
 * uses the underline for the three panes of a site screen.
 *
 * base-ui names the parts `Tab` and `Panel`; the wrappers keep the shadcn names, so `value` still
 * pairs a trigger with its content.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs'

const meta: Meta<typeof Tabs> = {
  title: 'UI/Tabs',
  component: Tabs,
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } }
}
export default meta
type Story = StoryObj<typeof Tabs>

const PANES = [
  { value: 'chat', label: 'Chat', body: 'Ask Tracy for a change. Nothing is written until you approve it.' },
  { value: 'changes', label: 'Changes', body: '12 proposals waiting, 3 applied today.' },
  { value: 'preview', label: 'Preview', body: 'The site as it will look once the proposals are applied.' }
]

export const Default: Story = {
  render: (args) => (
    <Tabs defaultValue="chat" className="w-[30rem]" {...args}>
      <TabsList>
        {PANES.map((p) => (
          <TabsTrigger key={p.value} value={p.value}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PANES.map((p) => (
        <TabsContent key={p.value} value={p.value} className="pt-3 text-muted-foreground text-sm">
          {p.body}
        </TabsContent>
      ))}
    </Tabs>
  )
}

/** `variant="line"` — the underline list the site screen uses. */
export const Line: Story = {
  render: (args) => (
    <Tabs defaultValue="chat" className="w-[30rem]" {...args}>
      <TabsList variant="line">
        {PANES.map((p) => (
          <TabsTrigger key={p.value} value={p.value}>
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PANES.map((p) => (
        <TabsContent key={p.value} value={p.value} className="pt-3 text-muted-foreground text-sm">
          {p.body}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <Tabs defaultValue="chat" className="flex w-[34rem] gap-4" {...args}>
      <TabsList className="h-fit flex-col">
        {PANES.map((p) => (
          <TabsTrigger key={p.value} value={p.value} className="w-full justify-start">
            {p.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {PANES.map((p) => (
        <TabsContent key={p.value} value={p.value} className="text-muted-foreground text-sm">
          {p.body}
        </TabsContent>
      ))}
    </Tabs>
  )
}

export const WithDisabledTab: Story = {
  render: (args) => (
    <Tabs defaultValue="chat" className="w-[30rem]" {...args}>
      <TabsList>
        <TabsTrigger value="chat">Chat</TabsTrigger>
        <TabsTrigger value="changes">Changes</TabsTrigger>
        <TabsTrigger value="preview" disabled>
          Preview — needs write access
        </TabsTrigger>
      </TabsList>
      <TabsContent value="chat" className="pt-3 text-muted-foreground text-sm">
        {PANES[0].body}
      </TabsContent>
      <TabsContent value="changes" className="pt-3 text-muted-foreground text-sm">
        {PANES[1].body}
      </TabsContent>
    </Tabs>
  )
}
