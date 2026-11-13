// The build chat plugin's REAL entry over a recorded session (#609): `apply` of `@tracy/dsh-build-chat` registers into
// a small stand in for dsh's slot host and conversation engine, and this page draws what it registered: per turn the
// tracy_build rows (the keyed tool view) and, like dsh, the turn tails of ENDED turns only (a `turn/end` event), then
// the composer chain for a pending question. The
// events are `tool/call` and `tool/result` in the shape `tracy_build` writes them; the doors are the page's own
// `fetch`, answered by the runner. `window.probe.load(...)` draws a session, `window.probe.ask(...)` a pending question.
import { useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createWaterfallRequest,
  PendingQuestion
} from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/contract/slots.ts'
import { apply } from '../../../../../ui/tracy-build-chat/src/client/index.tsx'

// biome-ignore lint/suspicious/noExplicitAny: test stand in for the dsh slot host and conversation engine
type Any = any

const listeners = new Set<() => void>()
let version = 0
const changed = () => {
  version += 1
  for (const l of listeners) l()
}
const useVersion = () =>
  useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => version
  )

const entries = new Set<{ options: Any; component: Any }>()
const definitions: Any[] = []
const ctx = {
  effect(fn: () => unknown) {
    fn()
  },
  locale: { register: () => {} },
  uiConversation: { events: { register: (d: Any) => definitions.push(d) } },
  slots: {
    inject: (_name: string, cb: () => () => void) => cb(),
    register(options: Any, component: Any) {
      const entry = { options, component }
      entries.add(entry)
      changed()
      return () => {
        entries.delete(entry)
        changed()
      }
    }
  }
}
apply(ctx as Any)

const of = (name: string) => [...entries].filter((e) => e.options.name === name)

/** The conversation engine's part: each definition folds the events in one context and publishes on one turn. */
function publish(events: Any[]) {
  const byTurn = new Map<number, Map<string, unknown>>()
  for (const d of definitions) {
    let state: Any
    let published: Any = null
    for (const event of events) {
      const m = d.match(event)
      if (m === null) continue
      state =
        state === undefined
          ? d.start({}, { event, role: m.role })
          : d.update({ state }, { event, role: m.role })
      published = d.buildLocationData({ state }, 'turn', published)
    }
    if (published === null) continue
    if (!byTurn.has(published.turn)) byTurn.set(published.turn, new Map())
    byTurn.get(published.turn)?.set(published.key, published.value)
  }
  return byTurn
}

const session: { id: string; events: Any[]; pending: Any } = { id: '', events: [], pending: null }
const answered: unknown[] = []

function Turn({ turn, data, last }: { turn: number; data: Map<string, unknown> | undefined; last: number }) {
  const calls = session.events.filter((e) => e.type === 'tool/call' && e.data.turn === turn)
  // dsh draws a turn's tail only once the turn ended (ui-chat turn-tail.ts publishes on turn/end).
  const ended = session.events.some((e) => e.type === 'turn/end' && e.data.turn === turn)
  const useChat = (select: Any) => select({ timeline: { turnOrder: [...Array(last + 1).keys()] } })
  const owner = {
    sessionId: session.id,
    seq: 1e9,
    turn: { turn, data: { get: (k: string) => data?.get(k) } },
    useChat
  }
  return (
    <section data-turn={turn}>
      {calls.map((call) => {
        const result = session.events.find(
          (e) => e.type === 'tool/result' && e.data.message.source.callId === call.data.callId
        )
        const view = {
          sessionId: session.id,
          callId: call.data.callId,
          toolName: call.data.name,
          phase: result ? 'result' : 'start',
          block: result
            ? {
                call: { name: call.data.name, argsRaw: call.data.arguments },
                content: result.data.message.content,
                isError: false
              }
            : { name: call.data.name, argsRaw: call.data.arguments }
        }
        const keyed = of('tool.call.toolview').find((e) => e.options.key === call.data.name)
        const View = keyed?.component
        return (
          <div key={call.data.callId} data-call={call.data.callId}>
            {View ? <View {...view} /> : <pre>{result?.data.message.content[0].text}</pre>}
          </div>
        )
      })}
      {ended &&
        of('conversation.chat.turnTail').map((e) => {
          const Tail = e.component
          return <Tail key={e.options.id} {...owner} />
        })}
    </section>
  )
}

function Composer() {
  if (session.pending === null) return null
  const entry = of('conversation.composer')
    .map((e) => ({ e, matched: e.options.select({ pendingInteraction: session.pending }) }))
    .find((x) => x.matched !== null)
  if (!entry) return <div data-dsh-question="">{session.pending.questions[0].question}</div>
  const Bar = entry.e.component
  return <Bar matched={entry.matched} />
}

function Chat() {
  useVersion()
  const byTurn = publish(session.events)
  const turns = [...new Set(session.events.map((e) => e.data.turn as number))].sort((a, b) => a - b)
  const last = turns.at(-1) ?? 0
  return (
    <main data-session={session.id}>
      {turns.map((turn) => (
        <Turn key={turn} turn={turn} data={byTurn.get(turn)} last={last} />
      ))}
      <Composer />
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(<Chat />)
;(window as Any).probe = {
  load(id: string, events: Any[]) {
    session.id = id
    session.events = events
    session.pending = null
    answered.length = 0
    changed()
  },
  /** A pending `ask_user_question` request as dsh's question tool hands it to the browser. */
  ask(questions: Any[]) {
    const pending = new PendingQuestion(session.id as Any, questions)
    const wire = createWaterfallRequest(undefined, undefined, (channel) => pending.detachWaterfall(channel))
    pending.attachWaterfall(wire.channel)
    wire.result.then(
      (reply) => answered.push(reply),
      () => {}
    )
    session.pending = pending
    changed()
  },
  answered: () => [...answered],
  registered: () => [...entries].map((e) => e.options.name)
}
