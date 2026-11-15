// Fixture for the build cards accessibility and phone width run (#613): the plugin's own components, drawn over a
// stub draft door, one named state at a time. `window.probe.mount(name, data)` draws a state; `window.probe.log`
// reads back what the cards sent. No dsh host: the question card and the review chrome of dsh are not drawn here.
import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BUILD_TOOL, buildToolFoldOf } from '@tracy/core/build-chat'
import {
  parseFieldPath,
  resolveFieldPath
} from '../../../../wo/website-opportunities/domain/build-contract-shared.mjs'
import { BuildProgress } from '../../src/client/BuildProgress'
import { BuildStopped } from '../../src/client/BuildStopped'
import { EarlierConversation } from '../../src/client/handoff'
import { PlanCard } from '../../src/client/PlanCard'
import { ReviewBar } from '../../src/client/ReviewBar'
import { savePlanEdit } from '../../src/client/save-plan-edit'
import { saveTemplateChoice } from '../../src/client/save-template'
import { english } from '../../src/client/strings'
import { TemplateCard } from '../../src/client/TemplateCard'
import { makeTails } from '../../src/client/tails'
import { WorkingDock } from '../../src/client/WorkingDock'
import { undoPlanEdit } from '../../src/client/save-plan-edit'

// biome-ignore lint/suspicious/noExplicitAny: test stub
type Any = any

const log: { requests: unknown[]; decisions: unknown[]; sent: string[] } = {
  requests: [],
  decisions: [],
  sent: []
}
const draft: { plan: Any; lastEdit: Any; undo: Any } = { plan: null, lastEdit: null, undo: null }
const ok = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const draftBody = () => ({
  draft: { id: 'draft-1', plan: draft.plan, lastEdit: draft.lastEdit, canUndo: draft.undo !== null }
})
function apply(edit: Any) {
  const next = structuredClone(draft.plan)
  for (const { field, value } of edit.changes) {
    const found = resolveFieldPath(next, parseFieldPath(field))
    if (found.found) found.parent[found.key] = structuredClone(value)
  }
  next.revision += 1
  draft.plan = next
  draft.lastEdit = edit
}
const door = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body))
  log.requests.push({ url, body })
  if (url.endsWith('/plan-edits') && (globalThis as Any).buildRunning) {
    // The door while the site is built: its own owner sentence, 409.
    const next = 'The door sentence while the site is built.'
    return new Response(JSON.stringify({ code: 'BUILD_RUNNING', next }), { status: 409 })
  }
  if (url.endsWith('/plan-edits')) {
    const before = draft.plan
    apply(body.edit)
    draft.undo = {
      ...body.edit,
      id: `undo-${body.edit.id}`,
      changes: body.edit.changes.map(({ field }: Any) => ({
        field,
        value: structuredClone(resolveFieldPath(before, parseFieldPath(field)).value)
      }))
    }
    return ok(draftBody())
  }
  if (url.endsWith('/plan-undo')) {
    const undo = draft.undo
    draft.undo = null
    apply(undo)
    draft.lastEdit = null
    return ok(draftBody())
  }
  return ok({ draft: { id: 'draft-1' } })
}) as Any

const workingValue = { step: 'plan' }
const working = {
  timeline: {
    turnOrder: [1],
    turns: new Map([[1, { status: 'open', data: { get: () => workingValue } }]])
  }
}

function Planned({ view, withReview }: { view: Any; withReview: boolean }) {
  const [revised, setRevised] = useState(view.revised ?? null)
  const card = (
    <PlanCard
      plan={view.plan}
      lookSources={view.lookSources ?? null}
      revised={revised}
      onDismissRevised={() => setRevised(null)}
      t={english}
      newEditId={() => `edit-${log.requests.length + 1}`}
      onEdit={(edit) => savePlanEdit(edit, door)}
      onUndo={() => undoPlanEdit(door)}
    />
  )
  if (!withReview) return card
  const question = {
    id: 'plan-review',
    question: 'Does this plan look right?',
    options: [{ label: 'Approve' }, { label: 'Change the plan' }]
  }
  const matched = {
    sessionId: 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e',
    key: 'k1',
    questions: [question],
    answer: async (a: unknown) => void log.decisions.push(a),
    dismiss: async () => {},
    snapshot: () => ({ channel: 'waterfall' as const })
  }
  const held = { plan: view.plan, lastEdit: null, canUndo: false }
  const drafts = {
    read: () => held,
    subscribe: () => () => {},
    load: async () => {},
    put: () => {}
  }
  return <ReviewBar matched={matched} drafts={drafts as Any} t={english} planCard={card} />
}

