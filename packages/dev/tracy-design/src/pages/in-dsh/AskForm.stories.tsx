/**
 * The ask form — a whole set of questions answered at once — DRAWN FROM THE SHIPPED CODE:
 * `AskForm` and its model come from `packages/site/tracy-site-build-core/src/client/ask-form`, the
 * words from `@tracy/dsh-ask-form`'s `strings.ts` (plus the language picker's `lang.*` from
 * build-core). Nothing inside the component is replaced; only the caller around it is a story.
 *
 * WHY IT EXISTS. On a lane the form only appears when an agent calls `ask_user_question`, and its
 * states (sending, refused, a new request arriving, nothing waiting) cannot be held still there.
 *
 * Framed at 600px: the width the right-pane tab asks for (`preferredWidth`).
 *
 * ⚠ MODE B: the component lives inside dsh's page with no reset; the bench scans
 * `tracy-site-build-core/src/client` from `src/style.css` so its classes exist here.
 */
import type { Meta, StoryObj } from '@storybook/react-vite'
import { type JSX, useMemo, useState } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import {
  AskForm,
  type AskFormProps
} from '../../../../../site/tracy-site-build-core/src/client/ask-form/AskForm'
import {
  type AskDraft,
  type AskForm as AskFormModel,
  type DshAnswerMode,
  fromDsh,
  fromTracy,
  toDshAnswer
} from '../../../../../site/tracy-site-build-core/src/client/ask-form/model'
import { baseEn } from '../../../../../site/tracy-site-build-core/src/client/strings'
import { en as askEn } from '../../../../../ui/tracy-ask-form/src/client/strings'

const meta: Meta = {
  title: 'Pages/In dsh/Ask form',
  parameters: { layout: 'fullscreen' }
}
export default meta
type Story = StoryObj

const WORDS: Record<string, string> = { ...baseEn, ...askEn }
const t: AskFormProps['t'] = (key, params) =>
  (WORDS[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))

/** What the agent asked: one single choice with a recommendation, one multi, one free text. */
const SHOP = fromDsh([
  {
    id: 'payments',
    header: 'Selling PDFs',
    question: 'How should customers pay for a PDF?',
    options: [
      { label: 'Stripe (Recommended)', description: 'Cards and wallets, payouts every week.' },
      { label: 'PayPal', description: 'Customers who already have a PayPal account.' },
      { label: 'Both' }
    ]
  },
  {
    id: 'delivery',
    question: 'How does the PDF reach the customer?',
    multiSelect: true,
    recommended: 'A download link on the thank-you page',
    options: [{ label: 'A download link on the thank-you page' }, { label: 'An email with the file' }]
  },
  { id: 'notes', question: 'Anything else the store should do?' }
])

/** A site questionnaire's language question, drawn by the same form. */
const LANGUAGES = fromTracy(
  [
    {
      id: 'languages',
      label: 'Which languages is the site in?',
      kind: 'languages',
      options: ['en', 'vi', 'fr']
    }
  ],
  'en'
)

const PENDING: AskFormModel = { ...SHOP, items: [...SHOP.items, ...LANGUAGES.items] }

const NEXT: AskFormModel = fromDsh([
  {
    id: 'price',
    header: 'One more thing',
    question: 'What does one PDF cost?',
    options: [{ label: 'Under $10' }, { label: '$10 to $30' }, { label: 'More than $30' }]
  }
])

/** A rewrite that answers after a short wait, as the real door does. */
const slowRewrite = (text: string) =>
  new Promise<string>((done) => setTimeout(() => done(`${text.trim()} — rewritten for clarity.`), 600))

function Frame({ children }: { children: JSX.Element }): JSX.Element {
  return (
    <div className="h-[720px] w-[600px] border-border border-r bg-background text-foreground">{children}</div>
  )
}

/** The caller around the form: it keeps the draft and turns each press into the answer dsh takes. */
function Harness({
  model,
  busy,
  error,
  onModel
}: {
  model: AskFormModel
  busy?: boolean
  error?: string
  onModel?: () => void
}): JSX.Element {
  const [draft, setDraft] = useState<AskDraft>({})
  const [sent, setSent] = useState('')
  const send = (mode: DshAnswerMode) => setSent(JSON.stringify(toDshAnswer(model, draft, mode)))
  return (
    <div className="flex gap-4">
      <Frame>
        <AskForm
          model={model}
          draft={draft}
          onDraft={setDraft}
          busy={busy}
          error={error}
          rewrite={slowRewrite}
          t={t}
          actions={{
            primary: { label: askEn['action.submit'], onPress: () => send('submit') },
            secondary: { label: askEn['action.decide'], onPress: () => send('decide') },
            tertiary: { label: askEn['action.followUp'], onPress: () => send('follow_up') }
          }}
        />
      </Frame>
      <div className="flex w-[320px] flex-col gap-2 p-4 text-xs">
        {onModel ? (
          <button
            type="button"
            className="rounded-md border border-border px-2.5 py-1"
            onClick={() => {
              setDraft({})
              setSent('')
              onModel()
            }}
          >
            Next request
          </button>
        ) : null}
        <pre data-testid="sent" className="m-0 whitespace-pre-wrap break-all">
          {sent}
        </pre>
      </div>
    </div>
  )
}

export const Pending: Story = {
  render: () => <Harness model={PENDING} />
}

export const Submitting: Story = {
  render: () => <Harness model={PENDING} busy />
}

export const Refused: Story = {
  render: () => <Harness model={PENDING} error={askEn['error.answer']} />
}

export const NothingAsked: Story = {
  render: () => <Harness model={fromDsh([])} />
}

/** A new request replaces the one on screen: the draft starts empty, and each button answers it. */
export const RequestChanges: Story = {
  render: function RequestChangesStory() {
    const [second, setSecond] = useState(false)
    const model = useMemo(() => (second ? NEXT : PENDING), [second])
    return <Harness model={model} onModel={() => setSecond((s) => !s)} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const sent = canvas.getByTestId('sent')
    const read = () => JSON.parse(sent.textContent ?? '{}')

    await userEvent.click(canvas.getByText('PayPal'))
    await userEvent.click(canvas.getByRole('button', { name: askEn['action.submit'] }))
    await waitFor(() => expect(read().answers[0]).toEqual({ id: 'payments', selected: ['PayPal'] }))
    await expect(read().action).toBeUndefined()

    await userEvent.click(canvas.getByRole('button', { name: askEn['action.decide'] }))
    await waitFor(() => expect(read().action).toBe('decide'))
    await expect(read().answers[1]).toEqual({
      id: 'delivery',
      selected: ['A download link on the thank-you page']
    })

    await userEvent.click(canvas.getByRole('button', { name: askEn['action.followUp'] }))
    await waitFor(() => expect(read().action).toBe('follow_up'))

    await userEvent.click(canvas.getByRole('button', { name: 'Next request' }))
    await waitFor(() => expect(canvas.getByText('What does one PDF cost?')).toBeInTheDocument())
    await userEvent.click(canvas.getByRole('button', { name: askEn['action.submit'] }))
    await waitFor(() => expect(read()).toEqual({ answers: [{ id: 'price', selected: [] }] }))
  }
}
