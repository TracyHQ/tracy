// Fixture for the build cards accessibility and phone width run (#613): the plugin's own components, drawn over a
// stub draft door, one named state at a time. `window.probe.mount(name, data)` draws a state; `window.probe.log`
// reads back what the cards sent. No dsh host: the question card and the review chrome of dsh are not drawn here.

import { BUILD_TOOL, buildToolFoldOf } from '@tracy/core/build-chat'
import { useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  parseFieldPath,
  resolveFieldPath
} from '../../../../wo/website-opportunities/domain/build-contract-shared.mjs'
import { BuildProgress } from '../../src/client/BuildProgress'
import { BuildNotStarted, BuildStopped } from '../../src/client/BuildStopped'
import { BUILD_SESSION_CHROME_CSS } from '../../src/client/build-session-chrome'
import { PLAN_KEY } from '../../src/client/definitions'
import { EarlierConversation } from '../../src/client/handoff'
import { PlanCard } from '../../src/client/PlanCard'
import { ReviewBar } from '../../src/client/ReviewBar'
import { savePlanEdit, undoPlanEdit } from '../../src/client/save-plan-edit'
import { saveTemplateChoice } from '../../src/client/save-template'
import { english } from '../../src/client/strings'
import { TemplateCard } from '../../src/client/TemplateCard'
import { makeTails } from '../../src/client/tails'
import { WorkingDock } from '../../src/client/WorkingDock'
import { ChatScene } from './chat-scene'

// The build session chrome rules, mounted as the plugin mounts them: their own style element.
const chrome = document.createElement('style')
chrome.textContent = `${BUILD_SESSION_CHROME_CSS}
.dsh-scene { display: flex; flex-direction: column; gap: 8px; max-width: 680px; margin: 0 auto; padding: 16px 0; }
.dsh-scene-user { align-self: flex-end; padding: 8px 12px; border-radius: 12px; background: var(--muted); }
.dsh-scene-input { margin-top: 8px; padding: 12px; border: 1px solid var(--border); border-radius: 16px; color: var(--muted-foreground); }`
document.head.appendChild(chrome)

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
  if (url.endsWith('/plan-edits') && (globalThis as Any).refuseOnce) {
    // The door refusing one change for a fault of the plan itself (#575 stand), then saving the next one.
    ;(globalThis as Any).refuseOnce = false
    const problems = [{ code: 'plan_fault', at: 'plan', message: 'The door sentence for a faulty plan.' }]
    return new Response(JSON.stringify({ code: 'INVALID_EDIT', problems }), { status: 422 })
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
    id: `plan-review:${view.plan.id}:${view.plan.revision}`,
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
  // With `view.say` the bar is given the chat's send verb, as the plugin gives it, and offers its typing line.
  const send = view.say
    ? async (text: string) => {
        log.sent.push(text)
        return view.sendResult ?? 'sent'
      }
    : undefined
  return <ReviewBar matched={matched} drafts={drafts as Any} t={english} planCard={card} send={send} />
}

/**
 * The review bar in the composer seat of dsh's chat column, the place dsh draws the composer chain in, so the bar and
 * its plan card can be measured against the message column.
 */
function ReviewColumn({ view }: { view: Any }) {
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
            <p className="dsh-message">Here is your site plan.</p>
          </div>
        </div>
        <div className="dsh-composerSeat">
          <Planned view={{ ...view, say: true }} withReview />
        </div>
      </div>
    </div>
  )
}

/** One turn's location data as dsh keeps it: `get` and a live `source` per key, the value moved by `set`. */
function turnData(initial: unknown) {
  let value = initial
  const listeners = new Set<() => void>()
  const read = (key: string) => (key === PLAN_KEY ? value : undefined)
  return {
    get: read,
    source: (key: string) => ({
      getSnapshot: () => read(key),
      subscribe: (l: () => void) => {
        listeners.add(l)
        return () => void listeners.delete(l)
      }
    }),
    set(next: unknown) {
      value = next
      for (const l of listeners) l()
    }
  }
}

/**
 * The plan tails of a chat's turns, drawn ONCE, the way dsh keeps a finished turn's tail (its turn tail view is
 * memoised), over turn data that moves the plan to the newest turn on `probe.nextPlan()`, as dsh does after a change
 * request. `view.reviewing` stands for the review bar showing.
 */
const turns: ReturnType<typeof turnData>[] = []
function Turns({ view }: { view: Any }) {
  const [tails] = useState(() => {
    const held = { plan: view.plan, lastEdit: null, canUndo: false }
    return makeTails({
      drafts: { read: () => held, subscribe: () => () => {}, load: async () => {}, put: () => {} } as Any,
      reviews: { has: () => view.reviewing === true, subscribe: () => () => {} } as Any,
      runs: { read: () => null, subscribe: () => () => {}, load: async () => {} } as Any,
      t: () => english
    })
  })
  const tailOf = (i: number) => (
    <div key={i} data-turn={i + 1}>
      {tails.plan({ sessionId: BUILD_SESSION, seq: i + 1, turn: { turn: i + 1, data: turns[i] } } as Any)}
    </div>
  )
  // The first turn's tail is drawn once and kept; the second turn's tail is drawn when that turn ends.
  const [first] = useState(() => {
    turns.length = 0
    turns.push(turnData({ id: view.plan.id, revision: view.plan.revision }), turnData(undefined))
    return tailOf(0)
  })
  const [second, setSecond] = useState<ReturnType<typeof tailOf> | null>(null)
  endSecondTurn = () => setSecond(tailOf(1))
  return (
    <>
      {first}
      {second}
    </>
  )
}
let endSecondTurn = () => {}

const BUILD_SESSION = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
// What the agent says above the card: a short lead in only (the tool tells it so, `CARD_SAYS_WHY`), because the
// card carries the one explanation of why it stopped.
const STOP_SAY = 'I had to pause here.'

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
    // The engine door the stop card reads once (#575): the state a view names, else a step that is done.
    fetch: (async (url: string) => {
      if (!url.endsWith('/start-over')) return ok(view.engine ?? { step: 'compose', state: 'done' })
      log.requests.push({ url })
      return ok({ started: true, open: '/new/build' })
    }) as Any,
    navigate: (href: string) => log.requests.push({ navigate: href }),
    send: async (_session, text) => {
      log.sent.push(text)
      return view.sendResult ?? 'sent'
    }
  })
  const turn = Math.max(1, (view.results as Any[]).length)
  // The definition publishes on the session's last turn: the latest stop, or none.
  const value = { turn, stop: fold.stop }
  return (
    <div>
      <p>{STOP_SAY}</p>
      {tails.retry({
        sessionId: BUILD_SESSION,
        seq: 1,
        turn: { turn, data: { get: () => value } }
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
      // As the run tail draws it: a build refused before any step is its sentence alone, with no task list.
      if (typeof view.run?.notStarted === 'string')
        return <BuildNotStarted code={view.run.notStarted} t={english} />
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
    case 'review-column':
      return <ReviewColumn view={view} />
    case 'turns':
      return <Turns view={view} />
    case 'chat':
      return <ChatScene view={view} />
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
  log: () => ({ requests: [...log.requests], decisions: [...log.decisions], sent: [...log.sent] }),
  /** A change request answered: the plan moves from the first turn to the second. */
  nextPlan() {
    const value = turns[0]?.get(PLAN_KEY) as Any
    turns[0]?.set(undefined)
    turns[1]?.set({ ...value, revision: value.revision + 1 })
    endSecondTurn()
  }
}
