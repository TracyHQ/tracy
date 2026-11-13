/**
 * The build task list with its timer (TracyHQ/tracy#608): dsh's task list shape (TodoPanel) over one Contract B run,
 * in the plain words of each step, with a clock in its head. The clock runs from the last progress event while the
 * build runs and stops on the outcome. dsh's own TodoPanel is not reused as is: it has no failed state, no note per
 * row and no place for a clock.
 */
import {
  IconChecklistOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular
} from '@deepseek-ai/dsh-client-ui-primitives'
import { clockOf, type ProgressItem, progressOf } from '@tracy/core/build-chat'
import { useEffect, useState } from 'react'
import type { StringKey, Translate } from './strings'

export interface BuildProgressProps {
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B run, checked by the contract
  run: { events?: any[]; outcome?: any }
  t: Translate
}

const NOTE: Record<NonNullable<ProgressItem['note']>, StringKey> = {
  failed: 'progress.note.failed',
  'failed-twice': 'progress.note.failedTwice',
  'not-started': 'progress.note.notStarted'
}
const STATE: Record<ProgressItem['state'], StringKey> = {
  done: 'progress.state.done',
  running: 'progress.state.running',
  pending: 'progress.state.pending',
  failed: 'progress.state.failed'
}

/** Seconds since the build started: the run's own count, plus the time since it arrived while the build runs. */
function useElapsed(base: number, running: boolean): number {
  const [since, setSince] = useState(() => ({ base, at: Date.now() }))
  const [now, setNow] = useState(() => Date.now())
  if (since.base !== base) setSince({ base, at: Date.now() })
  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [running])
  return running ? base + Math.max(0, Math.floor((now - since.at) / 1000)) : base
}

export function BuildProgress({ run, t }: BuildProgressProps) {
  const p = progressOf(run)
  const [open, setOpen] = useState(true)
  const elapsed = useElapsed(p.elapsedSeconds, p.running)
  if (p.items.length === 0) return null
  const head = [
    p.counts.done > 0 && t('progress.done', { count: p.counts.done }),
    p.counts.running > 0 && t('progress.running', { count: p.counts.running }),
    p.counts.pending > 0 &&
      p.result !== 'stopped' &&
      p.result !== 'cancelled' &&
      t('progress.pending', { count: p.counts.pending }),
    p.counts.failed > 0 && t('progress.failed', { count: p.counts.failed })
  ]
    .filter(Boolean)
    .join(' · ')
  const title = t(p.kind === 'partial' ? 'progress.title.partial' : 'progress.title.build')

  return (
    <section className="tv-bc-todo" aria-label={title} data-result={p.result ?? 'running'}>
      <button
        type="button"
        className="tv-bc-todo-head"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="tv-bc-todo-icon" aria-hidden>
          <IconChecklistOutlineRegular />
        </span>
        <span className="tv-bc-todo-title">{title}</span>
        <span className="tv-bc-todo-progress">{head}</span>
        <span className="tv-bc-clock" role="timer" aria-label={t('progress.clock')}>
          {clockOf(elapsed)}
        </span>
        <span className="tv-bc-todo-icon" aria-hidden>
          {open ? <IconChevronDownOutlineRegular /> : <IconChevronUpOutlineRegular />}
        </span>
      </button>
      {open && (
        <ul>
          {p.items.map((item) => (
            <li key={item.id} data-s={item.state} data-note={item.note ?? undefined}>
              <span className="tv-bc-sd" data-s={item.state} role="img" aria-label={t(STATE[item.state])} />
              <span className="tv-bc-c">{item.label}</span>
              {item.note !== null && <span className="tv-bc-r">{t(NOTE[item.note])}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
