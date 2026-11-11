/**
 * The line naming the account's other cards of the same place (#537 R23): "Also added on 9 Nov (Research)", a link to
 * that card, and "+2 more" when there are more. Drawn under the name of a list row and at the top of Details.
 */
import type { JSX } from 'react'
import { interfaceLocale } from '@tracy/core/interface-languages'

import { type SameAsCard, sameAsLine } from './same-as-model.ts'
import type { Translate } from './strings.ts'

export function SameAsLine({
  t,
  cards,
  onOpen
}: {
  t: Translate
  cards: readonly SameAsCard[]
  /** Opens the other card's Details. */
  onOpen: (id: string) => void
}): JSX.Element | null {
  const line = sameAsLine(t, cards, interfaceLocale() ?? 'en')
  if (line === null) return null
  return (
    <p className="tracy-wo-same-as" data-same-as={line.first.id}>
      <button type="button" title={line.text} onClick={() => onOpen(line.first.id)}>
        {line.text}
      </button>
      {line.more === null ? null : <span>{line.more}</span>}
    </p>
  )
}
