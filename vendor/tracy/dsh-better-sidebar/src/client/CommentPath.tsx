/**
 * The path line under a new comment popover's head (Akemi's edit-mode review E2, 01/10/2026):
 * "Section › Block › Heading" (runtime 20: "Main › "Ship fast. Sleep…" › Block › Heading"), the current
 * step tinted, the others muted buttons that move the pick there. One line, never wrapped: steps that
 * do not fit fold into "…" (`fitPath`), outermost first.
 */
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type { CommentMode } from './comment-controller.ts'
import { fitPath, pathItems, pickPath, type PathStep } from './comment-path.ts'
import { t } from './locales.ts'
import type { PreviewPickTarget } from './preview-protocol.generated.ts'
import css from './sidebar.module.css'

/** A step's word on the line: the page's name for it, quoted (runtime 20), else its plain name. */
const stepLabel = (step: PathStep): string => step.name ?? t(step.key)

/** A step's tooltip: its own words (a named step's whole name), cut, so two steps can be told apart. */
const WORDS_MAX = 80
const tooltip = (step: PathStep): string | undefined => {
  const words = step.words.trim()
  if (words === '') return undefined
  return words.length > WORDS_MAX ? `${words.slice(0, WORDS_MAX - 1)}…` : words
}

export function CommentPath(props: { mode: Pick<CommentMode, 'canWiden' | 'widen'>; target: PreviewPickTarget }): ReactElement | null {
  const { mode, target } = props
  const path = pickPath(target.levels)
  const line = useRef<HTMLDivElement | null>(null)
  const measure = useRef<HTMLDivElement | null>(null)
  const [fold, setFold] = useState({ outer: 0, inner: 0 })
  const names = path.map(stepLabel)
  const signature = `${names.join('|')}#${String(target.level)}`
  // Measured after each render from a hidden copy of every step: the fold that fits the line's width.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-measured every render; equal folds end it
  useLayoutEffect(() => {
    const row = line.current
    const copy = measure.current
    if (row === null || copy === null || path.length === 0) return
    const cells = [...copy.children] as HTMLElement[]
    const widths = cells.slice(0, path.length).map(c => c.offsetWidth)
    const more = cells[path.length]?.offsetWidth ?? 0
    const gap = cells[path.length + 1]?.offsetWidth ?? 0
    const at = path.findIndex(s => s.index === target.level)
    const next = fitPath(widths, Math.max(0, at), row.clientWidth, more, gap)
    if (next.outer !== fold.outer || next.inner !== fold.inner) setFold(next)
  })
  if (path.length === 0) return null
  const items = pathItems(path, target.level, fold.outer, fold.inner)
  const live = mode.canWiden
  return (
    <div ref={line} className={css.commentPath} data-comment-path="" data-path={signature}>
      <nav aria-label={t('commentPathLabel')} className={css.commentPathRow}>
        {items.map((item, n) => {
          const sep = n > 0 ? <span className={css.commentPathSep} aria-hidden>›</span> : null
          if (item.kind === 'more') {
            const label = t(item.side === 'outer' ? 'commentPathWider' : 'commentPathNarrower', { name: stepLabel(item.hidden[item.side === 'outer' ? item.hidden.length - 1 : 0]!) })
            const all = item.hidden.map(stepLabel).join(' › ')
            return (
              <span key={`more-${item.side}`} className={css.commentPathCell}>
                {sep}
                <button type="button" className={css.commentPathStep} disabled={!live} aria-label={label} title={`${label} (${all})`} data-path-more={item.side} onClick={() => { mode.widen(item.to) }}>…</button>
              </span>
            )
          }
          const { step, current } = item
          return (
            <span key={`step-${String(step.index)}`} className={css.commentPathCell}>
              {sep}
              <button
                type="button"
                className={current ? `${css.commentPathStep} ${css.commentPathCurrent}` : css.commentPathStep}
                aria-current={current ? 'location' : undefined}
                disabled={!current && !live}
                title={tooltip(step)}
                data-path-step={step.index}
                onClick={() => { if (!current) mode.widen(step.index) }}
              >
                {names[path.indexOf(step)]}
              </button>
            </span>
          )
        })}
      </nav>
      <div ref={measure} className={css.commentPathMeasure} aria-hidden>
        {path.map((step, n) => <span key={step.index} className={n === path.findIndex(s => s.index === target.level) ? `${css.commentPathStep} ${css.commentPathCurrent}` : css.commentPathStep}>{names[n]}</span>)}
        <span className={css.commentPathStep}>…</span>
        <span className={css.commentPathSep}>›</span>
      </div>
    </div>
  )
}
