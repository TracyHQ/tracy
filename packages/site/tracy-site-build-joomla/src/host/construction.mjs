/** A Base restore is the start of a template build, never proof that the chosen design exists. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { inputRootFor, ok, siteFromAnswers, siteKeyOf } from '@tracy/site-build-core/stages'
import { detailOf } from '@tracy/site-build-core/host-messages'
import { JOOMLA_MESSAGES } from '../messages.mjs'

/** @param {string} root @param {import('@tracy/site-build-core/build').Job} job */
export function constructionFile(root, job) {
  return path.join(inputRootFor(root, job), 'docs', 'agents', 'template-build.json')
}

/** Persist inputs before notifying the agent, so reloads and retries keep the same target. */
/** @param {string} root @param {import('@tracy/site-build-core/build').Job} job */
export function prepareConstruction(root, job) {
  if (!job.designPlan) throw new Error('Construction needs a design plan')
  const file = constructionFile(root, job)
  const request = {
    schemaVersion: 'tracy-template-build/v1',
    job: job.job,
    targetSiteKey: siteKeyOf(job),
    targetUrl: job.targetUrl,
    design: job.designPlan.requestedDesign,
    baselineProfile: job.designPlan.contractProfile,
    registryRevision: job.designPlan.registryRevision,
    site: siteFromAnswers({}, job.answers ?? {}),
    instructions: [
      'Load the installed joomlart-t4-template skill before implementing this build.',
      'Work in the target site workspace. Never change the source workspace or restore another quickstart.',
      'Use the requested design system and supplied HTML/assets as the visual source. Base supplies Joomla/T4 infrastructure, not the finished visual design.',
      'Inventory routes and assets, derive tokens and component rules, then implement native Joomla articles, menus, modules and template overrides editable in admin.',
      'Install all requested Joomla language packs and build the required language editions, menus and associations.',
      'Review desktop/mobile, light/dark where applicable, menu interactions, forms, links, typography and content against the design source.',
      'The site belongs to the business in `site`, not to the Base demo: set the Joomla site name ($sitename in configuration.php, and the Organization/WebSite schema it feeds) to the business name, and unpublish every Base demo module and notice ("[Tracy Base] … Demo notice", "studio demo", illustrative team/prices), and replace or unpublish the Base footer modules that carry demo handles and links (social links "@tracybasedemo", "Website planning", "Design system", "Help centre") with the business\'s own or nothing. No page may still present the demo\'s name, handles or disclaimer.',
      'Write template-review.json beside this request, with job, targetSiteKey, design, profile, languages, routes (nonempty list), and checks: {visual: true, responsive: true, interactions: true, content: true, undo: true}. Record only checks actually performed.',
      'Before capturing the profile, warm every compiled T4 asset: render every template style and every route so media/t4/css/<styleId>.css, media/t4/css/*-sub.css and media/t4/optimize/css/ are all generated. T4 compiles them lazily on the first render, and a profile captured before that reads the compile as drift on the first visitor (measured 13/09: "Presentation asset changed: media/t4/css/111-sub.css", four minutes after the capture).',
      'Capture a NEW content/display profile for the completed design. Use profile id tracy-<design>/j6/<version>; do not bind the Base profile to a changed template.',
      'Bind and inspect the new profile, verify content edit/undo, then rerun the template stage of this existing build. Do not create a second site.'
    ]
  }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(request, null, 2) + '\n', { mode: 0o600 })
  return file
}

/** Completion comes from the target Claude Cowork plugin, not from a caller-supplied "done" flag. */
/** @param {import('@tracy/site-build-core/host').StageDeps} deps @param {import('@tracy/site-build-core/build').Job} job */
export async function inspectConstruction(deps, job) {
  const answer = await inspectConstructionDetailed(deps, job)
  return answer.ok ? answer.result : null
}

/**
 * `inspectConstruction`, with the reason when the answer is no. Three different "no"s used to
 * read as one null — a Claude Cowork plugin that refused (a broken token, measured 13/09 as "the completed
 * design no longer matches its profile"), a lane with nobody to act as yet, and a design that
 * really is not there yet — and the stage that read null said the last one every time.
 * @param {import('@tracy/site-build-core/host').StageDeps} deps
 * @param {import('@tracy/site-build-core/build').Job} job
 * @returns {Promise<{ok: true, result: {contract?: string}} | {ok: false, why: 'cowork' | 'review' | 'profile', code?: string, detail: string, detailCode?: string, detailParams?: Record<string, string | number>}>}
 */
export async function inspectConstructionDetailed(deps, job) {
  if (!job.designPlan)
    return { ok: false, why: 'profile', ...detailOf('J_NO_DESIGN_PLAN', {}, JOOMLA_MESSAGES) }
  const siteKey = siteKeyOf(job)
  if (!siteKey) return { ok: false, why: 'profile', ...detailOf('SITE_UNNAMED') }
  const result =
    /** @type {{ok?: boolean, code?: unknown, error?: unknown, message?: unknown, contract?: string}} */ (
      await deps.apply({ siteKey, action: 'content.contract', params: { operation: 'inspect' } })
    )
  if (!ok(result)) {
    const code = typeof result?.code === 'string' ? result.code : 'error'
    const words = [result?.message, result?.error].find((w) => typeof w === 'string' && w !== '') ?? code
    return {
      ok: false,
      why: 'cowork',
      code,
      ...detailOf('J_INSPECT_FAILED', { code, reason: String(words) }, JOOMLA_MESSAGES)
    }
  }
  const prefix = `tracy-${job.designPlan.requestedDesign}/j6/`
  let review
  try {
    review = JSON.parse(
      readFileSync(path.join(path.dirname(constructionFile(deps.root, job)), 'template-review.json'), 'utf8')
    )
  } catch {
    return { ok: false, why: 'review', ...detailOf('J_NO_REVIEW', {}, JOOMLA_MESSAGES) }
  }
  const askedLanguages = siteFromAnswers({}, job.answers ?? {}).languages
  const languages = Array.isArray(askedLanguages) ? askedLanguages : ['en']
  if (
    review.job !== job.job ||
    review.targetSiteKey !== siteKey ||
    review.design !== job.designPlan.requestedDesign ||
    review.profile !== result.contract ||
    !Array.isArray(review.routes) ||
    !review.routes.length ||
    !Array.isArray(review.languages) ||
    !languages.every((lang) => review.languages.includes(lang)) ||
    !['visual', 'responsive', 'interactions', 'content', 'undo'].every((key) => review.checks?.[key] === true)
  )
    return {
      ok: false,
      why: 'review',
      ...detailOf('J_REVIEW_MISMATCH', {}, JOOMLA_MESSAGES)
    }
  if (
    typeof result.contract === 'string' &&
    result.contract.startsWith(prefix) &&
    result.contract !== job.designPlan.contractProfile
  )
    return { ok: true, result }
  return {
    ok: false,
    why: 'profile',
    ...detailOf(
      'J_WRONG_PROFILE',
      { contract: String(result.contract ?? 'no profile'), prefix },
      JOOMLA_MESSAGES
    )
  }
}
