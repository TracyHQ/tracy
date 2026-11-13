/**
 * The notice of a build that could not finish (TracyHQ/tracy#608): one plain sentence naming the step that stopped
 * it, what was kept, and whether the team was told. Never the fault reason: that stays with the team (`stoppedOf`).
 * Shown above the task list, which keeps the failed step red and never reads as done.
 */
import { stoppedOf } from '@tracy/core/build-chat'
import type { Translate } from './strings'

export interface BuildStoppedProps {
  // biome-ignore lint/suspicious/noExplicitAny: a Contract B outcome, checked by the contract
  outcome: any
  t: Translate
}

export function BuildStopped({ outcome, t }: BuildStoppedProps) {
  const s = stoppedOf(outcome)
  if (s === null) return null
  const kept =
    s.writtenPages === 0
      ? t('stopped.kept.none')
      : s.writtenPages === 1
        ? t('stopped.kept.one')
        : t('stopped.kept.other', { count: s.writtenPages })
  return (
    <div className="tv-bc-notice" role="status">
      <div className="tv-bc-notice-head">
        <span className="tv-bc-sd" data-s="failed" aria-hidden />
        {t('stopped.title')}
      </div>
      <p>{t(s.twice ? 'stopped.twice' : 'stopped.once', { step: s.step })}</p>
      <ul>
        <li>{kept}</li>
        {s.siteUnchanged && <li>{t('stopped.unchanged')}</li>}
      </ul>
      {s.teamNotified && <p className="tv-bc-team tv-bc-muted tv-bc-small">{t('stopped.notified')}</p>}
    </div>
  )
}
