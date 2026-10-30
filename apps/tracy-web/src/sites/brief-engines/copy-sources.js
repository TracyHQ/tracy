/**
 * 🔒 EVERY COPY WRITER IS GIVEN THE BRIEF'S DIGEST AND THE SITE DIRECTION, AND SOURCES ITS FACTS (COO, 30/10/2026, spec
 * TracyHQ/tracy#189). The page writer (`plan-joomla-contract.mjs`) reads both from its brief; the writers that come after it
 * (sibling lists, record pages, offering descriptions, call-to-action bands, the box rewrite) each have their own prompt and
 * answer `{"lines": {...}}` or `{"values": {...}}`. `sourcedWriter` wraps the text model they are given, so none of them
 * needs work of its own:
 *   - every call carries `facts` (the business fields, the statistics and the fact digest, each fact with its `sourceId`)
 *     and `direction`, and the writer is told to answer `sources` beside its lines (`fact-sources.mjs` `SOURCE_RULE`);
 *   - a line that states a specific fact no cited source states is sent back once; still unsourced, it is dropped from
 *     the answer and named in `refused`, so the writer treats it as a line it could not write.
 * CMS-neutral; a model given no digest (`site.factSheet`) is returned as it is.
 */
import { seeder } from '../../lib/seeder.js'
import { jsonObjectIn } from './shared.js'

/** The map of lines a writer's answer carries, by key. */
const linesOf = (/** @type {any} */ answer) =>
  answer?.lines && typeof answer.lines === 'object'
    ? 'lines'
    : answer?.values && typeof answer.values === 'object'
      ? 'values'
      : null

/**
 * The text model a copy writer is given, with the brief's digest and direction on every call and its facts sourced.
 * @template {{chat: Function}} M
 * @param {M} model
 * @param {{site: any, refused?: Set<string>}} options - `refused`: the keys dropped as unsourced, for the receipt
 * @returns {M}
 */
export function sourcedWriter(model, { site, refused = new Set() }) {
  if (!model?.chat || !site?.factSheet) return model
  const { factSheet, statistics, direction, ...business } = site
  const facts = { ...business, statistics: statistics ?? [], factSheet }
  /** @param {any[]} messages @param {Record<string, unknown>} [extra] */
  const withBrief = async (messages, extra = {}) => {
    const { SOURCE_RULE, DIRECTION_RULE } = await seeder('fact-sources')
    return messages.map((m, i) => {
      if (m?.role === 'system')
        return { ...m, content: `${m.content}${SOURCE_RULE}${direction ? DIRECTION_RULE : ''}` }
      if (m?.role !== 'user' || i !== messages.length - 1) return m
      try {
        const input = JSON.parse(m.content)
        if (!input || typeof input !== 'object' || Array.isArray(input)) return m
        return {
          ...m,
          content: JSON.stringify({ ...input, facts, ...(direction ? { direction } : {}), ...extra })
        }
      } catch {
        return m
      }
    })
  }
  return {
    ...model,
    async chat(/** @type {any} */ args) {
      const { unsourcedLines, sourceComplaint, sourceTexts } = await seeder('fact-sources')
      const texts = sourceTexts(site)
      const raw = await model.chat({ ...args, messages: await withBrief(args.messages) })
      const answer = jsonObjectIn(raw)
      const field = linesOf(answer)
      if (!field) return raw
      const check = (/** @type {any} */ a, /** @type {string[]} */ keys) =>
        unsourcedLines({
          slots: keys.map((key) => ({ key })),
          values: a?.[field] ?? {},
          sources: a?.sources ?? {},
          site,
          texts
        })
      const bad = check(answer, Object.keys(answer[field]))
      if (bad.length === 0) return raw
      // Sent back once with the lines it must source or rewrite; what is still unsourced after that is dropped.
      let again = null
      try {
        again = jsonObjectIn(
          await model.chat({
            ...args,
            messages: await withBrief(args.messages, { fix: sourceComplaint(bad) })
          })
        )
      } catch {
        again = null
      }
      const keys = bad.map((b) => b.key)
      const fixed = again?.[field] && typeof again[field] === 'object' ? again : null
      const still = new Set(
        check(
          fixed,
          keys.filter((k) => typeof fixed?.[field]?.[k] === 'string')
        ).map((b) => b.key)
      )
      const lines = { ...answer[field] }
      const sources = { ...answer.sources }
      for (const key of keys) {
        const line = fixed?.[field]?.[key]
        if (typeof line === 'string' && line.trim() && !still.has(key)) {
          lines[key] = line
          sources[key] = fixed?.sources?.[key] ?? []
        } else {
          delete lines[key]
          delete sources[key]
          refused.add(key)
        }
      }
      return JSON.stringify({ ...answer, [field]: lines, sources })
    }
  }
}
