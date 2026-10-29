// Demo-content edits of a Joomla quickstart's next version (release-joomla.mjs --replace): the dump
// and the presentation lock carry the same edit, counted, and the Tracy Base edits file applies to
// the 1.0.3 lock as captured; the 1.0.4 contract (cut 16/10/2026 with them) carries both.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { dumpPrefix, editDump, editLock, loadContentEdits } from '../src/release-content-edits.mjs'

const ROOT = new URL('../../../../', import.meta.url).pathname
const QS = join(ROOT, 'packages/cms/tracy-joomla-quickstart')
const LOCK = join(QS, 'contracts/tracy-base/j6/1.0.3/presentation-lock.json')
// the edits Tracy Base 1.0.4 was cut with (release-joomla.mjs --replace, 16/10/2026)
const TRACY_BASE_EDITS = [
  {
    entity: 'module-229',
    from: 'color:var(--brand-color-warning);letter-spacing:2px;',
    to: 'color:var(--ds-c-accent-text, var(--brand-color-warning));letter-spacing:2px;',
    count: 1
  },
  { entity: 'module-236', from: '>MT<', to: '>AH<', count: 1 },
  { entity: 'module-236', from: '>DO<', to: '>PL<', count: 1 },
  { entity: 'module-236', from: '>RM<', to: '>LM<', count: 1 }
]
const NEXT = join(QS, 'contracts/tracy-base/j6/1.0.4')

const editsFile = (edits) => {
  const f = join(mkdtempSync(join(tmpdir(), 'edits-')), 'e.json')
  writeFileSync(f, JSON.stringify({ edits }))
  return f
}

test('an edit the two escapings would not agree on is refused', () => {
  for (const from of ['a "quoted" value', "it's", 'a\\b', 'a/b', 'Strategy · Design'])
    assert.throws(() => loadContentEdits(editsFile([{ entity: 'module-1', from, to: 'x', count: 1 }])))
  assert.throws(() => loadContentEdits(editsFile([{ entity: 'module-1', from: 'a', to: 'a', count: 1 }])))
  assert.throws(() => loadContentEdits(editsFile([{ entity: 'module', from: 'a', to: 'b', count: 1 }])))
  assert.throws(() => loadContentEdits(editsFile([])))
})

test('the dump edit is counted, over one dump or several SQL files', () => {
  const e = [{ entity: 'module-1', from: 'color:red;', to: 'color:blue;', count: 2 }]
  assert.equal(
    editDump("('a','color:red;'),('b','color:red;')", e),
    "('a','color:blue;'),('b','color:blue;')"
  )
  assert.deepEqual(editDump(['color:red;', 'x color:red;'], e), ['color:blue;', 'x color:blue;'])
  assert.throws(() => editDump('color:red;', e), /occurs 1 times/)
  // a dump already edited is not edited again in silence
  assert.throws(() => editDump('color:red; color:red; color:blue;', e), /already there/)
})

test('the lock edit stays inside its entity', () => {
  const lock = (a, b) =>
    JSON.stringify({ entities: { 'module-1': { content: a }, 'module-2': { content: b } } })
  const e = [{ entity: 'module-1', from: 'color:red;', to: 'color:blue;', count: 1 }]
  assert.equal(
    JSON.parse(editLock(lock('<p style=\\"color:red;\\">', 'x'), e)).entities['module-1'].content,
    '<p style=\\"color:blue;\\">'
  )
  assert.throws(() => editLock(lock('color:red;', 'color:red;'), e), /1 in the lock|2 in the lock/)
  assert.throws(() => editLock(lock('x', 'x'), [{ ...e[0], entity: 'module-9' }]), /no entities/)
})

test('Tracy Base: the kicker of module 229 reads the accent-text role, the warning colour as fallback', () => {
  const edits = loadContentEdits(editsFile(TRACY_BASE_EDITS))
  const text = readFileSync(LOCK, 'utf8')
  const out = editLock(text, edits)
  const content = JSON.parse(out).entities['module-229'].content
  assert.match(
    content,
    /<span style="color:var\(--ds-c-accent-text, var\(--brand-color-warning\)\);letter-spacing:2px;">Strategy · Design · Development<\/span>/
  )
  // nothing else in the lock moved: the window dots of modules 227/228 keep the warning colour
  assert.equal(out.length - text.length, edits[0].to.length - edits[0].from.length)
  assert.match(JSON.parse(out).entities['module-227'].content, /background:var\(--brand-color-warning\)/)
})

test('Tracy Base: each team card avatar of module 236 shows its own name’s initials', () => {
  const content = JSON.parse(
    editLock(readFileSync(LOCK, 'utf8'), loadContentEdits(editsFile(TRACY_BASE_EDITS)))
  ).entities['module-236'].content
  const pairs = [...content.matchAll(/>([A-Z]{2})<\/span>[\s\S]*?brand-font-size\);">([^<]+)</g)].map(
    ([, initials, name]) => [initials, name]
  )
  assert.deepEqual(pairs, [
    ['AH', 'Adam Hale'],
    ['PL', 'Peter Lang'],
    ['LM', 'Lucas Meyer']
  ])
})

