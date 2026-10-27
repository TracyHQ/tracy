import test from 'node:test'
import assert from 'node:assert/strict'
import { synthCss, formatRules } from '../visual/synth-css.mjs'

const theme = {
  settings: {
    color: { palette: [{ slug: 'muted', color: '#6E6E73' }, { slug: 'fg', color: '#1d1d1f' }] },
    typography: { fontFamilies: [{ slug: 'body', fontFamily: '"SF Pro Text", sans-serif' }] }
  }
}
const comp = (element, deltas = []) => ({ element: `${element} "text"`, deltas })
const muted = [{ property: 'color', expected: 'rgb(110, 110, 115)', observed: 'rgb(66, 66, 69)' }]
const report = (components) => ({ pages: [{ id: 'en-home', axes: [{ components }] }] })

test('synth-css: one declaration per signature that fails the same way everywhere, as a preset', () => {
  const rules = synthCss(report([comp('p.tracy-lead.mb-0', muted), comp('p.tracy-lead.mb-0', muted)]), theme)
  assert.equal(rules.length, 1)
  assert.equal(rules[0].selector, '.tracy p.tracy-lead.mb-0')
  assert.deepEqual(rules[0].declarations, [['color', 'var(--wp--preset--color--muted)']])
})

test('synth-css: a signature that passes somewhere, or disagrees, emits nothing', () => {
  assert.equal(synthCss(report([comp('p.tracy-lead', muted), comp('p.tracy-lead')]), theme).length, 0)
  const other = [{ property: 'color', expected: 'rgb(29, 29, 31)', observed: 'rgb(66, 66, 69)' }]
  assert.equal(synthCss(report([comp('p.tracy-lead', muted), comp('p.tracy-lead', other)]), theme).length, 0)
})

test('synth-css: a superset signature asking for something else is excluded by its extra class', () => {
  const active = [{ property: 'color', expected: 'rgb(29, 29, 31)', observed: 'rgb(110, 110, 115)' }]
  const rules = synthCss(report([comp('li.acm-tabs__tab', muted), comp('li.acm-tabs__tab', muted), comp('li.acm-tabs__tab.is-active', active)]), theme)
  const tab = rules.find((r) => r.signature === 'li.acm-tabs__tab')
  assert.equal(tab.selector, '.tracy li.acm-tabs__tab:not(.is-active)')
  assert.match(formatRules(rules), /· not is-active/)
})

test('synth-css: bare tags and colours outside the palette are skipped', () => {
  const odd = [{ property: 'color', expected: 'rgb(1, 2, 3)', observed: 'rgb(0, 0, 0)' }]
  assert.equal(synthCss(report([comp('a', muted), comp('a', muted), comp('p.x', odd), comp('p.x', odd)]), theme).length, 0)
})
