/**
 * The build chat's cards at the tail of a turn (#609), each fed by what the session's own `tracy_build` calls
 * answered (`definitions.ts`) and by the account's build draft (`sources.ts`):
 *
 * - the template card in the turn whose call offered the templates last; a pick goes through `saveTemplateChoice`;
 * - the plan card in the turn whose call answered the latest plan revision. The tool answers ids only, so the card
 *   reads the plan itself from the draft, and reads it again when a newer revision arrives. Its edits go through
 *   `savePlanEdit` / `undoPlanEdit`, and the card follows the draft the door answers with;
 * - the task list and the stop notice in the session's last turn, once a build run exists (`BuildRunFeed`).
 *
 * Every tail draws nothing outside a build chat session. The switch `chat-build` decides whether they are
 * registered at all (`index.tsx`).
 */
import { isBuildChatSession } from '@tracy/core/build-chat'
import { useEffect, useSyncExternalStore } from 'react'
import { BuildProgress } from './BuildProgress'
import { BuildStopped } from './BuildStopped'
import {
  PLAN_KEY,
  type PlanValue,
  TEMPLATES_KEY,
  type TemplatesValue,
  type TurnTailOwnerLike,
  turnValueOf
} from './definitions'
import { PlanCard } from './PlanCard'
import { savePlanEdit, undoPlanEdit } from './save-plan-edit'
import { saveTemplateChoice } from './save-template'
import type { BuildRunFeed, DraftSource } from './sources'
import type { Translate } from './strings'
import { TemplateCard } from './TemplateCard'

export interface TailDeps {
  drafts: DraftSource
  runs: BuildRunFeed
  t: () => Translate
  fetch?: typeof fetch
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

const useDraft = (drafts: DraftSource) => useSyncExternalStore(drafts.subscribe, drafts.read, drafts.read)

function TemplateTail({ deps, value }: { deps: TailDeps; value: TemplatesValue }) {
  const draft = useDraft(deps.drafts)
  useEffect(() => void deps.drafts.load(), [deps.drafts])
  // The card takes its chosen design once; drawn again (keyed) when the draft answers with one.
  const chosen = draft?.template?.slug ?? null
  return (
    <TemplateCard
      key={chosen ?? 'open'}
      templates={value.options}
      chosen={chosen}
      t={deps.t()}
      onChoose={async (template) => {
        const saved = await saveTemplateChoice(template, deps.fetch)
        if (saved && typeof saved === 'object') deps.drafts.put(saved as never)
        return saved
      }}
    />
  )
}

function PlanTail({ deps, value }: { deps: TailDeps; value: PlanValue }) {
  const draft = useDraft(deps.drafts)
  // A newer revision from the chat (a compose or an edit) is read again; the card's own edits answer the draft.
  useEffect(() => void deps.drafts.load(), [deps.drafts, value.id, value.revision])
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
      t={deps.t()}
      onEdit={(edit) => follow(savePlanEdit(edit, deps.fetch))}
      onUndo={() => follow(undoPlanEdit(deps.fetch))}
      newEditId={newEditId}
    />
  )
}

const noChat: NonNullable<TailProps['useChat']> = (select) => select({ timeline: { turnOrder: [] } })

function RunTail({
  deps,
  sessionId,
  turn,
  useChat
}: {
  deps: TailDeps
  sessionId: string
  turn: number
  useChat: NonNullable<TailProps['useChat']>
}) {
  const read = () => deps.runs.read(sessionId)
  const run = useSyncExternalStore(deps.runs.subscribe, read, read)
  const last = useChat((snapshot) => snapshot.timeline.turnOrder.at(-1))
  if (run === null || last !== turn) return null
  const t = deps.t()
  return (
    <>
      {run.outcome && <BuildStopped outcome={run.outcome} t={t} />}
      <BuildProgress run={run} t={t} />
    </>
  )
}

/** The turn tail entries, made once with what they read. Each returns null when its turn has nothing of its own. */
export function makeTails(deps: TailDeps) {
  const inBuild = (props: TailProps) => isBuildChatSession(props.sessionId)
  return {
    templates: (props: TailProps) => {
      const value = inBuild(props) ? turnValueOf<TemplatesValue>(props, TEMPLATES_KEY) : null
      return value === null ? null : <TemplateTail deps={deps} value={value} />
    },
    plan: (props: TailProps) => {
      const value = inBuild(props) ? turnValueOf<PlanValue>(props, PLAN_KEY) : null
      return value === null ? null : <PlanTail deps={deps} value={value} />
    },
    run: (props: TailProps) =>
      inBuild(props) ? (
        <RunTail
          deps={deps}
          sessionId={props.sessionId as string}
          turn={props.turn?.turn}
          useChat={props.useChat ?? noChat}
        />
      ) : null
  }
}
