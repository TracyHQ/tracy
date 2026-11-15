import type { JSX } from 'react'
import { StartTitle } from './start-title'
import { fallback, type Translate } from './strings'
import { type StartKind, startCopyOf } from './start-copy'

/**
 * The empty chat of a kind that declares its own words (`start-copy.ts`): its title, nothing else.
 * It rides in the same start block a site's workspace draws, so the layout, the composer at the
 * bottom of the column and the hand-over to the conversation on the first message are the site's.
 * `data-tracy-copy` marks the block: composer-styles.ts draws the kind's input hint from it.
 * A sent first message empties the block to its wrapper, as on a site.
 */
export function KindStart({
  kind,
  t,
  sent
}: {
  kind: StartKind
  t?: Translate
  sent: boolean
}): JSX.Element | null {
  const copy = startCopyOf(kind)
  if (copy === null) return null
  return (
    <div
      className="tv-dock"
      data-tracy-start="site"
      data-tracy-copy={kind}
      data-tracy-sent={sent ? '' : undefined}
    >
      {sent ? null : (
        <div className="tv-start tv-start-site">
          <StartTitle text={fallback(t, copy.title)} />
        </div>
      )}
    </div>
  )
}
