/**
 * The build chat's cards at the tail of a turn (#609), each fed by what the session's own `tracy_build` calls
 * answered (`definitions.ts`) and by the account's build draft (`sources.ts`):
 *
 * - the template card in the turn whose call offered the templates last; a pick goes through `saveTemplateChoice`,
 *   and once it is saved the card says so in the chat as the owner ("I picked JA Boxing."), once, so the agent asks
 *   for the plan without the owner having to type. A failed save sends nothing; a send the chat refused offers
 *   Continue to send it again;
 * - the plan card in the turn whose call answered the latest plan revision. The tool answers ids only, so the card
 *   reads the plan itself from the draft, and reads it again when a newer revision arrives. Its edits go through
 *   `savePlanEdit` / `undoPlanEdit`, and the card follows the draft the door answers with. While the plan review bar
 *   shows, the bar draws this card instead (`LivePlan`, `review-presence.ts`): dsh draws a tail only once its turn
 *   ends, and the turn that asks the review waits for the answer;
 * - the stop card at the end of the conversation while the draft's step stands stopped (or a start was refused for
 *   its limit) and no build run exists, with Try again and Start over for the CURRENT state (`StopTail`, #575);
 * - the task list and the stop notice in the session's last turn, once a build run exists (`BuildRunFeed`);
 * - in a site chat, the earlier conversation carried from the build chat, with the plan and its update card only
 *   while the viewer's own build is the build of that site (`CarriedPlan`).
 *
 * Every tail draws nothing outside a build chat session. The switch `chat-build` decides whether they are
 * registered at all (`index.tsx`).
 */
import { isBuildChatSession, RETRY_MESSAGE } from '@tracy/core/build-chat'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { BuildProgress } from './BuildProgress'
import { BuildNotStarted, BuildStopped } from './BuildStopped'
import {
  HANDOFF_KEY,
  type HandoffValue,
  HISTORY_KEY,
  type HistoryValue,
  PLAN_KEY,
  type PlanValue,
  RETRY_KEY,
  type RetryValue,
  TEMPLATES_KEY,
  type TemplatesValue,
  type TurnTailOwnerLike,
  turnValueOf
} from './definitions'
import { EarlierConversation, MoveToSite } from './handoff'
import { PlanCard } from './PlanCard'
import { savePlanEdit, undoPlanEdit } from './save-plan-edit'
import { saveTemplateChoice } from './save-template'
import { createSiteBuildSource, type SiteBuildSource } from './site-build-source'
import { SiteUpdate } from './SiteUpdate'
import type { ReviewPresence } from './review-presence'
import { hasNote, type RevisionNotes } from './revision-notes'
import type { BuildRunFeed, DraftSource } from './sources'
import type { Translate } from './strings'
import { TemplateCard } from './TemplateCard'
import { StopTail } from './stop-tail'

export interface TailDeps {
  drafts: DraftSource
  /** The sessions whose plan review bar shows; the plan tail stands aside for it. */
  reviews: ReviewPresence
  /** The notes change requests leave for the plan card (#609). */
  notes?: RevisionNotes
  runs: BuildRunFeed
  /** The build of the viewer's site as the site chat reads it (#612); made once when absent. */
  sites?: SiteBuildSource
  /**
   * The translator of a build session's cards (`chat-language.ts`): in `language` when the card's value names it,
   * else in the session's last known language, else in the interface language.
   */
  t: (sessionId?: string | null, language?: unknown) => Translate
  fetch?: typeof fetch
  /** Sends one message to the chat as the owner (dsh's session verb, the draft untouched). */
  send?: (sessionId: string, text: string) => Promise<'sent' | 'no-chat' | 'failed'>
  /** Moves the screen to another address of this origin (#611): the page's own navigation; a test passes its own. */
  navigate?: (href: string) => void
}

export type TailProps = TurnTailOwnerLike & {
  sessionId?: string
  /** dsh's selector hook over the chat snapshot; absent in a host that does not give it. */
  useChat?: <T>(select: (snapshot: { timeline: { turnOrder: readonly number[] } }) => T) => T
}

/**
 * A fresh plan edit id. `crypto.randomUUID` exists only in a secure context, and a local stand served over plain
 * http on a named host is not one; `getRandomValues` is there in every context.
 */
export const newEditId = () =>
  `edit-${Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('')}`

const noSubscribe = () => () => {}

const useDraft = (drafts: DraftSource) => useSyncExternalStore(drafts.subscribe, drafts.read, drafts.read)

