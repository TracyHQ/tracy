// The accent module keeps the template's order (lib/brand-accent/accent-routes.js `laterRivals`): it repeats a route at the
// end of the page, so a later template rule of the same weight that set the same paint would lose to it there. Dev
// arabian-tea-lat37b (JA Diner Joomla, 27/11/2026): `.btn-primary{background-color: accent}` came before
// `.off-canvas-toggle{background: transparent}`, and the module painted the phone menu button in the accent. Invented sheets.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { accentModule } from '../src/lib/brand-accent/accent-module.js'
import { specificityOf } from '../src/lib/brand-accent/css-specificity.js'
import { accentRoutesOf, cssFaults } from '../src/write-step/look-guard-css.js'

const SEED = '#c36349'
const SHEETS = [
  `.btn-primary{color:#fff;background-color:var(--ds-c-accent,${SEED});border-color:${SEED}}
.btn-primary .badge{color:${SEED}}`,
  `.off-canvas-toggle{background:transparent;border:0;border-radius:0}
.nav .off-canvas-toggle{background:#eee}
h3{color:#222}
.text-danger{color:#a94442}
.later{background:${SEED}}`
]
const css = (html) => html.replace(/^<style[^>]*>|<\/style>$/g, '')
const build = () => accentModule({ sheets: SHEETS, colours: { accent: '#9a7d25', replaces: SEED } })

test('a later rule of the same weight that sets the same paint is repeated after the route, word for word', () => {
  const text = css(build().html)
  const route = text.indexOf('.btn-primary{background-color:')
  const rival = text.indexOf('.off-canvas-toggle{background:transparent}')
  assert.ok(route >= 0 && rival > route, text)
  assert.ok(text.indexOf('.off-canvas-toggle{border:0}') > text.indexOf('.btn-primary{border-color:'))
  // A route after the rival keeps its place after it.
  assert.ok(text.indexOf('.later{background:') > rival)
  // Not repeated: a paint that is no colour, a rule of another weight, another element, a status, words of no route.
  assert.doesNotMatch(text, /border-radius|\.nav \.off-canvas-toggle|h3\{|text-danger/)
})

test('the look guard takes the repeated rules as the template writes them, and nothing else', () => {
  const routes = accentRoutesOf(SHEETS, SEED)
  const text = css(build().html)
  assert.deepEqual(cssFaults(text, { routes }), [])
  const changed = text.replace(
    '.off-canvas-toggle{background:transparent}',
    '.off-canvas-toggle{background:#000}'
  )
  assert.equal(cssFaults(changed, { routes }).length, 1)
})

test('specificity reads ids, classes and types, and :is, :not and :where as the standard counts them', () => {
  assert.deepEqual(specificityOf('.btn-primary'), [0, 1, 0])
  assert.deepEqual(specificityOf('button.btn:hover'), [0, 2, 1])
  assert.deepEqual(specificityOf('#a .b'), [1, 1, 0])
  assert.deepEqual(specificityOf('li:not(.x):where(.y) > a::before'), [0, 1, 3])
  assert.deepEqual(specificityOf('.a:is(#b, .c)'), [1, 1, 0])
})
