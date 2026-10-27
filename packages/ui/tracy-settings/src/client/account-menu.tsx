/**
 * The account menu at the foot of the left column (Lee, 09/10/2026): the signed-in person's face
 * replaces the gear, and opens a menu before Settings. Same on the web and in the desktop app (one
 * `tracy-native` bundle).
 *
 * The menu is a header and a list slot. The header (face, name, email) IS the Account row: it opens
 * Settings › Account. Every other row is a registration in `settings.menu.item` — this plugin's own
 * Settings and Appearance rows as much as AI accounts (`tracy-model-plan`) and Community
 * (`tracy-sidebar`) — so their order is the slot's `order`, not the order plugins load in.
 *
 * 🔒 THE SLOT CONTRACT, which other plugins build against, lives in `@tracy/core/site-tabs`
 * (`menu-item.ts`): `MenuItemProps` and the face's `ACCOUNT_TRIGGER_ATTR`. Orders in use: AI accounts 20, Settings 30, Appearance 40, Community 50.
 */
import type { JSX, ReactNode } from 'react'
import { useRef, useSyncExternalStore } from 'react'
import { Monitor, Moon, Settings as GearGlyph, Sun, SunMoon } from 'lucide-react'
import { Button } from '@tracy/ui'
import {
  ACCOUNT_TRIGGER_ATTR,
  type MenuItemProps,
  Popover,
  PopoverItem,
  PopoverSeparator,
  PopoverSubmenu
} from '@tracy/core/site-tabs'
import type { Viewer } from '@tracy/core/seat/viewer'
import { uiSwitches } from '@tracy/core/ui-switches'
import { Face, NEUTRAL_FACE_COLOUR, type PersonFace } from '@tracy/core/team/face'

/** The list slot every menu row registers into. */
export const MENU_ITEM_SLOT = 'settings.menu.item'

export type { MenuItemProps }

/** Who is signed in, as `@tracy/core/seat/viewer` answers it. */
export type MenuViewer = Viewer

type Translate = (key: string, params?: Record<string, string>) => string

/**
 * A face while nobody is known yet (loading, a failed read): a plain grey disc, never a letter that
 * could be someone else's.
 */
const NOBODY: PersonFace = { initial: '', color: NEUTRAL_FACE_COLOUR, avatarUrl: null }

/** The scope the portalled panel carries, so the plugin's button reset still reaches its rows. */
const MENU_SCOPE = 'ts-menu'

/**
 * The trigger and the menu.
 * @param accountShown - the Account section is on (`tracy-account` switch): the header opens it.
 *   Off, the header still says who is signed in but is not a row.
 * @param renderItems - the `settings.menu.item` rows, given the props they receive.
 * @param onOpenSettings - open Settings on a section; `opener` is the face, for focus to return to.
 */
export function AccountMenu({
  viewer,
  wide,
  t,
  accountShown,
  renderItems,
  onOpenSettings
}: {
  viewer: MenuViewer
  wide: boolean
  t: Translate
  accountShown: boolean
  renderItems: (props: MenuItemProps) => ReactNode
  onOpenSettings: (sectionId: string, opener: HTMLElement | null) => void
}): JSX.Element {
  const known = viewer.state === 'signedIn'
  const face = known && viewer.face !== null ? viewer.face : NOBODY
  const who = known ? (viewer.name ?? viewer.email ?? '') : ''
  const label = who === '' ? t('menu.trigger') : t('menu.triggerFor', { who })
  // The face is what opened the menu; Settings hands focus back to it when it closes. Captured on
  // the two ways a menu button opens (a click, an arrow key), not with a ref ON the Button: the
  // library Button drops refs under dsh's React 18.
  const trigger = useRef<HTMLElement | null>(null)

  return (
    <Popover
      scopeClass={MENU_SCOPE}
      className="w-72 p-1.5"
      anchorClassName="ts-account"
      trigger={(props) => (
        <Button
          type="button"
          variant="ghost"
          className={`ts-account-trigger w-full gap-2.5 ${wide ? 'justify-start' : 'justify-center'}`}
          {...{ [ACCOUNT_TRIGGER_ATTR]: '' }}
          aria-haspopup={props['aria-haspopup']}
          aria-expanded={props['aria-expanded']}
          aria-controls={props['aria-controls']}
          aria-label={label}
          title={wide ? undefined : label}
          onClick={(event) => {
            trigger.current = event.currentTarget
            props.onClick()
          }}
          onKeyDown={(event) => {
            trigger.current = event.currentTarget
            props.onKeyDown(event)
          }}
        >
          <Face face={face} size={wide ? 28 : 26} />
          {wide && who !== '' ? <span className="ts-account-name">{who}</span> : null}
        </Button>
      )}
    >
      {(menu) => {
        const openSettings = (sectionId: string): void => {
          menu.close()
          onOpenSettings(sectionId, trigger.current ?? findTrigger())
        }
        return (
          <>
            {known ? (
              <>
                <AccountHeader
                  viewer={viewer}
                  face={face}
                  clickable={accountShown}
                  onOpen={() => openSettings('tracy-account')}
                />
                <PopoverSeparator />
              </>
            ) : null}
            {renderItems({ openSettings, close: menu.close })}
          </>
        )
      }}
    </Popover>
  )
}

