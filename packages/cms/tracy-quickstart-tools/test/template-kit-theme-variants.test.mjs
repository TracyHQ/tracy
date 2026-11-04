// Template kit, site part: the brand colour of a template that shows its other colour themes off on pages of their
// own (a T3 template style per theme, each with its own compiled stylesheets), and a link-only colour giving way to
// the colour that fills the primary button. All data made up.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { joomlaAdapter } from '../template-kit/lib/site/adapters/joomla.mjs'
import { buildBrandColours } from '../template-kit/lib/site/brand-colours.mjs'
import { measureBrandColours } from '../template-kit/lib/site/colour-measure.mjs'
import { pathsOnStyles, stylesOfOpeningTheme } from '../template-kit/lib/site/theme-styles.mjs'

/** The default theme (terracotta) and a showcase theme (navy) of one T3 template: same rules, other colours. */
const DEFAULT_SHEET = {
  from: '/t3-assets/css/default.css',
  pages: ['/', '/menu', '/home/home-navy'],
  css: [
    'body{background:#fcfaf6;color:#555555}',
    'a{color:var(--ds-c-accent-text,#b8553a)}a:hover{color:var(--ds-c-accent-text-hover,#8a3f2b)}',
    '.btn-primary{color:#ffffff;background-color:var(--ds-c-accent,#b8553a)}',
    '.bg-primary{background-color:var(--ds-c-accent,#b8553a)}'
  ].join('')
}
const NAVY_SHEET = {
  from: '/t3-assets/css/navy.css',
  pages: ['/home/home-navy'],
  css: [
    'a{color:var(--ds-c-muted,#3355aa)}a:hover{color:var(--ds-c-fg,#203060)}',
    '.btn-primary{color:#ffffff;background-color:#3355aa}',
    '.bg-primary{background-color:var(--ds-c-accent,#3355aa)}'
  ].join('')
}
const NAVY_INLINE = {
  from: '/home/home-navy inline style 1',
  pages: ['/home/home-navy'],
  css: 'a{color:#203060}'
}
const MAP = {
  pages: [
    { route: 'home', style: 'templateStyle-9' },
    { route: 'menu', style: 'templateStyle-9' },
    { route: 'home/home-navy', style: 'templateStyle-12' },
    { route: 'contact', style: null }
  ]
}
const VARIABLES = [
  { name: '@brand-primary', value: '#b8553a', declaredIn: 'templates/demo_t3/less/variables.less' }
]

test('a stylesheet only theme showcase pages serve is left out of the brand measure', () => {
  const styles = [DEFAULT_SHEET, NAVY_SHEET, NAVY_INLINE]
  const before = buildBrandColours({ styles, variables: VARIABLES }).brandColours
  assert.notEqual(before.primary.value, '#b8553a', 'read with the showcase sheets, the last theme wins')

  const variantPaths = pathsOnStyles(MAP, ['templateStyle-12'])
  assert.deepEqual([...variantPaths], ['/home/home-navy'])
  const kept = stylesOfOpeningTheme(styles, variantPaths)
  assert.deepEqual(
    kept.map((s) => s.from),
    ['/t3-assets/css/default.css'],
    'a sheet a default page also serves stays'
  )
  const { primary } = buildBrandColours({ styles: kept, variables: VARIABLES }).brandColours
  assert.equal(primary.value, '#b8553a')
  assert.deepEqual(primary.roles, ['button-fill', 'fill', 'link', 'variable @brand-primary'])
})

test('no theme variant: every stylesheet is kept as it is, the same array', () => {
  const styles = [DEFAULT_SHEET, NAVY_SHEET, { from: '/x.css', css: 'a{color:#123456}' }]
  assert.equal(stylesOfOpeningTheme(styles, pathsOnStyles(MAP, [])), styles)
  assert.equal(
    stylesOfOpeningTheme(styles, new Set(['/home/home-navy'])).length,
    2,
    'a sheet with no pages is kept'
  )
})

test('the Joomla adapter names the T3 styles on another colour theme than the home style', () => {
  const files = {
    'configuration.php': "public $sitename = 'Harbour Grill';",
    'templates/demo_t3/templateDetails.xml': '<extension><t3><base>base-bs3</base></t3></extension>'
  }
  const query = (sql) => {
    if (sql === 'SHOW TABLES') return [{ t: 'ab_extensions' }]
    if (/FROM ab_template_styles WHERE client_id = 0 AND home/.test(sql))
      return [{ template: 'demo_t3', params: JSON.stringify({ theme: '' }) }]
    if (/FROM ab_template_styles WHERE client_id = 0 AND template = 'demo_t3'/.test(sql))
      return [
        { id: 9, params: JSON.stringify({ theme: '' }) },
        { id: 10, params: JSON.stringify({ theme: 'red' }) },
        { id: 14, params: '{}' },
        { id: 12, params: JSON.stringify({ theme: 'navy' }) }
      ]
    return []
  }
  const adapter = joomlaAdapter({ readFile: (rel) => files[rel] ?? null, query })
  assert.equal(adapter.framework, 't3')
  assert.deepEqual(adapter.themeVariantStyles(), ['templateStyle-10', 'templateStyle-12'])
  const t4 = joomlaAdapter({ readFile: () => null, query })
  assert.deepEqual(t4.themeVariantStyles(), [], 'no T3 template: no variant')
})

test('a colour only links are painted with gives way to the colour that fills the primary button', () => {
  const styles = [
    {
      from: '/a.css',
      css: ['a{color:#2a4a8a}a:hover{color:#2a4a8a}', '.btn-primary{background-color:#c06040}'].join('')
    }
  ]
  const m = measureBrandColours(styles)
  assert.equal(m.primary, '#c06040')
  assert.deepEqual(m.primaryRoles, ['button-fill'], 'the link colour had twice the votes')
  const linksOnly = measureBrandColours([{ from: '/b.css', css: 'a{color:#2a4a8a}a:hover{color:#1a3a7a}' }])
  assert.equal(
    linksOnly.primary,
    '#2a4a8a',
    'with no filling colour the link colour stays, for the gate to see'
  )
})
