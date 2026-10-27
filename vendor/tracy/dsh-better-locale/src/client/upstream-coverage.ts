/**
 * Compile-time drift guard between the bundled dictionaries and DSH's
 * built-in locale namespaces — the plugin's "follow the upstream release"
 * engine, checked by `pnpm typecheck` only.
 *
 * This module is deliberately imported by NOTHING (no entry reaches it, so
 * tsdown never bundles it; `lib/client.js` stays pure dictionary data). It
 * exists for `tsc --noEmit`, which pulls every upstream
 * `LocaleNamespaceMap` merge module in through the type-only imports below
 * and then asserts two invariants over the merged table:
 *
 *   1. Drift — every built-in namespace and key is covered by at least one
 *      bundled language (missing = upstream evolved, translations lagging).
 *      Per-language subsets are legitimate (fr/it/ko ship a subset), so
 *      coverage is measured over the union of all bundled languages.
 *   2. Scope lock — no bundled language carries a namespace or key outside
 *      the built-in table (extra = the plugin is trespassing on a
 *      third-party plugin's namespace slot), checked per language.
 *
 * A violation fails the assignment below with the offending namespace/key
 * literals spelled out in the error. After upgrading the DSH checkout
 * (`~/.dsh/source/current`, pull + install + build), run `pnpm typecheck`:
 * red = gap; translate until green.
 *
 * @module @huanlin/dsh-plugin-better-locale/client/upstream-coverage
 */
// Type-only: pulls each upstream LocaleNamespaceMap merge into this program.
// The merge lives in a non-entry file for several packages (sub-path imports
// below point at the exact file). Keep in sync with the scan script
// `scripts/check-upstream-merges.mjs`, which diffs this list against the
// upstream source tree and fails when they diverge.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-approval/client/contract/slots'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client/contract/slots'
import type {} from '@deepseek-ai/dsh-client-ui-commands/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client/apply'
import type {} from '@deepseek-ai/dsh-client-ui-deliverables/client'
import type {} from '@deepseek-ai/dsh-client-ui-goal/client'
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-client-ui-jobs/client'
import type {} from '@deepseek-ai/dsh-client-ui-message-feedback/client/locales'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-plan/client'
import type {} from '@deepseek-ai/dsh-client-ui-reference/client/locales'
import type {} from '@deepseek-ai/dsh-client-ui-settings-general/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugin-inventory/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-skill/client'
import type {} from '@deepseek-ai/dsh-client-ui-subagent/client'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import type {} from '@deepseek-ai/dsh-client-ui-trajectory/client/locales'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type {} from '@deepseek-ai/dsh-client-ui-workflow-run/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-ui-cordis/client/locales'
import type {} from '@deepseek-ai/dsh-session-log-export/client'
import type { LocaleNamespaceMap } from '@deepseek-ai/dsh-client-ui-slots'

import { dicts as jaDicts } from './dictionaries/ja.ts'
import { dicts as deDicts } from './dictionaries/de.ts'
import { dicts as frDicts } from './dictionaries/fr.ts'
import { dicts as ptDicts } from './dictionaries/pt.ts'
import { dicts as koDicts } from './dictionaries/ko.ts'
import { dicts as arDicts } from './dictionaries/ar.ts'
import { dicts as hiDicts } from './dictionaries/hi.ts'
import { dicts as idDicts } from './dictionaries/id.ts'
import { dicts as trDicts } from './dictionaries/tr.ts'
import { dicts as viDicts } from './dictionaries/vi.ts'
import { dicts as thDicts } from './dictionaries/th.ts'
import { dicts as ruDicts } from './dictionaries/ru.ts'
import { dicts as itDicts } from './dictionaries/it.ts'
import { dicts as nlDicts } from './dictionaries/nl.ts'
import { dicts as svDicts } from './dictionaries/sv.ts'
import { dicts as plDicts } from './dictionaries/pl.ts'
import { dicts as zhHKDicts } from './dictionaries/zh-HK.ts'
import { dicts as zhTWDicts } from './dictionaries/zh-TW.ts'
import { dicts as zhMODicts } from './dictionaries/zh-MO.ts'

/** DSH built-in namespaces after every merge module above is included. */
type UpstreamNS = keyof LocaleNamespaceMap & string

/** Upstream key union of one built-in namespace. */
type UpstreamKeys<N extends UpstreamNS> = LocaleNamespaceMap[N] & string

/** Every bundled language's dictionary with its precise literal type. */
const ALL = {
  ja: jaDicts, de: deDicts, fr: frDicts, pt: ptDicts, ko: koDicts, ar: arDicts,
  hi: hiDicts, id: idDicts, tr: trDicts, vi: viDicts, th: thDicts, ru: ruDicts,
  it: itDicts, nl: nlDicts, sv: svDicts, pl: plDicts,
  'zh-HK': zhHKDicts, 'zh-TW': zhTWDicts, 'zh-MO': zhMODicts,
} as const

/** Namespaces shipped by at least one bundled language. */
type PluginNS = { [L in keyof typeof ALL]: keyof (typeof ALL)[L] & string }[keyof typeof ALL]

/** Keys of one namespace shipped by at least one bundled language. */
type PluginKeys<N extends UpstreamNS> = {
  [L in keyof typeof ALL]: N extends keyof (typeof ALL)[L]
    ? keyof (typeof ALL)[L][N] & string
    : never
}[keyof typeof ALL]

/** Upstream owns a namespace/key no bundled language translates (drift). */
export type Drift =
  | Exclude<UpstreamNS, PluginNS>
  | { [K in UpstreamNS]: Exclude<UpstreamKeys<K>, PluginKeys<K>> }[UpstreamNS]

/** One language carries a namespace/key upstream does not own (trespass). */
export type Trespass<L extends keyof typeof ALL> =
  | Exclude<keyof (typeof ALL)[L] & string, UpstreamNS>
  | {
      [K in keyof (typeof ALL)[L] & string]: K extends UpstreamNS
        ? Exclude<keyof (typeof ALL)[L][K] & string, UpstreamKeys<K>>
        : never
    }[keyof (typeof ALL)[L] & string]

/** All violations: upstream drift plus any language trespassing the table. */
type Violation = Drift | { [L in keyof typeof ALL]: Trespass<L> }[keyof typeof ALL]

/**
 * Green (`true`) while the bundled dictionaries track the built-in table
 * exactly. Red expands the offending namespace/key literals in the error.
 */
export const assertUpstreamCoverage
  : [Violation] extends [never] ? true : { error: Violation } = true
