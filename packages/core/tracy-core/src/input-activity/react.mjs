/**
 * React side of `@tracy/core/input-activity`: draw the page's activity pieces (#1379).
 *
 * Whoever renders dsh's `conversation.input.activity` draws these: `@tracy/dsh-chat-input` after its
 * microphone, and `@tracy/dsh-assistant` as the seat's fallback occupant on a profile without
 * chat-input. The seat renders one registration only, so the pieces are drawn once either way.
 */
import { createElement, Fragment, useSyncExternalStore } from 'react'
import { inputActivity } from './index.mjs'

/**
 * Every piece added to the page's list, in the order added.
 * @param {import('./index.d.mts').ActivityPieceProps} props
 */
export function ActivityPieces({ sessionId }) {
  const activity = inputActivity()
  const pieces = useSyncExternalStore(activity.subscribe, activity.list, activity.list)
  return createElement(
    Fragment,
    null,
    pieces.map(({ id, Component }) => createElement(Component, { key: id, sessionId }))
  )
}