test('editContentMap: a slot whose sample is the edited text node takes the new text, nothing else moves', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const map = `{
  "slots": [
    {
      "key": "module-236.4",
      "entity": "module-236",
      "sample": "MT",
      "type": "text"
    },
    {
      "key": "module-237.1",
      "entity": "module-237",
      "sample": "MT",
      "type": "text"
    }
  ]
}
`
  const { text, edited } = editContentMap(map, [
    { entity: 'module-236', from: '>MT<', to: '>AH<' },
    { entity: 'module-236', from: 'color:red;', to: 'color:blue;' }
  ])
  assert.deepEqual(edited, ['module-236.4'])
  assert.equal(text, map.replace('"sample": "MT"', '"sample": "AH"'))
})

test('Tracy Base 1.0.4 as cut: its lock and content map carry the edits, the 1.0.3 entities are otherwise kept', () => {
  const was = JSON.parse(readFileSync(LOCK, 'utf8')).entities
  const now = JSON.parse(readFileSync(join(NEXT, 'presentation-lock.json'), 'utf8')).entities
  const edited = JSON.parse(
    editLock(readFileSync(LOCK, 'utf8'), loadContentEdits(editsFile(TRACY_BASE_EDITS)))
  ).entities
  assert.deepEqual(now, edited)
  assert.deepEqual(now['module-227'], was['module-227'])
  const samples = Object.fromEntries(
    JSON.parse(readFileSync(join(NEXT, 'content-map.json'), 'utf8'))
      .slots.filter((x) => /^module-236\.(4|8|12)$/.test(x.key))
      .map((x) => [x.key, x.sample])
  )
  assert.deepEqual(samples, { 'module-236.4': 'AH', 'module-236.8': 'PL', 'module-236.12': 'LM' })
})

// JA Resume 1.0.5 (17/10/2026): the social feed's menu item listed its articles in a new random order on every
// load; the next version lists the newest first. A row's JSON setting is edited as one pair, quotes and all.
const RESUME_LOCK = join(QS, 'contracts/ja-resume/j6/1.0.4/presentation-lock.json')
const FEED_ORDER = {
  entity: 'menuItem-131',
  field: 'params',
  json: true,
  from: '"orderby_sec":"random"',
  to: '"orderby_sec":"rdate"',
  count: 1
}

test('a JSON pair edit: one key, its value changed, quotes only as the pair writes them', () => {
  assert.equal(loadContentEdits(editsFile([FEED_ORDER])).length, 1)
  for (const bad of [
    { to: '"orderby_pri":"rdate"' }, // another key
    { from: 'orderby_sec:random' }, // not a pair
    { to: '"orderby_sec":"it\'s"' },
    { to: '"orderby_sec":"a\\\\b"' },
    { to: '"orderby_sec":"a/b"' },
    { to: '"orderby_sec":"x","y":"z"' }, // two pairs
    { json: 'yes' },
    { field: 'params;drop' }
  ])
    assert.throws(() => loadContentEdits(editsFile([{ ...FEED_ORDER, ...bad }])))
  // without "json" the old rule holds: no quotes at all
  assert.throws(() => loadContentEdits(editsFile([{ ...FEED_ORDER, json: undefined }])))
})

test('a JSON pair edit in the dump: written as \\" there, the new value may be another row\'s already', () => {
  const dump =
    '(130,\'{\\"orderby_sec\\":\\"rdate\\"}\'),(131,\'{\\"orderby_pri\\":\\"none\\",\\"orderby_sec\\":\\"random\\"}\')'
  assert.equal(
    editDump(dump, [FEED_ORDER]),
    '(130,\'{\\"orderby_sec\\":\\"rdate\\"}\'),(131,\'{\\"orderby_pri\\":\\"none\\",\\"orderby_sec\\":\\"rdate\\"}\')'
  )
  // run twice: refused by the count, not edited in silence
  assert.throws(() => editDump(editDump(dump, [FEED_ORDER]), [FEED_ORDER]), /occurs 0 times/)
})

test('JA Resume: the social feed lists its newest article first, nothing else in the lock moves', () => {
  const text = readFileSync(RESUME_LOCK, 'utf8')
  const out = editLock(text, loadContentEdits(editsFile([FEED_ORDER])))
  const was = JSON.parse(text).entities
  const now = JSON.parse(out).entities
  assert.deepEqual(JSON.parse(now['menuItem-131'].params), {
    ...JSON.parse(was['menuItem-131'].params),
    orderby_sec: 'rdate'
  })
  for (const k of Object.keys(was)) if (k !== 'menuItem-131') assert.deepEqual(now[k], was[k], k)
  assert.equal(out.length - text.length, 'rdate'.length - 'random'.length)
  // the field must be named: the menu item has no content
  assert.throws(
    () => editLock(text, [{ ...FEED_ORDER, field: undefined }]),
    /no entities.menuItem-131.content/
  )
})

