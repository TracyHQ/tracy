import type { ComponentType } from 'react'

/** What the seat's occupant hands each piece. */
export interface ActivityPieceProps {
  sessionId?: string
}

export interface ActivityPiece {
  readonly id: string
  readonly Component: ComponentType<ActivityPieceProps>
}

export interface InputActivity {
  /** Add a piece after the microphone; the returned function takes it away again. */
  add(id: string, Component: ComponentType<ActivityPieceProps>): () => void
  /** The pieces in the order they were added: the same array until it changes. */
  list(): readonly ActivityPiece[]
  subscribe(listener: () => void): () => void
}

export function inputActivity(): InputActivity
