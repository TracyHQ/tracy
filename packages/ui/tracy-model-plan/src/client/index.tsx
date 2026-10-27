/**
 * `@tracy/dsh-model-plan` — Settings › Model plan in the desktop app (tasks/todo-desktop-surface.md
 * part B; Lee, 07/10/2026: keep `@goodandready/dsh-subscriptions` underneath, turn its own card off,
 * draw a simple section of Tracy's), and the chip at the head of each chat saying what it runs on
 * (Lee, 08/10/2026; `ModelChip.tsx`).
 *
 * Loaded only by the desktop app's own dsh: the native bundle inserts this row disabled, the app's
 * patch turns it on together with the plan routes (`packages/desktop/tracy-desktop/src/plan-profile.js`),
 * and the fleet image keeps it off (gate `image-profile`).
 */

import { AccountsPane } from './AccountsPane'
import { aiAccountsRow } from './AiAccountsRow'
import { prefetchAccountStatus } from './account-status'
import { installHeaderJobs } from './header-jobs'
import { ModelChip, type ModelDirectories } from './ModelChip'
import { en, NS } from './strings'
import { STYLES } from './styles'

/** The section id in the `settings.section` ledger. */
export const SECTION_ID = 'tracy-model-plan'
/** The chip's cell id in `conversation.session.header.actions`. */
export const CHIP_ID = 'tracy-model-chip'
/** The AI accounts row's id in the account menu (`settings.menu.item`). */
export const MENU_ITEM_ID = 'tracy-model-plan'

interface Slots {
  inject(name: string, fn: () => (() => void) | void): void
  register(options: Record<string, unknown>, component: unknown): () => void
}

interface LocaleRuntime {
  register(ns: string, dictionaries: Record<string, Record<string, string>>): (() => void) | void
  bind(ns: string): (key: string, params?: Record<string, unknown>) => string
}

export const inject = ['slots', 'locale']

export function apply(ctx: {
  inject: (
    services: string[],
    callback: (scope: { slots: Slots; modelDirectories: ModelDirectories }) => void
  ) => void
  effect: (fn: () => (() => void) | void, label?: string) => void
  slots: Slots
  locale: LocaleRuntime
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-model-plan="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyModelPlan = '1'
    el.textContent = STYLES
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-model-plan: styles')

  ctx.effect(installHeaderJobs, 'tracy-model-plan: compact header jobs')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-model-plan: dictionaries')

  // The account menu's row shows the person's AI accounts the first time the menu opens: the read
  // starts now, not when the row mounts.
  prefetchAccountStatus()

  // Right below Account (`tracy-account`, group `user`, order 20) and above Notifications (22).
  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: SECTION_ID,
        group: 'user',
        order: 21,
        label: () => ctx.locale.bind(NS)('nav'),
        locale: NS
      },
      AccountsPane
    )
  )

  // The account menu's AI accounts row, right under its header (Account) and above Settings (30).
  // The list slot is declared by `@tracy/dsh-settings`; until it is, this registration waits.
  ctx.slots.inject('settings.menu.item', () =>
    ctx.slots.register(
      { name: 'settings.menu.item', id: MENU_ITEM_ID, order: 20, locale: NS },
      aiAccountsRow(SECTION_ID)
    )
  )

  // What each chat runs on, at its head, before dsh's own header actions (agent-team is -20).
  ctx.slots.inject('conversation.session.header.actions', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.actions', id: CHIP_ID, order: -100, locale: NS },
      ModelChip
    )
  )

  // The shared picker service is optional on desktop profiles. Shadow the fallback only when it exists.
  ctx.inject(['slots', 'sessions', 'remote', 'remote.session', 'modelDirectories'], (scope) => {
    scope.slots.inject('conversation.session.header.actions', () =>
      scope.slots.register(
        { name: 'conversation.session.header.actions', id: CHIP_ID, priority: -10, order: -100, locale: NS },
        (props: Parameters<typeof ModelChip>[0]) => (
          <ModelChip {...props} modelDirectories={scope.modelDirectories} />
        )
      )
    )
  })
}
