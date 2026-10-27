/**
 * Package-owned invariant companion for `@huanlin/dsh-plugin-better-locale`.
 *
 * @module @huanlin/dsh-plugin-better-locale/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@huanlin/dsh-plugin-better-locale'

/** Cordis companion plugin name. */
export const name = 'dsh-plugin-better-locale-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: every language contribution (catalog entry +
 * namespace dictionaries) is registered through `ctx.effect`, so HMR /
 * fiber disposal removes exactly what was added (proven by
 * `tests/apply.spec.ts`). The plugin holds no mutable state of its own —
 * the catalog and dictionaries live in DSH's LocaleRuntime, and the
 * selection persists in DSH's durable `locale.preference` setting.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
