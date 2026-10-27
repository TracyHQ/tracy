/**
 * `@tracy/dsh-sidebar` — Tracy's left column on the dsh Web client.
 *
 * Takes the single `sidebar` slot (owned by ui-layout) the way `@tracy/dsh-settings` took
 * `sidebar.settings`: dsh's own occupant, `@deepseek-ai/dsh-client-ui-sidebar`, is DISABLED in
 * the bundle, and this registration re-declares the five child slots it declared, plus one of
 * Tracy's own (`sidebar.nav`, the rows below New session). Shadowing by
 * priority alone is not an option — a child slot may be declared by exactly one live entry, and
 * a second declaration throws at registration (ui-slots `register`).
 *
 * The two actions dsh wired into its column are wired the same way here: New session rides
 * ui-workspace's shared `startSession` (current Session Workspace, then recent), and the toggle
 * is ui-layout's `toggleSidebar`.
 *
 * The Discord community link (community.tsx) rides two slots: the Community row of the account
 * menu (`settings.menu.item`, declared by tracy-settings), and a floating "Need help?" pill in dsh's
 * `conversation.input.dock` above the composer.
 */
import type { MenuItemProps } from '@tracy/core/site-tabs'
import { CommunityMenuRow, HelpButton } from './community'
import { Rail } from './rail'
import { en, NS, type SidebarKey } from './strings'
import { CSS, TAILWIND } from './styles'

interface SlotsService {
  register(spec: Record<string, unknown>, component: unknown): () => void
  inject(name: string, fn: () => () => void): void
}

interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  get(name: string): unknown
  slots: SlotsService
  layout: { toggleSidebar(): void }
  locale: { register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown }
}

interface WorkspaceNavigation {
  startSession(workspaceId?: unknown): void
}

export const inject = ['slots', 'layout', 'uiWorkspace', 'locale']

export function apply(ctx: ClientContext): void {
  const workspaceNavigation = ctx.get('uiWorkspace') as WorkspaceNavigation

  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-sidebar: dictionaries')

  ctx.effect(() => {
    const id = 'tracy-sidebar-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = `${TAILWIND}\n${CSS}`
    document.head.appendChild(style)
    return () => style.remove()
  }, 'tracy-sidebar: styles')

  ctx.effect(
    () =>
      ctx.slots.register(
        {
          name: 'sidebar',
          locale: NS,
          children: {
            'sidebar.brand.mark': { kind: 'single', scope: 'root' },
            'sidebar.brand.name': { kind: 'single', scope: 'root' },
            'sidebar.workspaces': { kind: 'single', scope: 'root' },
            'sidebar.settings': { kind: 'single', scope: 'root' },
            'sidebar.footer.action': { kind: 'list', scope: 'root' },
            // Tracy's own: rows below New session, `{ wide }` (rail.tsx). Not one of dsh's five.
            'sidebar.nav': { kind: 'list', scope: 'root' }
          },
          inject: () => ({
            startSession: () => {
              workspaceNavigation.startSession()
            },
            toggleSidebar: () => {
              ctx.layout.toggleSidebar()
            }
          })
        },
        Rail
      ),
    'tracy-sidebar: slot registration'
  )

  // The Community row of the account menu, last (order 50: AI accounts 20, Settings 30, Appearance
  // 40). tracy-settings declares the slot; `slots.inject` waits for it whatever order plugins load in.
  ctx.slots.inject('settings.menu.item', () =>
    ctx.slots.register(
      { name: 'settings.menu.item', id: 'community', order: 50, locale: NS },
      (props: MenuItemProps & { t: (key: SidebarKey) => string }) => <CommunityMenuRow {...props} />
    )
  )
  // The floating "Need help?" pill. dsh's ui-conversation declares the dock; Tracy's start cards
  // (order 10) and held-message notice (20) come first, so the pill's anchor sits at its foot.
  ctx.slots.inject('conversation.input.dock', () =>
    ctx.slots.register(
      { name: 'conversation.input.dock', id: 'tracy-help', order: 90, locale: NS },
      ({ t }: { t: (key: SidebarKey) => string }) => <HelpButton t={t} />
    )
  )
}
