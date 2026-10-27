/**
 * English baseline for the `tracy-site-build-joomla` namespace.
 *
 * This package OWNS the namespace: it ships `en` here and nothing else. Vietnamese arrives from
 * `@tracy/dsh-tracy-locale-vi`, which registers `(namespace, locale)` pairs separately.
 *
 * The table is core's (`baseEn`) plus the two lines of the one stage that is Joomla's own.
 * Words follow `docs/references/vocabulary.md`: the customer reads "design template", never
 * "design system"; the stages are said in what they do for the customer, never by their engine
 * names — those are keys here, not text.
 */
import { hostKeys } from '@tracy/site-build-core/host-messages'
import { baseEn } from '@tracy/site-build-core/client/strings'

import { JOOMLA_MESSAGES } from '../messages.mjs'

export type { Translate } from '@tracy/site-build-core/client/strings'

/**
 * The namespace this package owns.
 *
 * 🔒 IT LIVES HERE, beside `en`: `check-dsh-locale` finds owners by reading the exported `NS` of
 * each `strings.ts`.
 */
export const NS = 'tracy-site-build-joomla'

export const en = {
  ...baseEn,
  'stage.template.run': 'Installing the template',
  'stage.template.done': 'Template installed',
  // 🔒 A STAGE WITHOUT THESE TWO LINES RENDERS ITS OWN KEY. `stage.language.run` appeared verbatim
  // in the Build card on the first integrated run — no error, no warning, just an engine name where
  // a sentence belongs, exactly as `stage.theme.done` did when the two platforms were split.
  'stage.language.run': 'Adding the other languages',
  'stage.language.done': 'Other languages added',
  // The sentences only this plugin's host says (`../messages.mjs`), read by `hostText`.
  ...hostKeys(JOOMLA_MESSAGES)
} as const
