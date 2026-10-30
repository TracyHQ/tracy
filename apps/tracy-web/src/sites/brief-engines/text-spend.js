/**
 * 🔒 WHAT A BUILD'S WORDS COST IS RECORDED (COO, 30/10/2026): an engine that asks its `models()` for a new seed model at every
 * step (the Joomla engine does, a dozen times a build) left no total anywhere, so the cost of one site was unknown. Every text
 * model made while a build's `prepare` or `apply` runs is kept for that build (`AsyncLocalStorage`, keyed by the build's
 * context), and their usage, summed, is recorded on the build's timings (`recordTextUsage`) however the step ends.
 * CMS-neutral: any engine wraps itself with `withTextSpend` and its `models` with `trackTextSpend`.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { readFileSync } from 'node:fs'

import { recordTextUsage } from './shared.js'

/** @type {AsyncLocalStorage<any[]>} the text models of the build step running */
const scope = new AsyncLocalStorage()
/**
 * The text models of each build. Keyed by the build's own `time` recorder, not by the context object: the build runner hands
 * each step a copy of its context (`{...ctx, signal}`), so keyed by the object apply started from nothing and its total
 * replaced prepare's (R14: 54 calls and 501k tokens recorded as 3 calls).
 * @type {WeakMap<object, any[]>}
 */
const byBuild = new WeakMap()
const buildKey = (/** @type {any} */ ctx) =>
  ctx && typeof ctx === 'object' ? (typeof ctx.time === 'function' ? ctx.time : ctx) : null

/** The repo price table of the text models (`quality-prices.json`, cents per million tokens). */
const PRICES = JSON.parse(
  readFileSync(new URL('../../opportunities-build/quality-prices.json', import.meta.url), 'utf8')
)

/**
 * The price row of a model, by its id as a provider names it ("deepseek/deepseek-v4-flash"): the id without its provider,
 * or without its version ("deepseek-flash"); null when the table has none.
 * @param {unknown} model
 */
export function textPriceOf(model) {
  const id = String(model ?? '').replace(/^.*\//, '')
  for (const key of [id, id.replace(/-v\d+(?=-)/, '')]) if (PRICES.models?.[key]) return PRICES.models[key]
  return null
}

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
  const total = {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    reasoningTokens: 0,
    /** Approximate: list prices, no cache discount. */
    costUsd: 0,
    /** @type {string[]} the models the price table has no row for: their spend is not in `costUsd` */
    unpriced: [],
    stages: {}
  }
  for (const model of list) {
    const u = model?.usage?.()
    if (!u) continue
    const price = textPriceOf(u.model)
    if (price)
      total.costUsd +=
        ((Number(u.promptTokens) || 0) * price.inputCentsPerM +
          (Number(u.completionTokens) || 0) * price.outputCentsPerM) /
        1e8
    else if (u.model && (Number(u.calls) || 0) > 0 && !total.unpriced.includes(String(u.model)))
      total.unpriced.push(String(u.model))
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
  total.costUsd = Math.round(total.costUsd * 1e6) / 1e6
  return total
}

/**
 * The engine with its `prepare` and `apply` recording the text the build spent, in all and per stage.
 * @template {{prepare?: Function, apply?: Function}} E @param {E} engine @returns {E}
 */
export function withTextSpend(engine) {
  const wrap = (/** @type {Function} */ step) =>
    async function (/** @type {any} */ ctx, /** @type {any[]} */ ...rest) {
      const key = buildKey(ctx)
      const list = (key && byBuild.get(key)) || []
      if (key) byBuild.set(key, list)
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
