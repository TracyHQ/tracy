/**
 * 🔒 EVERY SITE HAS A PRIVACY POLICY PAGE IN THE BUSINESS'S NAME (spec TracyHQ/tracy#189, COO criterion 10.1, stage H).
 * The page plan of a template with no legal page plans one; the Joomla writer creates it in the template's plain article layout,
 * the footer link column lists it, its words come from the brief's facts only, and the final check judges it on the served
 * pages. Run on a released Joomla template's content map for two made-up businesses: a plumber with a mailbox (so a contact
 * form) and a florist with a phone alone (no form).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

import { buildBlockers } from 'website-opportunities/domain/build-blockers.mjs'
import { planSite } from 'website-opportunities/domain/site-plan.mjs'
import { contractFor, defaultContracts } from '../src/lib/contracts.js'
import { checkPrivacyPolicy } from '../src/opportunities-build/privacy-policy-check.js'
import { writeJoomlaFooterNavigation } from '../src/sites/brief-engines/footer-navigation-joomla.js'
import { writeJoomlaPrivacyPage } from '../src/sites/brief-engines/joomla-privacy-page.js'

const contract = contractFor(defaultContracts(), 'quickstart/ja-boxing/j6', '1.0.8')
const MAP = JSON.parse(readFileSync(path.join(contract.dir, 'content-map.json'), 'utf8'))
const NOW = '2026-10-30T00:00:00Z'

const plumber = {
  business: {
    name: 'Pipeworks Plumbing',
    description: 'Emergency plumbing',
    email: 'fix@pipeworks.example',
    phone: '+1 555 030 0100'
  },
  primaryAction: { label: 'Call us', channel: 'contact', href: null, basis: 'sourced', evidence: [] }
}
const florist = {
  business: { name: 'Petal Row Florist', description: 'Wedding flowers', phone: '+1 555 040 0200' },
  primaryAction: { label: 'Call us', channel: 'contact', href: null, basis: 'sourced', evidence: [] }
}
const served = {
  questions: [
    { id: 'name', kind: 'text' },
    {
      id: 'pages',
      kind: 'multi',
      feeds: ['site.pages'],
      options: MAP.pages.map((p) => p.route),
      locked: ['home']
    }
  ]
}
const planOf = (brief) => planSite(brief, served, { now: NOW, contentMap: MAP })

/** A made-up Joomla site holding the kept pages, the template's two footer menus and a category; records are in memory. */
function fakeSite(sitePlan) {
  const menu = []
  const articles = []
  const modules = [
    { id: 173, title: 'CLASSES', published: 1 },
    { id: 174, title: 'SITE MAP', published: 1 }
  ]
  let next = 900
  sitePlan.pages
    .filter((p) => p.decision === 'keep' && !p.create)
    .forEach((p, i) =>
      menu.push({
        id: 10 + i,
        menutype: 'mainmenu',
        path: p.path === '/' ? 'home' : p.id,
        home: p.path === '/' ? 1 : 0,
        type: 'component',
        link: 'index.php?option=com_content&view=article&id=1',
        published: 1,
        title: p.id,
        lft: i + 1
      })
    )
  for (const [i, id] of [184, 185, 186, 187].entries())
    menu.push({
      id,
      menutype: 'site-map',
      path: `demo-${id}`,
      type: 'url',
      link: '#',
      published: 1,
      title: `Demo ${id}`,
      lft: 100 + i
    })
  const menutypes = new Set(['mainmenu', 'site-map', 'classes'])
  const writes = []
  const table = {
    menuItem: menu,
    article: articles,
    module: modules,
    category: [{ id: 2, alias: 'uncategorised', parent_id: 1 }]
  }
  const one = (op) => {
    writes.push(op)
    const rows = table[op.kind]
    if (op.kind === 'menutype') {
      menutypes.add(op.fields.menutype)
      return { ok: true, id: 1 }
    }
    if (!rows) return { ok: false, message: `unknown kind ${op.kind}` }
    if (Number(op.id) === 0) {
      const row = { id: next++, lft: 1000 + next, ...op.fields }
      if (op.kind === 'menuItem') row.path = op.fields.alias
      rows.push(row)
      return { ok: true, id: row.id }
    }
    Object.assign(rows.find((r) => Number(r.id) === Number(op.id)) ?? {}, op.fields)
    return { ok: true, id: op.id }
  }
  const apply = async ({ action, params }) => {
    if (action === 'content.list')
      return {
        ok: true,
        items: (table[params.kind] ?? []).slice(params.offset, params.offset + params.limit)
      }
    if (action === 'content.get') {
      const item = table[params.kind]?.find((r) => Number(r.id) === Number(params.id))
      return item ? { ok: true, item } : { ok: false, message: 'not found' }
    }
    if (action === 'content.update') return one({ kind: params.kind, id: params.id, fields: params.fields })
    if (action === 'content.batch') {
      for (const op of params.operations) one(op)
      return { ok: true }
    }
    return { ok: false, message: `unsupported ${action}` }
  }
  return { apply, table, writes, menutypes }
}

