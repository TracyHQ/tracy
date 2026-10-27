//#region src/invariant.ts
const PACKAGE_NAME = "@huanlin/dsh-plugin-better-locale";
/** Cordis companion plugin name. */
const name = "dsh-plugin-better-locale-invariant";
/** Service required before the companion can reserve package ownership. */
const inject = ["invariants"];
/**
* No runtime invariant: every language contribution (catalog entry +
* namespace dictionaries) is registered through `ctx.effect`, so HMR /
* fiber disposal removes exactly what was added (proven by
* `tests/apply.spec.ts`). The plugin holds no mutable state of its own —
* the catalog and dictionaries live in DSH's LocaleRuntime, and the
* selection persists in DSH's durable `locale.preference` setting.
*/
const install = () => {};
/**
* Register this package's invariant companion.
* @param ctx - Cordis context carrying the invariant service.
* @returns the installed registration's disposer after setup succeeds.
*/
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));

//#endregion
export { apply, inject, name };