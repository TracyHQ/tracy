// The read back of the untouched parts of a value stored in the JA ACM marker notation (#597, `readRest`): the piece
// functions read `((a href=""))` as an element and write the whole value back, so the step's own reader must read the
// markers as elements too. Before, it read the whole marker value as one run of words: any piece written in it (a link
// address of a social row) made the untouched parts differ, `read_back_mismatch` on the whole value. A truly foreign
// change (a sibling's class, a row taken away) still stops the write. Invented block and data.
//
//   node --test --test-concurrency=1 apps/tracy-web/test/draft-write-readback-markers.test.mjs
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { memoryHtml } from 'website-opportunities/domain/write-order-memory-doors.mjs'
import { setAt } from 'website-opportunities/domain/draft-write-codec.mjs'
import { readRest, readValues } from '../src/step-chain-draft-write-check.js'

const html = memoryHtml
// The shape of a social row of a team block: a wrapper, four links, an icon in each, written with no words.
const ROW = [
  '((div class="row-links"))',
  '\t((a href=""))((i class=""))((/i))((/a))',
  '\t((a href=""))((i class=""))((/i))((/a))',
  '\t((a href=""))((i class=""))((/i))((/a))',
  '\t((a href=""))((i class=""))((/i))((/a))',
  '((/div))'
].join('\n')
const LIST = '((ul))\n\t((li))\n\t((li))\n\t((li))\n((/ul))'
const config = { people: { 'people[rows]': [ROW, ROW], 'people[list]': [LIST] } }
const base = {
  params: JSON.stringify({ 'jatools-config': JSON.stringify(config).replace(/\//g, '\\/') })
}
const at = (jsonPath, xpath) => ({
  entity: 'module-901',
  column: 'params',
  nestedJson: 'jatools-config',
  jsonPath,
  xpath
})
const link = (row, n) => at(['people', 'people[rows]', row], `/html/body/div/div/a[${n}]/@href`)
const icon = (row, n) => at(['people', 'people[rows]', row], `/html/body/div/div/a[${n}]/i/@class`)
const item = (n) => at(['people', 'people[list]', 0], `/html/body/div/ul/li[${n}]`)
const VALUES = [
  { loc: link(0, 1), value: 'https://example.test/one' },
  { loc: icon(0, 1), value: 'icon-one' },
  { loc: link(0, 2), value: 'https://example.test/two' },
  { loc: icon(0, 2), value: 'icon-two' },
  { loc: item(1), value: 'Ten classes a month' },
  { loc: item(2), value: 'Open gym on weekends' }
]
const op = { key: 'copy:people', values: VALUES }
const written = () => VALUES.reduce((row, v) => setAt(row, v.loc, v.value, html), base)
const code = (run) => {
  try {
    run()
  } catch (error) {
    return [error.code, error.details.what]
  }
  return ['passed']
}

test('pieces written in a marker value leave its untouched parts reading the same', () => {
  const row = written()
  // The piece functions close every open row on the way back (`((/li))`): no difference to a reader.
  assert.match(JSON.parse(JSON.parse(row.params)['jatools-config']).people['people[list]'][0], /\(\(\/li\)\)/)
  assert.deepEqual(
    code(() => readValues(row, op, { html, state: { ids: {} }, plan: {} })),
    ['passed']
  )
  assert.deepEqual(
    code(() => readRest(base, row, op, { html })),
    ['passed']
  )
})

/** The written row with one of its stored marker values changed by `change`. */
function changed(row, path, change) {
  const config = JSON.parse(JSON.parse(row.params)['jatools-config'])
  const [key, list, n] = path
  config[key][list][n] = change(config[key][list][n])
  return { params: JSON.stringify({ 'jatools-config': JSON.stringify(config).replace(/\//g, '\\/') }) }
}

test('a foreign change in a marker value still stops the write: a sibling attribute, a row taken away', () => {
  const row = written()
  const rows = ['people', 'people[rows]', 0]
  const list = ['people', 'people[list]', 0]
  // The third link was never written: an address appearing there is not the write's.
  const third = changed(row, rows, (v) => v.replace(/\(\(a href=""\)\)/, '((a href="https://other.test"))'))
  const wrapper = changed(row, rows, (v) => v.replace('row-links', 'row-links stray'))
  const gone = changed(row, list, (v) => v.replace(/\(\(li\)\)\n\(\(\/li\)\)/, ''))
  for (const [name, foreign] of Object.entries({ third, wrapper, gone })) {
    assert.notEqual(foreign.params, row.params)
    assert.deepEqual(
      code(() => readRest(base, foreign, op, { html })),
      ['read_back_mismatch', 'untouched value'],
      name
    )
  }
})