test('an edit that reuses content the demo already carries is allowed only when it says so', () => {
  // JA Donate 1.0.7: the Donate - Green/Orange slideshow's dead video takes the default home's live one
  const dump = `(91,'Slideshow','[\\"AjGyuHm5q4s\\"]'),(129,'Slideshow','[\\"gGFQybMEPeM\\"]')`
  const edit = { entity: 'module-91', field: 'params', from: 'AjGyuHm5q4s', to: 'gGFQybMEPeM', count: 1 }
  assert.throws(() => editDump(dump, [edit]), /already there/)
  const out = editDump(dump, [{ ...edit, reuses: true }])
  assert.equal(out.split('gGFQybMEPeM').length - 1, 2)
  // a second run is still refused by the count of `from`
  assert.throws(() => editDump(out, [{ ...edit, reuses: true }]), /occurs 0 times/)
  assert.throws(() => loadContentEdits(editsFile([{ ...edit, reuses: 'yes' }])))
})

test('a slot that samples an edited value whole takes the new value', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const map = JSON.stringify(
    {
      slots: [
        { key: 'module-91.8', entity: 'module-91', sample: 'AjGyuHm5q4s' },
        { key: 'module-91.9', entity: 'module-91', sample: 'Other' }
      ]
    },
    null,
    2
  )
  const r = editContentMap(map, [
    { entity: 'module-91', field: 'params', from: 'AjGyuHm5q4s', to: 'gGFQybMEPeM', count: 1 }
  ])
  assert.deepEqual(r.edited, ['module-91.8'])
  assert.equal(JSON.parse(r.text).slots[0].sample, 'gGFQybMEPeM')
  assert.equal(JSON.parse(r.text).slots[1].sample, 'Other')
})

test('a row edit counts and replaces inside its own row, not in rows that share the text', () => {
  // JA Restaurant 1.0.6: "&amp;" is in many module rows; only module 100's are decoded
  const dump =
    'CREATE TABLE `jd_modules` (\n  `id` int,\n  `title` varchar(100),\n  `params` text\n);\n' +
    "INSERT INTO `jd_modules` VALUES (100,'It\\'s','Bar &amp; Restaurant'),(1000,'x','Bar &amp; Restaurant');\n"
  const e = [
    {
      entity: 'module-100',
      field: 'params',
      row: true,
      from: 'Bar &amp; Restaurant',
      to: 'Bar & Restaurant',
      count: 1
    }
  ]
  const out = editDump(dump, e)
  assert.equal(out, dump.replace("(100,'It\\'s','Bar &amp;", "(100,'It\\'s','Bar &"))
  assert.throws(() => editDump(out, e), /occurs 0 times/)
  // the edit belongs to its column: the same text in the params is neither counted nor edited
  const inTitle = dump.replace("'It\\'s'", "'Bar &amp; Restaurant'")
  assert.equal(
    editDump(inTitle, [{ ...e[0], field: 'title' }]),
    inTitle.replace("(100,'Bar &amp; Restaurant',", "(100,'Bar & Restaurant',")
  )
  const lock = JSON.stringify(
    {
      entities: {
        'module-100': { params: 'Bar &amp; Restaurant' },
        'module-1000': { params: 'Bar &amp; Restaurant' }
      }
    },
    null,
    2
  )
  const L = JSON.parse(editLock(lock, e)).entities
  assert.equal(L['module-100'].params, 'Bar & Restaurant')
  assert.equal(L['module-1000'].params, 'Bar &amp; Restaurant')
})

test('a row edit is confined to its named column: the same text in another column of the row is not touched', () => {
  const e = [{ entity: 'module-100', field: 'params', row: true, from: 'FOO', to: 'BAR', count: 1 }]
  // `from` only in the title: the dump refuses, where the lock and content map would edit params
  const titleOnly = "INSERT INTO `jd_modules` (`id`,`title`,`params`) VALUES (100,'FOO','{}');\n"
  assert.throws(() => editDump(titleOnly, e), /occurs 0 times in module-100\.params/)
  // in both columns: only params changes
  const both = "INSERT INTO `jd_modules` (`id`,`title`,`params`) VALUES (100,'FOO','FOO');\n"
  assert.equal(
    editDump(both, e),
    "INSERT INTO `jd_modules` (`id`,`title`,`params`) VALUES (100,'FOO','BAR');\n"
  )
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], field: undefined }])), /names its "field"/)
})

