/**
 * The reach graph counts every link occurrence: a page linked from the hero and from a menu entry the showcase map
 * hides is reached through the hero. The audit's merged link items kept one occurrence per address, so on JA Voyara
 * 1.0.12 the footer and hero links into the "Pages" branch were lost behind their hidden menu entries.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hiddenSelectorOf, pageKeyOf, reachOf } from '../content-coverage/lib/reach.mjs'

test('a page linked from a hidden menu entry and from the hero is reached; one linked only from hidden places is not', () => {
  const l = (target, hidden = false) => ({ target, hidden })
  const links = new Map([
    ['/', [l('/pages/about', true), l('/pages/about'), l('/pages/writers', true)]],
    ['/pages/about', [l('/pages/team')]],
    ['/pages/team', []],
    ['/pages/writers', [l('/pages/writers/author/x')]],
    ['/pages/writers/author/x', []]
  ])
  const { reached, unreached } = reachOf({ home: '/', links })
  assert.deepEqual([...reached.keys()].sort(), ['/', '/pages/about', '/pages/team'])
  assert.equal(reached.get('/pages/team'), '/pages/about')
  assert.deepEqual(unreached, ['/pages/writers', '/pages/writers/author/x'])
})

test('a hidden menu item is matched in the menu module and in the T4 mega menu; kit containers are added as given', () => {
  assert.equal(
    hiddenSelectorOf({ menuIds: ['270', 'x', '270'], containers: ['.voy-author-box'] }),
    'li.item-270, li[data-id="270"], .voy-author-box'
  )
})

test('one key per page: index.php, Itemid, case and the list position', () => {
  const routes = new Map([
    ['101', 'home'],
    ['275', 'pages/contact']
  ])
  const k = (u) => pageKeyOf(u, 'http://site.test/', routes)
  assert.equal(k('http://site.test/index.php/index.php/Pages/Writers/'), '/pages/writers')
  assert.equal(k('/index.php?Itemid=275'), '/pages/contact')
  assert.equal(k('/index.php?Itemid=101'), '/')
  assert.equal(k('/index.php/pages/blog?start=9&foo=1'), '/pages/blog?start=9')
})