/** The face in the rail, found again when the menu opened some way that did not pass through it. */
function findTrigger(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${ACCOUNT_TRIGGER_ATTR}]`)
}

/** Face 40px, the name (when the account has one) over the email; a row into Settings › Account. */
function AccountHeader({
  viewer,
  face,
  clickable,
  onOpen
}: {
  viewer: MenuViewer
  face: PersonFace
  clickable: boolean
  onOpen: () => void
}): JSX.Element {
  const body = (
    <>
      <Face face={face} size={40} />
      <span className="flex min-w-0 flex-1 flex-col">
        {viewer.name ? <span className="truncate font-semibold text-sm">{viewer.name}</span> : null}
        {viewer.email ? (
          <span
            className={
              viewer.name ? 'truncate text-muted-foreground text-xs' : 'truncate font-semibold text-sm'
            }
          >
            {viewer.email}
          </span>
        ) : null}
      </span>
    </>
  )
  if (!clickable) return <div className="flex items-center gap-3 px-2 py-2">{body}</div>
  return (
    <PopoverItem itemId="account" onClick={onOpen} end={<Chevron />}>
      <span className="flex min-w-0 flex-1 items-center gap-3 py-1">{body}</span>
    </PopoverItem>
  )
}

function Chevron(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-muted-foreground"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

/** The registry's keys for a command, live: a person who rebinds it sees the new keys here. */
export interface ShortcutKeys {
  getSnapshot(): readonly string[]
  subscribe(listener: () => void): () => void
}

/** The Settings row (order 30): opens Settings on General, with the shortcut that does the same. */
export function SettingsRow({
  t,
  openSettings,
  shortcut
}: MenuItemProps & { t: Translate; shortcut: ShortcutKeys }): JSX.Element {
  const keys = useSyncExternalStore(shortcut.subscribe, shortcut.getSnapshot)
  return (
    <PopoverItem
      itemId="settings"
      icon={<GearGlyph className="size-4" />}
      onClick={() => openSettings('general')}
      end={
        keys.length > 0 ? (
          <kbd className="ts-kbd" aria-hidden="true">
            {keys.join(' ')}
          </kbd>
        ) : undefined
      }
    >
      <span className="flex-1 truncate">{t('menu.settings')}</span>
    </PopoverItem>
  )
}

/** What the Appearance row reads and writes: dsh's theme service, by preference. */
export interface ThemeFace {
  getPreference(): string
  subscribe(listener: () => void): () => void
  setPreference(id: 'light' | 'dark' | 'system'): void
}

const THEMES = [
  { id: 'light', label: 'menu.theme.light', Icon: Sun },
  { id: 'dark', label: 'menu.theme.dark', Icon: Moon },
  { id: 'system', label: 'menu.theme.system', Icon: Monitor }
] as const

/**
 * The Appearance row (order 40): Light, Dark, System beside the menu. The check follows the
 * PREFERENCE, not the theme in effect, so System stays checked on a dark OS. Gone while the
 * operator's `appearance` switch is off.
 */
export function AppearanceRow({
  t,
  theme
}: MenuItemProps & { t: Translate; theme: ThemeFace }): JSX.Element | null {
  const preference = useSyncExternalStore(theme.subscribe, theme.getPreference)
  // The operator's `appearance` switch (`/ops` › User Interface) hides the theme choice in
  // Settings › General; the same choice here follows it (CLAUDE.md §8).
  const ui = uiSwitches()
  const shown = useSyncExternalStore(ui.subscribe, () => ui.isShown('appearance'))
  if (!shown) return null
  return (
    <PopoverSubmenu itemId="appearance" icon={<SunMoon className="size-4" />} label={t('menu.appearance')}>
      {THEMES.map(({ id, label, Icon }) => (
        <PopoverItem
          key={id}
          itemId={`theme-${id}`}
          selected={preference === id}
          icon={<Icon className="size-4" />}
          onClick={() => theme.setPreference(id)}
        >
          {t(label)}
        </PopoverItem>
      ))}
    </PopoverSubmenu>
  )
}
