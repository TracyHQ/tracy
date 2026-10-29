// The head block against the shape of a served T4 brief site (a saved copy of the served CSS and HTML, demo values replaced
// by invented ones): the framework logo backgrounds, the watermark overlay, a masthead picture painted by an inline style
// and two demo video embeds. Spec TracyHQ/tracy#189, C08 and C10.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkDemoLeftovers } from '../domain/demo-leftovers.mjs'
import { demoBackgrounds, leftoverHeadBlock } from '../domain/outside-map.mjs'

const css = `
.t4-logo,.t4-logo-color{background-image:url(//static.example.test/images/ja-template/t4-framework/logo/blue-logo-full.png)}
.t4-logo-dark{background-image:url(//static.example.test/images/ja-template/t4-framework/logo/dark-logo-full.png)}
#t4-section-5 .bg-overlay-image{background-image:url(/images/demo/misc/wm-bg.png)}
.t4-content{background-image:url(/images/demo/others/bg-page.jpg#joomlaImage://local-images/demo/others/bg-page.jpg?width=2000)}
.t4-content .bg-mask{background-image:url(/images/demo/others/bg-page.jpg)}
.hero-band{background-image:url(/images/tracy-content/own.jpg)}`
const page = `<div class="ja-masthead has-bg" style="background-image: url('images/demo/classes/ring-banner.jpg')"><h2>Our Menu</h2></div>
<article><iframe src="https://www.youtube.com/embed/AAAAAAAAAAA"></iframe><a data-src="https://youtu.be/BBBBBBBBBBB" href="#">play</a></article>`

test('every demo background of the served shape is found, the owner one is not', () => {
  const found = demoBackgrounds({ styles: [{ css }], pages: [{ html: page }] })
  const files = new Set(found.map((f) => f.file))
  assert.ok([...files].some((f) => f.endsWith('blue-logo-full.png')))
  assert.ok([...files].some((f) => f.endsWith('dark-logo-full.png')))
  assert.ok([...files].some((f) => f.endsWith('wm-bg.png')))
  assert.ok([...files].some((f) => f.endsWith('ring-banner.jpg')))
  assert.ok(![...files].some((f) => f.includes('own.jpg')))
})

test('the block repaints a masthead with the owner picture and takes logos, overlays and the page ground off', () => {
  const backgrounds = demoBackgrounds({ styles: [{ css }], pages: [{ html: page }] })
  const block = leftoverHeadBlock({ backgrounds, picture: 'images/tracy-content/own.jpg' })
  assert.match(
    block,
    /\[style\*="images\/demo\/classes\/ring-banner\.jpg"\]\{background-image:url\("\/images\/tracy-content\/own\.jpg"\) !important\}/
  )
  const plain = block.split('\n').find((l) => l.includes('{background-image:none'))
  assert.ok(block.includes('.t4-logo,'))
  assert.match(block, /#t4-section-5 \.bg-overlay-image/)
  assert.ok(!/\.t4-logo[^{]*\{background-image:url/.test(block))
  assert.ok(plain)
  assert.match(block, /\.t4-content/)
})

test('both demo video embeds are hidden by the block', () => {
  const block = leftoverHeadBlock({ videos: ['AAAAAAAAAAA', 'BBBBBBBBBBB'] })
  for (const id of ['AAAAAAAAAAA', 'BBBBBBBBBBB']) {
    assert.ok(block.includes(`iframe[src*="${id}"]`))
    assert.ok(block.includes(`[data-src*="${id}"]`))
  }
})

test('the check sees a slot picture painted by an inline style (a masthead), and a stylesheet rule on a slot file', () => {
  const contentMap = {
    slots: [
      {
        key: 's1',
        entity: 'module-9',
        type: 'image',
        role: 'section.background_image',
        sample: 'images/demo/classes/ring-banner.jpg'
      }
    ],
    entities: []
  }
  const report = checkDemoLeftovers({
    contentMap,
    brief: { name: 'Northgate Dental' },
    pages: [{ path: '/classes', status: 200, html: page }],
    styles: [{ href: '/site.css', css }]
  })
  const hit = report.findings.find((f) => f.found.endsWith('ring-banner.jpg'))
  assert.equal(hit?.kind, 'C10')
})
