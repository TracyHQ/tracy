/**
 * What to do about a demo install that failed: ONE table, keyed by the reason the job died on
 * (`failureReason` on the server), else by the step it died at. The Road to live panel's "Demo install
 * failed" guide (`problem-guides.ts`) reads it, so a failure explained once is explained everywhere.
 *
 * 🔒 NO GUESSED STEPS. A failure goes in the table only once its root cause is known, with the exact
 * fix (Akemi, 11/10/2026). Until then it gets no fact line, only the retry and "send the reason".
 *
 * Copy is short (Akemi, 11/10/2026): one fact line at most, steps of about eight words, and "send
 * the reason to the dev team" said once. The raw reason is NOT repeated here: the Demo Site row
 * already shows it, and Go there leads there.
 *
 * Pure: no React, no fetch. Words come from the `cms-demos` dictionary at call time.
 */
import { tr } from '../i18n'
import { en } from '../i18n/ns/cms-demos'

/** `tr`, falling back to this namespace's English in a bundle built without the dictionaries' glob. */
function say(key: keyof typeof en): string {
  const text = tr(key)
  return text === key ? en[key] : text
}

export interface FailureGuide {
  /** One short fact about this failure, or null when nobody has explained it yet. */
  whatToDo: string | null
  howTo: string[]
}

type Key = keyof typeof en
/** A guide as keys; `failedInstallGuide` reads it in the language on screen. */
interface GuideKeys {
  whatToDo: Key | null
  howTo: readonly Key[]
}

const RETRY_KEYS: readonly Key[] = ['cms-demos.guide.retry.press', 'cms-demos.guide.retry.report']

/** The steps for every failed demo: retry (Retry install arms, a second press confirms), then report. */
export function retrySteps(): string[] {
  return RETRY_KEYS.map(say)
}

/** `retrySteps()` for older callers: each item is read in the language on screen when accessed. */
export const RETRY_STEPS: readonly string[] = Object.defineProperties(
  [] as string[],
  Object.fromEntries(RETRY_KEYS.map((key, i) => [i, { get: () => say(key), enumerable: true }]))
)

/**
 * `provision.sh`'s refusal of a label directory an earlier broken attempt left on the host
 * (diagnosed 11/10/2026 on ja-restaurant: a 24/09 attempt left it, and every retry died on it).
 * Remove tears the copy down; since the same day the install door also tears a failed copy down
 * before it provisions again, so a new failure of this kind is rare.
 */
const STALE_COPY = /quickstart restore refuses a nonempty site/

/** Whether a failed demo died on a copy left in the way, so the card offers Remove. */
export function staleCopyInTheWay(reason: string | null | undefined): boolean {
  return typeof reason === 'string' && STALE_COPY.test(reason)
}

/**
 * Known failures: a pattern of the reason, or the step, and its guide (see the 🔒 above).
 *
 * The EmDash mail step (`emdash/configure-mail.mjs`, run by `platform/emdash.sh`): diagnosed 11/10/2026
 * (#827). A demo or stock site with no owner had no valid sender; it now gets its relay address, so a
 * retry on a rebuilt host passes, and a repeat is a new cause for the dev team. The second pattern is
 * the generic line older answers were reported by.
 */
const BY_REASON: [RegExp, GuideKeys][] = [
  [
    /^configure-mail: |could not configure this site's mail/,
    { whatToDo: 'cms-demos.guide.mail.fact', howTo: RETRY_KEYS }
  ],
  [
    // Diagnosed 25/10/2026: the release credential's hourly GitHub quota, shared by every Tracy
    // stack that uses it, was spent. A live demo's update stops before anything comes down.
    /rate limit for the release credential is spent until/,
    {
      whatToDo: 'cms-demos.guide.rateLimit.fact',
      howTo: ['cms-demos.guide.rateLimit.wait', 'cms-demos.guide.rateLimit.press']
    }
  ],
  [
    STALE_COPY,
    {
      whatToDo: 'cms-demos.guide.staleCopy.fact',
      howTo: ['cms-demos.guide.staleCopy.remove', 'cms-demos.guide.staleCopy.install']
    }
  ]
]
const BY_STEP: Record<string, GuideKeys> = {}

export function failedInstallGuide(reason: string | null, step?: string | null): FailureGuide {
  const known = reason ? BY_REASON.find(([pattern]) => pattern.test(reason))?.[1] : undefined
  const guide = known ?? (step ? BY_STEP[step] : undefined) ?? { whatToDo: null, howTo: RETRY_KEYS }
  return { whatToDo: guide.whatToDo === null ? null : say(guide.whatToDo), howTo: guide.howTo.map(say) }
}

/**
 * A demo job's step as a person reads it ("Install failed while setting up the site"). A step not
 * in the table is the host's own words (it prints its progress as it goes) and is kept as it is.
 */
const STEP_WORDS: Record<string, Key> = {
  provision: 'cms-demos.step.provision',
  teardown: 'cms-demos.step.teardown',
  prefetch: 'cms-demos.step.prefetch',
  remove: 'cms-demos.step.remove',
  install: 'cms-demos.step.install'
}

export function stepInWords(step: string | null | undefined): string {
  if (!step) return say('cms-demos.step.install')
  const key = Object.hasOwn(STEP_WORDS, step) ? STEP_WORDS[step] : undefined
  return key ? say(key) : step
}
