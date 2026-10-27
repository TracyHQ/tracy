/**
 * The sheet's own drawings of the kinds the shared ask form does not know (`AskRenderers` of `AskForm.tsx`).
 *
 * 🔒 ONE LIST FOR "WHAT THE SHEET CAN ASK". `SHEET_KINDS` (in `site-brief.mjs`, so `node --test` reads it) keeps a served
 * question only when its kind is drawable; a question the sheet cannot draw is not counted and not asked, rather than
 * shown as an empty card. A new kind is added in both places at once: its renderer here, its name there.
 *
 * The renderers are made per drawing (`sheetRenderers`): the logo and favicon tiles show the business name as it is
 * being typed, and read the served question (its logo `variants`) that the form's own item does not carry.
 */

import { Button, Checkbox, ToggleGroup, ToggleGroupItem } from '@tracy/ui'
import type { AskRenderers } from '../../../tracy-site-build-core/src/client/ask-form/AskForm'
import { FaviconField, LogoField } from './brand-tiles'
import { LanguageSelect } from './language-select'
import { AllPagesKept, ChoiceChips, MultiChips } from './sheet-chips'
import { isPagesQuestion, type PopupQuestion } from './site-brief.mjs'
import type { Translate } from './strings'

/** The tone options this plugin has a description for (`tone_desc_<value>` in `strings.ts`). */
const TONE_WORDS = new Set(['plain', 'warm', 'bold'])

/** A logo or favicon entry of the ask form's draft (`tile:id` items, `askDraftFrom`) back as ids by tile. */
function tilesOf(selected: string[], kind: 'logo' | 'favicon'): Record<string, string> {
  if (kind === 'favicon') return selected[0] ? { favicon: selected[0] } : {}
  const out: Record<string, string> = {}
  for (const item of selected) {
    const at = item.indexOf(':')
    if (at > 0) out[item.slice(0, at)] = item.slice(at + 1)
  }
  return out
}

/** Ids by tile as a draft entry again. */
function entryOf(tiles: Record<string, string>, kind: 'logo' | 'favicon') {
  if (kind === 'favicon') return { selected: tiles.favicon ? [tiles.favicon] : [] }
  return { selected: Object.entries(tiles).map(([tile, id]) => `${tile}:${id}`) }
}

export interface SheetRenderContext {
  t: Translate
  /** The served question behind an item, by id. */
  questionOf: (id: string) => PopupQuestion | undefined
  /** The business name as typed so far, trimmed; '' when none. */
  businessName: string
  /** The site is built in one language (`languages: 'one'`, every template this round): the language is a select. */
  oneLanguage: boolean
  /** The /ops preview (`QuestionsSheet` `preview`): the logo and favicon tiles take no file. */
  preview?: boolean
  /** Compact controls for the stepped full-page wizard only. */
  wizard?: boolean
}

