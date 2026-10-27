import { test } from 'node:test'
import assert from 'node:assert/strict'
import { FONT_SAMPLE_SELECTORS, parityByText } from '../visual/visual-qa.mjs'

const styles = { color: 'rgb(0, 0, 0)' }
const parity = (site, source) => parityByText(site, source, { properties: ['color'] })

test('visual parity leaves words the source says only in the other region unclassified', () => {
  const result = parity([{ tag: 'a', text: 'News', place: 1, inChrome: false, styles }], {
    News: [{ tag: 'a', order: 1, place: 1, inChrome: true, styles }]
  })
  assert.deepEqual(result.components, [])
  assert.deepEqual(result.unclassified, ['a "News"'])
})

test('visual parity pairs words inside their own region when the source says them in both', () => {
  const result = parity([{ tag: 'span', text: 'News', place: 1, inChrome: false, styles }], {
    News: [
      { tag: 'a', order: 1, place: 1, inChrome: true, styles: { color: 'rgb(255, 0, 0)' } },
      { tag: 'span', order: 2, place: 2, inChrome: false, styles }
    ]
  })
  assert.equal(result.components.length, 1)
  assert.deepEqual(result.findings, [])
  assert.deepEqual(result.unclassified, [])
})

test('visual font probes query child labels on both source and site', () => {
  assert.ok(FONT_SAMPLE_SELECTORS.site.some((selector) => selector.includes('label')))
  assert.ok(FONT_SAMPLE_SELECTORS.source.some((selector) => selector.includes('label')))
})
