/**
 * A column both sites changed that holds JSON, merged key by key (`live_sync.py merge_json_column`):
 * Joomla keeps a module's whole content, a menu item's or an article's options, in one such column,
 * and compared whole, a live hero title was lost to a copy's eyebrow (23/10/2026).
 * No database: the function itself, through python3.
 *
 *   node --test packages/fleet/tracy-fleet-operation/test/live-sync-json.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const LIB = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'lib')

/** merge_json_column(base, ours, theirs) → [text, clashes] | null, three strings in. */
function merge(base, ours, theirs) {
  const done = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys; sys.path.insert(0, sys.argv[1]); import live_sync as l; ' +
        'a = json.load(sys.stdin); print(json.dumps(l.merge_json_column(*a)))',
      LIB
    ],
    { input: JSON.stringify([base, ours, theirs]), encoding: 'utf8' }
  )
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout)
}
/** A T4 module's params: the module's content as a JSON string inside the JSON, as Joomla writes it. */
const hero = (fields, extra = {}) =>
  JSON.stringify({
    'jatools-config': JSON.stringify({ ':type': 'tb-hero', 'tb-hero': fields }),
    cache: '0',
    ...extra
  })
const read = (text) => {
  const outer = JSON.parse(text)
  return { ...outer, 'jatools-config': JSON.parse(outer['jatools-config']) }
}

test('the hero: the live title and the copy’s eyebrow, both, inside the JSON string inside the JSON', () => {
  const base = hero({ 'tb-hero[eyebrow]': ['Cam kết'], 'tb-hero[title]': ['Sản phẩm bền chắc'] })
  const ours = hero({ 'tb-hero[eyebrow]': ['UY TÍN 100%'], 'tb-hero[title]': ['Sản phẩm bền chắc'] })
  const theirs = hero({ 'tb-hero[eyebrow]': ['Cam kết'], 'tb-hero[title]': ['Đồng hành cùng bạn'] })
  const [text, clashes] = merge(base, ours, theirs)
  assert.deepEqual(clashes, [])
  assert.deepEqual(read(text)['jatools-config']['tb-hero'], {
    'tb-hero[eyebrow]': ['UY TÍN 100%'],
    'tb-hero[title]': ['Đồng hành cùng bạn']
  })
})

test('the same key changed on both: the copy’s, named by its path', () => {
  const base = hero({ 'tb-hero[title]': ['A'], 'tb-hero[lead]': ['L'] })
  const ours = hero({ 'tb-hero[title]': ['Tracy'], 'tb-hero[lead]': ['L'] })
  const theirs = hero({ 'tb-hero[title]': ['Live'], 'tb-hero[lead]': ['Live lead'] })
  const [text, clashes] = merge(base, ours, theirs)
  assert.deepEqual(clashes, ['jatools-config › tb-hero › tb-hero[title]'])
  assert.deepEqual(read(text)['jatools-config']['tb-hero'], {
    'tb-hero[title]': ['Tracy'],
    'tb-hero[lead]': ['Live lead']
  })
})

test('a key added on one side and another removed on the other: both happen, the copy’s order first', () => {
  const [text, clashes] = merge('{"a":1,"b":2,"c":3}', '{"a":1,"b":2,"c":3,"d":4}', '{"a":1,"c":3}')
  assert.deepEqual(clashes, [])
  assert.equal(text, '{"a":1,"c":3,"d":4}')
})

test('a key the copy removed and the live site changed: a clash, and the copy’s removal stands', () => {
  const [text, clashes] = merge('{"a":1,"b":2}', '{"a":1}', '{"a":1,"b":5}')
  assert.deepEqual(clashes, ['b'])
  assert.equal(text, '{"a":1}')
})

test('a list is one value: both changing it differently is a clash, even at different places', () => {
  const [text, clashes] = merge('{"items":[1,2,3]}', '{"items":[9,2,3]}', '{"items":[1,2,8]}')
  assert.deepEqual(clashes, ['items'])
  assert.equal(text, '{"items":[9,2,3]}')
})

test('what is not a JSON object on any side is not merged: the column stays one value', () => {
  assert.equal(merge('{"a":1}', '{"a":2}', 'not json'), null)
  assert.equal(merge('', '{"a":2}', '{"a":3}'), null)
  assert.equal(merge('[1]', '[2]', '[3]'), null)
  // A key written twice would be read two ways: left whole.
  assert.equal(merge('{"a":1}', '{"a":2,"a":3}', '{"a":1,"b":1}'), null)
})

test('the copy’s own way of writing JSON is kept: escaped slashes and \\u escapes, or plain', () => {
  const base = '{"url":"https:\\/\\/a.vn\\/x","t":"Ti\\u00eau \\u0111\\u1ec1","n":1}'
  const ours = '{"url":"https:\\/\\/a.vn\\/x","t":"Ti\\u00eau \\u0111\\u1ec1","n":2}'
  const theirs = '{"url":"https:\\/\\/b.vn\\/y","t":"Ti\\u00eau \\u0111\\u1ec1","n":1}'
  const [text] = merge(base, ours, theirs)
  assert.equal(text, '{"url":"https:\\/\\/b.vn\\/y","t":"Ti\\u00eau \\u0111\\u1ec1","n":2}')
  const [plain] = merge('{"a":"x/y","b":1}', '{"a":"x/y","b":2}', '{"a":"Tiêu đề/z","b":1}')
  assert.equal(plain, '{"a":"Tiêu đề/z","b":2}')
})

