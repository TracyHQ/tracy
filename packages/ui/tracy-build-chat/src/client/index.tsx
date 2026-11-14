/**
 * `@tracy/dsh-build-chat` — the build chat's own cards (TracyHQ/tracy#575, Part 2): the template choice (#605), the
 * plan card (#606), the build task list with its timer and the notice of a build that could not finish (#608), drawn
 * in the REAL conversation of a build session from the session's own `tracy_build` calls (#609):
 *
 * - `conversation.chat.turnTail`: the template card, the one living plan card and the build run (`tails.tsx`);
 * - `conversation.composer` (chain, ahead of dsh's): the plan review bar (`ReviewBar.tsx`), with the living plan card
 *   above it while the review waits (a turn tail shows only once its turn ends);
 * - `tool.call.toolview` keyed `tracy_build`: a quiet row in place of the call's JSON (`BuildToolRow.tsx`);
 * - `conversation.input.dock`: the same row above the chat input while a call waits (`WorkingDock.tsx`), since dsh
 *   folds the call's own row into the turn's collapsed process;
 * - five conversation node definitions that fold the calls into per turn values (`definitions.ts`);
 * - once the build is done, the move to the new site's chat with the whole conversation, and in that chat the earlier
 *   conversation and the plan, its first message folded into a chip (#611, `handoff.tsx`).
 *
 * A template pick is said in the chat as the owner through dsh's session verb (`sendToChat`, the draft untouched).
 *
 * Every visible piece is registered only while the UI switch `chat-build` is on, and draws nothing outside a build
 * chat session (`isBuildChatSession`). The definitions are state only and draw nothing themselves.
 */
import { BUILD_TOOL, HANDOFF_FENCE, isBuildChatSession } from '@tracy/core/build-chat'
import { uiSwitches } from '@tracy/core/ui-switches'
import { BuildToolRow, type ToolViewProps } from './BuildToolRow'
import {
  sendToChat,
  type ConversationFace,
  type SessionFace
} from '../../../../site/tracy-site-tabs/src/client/chat-send'
import {
  handoffDefinition,
  historyDefinition,
  planDefinition,
  templatesDefinition,
  workingDefinition
} from './definitions'
import { createReviewPresence } from './review-presence'
import { ReviewBar, type PendingReview, selectPlanReview } from './ReviewBar'
import { createBuildRunFeed, createDraftSource, type BuildRunFeed } from './sources'
import { CSS } from './styles'
import { en, english, NS, type Translate } from './strings'
import { LivePlan, makeTails, type TailDeps } from './tails'
import { WorkingDock, type WorkingDockProps } from './WorkingDock'

export { BuildProgress } from './BuildProgress'
export { BuildStopped } from './BuildStopped'
export { PlanCard } from './PlanCard'
export {
  BUILD_DRAFT_PLAN_EDITS_PATH,
  BUILD_DRAFT_PLAN_UNDO_PATH,
  savePlanEdit,
  undoPlanEdit
} from './save-plan-edit'
export { saveTemplateChoice } from './save-template'
export { english, NS as BUILD_CHAT_NS } from './strings'
export { ADD_SITE_HREF, TemplateCard } from './TemplateCard'

/** The UI switch that governs the whole build chat (`@tracy/core/ui-switches` catalogue). */
export const BUILD_CHAT_SWITCH = 'chat-build'

interface Slots {
  inject: (name: string, register: () => () => void) => void
  register: (options: Record<string, unknown>, component: unknown) => () => void
}
interface ClientContext {
  effect(fn: () => (() => void) | void, label?: string): void
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
    bind?: (namespace: string) => Translate
  }
  slots: Slots
  uiConversation: {
    events: { register: (definition: unknown) => (() => void) | void }
    /** dsh's fenced block folds for sent user text: the hand off block reads as one chip (#611). */
    userTextFolds?: {
      register: (fold: { fence: string; fold: (block: string) => { label: string } | null }) => () => void
    }
  }
  /** dsh's conversation service: its session verb sends a message as the owner. */
  conversation?: ConversationFace
  /** dsh's sessions service: the session face of an id. */
  sessions?: { binding(sessionId: string): { session?: SessionFace } | undefined }
}

/** What `apply` reads besides the context; a test passes its own. */
export interface ApplyDeps {
  switches: { isShown(id: string): boolean; subscribe(listener: () => void): () => void }
  fetch?: typeof fetch
  runs?: BuildRunFeed
}

