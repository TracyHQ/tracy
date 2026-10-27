/**
 * The Inbox entry of the left column (spec #809, U1 = B): a row "Inbox" right below New session in
 * the wide column, an icon button with the count on the 56px rail. A press opens the Inbox tab, or
 * focuses it when it is open already (the tab is `single`).
 *
 * It lands in `sidebar.nav`, the list slot `@tracy/dsh-sidebar` declares below New session; the
 * occupant receives `{ wide }` like the column's other slots.
 */
import type { JSX } from 'react'
import { Inbox as InboxIcon } from 'lucide-react'
import { cn } from '@tracy/ui'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'

import { badgeText } from './badge'
import type { Translate } from './strings'
import { useUnread } from './unread'

export function InboxNav({
  wide,
  t,
  openInbox
}: {
  wide: boolean
  t: Translate
  openInbox: () => void
}): JSX.Element {
  useInterfaceLocale()
  const count = useUnread()
  const badge = badgeText(count)
  const label = t('tab.title')
  const countLabel = badge === null ? null : t('nav.unread', { count })
  return (
    <div className={cn('tracy-inbox-nav mt-1', wide ? 'w-full' : 'flex justify-center')}>
      <button
        type="button"
        className={cn('tracy-inbox-nav-button', wide ? 'h-9 w-full px-3 text-sm' : 'size-9 justify-center')}
        aria-label={countLabel === null ? label : `${label}, ${countLabel}`}
        title={wide ? undefined : label}
        onClick={openInbox}
      >
        <InboxIcon className="size-4 flex-none" strokeWidth={1.8} aria-hidden="true" />
        {wide ? <span className="min-w-0 flex-1 truncate text-start">{label}</span> : null}
        {badge !== null ? (
          <span className={cn('tracy-inbox-badge', !wide && 'is-corner')} aria-hidden="true">
            {badge}
          </span>
        ) : null}
      </button>
    </div>
  )
}
