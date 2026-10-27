/**
 * M06 · Site questions — the form a customer answers, and the table behind it.
 *
 * TWO TABS BECAUSE THERE ARE TWO READERS. Somebody configuring the brief needs order, type,
 * required, default, condition and — the column usually missing — WHERE THE ANSWER LANDS. Somebody
 * judging the brief needs to type into it. The same five questions, drawn twice, is the only way
 * both get what they need without one of them reading a table as a promise about the other.
 *
 * THE FOLLOW-UPS ARE SEPARATED FROM THE STANDARD SET, ON PURPOSE. The standard five are written in
 * `BuildForm.tsx`. A follow-up is invented by the agent when the brief left a slot empty, and it
 * travels as a line of `site.notes` rather than a named field. Drawing them in one list would say
 * the agent's questions are configuration, which nobody can edit them as.
 *
 * EDITS HERE ARE STATE, AND THE SCREEN SAYS SO TWICE — a badge on the table and a Reset button.
 * There is no Save, because a Save that did nothing is the single most expensive control an
 * internal screen can have.
 */
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  cn
} from '@tracy/ui'
import { AlertCircle, ArrowDown, ArrowUp, MessageSquareText, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { useOps } from './app'
import { CMS_LABEL } from './fixtures'
import { FOLLOW_UPS, STANDARD_QUESTIONS, type BriefQuestion } from './screen-data'
import { Panel, ProvenanceTag, ScreenHead, TextField } from './parts'

/** The real refusal sentence from `strings.ts`, used where the engine would use it. */
const MISSING = 'Tracy needs a little more before writing your words.'

export function SiteQuestions() {
  const ops = useOps()
  const [questions, setQuestions] = useState<BriefQuestion[]>([...STANDARD_QUESTIONS])
  const [withFollowUps, setWithFollowUps] = useState(false)
  const [touched, setTouched] = useState(false)

  const reset = () => {
    setQuestions([...STANDARD_QUESTIONS])
    setWithFollowUps(false)
    setTouched(false)
  }

  const move = (id: string, by: -1 | 1) => {
    setTouched(true)
    setQuestions((prev) => {
      const i = prev.findIndex((q) => q.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next.map((q, k) => ({ ...q, order: k + 1 }))
    })
  }

  const rename = (id: string, label: string) => {
    setTouched(true)
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, label } : q)))
  }

  if (ops.cms === 'emdash') return <NoQuestions />

  const all = withFollowUps ? [...questions, ...FOLLOW_UPS] : questions

  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Site questions"
        sub={
          <>
            What {CMS_LABEL[ops.cms]} asks before it writes a word, where each answer lands, and what the
            customer actually sees. Joomla and WordPress share the same five; the difference is downstream.
          </>
        }
      >
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={withFollowUps}
            onCheckedChange={(on) => setWithFollowUps(on === true)}
            aria-label="Show the follow-up questions the agent would add"
          />
          Agent follow-ups
        </label>
        <Button variant="outline" size="sm" onClick={reset} disabled={!touched && !withFollowUps}>
          <RotateCcw />
          Reset
        </Button>
      </ScreenHead>

      <Tabs defaultValue="config" className="gap-3">
        <TabsList>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="preview">As the customer sees it</TabsTrigger>
        </TabsList>

        <TabsContent value="config">
          <Panel
            title="Questions"
            icon={<MessageSquareText />}
            aside={
              <>
                {touched ? (
                  <Badge variant="outline" className="border-dashed font-normal">
                    Preview only · nothing saved
                  </Badge>
                ) : null}
                <span className="text-muted-foreground text-xs tabular-nums">{all.length} questions</span>
              </>
            }
          >
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-0">#</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Answer type</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Default</TableHead>
                    <TableHead>Shown when</TableHead>
                    <TableHead>Step</TableHead>
                    <TableHead>Lands in</TableHead>
                    <TableHead className="w-0">Order</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {all.map((q, i) => (
                    <TableRow key={q.id} className={q.origin === 'follow-up' ? 'bg-muted/40' : undefined}>
                      <TableCell className="tabular-nums">{i + 1}</TableCell>
                      <TableCell className="min-w-[14rem] whitespace-normal">
                        {q.origin === 'standard' ? (
                          <TextField
                            className="h-8"
                            value={q.label}
                            aria-label={`Label for ${q.id}`}
                            onValue={(next) => rename(q.id, next)}
                          />
                        ) : (
                          <span className="flex flex-wrap items-center gap-2 text-sm">
                            {q.label}
                            <Badge variant="outline" className="border-dashed font-normal">
                              Agent follow-up
                            </Badge>
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{q.kind}</TableCell>
                      <TableCell className="text-xs">{q.required ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-xs">{q.defaultValue || '—'}</TableCell>
                      <TableCell className="max-w-[16rem] whitespace-normal text-xs">{q.condition}</TableCell>
                      <TableCell className="text-xs">{q.step}</TableCell>
                      <TableCell className="font-mono text-[11px]">{q.field}</TableCell>
                      <TableCell>
                        {q.origin === 'standard' ? (
                          <span className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move ${q.id} up`}
                              onClick={() => move(q.id, -1)}
                            >
                              <ArrowUp />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Move ${q.id} down`}
                              onClick={() => move(q.id, 1)}
                            >
                              <ArrowDown />
                            </Button>
                          </span>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>

          {withFollowUps ? (
            <div className="mt-3 rounded-lg border border-border border-dashed px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-sm">Where a follow-up comes from</p>
                <ProvenanceTag of="simulated" />
              </div>
              <p className="mt-1 text-muted-foreground text-xs">
                The engine has the mechanism — any answer whose id is not one of the six known ones travels as
                a line of <span className="font-mono">site.notes</span>, one per answer, into the copy prompt.
                It has no fixed list of follow-ups, so these two are written the way the agent should ask: one
                plain question, and the place the answer is used. What it must not do is show the customer
                slot codes.
              </p>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="preview">
          <Preview questions={all} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

/** The customer-facing form, working: two steps, real validation, real conditional display. */
function Preview({ questions }: { questions: readonly BriefQuestion[] }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [pages, setPages] = useState<string[]>([
    'home',
    'product',
    'service',
    'blog',
    'about',
    'pricing',
    'contact'
  ])
  const [tone, setTone] = useState('plain')
  const [contact, setContact] = useState('')
  const [showError, setShowError] = useState(false)

  const missing = [!name.trim() && 'name', !about.trim() && 'about'].filter(Boolean) as string[]
  const pageOptions = questions.find((q) => q.id === 'pages')?.options ?? []
  const toneOptions = questions.find((q) => q.id === 'tone')?.options ?? []
  const contactQuestion = questions.find((q) => q.id === 'contact')
  /** The conditional worth demonstrating: the follow-up only exists while the page does. */
  const askContact = contactQuestion && pages.includes('contact')

  return (
    <div className="flex flex-col gap-3">
      <Panel
        title={`Step ${step} of 2`}
        aside={
          <Badge variant="outline" className="border-dashed font-normal">
            Preview only · nothing is sent
          </Badge>
        }
      >
        <div className="flex max-w-2xl flex-col gap-4 px-4 py-4">
          {step === 1 ? (
            <>
              <Field label="Business name" required error={showError && !name.trim()}>
                <TextField
                  value={name}
                  placeholder="Claude Studio"
                  aria-label="Business name"
                  onValue={setName}
                />
              </Field>
              <Field label="One line about your business" required error={showError && !about.trim()}>
                <Textarea
                  value={about}
                  placeholder="What you do, for whom, and what makes you the right choice."
                  aria-label="One line about your business"
                  onChange={(e) => setAbout(e.target.value)}
                />
              </Field>
              <Field label="Pages">
                <div className="flex flex-wrap gap-2">
                  {pageOptions.map((o) => {
                    const on = pages.includes(o.value)
                    const locked = o.value === 'home'
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={locked}
                        aria-pressed={on}
                        onClick={() =>
                          setPages((prev) => (on ? prev.filter((p) => p !== o.value) : [...prev, o.value]))
                        }
                        className={cn(
                          'rounded-full border px-3 py-1 text-sm transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                          on
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border text-muted-foreground',
                          locked && 'cursor-not-allowed opacity-70'
                        )}
                      >
                        {o.label}
                        {locked ? <span className="sr-only"> — always on</span> : null}
                      </button>
                    )
                  })}
                </div>
              </Field>
            </>
          ) : (
            <>
              <Field label="Site language">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-pressed
                    className="rounded-full border border-primary bg-primary/10 px-3 py-1 text-sm"
                  >
                    English
                  </button>
                  <span className="text-muted-foreground text-xs">
                    The only option Joomla can act on today — the contract keeps the original menu and
                    language structure.
                  </span>
                </div>
              </Field>
              <Field label="Tone">
                <div className="flex flex-wrap gap-2">
                  {toneOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      aria-pressed={tone === o.value}
                      onClick={() => setTone(o.value)}
                      className={cn(
                        'rounded-full border px-3 py-1 text-sm transition-colors',
                        'focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1',
                        tone === o.value
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border text-muted-foreground'
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Field>
              {askContact ? (
                <Field label={contactQuestion.label} hint={contactQuestion.hint}>
                  <TextField value={contact} aria-label={contactQuestion.label} onValue={setContact} />
                </Field>
              ) : contactQuestion ? (
                <p className="text-muted-foreground text-xs">
                  The address question is not asked: the Contact page is switched off on step one.
                </p>
              ) : null}
            </>
          )}

          {showError && missing.length > 0 ? (
            <p className="flex items-center gap-2 text-destructive text-sm" role="alert">
              <AlertCircle className="size-4" aria-hidden />
              {MISSING}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {step === 2 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Back
              </Button>
            ) : null}
            {step === 1 ? (
              <Button
                size="sm"
                onClick={() => {
                  if (missing.length > 0) {
                    setShowError(true)
                    return
                  }
                  setShowError(false)
                  setStep(2)
                }}
              >
                Next
              </Button>
            ) : (
              <Button size="sm" disabled>
                Send answer
                <Badge variant="secondary" className="ms-1 font-normal">
                  Disabled in the preview
                </Badge>
              </Button>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="What the engine would receive">
        <pre className="overflow-auto px-4 py-3 font-mono text-xs leading-relaxed" tabIndex={0}>
          {JSON.stringify(
            {
              answers: { name, about, pages, languages: ['en'], tone, ...(contact ? { contact } : {}) },
              becomes: {
                'site.name': name || null,
                'site.about': about || null,
                'site.wanted': pages,
                'site.languages': ['en'],
                'site.tone': tone,
                ...(contact ? { 'site.contact': contact } : {})
              }
            },
            null,
            2
          )}
        </pre>
      </Panel>
    </div>
  )
}

function Field({
  label,
  hint,
  required,
  error,
  children
}: {
  label: string
  hint?: string
  required?: boolean
  error?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className={cn(error && 'text-destructive')}>
        {label}
        {required ? <span className="text-muted-foreground"> · required</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  )
}

/** EmDash: no questionnaire of its own, and the screen says what it would inherit if it had one. */
function NoQuestions() {
  return (
    <div className="flex w-full flex-col gap-4 px-6 py-6">
      <ScreenHead
        title="Site questions"
        sub="EmDash has no Build tab, so nothing asks these questions on its behalf."
      />
      <Empty className="rounded-xl border border-border border-dashed py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MessageSquareText />
          </EmptyMedia>
          <EmptyTitle>No questionnaire for EmDash</EmptyTitle>
          <EmptyDescription>
            The shared set exists and would apply unchanged — business name, one line about it, pages,
            language, tone. What is missing is a Build tab to ask them from, and a stage to hand the answers
            to.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
      <Panel title="What it would inherit">
        <ul className="divide-y divide-border">
          {STANDARD_QUESTIONS.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="font-medium text-sm">{q.label}</span>
              <Badge variant="secondary" className="font-mono font-normal">
                {q.kind}
              </Badge>
              <span className="ms-auto font-mono text-[11px] text-muted-foreground">{q.field}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}
