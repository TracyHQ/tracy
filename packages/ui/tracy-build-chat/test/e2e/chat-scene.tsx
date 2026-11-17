// A build chat as dsh lays it out (#575): the data attributes dsh writes on its chat body, process group, reasoning
// row, tool rows, whole turn control and running clock (vendor/tracy/deepseek-harness/packages/client: ui-chat
// ChatGroupSeat, ChatNodeSeat, ReasoningRow, RunningStatus, TurnProcessNodeView; ui-tool ToolCallTree, ToolRow and
// QuestionToolRow; ui-conversation ConversationContent), with the plugin's REAL rows, superseded calls and working
// line inside. Not dsh itself: only what the chrome rules and the rows read. The research of one invented club:
// a research call that waits on the owner's place, their answer, then a status call that reads the links.

import { BUILD_TOOL } from '@tracy/core/build-chat'
import { useMemo } from 'react'
import { BuildToolRow, type ToolViewProps } from '../../src/client/BuildToolRow'
import { createSupersededCalls, supersedeDefinitionFor } from '../../src/client/call-supersede'
import type { EngineFeed } from '../../src/client/engine-feed'
import { english } from '../../src/client/strings'
import { WorkingDock } from '../../src/client/WorkingDock'

type Any = any

export const BUILD_SESSION = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const OTHER_SESSION = 'session-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const LINKS = [
  'https://maps.google.com/?cid=0000',
  'https://example-court.example',
  'https://instagram.com/example.court'
]
const CHOOSING = [
  { name: 'Google Maps', state: 'choice' },
  { name: 'example-court.example', state: 'reading' },
  { name: 'Instagram', state: 'reading' }
]
const READING = [
  { name: 'Google Maps', state: 'read' },
  { name: 'example-court.example', state: 'reading' },
  { name: 'Instagram', state: 'reading' }
]
const READ = [
  { name: 'Google Maps', state: 'read', facts: 6, pictures: 4 },
  { name: 'example-court.example', state: 'read', facts: 12, pictures: 9 },
  { name: 'Instagram', state: 'read', facts: 2, pictures: 18 }
]

export interface SceneView {
  /** 'build' draws a build chat session; 'other' the same layout in any other chat. */
  session?: 'build' | 'other'
  /** 'working': the status call still waits; 'done': it answered the finished research. */
  stage: 'working' | 'done'
  /** The turn ended and dsh folded its work behind the whole turn control (a reload of a finished turn too). */
  folded?: boolean
  /** Another tool's row that failed: it must stay drawn. */
  failedTool?: boolean
}

const text = (value: unknown) => [{ type: 'text', text: JSON.stringify(value) }]
const call = (callId: string, args: unknown) => ({
  type: 'tool/call',
  data: { turn: 1, name: BUILD_TOOL, callId, arguments: JSON.stringify(args) }
})

/** The engine door while the status call waits: research, one link read, two reading (one stable snapshot). */
const ENGINE_SEEN = { step: 'research', links: READING as Any }
const engine: EngineFeed = {
  read: () => ENGINE_SEEN,
  subscribe: () => () => {}
}

/** dsh hides a folded part with hidden="until-found", set on the element itself (React would write hidden=""). */
const untilFound = (on: boolean) => (element: HTMLElement | null) => {
  if (on) element?.setAttribute('hidden', 'until-found')
  else element?.removeAttribute('hidden')
}

/** The open turn of the session while the status call waits, as dsh hands it to the input dock (stable values). */
const WORKING_VALUE = { step: 'status' }
const working = {
  timeline: { turnOrder: [1], turns: new Map([[1, { status: 'open', data: { get: () => WORKING_VALUE } }]]) }
}

function Seat({
  kind,
  part,
  hidden,
  children
}: {
  kind: string
  part?: string
  hidden: boolean
  children: Any
}) {
  return (
    <div
      data-chat-flow-kind={kind}
      data-chat-group-part={part}
      data-turn-process-member={hidden || undefined}
      data-turn-process-hidden={hidden || undefined}
      ref={untilFound(hidden)}
    >
      {children}
    </div>
  )
}

function ToolSeat({ callId, view, hidden, superseded }: Any) {
  return (
    <Seat kind="tool-call" hidden={hidden}>
      <div data-chat-call-id={callId}>
        <BuildToolRow view={{ ...view, callId }} t={english} engine={engine} superseded={superseded} />
      </div>
    </Seat>
  )
}

export function ChatScene({ view }: { view: SceneView }) {
  const session = view.session === 'other' ? OTHER_SESSION : BUILD_SESSION
  const folded = view.folded === true
  // The session log folded the way dsh folds it, into a new store each mount: a remount is a reload.
  const superseded = useMemo(() => {
    const store = createSupersededCalls()
    const definition = supersedeDefinitionFor(store)
    let state: Any
    for (const event of [
      call('c1', { action: 'research', links: LINKS }),
      call('c2', { action: 'status' })
    ]) {
      state = state === undefined ? definition.start({}, { event }) : definition.update({ state }, { event })
    }
    return store
  }, [])
  const first: ToolViewProps = {
    phase: 'result',
    block: {
      call: { argsRaw: JSON.stringify({ action: 'research', links: LINKS }) },
      content: text({ links: CHOOSING })
    }
  }
  const second: ToolViewProps =
    view.stage === 'working'
      ? { phase: 'start', block: { argsRaw: JSON.stringify({ action: 'status' }) } }
      : {
          phase: 'result',
          block: {
            call: { argsRaw: JSON.stringify({ action: 'status' }) },
            content: text({ profile: { business: 'Example Court Tennis Club' }, links: READ })
          }
        }
  return (
    <div data-conversation-content="" data-conversation-session={session} data-conversation-region="chat">
      <div data-conversation-scroll="" className="dsh-scene">
        <div className="dsh-scene-user">Build a website for my tennis club.</div>
        {folded && (
          <Seat kind="turn-process" hidden={false}>
            <button type="button">Completed in 2m 4s</button>
          </Seat>
        )}
        <div data-step-process="" data-chat-group-key="g1" ref={untilFound(folded)}>
          <div>
            <button type="button" aria-expanded={false}>
              Calling tools
            </button>
          </div>
          <div data-step-process-body="" ref={untilFound(true)}>
            <div data-step-process-content="">
              <Seat kind="assistant-step" part="reasoning" hidden={folded}>
                <div data-variant="think" data-state="ok">
                  Think
                </div>
              </Seat>
              <ToolSeat callId="c1" view={first} hidden={folded} superseded={superseded} />
              <Seat kind="tool-call" hidden={folded}>
                <div data-tool="ask_user_question" data-state="ok">
                  Ask question · 1/1 answered
                </div>
              </Seat>
              {view.failedTool && (
                <Seat kind="tool-call" hidden={folded}>
                  <div data-tool="web_fetch" data-state="error">
                    Visit web page · failed
                  </div>
                </Seat>
              )}
              <ToolSeat callId="c2" view={second} hidden={folded} superseded={superseded} />
            </div>
          </div>
        </div>
        {view.stage === 'working' && (
          <div data-chat-running="">
            <span>Thinking for 27s ···</span>
          </div>
        )}
        <div data-composer-seat="">
          {view.stage === 'working' && (
            <WorkingDock
              sessionId={session}
              useChat={(select: Any) => select(working)}
              t={english}
              engine={engine}
            />
          )}
          <div className="dsh-scene-input">Ask anything</div>
        </div>
      </div>
    </div>
  )
}
