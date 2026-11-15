// Fixture for the build cards accessibility and phone width run (#613): the plugin's own components, drawn over a
// stub draft door, one named state at a time. `window.probe.mount(name, data)` draws a state; `window.probe.log`
// reads back what the cards sent. No dsh host: the question card and the review chrome of dsh are not drawn here.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
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
import { WorkingDock } from '../../src/client/WorkingDock'
import { undoPlanEdit } from '../../src/client/save-plan-edit'

// biome-ignore lint/suspicious/noExplicitAny: test stub
type Any = any

const log: { requests: unknown[]; decisions: unknown[] } = { requests: [], decisions: [] }
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
    root?.unmount()
    root = createRoot(document.getElementById('root') as HTMLElement)
    root.render(
      <div data-state={name}>
        <State name={name} view={view} />
      </div>
    )
  },
  log: () => ({ requests: [...log.requests], decisions: [...log.decisions] })
}
