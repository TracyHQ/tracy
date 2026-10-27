/**
 * The web's door to the tab: a row "Website Opportunities" below New session in the wide left
 * column, an icon button on the 56px rail. It lands in `sidebar.nav`, the list slot
 * `@tracy/dsh-sidebar` declares (the Inbox row is its neighbour, `tracy-inbox/src/client/nav.tsx`).
 *
 * Drawn only while the operator's switch is on and for a viewer the tab exists for (`seatOnlyTab`).
 */
import type { JSX } from 'react'
import { Store } from 'lucide-react'
import { cn } from '@tracy/ui'
import { useInterfaceLocale } from '@tracy/core/interface-languages/react'

import type { Translate } from './strings.ts'

export function WebsiteOpportunitiesNav({
  wide,
  t,
  open
}: {
  wide: boolean
  t: Translate
  open: () => void
}): JSX.Element {
  useInterfaceLocale()
  const label = t('tab.title')
  return (
    <div className={cn('tracy-wo-nav mt-1', wide ? 'w-full' : 'flex justify-center')}>
      <button
        type="button"
        className={cn('tracy-wo-nav-button', wide ? 'h-9 w-full px-3 text-sm' : 'size-9 justify-center')}
        aria-label={label}
        title={wide ? undefined : label}
        onClick={open}
      >
        <Store className="size-4 flex-none" strokeWidth={1.8} aria-hidden="true" />
        {wide ? <span className="min-w-0 flex-1 truncate text-start">{label}</span> : null}
      </button>
    </div>
  )
}
