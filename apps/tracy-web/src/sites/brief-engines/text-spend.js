/**
 * 🔒 WHAT A BUILD'S WORDS COST IS RECORDED (COO, 30/10/2026): an engine that asks its `models()` for a new seed model at every
 * step (the Joomla engine does, a dozen times a build) left no total anywhere, so the cost of one site was unknown. Every text
 * model made while a build's `prepare` or `apply` runs is kept for that build (`AsyncLocalStorage`, keyed by the build's
 * context), and their usage, summed, is recorded on the build's timings (`recordTextUsage`) however the step ends.
 * CMS-neutral: any engine wraps itself with `withTextSpend` and its `models` with `trackTextSpend`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'

import { recordTextUsage } from './shared.js'

/** @type {AsyncLocalStorage<any[]>} the text models of the build step running */
const scope = new AsyncLocalStorage()
/** @type {WeakMap<object, any[]>} the text models of each build, by its context */
const byBuild = new WeakMap()

/**
 * The engine's `models`, keeping every text model it hands out for the build step that asked.
 * @template {(...args: any[]) => Promise<{text?: any}>} M @param {M} models @returns {M}
 */
export function trackTextSpend(models) {
  return /** @type {M} */ (
    async (/** @type {any[]} */ ...args) => {
      const made = await models(...args)
      if (made?.text) scope.getStore()?.push(made.text)
      return made
    }
  )
}

/**
 * The summed usage of several seed models, as one model's `usage()` reads.
 * @param {any[]} list
 */
export function summedUsage(list) {
  const total = { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, stages: {} }
  for (const model of list) {
    const u = model?.usage?.()
    if (!u) continue
    for (const k of ['calls', 'promptTokens', 'completionTokens', 'reasoningTokens'])
      total[k] += Number(u[k]) || 0
    for (const [name, s] of Object.entries(u.stages ?? {})) {
      const own = (total.stages[name] ??= {
        calls: 0,
        promptTokens: 0,
        completionTokens: 0,
        reasoningTokens: 0
      })
      for (const k of ['calls', 'promptTokens', 'completionTokens', 'reasoningTokens'])
        own[k] += Number(s?.[k]) || 0
    }
  }
  return total
}

/**
 * The engine with its `prepare` and `apply` recording the text the build spent, in all and per stage.
 * @template {{prepare?: Function, apply?: Function}} E @param {E} engine @returns {E}
 */
export function withTextSpend(engine) {
  const wrap = (/** @type {Function} */ step) =>
    async function (/** @type {any} */ ctx, /** @type {any[]} */ ...rest) {
      const list = (ctx && typeof ctx === 'object' && byBuild.get(ctx)) || []
      if (ctx && typeof ctx === 'object') byBuild.set(ctx, list)
      try {
        return await scope.run(list, () => step.call(this, ctx, ...rest))
      } finally {
        if (typeof ctx?.time === 'function') recordTextUsage(ctx, { usage: () => summedUsage(list) })
      }
    }
  return {
    ...engine,
    ...(typeof engine.prepare === 'function' ? { prepare: wrap(engine.prepare) } : {}),
    ...(typeof engine.apply === 'function' ? { apply: wrap(engine.apply) } : {})
  }
}
