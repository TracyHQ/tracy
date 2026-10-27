/**
 * What one demo build is built with (23/10/2026): a site brief is the research frozen once and names no
 * CMS or template, so one brief feeds demos on any CMS and template. The build's choice — CMS, template,
 * workflow, the `/ops` picture policy — is made from the demo action's selection and frozen on `wo_build.choice`
 * when the build row is written; a retry reads that row, never `/ops` again.
 *
 * `withBuildChoice` lays a choice over a revision so every build-time reader sees the shape a revision with a
 * template had (`cms`, `template`, `brief.cms`, `brief.quickstartWorkflow`, `brief_md`…). The parts the domain
 * renders (acceptance lines, markdown) are rendered once in `makeBuildChoice`, so the overlay needs no domain.
 */
import { AGENT_DEMO } from './agent-demo.js'
import { qualityExecutionProfile } from './quality-execution-profile.js'
import { renderBriefWithReviews } from 'website-opportunities/src/review-sources.js'
import { briefWithResearch } from './revision-research.js'
import { picturePolicy } from '../lib/wo-picture-policy.js'

/** `workflow`: `AGENT_DEMO`, `'none'` (quality-v1 keeps its own), else the quickstart-first workflow. */
export function makeBuildChoice({
  domain,
  revision,
  cms,
  cmsSource,
  resolvedAt,
  template,
  workflow,
  ops,
  reviewMode
}) {
  const base = {
    cms,
    cmsSource,
    resolvedAt,
    picturePolicy: picturePolicy(ops),
    ...(reviewMode === 'manual' ? { reviewMode: 'manual' } : {}),
    ...(workflow === AGENT_DEMO
      ? { quickstartWorkflow: AGENT_DEMO }
      : workflow === 'none'
        ? {}
        : {
            quickstartWorkflow: 'quickstart-first/1',
            executionProfile: qualityExecutionProfile('quickstart-first-v1')
          })
  }
  const seen = domain.briefForBuild(revision.brief, { cms, cmsSource, resolvedAt, template })
  const choice = {
    ...base,
    template: seen.template,
    acceptance: seen.acceptance.slice((revision.brief.acceptance ?? []).length)
  }
  return { ...choice, briefMd: renderBriefWithReviews(domain, briefOf(briefWithResearch(revision), choice)) }
}

/** The fields of a choice that make a build different from another of the same brief. */
export function choiceKey(choice) {
  const t = choice?.template ?? {}
  return [choice?.cms, t.quickstart, t.design, t.version, choice?.quickstartWorkflow ?? ''].join('|')
}

function briefOf(brief, choice) {
  const { briefMd: _md, acceptance = [], ...rest } = choice
  return {
    ...brief,
    ...rest,
    acceptance: [...(brief?.acceptance ?? []), ...acceptance]
  }
}

/** The revision as the build of `choice` reads it; a new object, the stored revision untouched. */
export function withBuildChoice(revision, choice) {
  if (!revision || !choice) return revision
  return {
    ...revision,
    cms: choice.cms,
    cms_source: choice.cmsSource,
    resolved_at: choice.resolvedAt,
    template: choice.template,
    brief: briefOf(revision.brief, choice),
    // A quality-v1 brief already holds its one build's view and its editorial markdown: keep that text.
    brief_md: revision.brief?.cms ? revision.brief_md : (choice.briefMd ?? revision.brief_md),
    build_choice: choice
  }
}
