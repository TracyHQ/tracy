/**
 * Browser fixture for the Help strip of the start screen (`.tv-help-dock`).
 *
 * Runs the plugin's REAL `apply` against stand-ins of the four dsh services it uses: `slots` hands back
 * the occupant of `conversation.input.dock`, which is mounted into a page laid out like dsh's start
 * screen (the test's page); `chatLocal` is a small store of local rows shaped like dsh's; `commandUi`
 * keeps the `/help` command so the test can run it (`window.__help.ask`). The rows are drawn by the real
 * Help controller over the test server's `/api/assistant` doors, so a restore, a bare /help and a
 * streamed answer reach the strip the way they do on a site. Only the page's layout is copied, by
 * hand, from dsh's CSS modules.
 */
import type { ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { apply } from '../../src/client/index'
import { en } from '../../src/client/strings'

interface LocalRow {
  id: string
  kind: string
  anchorSeq: number
  data: unknown
}

/** dsh's `chatLocal.for(sessionId)`, as much of it as the plugin reads: rows in anchor order, one snapshot per change. */
function localRows() {
  const rows = new Map<string, LocalRow>()
  const listeners = new Set<() => void>()
  let snapshot: readonly { key: string; kind: string; data: unknown }[] = []
  const publish = () => {
    snapshot = [...rows.values()]
      .sort((a, b) => a.anchorSeq - b.anchorSeq)
      .map((row) => ({ key: row.id, kind: row.kind, data: row.data }))
    for (const listener of listeners) listener()
  }
  return {
    upsert(input: LocalRow) {
      rows.set(input.id, input)
      publish()
    },
    remove(id: string) {
      rows.delete(id)
      publish()
    },
    tailSeq: () => 0,
    nodes: {
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
      getSnapshot: () => snapshot
    }
  }
}

const sessions = new Map<string, ReturnType<typeof localRows>>()
const rowsOf = (sessionId: string) => {
  let rows = sessions.get(sessionId)
  if (!rows) {
    rows = localRows()
    sessions.set(sessionId, rows)
  }
  return rows
}

type Command = { name: string; ui: { run(session: { sessionId: string }, text?: string): void } }
const commands = new Map<string, Command>()
let Dock: ComponentType<Record<string, unknown>> | null = null
const t = (key: string) => (en as Record<string, string>)[key] ?? key

/**
 * dsh's action row under a finished answer (`ctx.chatLocal.AnswerActions`, fork tracy.42), as tall as
 * the real one: its root carries `data-answer-actions` and holds one line of 28px buttons 4px below
 * (ui-chat AnswerActions.module.css). On a site every finished answer in the strip ends with it.
 */
const AnswerActions = () => (
  <div data-answer-actions="" style={{ display: 'flex', flexDirection: 'column' }}>
    <div style={{ display: 'flex', height: 28, marginTop: 4 }} />
  </div>
)

apply({
  effect: (fn: () => unknown) => {
    fn()
  },
  get: () => undefined,
  slots: {
    register(spec: { name: string }, component: unknown) {
      if (spec.name === 'conversation.input.dock') Dock = component as ComponentType<Record<string, unknown>>
      return () => {}
    },
    inject: (_name: string, fn: () => unknown) => {
      fn()
    }
  },
  locale: { register: () => () => {}, bind: () => t, subscribe: () => () => {} },
  commandUi: {
    register(command: Command) {
      commands.set(command.name, command)
      return () => {}
    }
  },
  sessions: { subagentAddress: () => undefined },
  chatLocal: { for: rowsOf, AnswerActions }
} as unknown as Parameters<typeof apply>[0])

// A blank session on the start screen: dsh draws no transcript, so the strip is where Help rows show.
// The dock slot's occupants in their order: tracy-chat-input's start block (order 10), emptied once
// something was sent and kept as the spacer that holds the chat box at the bottom, then the strip
// (order 95). Both are direct children of the slot's `display: contents` wrapper, as dsh renders them.
const SESSION = 's1'
const noTargets = <T,>(select: (snapshot: { activeTargets: ReadonlySet<string> }) => T): T =>
  select({ activeTargets: new Set() })
const Strip = Dock as unknown as ComponentType<Record<string, unknown>>
createRoot(document.getElementById('dock-slot') as HTMLElement).render(
  <>
    <div className="tv-dock" data-tracy-start="site" data-tracy-sent="" />
    <Strip sessionId={SESSION} session={{ blank: true }} useConversation={noTargets} />
  </>
)

;(window as unknown as { __help: unknown }).__help = {
  /** What typing `/help <text>` in the chat box does (dsh hands the text to the command's `run`). */
  ask: (text: string) => commands.get('help')?.ui.run({ sessionId: SESSION }, text)
}