/**
 * The box dsh draws its chat column in, so the working line can be measured against the message column. The rules are
 * copied from the vendored dsh client (vendor/tracy/deepseek-harness/packages/client), see `dsh-column.css.mjs`.
 * The body width is published the way dsh does (`--dsh-conversation-column-width`).
 */
function DshColumn() {
  const body = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = body.current
    if (el) el.style.setProperty('--dsh-conversation-column-width', `${el.clientWidth}px`)
  }, [])
  return (
    <div className="dsh-body" ref={body}>
      <div className="dsh-scrollBody">
        <div className="dsh-scroll">
          <div className="dsh-column">
            <p className="dsh-message">Calling tools</p>
          </div>
        </div>
        <div className="dsh-composerSeat">
          <WorkingDock
            sessionId="session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e"
            useChat={(select: Any) => select(working)}
            t={english}
          />
        </div>
      </div>
    </div>
  )
}

const BUILD_SESSION = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const STOP_SAY =
  'Something went wrong on our side, so I stopped here. The Tracy team can see what happened and will look into it.'

/**
 * The turn tail Try again, drawn by the real tails over the real fold of the session's recorded `tracy_build`
 * results (`view.results`: the answers in order), with a stub chat that records what was sent as the owner.
 */
function Retry({ view }: { view: Any }) {
  let seq = 0
  const events = (view.results as Any[]).flatMap((answer: Any, i: number) => {
    const callId = `call-${i}`
    const turn = i + 1
    return [
      {
        type: 'tool/call',
        seq: ++seq,
        data: { turn, name: BUILD_TOOL, callId, arguments: '{"action":"plan"}' }
      },
      {
        type: 'tool/result',
        seq: ++seq,
        surfaceOp: 'append',
        data: {
          turn,
          message: {
            source: { callId },
            isError: false,
            content: [{ type: 'text', text: JSON.stringify(answer) }]
          }
        }
      }
    ]
  })
  const fold = events.reduce(buildToolFoldOf, undefined as Any) as Any
  const tails = makeTails({
    drafts: { read: () => null, subscribe: () => () => {}, load: async () => {}, put: () => {} } as Any,
    reviews: { has: () => false, subscribe: () => () => {} } as Any,
    runs: { read: () => view.run ?? null, subscribe: () => () => {}, load: async () => {} } as Any,
    t: () => english,
    send: async (_session, text) => {
      log.sent.push(text)
      return view.sendResult ?? 'sent'
    }
  })
  return (
    <div>
      <p>{STOP_SAY}</p>
      {tails.retry({
        sessionId: BUILD_SESSION,
        seq: 1,
        turn: { turn: fold.stop?.turn ?? 0, data: { get: () => fold.stop } }
      } as Any)}
    </div>
  )
}

function State({ name, view }: { name: string; view: Any }) {
  const [, force] = useState(0)
  void force
  switch (name) {
    case 'template':
      return (
        <TemplateCard
          templates={view.templates}
          chosen={view.chosen ?? null}
          t={english}
          onChoose={(template) => saveTemplateChoice(template, door)}
        />
      )
    case 'plan':
      return <Planned view={view} withReview={false} />
    case 'review':
      return <Planned view={view} withReview />
    case 'progress':
      return (
        <>
          {view.run?.outcome && <BuildStopped outcome={view.run.outcome} t={english} />}
          <BuildProgress run={view.run} t={english} />
        </>
      )
    case 'working':
      return (
        <WorkingDock
          sessionId="session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e"
          useChat={(select: Any) => select(working)}
          t={english}
        />
      )
    case 'retry':
      return <Retry view={view} />
    case 'dsh-column':
      return <DshColumn />
    case 'earlier':
      return (
        <EarlierConversation
          messages={view.messages}
          t={english}
          plan={
            <PlanCard
              plan={view.plan}
              t={english}
              onEdit={async () => draftBody().draft}
              onUndo={async () => draftBody().draft}
            />
          }
        />
      )
    default:
      return null
  }
}

let root: ReturnType<typeof createRoot> | null = null
;(window as Any).probe = {
  mount(name: string, view: Any) {
    draft.plan = view.plan ?? null
    draft.lastEdit = null
    draft.undo = null
    log.requests.length = 0
    log.decisions.length = 0
    log.sent.length = 0
    root?.unmount()
    root = createRoot(document.getElementById('root') as HTMLElement)
    root.render(
      <div data-state={name}>
        <State name={name} view={view} />
      </div>
    )
  },
  log: () => ({ requests: [...log.requests], decisions: [...log.decisions], sent: [...log.sent] })
}