function TemplateTail({
  deps,
  value,
  sessionId
}: {
  deps: TailDeps
  value: TemplatesValue
  sessionId: string
}) {
  const draft = useDraft(deps.drafts)
  useEffect(() => void deps.drafts.load(), [deps.drafts])
  /** The message to send again when the chat did not take it; null once it went out. */
  const [unsent, setUnsent] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  // The card takes its chosen design once; drawn again (keyed) when the draft answers with one.
  const chosen = draft?.template?.slug ?? null
  const t = deps.t(sessionId, value.language)
  /** Says the pick in the chat. Only a press reaches here, so a reload or a new render never sends it again. */
  const tell = async (text: string) => {
    setSending(true)
    const sent = (await deps.send?.(sessionId, text).catch(() => 'failed' as const)) ?? 'no-chat'
    setSending(false)
    setUnsent(sent === 'sent' ? null : text)
  }
  return (
    <TemplateCard
      key={chosen ?? 'open'}
      templates={value.options}
      chosen={chosen}
      t={t}
      onChoose={async (template) => {
        const saved = await saveTemplateChoice(template, deps.fetch)
        if (saved && typeof saved === 'object') deps.drafts.put(saved as never)
        void tell(t('template.picked', { name: template.name }))
        return saved
      }}
      next={
        unsent === null ? null : (
          <>
            <span className="tv-bc-grow tv-bc-error" role="status">
              {t('template.sendFailed')}
            </span>
            <button
              type="button"
              className="tv-bc-btn"
              data-primary=""
              disabled={sending}
              onClick={() => void tell(unsent)}
            >
              {t('template.continue')}
            </button>
          </>
        )
      }
    />
  )
}

/**
 * The one living plan card, read from the draft. `revision` names the plan revision the chat answered last: a newer
 * one makes the card read the draft again. Its edits answer the draft. Drawn by the plan tail and by the review bar.
 */
export function LivePlan({
  deps,
  revision,
  sessionId,
  language
}: {
  deps: TailDeps
  revision?: string
  sessionId?: string
  language?: string
}) {
  const draft = useDraft(deps.drafts)
  useEffect(() => void deps.drafts.load(), [deps.drafts, revision])
  // The note belongs to the plan revision it was made for: any later change of the plan takes it away.
  const noteKey = draft?.plan ? `${draft.plan.id}:${draft.plan.revision}` : ''
  const note = useSyncExternalStore(
    deps.notes?.subscribe ?? noSubscribe,
    () => deps.notes?.read(noteKey) ?? null,
    () => null
  )
  if (!draft?.plan) return null
  const follow = async (request: Promise<Awaited<ReturnType<typeof savePlanEdit>>>) => {
    const next = await request
    deps.drafts.put(next)
    return next
  }
  return (
    <PlanCard
      plan={draft.plan}
      lastEdit={draft.lastEdit ?? null}
      canUndo={draft.canUndo === true}
      lookSources={draft.lookSources ?? null}
      t={deps.t(sessionId, language)}
      onEdit={(edit) => follow(savePlanEdit(edit, deps.fetch))}
      onUndo={() => follow(undoPlanEdit(deps.fetch))}
      newEditId={newEditId}
      revised={hasNote(note) ? note : null}
      onDismissRevised={() => deps.notes?.dismiss(noteKey)}
      onStale={() => void deps.drafts.load()}
    />
  )
}

/** The slice of dsh's turn location data a tail reads live (ui-conversation `ConversationLocationDataStore`). */
export interface TurnDataLike {
  get?: (key: string) => unknown
  source?: (key: string) => { getSnapshot(): unknown; subscribe(listener: () => void): () => void }
}
const NO_SOURCE = { getSnapshot: () => undefined, subscribe: noSubscribe }

/**
 * The plan tail of one turn. dsh draws a finished turn's tail once and keeps it (its turn tail view is memoised on the
 * turn's node), so a tail that only read the turn's value when it was drawn would keep a full plan card in every
 * earlier turn after each change request. This tail follows the turn's own `tracy_build:plan` source instead: once a
 * newer turn carries the plan, this turn's value is gone and the tail draws nothing. The tool's own quiet row
 * ("Prepared your site plan") stays in that turn, so the history still says a plan was made there.
 */
function PlanTail({
  deps,
  value,
  sessionId,
  data
}: {
  deps: TailDeps
  value: PlanValue
  sessionId: string
  data?: TurnDataLike
}) {
  const read = () => deps.reviews.has(sessionId)
  const reviewing = useSyncExternalStore(deps.reviews.subscribe, read, read)
  const source = data?.source?.(PLAN_KEY) ?? NO_SOURCE
  const readLive = () => (data?.source ? source.getSnapshot() : value)
  const live = useSyncExternalStore(source.subscribe, readLive, readLive) as PlanValue | undefined
  // The review bar shows the card while the owner reviews it: one living plan card, never two.
  if (reviewing || !live) return null
  return (
    <LivePlan
      deps={deps}
      revision={`${live.id}:${live.revision}`}
      sessionId={sessionId}
      language={live.language}
    />
  )
}

