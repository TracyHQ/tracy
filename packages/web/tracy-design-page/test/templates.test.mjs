/**
 * The finished sites on the public page: one Publish, two surfaces.
 *
 * The page is built once and cached in an image; the cards are published on a release minutes ago.
 * So the cards must NOT be baked into `catalog.json` — the page asks Tracy at load, on the same
 * origin that served it, with no seat. What is tested here is everything that happens after the
 * answer arrives, because every one of its failure modes is silent on a page nobody is watching.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildUrl,
  DESIGN_SYSTEMS_DOOR,
  fetchDesignSystemsShown,
  fetchTemplates,
  listRows,
  mergeTemplates,
  TEMPLATES_DOOR
} from '../src/templates.mjs'

const body = {
  templates: [
    {
      id: 'tracy-business',
      label: 'Tracy Business',
      card: {
        provider: 'JoomlArt',
        category: 'Professional & Corporate',
        image: 'https://cowork.tracy.site/api/templates/tracy-business/shots/home.png',
        demo: { url: 'https://business-emdash.tracy.site', version: '1.0.0' },
        layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: 'home-1440.png' } }]
      },
      platforms: [
        { platform: 'joomla', tag: 'tracy-business/j6', version: '1.0.0' },
        { platform: 'emdash', tag: 'tracy-business/emdash-0.x', version: '1.0.0' }
      ]
    }
  ]
}

const answering = (payload, status = 200) => {
  const asked = []
  const fetchImpl = async (url) => {
    asked.push(String(url))
    return new Response(JSON.stringify(payload), { status })
  }
  return { asked, fetchImpl }
}

test('the page asks Tracy on its own origin, and keeps only pictures it can actually fetch', async () => {
  const { asked, fetchImpl } = answering(body)
  const rows = await fetchTemplates(fetchImpl)
  assert.deepEqual(asked, [TEMPLATES_DOOR])
  assert.equal(TEMPLATES_DOOR, '/api/templates', 'same origin, no seat — the door tracy-web answers')
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.equal(row.name, 'Tracy Business')
  assert.equal(row.provider, 'JoomlArt')
  assert.deepEqual(row.platforms, ['joomla', 'emdash'])
  // 🔒 AN ADDRESS SURVIVES, A BARE NAME DOES NOT. `template/<id>/<file>` is a door of the plugin's
  // host half inside dsh; there is no dsh behind this page, so that address 404s for every visitor
  // and the card must simply draw no picture instead.
  assert.equal(row.template.image, body.templates[0].card.image)
  assert.equal(row.template.layouts[0].shots.desktop, null)
  assert.equal(row.template.demo.url, 'https://business-emdash.tracy.site')
})

test('a door that does not answer leaves the 152 design systems standing', async () => {
  const warned = []
  const warn = (...args) => warned.push(args.join(' '))
  assert.deepEqual(await fetchTemplates(async () => new Response('', { status: 502 }), warn), [])
  assert.deepEqual(
    await fetchTemplates(async () => {
      throw new TypeError('Failed to fetch')
    }, warn),
    []
  )
  // A body of the wrong shape is no answer either — half a card is worse than none.
  assert.deepEqual(await fetchTemplates(answering({ templates: 'soon' }).fetchImpl, warn), [])
  assert.equal(warned.length, 3, 'every refusal says which door it was')
  for (const line of warned) assert.match(line, /\/api\/templates/)
  // An empty list is an ANSWER: this deployment has published no finished sites.
  assert.deepEqual(await fetchTemplates(answering({ templates: [] }).fetchImpl, warn), [])
  assert.equal(warned.length, 3, 'an empty answer is not a warning')
})

test('the finished sites lead the list, and no id is drawn twice', () => {
  const catalog = [
    { id: 'apple', name: 'Apple', category: 'Tech' },
    { id: 'tracy-business', name: 'A design system of the same name', category: 'Tech' }
  ]
  const templates = [{ id: 'tracy-business', name: 'Tracy Business', template: { image: null } }]
  const merged = mergeTemplates(catalog, templates)
  assert.deepEqual(
    merged.map((r) => r.id),
    ['tracy-business', 'apple']
  )
  assert.equal(merged[0].name, 'Tracy Business', 'the finished site wins its own id')
  // Nothing published yet, or a door that refused: the list is exactly the catalog.
  assert.deepEqual(mergeTemplates(catalog, []), catalog)
  assert.deepEqual(mergeTemplates([], templates), templates)
})

// 24/09: the operator switch on Quickstarts decides whether the 152 design systems are offered
// at all, off by default. Off keeps the finished sites (ja-kinetic among them, whose id a design
// system shares). Since 03/10 the list carries no brand and no Community shelf at all.
test('the switch drops the design systems by kind, and leaves the finished sites', () => {
  const catalog = [
    { id: 'apple', name: 'Apple', category: 'Tech' },
    { id: 'ja-kinetic', name: 'A design system of the same name', category: 'Tech' }
  ]
  const templates = [{ id: 'ja-kinetic', name: 'JA Kinetic', template: { image: null } }]
  const ids = (systemsShown) => listRows({ catalog, templates, systemsShown }).map((r) => r.id)

  assert.deepEqual(ids(false), ['ja-kinetic'])
  const off = listRows({ catalog, templates, systemsShown: false })
  assert.equal(off[0].name, 'JA Kinetic', 'the finished site stays, not the design system of its id')
  // On: the finished site, then the library without the id it already took.
  assert.deepEqual(ids(true), ['ja-kinetic', 'apple'])
  assert.deepEqual(listRows({ catalog, templates, systemsShown: true }), mergeTemplates(catalog, templates))
})

test('the design systems are shown only on a plain yes from Tracy', async () => {
  const { asked, fetchImpl } = answering({ shown: true })
  assert.equal(await fetchDesignSystemsShown(fetchImpl), true)
  assert.deepEqual(asked, [DESIGN_SYSTEMS_DOOR])
  assert.equal(DESIGN_SYSTEMS_DOOR, '/api/design-systems')
  assert.equal(await fetchDesignSystemsShown(answering({ shown: false }).fetchImpl), false)
  // A switch that cannot be read is off: a refusal, a throw, a body of another shape.
  assert.equal(await fetchDesignSystemsShown(answering({ shown: true }, 502).fetchImpl), false)
  assert.equal(await fetchDesignSystemsShown(answering({ shown: 'yes' }).fetchImpl), false)
  assert.equal(
    await fetchDesignSystemsShown(async () => {
      throw new TypeError('Failed to fetch')
    }),
    false
  )
})

// 19/09, measured on the dev surface: pressing Create sent EVERY visitor to the sign-in form,
// including one already signed in — `/login?next=…` was written into the link itself, and the
// sign-in door answers 200 with a form whether or not a session cookie is present. The report, from
// someone with a live session on `cowork.tracy.site` in the same browser: *"why does pressing it from
// design inspiration (the public version) keep making me log in?"*
//
// The link now names the DESTINATION, and the destination decides. `/new/` admits a signed-in
// visitor straight away and redirects one without a session to `/login?next=/new/…`, which comes
// back to the same place — one road instead of a link that has already made up its mind.
// `/agent` goes too: `workspace/scope.js` keeps it only as a Worker-era alias it folds onto
// `/new/`, so writing it into a NEW link is writing tomorrow's dead end.
test('Create with goes straight to the creation workspace, which decides about signing in', () => {
  const system = { id: 'apple', name: 'Apple', category: 'Tech' }
  const template = { id: 'tracy-business', name: 'Tracy Business', template: { image: null } }
  // A design system: the creation workspace with the visitor's domain to fork.
  assert.equal(
    buildUrl('cobabakery.com', system, 'wordpress'),
    '/new/?fork=cobabakery.com&inspiration=apple&platform=wordpress'
  )
  assert.equal(buildUrl(null, system, 'joomla'), '/new/?inspiration=apple&platform=joomla')
  // No link Tracy writes today decides for the visitor that they must sign in.
  for (const url of [buildUrl('x.com', system, 'joomla'), buildUrl(null, template, 'emdash')]) {
    assert.ok(!url.startsWith('/login'), `${url} must not pre-empt the session`)
    assert.ok(!url.includes('/agent'), `${url} must not use the Worker-era alias`)
  }
  // 🔒 A FINISHED SITE FORKS NOTHING. `?fork=` starts a brand extraction on the new site, which is
  // what a design system wants — it is about to wear the visitor's brand. A template IS the site,
  // words and all, so carrying the domain would set a job running that nothing ever reads.
  assert.equal(
    buildUrl('cobabakery.com', template, 'joomla'),
    '/new/?inspiration=tracy-business&platform=joomla'
  )
  // The id on the address is the template id, which the create door resolves to this platform's
  // release (`isTemplateId` / `templateRelease` in apps/tracy-web/src/sites/route.js).
  assert.match(buildUrl(null, template, 'emdash'), /inspiration=tracy-business/)
})

// Spec 4.7 #40: a visitor who came from a demo banner (or an email, or the blog) keeps the campaign
// on the way to `/new/`, which hands it to `/login`; nothing else of this page's address follows.
test('Create with carries the four utm_* of this page, and only them', () => {
  const template = { id: 'ja-vega', name: 'JA Vega', template: { image: null } }
  const search =
    '?open=ja-vega&provider=JoomlArt&utm_source=joomlart&utm_medium=demo&utm_campaign=tracy-beta-2026-10&utm_content=ja-vega&utm_term=x'
  const url = new URL(buildUrl(null, template, 'joomla', search), 'https://cowork.tracy.ai')
  assert.equal(url.pathname, '/new/')
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    inspiration: 'ja-vega',
    platform: 'joomla',
    utm_source: 'joomlart',
    utm_medium: 'demo',
    utm_campaign: 'tracy-beta-2026-10',
    utm_content: 'ja-vega'
  })
  // A page reached with no campaign writes none, and an empty value is not a value.
  assert.equal(buildUrl(null, template, 'joomla', ''), '/new/?inspiration=ja-vega&platform=joomla')
  assert.equal(
    buildUrl(null, template, 'joomla', '?utm_medium=&open=ja-vega'),
    '/new/?inspiration=ja-vega&platform=joomla'
  )
})
