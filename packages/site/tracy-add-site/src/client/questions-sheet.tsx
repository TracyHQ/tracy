/**
 * Inline customization questions and their loading, failure and unavailable states.
 * Answers stay in the wizard while the customer moves between pages.
 */
import { Alert, AlertDescription, AlertTitle, Button } from '@tracy/ui'
import { Loader2, TriangleAlert } from 'lucide-react'
import { type JSX, useMemo, useState } from 'react'

import {
  type ASK_FORM_KEYS,
  AskForm,
  type AskFormTranslate,
  type RewriteFn
} from '../../../tracy-site-build-core/src/client/ask-form/AskForm'
import { fromTracy } from '../../../tracy-site-build-core/src/client/ask-form/model'
import { AddSitePage } from './add-site-page'
import { sheetRenderers } from './questions-sheet-kinds'
import { rewriteAbout } from './rewrite.mjs'
import { answersFromDraft, askDraftFrom, briefProgress, type PopupQuestion } from './site-brief.mjs'
import type { Translate } from './strings'

/** What the customer has answered so far, by question id, as typed; a logo is its upload ids by tile. */
export type SheetAnswers = Record<string, string | string[] | Record<string, string>>

/** The states shown before questions can be answered. */
export type QuestionsState = 'loading' | 'failed' | 'unwritable'

/** The ask form's words, read from this plugin's own keys (`ask.rewriteFailed` says which miss it was). */
const ASK_KEYS: Record<(typeof ASK_FORM_KEYS)[number], string> = {
  'ask.other': 'ask_other',
  'ask.otherPlaceholder': 'ask_other_placeholder',
  'ask.recommended': 'ask_recommended',
  'ask.rewrite': 'brief_rewrite',
  'ask.rewriting': 'brief_rewriting',
  'ask.rewriteUndo': 'brief_rewrite_undo',
  'ask.rewriteFailed': 'brief_rewrite_failed',
  'ask.languagePlaceholder': 'brief_language_placeholder'
}

/** The "Start with" chips of the business description, by string key: `start_<key>` and `start_<key>_text`. */
const STARTERS = ['make', 'who', 'where', 'different'] as const

/** "{count} answered · all optional" with the count in bold, in the person's language. */
function StatusLine({ t, answered, total }: { t: Translate; answered: number; total: number }): JSX.Element {
  const [before, after = ''] = t('sheet_status_line').split('{count}')
  return (
    <>
      {before}
      <b className="font-semibold text-foreground tabular-nums">
        {t('sheet_status_count', { answered, total })}
      </b>
      {after}
    </>
  )
}

/** What the sheet says when a rewrite does not come back, by the reason `rewriteAbout` gives. */
const REWRITE_MISS = {
  unavailable: 'brief_rewrite_unavailable',
  limit: 'brief_rewrite_limit',
  failed: 'brief_rewrite_failed'
} as const

/** A single inline recipe for each state, never a card that opens another view. */
export function QuestionsStatus({
  t,
  state,
  onRetry
}: {
  t: Translate
  state: QuestionsState
  onRetry: () => void
}): JSX.Element {
  if (state === 'loading')
    return (
      <div className="tas-questions-loading text-muted-foreground text-sm" role="status" aria-busy="true">
        <Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" />
        <span>{t('sheet_loading')}</span>
      </div>
    )
  if (state === 'failed')
    return (
      <Alert variant="destructive" className="tas-questions-alert">
        <AlertDescription className="tas-questions-failure">
          <span>{t('sheet_failed')}</span>
          <Button
            type="button"
            variant="link"
            className="h-auto border-transparent bg-transparent p-0"
            onClick={onRetry}
          >
            {t('sheet_retry')}
          </Button>
        </AlertDescription>
      </Alert>
    )
  return (
    <Alert className="tas-questions-alert tas-questions-warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>{t('sheet_unwritable')}</AlertTitle>
      <AlertDescription>{t('sheet_unwritable_detail')}</AlertDescription>
    </Alert>
  )
}

export interface QuestionsPageProps {
  t: Translate
  /** In the page's order (`sheetOrder`): Recommended first. */
  questions: PopupQuestion[]
  /** `one` when the template can only be built in one language: the language question then takes one. */
  oneLanguage?: boolean
  answers: SheetAnswers
  onAnswers: (next: SheetAnswers) => void
  /** A line about the answers a change of template kept or left behind; shown on the page, never on the card. */
  note?: string
  /** Done, Back to Add site or Escape. */
  onClose: () => void
  /**
   * The /ops preview of a release's questions (`CustomerQuestionsPreview.tsx` of `@tracy/harness-web`): the same page
   * filling the frame it is given, with no Back link, no focus grab and no Escape; nothing leaves the page: the AI
   * rewrite answers "unavailable" without calling its door and the logo and favicon tiles take no file. What it shows
   * is the caller's: pass no-op `onAnswers` and `onClose` to keep it read-only.
   */
  preview?: boolean
  /** Render question controls inside the stepped wizard. */
  inline?: boolean
}

