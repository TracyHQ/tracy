/**
 * English baseline for the `tracy-site-build-emdash` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately.
 *
 * The table is core's (`baseEn`) plus the one stage only EmDash runs: `personalize`, the
 * customer's answers put into the template's own fields (`check` and `shot` already have their
 * lines in core). Words follow `docs/references/vocabulary.md`.
 */
import { hostKeys } from '@tracy/site-build-core/host-messages'
import { baseEn } from '@tracy/site-build-core/client/strings'

import { EMDASH_MESSAGES } from '../messages.mjs'

export type { Translate } from '@tracy/site-build-core/client/strings'

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`: `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`.
 */
export const NS = 'tracy-site-build-emdash'

export const en = {
  ...baseEn,
  'stage.personalize.run': 'Putting your details in',
  'stage.personalize.done': 'Your details are in',
  // The sentences only this plugin's host says (`../messages.mjs`), read by `hostText`.
  ...hostKeys(EMDASH_MESSAGES)
} as const
