// detect-source.test.mjs — the skill works out what a source IS, so the person does not have to.
//
// A person asks in one sentence: "turn this site into an EmDash template". Every decision beyond
// that sentence belongs to the skill. These cases are the ones that decide whether it takes the
// right road, and each of them was met on a real site while this was written.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { detectFromHtml, reachOf, roadFor, suggestNames } from '../ingest/detect-source.mjs'

const joomla = `<html lang="en"><head><meta name="generator" content="Joomla! - Open Source Content Management">
<title>Home</title><script src="/media/system/js/core.js"></script></head>
<body class="com_content"><a href="/index.php?option=com_content&view=article&id=3">x</a>
<div class="joomla-modal"></div><script src="/media/vendor/bootstrap/js/bootstrap.js"></script></body></html>`

const joomlaT4 = joomla.replace(
  '</head>',
  '<link href="/templates/mytpl/css/t4-assets.css" rel="stylesheet"></head>'
)

const wordpress = `<html lang="en"><head><meta name="generator" content="WordPress 7.0">
<title>A blog</title><link href="/wp-content/themes/x/style.css" rel="stylesheet"></head>
<body><div class="wp-block-group"></div><script src="/wp-includes/js/x.js"></script></body></html>`

const plain = `<html lang="vi"><head><title>Công ty ABC</title></head><body><h1>Xin chào</h1></body></html>`

test('a Joomla page is recognised, and one weak signal alone never names a CMS', () => {
  assert.equal(detectFromHtml(joomla).cms, 'joomla')
  // A single class name proves nothing: plenty of sites carry a stray joomla-* string.
  assert.equal(detectFromHtml('<div class="joomla-modal"></div>').cms, 'unknown')
})

test('WordPress is recognised, and is not confused with Joomla', () => {
  const wp = detectFromHtml(wordpress)
  assert.equal(wp.cms, 'wordpress')
  assert.ok(wp.scores.joomla.score < wp.scores.wordpress.score)
})

test('a page that declares no CMS stays unknown rather than being guessed at', () => {
  assert.equal(detectFromHtml(plain).cms, 'unknown')
  assert.equal(detectFromHtml(plain).lang, 'vi')
})

test('T4 is reported separately: it decides how much a content model can carry', () => {
  assert.equal(detectFromHtml(joomla).t4, false)
  assert.equal(detectFromHtml(joomlaT4).t4, true)
})

test('a page title is not a site name — "Home" must never name the package', () => {
  const fromTitle = suggestNames({ title: 'Home', url: 'http://127.0.0.1:8216/' })
  assert.equal(fromTitle.needsName, true, 'nothing reliable was found, and it says so')
  const fromHost = suggestNames({ title: 'Home', url: 'https://ja-kinetic.demo.joomlart.com/' })
  assert.equal(fromHost.templateId, 'ja-kinetic')
  const declared = suggestNames({ siteName: 'Tracy Base', title: 'Home' })
  assert.equal(declared.packageDir, 'packages/cms/tracy-emdash-theme-tracy-base')
})

test('reach decides the road, not the CMS name alone', () => {
  assert.equal(reachOf('http://127.0.0.1:8216/'), 'local')
  assert.equal(reachOf('https://ja-kinetic.demo.joomlart.com/'), 'remote')
  assert.equal(reachOf('./design-folder'), 'local')

  // The failure this guards: seeing "joomla" and promising a content model we cannot fetch.
  assert.equal(roadFor({ cms: 'joomla', reach: 'local' }).road, 'contract')
  assert.equal(roadFor({ cms: 'joomla', reach: 'remote' }).road, 'rendered-ask')
  assert.equal(roadFor({ cms: 'unknown', reach: 'remote' }).road, 'rendered')
  assert.equal(roadFor({ cms: 'wordpress', reach: 'local' }).road, 'contract-pending')
})
