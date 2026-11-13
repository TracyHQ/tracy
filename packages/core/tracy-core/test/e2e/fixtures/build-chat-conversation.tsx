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
import { answerOf, askRequestOf, replyOf, researchRowOf } from '../../../src/build-chat/index.mjs'

// biome-ignore lint/suspicious/noExplicitAny: test stub of the dsh runtime kit
type Any = any

/** dsh's translator over its own English dictionaries, `{name}` filled in. */
const dict: Record<string, string> = { ...commonEn, ...conversationEn, ...questionEn }
const t = ((key: string, vars?: Record<string, unknown>) =>
  (dict[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(vars?.[name] ?? ''))) as Any

const SID = 'session-build-0f1e2d3c-4b5a-4968-8778-695a4b3c2d1e'
const sent: unknown[] = []

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

/** One stage of the build chat: what has arrived so far, drawn in the order of the conversation. */
function Chat({ stage }: { stage: Any }) {
  const [answers, setAnswers] = useState<Any[]>(stage.answers)
  const asked = stage.questions.length > 0
  return (
    <main data-stage={stage.name}>
      <ResearchLine research={stage.research} />
      {asked && answers.length === 0 && <Questions questions={stage.questions} onAnswered={setAnswers} />}
      {asked && answers.length > 0 && (
        <QuestionReplyBubble data={replyOf(stage.questions, answers) as Any} t={t} />
      )}
    </main>
  )
}

let root: ReturnType<typeof createRoot> | null = null
;(window as Any).probe = {
  mount(stage: Any) {
    root?.unmount()
    sent.length = 0
    root = createRoot(document.getElementById('root') as HTMLElement)
    root.render(<Chat stage={stage} />)
  },
  get: () => ({ sent: [...sent] })
}
