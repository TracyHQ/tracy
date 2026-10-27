/**
 * The ask form as DATA: one shape for every set of questions a customer answers at once, whoever
 * asked them — the agent in chat (`ask_user_question` of dsh) or a site's own questionnaire
 * (`tracy-questions`, the "Tell Tracy about your site" popup). The form draws an `AskForm`; each
 * source has one reader into it (`fromDsh`, `fromTracy`) and one writer out of it (`toDshAnswer`,
 * `toTracyAnswers`), so the drawing never needs to know who is asking.
 *
 * Pure on purpose: no React, no DOM, nothing from dsh at run time — `node --test` runs it as is.
 *
 * 🔒 A VALUE IS WHAT ITS SOURCE READS BACK. A dsh option's value is its label, byte for byte
 * (the "(Recommended)" suffix included): dsh matches an answer by label. A Tracy option's value is
 * its id; the label is only for display.
 *
 * 🔒 NOTHING IS CHOSEN FOR THE CUSTOMER UNLESS THEY ASK FOR IT. `submit` sends exactly what is on
 * screen — never the first option of an untouched question. Only `decide` ("Decide for me") fills
 * an unanswered question, and only with the option its asker recommended; a question with no
 * recommendation stays empty, and `action: 'decide'` tells the agent those are its to settle.
 */

import { visibleQuestions } from '../../questions.mjs'
import type { Question } from '../api'

/**
 * One question of an `ask_user_question` request, as much of it as the form reads. Declared here,
 * NOT imported from `@deepseek-ai/dsh-user-questions`: this is a source library bundled into
 * plugins that do not depend on dsh packages (same reason as `../../host/types.ts`). Mirrors
 * `AskUserQuestionItem` (`user-questions/src/types.ts`); `recommended` is the label of the option
 * the asker would pick itself (fork `-tracy.19`), absent from older requests.
 */
export interface DshQuestionItem {
  id: string
  question: string
  detail?: string
  header?: string
  options?: { label: string; description?: string }[]
  multiSelect?: boolean
  recommended?: string
}

/** What dsh's `pending.answer()` takes (`AskUserQuestionAnswer`); a missing `action` means `submit`. */
export interface DshAnswer {
  answers: { id: string; selected: string[]; custom?: string }[]
  action?: 'decide' | 'follow_up'
}

export interface AskOption {
  /** What the source reads back: a dsh option's label as sent, a Tracy option's id. */
  value: string
  /** What the customer reads. */
  label: string
  description?: string
  recommended?: boolean
}

/**
 * `logo` and `favicon` (07/10/2026) are file questions: the form draws them only through a caller's renderer
 * (`AskRenderers` of `AskForm.tsx`), never by itself.
 */
export type AskKind = 'choice' | 'multi' | 'text' | 'longtext' | 'languages' | 'logo' | 'favicon'

export interface AskItem {
  id: string
  label: string
  description?: string
  /** Example text supplied by the wizard caller. */
  placeholder?: string
  kind: AskKind
  options?: AskOption[]
  /** Whether a choice question also takes a typed answer ("Other"). */
  allowOther: boolean
  maxLength?: number
  required?: boolean
  /** `tracy-questions/v2`: shown only when every clause holds on an earlier answer. */
  showWhen?: { all: { question: string; is?: string; has?: string }[] }
  /** `languages` only: the site can be built in one language, so one is picked. */
  oneLanguage?: boolean
  /**
   * `longtext` only: chips above the box that start the answer ("Start with: What you make" inserts "We make "). Given
   * by the caller, in the person's language; `label` is the word before the chips.
   */
  starters?: { label: string; chips: { label: string; text: string }[] }
}

export interface AskForm {
  source: 'dsh' | 'tracy'
  title: string
  intro?: string
  items: AskItem[]
}

/**
 * What the customer has entered so far, by item id. `selected` holds option values; `custom` holds
 * the "Other" text of a choice, or the whole answer of a `text`/`longtext` item.
 */
export type AskDraft = Record<string, { selected: string[]; custom?: string }>

export type DshAnswerMode = 'submit' | 'decide' | 'follow_up'

/**
 * The longest answers a Tracy questionnaire takes. The same numbers as `LONGTEXT_MAX`/`TEXT_MAX`
 * in `tracy-add-site/src/client/site-brief.mjs` (and the server's `lib/site-brief.js`), declared
 * again because this library must not import from a plugin; change all three together.
 */
export const LONGTEXT_MAX = 300
export const TEXT_MAX = 200

/** The "(Recommended)" suffix dsh's own composer reads (`parseRecommendedLabel`), English and Chinese. */
const RECOMMENDED_SUFFIX = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i

/**
 * Which option label the asker recommends: the explicit `recommended` when it names an option,
 * else the first label carrying the "(Recommended)" suffix, else none.
 */
function recommendedLabel(item: DshQuestionItem): string | undefined {
  const labels = (item.options ?? []).map((o) => o.label)
  if (item.recommended !== undefined && labels.includes(item.recommended)) return item.recommended
  return labels.find((label) => RECOMMENDED_SUFFIX.test(label))
}

