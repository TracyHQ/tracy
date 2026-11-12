/**
 * The six build steps of the Progress band as columns (#537, option A chosen by the owner): each step's state, its
 * name and one muted line with its time and cost. A done step says what it took ("2 min · $0.07"), the running step how
 * long it has run (and what it spent so far when the server knows it), a waiting step what it usually takes when that
 * was measured ("about 4 min · $0.30"). Every figure is what the server sends (`demoAction.run.steps`); nothing here
 * counts time or guesses a cost. Pure: no React, no clock.
 */
import type { ChainRun } from '@tracy/wo-views'

import { chainSubSteps } from './band-sub-steps-model.ts'
import type { BandSubStep } from './stepper-model.ts'
import type { Translate } from './strings.ts'

export interface BuildColumn {
  key: string
  label: string
  state: BandSubStep['state']
  /** The muted line under the name; null when the server sent nothing to say. */
  figure: string | null
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

const usdText = (locale: string, usd: number): string =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(usd)

/** Minutes in words: whole minutes, or "under 1 min" for a step shorter than half a minute. */
function timeText(t: Translate, minutes: number): string {
  const n = Math.round(minutes)
  return n < 1 ? t('progress.col.underMinute') : t('progress.minutes', { n })
}

export function buildColumns(
  t: Translate,
  run: ChainRun,
  actionState: string | null | undefined,
  locale: string
): BuildColumn[] {
  const subs = chainSubSteps(t, run, actionState)
  return subs.map((sub, i) => {
    const step = run.steps[i]
    const minutes = num(step?.minutes)
    const usd = num(step?.usd)
    let figure: string | null = null
    if (sub.state === 'failed') figure = t('progress.col.stopped')
    else if (sub.state === 'done') {
      if (minutes !== null)
        figure =
          usd === null
            ? timeText(t, minutes)
            : t('progress.col.done', { time: timeText(t, minutes), usd: usdText(locale, usd) })
    } else if (sub.state === 'running') {
      figure =
        minutes === null
          ? t('progress.col.running')
          : usd === null
            ? t('progress.col.runningFor', { time: timeText(t, minutes) })
            : t('progress.col.runningSpent', { time: timeText(t, minutes), usd: usdText(locale, usd) })
    } else {
      const estimate = step?.estimate
      const em = num(estimate?.minutes)
      const eu = num(estimate?.usd)
      if (em !== null && eu !== null)
        figure = t('progress.col.about', { time: timeText(t, em), usd: usdText(locale, eu) })
    }
    return { key: sub.key, label: sub.label, state: sub.state, figure }
  })
}
