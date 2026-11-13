// The build chat's conversation for the scenario runner (#604): dsh's real chat components, fed through the pure
// functions of `@tracy/core/build-chat`, over a stub runtime kit. `window.probe.mount(stage)` draws one stage;
// `window.probe.get()` reads back what the owner sent.
import { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { en as commonEn } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/locale/src/locales/en.ts'
import { en as conversationEn } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-conversation/src/client/locales.ts'
import { ToolRow } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-tool/src/client/tool/components/ToolRow.tsx'
import {
  createWaterfallRequest,
  PendingQuestion
} from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/contract/slots.ts'
import { createQuestionDraftStore } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/draft-store.ts'
import { QuestionComposer } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/QuestionComposer.tsx'
import { QuestionReplyBubble } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/QuestionReplyView.tsx'
import { en as questionEn } from '../../../../../../vendor/tracy/deepseek-harness/packages/client/ui-user-questions/src/client/locales.ts'
import {
  BuildProgress,
  BuildStopped,
  english,
  PlanCard,
  savePlanEdit,
  saveTemplateChoice,
  TemplateCard,
  undoPlanEdit
} from '../../../../../ui/tracy-build-chat/src/client/index.tsx'
import {
  parseFieldPath,
  resolveFieldPath
} from '../../../../../wo/website-opportunities/domain/build-contract-shared.mjs'
import {
  answerOf,
  approvalOf,
  askRequestOf,
  planReviewRequestOf,
  replyOf,
  researchRowOf
} from '../../../src/build-chat/index.mjs'

// biome-ignore lint/suspicious/noExplicitAny: test stub of the dsh runtime kit
type Any = any

/** dsh's translator over its own English dictionaries, `{name}` filled in. */
const dict: Record<string, string> = { ...commonEn, ...conversationEn, ...questionEn }
const t = ((key: string, vars?: Record<string, unknown>) =>
  (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''))) as Any

const SID = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const sent: unknown[] = []
const requests: { method: string; url: string; body: unknown }[] = []
/** What the plan review bar answered: an approval, or the owner took the turn back to ask for changes. */
const decisions: unknown[] = []
/** The draft as tracy-web's build draft store keeps it: the living plan, its last edit and the one undo. */
const draft: { plan: Any; lastEdit: Any; undo: Any } = { plan: null, lastEdit: null, undo: null }
/** A door that refuses every edit as stale, for the failed save check. */
let refuseEdits = false

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const draftBody = () => ({
  draft: { id: 'draft-1', plan: draft.plan, lastEdit: draft.lastEdit, canUndo: draft.undo !== null }
})
/** The one undo of an edit, made as tracy-web's `undoEditOf` makes it: each changed field back to its value before. */
const undoEditOf = (before: Any, edit: Any) => ({
  schema: edit.schema,
  id: `undo-${edit.id}`,
  plan: { id: edit.plan.id, revision: edit.plan.revision + 1 },
  changes: edit.changes.map(({ field }: Any) => ({
    field,
    value: structuredClone(resolveFieldPath(before, parseFieldPath(field)).value)
  }))
})
/**
 * Apply an edit as the store does (`store.js` `applied`): a stale revision is refused, a field that does not resolve
 * is invalid, else each change is set and the revision rises. The full Contract B check needs Node, so the runner runs
 * `checkPlanEdit` on every recorded edit instead.
 */
function applied(edit: Any) {
  if (edit.plan.id !== draft.plan.id || edit.plan.revision !== draft.plan.revision)
    return answer({ code: 'STALE_EDIT' }, 409)
  const next = structuredClone(draft.plan)
  for (const { field, value } of edit.changes) {
    const found = resolveFieldPath(next, parseFieldPath(field))
    if (!found.found) return answer({ code: 'INVALID_EDIT' }, 422)
    found.parent[found.key] = structuredClone(value)
  }
  next.revision += 1
  draft.plan = next
  draft.lastEdit = edit
  return null
}

/** tracy-web's build draft doors as the page sees them: records each request and answers as the door would. */
const draftDoor = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body))
  requests.push({ method: String(init.method), url, body })
  if (url === '/api/build-draft/plan-edits') {
    if (refuseEdits) return answer({ code: 'STALE_EDIT' }, 409)
    const before = draft.plan
    const refused = applied(body.edit)
    if (refused) return refused
    draft.undo = undoEditOf(before, body.edit)
    return answer(draftBody())
  }
  if (url === '/api/build-draft/plan-undo') {
    if (draft.undo === null) return answer({ code: 'NOTHING_TO_UNDO' }, 409)
    const refused = applied(draft.undo)
    if (refused) return refused
    draft.undo = null
    return answer(draftBody())
  }
  return answer({ draft: { id: 'draft-1' } })
}) as Any

/** The research line: dsh's tool row, its open state owned here as the chat owns it. */
function ResearchLine({ research }: { research: Any }) {
  const [expanded, setExpanded] = useState(false)
  const row = researchRowOf(research)
  const useDisclosure = () => ({ expanded, toggle: () => setExpanded((v) => !v) })
  return (
    <ToolRow
      t={t}
      variant="search"
      toolName="web_fetch"
      icon={null}
      title={row.title}
      summary={row.summary}
      details={row.details as Any}
      state="ok"
      useDisclosure={useDisclosure as Any}
    />
  )
}

