/**
 * The `@` picker under a comment box (TCH spec #809 case C1, picker U6 approved by Akemi 03/10/2026):
 * while the caret stands in an `@word`, a list of the site's people under the box — each row an avatar
 * (the person's face, `face.tsx`: their photo, else their initial on their colour), the name, the address and the role — and under them the line
 * "Only people with a seat on this site". ↑/↓ move, Enter or Tab picks, Esc closes the list only (the
 * box keeps its words); a click picks. Picking writes `@handle ` into the words and tells the
 * controller whom it names (`mode.mention.pick`); what follows `@` without a pick stays plain text.
 *
 * Drawn IN FLOW under the field, not floating: the popover and the thread card both scroll inside
 * (`overflow: auto`), and a floating list would be clipped by them.
 *
 * `useMentionPicker` owns the caret and the list state for one box; the box spreads `keys` and
 * `field` onto its textarea (before its own Enter handler) and draws `<MentionList>` under it.
 */
import { useState, type KeyboardEvent as ReactKeyboardEvent, type ReactElement, type SyntheticEvent } from 'react'
import { insertMention, matchPeople, mentionQuery, roleName, type MentionPerson, type MentionQuery } from './comment-mentions.ts'
import { bubbleFace } from './comment-store.ts'
import { Face } from './face.tsx'
import { t } from './locales.ts'
import css from './sidebar.module.css'

interface Picker {
  /** The `@word` the caret stands in, while the list is open; null when closed. */
  query: MentionQuery | null
  rows: MentionPerson[]
  /** The row Enter would pick. */
  active: number
  /** The roster is still being read. */
  loading: boolean
  pick: (person: MentionPerson) => void
  hover: (index: number) => void
  /** Handlers for the textarea: caret tracking. */
  field: {
    onSelect: (event: SyntheticEvent<HTMLTextAreaElement>) => void
    onClick: (event: SyntheticEvent<HTMLTextAreaElement>) => void
  }
  /** The list's keys; true when it took the key (the box's own Enter handling must not run). */
  onKey: (event: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean
  /** Call from the textarea's change: the caret moved with the typing. */
  onType: (value: string, caret: number) => void
}

/**
 * One box's picker.
 * @param input.text - the box's words; `setText` writes them; `field` is its textarea.
 * @param input.people - the roster (null until read); `load` asks for it; `picked` records a pick.
 */
export function useMentionPicker(input: {
  text: string
  setText: (text: string) => void
  field: { current: HTMLTextAreaElement | null }
  people: MentionPerson[] | null
  load: () => void
  picked: (person: MentionPerson) => void
}): Picker {
  const { text, setText, field, people, load, picked } = input
  const [caret, setCaret] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  /** The `@` (its start) the person closed with Esc: it stays closed until the caret leaves it. */
  const [dismissed, setDismissed] = useState<number | null>(null)
  const found = caret === null ? null : mentionQuery(text, caret)
  const query = found !== null && found.start !== dismissed ? found : null
  const rows = query === null ? [] : matchPeople(people ?? [], query.query)
  const index = Math.min(active, Math.max(0, rows.length - 1))

  const track = (el: HTMLTextAreaElement): void => {
    const at = el.selectionStart === el.selectionEnd ? el.selectionStart : null
    setCaret(at)
    const next = at === null ? null : mentionQuery(el.value, at)
    if (next === null || next.start !== dismissed) setDismissed(null)
    if (next !== null) load()
  }
  const pick = (person: MentionPerson): void => {
    if (query === null) return
    const after = insertMention(text, query, person)
    picked(person)
    setText(after.text)
    setCaret(after.caret)
    setActive(0)
    // The caret after the inserted `@handle `, once React wrote the words.
    requestAnimationFrame(() => {
      const el = field.current
      if (el === null) return
      el.focus()
      el.setSelectionRange(after.caret, after.caret)
    })
  }
  return {
    query,
    rows,
    active: index,
    loading: query !== null && people === null,
    pick,
    hover: setActive,
    field: {
      onSelect: (event) => { track(event.currentTarget) },
      onClick: (event) => { track(event.currentTarget) },
    },
    onType: (value, at) => {
      setCaret(at)
      setActive(0)
      const next = mentionQuery(value, at)
      if (next !== null) load()
    },
    onKey: (event) => {
      if (query === null) return false
      const composing = (event.nativeEvent as KeyboardEvent).isComposing === true
      if (composing) return false
      if (event.key === 'Escape') {
        // The list closes; the box and its words stay (the box's own Esc would close it).
        event.preventDefault()
        event.stopPropagation()
        setDismissed(query.start)
        return true
      }
      if (rows.length === 0) return false
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActive((index + step + rows.length) % rows.length)
        return true
      }
      if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        const person = rows[index]
        if (person !== undefined) pick(person)
        return true
      }
      return false
    },
  }
}

/** The list under the box: the matching people and the line saying who can be named. */
export function MentionList(props: { picker: Picker; id: string }): ReactElement | null {
  const { picker, id } = props
  if (picker.query === null) return null
  return (
    <div className={css.mentionPicker} data-mention-picker="">
      {picker.rows.length > 0 && (
        <ul id={id} role="listbox" aria-label={t('mentionPeople')} className={css.mentionList}>
          {picker.rows.map((p, i) => (
            <li
              key={p.accountId}
              id={`${id}-${p.accountId}`}
              role="option"
              aria-selected={i === picker.active}
              className={css.mentionRow}
              data-active={i === picker.active ? '' : undefined}
              // Picked on press, before the textarea loses its focus to the row.
              onMouseDown={(event) => {
                event.preventDefault()
                picker.pick(p)
              }}
              onMouseEnter={() => { picker.hover(i) }}
            >
              <Face face={bubbleFace(p, null)} size={24} className={css.mentionAvatar} />
              <span className={css.mentionWho}>
                <span className={css.mentionName}>{p.name ?? p.email}</span>
                {p.name !== undefined && <span className={css.mentionEmail}>{p.email}</span>}
              </span>
              <span className={css.mentionRole}>{roleName(p.role)}</span>
            </li>
          ))}
        </ul>
      )}
      {picker.rows.length === 0 && !picker.loading && <div className={css.mentionEmpty} role="status">{t('mentionNoMatch')}</div>}
      <div className={css.mentionHint}>{t('mentionOnlySeats')}</div>
    </div>
  )
}
