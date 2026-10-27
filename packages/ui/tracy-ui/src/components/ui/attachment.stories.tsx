/**
 * Attachment carries a `state`, and that is the point: `uploading`, `processing` and `error` are
 * three different things a file can be doing, and a chip that only knows "done" turns all three
 * into a lie. Every state has a story here for that reason.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { PaperclipIcon, XIcon } from 'lucide-react'

import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger
} from './attachment'
import { Button } from './button'

const STATES = ['idle', 'uploading', 'processing', 'error', 'done'] as const

const meta: Meta<typeof Attachment> = {
  title: 'UI/Attachment',
  component: Attachment,
  argTypes: {
    state: { control: 'inline-radio', options: STATES },
    size: { control: 'inline-radio', options: ['default', 'sm', 'xs'] },
    orientation: { control: 'inline-radio', options: ['horizontal', 'vertical'] }
  }
}
export default meta
type Story = StoryObj<typeof Attachment>

export const Default: Story = {
  render: (args) => (
    <Attachment className="w-[20rem]" {...args}>
      <AttachmentMedia variant="icon">
        <PaperclipIcon />
      </AttachmentMedia>
      <AttachmentContent>
        <AttachmentTitle>brand-guidelines.pdf</AttachmentTitle>
        <AttachmentDescription>2.4 MB</AttachmentDescription>
      </AttachmentContent>
      <AttachmentActions>
        <AttachmentAction aria-label="Remove attachment">
          <XIcon />
        </AttachmentAction>
      </AttachmentActions>
    </Attachment>
  )
}

/** Every state, stacked. This is the sheet to check before shipping an upload flow. */
export const States: Story = {
  render: () => (
    <div className="flex w-[20rem] flex-col gap-2">
      {STATES.map((state) => (
        <Attachment key={state} state={state}>
          <AttachmentMedia variant="icon">
            <PaperclipIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>homepage-copy.docx</AttachmentTitle>
            <AttachmentDescription>{state}</AttachmentDescription>
          </AttachmentContent>
        </Attachment>
      ))}
    </div>
  )
}

export const Sizes: Story = {
  render: () => (
    <div className="flex w-[20rem] flex-col gap-2">
      {(['default', 'sm', 'xs'] as const).map((size) => (
        <Attachment key={size} size={size}>
          <AttachmentMedia variant="icon">
            <PaperclipIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{size}</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      ))}
    </div>
  )
}

/** A group under a composer, plus the trigger that adds to it. */
export const InComposer: Story = {
  render: () => (
    <div className="flex w-[28rem] flex-col gap-3 rounded-lg border p-3">
      <AttachmentGroup>
        <Attachment size="sm">
          <AttachmentMedia variant="icon">
            <PaperclipIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>logo.svg</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
        <Attachment size="sm" state="uploading">
          <AttachmentMedia variant="icon">
            <PaperclipIcon />
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>hero.png</AttachmentTitle>
          </AttachmentContent>
        </Attachment>
      </AttachmentGroup>
      <AttachmentTrigger render={<Button variant="outline" size="sm" />}>
        <PaperclipIcon data-icon="inline-start" />
        Attach a file
      </AttachmentTrigger>
    </div>
  )
}