/** The renderers of the sheet's own kinds, for one drawing. */
export function sheetRenderers({
  t,
  questionOf,
  businessName,
  oneLanguage,
  preview = false,
  wizard = false
}: SheetRenderContext): AskRenderers {
  const renderers: AskRenderers = {
    choice: {
      render: (props) => {
        // The tone question's options say in a few words how each one sounds (Akemi 14/10/2026); the words are this
        // plugin's strings, by option value, since the questionnaire serves only the option's name.
        const tone = questionOf(props.item.id)?.feeds?.includes('copy.tone') === true
        if (wizard && tone)
          return (
            <ToggleGroup
              className="tas-customize-tone"
              aria-labelledby={props.labelId}
              value={props.entry.selected}
              disabled={props.busy}
              onValueChange={(selected) => props.onEntry({ selected: selected.map(String) })}
            >
              {(props.item.options ?? []).map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  title={
                    option.description ??
                    (TONE_WORDS.has(option.value) ? t(`tone_desc_${option.value}`) : undefined)
                  }
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )
        return (
          <ChoiceChips
            {...props}
            describe={
              tone ? (value) => (TONE_WORDS.has(value) ? t(`tone_desc_${value}`) : undefined) : undefined
            }
          />
        )
      }
    },
    multi: {
      heading: wizard
        ? (props) => {
            const question = questionOf(props.item.id)
            if (!isPagesQuestion(question)) return null
            const options = props.item.options ?? []
            if (options.length === 0) return null
            const selected =
              props.entry.selected.length === 0 ? options.map((o) => o.value) : props.entry.selected
            const locked = question?.locked ?? []
            const kept = options.filter((o) => selected.includes(o.value) || locked.includes(o.value)).length
            return (
              <div className="tas-customize-pages-heading" key={props.item.id}>
                <span>{t('customize_pages_kept', { kept, total: options.length })}</span>
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  disabled={props.busy}
                  onClick={() => props.onEntry({ selected: options.map((o) => o.value) })}
                >
                  {t('customize_keep_all')}
                </Button>
              </div>
            )
          }
        : undefined,
      render: (props) => {
        const question = questionOf(props.item.id)
        const pages = isPagesQuestion(question)
        if (pages && (props.item.options ?? []).length === 0) return <AllPagesKept t={t} />
        if (wizard && pages) {
          const options = props.item.options ?? []
          const ticked =
            props.entry.selected.length === 0 ? options.map((o) => o.value) : props.entry.selected
          const locked = question?.locked ?? []
          return (
            <div className="tas-customize-pages" role="group" aria-labelledby={props.labelId}>
              {options.map((option) => {
                const isLocked = locked.includes(option.value)
                return (
                  <label
                    key={option.value}
                    className="tas-customize-page"
                    data-locked={isLocked ? '1' : undefined}
                    title={isLocked ? t('pages_home_locked') : undefined}
                  >
                    <Checkbox
                      checked={isLocked || ticked.includes(option.value)}
                      disabled={props.busy || isLocked}
                      data-page={option.value}
                      onCheckedChange={(checked) => {
                        const next = checked
                          ? [...ticked, option.value]
                          : ticked.filter((value) => value !== option.value)
                        if (next.length === 0 && locked.length === 0) return
                        props.onEntry({
                          selected: options
                            .map((o) => o.value)
                            .filter((value) => next.includes(value) || locked.includes(value))
                        })
                      }}
                    />
                    <span>{option.label}</span>
                  </label>
                )
              })}
            </div>
          )
        }
        return (
          <MultiChips
            {...props}
            locked={pages ? (question?.locked ?? []) : []}
            allByDefault={pages}
            lockedHint={t('pages_home_locked')}
          />
        )
      }
    },
    logo: {
      render: ({ item, entry, onEntry, labelId }) => (
        <LogoField
          variants={questionOf(item.id)?.variants ?? ['single']}
          picked={tilesOf(entry.selected, 'logo')}
          onPicked={(next) => onEntry(entryOf(next, 'logo'))}
          businessName={businessName}
          labelId={labelId}
          preview={preview}
          compact={wizard}
          t={t}
        />
      )
    },
    favicon: {
      render: ({ entry, onEntry, labelId }) => (
        <FaviconField
          picked={tilesOf(entry.selected, 'favicon')}
          onPicked={(next) => onEntry(entryOf(next, 'favicon'))}
          businessName={businessName}
          labelId={labelId}
          preview={preview}
          compact={wizard}
          t={t}
        />
      )
    }
  }
  if (oneLanguage)
    renderers.languages = {
      render: ({ item, entry, onEntry, labelId }) => (
        <LanguageSelect
          options={(item.options ?? []).map((o) => o.value)}
          value={entry.selected[0]}
          onChange={(code) => onEntry({ selected: [code] })}
          labelledBy={labelId}
          placeholder={(wizard && item.placeholder) || t('brief_language_placeholder')}
          noMatch={t('lang_no_match')}
        />
      )
    }
  return renderers
}