test('the same text in two columns: dump, lock and content map edit only the named one', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const e = [{ entity: 'module-100', field: 'params', row: true, from: 'FOO', to: 'BAR', count: 1 }]
  const dump = "INSERT INTO `jd_modules` (`id`,`title`,`params`) VALUES (100,'FOO','FOO');\n"
  assert.equal(
    editDump(dump, e),
    "INSERT INTO `jd_modules` (`id`,`title`,`params`) VALUES (100,'FOO','BAR');\n"
  )
  const lock = JSON.stringify({ entities: { 'module-100': { title: 'FOO', params: 'FOO' } } }, null, 2)
  const L = JSON.parse(editLock(lock, e)).entities['module-100']
  assert.deepEqual(L, { title: 'FOO', params: 'BAR' })
  // a key named like the field deeper in the entity is not the field
  const nested = JSON.stringify(
    { entities: { 'module-100': { meta: { params: 'FOO' }, params: 'FOO' } } },
    null,
    2
  )
  assert.deepEqual(JSON.parse(editLock(nested, e)).entities['module-100'], {
    meta: { params: 'FOO' },
    params: 'BAR'
  })
  assert.throws(
    () => editLock(JSON.stringify({ entities: { 'module-100': { title: 'FOO', params: 'x' } } }), e),
    /occurs 0 times/
  )
  const whole = [{ entity: 'module-100', field: 'params', whole: true, from: 'FOO', to: 'BAR', count: 1 }]
  assert.deepEqual(JSON.parse(editLock(lock, whole)).entities['module-100'], { title: 'FOO', params: 'BAR' })
  const map = JSON.stringify(
    {
      slots: [
        { key: 'module-100.1', entity: 'module-100', column: 'title', sample: 'FOO' },
        { key: 'module-100.2', entity: 'module-100', column: 'params', sample: 'FOO' }
      ]
    },
    null,
    2
  )
  const r = editContentMap(map, e)
  assert.deepEqual(r.edited, ['module-100.2'])
  assert.deepEqual(
    JSON.parse(r.text).slots.map((s) => s.sample),
    ['FOO', 'BAR']
  )
})

test("a row is found by the INSERT's id column, wherever the column list puts it", () => {
  const e = [{ entity: 'module-100', field: 'params', row: true, from: 'BAD', to: 'OK', count: 1 }]
  const dump = "INSERT INTO `jd_modules` (`title`,`id`,`params`) VALUES ('100',200,'BAD'),('A',100,'BAD');\n"
  assert.equal(editDump(dump, e), dump.replace("('A',100,'BAD')", "('A',100,'OK')"))
  const whole = [{ entity: 'module-100', field: 'params', whole: true, from: 'BAD', to: 'OK', count: 1 }]
  assert.equal(editDump(dump, whole), dump.replace("('A',100,'BAD')", "('A',100,'OK')"))
  // the CREATE TABLE gives the order when the INSERT has no list
  const created =
    'CREATE TABLE `jd_modules` (\n  `title` varchar(100),\n  `id` int,\n  `params` text\n);\n' +
    "INSERT INTO `jd_modules` VALUES ('100',200,'BAD'),('A',100,'BAD');\n"
  assert.equal(editDump(created, e), created.replace("('A',100,'BAD')", "('A',100,'OK')"))
  // no list and no CREATE TABLE: the order is unknown, refused
  assert.throws(
    () => editDump("INSERT INTO `jd_modules` VALUES ('100',200,'BAD'),('A',100,'BAD');\n", e),
    /names no columns/
  )
})

test('a whole edit replaces one column value that equals `from`, and refuses one that does not', () => {
  // JA Restaurant 1.0.6: articles of one category tied on publish_up (rule PAGE-2) get distinct minutes
  const dump =
    "INSERT INTO `jd_content` (`id`, `catid`, `publish_up`) VALUES (2,8,'2021-09-27 00:00:00'),(6,8,'2021-09-27 00:00:00');\n"
  const e = [
    {
      entity: 'article-2',
      field: 'publish_up',
      whole: true,
      from: '2021-09-27 00:00:00',
      to: '2021-09-27 00:02:00',
      count: 1
    }
  ]
  assert.equal(editDump(dump, e), dump.replace("(2,8,'2021-09-27 00:00:00')", "(2,8,'2021-09-27 00:02:00')"))
  assert.throws(() => editDump(editDump(dump, e), e))
  const lock = JSON.stringify(
    {
      entities: {
        'article-2': { publish_up: '2021-09-27 00:00:00' },
        'article-6': { publish_up: '2021-09-27 00:00:00' }
      }
    },
    null,
    2
  )
  const L = JSON.parse(editLock(lock, e)).entities
  assert.equal(L['article-2'].publish_up, '2021-09-27 00:02:00')
  assert.equal(L['article-6'].publish_up, '2021-09-27 00:00:00')
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], field: undefined }])))
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], count: 2 }])))
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], whole: 'yes' }])))
})

test('an edit may empty a value: the slot that sampled it whole keeps an empty sample', async () => {
  // JA Restaurant 1.0.6: the OpenTable restaurant id of module 142 is a machine id, not copy (STAB-2)
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const e = [{ entity: 'module-142', field: 'params', row: true, from: '57592', to: '', count: 1 }]
  const dump = 'INSERT INTO `jd_modules` (`id`, `params`) VALUES (142,\'{\\"ot-id\\":[\\"57592\\"]}\');\n'
  assert.equal(editDump(dump, e), dump.replace('57592', ''))
  const map = JSON.stringify(
    {
      slots: [
        { key: 'module-142.1', entity: 'module-142', column: 'params', sample: '57592' },
        { key: 'module-142.2', entity: 'module-142', column: 'params', sample: 'Book a table, 57592' },
        { key: 'module-142.3', entity: 'module-142', column: 'title', sample: '57592' }
      ]
    },
    null,
    2
  )
  const r = editContentMap(map, e)
  assert.deepEqual(r.edited, ['module-142.1', 'module-142.2'])
  const slots = JSON.parse(r.text).slots
  assert.deepEqual(
    slots.map((s) => s.sample),
    ['', 'Book a table, ', '57592']
  )
})

