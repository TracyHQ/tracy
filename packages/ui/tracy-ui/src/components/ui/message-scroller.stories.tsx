/**
 * MessageScroller is the scroll behaviour a chat needs and a `ScrollArea` cannot give: it pins
 * to the newest message, keeps position when older messages are prepended, and shows a
 * jump-to-latest button only while you are actually scrolled away from the end.
 *
 * ⚠ IT CARRIES THREE CLASSES THE REGISTRY DOES NOT SHIP: `scroll-fade-b`, `scrollbar-thin` and
 * `scrollbar-gutter-stable` live in the CSS of ui.shadcn.com, not in the component. Without them
 * the scroller still works — it simply has a plain scrollbar and no fade at the bottom edge. If
 * that fade is wanted, it has to be written into `tokens.css` the way `cn-rtl-flip` was.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import * as React from 'react'

import { Avatar, AvatarFallback } from './avatar'
import { Button } from './button'
import { Message, MessageAvatar, MessageContent, MessageHeader } from './message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport
} from './message-scroller'

const meta: Meta<typeof MessageScroller> = {
  title: 'UI/MessageScroller',
  component: MessageScroller,
  parameters: { layout: 'centered' }
}
export default meta
type Story = StoryObj<typeof MessageScroller>

const LINES = [
  'I read the webroot and found 18 pages.',
  'Three of them still carry the theme placeholder text.',
  'Want me to draft replacements?',
  'Yes — but leave the pricing page alone.',
  'Understood. Drafting three replacements now.',
  'Done. They are waiting in Changes; nothing has been written.',
  'Also: the contact form posts to an address that bounces.',
  'Fix that too.',
  'That one needs write access to wp-config. Grant it?',
  'Granted.',
  'A backup was taken first, kept for 30 days.',
  'Contact form updated. 12 changes are now waiting for review.'
]

export const Default: Story = {
  render: () => (
    <MessageScrollerProvider autoScroll defaultScrollPosition="end">
      <MessageScroller className="h-80 w-[32rem] rounded-lg border">
        <MessageScrollerViewport>
          <MessageScrollerContent className="p-4">
            {LINES.map((line, i) => (
              <MessageScrollerItem key={line} messageId={`m-${i}`} scrollAnchor={i === LINES.length - 1}>
                <Message align={i % 2 === 0 ? 'start' : 'end'}>
                  {i % 2 === 0 ? (
                    <MessageAvatar>
                      <Avatar>
                        <AvatarFallback>T</AvatarFallback>
                      </Avatar>
                    </MessageAvatar>
                  ) : null}
                  <MessageContent>
                    {i % 2 === 0 ? <MessageHeader>Tracy</MessageHeader> : null}
                    {line}
                  </MessageContent>
                </Message>
              </MessageScrollerItem>
            ))}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton className="absolute inset-x-0 bottom-3 mx-auto" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

/**
 * Prepending older messages. Scroll up, press the button, and the message you were reading must
 * stay under the cursor — that is `preserveScrollOnPrepend` doing its job, and it is the whole
 * reason this component exists instead of a `ScrollArea`.
 */
export const PrependOlder: Story = {
  render: function PrependStory() {
    const [lines, setLines] = React.useState(LINES.slice(6))
    return (
      <div className="flex flex-col gap-3">
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => setLines((current) => [...LINES.slice(0, 3), ...current])}
        >
          Load older messages
        </Button>
        <MessageScrollerProvider defaultScrollPosition="end">
          <MessageScroller className="h-64 w-[32rem] rounded-lg border">
            <MessageScrollerViewport preserveScrollOnPrepend>
              <MessageScrollerContent className="p-4">
                {lines.map((line, i) => (
                  <MessageScrollerItem key={`${line}-${i}`}>
                    <Message>
                      <MessageContent>{line}</MessageContent>
                    </Message>
                  </MessageScrollerItem>
                ))}
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      </div>
    )
  }
}
