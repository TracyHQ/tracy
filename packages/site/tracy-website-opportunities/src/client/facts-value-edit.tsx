/**
 * The editor of any fact of the saved profile in a band's Edit (#537 R18), chosen by the fact's kind: a text input (a
 * text area for long text), one line per item for a list or hours, a checkbox per name for flags, Yes or No for a
 * boolean, a number input, a link input. `useFactDrafts` holds the drafts of a band's facts and gives the band's Save
 * one step per changed fact, each sent through the facts door (`PUT …/:id/facts {factId, value}`). A fact of no kind
 * has no editor: it is switched on or off instead.
 */
import { type JSX, type ReactNode, useState } from 'react'
import { Checkbox, Input, NativeSelect, NativeSelectOption, Textarea } from '@tracy/ui'

import { EditFooter } from './facts-band-actions.tsx'
import { type FactDraft, draftOf, factLabel, flagName, sentValueOf } from './facts-value-model.ts'
import type { SavedFact } from './saved-profile-model.ts'
import type { Translate } from './strings.ts'

/** Sends one fact's new value through the facts door; answers whether it went through. */
export type SaveFactValue = (factId: string, value: unknown) => Promise<boolean>

/** A text this long or a quote edits in a text area. */
const LONG = 80

function FactEditor({
  t,
  fact,
  draft,
  wrong,
  onChange
}: {
  t: Translate
  fact: SavedFact
  draft: FactDraft
  wrong: boolean
  onChange: (next: FactDraft) => void
}): JSX.Element | null {
  const label = factLabel(t, fact)
  const words = typeof draft === 'string' ? draft : ''
  const common = { 'aria-label': label, 'aria-invalid': wrong || undefined }
  let field: ReactNode
  if (fact.kind === 'flags' && typeof draft !== 'string')
    field = (
      <span className="tracy-wo-facts-flags">
        {Object.entries(draft).map(([name, on]) => (
          <label key={name} className="tracy-wo-facts-flag">
            <Checkbox
              checked={on}
              onCheckedChange={(next) => onChange({ ...draft, [name]: next === true })}
            />
            {flagName(t, name)}
          </label>
        ))}
      </span>
    )
  else if (fact.kind === 'boolean')
    field = (
      <NativeSelect size="sm" value={words} onChange={(e) => onChange(e.target.value)} {...common}>
        <NativeSelectOption value="yes">{t('answer.yes')}</NativeSelectOption>
        <NativeSelectOption value="no">{t('answer.no')}</NativeSelectOption>
      </NativeSelect>
    )
  else if (
    fact.kind === 'list' ||
    fact.kind === 'hours' ||
    (fact.kind === 'text' && (words.length > LONG || fact.group === 'quotes'))
  )
    field = (
      <Textarea
        value={words}
        rows={fact.kind === 'hours' ? 7 : 3}
        maxLength={fact.kind === 'text' ? 2000 : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...common}
      />
    )
  else if (fact.kind !== null)
    field = (
      <Input
        value={words}
        type={fact.kind === 'number' ? 'number' : fact.kind === 'url' ? 'url' : 'text'}
        maxLength={fact.kind === 'text' ? 2000 : undefined}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        {...common}
      />
    )
  else return null
  return (
    <div
      className="tracy-wo-facts-fld"
      data-wide={fact.kind === 'text' && fact.group === 'quotes' ? '' : undefined}
    >
      <span className="tracy-wo-facts-ck">{label}</span>
      {field}
    </div>
  )
}

export interface FactDrafts {
  /** The editors, in the facts' order; null when no fact of the band can be edited. */
  fields: ReactNode | null
  /** One save per changed fact; null steps are unchanged facts. A draft of the wrong kind fails the save. */
  steps: () => Array<(() => Promise<boolean>) | null>
}

/** The drafts of some facts and the saves of the changed ones. */
export function useFactDrafts(
  t: Translate,
  facts: readonly SavedFact[],
  save: SaveFactValue | null
): FactDrafts {
  const editable = save === null ? [] : facts.filter((f) => f.kind !== null)
  const [drafts, setDrafts] = useState<Record<string, FactDraft>>(() =>
    Object.fromEntries(editable.map((f) => [f.id, draftOf(f)]))
  )
  const [tried, setTried] = useState(false)
  const draftFor = (f: SavedFact): FactDraft => drafts[f.id] ?? draftOf(f)
  return {
    fields:
      editable.length === 0 ? null : (
        <div className="tracy-wo-facts-ef" data-cols="3">
          {editable.map((f) => (
            <FactEditor
              key={f.id}
              t={t}
              fact={f}
              draft={draftFor(f)}
              wrong={tried && sentValueOf(f, draftFor(f)) === null}
              onChange={(next) => setDrafts((all) => ({ ...all, [f.id]: next }))}
            />
          ))}
        </div>
      ),
    steps: () =>
      editable.map((f) => {
        const value = sentValueOf(f, draftFor(f))
        if (value === undefined || save === null) return null
        if (value === null)
          return async () => {
            setTried(true)
            return false
          }
        return () => save(f.id, value)
      })
  }
}

/** Runs the saves of the changed fields one after another; false at the first that fails. */
export async function runSteps(steps: Array<(() => Promise<boolean>) | null>): Promise<boolean> {
  for (const step of steps) if (step !== null && !(await step())) return false
  return true
}

/** A band's Edit made of the editors of its facts alone, with Cancel and Save. */
export function FactsEdit({
  t,
  close,
  facts,
  save,
  before
}: {
  t: Translate
  close: () => void
  facts: readonly SavedFact[]
  save: SaveFactValue
  /** Fields the band edits through its own door, drawn first (they save themselves). */
  before?: ReactNode
}): JSX.Element {
  const drafts = useFactDrafts(t, facts, save)
  return (
    <>
      {before}
      {drafts.fields}
      <EditFooter
        t={t}
        note={t('facts.edit.note')}
        onCancel={close}
        onSave={() => runSteps(drafts.steps())}
      />
    </>
  )
}
