/**
 * English baseline for the `tracy-site-build-wordpress` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately.
 *
 * The table is core's (`baseEn`) plus the two lines of the one stage that is WordPress's own.
 * Words follow `docs/references/vocabulary.md`: the customer reads "design template", never
 * "design system"; the stages are said in what they do for the customer, never by their engine
 * names — those are keys here, not text.
 */
import { hostKeys } from '@tracy/site-build-core/host-messages'
import { baseEn } from '@tracy/site-build-core/client/strings'

import { WORDPRESS_MESSAGES } from '../messages.mjs'

export type { Translate } from '@tracy/site-build-core/client/strings'

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`: `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`.
 */
export const NS = 'tracy-site-build-wordpress'

export const en = {
  ...baseEn,
  'stage.theme.run': 'Installing the theme',
  'stage.theme.done': 'Theme installed',
  // The sentences only this plugin's host says (`../messages.mjs`), read by `hostText`.
  ...hostKeys(WORDPRESS_MESSAGES)
} as const
