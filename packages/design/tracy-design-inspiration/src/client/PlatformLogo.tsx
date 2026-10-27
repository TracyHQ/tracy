/**
 * A CMS's own logo, by the id `platforms.mjs` uses — the marks `@tracy/ui` already ships, each with
 * its light and dark drawing. One place, so the filter chips and the cards cannot draw two
 * different Joomlas.
 */
import type { JSX } from 'react'
import { EmdashIcon } from '@tracy/ui/icons/platforms/emdash'
import { JoomlaIcon } from '@tracy/ui/icons/platforms/joomla'
import { WordpressIcon } from '@tracy/ui/icons/platforms/wordpress'

const LOGOS = { joomla: JoomlaIcon, wordpress: WordpressIcon, emdash: EmdashIcon } as const

export function PlatformLogo({ id, className }: { id: string; className?: string }): JSX.Element | null {
  const Logo = LOGOS[id as keyof typeof LOGOS]
  return Logo ? <Logo className={className} aria-hidden /> : null
}
