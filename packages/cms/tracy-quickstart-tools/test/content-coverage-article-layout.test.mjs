/**
 * An article can ask for a template layout in its own attribs (`article_layout`), but since Joomla 6 that value is
 * merged only when the menu or global value is `use_article`: the page then renders default.php and nothing said so.
 * The audit checks that the page of each such article shows the asked layout's root (its classes default.php's root
 * lacks), and reports a layout with no class of its own as not checkable. Everything here is invented.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  articlesAskingLayout,
  layoutFindingsOf,
  planLayoutCheck,
  rootClassesOf
} from '../content-coverage/lib/article-layout.mjs'

function templateFolder() {
  const webroot = mkdtempSync(join(tmpdir(), 'article-layout-'))
  const dir = join(webroot, 'templates/tpl_fable/html/com_content/article')
  mkdirSync(dir, { recursive: true })
  const head = '<?php\n/* A comment that names <h1> must not count. */\ndefined("_JEXEC") or die; ?>\n'
  writeFileSync(
    join(dir, 'default.php'),
    `${head}<div class="com-content-article item-page<?php echo $this->pageclass_sfx; ?>" itemscope>\n<h1><?php echo $t; ?></h1></div>\n`
  )
  writeFileSync(
    join(dir, 'tour.php'),
    `${head}<div class="com-content-article item-page<?php echo $this->pageclass_sfx; ?> fab-trip-detail" itemscope>\n<div class="fab-itinerary"></div></div>\n`
  )
  // A layout whose root carries only default.php's classes: nothing tells the two apart.
  writeFileSync(join(dir, 'plain.php'), `${head}<div class="com-content-article">plain</div>\n`)
  return webroot
}

const dumpTables = () =>
  new Map([
    [
      'fab_content',
      [
        {
          id: 501,
          alias: 'glacier-walk',
          title: 'Glacier Walk',
          state: 1,
          attribs: '{"article_layout":"tpl_fable:tour"}'
        },
        { id: 502, alias: 'reef-days', title: 'Reef Days', state: 1, attribs: '{"article_layout":"tour"}' },
        {
          id: 503,
          alias: 'quiet-notes',
          title: 'Quiet Notes',
          state: 1,
          attribs: '{"article_layout":"tpl_fable:plain"}'
        },
        {
          id: 504,
          alias: 'old-trip',
          title: 'Old Trip',
          state: 0,
          attribs: '{"article_layout":"tpl_fable:tour"}'
        },
        { id: 505, alias: 'about-us', title: 'About Us', state: 1, attribs: '{"article_layout":""}' },
        {
          id: 506,
          alias: 'elsewhere',
          title: 'Elsewhere',
          state: 1,
          attribs: '{"article_layout":"other_tpl:tour"}'
        }
      ]
    ]
  ])

const servedTour =
  '<body class="view-article item-12"><div class="com-content-article item-page fab-trip-detail" itemscope><div class="fab-itinerary"></div></div></body>'
const servedDefault =
  '<body class="view-article item-12"><div class="com-content-article item-page" itemscope><h1>Reef Days</h1></div></body>'

test('the page of an article asking for tour.php but served with default.php is a finding; a layout with no own class cannot be checked', () => {
  const webroot = templateFolder()
  try {
    const articles = articlesAskingLayout(dumpTables(), 'fab_')
    assert.deepEqual(
      articles.map((a) => [a.id, a.asked]),
      [
        ['501', 'tpl_fable:tour'],
        ['502', 'tour'],
        ['503', 'tpl_fable:plain'],
        ['506', 'other_tpl:tour']
      ]
    )
    const plan = planLayoutCheck({ articles, webroot, template: 'tpl_fable' })
    assert.deepEqual(plan.layouts.tour.distinct, ['fab-trip-detail'])
    assert.deepEqual(plan.probe(servedTour), ['tour', 'default'])
    assert.deepEqual(plan.probe(servedDefault), ['default'])

    const pages = [
      // Article 501 is the content map page of a menu item; article 502 is reached by its alias.
      {
        url: 'http://site.test/trips/glacier',
        mapPages: [{ entity: 'menuItem-12' }],
        bodyClass: 'view-article item-12',
        html: servedTour
      },
      {
        url: 'http://site.test/trips/reef-days',
        mapPages: [],
        bodyClass: 'view-article item-13',
        html: servedDefault
      },
      // A category whose alias equals an article's is not that article's page.
      {
        url: 'http://site.test/glacier-walk',
        mapPages: [],
        bodyClass: 'view-category item-14',
        html: servedDefault
      }
    ].map(({ html, ...p }) => ({ ...p, served: plan.probe(html) }))
    const mapPages = [{ entity: 'menuItem-12', link: 'index.php?option=com_content&view=article&id=501' }]
    const r = layoutFindingsOf({ plan, mapPages, pages })

    assert.deepEqual(
      r.mismatches.map((m) => [m.article, m.asked, new URL(m.url).pathname]),
      [['502', 'tour', '/trips/reef-days']]
    )
    assert.match(
      r.mismatches[0].error,
      /^article 502 "Reef Days" asks layout tour but its page has no element with the classes "com-content-article fab-trip-detail" of tour\.php's root; it shows the root of default\.php$/
    )
    assert.equal(r.checked, 2)
    assert.deepEqual(
      r.cannotCheck.map((c) => [c.article, c.reason]),
      [['503', "the root element of plain.php has no class that default.php's root lacks"]]
    )
  } finally {
    rmSync(webroot, { recursive: true, force: true })
  }
})

test('an asked article the crawl never reached is reported as not checked, never as a pass', () => {
  const webroot = templateFolder()
  try {
    const plan = planLayoutCheck({
      articles: articlesAskingLayout(dumpTables(), 'fab_'),
      webroot,
      template: 'tpl_fable'
    })
    const r = layoutFindingsOf({ plan, mapPages: [], pages: [] })
    assert.equal(r.mismatches.length, 0)
    assert.equal(r.checked, 0)
    assert.deepEqual(
      r.cannotCheck.map((c) => [c.article, c.reason]),
      [
        ['503', "the root element of plain.php has no class that default.php's root lacks"],
        ['501', 'the crawl reached no page of it'],
        ['502', 'the crawl reached no page of it']
      ]
    )
  } finally {
    rmSync(webroot, { recursive: true, force: true })
  }
})

test('a comment marker rebuilt by stripping a comment is stripped too', () => {
  const root = rootClassesOf('<!<!-- x -->-- <p class="bad"> --><div class="item-page"></div>')
  assert.deepEqual(root?.literal, ['item-page'])
})
