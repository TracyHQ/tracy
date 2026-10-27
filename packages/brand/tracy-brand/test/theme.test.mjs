/**
 * The runtime layer on top of the generated palette: what the user's Primary color and font
 * choices turn into, and how the browser title is rebranded. Pure functions, no DOM.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { primaryTokens, fontTokens, brandTitle, composeLayer, siteKeyFromPath } from '../src/shared/theme.mjs'
import { DEFAULT_PRIMARY, GLOBAL_FONTS, CODE_FONTS, DEFAULT_FONT } from '../src/shared/settings.mjs'

test('a valid hex primary lands on dsh brand tokens and on Tracy --primary, same in both modes', () => {
  const t = primaryTokens('#00B96B')
  assert.deepEqual(t['--dsw-alias-brand-primary'], { light: '#00B96B', dark: '#00B96B' })
  assert.deepEqual(t['--dsw-alias-button-primary-fill'], { light: '#00B96B', dark: '#00B96B' })
  assert.deepEqual(t['--primary'], { light: '#00B96B', dark: '#00B96B' })
  assert.match(t['--dsw-alias-button-primary-hover'].light, /^color-mix\(/)
})

test('an invalid or empty primary falls back to Tracy blue instead of poisoning the layer', () => {
  assert.equal(primaryTokens('')['--dsw-alias-brand-primary'].light, DEFAULT_PRIMARY)
  assert.equal(primaryTokens('not a colour')['--dsw-alias-brand-primary'].light, DEFAULT_PRIMARY)
  assert.equal(primaryTokens('#12')['--dsw-alias-brand-primary'].light, DEFAULT_PRIMARY)
  assert.equal(primaryTokens('#abc')['--dsw-alias-brand-primary'].light, '#abc')
})

test('the default font contributes nothing, so dsh keeps its own stack', () => {
  assert.deepEqual(fontTokens(DEFAULT_FONT, DEFAULT_FONT), {})
})

test('a chosen font overrides the dsh font token with its family stack', () => {
  const inter = GLOBAL_FONTS.find((f) => f.id === 'inter')
  const mono = CODE_FONTS.find((f) => f.id === 'jetbrains-mono')
  const t = fontTokens('inter', 'jetbrains-mono')
  assert.equal(t['--dsw-font-family'].light, inter.family)
  assert.equal(t['--dsw-font-family'].dark, inter.family)
  assert.equal(t['--ds-font-family-code'].light, mono.family)
})

test('an unknown font id is treated as default', () => {
  assert.deepEqual(fontTokens('comic-sans', 'wingdings'), {})
})

test('composeLayer stacks palette, primary and fonts with the later winning per token', () => {
  const layer = composeLayer(
    {
      '--dsw-alias-brand-primary': { light: 'blue', dark: 'blue' },
      '--dsw-alias-bg-base': { light: 'w', dark: 'b' }
    },
    '#ff0000',
    DEFAULT_FONT,
    DEFAULT_FONT
  )
  assert.equal(layer['--dsw-alias-brand-primary'].light, '#ff0000')
  assert.equal(layer['--dsw-alias-bg-base'].light, 'w')
  for (const modes of Object.values(layer)) {
    assert.equal(typeof modes.light, 'string')
    assert.equal(typeof modes.dark, 'string')
  }
})

test('brandTitle swaps the dsh product name and leaves the session title alone', () => {
  assert.equal(brandTitle('DeepSeek Harness'), 'Tracy Cowork')
  assert.equal(brandTitle('Fix the footer — DeepSeek Harness'), 'Fix the footer — Tracy Cowork')
  assert.equal(brandTitle('DSH Local Build'), 'Tracy Cowork')
  assert.equal(brandTitle('Tracy Cowork'), 'Tracy Cowork')
})

test('brandTitle leads with the site when one is given, so a narrow browser tab still names it', () => {
  assert.equal(brandTitle('DeepSeek Harness', 'tracy.ai'), 'tracy.ai · Tracy Cowork')
  assert.equal(
    brandTitle('Fix the footer — DeepSeek Harness', 'jaresort.tracy.site'),
    'jaresort.tracy.site · Fix the footer — Tracy Cowork'
  )
  // Idempotent: dsh rewrites the title on every session change and the observer runs again.
  assert.equal(brandTitle('tracy.ai · Tracy Cowork', 'tracy.ai'), 'tracy.ai · Tracy Cowork')
  assert.equal(brandTitle('Tracy Cowork', null), 'Tracy Cowork')
})

test('siteKeyFromPath reads the site from the address, and nothing else', () => {
  assert.equal(siteKeyFromPath('/tracy.ai'), 'tracy.ai')
  assert.equal(siteKeyFromPath('/jaresort.tracy.site/s/session-1'), 'jaresort.tracy.site')
  // Not sites: the bare root, doors of tracy-web, and fleet labels carry no dot.
  assert.equal(siteKeyFromPath('/'), null)
  assert.equal(siteKeyFromPath('/login'), null)
  assert.equal(siteKeyFromPath('/agent/x'), null)
})
