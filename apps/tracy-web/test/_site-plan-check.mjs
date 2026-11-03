// The passing plan of the site plan checker tests (ADR 0041) and the assertions every rule test shares.
// Each rule test copies the plan, breaks exactly one thing and checks that only the rule under test notices.
import assert from 'node:assert/strict'
import { checkPlan } from '../src/site-planner/plan-check/check-plan.js'
import { hide, keptBlocks } from './_site-plan-check-blocks.mjs'
import { brief, kit } from './_site-plan-check-inputs.mjs'

export { keepHidingAll } from './_site-plan-check-blocks.mjs'
export { brief, kit } from './_site-plan-check-inputs.mjs'

// Pages kept: Home, About us, Contact, Classes and one class page. Every other group is dropped.
const KEPT_GROUPS = ['group-home', 'group-about-us', 'group-about-us_contact', 'group-classes']
const DROPPED_CLASS_PAGES = [
  'page-classes_beginner-boxing',
  'page-classes_group-boxing',
  'page-classes_private-training'
]

// The plan that passes every rule the script can check.
export function plan() {
  const k = kit()
  const kitPage = (id) => k.pages.find((p) => p.id === id)
  const order = (id) => kitPage(id).blocks['1440']
  const isShared = (id) => k.blocks.find((b) => b.id === id).shared === true
  const kept = keptBlocks(k)
  const decide = (id) => kept[id] ?? hide(id)
  const sharedIds = [
    ...new Set(KEPT_GROUPS.flatMap((g) => k.pages.filter((p) => p.group === g)).flatMap((p) => order(p.id)))
  ].filter(isShared)
  const page = (id, slug, extra = {}) => {
    const blocks = order(id).filter((b) => !isShared(b))
    const story = order(id)
      .filter((b) => kept[b] && !['header', 'footer'].includes(k.blocks.find((x) => x.id === b).role))
      .map((block) => ({ block, step: 'what this block tells the visitor' }))
    return {
      id,
      decision: 'keep',
      why: 'the visitor needs it',
      ...(slug ? { slug } : {}),
      story,
      blocks: blocks.map(decide),
      ...extra
    }
  }
  return {
    version: 'site-plan/3',
    kit: 'tracy-template-kit/2 ja-boxing/j6/1.0.10',
    brief: 'opp-harbour-sport-club',
    site: {
      language: 'en',
      primaryAction: {
        intent: 'book a first lesson',
        leadsTo: 'page-about-us_contact',
        factIds: ['f-phone']
      },
      contactChannels: [
        { kind: 'phone', factId: 'f-phone' },
        { kind: 'map', factId: 'f-address' }
      ],
      legalPages: [
        { kind: 'privacy', use: 'create', slug: 'privacy-policy', says: 'how contact details are used' }
      ],
      notFound: { says: 'page not found, back to the start', leadsTo: ['page-home'] },
      forms: [
        { block: 'block-169', decision: 'hide', why: 'the brief names no newsletter' },
        { block: 'body-about-us_contact', decision: 'hide', why: 'the brief does not say where answers go' }
      ],
      footerMenu: [
        {
          group: 'nav-block-173',
          heading: { says: 'Lessons', page: 'page-classes' },
          pages: ['page-classes_advanced-boxing']
        },
        {
          group: 'nav-block-174',
          heading: { says: 'Club' },
          pages: ['page-about-us', 'page-about-us_contact', 'legal:privacy']
        }
      ]
    },
    pageGroups: k.pageGroups.map((g) => ({
      id: g.id,
      decision: KEPT_GROUPS.includes(g.id) ? 'keep' : 'drop',
      why: 'fits the business or not'
    })),
    mainMenu: [
      { page: 'page-home' },
      { page: 'page-classes', children: [{ page: 'page-classes_advanced-boxing' }] },
      { page: 'page-about-us', children: [{ page: 'page-about-us_contact' }] }
    ],
    sharedBlocks: sharedIds.map(decide),
    pages: [
      page('page-home', null),
      page('page-about-us', 'about-us'),
      page('page-about-us_contact', 'contact'),
      page('page-classes', 'classes'),
      page('page-classes_advanced-boxing', 'advanced-boxing'),
      ...DROPPED_CLASS_PAGES.map((id) => ({ id, decision: 'drop', why: 'one class page is enough' }))
    ],
    ownerTasks: [
      {
        what: 'confirm the button wording',
        why: 'it was written from trade knowledge',
        unblocks: 'publishing',
        about: 'block-176'
      }
    ],
    kitGaps: []
  }
}

// The decision of one block, wherever the plan holds it (sharedBlocks or a page).
export function decisionOf(p, block) {
  return [...p.sharedBlocks, ...p.pages.flatMap((pg) => pg.blocks ?? [])].find((d) => d.block === block)
}

export const check = (p) => checkPlan({ plan: p, kit: kit(), brief: brief() })

// Ids of the rules that fail on a plan.
export const failing = (p) =>
  check(p)
    .rules.filter((r) => r.status === 'fail')
    .map((r) => r.id)

// The result of one rule on a plan.
export const ruleOf = (p, id) => check(p).rules.find((r) => r.id === id)

let baseResult = null
export const base = () => (baseResult ??= check(plan()))

// Break one thing in the passing plan, then check: the rule passed before, it is the only rule failing now, and
// one of its failures says why. Returns the rule's result on the broken plan.
export function breaks(id, mutate, detail) {
  assert.equal(base().rules.find((r) => r.id === id).status, 'pass', `${id} passes on the base plan`)
  const p = plan()
  mutate(p)
  assert.deepEqual(failing(p), [id])
  const r = ruleOf(p, id)
  assert.ok(
    r.failures.some((f) => detail.test(f.detail)),
    r.failures.map((f) => f.detail).join('\n')
  )
  return r
}
