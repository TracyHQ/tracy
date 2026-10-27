/**
 * Resizable wraps `react-resizable-panels` **v4**, and v4 renamed things the classic shadcn
 * snippets still use: the group takes `orientation`, not `direction`, and sizes are numbers for
 * pixels but strings for percent (`defaultSize="30"` is 30%, `defaultSize={30}` is 30px). A
 * snippet copied from the v2 era compiles to a layout that looks broken rather than failing.
 *
 * `withHandle` is worth turning on for any handle a person is meant to find: without it the grip
 * is a hairline, discoverable only by accident.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from './resizable'

const meta: Meta<typeof ResizablePanelGroup> = {
  title: 'UI/Resizable',
  component: ResizablePanelGroup,
  parameters: { layout: 'centered' },
  argTypes: { orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] } }
}
export default meta
type Story = StoryObj<typeof ResizablePanelGroup>

function Pane({ label }: { label: string }) {
  return (
    <div className="flex size-full items-center justify-center p-4 text-muted-foreground text-sm">
      {label}
    </div>
  )
}

export const Horizontal: Story = {
  render: (args) => (
    <ResizablePanelGroup className="h-64 w-[36rem] rounded-lg border" {...args}>
      <ResizablePanel defaultSize="30" minSize="20">
        <Pane label="Chat" />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="70">
        <Pane label="Preview" />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <ResizablePanelGroup className="h-64 w-[36rem] rounded-lg border" {...args}>
      <ResizablePanel defaultSize="60">
        <Pane label="Preview" />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="40" minSize="20">
        <Pane label="Changes" />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** Three panes with a nested group — the site screen's real shape. */
export const SiteScreen: Story = {
  render: (args) => (
    <ResizablePanelGroup className="h-80 w-[42rem] rounded-lg border" {...args}>
      <ResizablePanel defaultSize="30" minSize="20">
        <Pane label="Chat" />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="70">
        <ResizablePanelGroup orientation="vertical">
          <ResizablePanel defaultSize="65">
            <Pane label="Preview" />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="35" minSize="15">
            <Pane label="Changes" />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** A collapsible pane: drag it under `minSize` and it snaps shut instead of squeezing. */
export const Collapsible: Story = {
  render: (args) => (
    <ResizablePanelGroup className="h-64 w-[36rem] rounded-lg border" {...args}>
      <ResizablePanel defaultSize="30" minSize="20" collapsible collapsedSize="0">
        <Pane label="Chat — drag me shut" />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="70">
        <Pane label="Preview" />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}

/** No grip — the hairline handle. Here so the difference is arguable, not theoretical. */
export const WithoutHandle: Story = {
  render: (args) => (
    <ResizablePanelGroup className="h-40 w-[36rem] rounded-lg border" {...args}>
      <ResizablePanel defaultSize="50">
        <Pane label="Left" />
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel defaultSize="50">
        <Pane label="Right" />
      </ResizablePanel>
    </ResizablePanelGroup>
  )
}
