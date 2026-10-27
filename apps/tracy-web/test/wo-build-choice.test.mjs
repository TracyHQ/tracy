// A site brief names no CMS or template; the build's choice is laid over it where a build reads it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { choiceKey, makeBuildChoice, withBuildChoice } from '../src/opportunities-build/build-choice.js'

const AT = '2026-10-24T08:00:00.000Z'
const TEMPLATE = {
  platform: 'emdash',
  quickstart: 'tracy-base/e1',
  design: 'tracy-base',
  version: '1.0.0',
  designSystem: { id: 'apple', source: 'catalog', name: 'Apple' }
}

async function brief() {
  const domain = await websiteOpportunitiesDomain()
  const b = domain.buildBrief({
    opportunity: { id: 'o1', name: 'Pho Ba', candidate: {} },
    profile: { name: 'Pho Ba', phone: '+84 1' },
    madeAt: AT
  })
  return {
    domain,
    revision: {
      id: 'r1',
      n: 1,
      opportunity_id: 'o1',
      account_id: 'a1',
      brief: b,
      brief_md: domain.renderBriefMarkdown(b)
    }
  }
}

test('a choice carries the CMS, the template, the workflow and the lines that name them, frozen with the build', async () => {
  const { domain, revision } = await brief()
  const choice = makeBuildChoice({
    domain,
    revision,
    cms: 'emdash',
    cmsSource: 'account',
    resolvedAt: AT,
    template: TEMPLATE,
    workflow: 'agent-demo/1',
    ops: {}
  })
  assert.equal(choice.cms, 'emdash')
  assert.deepEqual(choice.template, TEMPLATE)
  assert.equal(choice.quickstartWorkflow, 'agent-demo/1')
  assert.equal('executionProfile' in choice, false, 'an agent demo runs no quickstart-first profile')
  assert.deepEqual(choice.acceptance, [
    'The site is built on emdash.',
    'The site still wears the template’s design system (Apple): no stylesheet, CMS setting or inline style added for this build redefines a design token, a colour or a font.'
  ])
  assert.match(choice.briefMd, /^- Template: emdash \/ tracy-base\/e1 \/ tracy-base @ 1\.0\.0$/m)
  assert.ok(choice.picturePolicy, 'the /ops picture policy is the build’s, not the brief’s')
  const plain = makeBuildChoice({
    domain,
    revision,
    cms: 'emdash',
    cmsSource: 'account',
    resolvedAt: AT,
    template: TEMPLATE,
    ops: {}
  })
  assert.equal(plain.quickstartWorkflow, 'quickstart-first/1')
  assert.equal(plain.executionProfile.id, 'quickstart-first-v1')
})

test('a revision read for one build looks as a revision with a template did; the stored brief stays untouched', async () => {
  const { domain, revision } = await brief()
  const before = structuredClone(revision)
  const choice = makeBuildChoice({
    domain,
    revision,
    cms: 'emdash',
    cmsSource: 'account',
    resolvedAt: AT,
    template: TEMPLATE,
    ops: {}
  })
  const seen = withBuildChoice(revision, choice)
  assert.deepEqual(revision, before)
  assert.equal(seen.cms, 'emdash')
  assert.equal(seen.cms_source, 'account')
  assert.deepEqual(seen.template, TEMPLATE)
  assert.equal(seen.brief.cms, 'emdash')
  assert.deepEqual(seen.brief.template, TEMPLATE)
  assert.equal(seen.brief.quickstartWorkflow, 'quickstart-first/1')
  assert.ok(seen.brief.acceptance.includes('The site is built on emdash.'))
  assert.equal(seen.brief_md, choice.briefMd)
  assert.deepEqual(domain.validateBrief(seen.brief).errors, [])
})

test('the build key names what makes two demos of one brief different, and nothing that does not', () => {
  const a = { cms: 'emdash', template: TEMPLATE, quickstartWorkflow: 'quickstart-first/1', resolvedAt: AT }
  assert.equal(choiceKey(a), 'emdash|tracy-base/e1|tracy-base|1.0.0|quickstart-first/1')
  assert.equal(choiceKey({ ...a, resolvedAt: '2026-10-25T00:00:00.000Z', briefMd: 'x' }), choiceKey(a))
  assert.notEqual(choiceKey({ ...a, cms: 'wordpress' }), choiceKey(a))
  assert.notEqual(choiceKey({ ...a, quickstartWorkflow: 'agent-demo/1' }), choiceKey(a))
})
