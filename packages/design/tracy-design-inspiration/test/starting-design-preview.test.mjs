/** A wizard preview press opens the live template even after an unrelated gallery filter. */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { doors, openTabDom } from './fixtures/design-system-tab-dom.mjs'

let ui
before(async () => {
  ui = await openTabDom()
})
after(() => ui.restore())

const DEMO = 'https://ja-impact.demo.test/'
const TEMPLATE = {
  id: 'ja-impact',
  name: 'JA Impact',
  category: 'business',
  nav: 'top-left',
  hero: 'split',
  dark: false,
  platforms: ['joomla'],
  template: {
    quickstarts: { joomla: 'ja-impact-j6' },
    version: '1.0.0',
    image: null,
    demo: { url: DEMO, version: '1.0.0' },
    languages: ['en'],
    layouts: [{ key: 'home', label: 'Home', path: '/', shots: { desktop: null } }]
  }
}

test('a preview press clears old filters and atomically records the CMS and live template preview', async () => {
  history.replaceState(null, '', '/?tab=design&cat=saas&brand=other-design&platform=wordpress')
  const state = doors({})
  const answer = state.fetch
  state.fetch = async (input, init) => {
    const url = new URL(String(input), location.href)
    if (url.pathname.endsWith('/catalog')) return Response.json({ systems: [TEMPLATE] })
    if (url.pathname.endsWith('/site')) return Response.json({ present: false })
    return answer(input, init)
  }
  const tab = await ui.mountPlugin({ state, tabType: 'tracy:design-inspiration', meta: {} })
  try {
    assert.equal(ui.body().querySelector('[data-inspiration="ja-impact"]'), null, 'old filters exclude it')
    assert.equal(ui.body().querySelector('[role="dialog"]'), null)

    await tab.press({ platform: 'joomla', pressedAt: 123, previewDesign: 'ja-impact' })

    const dialog = ui.body().querySelector('[role="dialog"]')
    assert.ok(dialog, 'the actual existing preview dialog opens')
    assert.ok(dialog.textContent.includes('JA Impact'))
    const demo = [...dialog.querySelectorAll('iframe')].find((el) => el.getAttribute('src')?.startsWith(DEMO))
    assert.ok(demo, 'the template live demo is framed')
    const params = new URLSearchParams(location.search)
    assert.equal(params.get('platform'), 'joomla')
    assert.equal(params.get('open'), 'ja-impact')
    assert.equal(params.has('cat'), false)
    assert.equal(params.has('brand'), false)
    assert.equal(params.get('tab'), 'design', 'host parameters survive')
  } finally {
    await tab.unmount()
  }
})
