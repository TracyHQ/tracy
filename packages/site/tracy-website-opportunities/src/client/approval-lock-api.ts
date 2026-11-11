/**
 * Approved is final (#537 R23): the page hides every door that writes approved Business facts, but a write sent from a
 * page loaded before the approval still reaches the server and answers 409 `PROFILE_APPROVED`. This wraps the API so
 * any such answer is reported once to the page (its error line, then a reload that draws the facts locked); every
 * answer is still returned as it came, so the caller's own handling is unchanged.
 */
import { useMemo } from 'react'

import type { Api } from './api.ts'

export const PROFILE_APPROVED = 'PROFILE_APPROVED'

/** Whether an answer is the approved-facts refusal. */
export const isProfileApproved = (answer: unknown): boolean =>
  answer !== null &&
  typeof answer === 'object' &&
  (answer as { ok?: unknown }).ok === false &&
  (answer as { code?: unknown }).code === PROFILE_APPROVED

/** The API with every answer watched for `PROFILE_APPROVED`; `onLocked` hears each one. */
export function watchApprovedRefusal(api: Api, onLocked: () => void): Api {
  return new Proxy(api, {
    get(target, key, receiver) {
      const value = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      return (...args: unknown[]) => {
        const out = value.apply(target, args)
        if (out instanceof Promise)
          void out.then(
            (answer) => {
              if (isProfileApproved(answer)) onLocked()
            },
            () => undefined
          )
        return out
      }
    }
  })
}

/** `watchApprovedRefusal` kept stable across renders while `api` and `onLocked` are. */
export function useApprovedRefusal(api: Api, onLocked: () => void): Api {
  return useMemo(() => watchApprovedRefusal(api, onLocked), [api, onLocked])
}