test('a nested JSON pair edit changes one setting of a JSON string inside the column, in the dump, the lock and the map', async () => {
  // JA Diner 1.0.3: the ACM buttons of modules 121 and 122 linked to "#" (rule PAGE-5); the link sits in
  // `jatools-config`, a JSON string inside the module's params, next to four image links that are also "#"
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({ 'f[link-img]': ['#', '#'], 'f[button-link]': ['#'] }),
    cache: '1'
  })
  const sql = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll("'", "\\'")
  const dump = `INSERT INTO \`jd_modules\` (\`id\`, \`params\`) VALUES (120,'${sql(params)}'),(121,'${sql(params)}');\n`
  const e = [
    {
      entity: 'module-121',
      field: 'params',
      row: true,
      json: true,
      nested: true,
      from: '"f[button-link]":["#"]',
      to: '"f[button-link]":["index.php?Itemid=144"]',
      count: 1
    }
  ]
  assert.deepEqual(loadContentEdits(editsFile(e)), e)
  const edited = editDump(dump, e)
  const want = JSON.stringify({
    'jatools-config': JSON.stringify({
      'f[link-img]': ['#', '#'],
      'f[button-link]': ['index.php?Itemid=144']
    }),
    cache: '1'
  })
  assert.equal(edited, dump.replace(`(121,'${sql(params)}')`, `(121,'${sql(want)}')`))
  assert.throws(() => editDump(edited, e), /occurs 0 times/)
  const lock = JSON.stringify(
    { entities: { 'module-120': { params }, 'module-121': { title: 'F', params } } },
    null,
    2
  )
  const next = JSON.parse(editLock(lock, e))
  assert.equal(next.entities['module-121'].params, want)
  assert.equal(next.entities['module-120'].params, params)
  const map = JSON.stringify(
    {
      slots: [
        {
          key: 'module-121.1',
          entity: 'module-121',
          column: 'params',
          sample: '#',
          jsonPath: ['f[link-img]', 0],
          nestedJson: 'jatools-config'
        },
        {
          key: 'module-121.2',
          entity: 'module-121',
          column: 'params',
          sample: '#',
          jsonPath: ['f[button-link]', 0],
          nestedJson: 'jatools-config'
        },
        {
          key: 'module-120.2',
          entity: 'module-120',
          column: 'params',
          sample: '#',
          jsonPath: ['f[button-link]', 0],
          nestedJson: 'jatools-config'
        }
      ]
    },
    null,
    2
  )
  const r = editContentMap(map, e)
  assert.deepEqual(r.edited, ['module-121.2'])
  assert.deepEqual(
    JSON.parse(r.text).slots.map((s) => s.sample),
    ['#', 'index.php?Itemid=144', '#']
  )
  // nested needs a JSON pair kept in its row, and the array holds one string
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], row: undefined }])))
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], json: undefined }])))
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], nested: 'yes' }])))
  assert.throws(() => loadContentEdits(editsFile([{ ...e[0], to: '"f[button-link]":["a","b"]' }])))
  assert.throws(() =>
    loadContentEdits(editsFile([{ ...e[0], to: '"f[button-link]":["#"]', from: '"g":["#"]' }]))
  )
})

test('a row edit of a column the lock does not pin edits the dump alone, and still needs the entity in the lock', () => {
  // JA Diner 1.0.3: modules 103 and 108 list the newest articles by `created`, tied for 21 articles (rule
  // PAGE-2); the lock pins an article's publish_up, not its created
  const dump =
    "INSERT INTO `jd_content` (`id`, `created`, `publish_up`) VALUES (3,'2021-09-06 09:16:21','2021-09-10 00:00:00');\n"
  const e = [
    {
      entity: 'article-3',
      field: 'created',
      whole: true,
      from: '2021-09-06 09:16:21',
      to: '2021-09-06 10:53:21',
      count: 1
    }
  ]
  assert.equal(editDump(dump, e), dump.replace('09:16:21', '10:53:21'))
  const lock = JSON.stringify({ entities: { 'article-3': { publish_up: '2021-09-10 00:00:00' } } }, null, 2)
  assert.equal(editLock(lock, e), lock)
  assert.throws(() => editLock(lock, [{ ...e[0], entity: 'article-4' }]), /no entities\.article-4/)
})

test("a row edit finds its row in an installer's SQL, whose tables are named with Joomla's #__ prefix", () => {
  // JA Diner 1.0.3 is an installer zip: installation/sql/mysql/custom.sql writes `#__content`
  const sql = [
    'CREATE TABLE `#__content` (\n  `id` int,\n  `publish_up` datetime\n);\n',
    "INSERT INTO `#__content` (`id`, `publish_up`) VALUES (2,'2021-09-10 00:00:00'),\n(3,'2021-09-10 00:00:00');\n"
  ]
  const e = [
    {
      entity: 'article-3',
      field: 'publish_up',
      whole: true,
      from: '2021-09-10 00:00:00',
      to: '2021-09-10 01:37:00',
      count: 1
    }
  ]
  assert.deepEqual(editDump(sql, e), [
    sql[0],
    sql[1].replace("(3,'2021-09-10 00:00:00')", "(3,'2021-09-10 01:37:00')")
  ])
})

