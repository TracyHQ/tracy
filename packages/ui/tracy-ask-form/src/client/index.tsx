/**
 * `tracy-ask-form` — the agent's questions as one form in the right pane
 * (tasks/todo-hoi-khach-mot-lan.md).
 *
 * When the agent calls `ask_user_question`, dsh publishes the request as the session's pending
 * interaction (`uiSession.sessionStatus`). This plugin:
 * - registers the side-card tab `tracy:ask-user`, which draws the request of its own session with
 *   the shared ask form and answers it through `pending.answer()` (`AskTab.tsx`);
 * - opens that tab once per request on the session the side card shows (`ask-state.ts`);
 * - puts a PointerCard in the chat column in place of dsh's question card, for exactly the requests
 *   whose tab opened — a refused open leaves dsh's card asking.
 *
 * The operator's switch is `tab-questions` (`@tracy/core/ui-switches`): off, the tab type does not
 * exist for customers (`followTabPolicy`), an open one is closed (in dsh's own column too: the
 * policy unregisters the type, so a restored tab has no side-card record), and the composer entry is not
 * registered at all, so dsh's card asks every question as before.
 */
import { sidebarRightOf } from '@tracy/core/tab-link'
import { uiSwitches } from '@tracy/core/ui-switches'
import { MessageCircleQuestion } from 'lucide-react'
import { AskTab } from './AskTab'
import {
  type AskSnapshot,
  createAskController,
  type NativeColumn,
  pointerSelect,
  type SessionStatusSource
} from './ask-state.ts'
import { PointerCard } from './PointerCard'
import { en, NS, type Translate } from './strings'
import { TAILWIND } from './styles'

/** Id of the tab type. Package prefix, as better-sidebar recommends. */
const TAB_ID = 'tracy:ask-user'
/** The operator's switch for the tab and the pointer card (`catalogue.json`). */
const SWITCH_ID = 'tab-questions'
/**
 * Ahead of dsh's question composer (default 0) in the `conversation.composer` chain. dsh's read-only
 * subagent notice sits at -10 too and keeps winning on a subagent session: ties keep registration
 * order, and this entry is registered later, at run time.
 */
const POINTER_PRIORITY = -10

interface LocaleRuntime {
  bind: (ns: string) => Translate
  register: (ns: string, dicts: Record<string, Record<string, string>>) => void
}

interface BetterSidebar {
  registerTab: (descriptor: Record<string, unknown>) => () => void
  openTab: (seed: { type: string }, scope?: { sessionId: string }) => void
  closeTab: (tabId: string) => void
  openTabsOf: (type: string) => readonly { id: string }[]
  isTabEnabled: (id: string) => boolean
  getSnapshot: () => { sessionId: string | undefined }
  subscribeState: (listener: () => void) => () => void
  setTabPolicy?: (policy: { isAllowed(id: string): boolean; isListed(id: string): boolean }) => () => void
}

interface Slots {
  inject(name: string, register: () => unknown): void
  register(spec: Record<string, unknown>, component: unknown): () => void
}

export const inject = ['betterSidebar', 'locale', 'uiSession', 'slots']

export function apply(ctx: {
  get?: (name: string) => unknown
  effect: (fn: () => (() => void) | void, label?: string) => void
  betterSidebar: BetterSidebar
  locale: LocaleRuntime
  uiSession: { sessionStatus: SessionStatusSource }
  slots: Slots
}): void {
  ctx.effect(() => {
    if (document.querySelector('style[data-tracy-ask-form="1"]')) return
    const el = document.createElement('style')
    el.dataset.tracyAskForm = '1'
    el.textContent = TAILWIND
    document.head.appendChild(el)
    return () => el.remove()
  }, 'tracy-ask-form: styles')

  ctx.effect(() => ctx.locale.register(NS, { en }), 'tracy-ask-form: dictionaries')
  const t = ctx.locale.bind(NS)
  const sidebar = ctx.betterSidebar
  const status = ctx.uiSession.sessionStatus
  const switches = uiSwitches()

  // The type does not exist for customers while the operator's switch is off (also installed by
  // `@tracy/dsh-site-tabs`; the policy is one slot on the side card, so a second install is the same
  // policy again, not a second gate).
  ctx.effect(() => switches.followTabPolicy(sidebar), 'tracy-ask-form: tab policy')

  // dsh's right column is probed, not injected (`sidebarRightOf`, as every Tracy tab plugin does):
  // closing a restored Questions tab while the switch is off goes through it (`NativeColumn`).
  const controller = createAskController({
    status,
    sidebar,
    switches,
    tabId: TAB_ID,
    switchId: SWITCH_ID,
    column: () => sidebarRightOf(ctx) as NativeColumn | undefined
  })
  ctx.effect(() => controller.start(), 'tracy-ask-form: follow pending questions')

  // Wrapped in `ctx.effect` so a plugin reload disposes the registration.
  ctx.effect(
    () =>
      sidebar.registerTab({
        id: TAB_ID,
        title: () => t('tab.title'),
        icon: (size: number) => <MessageCircleQuestion size={size} strokeWidth={1.8} aria-hidden="true" />,
        order: 90,
        single: true,
        preferredWidth: 600,
        component: ({ scope }: { scope?: { sessionId?: string } }) => {
          const sessionId = scope?.sessionId ?? sidebar.getSnapshot().sessionId
          if (sessionId === undefined) return null
          return <AskTab sessionId={sessionId} status={status} controller={controller} t={t} />
        }
      }),
    'tracy-ask-form: tab'
  )

  // "Open" on the PointerCard: a single-instance type, so opening it again brings it forward.
  const openTab = (sessionId: string) => sidebar.openTab({ type: TAB_ID }, { sessionId })
  const Pointer = ({
    matched,
    t: seatT
  }: {
    matched: Parameters<typeof PointerCard>[0]['pending']
    t?: Translate
  }) => <PointerCard pending={matched} open={openTab} t={seatT ?? t} />

  // The PointerCard's entry in dsh's composer chain. A chain selector must be a pure function of the
  // owner props, so neither the switch nor the open ledger is read inside it: the entry is registered
  // only while the switch is on and some request's tab opened, with that set frozen into its
  // selector, and registered again whenever the set changes (a registration is what makes the
  // composer outlet elect again).
  ctx.slots.inject('conversation.composer', () => {
    let dispose: (() => void) | null = null
    let shown: AskSnapshot | null = null
    const sync = () => {
      const snapshot = controller.getSnapshot()
      if (snapshot === shown) return
      shown = snapshot
      dispose?.()
      dispose = null
      if (!snapshot.enabled || snapshot.taken.size === 0) return
      dispose = ctx.slots.register(
        {
          name: 'conversation.composer',
          priority: POINTER_PRIORITY,
          locale: NS,
          select: pointerSelect(snapshot.taken)
        },
        Pointer
      )
    }
    sync()
    const stop = controller.subscribe(sync)
    return () => {
      stop()
      dispose?.()
    }
  })
}
