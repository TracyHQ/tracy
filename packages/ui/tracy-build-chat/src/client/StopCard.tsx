/**
 * The stop card at the end of the build chat (#575, screen 8 "Could not finish" of the approved mock): the build
 * draft's step stopped, or a start was refused for its limit. The notice of the mock, with why in one plain sentence
 * and, for a limit, the local time the owner may try again; then two actions:
 *
 * - Try again: says the one fixed message in the chat as the owner (`RETRY_MESSAGE`), so the agent runs the stopped
 *   step again with everything gathered kept. Disabled until `retryAt` on a limit, not drawn when the step may not be
 *   run again. Gone from the moment it is pressed, while the retry goes and runs (run 6);
 * - Start over: discards the draft and opens a fresh conversation (`start-over.ts`), after one confirmation, since
 *   it throws work away.
 */
import type { StopCard as StopCardValue } from '@tracy/core/build-chat'
import { useState } from 'react'
import type { Translate } from './strings'

export interface StopCardProps {
  card: StopCardValue
  t: Translate
  /** The interface locale, for the time of a limit; undefined lets the runtime pick its default. */
  locale: string | undefined
  now: number
  /** Sends the fixed retry message to the chat as the owner. */
  retry: () => Promise<'sent' | 'no-chat' | 'failed'>
  /** Discards the draft; resolves `false` when the door refused (the page moves on its own otherwise). */
  startOver: () => Promise<boolean>
}

/** A clock time in the interface locale; the day too when it is not today. */
export function retryTimeOf(retryAt: string, locale: string | undefined, now: number): string {
  const at = new Date(retryAt)
  const today = new Date(now).toDateString() === at.toDateString()
  const options: Intl.DateTimeFormatOptions = today
    ? { hour: 'numeric', minute: '2-digit' }
    : { weekday: 'long', hour: 'numeric', minute: '2-digit' }
  try {
    return new Intl.DateTimeFormat(locale, options).format(at)
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(at)
  }
}

export function StopCard({ card, t, locale, now, retry, startOver }: StopCardProps) {
  const [retrying, setRetrying] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const [step, setStep] = useState<'idle' | 'confirm' | 'going' | 'refused'>('idle')
  const pressRetry = async () => {
    setRetrying('sending')
    const sent = await retry().catch(() => 'failed' as const)
    setRetrying(sent === 'sent' ? 'sent' : 'failed')
  }
  const confirmStartOver = async () => {
    setStep('going')
    const moved = await startOver().catch(() => false)
    if (!moved) setStep('refused')
  }
  const sentence =
    card.limit && card.retryAt
      ? card.retry === 'waiting'
        ? t('stop.limit', { time: retryTimeOf(card.retryAt, locale, now) })
        : t('stop.limit.now')
      : t('stop.fault')
  const showRetry = card.retry !== 'none' && retrying !== 'sending' && retrying !== 'sent'
  return (
    <div className="tv-bc-notice tv-bc-stop" role="status" data-build-stop="">
      <div className="tv-bc-notice-head">
        <span className="tv-bc-sd" data-s="failed" aria-hidden />
        {t('stopped.title')}
      </div>
      <p>{sentence}</p>
      {step === 'confirm' || step === 'going' ? (
        <>
          <p>{t('stop.startOver.confirm')}</p>
          <div className="tv-bc-tfoot">
            <button
              type="button"
              className="tv-bc-btn"
              data-primary=""
              disabled={step === 'going'}
              onClick={() => void confirmStartOver()}
            >
              {t('stop.startOver.yes')}
            </button>
            <button
              type="button"
              className="tv-bc-btn"
              disabled={step === 'going'}
              onClick={() => setStep('idle')}
            >
              {t('stop.cancel')}
            </button>
          </div>
        </>
      ) : (
        <div className="tv-bc-tfoot">
          {retrying === 'failed' && (
            <span className="tv-bc-grow tv-bc-error" role="status">
              {t('rebuild.failed')}
            </span>
          )}
          {step === 'refused' && (
            <span className="tv-bc-grow tv-bc-error" role="status">
              {t('stop.startOver.failed')}
            </span>
          )}
          {showRetry && (
            <button
              type="button"
              className="tv-bc-btn"
              data-primary=""
              disabled={card.retry === 'waiting'}
              onClick={() => void pressRetry()}
            >
              {t('retry.button')}
            </button>
          )}
          <button type="button" className="tv-bc-btn" onClick={() => setStep('confirm')}>
            {t('stop.startOver')}
          </button>
        </div>
      )}
    </div>
  )
}