test('a nested pair edit keeps its value type: a string never becomes an array or an array a string', async () => {
  // review of JA Diner 1.0.3: "k":"#" -> "k":["x"] would leave the slot that samples "k" whole pointing at the new array
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const base = { entity: 'module-121', field: 'params', row: true, json: true, nested: true, count: 1 }
  const toArray = { ...base, from: '"f[button-link]":"#"', to: '"f[button-link]":["index.php?Itemid=144"]' }
  const toString = { ...base, from: '"f[button-link]":["#"]', to: '"f[button-link]":"index.php?Itemid=144"' }
  assert.throws(() => loadContentEdits(editsFile([toArray])), /keeps its value type/)
  assert.throws(() => loadContentEdits(editsFile([toString])), /keeps its value type/)
  // the content map never learns a sample for a path the edit re-shaped
  const map = JSON.stringify(
    {
      slots: [
        {
          key: 'module-121.1',
          entity: 'module-121',
          column: 'params',
          sample: '#',
          jsonPath: ['f[button-link]']
        }
      ]
    },
    null,
    2
  )
  assert.throws(() => editContentMap(map, [toArray]), /keeps its value type/)
  const same = { ...base, from: '"f[button-link]":"#"', to: '"f[button-link]":"index.php?Itemid=144"' }
  assert.deepEqual(loadContentEdits(editsFile([same])), [same])
  assert.deepEqual(editContentMap(map, [same]).edited, ['module-121.1'])
})

test('a nested pair edit of a number or a boolean updates the slot that samples it', async () => {
  // second review of JA Diner 1.0.3: "k":1 -> "k":true left a slot sampling 1 on 1, with nothing edited
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const base = { entity: 'module-121', field: 'params', row: true, json: true, nested: true, count: 1 }
  const map = JSON.stringify(
    {
      slots: [
        {
          key: 'module-121.1',
          entity: 'module-121',
          column: 'params',
          sample: 1,
          jsonPath: ['k'],
          nestedJson: 'c'
        },
        {
          key: 'module-121.2',
          entity: 'module-121',
          column: 'params',
          sample: '1',
          jsonPath: ['n'],
          nestedJson: 'c'
        },
        {
          key: 'module-121.3',
          entity: 'module-121',
          column: 'params',
          sample: 1,
          jsonPath: ['other'],
          nestedJson: 'c'
        }
      ]
    },
    null,
    2
  )
  const toBool = { ...base, from: '"k":1', to: '"k":true' }
  assert.deepEqual(loadContentEdits(editsFile([toBool])), [toBool])
  const b = editContentMap(map, [toBool])
  assert.deepEqual(b.edited, ['module-121.1'])
  assert.deepEqual(
    JSON.parse(b.text).slots.map((s) => s.sample),
    [true, '1', 1]
  )
  // a sample kept as text takes the new value as text
  const toNumber = { ...base, from: '"n":1', to: '"n":2' }
  const n = editContentMap(map, [toNumber])
  assert.deepEqual(n.edited, ['module-121.2'])
  assert.deepEqual(
    JSON.parse(n.text).slots.map((s) => s.sample),
    [1, '2', 1]
  )
  // every other byte of the map is the capture's own
  assert.equal(n.text, map.replace('"sample": "1"', '"sample": "2"'))
})

test('the table prefix is read from the dump: #__, tr_, and one with an underscore inside', () => {
  const e = [
    {
      entity: 'article-2',
      field: 'publish_up',
      whole: true,
      from: '2021-09-27 00:00:00',
      to: '2021-09-27 00:02:00',
      count: 1
    }
  ]
  for (const prefix of ['#__', 'tr_', 'foo_bar_']) {
    // a longer table that ends with the core name (ucm_content) sits beside the article's own
    const dump =
      `INSERT INTO \`${prefix}modules\` (\`id\`, \`title\`) VALUES (2,'2021-09-27 00:00:00');\n` +
      `INSERT INTO \`${prefix}ucm_content\` (\`id\`, \`publish_up\`) VALUES (2,'2021-09-27 00:00:00');\n` +
      `INSERT INTO \`${prefix}content\` (\`id\`, \`catid\`, \`publish_up\`) VALUES (2,8,'2021-09-27 00:00:00');\n`
    assert.equal(dumpPrefix([dump]), prefix)
    assert.equal(
      editDump(dump, e),
      dump.replace("(2,8,'2021-09-27 00:00:00')", "(2,8,'2021-09-27 00:02:00')"),
      prefix
    )
  }
  // no core table names a prefix: refused, not guessed
  assert.throws(() => editDump('INSERT INTO `x_things` (`id`) VALUES (2);\n', e), /table prefix/)
})