/** The page itself; mounted only while open, so it starts at its top each time it opens. */
export function QuestionsPage({
  t,
  questions,
  oneLanguage = false,
  answers,
  onAnswers,
  note,
  onClose,
  preview = false,
  inline = false
}: QuestionsPageProps): JSX.Element {
  // One model per questionnaire: the ask form drops a rewrite that answers after its model changed. The description of
  // the business gets the "Start with" chips (U8), in the person's language.
  // Keyed by the words, not by `t`: a new model resets the form's rewrite state, so it must not change every drawing.
  const starterWords = JSON.stringify([
    inline
      ? [t('customize_name_placeholder'), t('customize_about_placeholder'), t('customize_tone_hint')]
      : null,
    t('start_with'),
    STARTERS.map((key) => [t(`start_${key}`), t(`start_${key}_text`)])
  ])
  const model = useMemo(() => {
    const form = fromTracy(questions, document.documentElement.lang || 'en', { oneLanguage })
    const about = new Set(questions.filter((q) => q.feeds?.includes('copy.about')).map((q) => q.id))
    const [wizardWords, label, chips] = JSON.parse(starterWords) as [
      string[] | null,
      string,
      [string, string][]
    ]
    const starters = { label, chips: chips.map(([chip, text]) => ({ label: chip, text })) }
    return {
      ...form,
      items: form.items.map((item) => {
        const question = questions.find((q) => q.id === item.id)
        const next = about.has(item.id) ? { ...item, starters } : { ...item }
        if (wizardWords) {
          return {
            ...next,
            placeholder:
              question?.placeholder ||
              question?.example ||
              (question?.feeds?.includes('site.name')
                ? wizardWords[0]
                : about.has(item.id)
                  ? wizardWords[1]
                  : undefined),
            ...(question?.feeds?.includes('copy.tone') ? { description: wizardWords[2] } : {})
          }
        }
        return next
      })
    }
  }, [questions, oneLanguage, starterWords])
  const draft = useMemo(() => askDraftFrom(questions, answers), [questions, answers])
  const [rewriteMiss, setRewriteMiss] = useState<keyof typeof REWRITE_MISS>('failed')

  const groupKeys: Record<string, string> = {
    'ask.groupBusiness': 'customize_group_business',
    'ask.groupBusinessNote': 'customize_group_business_note',
    'ask.groupLanguageTone': 'customize_group_language_tone',
    'ask.groupBrand': 'customize_group_brand',
    'ask.groupBrandNote': 'customize_group_brand_note',
    'ask.groupPages': 'customize_group_pages',
    'ask.groupMore': 'customize_group_more'
  }
  const askT: AskFormTranslate = (key, params) =>
    inline && key === 'ask.rewrite'
      ? t('customize_rewrite')
      : groupKeys[key]
        ? t(groupKeys[key], params)
        : key === 'ask.rewriteFailed'
          ? t(REWRITE_MISS[rewriteMiss])
          : t(ASK_KEYS[key as keyof typeof ASK_KEYS] ?? key, params)
  const rewrite: RewriteFn = async (text, hint) => {
    if (preview) {
      setRewriteMiss('unavailable')
      throw new Error('unavailable')
    }
    const outcome = await rewriteAbout(text, undefined, hint)
    if (outcome.ok) return outcome.text
    // Set before the form hears the miss, so the line it then shows names the right one.
    setRewriteMiss(outcome.reason)
    throw new Error(outcome.reason)
  }

  const { answered, total } = briefProgress(questions, answers)
  // The logo and favicon tiles show the business name as it is typed, as the site will until a logo is added.
  const nameQuestion = questions.find((q) => q.feeds?.includes('site.name'))
  const typedName = nameQuestion ? answers[nameQuestion.id] : undefined
  const renderers = sheetRenderers({
    t,
    questionOf: (id) => questions.find((q) => q.id === id),
    businessName: typeof typedName === 'string' ? typedName.trim() : '',
    oneLanguage,
    preview,
    wizard: inline
  })
  const form = (
    <>
      {inline && note ? (
        <p role="status" className="tas-page-note" data-questions-note="1">
          {note}
        </p>
      ) : null}
      <AskForm
        model={model}
        controlsOnly={inline}
        draft={draft}
        onDraft={(next) => onAnswers(answersFromDraft(questions, next))}
        actions={{ primary: { label: t('sheet_done'), onPress: onClose } }}
        status={<StatusLine t={t} answered={answered} total={total} />}
        recommendRequired
        rewrite={rewrite}
        variant={inline ? 'wizard' : 'sections'}
        renderers={renderers}
        t={askT}
      />
    </>
  )
  if (inline) return <div data-questions-page="1">{form}</div>
  return (
    <AddSitePage
      t={t}
      title={t('sheet_title')}
      desc={t('page_desc')}
      note={
        note ? (
          <p role="status" className="tas-page-note" data-questions-note="1">
            {note}
          </p>
        ) : null
      }
      onBack={onClose}
      preview={preview}
      marker="questions-page"
    >
      {form}
    </AddSitePage>
  )
}
