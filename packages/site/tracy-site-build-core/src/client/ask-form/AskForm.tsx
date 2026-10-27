/**
 * The ask form: a whole set of questions drawn at once from an `AskForm` (`model.ts`), whoever
 * asked them — the agent's `ask_user_question` in the right pane (`@tracy/dsh-ask-form`) or a
 * site's questionnaire. It owns no answers and sends nothing: the draft is the caller's
 * (`draft` / `onDraft`), and each button is the caller's (`actions`), so one drawing serves a
 * popup with Apply/Later and a pane with Send answer/Decide for me/Ask me follow-up questions.
 *
 * 🔒 NO WORDS OF ITS OWN. Every string reaches the screen through `t`; the caller's namespace must
 * carry the keys in `ASK_FORM_KEYS` (and `LanguageBox`'s `lang.*` keys when a `languages` item can
 * show). Button labels come in with `actions`.
 *
 * CSS: utilities on the no-preflight recipe of `DESIGN.md` §3; every plugin that bundles this file
 * scans `src/client/ask-form/` in its `@source` list.
 */
import { Button, Checkbox, cn, Input, RadioGroup, Textarea } from '@tracy/ui'
import { Loader2, Sparkles, Undo2 } from 'lucide-react'
import { type JSX, type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { LanguageBox } from '../LanguageBox'
import { languageLabel } from '../languages.mjs'
import { AskCards, entryAnswered } from './AskCards'
import { AskWizard, wizardGroup } from './AskWizard'
import {
  type AskDraft,
  type AskForm as AskFormModel,
  type AskItem,
  type AskOption,
  visibleItems
} from './model'
import { Chips, ChoiceOption, Field } from './primitives'

/** What `t` is handed: a key and, for counters, its values. */
export type AskFormTranslate = (key: string, params?: Record<string, string | number>) => string

/**
 * The keys this component reads through `t`; a caller's namespace must define every one.
 * - `ask.other` — the label of the typed answer beside a choice ("Other").
 * - `ask.otherPlaceholder` — the placeholder of that box.
 * - `ask.recommended` — the tag on the option the asker recommends, and on a required question when
 *   the caller passes `recommendRequired`.
 * - `ask.rewrite` / `ask.rewriting` / `ask.rewriteUndo` / `ask.rewriteFailed` — the AI rewrite of a
 *   long answer, when the caller passes `rewrite`.
 * - `ask.languagePlaceholder` — the language search box while nothing is picked.
 */
export const ASK_FORM_KEYS = [
  'ask.other',
  'ask.otherPlaceholder',
  'ask.recommended',
  'ask.rewrite',
  'ask.rewriting',
  'ask.rewriteUndo',
  'ask.rewriteFailed',
  'ask.languagePlaceholder'
] as const

/** A language list this short is drawn as chips; a longer one gets the search box (as the #859 popup does). */
const CHIPS_MAX = 8

/**
 * How the form is laid out. `list` (the default, and what `@tracy/dsh-ask-form` draws): every question open, one under
 * the other, each with its label. `cards`: one collapsible numbered card per question (`AskCards.tsx`, layout E1 of the
 * Customize your site sheet); the caller injects `ASK_CARDS_CSS`. `sections`: every question open for good, one under
 * the other with a hairline between them (the Customize your site page, Akemi 14/10/2026); the form does not scroll
 * itself but grows with its questions, and its footer sticks to the bottom of whatever scrolls it. The caller injects
 * `ASK_SECTIONS_CSS` after `ASK_CARDS_CSS`.
 */
export type AskFormVariant = 'list' | 'cards' | 'sections' | 'wizard'

/** What a kind's renderer is handed: the item, its draft entry, and the way to change it. */
export interface AskItemRenderProps {
  item: AskItem
  entry: Entry
  onEntry: (entry: Entry) => void
  /** The id of the element that names the item; the control says `aria-labelledby` it. */
  labelId: string
  busy: boolean
  t: AskFormTranslate
}

/**
 * A caller's own drawing of one kind of question (the logo and favicon tiles of the Customize your site sheet): the
 * control, and when the kind has an answer that is not a picked option or typed text, how to tell it was answered.
 * A kind with a renderer is drawn by it in every layout; the built-in kinds need none.
 */
export interface AskItemRenderer {
  render: (props: AskItemRenderProps) => ReactNode
  /** Optional content beside a wizard group's heading, such as the pages count and Keep all action. */
  heading?: (props: AskItemRenderProps) => ReactNode
  answered?: (entry: Entry | undefined) => boolean
}

/** Renderers by question kind. */
export type AskRenderers = Partial<Record<string, AskItemRenderer>>

export interface AskFormAction {
  label: string
  onPress: () => void
  disabled?: boolean
}

export interface AskFormProps {
  model: AskFormModel
  draft: AskDraft
  onDraft: (next: AskDraft) => void
  /**
   * `primary` is the filled button (full width in `cards`/`sections`, its own width in `list`), `secondary` an
   * outlined one, `tertiary` a link.
   */
  actions: { primary: AskFormAction; secondary?: AskFormAction; tertiary?: AskFormAction }
  /** A press is on its way: every button is locked and the primary one spins. */
  busy?: boolean
  /** Let an enclosing wizard supply its own sticky actions. */
  controlsOnly?: boolean
  /** Why the last press failed, shown above the buttons. */
  error?: string
  /**
   * When given, a long answer gets an AI rewrite button; the promise answers with the new text. It is asked
   * even for an empty box (the answer is then a sample). `again` is true when the text is exactly what the
   * last rewrite wrote and nothing was edited since.
   */
  rewrite?: RewriteFn
  /**
   * A question its set flags `required` wears the Recommended tag beside its label instead of being
   * demanded (the Add site sheet: no question blocks Create site, Akemi 07/10/2026).
   */
  recommendRequired?: boolean
  /** A line on the left of the footer (a count of answers); the primary button then sits beside it at its own width. */
  status?: ReactNode
  /** `list` (default) or `cards` (see `AskFormVariant`). */
  variant?: AskFormVariant
  /** `list` only: a line above the title saying who asks and why (the caller's words and mark). */
  lead?: ReactNode
  /** Drawings of kinds the form does not know itself, by kind (see `AskItemRenderer`). */
  renderers?: AskRenderers
  t: AskFormTranslate
}

type Entry = AskDraft[string]

const EMPTY: Entry = { selected: [] }

export function AskForm({
  model,
  draft,
  onDraft,
  actions,
  busy = false,
  controlsOnly = false,
  error,
  rewrite,
  recommendRequired = false,
  status,
  variant = 'list',
  lead,
  renderers,
  t
}: AskFormProps): JSX.Element {
  const formId = useId()
  // Read through a ref: a rewrite that answers later must not put back a draft from before it.
  const latest = useRef(draft)
  latest.current = draft
  const set = (id: string, entry: Entry) => onDraft({ ...latest.current, [id]: entry })
  /** The longest text typed so far: the language picker offers the language it detects in it. */
  const typed = Object.values(draft)
    .map((e) => e.custom ?? '')
    .reduce((a, b) => (b.length > a.length ? b : a), '')

  const submitFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter is the primary press, so the keyboard never has to leave the text box.
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      if (!busy && !actions.primary.disabled) actions.primary.onPress()
    }
  }

  const items = visibleItems(model, draft)
  if (variant === 'wizard') {
    return (
      <div data-ask-form={model.source} data-ask-variant="wizard">
        <AskWizard
          items={items}
          t={t}
          answered={(item) =>
            (renderers?.[item.kind]?.answered ?? entryAnswered)(draft[item.id] ?? undefined)
          }
          headingOf={(item) =>
            renderers?.[item.kind]?.heading?.({
              item,
              entry: draft[item.id] ?? EMPTY,
              onEntry: (entry) => set(item.id, entry),
              labelId: `${formId}-${item.id}-label`,
              busy,
              t
            })
          }
          renderItem={(item) => (
            <>
              {item.kind !== 'logo' && item.kind !== 'favicon' && item.id !== 'pages' ? (
                <div
                  className="tas-customize-label"
                  data-hint-inline={Boolean(
                    ['LanguageTone', 'Brand'].includes(wizardGroup(item)) ||
                      (item.description && item.description.length <= 54)
                  )}
                >
                  <label
                    className="ask-card-t"
                    id={`${formId}-${item.id}-label`}
                    htmlFor={`${formId}-${item.id}`}
                  >
                    {item.label}
                  </label>
                  {item.description ? (
                    <span className="ask-card-hint" title={item.description}>
                      {item.description}
                    </span>
                  ) : null}
                </div>
              ) : (
                <span id={`${formId}-${item.id}-label`} className="ask-card-t sr-only">
                  {item.label}
                </span>
              )}
              <div className="ask-card-p">
                <ItemControl
                  formKey={model}
                  name={`${formId}-${item.id}`}
                  item={item}
                  entry={draft[item.id] ?? EMPTY}
                  onEntry={(entry) => set(item.id, entry)}
                  typed={typed}
                  busy={busy}
                  rewrite={rewrite}
                  renderers={renderers}
                  onSubmitKey={submitFromKeyboard}
                  compact
                  wizard
                  t={t}
                />
              </div>
            </>
          )}
        />
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
      </div>
    )
  }
  const primaryButton = (
    <Button
      type="button"
      className={status === undefined && variant !== 'list' ? 'w-full' : 'shrink-0 px-5'}
      disabled={busy || actions.primary.disabled}
      onClick={actions.primary.onPress}
    >
      {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
      {actions.primary.label}
    </Button>
  )

  if (variant === 'list') {
    // The agent's questions in the right pane: one reading column, not the pane's full width, and the
    // buttons right under the last answer instead of pinned at the far bottom (Akemi, 21/10/2026).
    return (
      <div
        data-ask-body="1"
        className="h-full min-h-0 overflow-y-auto px-6"
        data-ask-form={model.source}
        data-ask-variant={variant}
      >
        <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6 pt-8">
          {lead || model.title || model.intro ? (
            <div className="flex flex-col gap-1.5">
              {lead ? <div className="text-[13px] text-muted-foreground">{lead}</div> : null}
              {model.title ? (
                <h2 className="m-0 font-semibold text-[19px] leading-snug">{model.title}</h2>
              ) : null}
              {model.intro ? (
                <p className="m-0 text-[13.5px] text-muted-foreground leading-snug">{model.intro}</p>
              ) : null}
            </div>
          ) : null}
          {items.map((item) => (
            <AskItemField
              key={item.id}
              formKey={model}
              name={`${formId}-${item.id}`}
              item={item}
              entry={draft[item.id] ?? EMPTY}
              onEntry={(entry) => set(item.id, entry)}
              recommended={recommendRequired && item.required === true}
              typed={typed}
              busy={busy}
              rewrite={rewrite}
              renderers={renderers}
              onSubmitKey={submitFromKeyboard}
              t={t}
            />
          ))}
          {/* In the flow, right under the last answer: no tinted bar of its own on the pane's colour. */}
          <div data-ask-foot="1" className="flex flex-col gap-2 pb-8">
            {error ? (
              <p role="alert" className="m-0 text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              {primaryButton}
              {actions.secondary ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || actions.secondary.disabled}
                  onClick={actions.secondary.onPress}
                >
                  {actions.secondary.label}
                </Button>
              ) : null}
              {actions.tertiary ? (
                <Button
                  type="button"
                  variant="link"
                  // No UA button fill: without Tailwind's preflight a link button keeps the browser grey.
                  className="ml-auto border-transparent bg-transparent px-0 text-muted-foreground"
                  disabled={busy || actions.tertiary.disabled}
                  onClick={actions.tertiary.onPress}
                >
                  {actions.tertiary.label}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const grows = variant === 'sections'
  return (
    <div
      className={grows ? 'flex flex-col' : 'flex h-full min-h-0 flex-col'}
      data-ask-form={model.source}
      data-ask-variant={variant}
    >
      {model.title || model.intro ? (
        <div className="flex flex-col gap-1 px-5 pt-5 pb-3">
          {model.title ? (
            <h2 className="m-0 font-semibold text-[15px] leading-tight">{model.title}</h2>
          ) : null}
          {model.intro ? (
            <p className="m-0 text-[13px] text-muted-foreground leading-snug">{model.intro}</p>
          ) : null}
        </div>
      ) : null}

      {/* Only this part scrolls: a long set never pushes the buttons out of sight. */}
      <div
        data-ask-body="1"
        data-ask-layout={variant}
        className={grows ? 'flex flex-col' : 'flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pt-4 pb-5'}
      >
        <AskCards
          collapsible={!grows}
          items={items}
          labelIdOf={(item) => `${formId}-${item.id}-label`}
          answered={(item) =>
            (renderers?.[item.kind]?.answered ?? entryAnswered)(draft[item.id] ?? undefined)
          }
          tagOf={(item) => (recommendRequired && item.required === true ? <RecommendedTag t={t} /> : null)}
          renderControl={(item) => (
            <ItemControl
              formKey={model}
              name={`${formId}-${item.id}`}
              item={item}
              entry={draft[item.id] ?? EMPTY}
              onEntry={(entry) => set(item.id, entry)}
              typed={typed}
              busy={busy}
              rewrite={rewrite}
              renderers={renderers}
              onSubmitKey={submitFromKeyboard}
              compact
              t={t}
            />
          )}
        />
      </div>

      {controlsOnly ? null : (
        <div
          data-ask-foot="1"
          className={cn(
            'flex shrink-0 flex-col gap-2 border-border border-t',
            // The cards layout's footer is the sheet's own: no tint, the sheet's 16px gutters. The sections layout's
            // footer is placed by ASK_SECTIONS_CSS (sticky, the page's own gutters).
            variant === 'cards' ? 'px-4 py-3' : ''
          )}
        >
          {error ? (
            <p role="alert" className="m-0 text-destructive text-sm">
              {error}
            </p>
          ) : null}
          {status === undefined ? (
            primaryButton
          ) : (
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 text-muted-foreground text-xs" data-ask-status="1">
                {status}
              </span>
              {primaryButton}
            </div>
          )}
          {actions.secondary || actions.tertiary ? (
            <div className="flex items-center justify-between gap-2">
              {actions.secondary ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || actions.secondary.disabled}
                  onClick={actions.secondary.onPress}
                >
                  {actions.secondary.label}
                </Button>
              ) : (
                <span />
              )}
              {actions.tertiary ? (
                <Button
                  type="button"
                  variant="link"
                  // No UA button fill: without Tailwind's preflight a link button keeps the browser grey.
                  className="border-transparent bg-transparent px-0"
                  disabled={busy || actions.tertiary.disabled}
                  onClick={actions.tertiary.onPress}
                >
                  {actions.tertiary.label}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

/** The small Recommended pill: on an option the asker recommends, or beside a required question's label. */
function RecommendedTag({ t }: { t: AskFormTranslate }): JSX.Element {
  return (
    <span
      data-recommended="1"
      className="rounded-full bg-primary/10 px-1.5 py-px font-medium text-[11px] text-primary"
    >
      {t('ask.recommended')}
    </span>
  )
}

/** One option's words, with the Recommended tag only when the asker declared it. */
function optionTitle(option: AskOption, t: AskFormTranslate): ReactNode {
  if (option.recommended !== true) return option.label
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {option.label}
      <RecommendedTag t={t} />
    </span>
  )
}

/** What the AI rewrite is told besides the text: the question being answered, and whether this is a second press. */
export type RewriteFn = (text: string, hint: { question: string; again: boolean }) => Promise<string>

/** What drawing one item takes, in either layout. */
interface ItemProps {
  /** The form this item belongs to: a rewrite that answers after the form changed is dropped. */
  formKey: AskFormModel
  name: string
  item: AskItem
  entry: Entry
  onEntry: (entry: Entry) => void
  typed: string
  busy: boolean
  rewrite?: RewriteFn
  renderers?: AskRenderers
  onSubmitKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  /** The cards layout: a long answer is a three-line box (the list layout keeps its four). */
  compact?: boolean
  /** The full-page wizard has a textarea with its actions inside its bottom strip. */
  wizard?: boolean
  t: AskFormTranslate
}

/** One item in the list layout: its label (and Recommended tag) above its hint and control. */
function AskItemField(props: ItemProps & { recommended: boolean }): JSX.Element {
  const { item, recommended, t } = props
  const labelId = `${props.name}-label`
  return (
    <div data-ask-item={item.id}>
      <Field
        label={
          <>
            <span id={labelId}>{item.label}</span>
            {recommended ? <RecommendedTag t={t} /> : null}
          </>
        }
      >
        {item.description ? <p className="m-0 text-muted-foreground text-xs">{item.description}</p> : null}
        <ItemControl {...props} />
      </Field>
    </div>
  )
}

/**
 * The control of one item, and its "Other" box when it takes one — named by the element `<name>-label`, which the
 * layout draws (the label of the list, the title of a card). A kind with a renderer is the renderer's to draw.
 */
function ItemControl({
  formKey,
  name,
  item,
  entry,
  onEntry,
  typed,
  busy,
  rewrite,
  renderers,
  onSubmitKey,
  compact = false,
  wizard = false,
  t
}: ItemProps): JSX.Element | null {
  const labelId = `${name}-label`
  const options = item.options ?? []
  const text = entry.custom ?? ''

  const own = renderers?.[item.kind]
  if (own) return <>{own.render({ item, entry, onEntry, labelId, busy, t })}</>

  let control: ReactNode
  if (item.kind === 'choice') {
    control = (
      <RadioGroup
        name={name}
        aria-labelledby={labelId}
        className="gap-2"
        value={entry.selected[0] ?? null}
        disabled={busy}
        // A picked option replaces a typed answer: a single choice sends one or the other.
        onValueChange={(value) => onEntry({ selected: [String(value)] })}
      >
        {options.map((option) => (
          <ChoiceOption
            key={option.value}
            value={option.value}
            selected={entry.selected[0] === option.value}
            title={optionTitle(option, t)}
            description={option.description}
          />
        ))}
      </RadioGroup>
    )
  } else if (item.kind === 'multi') {
    control = (
      <div role="group" aria-labelledby={labelId} className="flex flex-col gap-2">
        {options.map((option) => {
          const on = entry.selected.includes(option.value)
          return (
            <label
              key={option.value}
              data-selected={on ? '1' : '0'}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2.5 text-card-foreground',
                on ? 'border-primary' : 'border-border'
              )}
            >
              <Checkbox
                name={name}
                value={option.value}
                checked={on}
                disabled={busy}
                className="mt-0.5"
                onCheckedChange={(checked) =>
                  onEntry({
                    ...entry,
                    selected: checked
                      ? [...entry.selected, option.value]
                      : entry.selected.filter((v) => v !== option.value)
                  })
                }
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-medium text-sm">{optionTitle(option, t)}</span>
                {option.description ? (
                  <span className="mt-0.5 text-muted-foreground text-xs">{option.description}</span>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
    )
  } else if (item.kind === 'languages') {
    const onLanguages = (next: string[]) => onEntry({ selected: item.oneLanguage ? next.slice(-1) : next })
    control =
      options.length <= CHIPS_MAX ? (
        <div role="group" aria-labelledby={labelId}>
          <Chips
            items={options.map((o) => [o.value, languageLabel(o.value)])}
            on={entry.selected}
            onToggle={(code) =>
              onLanguages(
                entry.selected.includes(code)
                  ? entry.selected.filter((c) => c !== code)
                  : [...entry.selected, code]
              )
            }
          />
        </div>
      ) : (
        <LanguageBox
          typed={typed}
          picked={entry.selected}
          allowedLanguages={options.map((o) => o.value)}
          single={item.oneLanguage === true}
          placeholder={entry.selected.length === 0 ? t('ask.languagePlaceholder') : undefined}
          onChange={onLanguages}
          t={t}
        />
      )
  } else if (item.kind === 'longtext') {
    control = (
      <LongText
        formKey={formKey}
        id={name}
        labelId={labelId}
        text={text}
        maxLength={item.maxLength}
        busy={busy}
        rewrite={rewrite}
        question={item.label}
        placeholder={wizard ? item.placeholder : undefined}
        starters={item.starters}
        rows={compact ? 3 : 4}
        wizard={wizard}
        onText={(next) => onEntry({ selected: [], custom: next })}
        onSubmitKey={onSubmitKey}
        t={t}
      />
    )
  } else if (item.kind === 'text') {
    control = (
      <Input
        id={name}
        aria-labelledby={labelId}
        value={text}
        placeholder={wizard ? item.placeholder : undefined}
        maxLength={item.maxLength}
        disabled={busy}
        className="box-border w-full min-w-0 text-[13px]"
        onChange={(event) => onEntry({ selected: [], custom: event.target.value })}
      />
    )
  } else {
    // A kind this form cannot draw and no renderer was given for: nothing, rather than a text box that would send a
    // typed word where the question expects something else (a file id).
    return null
  }

  return (
    <>
      {control}
      {item.allowOther ? (
        <Input
          aria-label={t('ask.other')}
          placeholder={t('ask.otherPlaceholder')}
          value={text}
          disabled={busy}
          className="box-border w-full min-w-0 text-[13px]"
          onChange={(event) => {
            const custom = event.target.value
            // In a single choice a typed answer replaces the picked option, as dsh's own card does.
            onEntry(
              item.kind === 'choice' && custom !== ''
                ? { selected: [], custom }
                : { selected: entry.selected, custom }
            )
          }}
        />
      ) : null}
    </>
  )
}

/**
 * A long answer, with its counter and — when the caller can — an AI rewrite that keeps the
 * customer's own text for Undo. A rewrite that answers after the text was edited, or after the
 * form changed, is dropped: it would overwrite words the customer typed after asking.
 */
function LongText({
  formKey,
  id,
  labelId,
  text,
  maxLength,
  busy,
  rewrite,
  question,
  placeholder,
  starters,
  rows,
  wizard = false,
  onText,
  onSubmitKey,
  t
}: {
  formKey: AskFormModel
  id: string
  labelId: string
  text: string
  maxLength?: number
  busy: boolean
  rewrite?: RewriteFn
  /** The question this box answers, told to the rewrite. */
  question: string
  placeholder?: string
  starters?: AskItem['starters']
  /** Lines of text the box shows: 4 in the list layout, 3 in the cards layout. */
  rows: number
  wizard?: boolean
  onText: (next: string) => void
  onSubmitKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void
  t: AskFormTranslate
}): JSX.Element {
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [original, setOriginal] = useState<string | null>(null)
  /** What the last rewrite wrote; a press on exactly this text is a second press (`again`). */
  const written = useRef<string | null>(null)
  /** The text as it is now, read by a rewrite that answers later. */
  const current = useRef(text)
  current.current = text
  /** Bumped when the form changes or the field unmounts: a late answer finds a different number. */
  const generation = useRef(0)
  // Runs when the form's identity changes: a new request resets the rewrite state.
  useEffect(() => {
    generation.current += 1
    setPending(false)
    setFailed(false)
    setOriginal(null)
    written.current = null
    return () => {
      generation.current += 1
    }
  }, [formKey])

  const start = () => {
    if (!rewrite) return
    const sent = text
    const again = written.current !== null && sent === written.current
    const mine = generation.current
    setPending(true)
    setFailed(false)
    rewrite(sent, { question, again }).then(
      (next) => {
        if (generation.current !== mine) return
        setPending(false)
        if (current.current !== sent) return
        const out = maxLength === undefined ? next : next.slice(0, maxLength)
        written.current = out
        // A second press keeps the customer's own words for Undo, not the first rewrite.
        setOriginal((kept) => (again && kept !== null ? kept : sent))
        onText(out)
      },
      () => {
        if (generation.current !== mine) return
        setPending(false)
        setFailed(true)
      }
    )
  }

  const box = useRef<HTMLTextAreaElement>(null)
  /** Set by a starter chip: once its words are drawn, the box takes focus with the caret at the end. */
  const caretToEnd = useRef(false)
  useEffect(() => {
    if (!caretToEnd.current) return
    caretToEnd.current = false
    box.current?.focus()
    box.current?.setSelectionRange(text.length, text.length)
  }, [text])
  /** A starter chip: the words go after what is there (a sentence ended, or ended here), and the caret to the end. */
  const insert = (words: string) => {
    const before = text.replace(/\s+$/, '')
    const joined = before === '' ? words : `${before}${/[.!?。！？]$/.test(before) ? ' ' : '. '}${words}`
    setOriginal(null)
    caretToEnd.current = true
    onText(maxLength === undefined ? joined : joined.slice(0, maxLength))
  }

  return (
    <div className="flex flex-col gap-1.5" data-wizard-long={wizard ? '1' : undefined}>
      {!wizard && starters && starters.chips.length > 0 ? (
        <div className="ask-start" data-ask-starters="1">
          <span>{starters.label}</span>
          {starters.chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              className="ask-start-chip"
              disabled={busy || pending}
              onClick={() => insert(chip.text)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={wizard ? 'tas-customize-textarea' : 'flex flex-col gap-1.5'}>
        <Textarea
          ref={box}
          id={id}
          aria-labelledby={labelId}
          rows={rows}
          maxLength={maxLength}
          value={text}
          placeholder={placeholder}
          disabled={busy}
          data-ask-long={rows}
          className={cn(
            'box-border w-full min-w-0 resize-none text-[13px] leading-snug',
            rows === 4 ? 'min-h-[116px]' : null
          )}
          onChange={(event) => {
            setOriginal(null)
            onText(event.target.value)
          }}
          onKeyDown={onSubmitKey}
        />
        <div
          className={wizard ? 'tas-customize-textarea-foot' : 'flex items-center gap-2 text-xs'}
          data-ask-starters={wizard && starters ? '1' : undefined}
        >
          {wizard && starters
            ? starters.chips.map((chip) => (
                <Button
                  key={chip.label}
                  type="button"
                  variant="outline"
                  size="xs"
                  className="tas-customize-starter"
                  disabled={busy || pending}
                  onClick={() => insert(chip.text)}
                >
                  {chip.label}
                </Button>
              ))
            : null}
          {rewrite ? (
            <>
              <Button
                type="button"
                size="sm"
                variant={wizard ? 'link' : 'ghost'}
                className={
                  wizard
                    ? 'tas-customize-rewrite'
                    : 'h-7 gap-1 border-transparent bg-transparent px-2 text-muted-foreground'
                }
                disabled={busy || pending}
                onClick={start}
              >
                {pending ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles size={13} aria-hidden="true" />
                )}
                {pending ? t('ask.rewriting') : t('ask.rewrite')}
              </Button>
              {original !== null ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 gap-1 border-transparent bg-transparent px-2 text-muted-foreground"
                  disabled={busy || pending}
                  onClick={() => {
                    onText(original)
                    setOriginal(null)
                    written.current = null
                  }}
                >
                  <Undo2 size={13} aria-hidden="true" />
                  {t('ask.rewriteUndo')}
                </Button>
              ) : null}
            </>
          ) : null}
          {!wizard && failed ? (
            <span role="status" className="text-destructive">
              {t('ask.rewriteFailed')}
            </span>
          ) : null}
          {!wizard && maxLength !== undefined && text.length > 0 ? (
            <span className="ml-auto shrink-0 text-muted-foreground tabular-nums">
              {text.length}/{maxLength}
            </span>
          ) : null}
        </div>
      </div>
      {wizard && failed ? (
        <span role="status" className="text-destructive text-xs">
          {t('ask.rewriteFailed')}
        </span>
      ) : null}
      {wizard && maxLength !== undefined && text.length > 0 ? (
        <span className="self-end text-muted-foreground text-xs tabular-nums">
          {text.length}/{maxLength}
        </span>
      ) : null}
    </div>
  )
}
