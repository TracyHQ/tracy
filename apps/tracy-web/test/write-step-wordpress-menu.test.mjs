// The main menu of a WordPress site in the write step (src/write-step/site-doors/wordpress-menu.js): its `wp_navigation`
// post edited byte for byte, labels set, items the plan does not keep cut out, an emptied dropdown made a plain link, and
// the look guard's judge of that write (look-guard-navigation.js). The JA Diner WordPress release's own navigation; the
// plugin stand-in and the labels are made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { openContentMap } from '../src/lib/content-map-source.js'
import { lookGuard } from '../src/write-step/look-guard.js'
import { navigationChange } from '../src/write-step/look-guard-navigation.js'
import { labelMember, menuEdit, writeWordpressMenu } from '../src/write-step/site-doors/wordpress-menu.js'

const contentMap = openContentMap('ja-diner/wp7/1.0.4').doc
const NAV = contentMap.navigationSource.navigations.find((n) => n.slug === 'mainmenu')
const item = (n, path, label = null, state = 'top') => ({
  item: `nav.mainmenu.${n}`,
  slot: `nav.mainmenu.${n}.label`,
  path,
  label,
  state
})
const gone = (n, path) => ({
  item: `nav.mainmenu.${n}`,
  slot: `nav.mainmenu.${n}.label`,
  path,
  why: `the plan does not keep ${path}`
})
const MENU = {
  menutype: 'mainmenu',
  items: [item(1, '/', 'Start'), item(2, '/about-us', 'Our story'), item(6, '/contact-us', null)],
  hide: [gone('1.1', '/home/home-red'), gone(3, '/reservation'), gone(4, '/offers'), gone(5, '/our-blog')]
}

