/**
 * The brief build path (spec TracyHQ/tracy#189, ticket #191): a build made from a content brief runs the Customize engine
 * from one site plan (`website-opportunities/domain/site-plan.mjs`), then the demo-leftover check reads what it served
 * (`demo-leftover-check.js`). The Build button sends this workflow by default; the agent demo (`agent-demo/1`) stays a
 * workflow a caller may name instead.
 *
 * The create door receives the plan's answers and every contact fact (`brief.facts`); the whole plan rides on the build's
 * receipt (`receipt.sitePlan`), where the engine reads it (`site-content.js` `sitePlanFor`) and the hand-off report and
 * the ops view read the check's findings beside it.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { contractFor, defaultContracts } from '../lib/contracts.js'

export const BRIEF_BUILD = 'brief-build/1'

/** Whether a revision (with its build choice laid over it) is a brief build. */
export const isBriefBuild = (revision) => revision?.brief?.quickstartWorkflow === BRIEF_BUILD

/**
 * The content map of the release a revision's template installs: its slots carry the demo's own samples. Null when the
 * release has no contract or no map (the plan then decides no slot, and the check reads only what needs no map).
 * @param {{quickstart?: string, version?: string} | null | undefined} template
 * @param {import('../lib/contracts.js').ContractIndex} [contracts]
 */
export function contentMapOfTemplate(template, contracts = defaultContracts()) {
  const dir = contractFor(contracts, template?.quickstart, template?.version)?.dir
  if (!dir) return null
  try {
    const map = JSON.parse(readFileSync(path.join(dir, 'content-map.json'), 'utf8'))
    return {
      slots: map.slots ?? [],
      pages: map.pages ?? [],
      entities: map.entities ?? [],
      roleVocabularyVersion: map.roleVocabularyVersion ?? null
    }
  } catch {
    return null
  }
}

/**
 * The site plan stored with a build: the decisions the engine and the reports read. The questionnaire's own answers and
 * the page plan travel apart (`brief`, `receipt.pagePlan`), so they are not kept twice.
 * @param {ReturnType<any>} plan - `domain.planSite`'s answer
 */
export function storedSitePlan(plan) {
  const { answers: _answers, questionnaire: _questionnaire, pagePlan: _pagePlan, notes, ...kept } = plan
  return { ...kept, notes }
}
