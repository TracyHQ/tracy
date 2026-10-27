/**
 * Message is the chat row: avatar, header, content, footer, with `align` deciding which side it
 * hugs. It is the layout only — it renders whatever is put inside `MessageContent`, so a markdown
 * renderer or a diff view goes in there without this component knowing about either.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'

import { Avatar, AvatarFallback } from './avatar'
import { Message, MessageAvatar, MessageContent, MessageFooter, MessageGroup, MessageHeader } from './message'

const meta: Meta<typeof Message> = {
  title: 'UI/Message',
  component: Message,
  argTypes: { align: { control: 'inline-radio', options: ['start', 'end'] } }
}
export default meta
type Story = StoryObj<typeof Message>

export const FromTracy: Story = {
  render: (args) => (
    <Message className="w-[32rem]" {...args}>
      <MessageAvatar>
        <Avatar>
          <AvatarFallback>T</AvatarFallback>
        </Avatar>
      </MessageAvatar>
      <MessageContent>
        <MessageHeader>Tracy</MessageHeader>I read the webroot and found 18 pages. Three of them still carry
        the placeholder text from the theme. Want me to draft replacements?
        <MessageFooter>2 minutes ago</MessageFooter>
      </MessageContent>
    </Message>
  )
}

export const FromPerson: Story = {
  args: { align: 'end' },
  render: (args) => (
    <Message className="w-[32rem]" {...args}>
      <MessageContent>Yes — but do not touch the pricing page.</MessageContent>
    </Message>
  )
}

/** A short exchange, which is the only way the alignment reads correctly. */
export const Conversation: Story = {
  render: () => (
    <MessageGroup className="w-[32rem]">
      <Message>
        <MessageAvatar>
          <Avatar>
            <AvatarFallback>T</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>Tracy</MessageHeader>
          18 pages found. Three carry placeholder text.
        </MessageContent>
      </Message>
      <Message align="end">
        <MessageContent>Draft replacements, but leave the pricing page alone.</MessageContent>
      </Message>
      <Message>
        <MessageAvatar>
          <Avatar>
            <AvatarFallback>T</AvatarFallback>
          </Avatar>
        </MessageAvatar>
        <MessageContent>
          <MessageHeader>Tracy</MessageHeader>
          Done. Three proposals are waiting for you in Changes — nothing has been written yet.
          <MessageFooter>just now</MessageFooter>
        </MessageContent>
      </Message>
    </MessageGroup>
  )
}