test("a row edit finds its row in an installer's SQL files, whose tables keep the #__ placeholder prefix", () => {
  // JA Fresco 1.0.3: the installer's custom.sql writes `#__content`; a table whose name only starts or
  // ends with the same word (`#__content_types`, `#__ucm_content`) is not the article's
  const sql = [
    "INSERT INTO `#__content_types` (`type_id`, `type_title`) VALUES (2,'2021-09-27 00:00:00');\n",
    "INSERT INTO `#__ucm_content` (`core_content_id`, `core_publish_up`) VALUES (2,'2024-01-18 02:49:47');\n",
    "INSERT INTO `#__content` (`id`, `catid`, `publish_up`) VALUES \n(1,9,'2024-01-18 02:49:47')\n,(2,9,'2024-01-18 02:49:47');\n"
  ]
  const e = [
    {
      entity: 'article-2',
      field: 'publish_up',
      whole: true,
      from: '2024-01-18 02:49:47',
      to: '2024-01-18 02:48:47',
      count: 1
    }
  ]
  assert.deepEqual(editDump(sql, e), [
    sql[0],
    sql[1],
    sql[2].replace("(2,9,'2024-01-18 02:49:47')", "(2,9,'2024-01-18 02:48:47')")
  ])
})

test('a nested edit reaches one ACM field of a module whose two buttons share the old link (JA Fresco hero)', async () => {
  // JA Fresco 1.0.3: hero[btn-link] goes to the Menu page, hero[btn-link-2] (also "#") goes elsewhere in its own edit
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const params = JSON.stringify({
    'jatools-config': JSON.stringify({
      ':type': 'ja_fresco:hero',
      hero: { 'hero[btn-link]': ['#'], 'hero[btn-link-2]': ['#'], 'hero[image]': ['a.jpg#joomlaImage://x'] }
    })
  })
  const sql = (s) => s.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('"', '\\"')
  const dump = `INSERT INTO \`#__modules\` (\`id\`, \`title\`, \`params\`) VALUES (112,'Hero','${sql(params)}');\n`
  const e = [
    {
      entity: 'module-112',
      field: 'params',
      row: true,
      json: true,
      nested: true,
      from: '"hero[btn-link]":["#"]',
      to: '"hero[btn-link]":["index.php?Itemid=128"]',
      count: 1
    }
  ]
  const config = (p) => JSON.parse(JSON.parse(p)['jatools-config']).hero
  const row = /VALUES \(112,'Hero','(.*)'\);/
    .exec(editDump(dump, e))[1]
    .replaceAll('\\"', '"')
    .replaceAll('\\\\', '\\')
  assert.deepEqual(config(row), {
    'hero[btn-link]': ['index.php?Itemid=128'],
    'hero[btn-link-2]': ['#'],
    'hero[image]': ['a.jpg#joomlaImage://x']
  })
  const lock = JSON.stringify({ entities: { 'module-112': { title: 'Hero', params } } }, null, 2)
  assert.deepEqual(config(JSON.parse(editLock(lock, e)).entities['module-112'].params), config(row))
  const map = JSON.stringify(
    {
      slots: [
        {
          key: 'module-112.5',
          entity: 'module-112',
          column: 'params',
          sample: '#',
          jsonPath: ['hero', 'hero[btn-link]', 0]
        },
        {
          key: 'module-112.7',
          entity: 'module-112',
          column: 'params',
          sample: '#',
          jsonPath: ['hero', 'hero[btn-link-2]', 0]
        }
      ]
    },
    null,
    2
  )
  const m = editContentMap(map, e)
  assert.deepEqual(m.edited, ['module-112.5'])
  assert.deepEqual(
    JSON.parse(m.text).slots.map((s) => s.sample),
    ['index.php?Itemid=128', '#']
  )
})

