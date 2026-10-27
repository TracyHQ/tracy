import test from 'node:test'
import assert from 'node:assert/strict'
import { typeset, NBSP } from '../lib/typeset.mjs'

const shown = (s) => s.replace(new RegExp(NBSP, 'g'), '_')

test('typeset: a date, a number with its unit, a preposition with its number, "No. 214" and a place with its qualifier do not break', () => {
  assert.equal(shown(typeset('<p>Contract value RUB 1.2bn, mobilising on site in October 2026.</p>')), '<p>Contract value RUB_1.2bn, mobilising on site in October_2026.</p>')
  assert.equal(shown(typeset('<p>Foundations for presses up to 45 m. Cranes to 380 lines.</p>')), '<p>Foundations for presses up_to_45_m. Cranes to_380 lines.</p>')
  assert.equal(
    shown(typeset('<p>INN 4003xxxxxx · OGRN 10440xxxxxxxx · SRO admission No. 214<br>Vorsino Industrial Park, plot 12, Kaluga Region</p>')),
    '<p>INN 4003xxxxxx_·_OGRN 10440xxxxxxxx_·_SRO admission_No._214<br>Vorsino Industrial Park, plot 12, Kaluga_Region</p>'
  )
  assert.equal(shown(typeset('Head of Structures · 28 Jul 2026 · 7 min read', { mode: 'text' })), 'Head of Structures_·_28_Jul_2026_·_7_min read')
  assert.equal(shown(typeset('1.2M m² built, 22 years, 380+ projects, 110 kV Obninsk-2, phase 3')), '1.2M_m² built, 22 years, 380+ projects, 110_kV Obninsk-2, phase 3')
})

test('typeset: a year at the end of a title, or after a comma, stays with its word', () => {
  assert.equal(shown(typeset('<li>Capability statement 2026</li><li>Презентация компетенций, 2026</li><li>Corporate deck 2028 — full slide library</li>')), '<li>Capability statement_2026</li><li>Презентация компетенций,_2026</li><li>Corporate deck_2028 — full slide library</li>')
  assert.equal(shown(typeset('Serious incidents in 2025 · plot 12, Kaluga Region · 110 kV Obninsk-2', { mode: 'text' })), 'Serious incidents in_2025_·_plot 12, Kaluga_Region_·_110_kV Obninsk-2')
})

test('typeset: Russian dates, thousands, units, currency and qualifiers', () => {
  assert.equal(
    shown(typeset('500 000 часов · 12 августа 2026 · 1,2 млрд ₽ · 62 га · Калужская область · до 45 м · 28.07.2026')),
    '500_000 часов_·_12_августа_2026_·_1,2_млрд_₽_·_62_га_·_Калужская_область_·_до_45_м_·_28.07.2026'
  )
})

test('typeset: a year range is a no-wrap span in markup, left alone in a plain field, and not wrapped twice', () => {
  const once = typeset('<td>Фотобанк</td><td>2024–2026</td>')
  assert.equal(once, '<td>Фотобанк</td><td><span style="white-space:nowrap">2024–2026</span></td>')
  assert.equal(typeset(once), once, 'idempotent')
  assert.equal(typeset('2024–2026', { mode: 'text' }), '2024–2026')
})

test('typeset: block comments, tags, attributes and verbatim elements are not touched; a second pass changes nothing', () => {
  const markup = '<!-- wp:paragraph {"placeholder":"Oct 2026"} --><p><a href="/x?a=1 2" title="28 Jul 2026">Oct 2026</a></p><!-- /wp:paragraph --><pre>October 2026</pre><code>28 Jul 2026</code><script>var x = "28 Jul 2026"</script>'
  const out = typeset(markup)
  assert.equal(shown(out), '<!-- wp:paragraph {"placeholder":"Oct 2026"} --><p><a href="/x?a=1 2" title="28 Jul 2026">Oct_2026</a></p><!-- /wp:paragraph --><pre>October 2026</pre><code>28 Jul 2026</code><script>var x = "28 Jul 2026"</script>')
  assert.equal(typeset(out), out)
  assert.equal(typeset(''), '')
  assert.equal(typeset(null), '')
})

test('typeset: a whitespace-normalising comparison reads the result as the source', () => {
  const src = 'Contract value RUB 1.2bn, mobilising on site in October 2026.'
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  assert.equal(norm(typeset(src, { mode: 'text' })), norm(src))
})
