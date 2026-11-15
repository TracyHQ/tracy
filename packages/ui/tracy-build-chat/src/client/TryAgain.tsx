/**
 * Try again (#609): offered under a turn whose `tracy_build` call stopped on a step the engine says may be run again.
 * Pressing it says one fixed message in the chat as the owner (`RETRY_MESSAGE`), so the agent calls the tool again and
 * the engine reruns the step. The button is gone from the moment it is pressed, while the retry goes and runs; a newer
 * stop offers its own (the fold clears the stop at the next call, `definitions.ts`). A message the chat did not take
 * brings the button back to press again, with the same sentence the plan card uses for a request not sent.
 */
import { useState } from 'react'
import type { Translate } from './strings'

export interface TryAgainProps {
  /** Sends the fixed message to the chat as the owner. */
  send: () => Promise<'sent' | 'no-chat' | 'failed'>
  t: Translate
}

export function TryAgain({ send, t }: TryAgainProps) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const press = async () => {
    setState('sending')
    const sent = await send().catch(() => 'failed' as const)
    setState(sent === 'sent' ? 'sent' : 'failed')
  }
  // While the retry goes and runs, the button is gone rather than drawn disabled (run 6): nothing to press again.
  if (state === 'sending' || state === 'sent') return null
  return (
    <div className="tv-bc-retry" data-build-retry="">
      <div className="tv-bc-tfoot">
        {state === 'failed' && (
          <span className="tv-bc-grow tv-bc-error" role="status">
            {t('rebuild.failed')}
          </span>
        )}
        <button type="button" className="tv-bc-btn" data-primary="" onClick={() => void press()}>
          {t('retry.button')}
        </button>
      </div>
    </div>
  )
}