/** The questions of one `ask_user_question` request as a form. The first item's `header` titles it. */
export function fromDsh(items: readonly DshQuestionItem[]): AskForm {
  return {
    source: 'dsh',
    title: items.find((i) => i.header)?.header ?? '',
    items: items.map((item) => {
      const options = item.options ?? []
      const recommended = recommendedLabel(item)
      const out: AskItem = {
        id: item.id,
        label: item.question,
        kind: options.length === 0 ? 'longtext' : item.multiSelect ? 'multi' : 'choice',
        allowOther: options.length > 0
      }
      if (item.detail) out.description = item.detail
      if (options.length > 0)
        out.options = options.map((o) => {
          const option: AskOption = { value: o.label, label: o.label.replace(RECOMMENDED_SUFFIX, '') }
          if (o.description) option.description = o.description
          if (o.label === recommended) option.recommended = true
          return option
        })
      return out
    })
  }
}

/**
 * A site's questionnaire (labels already in `lang`, as `GET /api/sites/questions` serves them) as a
 * form. `lang` is carried for symmetry with the server's reader; the labels arrive translated.
 */
export function fromTracy(
  questions: readonly Question[],
  _lang: string,
  { oneLanguage = false }: { oneLanguage?: boolean } = {}
): AskForm {
  return {
    source: 'tracy',
    title: '',
    items: questions.map((q) => {
      const out: AskItem = { id: q.id, label: q.label, kind: q.kind, allowOther: false }
      if (q.hint) out.description = q.hint
      if (q.options) out.options = q.options.map((id) => ({ value: id, label: q.optionLabels?.[id] ?? id }))
      if (q.kind === 'text') out.maxLength = TEXT_MAX
      if (q.kind === 'longtext') out.maxLength = LONGTEXT_MAX
      if (q.kind === 'languages') out.oneLanguage = oneLanguage
      if (q.required !== undefined) out.required = q.required
      if (q.showWhen) out.showWhen = structuredClone(q.showWhen)
      return out
    })
  }
}

/** One item's draft as a Tracy answer — before trimming, so a condition reads what is on screen. */
function tracyValue(item: AskItem, entry: AskDraft[string] | undefined): string | string[] | undefined {
  if (!entry) return undefined
  if (item.kind === 'text' || item.kind === 'longtext') return entry.custom
  if (item.kind === 'choice') return entry.selected[0]
  return entry.selected
}

function rawTracyAnswers(form: AskForm, draft: AskDraft): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const item of form.items) {
    const value = tracyValue(item, draft[item.id])
    if (value !== undefined) out[item.id] = value
  }
  return out
}

/**
 * The items the customer is asked now, in order. A dsh request has no conditions; a Tracy set is
 * read by the questionnaire's own evaluator (`visibleQuestions`), the one the server judges with.
 */
export function visibleItems(form: AskForm, draft: AskDraft): AskItem[] {
  if (form.source === 'dsh') return form.items
  return visibleQuestions(form.items, rawTracyAnswers(form, draft))
}

/**
 * The answer `pending.answer()` takes. Items a condition hides are not sent.
 * - `submit`: what is on screen, nothing added.
 * - `decide`: what is on screen, plus the recommended option of each unanswered item that has one;
 *   the rest stay empty for the agent to settle.
 * - `follow_up`: what is on screen; the agent asks again before deciding.
 * A single choice answered with "Other" sends the text alone (`selected: []`), as dsh's own composer
 * does; a multi sends both.
 */
export function toDshAnswer(form: AskForm, draft: AskDraft, mode: DshAnswerMode): DshAnswer {
  const answers = visibleItems(form, draft).map((item) => {
    const entry = draft[item.id]
    const custom = entry?.custom?.trim() ? entry.custom.trim() : undefined
    let selected = (entry?.selected ?? []).filter((v) => item.options?.some((o) => o.value === v) ?? false)
    if (item.kind === 'choice' && custom !== undefined) selected = []
    if (item.kind === 'choice') selected = selected.slice(0, 1)
    if (mode === 'decide' && selected.length === 0 && custom === undefined) {
      const recommended = item.options?.find((o) => o.recommended)
      if (recommended) selected = [recommended.value]
    }
    return custom === undefined ? { id: item.id, selected } : { id: item.id, selected, custom }
  })
  return mode === 'submit' ? { answers } : { answers, action: mode }
}

/**
 * The answers of a Tracy questionnaire by question id — the shape `toBrief` of the popup takes
 * (`Record<string, string | string[]>`): a choice is its option id, a multi or languages a list,
 * text trimmed and cut to its box. Hidden and empty answers are left out.
 */
export function toTracyAnswers(form: AskForm, draft: AskDraft): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const item of visibleItems(form, draft)) {
    const value = tracyValue(item, draft[item.id])
    if (typeof value === 'string') {
      const text = item.kind === 'choice' ? value : value.trim().slice(0, item.maxLength ?? TEXT_MAX)
      if (text !== '') out[item.id] = text
    } else if (Array.isArray(value)) {
      const list = value.filter((v) => v !== '')
      if (list.length > 0)
        out[item.id] = item.kind === 'languages' && item.oneLanguage ? list.slice(0, 1) : list
    }
  }
  return out
}
