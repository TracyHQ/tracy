/**
 * The fill stages of a brief build with an accepted site plan (spec TracyHQ/tracy#231, ticket #240): buttons, menus,
 * footer, the privacy page, SEO and forms take their decisions from the plan instead of deciding on their own. Read
 * against the released JA Boxing 1.0.8 content map and contract; the stage writers run as they run in the build, on the
 * brief build's site plan with the accepted plan laid over it (`site-plan-fill.js`). Fictional business: a bicycle
 * repair shop.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { planFooterNavigation } from 'website-opportunities/domain/footer-navigation.mjs'
import { formProblems } from 'website-opportunities/domain/form-blocks.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { lintContentMap } from '../src/lib/content-map-lint.js'
import { seeder } from '../src/lib/seeder.js'
import { seoMenuSteps } from '../src/sites/brief-engines/joomla-seo-stage.js'
import { writeMainMenu } from '../src/sites/brief-engines/main-menu.js'
import { completePlan } from '../src/sites/brief-engines/site-plan-defaults.js'
import { overlaySitePlan, planFill, withPlanFill } from '../src/sites/brief-engines/site-plan-fill.js'
import { inventoryOfContract } from '../src/sites/brief-engines/template-inventory.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const inventory = inventoryOfContract(contract)
const map = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const elements = new Map(inventory.elements.map((e) => [e.id, e]))

const HOME = 'page:menuItem-101'
const CLASSES = 'page:menuItem-167'
const CONTACT = 'page:menuItem-168'
const ABOUT = 'page:menuItem-193'
const NAME = 'Spokewise Cycles'
const site = {
  name: NAME,
  about: 'Spokewise Cycles repairs and services bicycles from a workshop by the canal.',
  phone: '+44 20 7946 0811',
  email: 'workshop@spokewise.example',
  address: '14 Towpath Lane, Millbrook',
  social: { instagram: 'https://instagram.com/spokewise.example' }
}

/** The author's answer: three pages kept, the rest dropped; SEO per page; one button sent to WhatsApp. */
function accepted() {
  return completePlan(
    {
      version: 'site-plan/1',
      pages: [
        {
          id: HOME,
          decision: 'keep',
          seo: {
            title: `Bicycle repairs in Millbrook | ${NAME}`,
            description: 'Repairs and servicing for every bicycle'
          }
        },
        {
          id: CLASSES,
          decision: 'keep',
          seo: { title: `Services | ${NAME}`, description: 'Servicing and repairs, open since 1987' }
        },
        { id: CONTACT, decision: 'keep', seo: 'Reach the workshop by phone or email' }
      ],
      decisions: [
        {
          element: 'button:module-156.5',
          decision: 'keep',
          action: { kind: 'whatsapp', target: site.phone }
        }
      ]
    },
    { inventory, site: { ...site, formDestinations: { newsletter: false, booking: false } } }
  )
}

/** The brief build's own site plan, as `woContent.sitePlanFor` answers it before the overlay. */
const woPlan = () => ({
  brand: { name: { value: NAME } },
  pages: [
    { id: 'home', path: '/', role: 'home', decision: 'keep' },
    { id: 'about-us', path: '/about-us', role: 'about', decision: 'keep' },
    { id: 'about-us/contact', path: '/about-us/contact', role: 'contact', decision: 'keep' },
    { id: 'classes', path: '/classes', role: 'services', decision: 'keep' },
    { id: 'plans', path: '/plans', role: 'pricing', decision: 'keep' },
    { id: 'privacy-policy', path: '/privacy-policy', role: 'privacy', decision: 'keep', create: true }
  ],
  slots: [
    {
      key: 'module-156.6',
      decision: 'value',
      value: 'index.php?Itemid=193',
      valueType: 'url',
      reason: 'button-action'
    }
  ],
  seo: {
    pages: [
      {
        id: 'classes',
        path: '/classes',
        role: 'services',
        title: 'Classes | Demo',
        description: 'Brief description.'
      }
    ]
  },
  honesty: { hide: [] },
  contact: { phone: { value: site.phone }, email: { value: site.email } }
})

