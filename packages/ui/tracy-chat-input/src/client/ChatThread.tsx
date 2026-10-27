/**
 * The chip of a chat message sent from a thread card, with the thread under it (acceptance F6, story
 * ThreadCardSendToChat in `packages/dev/tracy-design/src/mockups/browser-comment.mock.stories.tsx`): the
 * chip (author's bubble, element icon, quote), then a "Thread" block with a left rule and one line per
 * person's message, `Name: words`, EVERY line (Brian's bug 4, 30/09: folded to its two OLDEST lines, the
 * newest reply — usually the one that matters — hid behind "Show all N"). Only a very long thread folds:
 * past {@link SHOWN} lines the NEWEST {@link SHOWN} stay in view and "Show all N" sits above them,
 * where the hidden older lines unfold; "Show less" folds them back. A line with no name is the turn's
 * own "… N earlier replies not shown …" (TH-3: a thread past its cap in the turn), shown as it is.
 *
 * WHY THE ICON DRAWS IT. dsh's fenced-block fold (`uiConversation.userTextFolds`) turns a block into ONE
 * chip — a glyph and a line of words — and nothing else may draw inside the bubble (a
 * `conversation.chat.node` wrapper made the durable row and its echo differ, 28/09,
 * `test/comment-row-identical.test.mjs`). So a threaded chip hands dsh an empty label and draws its
 * words and the thread in the glyph's place; `styles.ts` lets that glyph box grow into a block.
 * Tracy reads the same thread from the turn's `thread:` lines; this is only what people see.
 */
import type { JSX, ReactNode } from 'react'
import { useState } from 'react'
import { fallback, type Translate } from './strings'

/** How many thread lines a long thread keeps in view (its newest) before "Show all". */
export const SHOWN = 12

export function ChatThread({
  face,
  label,
  thread,
  t
}: {
  /** The chip's glyphs: the author's bubble and the element's icon. */
  face: ReactNode
  label: string
  thread: readonly { who: string; text: string }[]
  t?: Translate
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const more = thread.length - SHOWN
  const shown = open || more <= 0 ? thread : thread.slice(-SHOWN)
  return (
    <>
      <span className="tv-comment-chip-face">
        {face}
        <span className="tv-comment-chip-words">{label}</span>
      </span>
      <span className="tv-comment-thread" data-tracy-thread="">
        <span className="tv-comment-thread-title">{fallback(t, 'chat.thread')}</span>
        {more > 0 && (
          <button
            type="button"
            className="tv-comment-thread-more"
            onClick={(event) => {
              event.stopPropagation()
              setOpen(!open)
            }}
          >
            {open
              ? fallback(t, 'chat.thread.less')
              : fallback(t, 'chat.thread.all', { count: thread.length })}
          </button>
        )}
        {shown.map((line, i) => (
          <span key={i} className="tv-comment-thread-line">
            {line.who !== '' && <span className="tv-comment-thread-who">{`${line.who}:`}</span>}
            {line.who !== '' ? ` ${line.text}` : line.text}
          </span>
        ))}
      </span>
    </>
  )
}