const noChat: NonNullable<TailProps['useChat']> = (select) => select({ timeline: { turnOrder: [] } })

const goTo = (href: string) => window.location.assign(href)

function RunTail({
  deps,
  sessionId,
  turn,
  useChat,
  history
}: {
  deps: TailDeps
  sessionId: string
  turn: number
  useChat: NonNullable<TailProps['useChat']>
  history: HistoryValue | null
}) {
  const read = () => deps.runs.read(sessionId)
  const run = useSyncExternalStore(deps.runs.subscribe, read, read)
  const last = useChat((snapshot) => snapshot.timeline.turnOrder.at(-1))
  if (run === null || last !== turn) return null
  const t = deps.t(sessionId)
  // Refused before any step ran: the sentence alone, never a task list with a failed step.
  if (typeof run.notStarted === 'string') return <BuildNotStarted code={run.notStarted} t={t} />
  return (
    <>
      {run.outcome && <BuildStopped outcome={run.outcome} t={t} />}
      <BuildProgress run={run} t={t} />
      {/* Done: the chat moves to the new site by itself (#611). A stopped or cancelled build stays here. */}
      {run.outcome?.result === 'done' && (
        <MoveToSite
          sessionId={sessionId}
          messages={history?.messages ?? []}
          fetch={deps.fetch}
          navigate={deps.navigate ?? goTo}
          t={t}
        />
      )}
    </>
  )
}

/**
 * The plan carried into a site chat, with its update card. Both read the signed in viewer's own build draft, so they
 * show only while that draft's build is the build of the site this chat belongs to (`siteKey`, named by the hand
 * off block): a teammate who built a site of their own never sees, edits or updates that plan from this site's chat.
 */
function CarriedPlan({ deps, sites, siteKey }: { deps: TailDeps; sites: SiteBuildSource; siteKey: unknown }) {
  const state = useSyncExternalStore(sites.subscribe, sites.read, sites.read)
  if (typeof siteKey !== 'string' || siteKey === '' || state?.build?.siteKey !== siteKey) return null
  return (
    <>
      <LivePlan deps={deps} />
      <SiteUpdate deps={deps} source={sites} />
    </>
  )
}

/** The turn tail entries, made once with what they read. Each returns null when its turn has nothing of its own. */
export function makeTails(deps: TailDeps) {
  const inBuild = (props: TailProps) => isBuildChatSession(props.sessionId)
  let sites = deps.sites ?? null
  const sitesOf = () => (sites ??= createSiteBuildSource(deps.fetch))
  return {
    templates: (props: TailProps) => {
      const value = inBuild(props) ? turnValueOf<TemplatesValue>(props, TEMPLATES_KEY) : null
      return value === null ? null : (
        <TemplateTail deps={deps} value={value} sessionId={props.sessionId as string} />
      )
    },
    plan: (props: TailProps) => {
      const value = inBuild(props) ? turnValueOf<PlanValue>(props, PLAN_KEY) : null
      return value === null ? null : (
        <PlanTail
          deps={deps}
          value={value}
          sessionId={props.sessionId as string}
          data={props.turn?.data as TurnDataLike | undefined}
        />
      )
    },
    retry: (props: TailProps) => {
      const value = inBuild(props) ? turnValueOf<RetryValue>(props, RETRY_KEY) : null
      return value === null ? null : (
        <StopTail
          deps={deps}
          value={value}
          sessionId={props.sessionId as string}
          turn={props.turn?.turn}
          data={props.turn?.data as TurnDataLike | undefined}
          useChat={props.useChat ?? noChat}
          retryMessage={RETRY_MESSAGE}
          navigate={deps.navigate ?? goTo}
        />
      )
    },
    run: (props: TailProps) =>
      inBuild(props) ? (
        <RunTail
          deps={deps}
          sessionId={props.sessionId as string}
          turn={props.turn?.turn}
          useChat={props.useChat ?? noChat}
          history={turnValueOf<HistoryValue>(props, HISTORY_KEY)}
        />
      ) : null,
    /** The site chat's first turn, carried from the build chat (#611): the earlier conversation and the plan. */
    handoff: (props: TailProps) => {
      const value = inBuild(props) ? null : turnValueOf<HandoffValue>(props, HANDOFF_KEY)
      return !Array.isArray(value?.conversation) ? null : (
        <EarlierConversation
          messages={value.conversation}
          plan={<CarriedPlan deps={deps} sites={sitesOf()} siteKey={value.site?.siteKey} />}
          t={deps.t()}
        />
      )
    }
  }
}