test('labels are set, items cut, and nothing else of the body moves; a second run changes nothing', () => {
  const { body, outcomes } = menuEdit(NAV.content, MENU)
  assert.match(body, /"label":"Start","type":"page","id":63/)
  assert.match(body, /"label":"Our story","type":"page","id":67/)
  assert.match(body, /"label":"Contact Us"/, 'an item with no label of the writer keeps its own')
  for (const path of ['home-red', 'reservation', 'offers', 'our-blog'])
    assert.doesNotMatch(body, new RegExp(`/${path}/`))
  // Home keeps the dropdown items the plan did not name.
  assert.match(body, /wp:navigation-submenu \{"label":"Start"/)
  assert.match(body, /home-pink/)
  assert.equal(navigationChange(NAV.content, body), null)
  assert.equal(menuEdit(body, MENU).body, body)
  assert.deepEqual(outcomes.get('nav.mainmenu.3'), { done: true })
  // A label that would close the comment is written as WordPress writes one.
  assert.equal(labelMember('A -- <b>'), '"label":"A \\u002d\\u002d \\u003cb\\u003e"')
})

test('a dropdown that loses every item under it becomes a plain link with its own attributes', () => {
  const all = ['red', 'pink', 'green', 'blue'].map((c, i) => gone(`1.${i + 1}`, `/home/home-${c}`))
  const { body } = menuEdit(NAV.content, { items: [item(1, '/', 'Start')], hide: all })
  assert.ok(
    body.startsWith(
      '<!-- wp:navigation-link {"label":"Start","type":"page","id":63,"url":"https://quickstart.invalid/","kind":"post-type"} /-->\n'
    ),
    body.slice(0, 200)
  )
  assert.doesNotMatch(body, /navigation-submenu/)
  assert.equal(navigationChange(NAV.content, body), null)
})

test('a page two links lead to is not guessed, and an item already off the menu is done', () => {
  const twice = `${NAV.content}\n<!-- wp:navigation-link {"label":"Again","type":"page","id":67,"url":"https://quickstart.invalid/about-us/","kind":"post-type"} /-->`
  const { outcomes } = menuEdit(twice, {
    items: [item(2, '/about-us', 'Our story')],
    hide: [gone(9, '/gone-page')]
  })
  assert.equal(outcomes.get('nav.mainmenu.2').done, false)
  assert.equal(outcomes.get('nav.mainmenu.9').done, true)
})

/** A plugin stand-in holding the navigation posts, keeping every call. */
function plugin({ posts = [{ id: 93, slug: 'mainmenu', status: 'publish' }], refuse = null } = {}) {
  const calls = []
  let body = NAV.content
  let rev = 'r0'
  const apply = async (call) => {
    calls.push(structuredClone(call))
    const { action, params } = call
    if (refuse === action) return { ok: false, error: 'bad_params', message: 'no' }
    if (action === 'content.list') return { ok: true, items: posts }
    if (action === 'content.get')
      return { ok: true, item: { post_type: 'wp_navigation', post_content: body }, body_revision: rev }
    if (action === 'content.update') {
      if (params.expected_body_revision !== rev) return { ok: false, error: 'conflict' }
      body = params.fields.post_content
      rev = `${rev}+`
      return { ok: true }
    }
    return { ok: false, error: 'bad_action' }
  }
  return { apply, calls, body: () => body }
}

test('the post is found by its slug, read, and written once under the revision it was read at', async () => {
  const site = plugin()
  const results = await writeWordpressMenu({
    apply: site.apply,
    siteKey: 's',
    applyId: 'menu-1',
    mainMenu: MENU
  })
  assert.deepEqual(
    site.calls.map((c) => c.action),
    ['content.list', 'content.get', 'content.update']
  )
  assert.deepEqual(site.calls[0].params, {
    post_type: 'wp_navigation',
    name: 'mainmenu',
    include_body: false,
    limit: 5
  })
  assert.equal(site.calls[2].params.expected_body_revision, 'r0')
  assert.equal(site.calls[2].params.apply_id, 'menu-1')
  const label = results.get('nav.mainmenu.2.label')
  assert.deepEqual([label.status, label.ordered, label.readFrom.type], ['written', 'Our story', 'contains'])
  assert.ok(site.body().includes(label.ordered))
  assert.deepEqual(
    [results.get('nav.mainmenu.3').status, results.get('nav.mainmenu.3').ordered],
    ['written', '']
  )
  // Nothing to change: no write.
  const again = await writeWordpressMenu({
    apply: site.apply,
    siteKey: 's',
    applyId: 'menu-2',
    mainMenu: MENU
  })
  assert.equal(site.calls.filter((c) => c.action === 'content.update').length, 1)
  assert.equal(again.get('nav.mainmenu.2.label').status, 'written')
})

test('a navigation the site does not hold once, or a refused write, fails every menu line in its words', async () => {
  const none = await writeWordpressMenu({
    apply: plugin({ posts: [] }).apply,
    siteKey: 's',
    applyId: 'm',
    mainMenu: MENU
  })
  assert.match(none.get('nav.mainmenu.3').reason, /holds 0 published navigation posts named mainmenu/)
  const refused = await writeWordpressMenu({
    apply: plugin({ refuse: 'content.update' }).apply,
    siteKey: 's',
    applyId: 'm',
    mainMenu: MENU
  })
  assert.equal(refused.get('nav.mainmenu.2.label').status, 'failed')
  assert.match(refused.get('nav.mainmenu.2.label').reason, /was not written: bad_params: no/)
})

test('🔒 the look guard opens a post write only for a navigation read this run, and only for labels and cuts', async () => {
  const guard = lookGuard({ kit: { site: {} } })
  const sent = []
  const door = guard.door({
    apply: async (call) => {
      sent.push(call)
      if (call.action === 'content.get')
        return {
          ok: true,
          item:
            call.params.id === 93
              ? { post_type: 'wp_navigation', post_content: NAV.content }
              : { post_type: 'page', post_content: 'x' }
        }
      return { ok: true }
    }
  })
  const update = (id, post_content) =>
    door.apply({
      siteKey: 's',
      action: 'content.update',
      params: { apply_id: 'm', kind: 'post', id, fields: { post_content } }
    })
  // Never read: held back.
  await update(93, NAV.content)
  assert.equal(sent.length, 0)
  await door.apply({ siteKey: 's', action: 'content.get', params: { kind: 'post', id: 93 } })
  await door.apply({ siteKey: 's', action: 'content.get', params: { kind: 'post', id: 7 } })
  const held = guard.findings().length
  await update(93, menuEdit(NAV.content, MENU).body)
  assert.equal(guard.findings().length, held, 'labels and cuts are no finding')
  assert.equal(sent.filter((c) => c.action === 'content.update').length, 1)
  // A page is not a navigation: held back.
  await update(7, 'y')
  assert.equal(sent.filter((c) => c.action === 'content.update').length, 1)
  assert.ok(guard.findings().some((f) => f.what === 'post 7' && f.sent === false))
  // Anything beyond labels and cuts is a finding.
  assert.match(
    navigationChange(NAV.content, NAV.content.replace('"kind":"post-type"', '"kind":"custom"')),
    /adds or changes/
  )
  assert.match(navigationChange(NAV.content, `${NAV.content}\n<p>hi</p>`), /adds words or markup/)
  assert.match(
    navigationChange(NAV.content, NAV.content.replace('"label":"About Us"', '"label":"\\u003cb\\u003e"')),
    /not words/
  )
})
