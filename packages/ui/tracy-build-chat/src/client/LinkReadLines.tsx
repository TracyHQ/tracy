/**
 * What became of each link the owner gave the research (#609): one quiet line per link under the research row, its
 * name, its state and, once research ended, plain counts (`linkLineOf` of `@tracy/core/build-chat`). A link that gave
 * nothing says so in its own line. Nothing to open, no provider name, no code. Each line leads with the status dot of
 * the build chat mock (#575): grey while it waits on the owner, a turning ring while it is read, green once read, red
 * when it could not be read. The dot repeats what the words say, so it is hidden from assistive technology.
 */
import { type LinkRead, linkLineOf } from '@tracy/core/build-chat'
import type { Translate } from './strings'

const DOT: Record<LinkRead['state'], string> = {
  choice: 'pending',
  reading: 'running',
  read: 'done',
  failed: 'failed'
}

export function LinkReadLines({ links, t }: { links: readonly LinkRead[]; t: Translate }) {
  if (links.length === 0) return null
  return (
    <ul className="tv-bc-linkreads">
      {links.map((line, i) => (
        <li key={`${line.name}-${i}`} data-link-state={line.state}>
          <span className="tv-bc-sd" data-s={DOT[line.state]} aria-hidden="true" />
          <span>{linkLineOf(line, t)}</span>
        </li>
      ))}
    </ul>
  )
}