test("an extension's table named like a core one is not a prefix: its CREATE TABLE lacks the core table's columns", () => {
  // JA Cagox 1.0.2 (VirtueMart): jd_virtuemart_categories, jd_virtuemart_modules and jd_virtuemart_vendor_users end
  // with core names, and their CREATE TABLE shows they are the shop's own tables, not a second Joomla schema
  const create = (table, columns) =>
    `CREATE TABLE \`${table}\` (\n${columns.map((c) => `  \`${c}\` text`).join(',\n')}\n) ENGINE=InnoDB;\n`
  const dump =
    create('jd_content', ['id', 'catid', 'introtext', 'publish_up']) +
    create('jd_modules', ['id', 'title', 'module', 'position']) +
    create('jd_virtuemart_categories', ['virtuemart_category_id', 'category_layout']) +
    create('jd_virtuemart_modules', ['module_id', 'module_name']) +
    create('jd_virtuemart_vendor_users', ['virtuemart_vendor_id', 'virtuemart_user_id']) +
    "INSERT INTO `jd_virtuemart_categories` VALUES (2,'default');\n" +
    "INSERT INTO `jd_content` VALUES (2,8,'<p>x</p>','2021-09-27 00:00:00');\n"
  assert.equal(dumpPrefix([dump]), 'jd_')
  const e = [
    {
      entity: 'article-2',
      field: 'publish_up',
      whole: true,
      from: '2021-09-27 00:00:00',
      to: '2021-09-27 00:02:00',
      count: 1
    }
  ]
  assert.equal(editDump(dump, e), dump.replace("'2021-09-27 00:00:00'", "'2021-09-27 00:02:00'"))
  // a CREATE TABLE that does carry the core columns under another prefix is still a second schema
  const twice = dump + create('old_modules', ['id', 'title', 'module', 'position'])
  assert.throws(() => dumpPrefix([twice]), /2 table prefixes name core tables \(jd_ 2, old_ 1\)/)
})

test('a dump with more than one real table prefix is refused, naming them; a Joomla fragment is never a prefix', () => {
  // review of #1521: one copy of a row was edited and the other silently left
  const ins = (t) => `INSERT INTO \`${t}\` (\`id\`, \`title\`) VALUES (2,'OLD');\n`
  const dump = (...tables) => tables.map(ins).join('')
  const e = [{ entity: 'module-2', field: 'title', row: true, from: 'OLD', to: 'NEW', count: 1 }]
  // two unrelated prefixes with the same support
  assert.throws(() => editDump(dump('tr_modules', 'foo_bar_modules'), e), /tr_ 1, foo_bar_ 1/)
  // a longer real prefix that starts with a shorter one: `foo_modules` is no table of Joomla's
  assert.throws(() => editDump(dump('tr_modules', 'tr_foo_modules', 'tr_foo_content'), e), /tr_foo_ 2, tr_ 1/)
  // a clear winner beside a smaller real prefix is refused too
  assert.throws(
    () => dumpPrefix([dump('tr_modules', 'tr_content', 'tr_menu', 'old_modules')]),
    /2 table prefixes name core tables \(tr_ 3, old_ 1\)/
  )
  // a Joomla installer's dump: `#__` names the core tables, and Joomla's own tables that end with a core name
  // (`ucm_content`, `modules_menu`, `action_logs_*`) are fragments under it
  const installer = [
    '#__content',
    '#__modules',
    '#__menu',
    '#__ucm_content',
    '#__modules_menu',
    '#__action_logs_users',
    '#__action_logs_extensions'
  ]
    .map((t) => `CREATE TABLE IF NOT EXISTS \`${t}\` (\n  \`id\` int\n);\n`)
    .join('')
  assert.equal(dumpPrefix([installer]), '#__')
  assert.equal(dumpPrefix(['CREATE TABLE `#__ucm_content` (\n);\nCREATE TABLE `#__content` (\n);\n']), '#__')
})

test('a row whose unquoted value calls a function, as CURRENT_TIMESTAMP(), is read to its real end', () => {
  const dump =
    "INSERT INTO `#__categories` (`id`, `title`, `created_time`, `note`) VALUES (10,'Old title',CURRENT_TIMESTAMP(),'x'),(11,'Old title',NOW(),'y');\n"
  const e = [
    { entity: 'category-10', field: 'title', whole: true, from: 'Old title', to: 'New title', count: 1 }
  ]
  assert.equal(editDump(dump, e), dump.replace("(10,'Old title'", "(10,'New title'"))
})

test('a table edit reaches a copy Joomla keeps outside the contract (the tag index, the search index), never a contract row', () => {
  // JA Cagox 1.0.2: an article's picture caption was edited, and its copies in the tag index and the
  // Smart Search index still printed the old words on the tag page
  const dump = [
    "INSERT INTO `jd_content` VALUES (2,'Old caption here');",
    'INSERT INTO `jd_ucm_content` VALUES (1,\'{\\"image_intro_alt\\":\\"Old caption here\\"}\'),(2,\'other\');',
    'INSERT INTO `jd_finder_links` VALUES (5,\'s:16:\\"Old caption here\\";\');',
    'CREATE TABLE `jd_content` (\n  `id` int,\n  `introtext` text\n);'
  ].join('\n')
  const edits = loadContentEdits(
    editsFile([
      { table: 'ucm_content', from: 'Old caption here', to: 'New caption text', count: 1 },
      { table: 'finder_links', from: 'Old caption here', to: 'New caption text', count: 1 }
    ])
  )
  const out = editDump(dump, edits)
  assert.equal((out.match(/New caption text/g) ?? []).length, 2)
  // the contract's own row is the entity edit's business, not a table edit's
  assert.match(out, /`jd_content` VALUES \(2,'Old caption here'\)/)
  // the serialized string keeps its length, so PHP still reads it
  assert.match(out, /s:16:\\"New caption text\\"/)
  // the lock and the content map never hold these tables: a table edit leaves them as they are
  assert.equal(editLock('{"entities":{}}', edits), '{"entities":{}}')
  // counted inside the table only, and refused for a table that holds contract entities
  assert.throws(
    () =>
      editDump(
        dump,
        loadContentEdits(editsFile([{ table: 'ucm_content', from: 'Old caption here', to: 'x', count: 2 }]))
      ),
    /occurs 1 times in jd_ucm_content, the edit expects 2/
  )
  assert.throws(
    () => loadContentEdits(editsFile([{ table: 'content', from: 'Old caption here', to: 'x', count: 1 }])),
    /holds contract entities/
  )
  assert.throws(
    () =>
      loadContentEdits(
        editsFile([{ table: 'ucm_content', entity: 'article-2', from: 'a', to: 'b', count: 1 }])
      ),
    /either "entity" or "table"/
  )
})