export const inject = ['locale', 'slots', 'uiConversation', 'conversation', 'sessions']

/** Keep one registration while the switch is on, and none while it is off. */
function whileShown(switches: ApplyDeps['switches'], register: () => () => void): () => void {
  let dispose: (() => void) | null = null
  const follow = () => {
    const on = switches.isShown(BUILD_CHAT_SWITCH)
    if (on && dispose === null) dispose = register()
    if (!on && dispose !== null) {
      dispose()
      dispose = null
    }
  }
  follow()
  const unsubscribe = switches.subscribe(follow)
  return () => {
    unsubscribe()
    dispose?.()
    dispose = null
  }
}

export function applyWith(ctx: ClientContext, deps: ApplyDeps): void {
  ctx.effect(() => {
    const id = 'tracy-build-chat-css'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, 'tracy-build-chat: styles')
  ctx.effect(() => ctx.locale.register(NS, { en }) as (() => void) | void, 'tracy-build-chat: dictionaries')

  const t = (): Translate => ctx.locale.bind?.(NS) ?? english
  const drafts = createDraftSource(deps.fetch)
  const reviews = createReviewPresence()
  const tailDeps: TailDeps = {
    drafts,
    reviews,
    runs: deps.runs ?? createBuildRunFeed(deps.fetch),
    t,
    fetch: deps.fetch,
    send: (sessionId, text) =>
      sendToChat(sessionId, (id) => ctx.sessions?.binding(id)?.session, ctx.conversation, text)
  }
  const tails = makeTails(tailDeps)

  for (const definition of [
    templatesDefinition,
    planDefinition,
    workingDefinition,
    historyDefinition,
    handoffDefinition
  ])
    ctx.effect(
      () => ctx.uiConversation.events.register(definition) ?? undefined,
      `tracy-build-chat: ${definition.kind}`
    )

  // dsh evaluates `select` for chain slots only: a list entry renders on every turn and decides for itself.
  const tail = (id: string, component: unknown) =>
    ctx.slots.inject('conversation.chat.turnTail', () =>
      whileShown(deps.switches, () =>
        ctx.slots.register(
          { name: 'conversation.chat.turnTail', id, inject: (sessionId: string) => ({ sessionId }) },
          component
        )
      )
    )
  tail('tracy-build-chat-templates', tails.templates)
  tail('tracy-build-chat-plan', tails.plan)
  tail('tracy-build-chat-run', tails.run)
  tail('tracy-build-chat-handoff', tails.handoff)

  // The site chat's first message, carried from the build chat (#611): its raw block reads as one chip; the earlier
  // conversation is drawn by the turn tail above. Presentation only: the agent still reads the whole block.
  ctx.effect(() => {
    const folds = ctx.uiConversation.userTextFolds
    if (typeof folds?.register !== 'function') return
    return whileShown(deps.switches, () =>
      folds.register({ fence: HANDOFF_FENCE, fold: () => ({ label: t()('handoff.earlier') }) })
    )
  }, 'tracy-build-chat: the hand off chip')

  ctx.slots.inject('conversation.composer', () =>
    whileShown(deps.switches, () =>
      ctx.slots.register(
        // Ahead of dsh's question composer (0) and the ask form's pointer (-10).
        { name: 'conversation.composer', priority: -20, select: selectPlanReview },
        ({ matched }: { matched: PendingReview }) => (
          <ReviewBar
            matched={matched}
            drafts={drafts}
            t={t()}
            reviews={reviews}
            planCard={<LivePlan deps={tailDeps} />}
          />
        )
      )
    )
  )

  ctx.slots.inject('conversation.input.dock', () =>
    whileShown(deps.switches, () =>
      ctx.slots.register(
        {
          name: 'conversation.input.dock',
          id: 'tracy-build-chat-working',
          inject: (sessionId: string) => ({ sessionId })
        },
        (props: WorkingDockProps) => <WorkingDock {...props} t={t()} />
      )
    )
  )

  ctx.slots.inject('tool.call.toolview', () =>
    whileShown(deps.switches, () =>
      ctx.slots.register(
        { name: 'tool.call.toolview', key: BUILD_TOOL, inject: (sessionId: string) => ({ sessionId }) },
        (view: ToolViewProps & { sessionId?: string }) =>
          isBuildChatSession(view.sessionId) ? <BuildToolRow view={view} t={t()} /> : null
      )
    )
  )
}

export function apply(ctx: ClientContext): void {
  applyWith(ctx, { switches: uiSwitches() })
}