/** The question card in the conversation, dsh's composer over one pending request of the build session. */
function Questions({ questions, onAnswered }: { questions: Any[]; onAnswered: (answers: Any[]) => void }) {
  const [state] = useState(() => {
    const request = askRequestOf(questions, [])
    if (request === null) return null
    const carrier = new PendingQuestion(SID as Any, request.questions as Any)
    const wire = createWaterfallRequest(undefined, undefined, (channel) => carrier.detachWaterfall(channel))
    carrier.attachWaterfall(wire.channel)
    wire.result.then(
      (reply: Any) => {
        const answers = (reply.answers ?? [])
          .map((item: Any) =>
            answerOf(
              questions.find((q) => q.id === item.id),
              item
            )
          )
          .filter(Boolean)
        sent.push(...answers)
        onAnswered(answers)
      },
      () => {}
    )
    const drafts = createQuestionDraftStore().create(SID as Any)
    return { carrier, drafts }
  })
  if (state === null) return null
  const { carrier, drafts } = state
  const useStore = (selector: Any) =>
    useSyncExternalStore(
      (l) => drafts.subscribe(l),
      () => selector(drafts.getSnapshot())
    )
  const useQuestionCard = (_key: string, selector?: Any) => {
    const value = useSyncExternalStore(carrier.subscribe, carrier.getSnapshot)
    return selector === undefined ? value : selector(value)
  }
  return (
    <QuestionComposer
      {...({} as Any)}
      matched={carrier as Any}
      t={t}
      useStore={useStore as Any}
      actions={drafts.actions}
      useQuestionCard={useQuestionCard as Any}
      renderSlot={() => null}
    />
  )
}

/** The plan review bar: dsh's composer over the one plan review request of the build session. */
function PlanReview({ plan }: { plan: Any }) {
  const [carrier] = useState(() => {
    const request = planReviewRequestOf(plan)
    const pending = new PendingQuestion(SID as Any, request.questions as Any)
    const wire = createWaterfallRequest(undefined, undefined, (channel) => pending.detachWaterfall(channel))
    pending.attachWaterfall(wire.channel)
    wire.result.then(
      (reply: Any) => decisions.push(approvalOf(draft.plan, reply) ?? { requestChanges: true }),
      () => decisions.push({ requestChanges: true })
    )
    return pending
  })
  const drafts = useState(() => createQuestionDraftStore().create(SID as Any))[0]
  const useStore = (selector: Any) =>
    useSyncExternalStore(
      (l) => drafts.subscribe(l),
      () => selector(drafts.getSnapshot())
    )
  const useQuestionCard = (_key: string, selector?: Any) => {
    const value = useSyncExternalStore(carrier.subscribe, carrier.getSnapshot)
    return selector === undefined ? value : selector(value)
  }
  return (
    <QuestionComposer
      {...({} as Any)}
      matched={carrier as Any}
      t={t}
      useStore={useStore as Any}
      actions={drafts.actions}
      useQuestionCard={useQuestionCard as Any}
      renderSlot={() => null}
    />
  )
}

/** One stage of the build chat: what has arrived so far, drawn in the order of the conversation. */
function Chat({ stage }: { stage: Any }) {
  const [answers, setAnswers] = useState<Any[]>(stage.answers)
  // The plan the chat holds; a newer plan composed in the chat (`probe.putPlan`) replaces it, as tracy-web's
  // `PUT /api/build-draft/plan` does: no last edit and no undo for the new plan.
  const [planDraft, setPlanDraft] = useState<Any>({ plan: stage.plan, lastEdit: null, canUndo: false })
  ;(window as Any).probe.setPlanDraft = setPlanDraft
  const asked = stage.questions.length > 0
  return (
    <main data-stage={stage.name}>
      <ResearchLine research={stage.research} />
      {asked && answers.length === 0 && <Questions questions={stage.questions} onAnswered={setAnswers} />}
      {asked && answers.length > 0 && (
        <QuestionReplyBubble data={replyOf(stage.questions, answers) as Any} t={t} />
      )}
      {stage.templates && (
        <TemplateCard
          templates={stage.templates}
          chosen={stage.chosen}
          t={english}
          onChoose={(template) => saveTemplateChoice(template, draftDoor)}
        />
      )}
      {stage.plan && (
        <PlanCard
          plan={planDraft.plan}
          lastEdit={planDraft.lastEdit}
          canUndo={planDraft.canUndo}
          t={english}
          newEditId={() => `edit-${requests.length + 1}`}
          onEdit={(edit) => savePlanEdit(edit, draftDoor)}
          onUndo={() => undoPlanEdit(draftDoor)}
        />
      )}
      {stage.review && <PlanReview plan={stage.plan} />}
      {stage.run?.outcome && <BuildStopped outcome={stage.run.outcome} t={english} />}
      {stage.run && <BuildProgress run={stage.run} t={english} />}
    </main>
  )
}

let root: ReturnType<typeof createRoot> | null = null
;(window as Any).probe = {
  view: null as Any,
  mount(stage: Any) {
    ;(window as Any).probe.view = stage
    root?.unmount()
    sent.length = 0
    requests.length = 0
    decisions.length = 0
    draft.plan = stage.plan ?? null
    draft.lastEdit = null
    draft.undo = null
    refuseEdits = false
    root = createRoot(document.getElementById('root') as HTMLElement)
    root.render(<Chat stage={stage} />)
  },
  get: () => ({ sent: [...sent], requests: [...requests], decisions: [...decisions], plan: draft.plan }),
  /** The draft read again from the door, as a reload of the card would: the plan, its last edit and the undo. */
  reload() {
    const { draft: d } = draftBody()
    ;(window as Any).probe.setPlanDraft({ plan: d.plan, lastEdit: d.lastEdit, canUndo: d.canUndo })
  },
  /** A newer plan composed in the chat (a page added) becomes the one living plan. */
  putPlan(plan: Any) {
    draft.plan = plan
    draft.lastEdit = null
    draft.undo = null
    ;(window as Any).probe.setPlanDraft({ plan, lastEdit: null, canUndo: false })
  },
  /** From now on the door refuses every plan edit as stale (409). */
  refuseEdits() {
    refuseEdits = true
  }
}
