/**
 * What became of each link the owner gave the research (#609): one quiet line per link under the research row, its
 * name, its state and, once research ended, plain counts (`linkLineOf` of `@tracy/core/build-chat`). A link that gave
 * nothing says so in its own line. Nothing to open, no provider name, no code.
 */
import { linkLineOf, type LinkRead } from '@tracy/core/build-chat'
import type { Translate } from './strings'

export function LinkReadLines({ links, t }: { links: readonly LinkRead[]; t: Translate }) {
  if (links.length === 0) return null
  return (
    <ul className="tv-bc-linkreads">
      {links.map((line, i) => (
        <li key={`${line.name}-${i}`} data-link-state={line.state}>
          {linkLineOf(line, t)}
        </li>
      ))}
    </ul>
  )
}