test('every kept button takes the plan action as a real link, never a dead or demo link', () => {
  const plan = accepted()
  const fill = planFill(plan, { inventory })
  const kept = plan.decisions.filter(
    (d) => ['button', 'link'].includes(elements.get(d.element)?.kind) && d.decision === 'keep'
  )
  assert.ok(kept.length > 3, 'the kept pages hold several buttons')
  for (const d of kept) {
    const e = elements.get(d.element)
    const urlKey = e.kind === 'link' ? e.key : e.urlKey
    if (!urlKey || ['control', 'item'].includes(d.action?.kind)) continue
    const href = fill.buttons[urlKey]
    assert.ok(href, `${d.element} has a link`)
    assert.match(
      href,
      /^(?:tel:\+\d{7,}|mailto:\S+@\S+|https:\/\/wa\.me\/\d+|index\.php\?Itemid=(?:101|167|168))$/
    )
  }
  assert.equal(fill.buttons['module-156.6'], 'https://wa.me/442079460811')
  // A demo `#` link of a call-to-action reaches the business instead.
  assert.equal(fill.buttons['article-2.8'], 'tel:+442079460811')
  // A button with no real action is listed for the engine to take off, with its link.
  for (const d of plan.decisions.filter(
    (x) => elements.get(x.element)?.kind === 'button' && x.decision === 'hide'
  ))
    assert.ok(fill.hidden.includes(elements.get(d.element).key))
  // The overlay replaces the declared demo link of the same key.
  const over = overlaySitePlan(woPlan(), fill)
  const declared = over.slots.filter((s) => s.key === 'module-156.6')
  assert.deepEqual(
    declared.map((s) => s.value),
    ['https://wa.me/442079460811']
  )
  assert.ok(!over.slots.some((s) => s.reason === 'button-action' && /^#?$/.test(String(s.value))))
})

test('the menu and the footer list exactly the plan pages; a dropped page is listed to unpublish', async () => {
  const fill = planFill(accepted(), { inventory })
  const over = overlaySitePlan(woPlan(), fill)
  const keptPaths = over.pages.filter((p) => p.decision === 'keep').map((p) => p.path)
  assert.deepEqual(keptPaths.sort(), ['/', '/about-us/contact', '/classes', '/privacy-policy'])
  const about = fill.pages.find((p) => p.id === ABOUT)
  assert.equal(about.decision, 'drop')
  assert.equal(about.menuId, 193)
  assert.equal(over.pages.find((p) => p.id === 'about-us').decision, 'drop')
  // The footer columns list every kept page and nothing else.
  const footer = planFooterNavigation({
    sitePlan: over,
    groups: [{ id: 'footer-company', holds: 'company' }],
    items: keptPaths.map((p) => ({ path: p })),
    offeringPages: []
  })
  assert.deepEqual(footer.targets.map((t) => t.path).sort(), keptPaths)
  // The main menu writes exactly the kept pages it holds.
  const rows = keptPaths.map((p, i) => ({ key: String(i), path: p, label: '', parent: '', menu: 'mainmenu' }))
  let current = structuredClone(rows)
  const out = await writeMainMenu({
    sitePlan: over,
    read: async () => structuredClone(current),
    write: async (values) => {
      current = current.map((r) => ({ ...r, label: values.find((v) => v.key === r.key)?.label ?? r.label }))
    },
    model: {
      chat: async () =>
        JSON.stringify({ labels: { 0: 'Home', 1: 'Contact', 2: 'Services', 3: 'Privacy Policy' } })
    }
  })
  assert.deepEqual(out.items.map((i) => i.path).sort(), keptPaths)
})

test('the privacy page follows the plan: dropped when the plan drops it', () => {
  const plan = { ...accepted(), legal: { privacy: { decision: 'drop', reason: 'no business name' } } }
  const over = overlaySitePlan(woPlan(), planFill(plan, { inventory }))
  assert.equal(over.pages.find((p) => p.role === 'privacy').decision, 'drop')
  assert.equal(accepted().legal.privacy.decision, 'add')
})

test('SEO titles and descriptions follow the plan intent, never an unsourced fact', async () => {
  const facts = await seeder('fact-sources')
  const brief = [...facts.sourceTexts(site).values()].join(' \n ')
  const fill = planFill(accepted(), { inventory, refuse: (t) => facts.factsNotIn(t, brief, site) })
  const over = overlaySitePlan(woPlan(), fill)
  const classes = over.seo.pages.find((p) => p.id === 'classes')
  assert.equal(classes.title, `Services | ${NAME}`)
  // "open since 1987" is a year the brief does not state: the description from the brief stays.
  assert.equal(classes.description, 'Brief description.')
  const home = over.seo.pages.find((p) => p.id === 'home')
  assert.equal(home.title, `Bicycle repairs in Millbrook | ${NAME}`)
  assert.equal(home.description, 'Repairs and servicing for every bicycle.')
  // The menu entry of the page takes the planned title.
  const steps = seoMenuSteps({
    rows: [
      { id: 167, path: 'classes', home: 0, published: 1, type: 'component', title: 'Classes', params: '{}' }
    ],
    plans: over.seo.pages
  })
  assert.equal(JSON.parse(steps[0].fields.params).page_title, `Services | ${NAME}`)
})

test('a form with no real destination is hidden; the contact form with the owner email is kept', () => {
  const plan = accepted()
  const decided = (/** @type {string} */ id) => plan.decisions.find((d) => d.element === id)
  assert.equal(decided('form:module-169').decision, 'hide')
  assert.match(decided('form:module-169').reason, /email-marketing list/)
  assert.equal(decided('form:module-16').decision, 'hide')
  assert.deepEqual(decided('form:contact-1').sendsTo, { kind: 'email', target: site.email })
  const over = overlaySitePlan(woPlan(), planFill(plan, { inventory }))
  assert.deepEqual(over.honesty.hide.map((h) => [h.entity, h.reason]).sort(), [
    ['module-16', 'no-form-destination'],
    ['module-169', 'no-form-destination']
  ])
  // A verified list keeps the sign-up form, with where it sends.
  const listed = completePlan(
    { pages: [{ id: HOME, decision: 'keep' }] },
    { inventory, site: { ...site, formDestinations: { newsletter: true } } }
  )
  assert.equal(listed.decisions.find((d) => d.element === 'form:module-169').decision, 'keep')
})

test('the content map declares its forms, and the readiness checker reports a map that does not', () => {
  assert.deepEqual(formProblems(map), [])
  assert.ok(inventory.elements.filter((e) => e.kind === 'form').every((e) => e.declared))
  const { forms: _, ...undeclared } = map
  const found = lintContentMap(undeclared).findings.filter((f) => f.rule === 'form-undeclared')
  assert.deepEqual(found.map((f) => f.key).sort(), ['contact-1', 'module-16', 'module-169'])
})

test('with no accepted plan the stages read the brief build plan unchanged', async () => {
  assert.equal(planFill(null, { inventory }), null)
  const plan = woPlan()
  assert.equal(overlaySitePlan(plan, null), plan)
  const door = { sitePlanFor: async () => plan, briefFor: async () => 'brief' }
  assert.equal(withPlanFill(door, null), door)
  const over = withPlanFill(door, planFill(accepted(), { inventory }))
  assert.equal(await over.briefFor(), 'brief')
  assert.equal((await over.sitePlanFor({})).pages.find((p) => p.id === 'about-us').decision, 'drop')
})