test('a result that is the live side whole, with no clash, is the live text itself', () => {
  const theirs = '{ "a": 1, "b": 3 }'
  const [text, clashes] = merge('{"a":1,"b":2}', '{"a":1,"b":2,"c":null}'.replace(',"c":null', ''), theirs)
  assert.deepEqual(clashes, [])
  assert.equal(text, theirs)
})

test('types count: "1" and 1 differ, and true is not 1', () => {
  const [text, clashes] = merge('{"a":"1","b":true}', '{"a":1,"b":true}', '{"a":"1","b":1}')
  assert.deepEqual(clashes, [])
  assert.equal(text, '{"a":1,"b":1}')
})

test('deep enough, a key both changed is one value: the copy’s, named at that depth', () => {
  let base = { v: 0 }
  let ours = { v: 1 }
  let theirs = { v: 2 }
  for (let i = 0; i < 15; i++) {
    base = { k: base }
    ours = { k: ours }
    theirs = { k: theirs }
  }
  const [text, clashes] = merge(JSON.stringify(base), JSON.stringify(ours), JSON.stringify(theirs))
  assert.equal(clashes.length, 1)
  assert.equal(clashes[0].split(' › ').length, 12)
  assert.equal(text, JSON.stringify(ours))
})

test('a menu item’s options and an article’s images: several keys from each side at once', () => {
  const base = JSON.stringify({
    menu_text: 1,
    page_title: '',
    menu_image: '',
    robots: '',
    show_page_heading: 0
  })
  const ours = JSON.stringify({
    menu_text: 1,
    page_title: 'Tracy title',
    menu_image: '',
    robots: '',
    show_page_heading: 1
  })
  const theirs = JSON.stringify({
    menu_text: 0,
    page_title: '',
    menu_image: 'images/x.png',
    robots: 'noindex',
    show_page_heading: 0
  })
  const [text, clashes] = merge(base, ours, theirs)
  assert.deepEqual(clashes, [])
  assert.deepEqual(JSON.parse(text), {
    menu_text: 0,
    page_title: 'Tracy title',
    menu_image: 'images/x.png',
    robots: 'noindex',
    show_page_heading: 1
  })
})

test('a nested JSON string both rewrote into something no longer an object: one value, the copy’s', () => {
  const base = JSON.stringify({ cfg: JSON.stringify({ a: 1 }) })
  const ours = JSON.stringify({ cfg: JSON.stringify({ a: 2 }) })
  const theirs = JSON.stringify({ cfg: 'plain text' })
  const [text, clashes] = merge(base, ours, theirs)
  assert.deepEqual(clashes, ['cfg'])
  assert.equal(text, ours)
})

/** merge_json_column with `details`: the clashing keys, each with both values cut short. */
function details(base, ours, theirs) {
  const done = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys; sys.path.insert(0, sys.argv[1]); import live_sync as l; ' +
        'a = json.load(sys.stdin); d = []; l.merge_json_column(*a, details=d); print(json.dumps(d))',
      LIB
    ],
    { input: JSON.stringify([base, ours, theirs]), encoding: 'utf8' }
  )
  assert.equal(done.status, 0, done.stderr)
  return JSON.parse(done.stdout)
}

test('each key both changed is named with both values, short: a template style’s params read, not dumped (#1648)', () => {
  const long = 'x'.repeat(400)
  const got = details(
    JSON.stringify({ logo: 'a.png', colors: { primary: '#000' }, css: 'base', gone: 1 }),
    JSON.stringify({ logo: 'tracy.png', colors: { primary: '#bf5b3d' }, css: long }),
    JSON.stringify({ logo: 'live.png', colors: { primary: '#123456' }, css: 'live', gone: 2 })
  )
  assert.deepEqual(
    got.map((d) => d.path),
    ['logo', 'colors › primary', 'css', 'gone']
  )
  assert.deepEqual(got[0], { path: 'logo', ours: 'tracy.png', theirs: 'live.png' })
  assert.deepEqual(got[1], { path: 'colors › primary', ours: '#bf5b3d', theirs: '#123456' })
  assert.equal(got[2].ours.length, 120, 'a long value is cut')
  assert.ok(got[2].ours.endsWith('…'))
  assert.deepEqual(got[3], { path: 'gone', ours: null, theirs: '2' }, 'removed on the copy: null')
})

test('session state is never synced: `session` and `user_keys` are tables the copy keeps as its own', () => {
  const done = spawnSync(
    'python3',
    [
      '-c',
      'import json,sys; sys.path.insert(0, sys.argv[1]); import live_sync as l; ' +
        'p = l.POLICIES["joomla"]; print(json.dumps({"ignore": sorted(p["ignoreTables"]), ' +
        '"noise": sorted(set(p["ignoreTables"]) | set(p["appendTables"]))}))',
      LIB
    ],
    { encoding: 'utf8' }
  )
  assert.equal(done.status, 0, done.stderr)
  const { ignore } = JSON.parse(done.stdout)
  for (const table of ['session', 'user_keys']) assert.ok(ignore.includes(table), `${table} is ignored`)
})
