/**
 * The small parts the three site tabs share: the header with the site picker, the face on a row,
 * and the words for "who" and "when". Drawn to `Mockups/Sidebar site tabs` (Lee, 04/09).
 *
 * Mode B, like every plugin in dsh's page: Tailwind utilities on `@tracy/ui`, no preflight, so
 * the `m-0` on paragraphs and `list-none` on lists are not decoration.
 */
import { type JSX, type ReactNode } from 'react'
import { Bot, Check, ChevronDown, Globe } from 'lucide-react'
import { Button, cn } from '@tracy/ui'

import { siteNameFor } from '../site-key/index.mjs'
import { agoOf, agoUnitsOf, roleLabelKey } from '../team/roster'
import { addressFace, Face } from '../team/face'
import type { Translate } from '../team/translate'
import type { Actor } from './api'
import { Popover, PopoverItem, PopoverLabel, PopoverSeparator } from './Popover'

/** A role beside a site, by its translated name; nothing for a word that is not a role. */
const roleHint = (role: string | null, t: Translate): string | undefined => {
  const key = roleLabelKey(role)
  return key === null ? undefined : t(key)
}

/** One site the picker offers: the key, its current name, and the role the viewer holds there. */
export interface PickableSite {
  siteKey: string
  /** The name the site is shown by (`/api/sites` `displayName`): a rename changes it, never the key. */
  displayName?: string
  role: string | null
  aliases?: string[]
  /** `wordpress` · `joomla` · `emdash`, as `/api/sites` names it; absent while unknown. */
  platform?: string | null
  /** Brought in with Import existing site (`/api/sites` `imported`). */
  imported?: boolean
}

/**
 * The header of every site tab. The site name at the left is a menu of every site the viewer
 * holds a seat on — a tab type is shared across sites, so the tab says which one it shows and
 * lets the person change it without opening another (Lee, 04/09).
 */
export function TabHeader({
  siteKey,
  sites,
  hint,
  action,
  onPick,
  t
}: {
  siteKey: string
  /** The viewer's role on the site. Still passed by the four tabs; no longer drawn (29/09). */
  role: string | null
  sites: PickableSite[]
  hint?: ReactNode
  action?: ReactNode
  onPick: (siteKey: string) => void
  t: Translate
}): JSX.Element {
  return (
    // py-3, not py-2 (Akemi, 29/09: the header read cramped around the Invite member button). One
    // header for every site tab — Team, Site changes, Settings, Diff — so all four stand the same
    // height and nothing jumps when the customer switches between them. A size container, so a
    // tab's action can fold to its icon in a narrow panel (Team, 30/09).
    <div className="@container flex items-center justify-between gap-3 border-border border-b px-3 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <Popover
          trigger={(props) => (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-ml-1 gap-1.5 px-2 font-semibold"
              {...props}
            >
              {siteNameFor(sites, siteKey)}
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </Button>
          )}
          className="w-72"
        >
          <PopoverLabel>{t('picker.title')}</PopoverLabel>
          <PopoverSeparator />
          {sites.map((s) => (
            <PopoverItem key={s.siteKey} onClick={() => onPick(s.siteKey)} hint={roleHint(s.role, t)}>
              <Check
                className={cn('size-3.5 flex-none', s.siteKey === siteKey ? 'opacity-100' : 'opacity-0')}
              />
              <span className="truncate">{siteNameFor(sites, s.siteKey)}</span>
            </PopoverItem>
          ))}
          {sites.length === 0 && (
            <>
              <PopoverItem disabled>
                <Check className="size-3.5 flex-none opacity-100" />
                <span className="truncate">{siteKey}</span>
              </PopoverItem>
              {/* The list arrives a few seconds after the tab does; say so, or one row reads as
                  "this is every site you have" (measured 05/09 — it was the whole list, late). */}
              <PopoverLabel>{t('picker.loading')}</PopoverLabel>
            </>
          )}
        </Popover>
        {/* No role beside the site name (Akemi, 29/09): it is the viewer's own role, read already in
            the site picker's rows and, on Team, in the Role column of their own row. */}
        {hint !== undefined && (
          <span className="hidden truncate text-muted-foreground text-xs sm:inline">· {hint}</span>
        )}
      </div>
      {action}
    </div>
  )
}

/** The face on a row: the person's avatar, the agent's mark, or the site itself for outside edits. */
export function ActorFace({ by, className }: { by: Actor; className?: string }): JSX.Element {
  if (by.kind === 'person') {
    // The server's face for this person (`personFace`), the one the Team tab shows. Without one (an
    // older server, a name it could not match to an account): `addressFace`, the first character of
    // their name (else address) on the neutral grey — never a colour guessed here.
    const face = by.face ?? addressFace(by.name || by.email)
    // The box is sized by class, so callers keep their `size-4` / `size-5`; the letter stays 10px.
    return (
      <span className={cn('inline-flex size-6 flex-none', className)}>
        <Face face={face} size={22} fill />
      </span>
    )
  }
  return (
    <span
      className={cn(
        'flex size-6 flex-none items-center justify-center rounded-full border',
        by.kind === 'agent'
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground',
        className
      )}
    >
      {by.kind === 'agent' ? (
        <Bot className="size-3.5" aria-hidden="true" />
      ) : (
        <Globe className="size-3.5" aria-hidden="true" />
      )}
    </span>
  )
}

export const actorName = (by: Actor, t: Translate): string =>
  by.kind === 'person' ? by.name || by.email : by.kind === 'agent' ? t('actor.agent') : t('actor.outside')

/** "2 hours ago", from unix seconds, in the caller's words. */
export const agoText = (at: number | null, t: Translate): string =>
  agoOf(at === null ? null : new Date(at * 1000).toISOString(), Date.now(), agoUnitsOf(t))

/**
 * The one-line notice a tab shows instead of its list: empty, failed, signed out. Loading is not
 * one of them: it is the tab's shared bar (`TabLoadingBar` in `@tracy/ui`), never a sentence.
 */
export function Note({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="px-3 py-4 text-muted-foreground text-sm">
      <p className="m-0">{children}</p>
    </div>
  )
}