const model = {
  chat: async () =>
    JSON.stringify({
      headings: { 'footer-offerings': 'Offers', 'footer-company': 'The business' },
      labels: {}
    })
}
// The main menu's short labels (the template's footer links hold seven characters).
const labelsOf = (sitePlan) =>
  Object.fromEntries(
    sitePlan.pages
      .filter((p) => p.decision === 'keep' && p.role !== 'privacy')
      .map((p, i) => [p.id, `Pg ${i + 1}`])
  )

async function build(brief) {
  const sitePlan = planOf(brief)
  const site = fakeSite(sitePlan)
  const privacy = await writeJoomlaPrivacyPage({ apply: site.apply, siteKey: 's', sitePlan })
  const footer = await writeJoomlaFooterNavigation({
    apply: site.apply,
    siteKey: 's',
    sitePlan,
    model,
    locale: 'en',
    contentMap: MAP,
    known: labelsOf(sitePlan)
  })
  return { sitePlan, site, privacy, footer }
}

for (const [label, brief, hasForm, channels] of [
  ['a plumber with a mailbox', plumber, true, ['fix@pipeworks.example', '+1 555 030 0100']],
  ['a florist with a phone alone', florist, false, ['+1 555 040 0200']]
]) {
  test(`${label}: the plan plans one Privacy Policy page; the writer creates it, the footer lists it, only the brief's channels are named`, async () => {
    const { sitePlan, site, privacy, footer } = await build(brief)
    const row = sitePlan.pages.filter((p) => p.role === 'privacy')
    assert.equal(row.length, 1, 'one privacy page in the plan')
    assert.equal(row[0].create, true)
    assert.equal(row[0].decision, 'keep')
    assert.equal(sitePlan.pagePlan.keep.includes(row[0].id), false, 'not an option of the create door')
    // The page exists, in the business's name.
    assert.ok(privacy.created)
    const article = site.table.article.find((a) => a.alias === 'privacy-policy')
    assert.equal(article.title, 'Privacy Policy')
    assert.ok(article.introtext.includes(brief.business.name))
    assert.equal(article.state, 1)
    // It has a menu entry no module shows, and the footer link column links it.
    const entry = site.table.menuItem.find((m) => m.alias === 'privacy-policy')
    assert.equal(entry.params, JSON.stringify({ menu_show: 0 }))
    const links = site.table.menuItem.filter((m) => m.menutype === 'site-map' && Number(m.published) === 1)
    const link = links.find((m) => /^Privacy/.test(m.title))
    assert.ok(link, `the footer lists it: ${links.map((m) => m.title).join(', ')}`)
    assert.ok([...link.title].length <= 7, 'fits the template footer link (seven characters)')
    assert.equal(link.link, `index.php?Itemid=${entry.id}`)
    assert.ok(footer.columns.some((c) => c.links.some((l) => l.role === 'privacy')))
    // Only the channels the brief has; the contact form only where there is a mailbox.
    const text = article.introtext.replace(/<[^>]+>/g, ' ')
    for (const c of channels) assert.ok(text.includes(c) || c.startsWith('+'), c)
    assert.equal(/contact form/i.test(text), hasForm)
    assert.equal(text.includes('@'), hasForm)
    assert.match(text, /Contact us at .+ about your data\./)
    assert.equal(/analytics|cookies/i.test(text), false, 'no analytics or cookies the site does not use')
    assert.equal(
      /\b(GDPR|CCPA|law|act|registered|20\d\d)\b/i.test(text),
      false,
      'no invented law, registration or date'
    )
  })

  test(`${label}: the final check passes on the served pages and reports a missing, unlinked, unnamed or demo page`, async () => {
    const { sitePlan } = await build(brief)
    const name = brief.business.name
    const footer =
      '<footer><ul class="nav"><li><a href="/privacy-policy">Privacy Policy</a></li></ul></footer>'
    const policy = (body) => ({
      path: '/privacy-policy',
      status: 200,
      html: `<html><body><h1>Privacy Policy</h1>${body}${footer}</body></html>`
    })
    const good = policy(
      `<p>This page explains how ${name} uses the personal details. Contact us at ${channelsOf(brief)} about your data.</p>`
    )
    const home = { path: '/', status: 200, html: `<html><body><h1>Home</h1>${footer}</body></html>` }
    const run = (pages, plan = sitePlan) => checkPrivacyPolicy({ pages, sitePlan: plan, brief })
    assert.deepEqual(run([home, good]), [])
    assert.match(run([home])[0].why, /no Privacy Policy page/)
    assert.match(
      run([
        { ...home, html: '<html><body><footer><a href="/about">About</a></footer></body></html>' },
        good
      ])[0].why,
      /not linked from the footer/
    )
    assert.match(
      run([home, policy('<p>Hello. Contact us at x about your data.</p>')])
        .map((f) => f.why)
        .join('|'),
      /does not name the business/
    )
    assert.match(
      run([home, policy(`<p>${name}. Lorem ipsum dolor sit amet.</p>`)])
        .map((f) => f.why)
        .join('|'),
      /demo text/
    )
    assert.match(
      run([home, policy(`<p>${name}. Mail other@elsewhere.example.</p>`)])
        .map((f) => f.why)
        .join('|'),
      /email the brief does not hold/
    )
    const none = { ...sitePlan, pages: sitePlan.pages.filter((p) => p.role !== 'privacy') }
    assert.match(run([home, good], none)[0].why, /plan has no Privacy Policy page/)
    // A finding of the rule stops the build as "Needs fixes".
    const judged = buildBlockers({ findings: run([home]) })
    assert.equal(judged.state, 'needs-fixes')
    assert.deepEqual(
      judged.items.map((i) => i.rule),
      ['privacy-policy']
    )
  })
}

const channelsOf = (brief) => brief.business.email ?? brief.business.phone

test('a template with a terms page of its own keeps it as the Privacy Policy and the other demo legal pages go', () => {
  const pages = [{ id: 'home', home: true }, { id: 'about' }, { id: 'terms-of-use' }, { id: 'cookie-policy' }]
  const plan = planSite(
    plumber,
    {
      questions: [
        {
          id: 'pages',
          kind: 'multi',
          feeds: ['site.pages'],
          options: pages.map((p) => p.id),
          locked: ['home']
        }
      ]
    },
    { now: NOW }
  )
  const byId = Object.fromEntries(plan.pages.map((p) => [p.id, p]))
  assert.equal(plan.pages.filter((p) => p.role === 'privacy' && p.decision === 'keep').length, 1)
  assert.equal(
    plan.pages.some((p) => p.create),
    false
  )
  assert.equal(byId['terms-of-use'].role, 'privacy')
  assert.equal(byId['cookie-policy'].decision, 'drop')
})
