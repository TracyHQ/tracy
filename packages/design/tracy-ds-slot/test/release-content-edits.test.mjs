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

const CONTACT_EDIT = {
  entity: 'contact-1',
  field: 'email_to',
  row: true,
  from: 'before@example.invalid',
  to: 'hello@example.invalid',
  count: 1
}
const CONTACT_CORE = "INSERT INTO `jd_modules` (`id`,`position`) VALUES (110,'footer');\n"
const CONTACT_ROW = "('before@example.invalid',1,'before@example.invalid')"
const CONTACT_INSERT = 'INSERT INTO `jd_contact_details` (`email_to`,`id`,`name`) VALUES '

test('contact row edits find reordered explicit and CREATE-derived columns, preserving other rows and fields', () => {
  const rows = `${CONTACT_ROW},('before@example.invalid',10,'Other');\n`
  const explicit = CONTACT_CORE + CONTACT_INSERT + rows
  const created =
    CONTACT_CORE +
    'CREATE TABLE `jd_contact_details` (\n  `email_to` varchar(255),\n  `id` int,\n  `name` text\n);\n' +
    'INSERT INTO `jd_contact_details` VALUES ' +
    rows
  for (const dump of [explicit, created]) {
    for (const whole of [false, true]) {
      const edits = loadContentEdits(editsFile([{ ...CONTACT_EDIT, ...(whole ? { whole: true } : {}) }]))
      const next = editDump(dump, edits)
      assert.equal(next, dump.replace(CONTACT_ROW, "('hello@example.invalid',1,'before@example.invalid')"))
      assert.throws(() => editDump(next, edits), /occurs 0 times|the edit expects/)
    }
  }
})

test('contact row edits retain missing, duplicate, field, count and prefix refusals', () => {
  const dump = CONTACT_CORE + CONTACT_INSERT + CONTACT_ROW + ';\n'
  assert.throws(() => editDump(dump, [{ ...CONTACT_EDIT, entity: 'contact-2' }]), /0 rows/)
  assert.throws(() => editDump(dump + CONTACT_INSERT + CONTACT_ROW + ';\n', [CONTACT_EDIT]), /2 rows/)
  assert.throws(() => editDump(dump, [{ ...CONTACT_EDIT, field: 'missing' }]), /no column missing/)
  assert.throws(() => editDump(dump, [{ ...CONTACT_EDIT, count: 2 }]), /occurs 1 times/)
  assert.throws(() => loadContentEdits(editsFile([{ ...CONTACT_EDIT, whole: true, count: 2 }])), /count/)
  assert.throws(
    () => editDump(dump + 'INSERT INTO `old_modules` (`id`) VALUES (110);\n', [CONTACT_EDIT]),
    /2 table prefixes/
  )
})

test('contact and module edits keep dump, lock and slot samples consistent within their fields', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const from = CONTACT_EDIT.from
  const html = `<a href="mailto:${from}">${from}</a><span>${from}</span>`
  const edits = loadContentEdits(
    editsFile([
      { entity: 'module-110', field: 'content', row: true, from, to: CONTACT_EDIT.to, count: 3 },
      { ...CONTACT_EDIT, whole: true }
    ])
  )
  const dump =
    `INSERT INTO \`jd_modules\` (\`id\`,\`content\`) VALUES (110,'${html}');\n` +
    CONTACT_INSERT +
    CONTACT_ROW +
    ';\n'
  const lock = JSON.stringify(
    {
      entities: {
        'module-110': { content: html },
        'contact-1': { email_to: from, name: from },
        'contact-2': { email_to: from }
      }
    },
    null,
    2
  )
  const slots = [
    { key: 'module-110.1', entity: 'module-110', column: 'content', sample: `mailto:${from}` },
    { key: 'contact-1.1', entity: 'contact-1', column: 'email_to', sample: from },
    { key: 'contact-1.2', entity: 'contact-1', column: 'name', sample: from },
    { key: 'contact-2.1', entity: 'contact-2', column: 'email_to', sample: from }
  ]
  const nextLock = JSON.parse(editLock(lock, edits))
  const nextMap = editContentMap(JSON.stringify({ slots }, null, 2), edits)
  assert.equal(
    editDump(dump, edits),
    dump
      .replace(html, html.replaceAll(from, CONTACT_EDIT.to))
      .replace(CONTACT_ROW, "('hello@example.invalid',1,'before@example.invalid')")
  )
  assert.equal(nextLock.entities['module-110'].content, html.replaceAll(from, CONTACT_EDIT.to))
  assert.deepEqual(nextLock.entities['contact-1'], { email_to: CONTACT_EDIT.to, name: from })
  assert.equal(nextLock.entities['contact-2'].email_to, from)
  assert.deepEqual(nextMap.edited, ['module-110.1', 'contact-1.1'])
  assert.deepEqual(
    JSON.parse(nextMap.text).slots,
    slots.map((s, i) => (i < 2 ? { ...s, sample: s.sample.replace(from, CONTACT_EDIT.to) } : s))
  )
})

test('contact tables stay entity-scoped alongside the existing ordinary entity tables', () => {
  for (const table of ['contact_details', 'modules', 'content', 'categories', 'menu', 'template_styles']) {
    assert.throws(
      () => loadContentEdits(editsFile([{ table, from: 'before', to: 'after', count: 1 }])),
      /holds contract entities/
    )
  }
})

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

test('a row edit may name a path; a path written as \\/ in the dump is a count mismatch, not a miss', () => {
  // A demo hero button linked to /pages/contact, which a site served without URL rewriting answers 404
  const edit = {
    entity: 'module-400',
    field: 'params',
    row: true,
    from: '/pages/contact',
    to: 'index.php?Itemid=275',
    count: 1
  }
  const [e] = loadContentEdits(editsFile([edit]))
  // outside a row the escapings still decide: a plain edit keeps refusing a slash
  assert.throws(() => loadContentEdits(editsFile([{ ...edit, row: undefined, field: undefined }])), /slashes/)
  const dump = (link) =>
    'CREATE TABLE `jd_modules` (\n  `id` int,\n  `title` varchar(100),\n  `params` text\n);\n' +
    `INSERT INTO \`jd_modules\` VALUES (400,'Hero','{\\"btn-link\\":\\"${link}\\"}'),(450,'Other','{\\"btn-link\\":\\"/pages/contact\\"}');\n`
  // only module 400's row is edited; module 450 keeps the same link
  const before = dump('/pages/contact')
  const at = before.indexOf('/pages/contact')
  assert.equal(editDump(before, [e]), before.slice(0, at) + 'index.php?Itemid=275' + before.slice(at + 14))
  assert.throws(() => editDump(dump('\\\\/pages\\\\/contact'), [e]), /occurs 0 times/)
  const lock = JSON.stringify(
    {
      entities: {
        'module-400': { params: '{"btn-link":"/pages/contact"}' },
        'module-450': { params: '{"btn-link":"/pages/contact"}' }
      }
    },
    null,
    2
  )
  const L = JSON.parse(editLock(lock, [e])).entities
  assert.equal(L['module-400'].params, '{"btn-link":"index.php?Itemid=275"}')
  assert.equal(L['module-450'].params, '{"btn-link":"/pages/contact"}')
})

// JA Voyara 1.0.12 (07/11/2026): Joomla 6 merges an article's own `article_layout` only where the menu item's value is
// `use_article`; the tour category menu items had no such key, so every tour article printed the default layout. The
// next version adds the key: a JSON pair edit may add one setting after a pair it keeps (`"adds": true`).
const ADD_LAYOUT = {
  entity: 'menuItem-7',
  field: 'params',
  row: true,
  json: true,
  adds: true,
  from: '"menu-anchor_css":""',
  to: '"menu-anchor_css":"","article_layout":"use_article"',
  count: 1
}

test('an adding JSON edit keeps its pair and adds one new key, in its row only', () => {
  assert.equal(loadContentEdits(editsFile([ADD_LAYOUT])).length, 1)
  for (const bad of [
    { adds: undefined }, // a plain pair edit changes a value, never adds a key
    { to: '"menu-anchor_css":"x","article_layout":"use_article"' }, // the kept pair changed
    { to: '"menu-anchor_css":"","menu-anchor_css":"x"' }, // the same key again
    { to: '"menu-anchor_css":"","a":"b","c":"d"' }, // two new pairs
    { row: undefined },
    { count: 2 }
  ])
    assert.throws(() => loadContentEdits(editsFile([{ ...ADD_LAYOUT, ...bad }])))
  const dump =
    'INSERT INTO `x_menu` (`id`, `params`) VALUES (7,\'{\\"menu-anchor_css\\":\\"\\",\\"menu_show\\":1}\'),(8,\'{\\"menu-anchor_css\\":\\"\\"}\');'
  const out = editDump(dump, [ADD_LAYOUT])
  assert.ok(
    out.includes(
      '(7,\'{\\"menu-anchor_css\\":\\"\\",\\"article_layout\\":\\"use_article\\",\\"menu_show\\":1}\')'
    )
  )
  assert.ok(out.includes('(8,\'{\\"menu-anchor_css\\":\\"\\"}\')'))
  // a second run finds the key already there
  assert.throws(() => editDump(out, [ADD_LAYOUT]), /already/)
})

// JA Diner 1.0.7 (09/11/2026): 1.0.6 set the dark logo by an UPDATE appended to the installer's SQL, so its lock
// (captured from an installed site) holds `logoimage_dark` while the dump's INSERT rows do not, and the static
// readers saw drift. The next version carries the pair in the rows: an adding edit whose exact pair the lock already
// holds edits the dump alone; a lock holding the key with another value, or elsewhere, is still refused.
const ADD_DARK_LOGO = {
  entity: 'templateStyle-9',
  field: 'params',
  row: true,
  json: true,
  adds: true,
  from: '"logoimage":""',
  to: '"logoimage":"","logoimage_dark":"images/joomlart/logo-dark.png"',
  count: 1
}

test('an adding JSON edit whose pair the lock already holds edits the dump alone', () => {
  assert.equal(loadContentEdits(editsFile([ADD_DARK_LOGO])).length, 1)
  const lockOf = (params) =>
    `${JSON.stringify({ entities: { 'templateStyle-9': { template: 'ja_diner', params } } }, null, 2)}\n`
  const held = lockOf(
    '{"logoimage":"","logoimage_dark":"images/joomlart/logo-dark.png","enable_logoimage_sm":"0"}'
  )
  assert.equal(editLock(held, [ADD_DARK_LOGO]), held)
  // the key held with another value, or not right after the kept pair: the lock and the dump would disagree
  for (const params of [
    '{"logoimage":"","logoimage_dark":"images/other.png","enable_logoimage_sm":"0"}',
    '{"logoimage_dark":"images/joomlart/logo-dark.png","logoimage":"","enable_logoimage_sm":"0"}'
  ])
    assert.throws(() => editLock(lockOf(params), [ADD_DARK_LOGO]), /already holds/)
  // a lock without the key still takes the edit
  const bare = lockOf('{"logoimage":"","enable_logoimage_sm":"0"}')
  assert.equal(
    JSON.parse(editLock(bare, [ADD_DARK_LOGO])).entities['templateStyle-9'].params,
    '{"logoimage":"","logoimage_dark":"images/joomlart/logo-dark.png","enable_logoimage_sm":"0"}'
  )
  // the dump still refuses a row that holds the key
  const dump =
    'INSERT INTO `#__template_styles` (`id`, `params`) VALUES (9,\'{\\"logoimage\\":\\"\\",\\"enable_logoimage_sm\\":\\"0\\"}\'),(10,\'{}\');\n' +
    'INSERT INTO `#__modules` (`id`) VALUES (1);'
  const out = editDump([dump], [ADD_DARK_LOGO])[0]
  assert.ok(
    out.includes('\\"logoimage\\":\\"\\",\\"logoimage_dark\\":\\"images/joomlart/logo-dark.png\\",\\"enable')
  )
  assert.throws(() => editDump([out], [ADD_DARK_LOGO]), /already/)
})

// JA Diner 1.0.7: Joomla's installer seeds `#__template_styles` in base.sql (ids 10 to 12), then the demo's custom.sql
// drops the table and writes its own rows, ids 9 to 16. The rows written before a table is emptied again never reach
// the site, as the readiness check's dump reader reads it (the last rows written win).
test('a row edit skips the rows of a table emptied again later: the rows after the reset are the ones the site gets', () => {
  const base =
    "INSERT INTO `#__template_styles` (`id`, `params`) VALUES (10, '{}'),(11, '{}');\n" +
    'INSERT INTO `#__modules` (`id`) VALUES (1);'
  const custom =
    'DROP TABLE IF EXISTS `#__template_styles`;\n' +
    'INSERT INTO `#__template_styles` (`id`, `params`) VALUES (9,\'{\\"logoimage\\":\\"\\"}\'),(10,\'{\\"logoimage\\":\\"\\"}\');'
  const e = { ...ADD_DARK_LOGO, entity: 'templateStyle-10' }
  for (const texts of [
    [base, custom],
    [custom, base]
  ]) {
    const out = editDump(texts, [e])
    assert.equal(out[texts.indexOf(base)], base)
    assert.ok(out[texts.indexOf(custom)].includes('(10,\'{\\"logoimage\\":\\"\\",\\"logoimage_dark'))
  }
  // without a reset two rows of one id are still refused
  assert.throws(() => editDump([base, custom.replace(/^DROP.*\n/, '')], [e]), /2 rows/)
})

// Synthetic fixtures exercise the stock dump/lock/map transforms without a site or release input.
const scopedArrayEdit = {
  entity: 'module-7',
  field: 'params',
  row: true,
  json: true,
  nested: true,
  nestedJson: 'config',
  jsonPath: ['tiles', 'image', 0],
  from: '"image":["","keep.webp",""]',
  to: '"image":["images/chart.webp","keep.webp",""]',
  count: 1
}
const scopedSql = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll("'", "\\'")
const scopedMap = (slots) => JSON.stringify({ slots, unchanged: { pin: 'kept' } }, null, 2)
const scopedImageSlot = {
  key: 'module-7.1',
  entity: 'module-7',
  column: 'params',
  type: 'image',
  sample: '',
  nestedJson: 'config',
  jsonPath: ['tiles', 'image', 0]
}

test('scoped content: indexed array changes only its addressed string across dump lock and map', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const [e] = loadContentEdits(editsFile([scopedArrayEdit]))
  const params = JSON.stringify({
    config: JSON.stringify({ tiles: { image: ['', 'keep.webp', ''], span: ['2', '1', '1'] } }),
    cache: '1'
  })
  const want = params.replace('\\"image\\":[\\"\\",', '\\"image\\":[\\"images/chart.webp\\",')
  const dump = `INSERT INTO \`jd_modules\` (\`id\`,\`params\`) VALUES (7,'${scopedSql(params)}'),(8,'${scopedSql(params)}');\n`
  assert.equal(editDump(dump, [e]), dump.replace(`(7,'${scopedSql(params)}')`, `(7,'${scopedSql(want)}')`))
  const lock = JSON.stringify({ entities: { 'module-7': { params }, 'module-8': { params } } }, null, 2)
  assert.equal(editLock(lock, [e]), lock.replace(JSON.stringify(params), JSON.stringify(want)))
  const map = scopedMap([
    scopedImageSlot,
    { ...scopedImageSlot, key: 'module-7.2', jsonPath: ['tiles', 'image', 2] },
    { ...scopedImageSlot, key: 'module-8.1', entity: 'module-8' }
  ])
  const result = editContentMap(map, [e])
  assert.deepEqual(result.edited, ['module-7.1'])
  assert.equal(result.text, map.replace('"sample": ""', '"sample": "images/chart.webp"'))
})

test('scoped content: array index shape count and nonselected members are guarded', () => {
  for (const bad of [
    { jsonPath: ['tiles', 'image', 1] },
    { jsonPath: ['tiles', 'image', 3] },
    { jsonPath: ['tiles', 'image', '0'] },
    { jsonPath: undefined },
    { nestedJson: undefined },
    { count: 2 },
    { nested: undefined },
    { row: undefined },
    { field: undefined },
    { to: '"image":["images/chart.webp","changed",""]' },
    { to: '"image":["images/chart.webp","keep.webp"]' },
    { from: '"image":[0,"keep.webp",""]' },
    { to: '"different":["images/chart.webp","keep.webp",""]' }
  ])
    assert.throws(() => loadContentEdits(editsFile([{ ...scopedArrayEdit, ...bad }])))
})

test('scoped content: nested array refuses wrong source address from type and ambiguous map', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const params = JSON.stringify({ config: JSON.stringify({ elsewhere: { image: ['', 'keep.webp', ''] } }) })
  const lock = JSON.stringify({ entities: { 'module-7': { params } } })
  const dump = `INSERT INTO \`jd_modules\` (\`id\`,\`params\`) VALUES (7,'${scopedSql(params)}');\n`
  const [e] = loadContentEdits(editsFile([scopedArrayEdit]))
  assert.throws(() => editDump(dump, [e]))
  assert.throws(() => editLock(lock, [e]))
  for (const bad of [
    { entity: 'module-8' },
    { column: 'title' },
    { nestedJson: 'other' },
    { jsonPath: ['elsewhere', 'image', 0] },
    { sample: 'not empty' },
    { sample: 0 }
  ])
    assert.throws(() => editContentMap(scopedMap([{ ...scopedImageSlot, ...bad }]), [e]))
  assert.throws(() =>
    editContentMap(scopedMap([scopedImageSlot, { ...scopedImageSlot, key: 'module-7.9' }]), [e])
  )
  assert.throws(() => editLock(lock, [{ ...e, from: '"image":["missing","keep.webp",""]' }]))
})

test('scoped content: sequential edits retain current samples and other slot bytes', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const sample = 'Use `first` then `second` then `third`.'
  const edits = ['first', 'second', 'third'].map((s) => ({
    entity: 'article-7',
    field: 'fulltext',
    row: true,
    from: '`' + s + '`',
    to: s,
    count: 1
  }))
  const map = scopedMap([
    {
      key: 'article-7.1',
      entity: 'article-7',
      column: 'fulltext',
      type: 'text',
      xpath: '/html/body/div/p/text()',
      sample,
      role: 'editorial.paragraph'
    },
    { key: 'article-8.1', entity: 'article-8', column: 'fulltext', sample }
  ])
  const result = editContentMap(map, loadContentEdits(editsFile(edits)))
  assert.equal(
    result.text,
    map.replace(JSON.stringify(sample), JSON.stringify('Use first then second then third.'))
  )
  assert.deepEqual(result.edited, ['article-7.1', 'article-7.1', 'article-7.1'])
  const raw = '<p>' + sample + '</p>'
  const lock = JSON.stringify({ entities: { 'article-7': { fulltext: raw } } })
  assert.equal(
    JSON.parse(editLock(lock, edits)).entities['article-7'].fulltext,
    '<p>Use first then second then third.</p>'
  )
})

test('scoped content: exact decoded DOMText correspondence keeps source entities and markup', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  for (const encoded of ['&gt;', '&#62;', '&#x3e;']) {
    const e = {
      entity: 'article-7',
      field: 'fulltext',
      row: true,
      xpath: '/html/body/div/p/text()',
      from: '`x ' + encoded + ' 5`',
      to: 'x ' + encoded + ' 5',
      count: 1
    }
    assert.deepEqual(loadContentEdits(editsFile([e])), [e])
    for (const bad of [{ xpath: '/html/body/div/p/@title' }, { row: undefined }, { json: true }])
      assert.throws(() => loadContentEdits(editsFile([{ ...e, ...bad }])))
    const raw = '<p>Try ' + e.from + ' now.</p><a title="kept">End</a>'
    const sample = 'Try `x > 5` now.'
    const slot = {
      key: 'article-7.1',
      entity: 'article-7',
      column: 'fulltext',
      type: 'text',
      xpath: '/html/body/div/p/text()',
      sample
    }
    const map = scopedMap([
      slot,
      { ...slot, key: 'article-8.1', entity: 'article-8' },
      { ...slot, key: 'article-7.2', column: 'introtext' },
      { ...slot, key: 'article-7.3', type: 'link', xpath: '/html/body/a/@title' }
    ])
    const result = editContentMap(map, loadContentEdits(editsFile([e])))
    assert.deepEqual(result.edited, ['article-7.1'])
    assert.equal(result.text, map.replace(JSON.stringify(sample), JSON.stringify('Try x > 5 now.')))
    const lock = JSON.stringify({ entities: { 'article-7': { fulltext: raw } } })
    assert.equal(JSON.parse(editLock(lock, [e])).entities['article-7'].fulltext, raw.replace(e.from, e.to))
    const dump = `INSERT INTO \`jd_content\` (\`id\`,\`fulltext\`) VALUES (7,'${scopedSql(raw)}');\n`
    assert.equal(editDump(dump, [e]), dump.replace(e.from, e.to))
    for (const bad of [
      { xpath: '/html/body/div/p/@title' },
      { xpath: '/html/body/div/aside/text()' },
      { sample: 'Try `x >  5` now.' },
      { sample: 'Try `X > 5` now.' }
    ])
      assert.throws(() => editContentMap(scopedMap([{ ...slot, ...bad }]), [e]))
  }
})

test('scoped content: ordinary whole-node and nested single-string behavior remains compatible', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const slot = { key: 'module-7.1', entity: 'module-7', column: 'content', sample: 'old' }
  const map = scopedMap([slot])
  const result = editContentMap(map, [
    { entity: 'module-7', from: '>old<', to: '>new<' },
    { entity: 'module-7', from: '>new<', to: '>last<' }
  ])
  assert.equal(result.text, map.replace('"sample": "old"', '"sample": "last"'))
  const nested = {
    entity: 'module-7',
    field: 'params',
    row: true,
    json: true,
    nested: true,
    count: 1,
    from: '"image":["a"]',
    to: '"image":["b"]'
  }
  assert.deepEqual(loadContentEdits(editsFile([nested])), [nested])
  assert.equal(
    JSON.parse(
      editContentMap(scopedMap([{ ...scopedImageSlot, sample: 'a', jsonPath: ['image', 0] }]), [nested]).text
    ).slots[0].sample,
    'b'
  )
})

test('scoped content: encoded ordinary samples retain literal compatibility and decoding happens once', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const e = {
    entity: 'module-7',
    field: 'params',
    row: true,
    from: 'Bar &amp; Place',
    to: 'Bar & Place',
    count: 1
  }
  const raw = scopedMap([
    { key: 'module-7.1', entity: 'module-7', column: 'params', sample: 'Welcome Bar &amp; Place' }
  ])
  assert.equal(editContentMap(raw, [e]).text, raw.replace('Bar &amp; Place', 'Bar & Place'))
  const edit = {
    entity: 'article-7',
    field: 'fulltext',
    row: true,
    xpath: '/html/body/div/p/text()',
    from: '`a &amp;gt; b`',
    to: 'a &amp;gt; b',
    count: 1
  }
  const slot = {
    key: 'article-7.1',
    entity: 'article-7',
    column: 'fulltext',
    type: 'text',
    xpath: '/html/body/div/p/text()',
    sample: 'Try `a &gt; b`'
  }
  assert.equal(JSON.parse(editContentMap(scopedMap([slot]), [edit]).text).slots[0].sample, 'Try a &gt; b')
  assert.throws(() => editContentMap(scopedMap([{ ...slot, sample: 'Try `a > b`' }]), [edit]))
  const quoted = { ...edit, from: '`a &quot;b&quot;`', to: 'a &quot;b&quot;' }
  assert.equal(
    JSON.parse(editContentMap(scopedMap([{ ...slot, sample: 'Try `a "b"`' }]), [quoted]).text).slots[0]
      .sample,
    'Try a "b"'
  )
})

test('scoped content: sequential addressed nested edits use the current sample', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const second = {
    ...scopedArrayEdit,
    from: scopedArrayEdit.to,
    to: scopedArrayEdit.to.replace('chart.webp', 'other.webp')
  }
  const result = editContentMap(
    scopedMap([scopedImageSlot]),
    loadContentEdits(editsFile([scopedArrayEdit, second]))
  )
  assert.equal(JSON.parse(result.text).slots[0].sample, 'images/other.webp')
})

test('scoped content: equal array elsewhere cannot redirect a literal pair away from its address', () => {
  const [e] = loadContentEdits(editsFile([scopedArrayEdit]))
  // The addressed value is equal but spaced; the only compact literal belongs to a different parent.
  const params = JSON.stringify({
    config: '{"tiles":{"image": ["", "keep.webp", ""]},"elsewhere":{"image":["","keep.webp",""]}}'
  })
  const lock = JSON.stringify({ entities: { 'module-7': { params } } })
  const dump = `INSERT INTO \`jd_modules\` (\`id\`,\`params\`) VALUES (7,'${scopedSql(params)}');\n`
  assert.throws(() => editDump(dump, [e]), /addressed array differs/)
  assert.throws(() => editLock(lock, [e]), /addressed array differs/)
})

test('scoped content: text address guards the source node rather than an equal attribute or sibling', () => {
  const e = {
    entity: 'article-7',
    field: 'fulltext',
    row: true,
    xpath: '/html/body/div/p/text()',
    from: '`x &gt; 5`',
    to: 'x &gt; 5',
    count: 1
  }
  for (const raw of [
    '<p title="`x &gt; 5`">Try `x > 5`</p>',
    '<p>Unchanged</p><aside>`x &gt; 5`</aside>',
    '<p>`x &gt; 5`</p><p>Ambiguous address</p>'
  ]) {
    const lock = JSON.stringify({ entities: { 'article-7': { fulltext: raw } } })
    const dump = `INSERT INTO \`jd_content\` (\`id\`,\`fulltext\`) VALUES (7,'${scopedSql(raw)}');\n`
    assert.throws(() => editLock(lock, [e]))
    assert.throws(() => editDump(dump, [e]))
  }
})

test('accepted indexed ACM API edits the third empty leaf with dump lock map parity', async () => {
  const { editContentMap } = await import('../src/release-content-edits.mjs')
  const sql = (s) => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll("'", "\\'")
  const old = ''
  const from = ['#', '#', old]
  const to = ['#', '#', 'tel:+123']
  const pair = (values) => `"f[links]":${JSON.stringify(values)}`
  const edit = {
    entity: 'module-121',
    field: 'params',
    row: true,
    json: true,
    nested: true,
    nestedJson: 'jatools-config',
    jsonPath: ['f[links]', 2],
    from: pair(from),
    to: pair(to),
    count: 1
  }
  const e = loadContentEdits(editsFile([edit]))
  const params = (values) =>
    JSON.stringify({ 'jatools-config': JSON.stringify({ 'f[links]': values, keep: 'same' }), cache: '1' })
  const before = params(from),
    after = params(to)
  const dump = `INSERT INTO \`jd_modules\` (\`id\`, \`params\`) VALUES (120,'${sql(before)}'),(121,'${sql(before)}');\n`
  const next = editDump(dump, e)
  assert.equal(next, dump.replace(`(121,'${sql(before)}')`, `(121,'${sql(after)}')`))
  assert.throws(() => editDump(next, e), /addressed array differs from from/)
  const lock = JSON.stringify(
    { entities: { 'module-120': { params: before }, 'module-121': { title: 'Keep', params: before } } },
    null,
    2
  )
  assert.equal(
    editLock(lock, e),
    JSON.stringify(
      { entities: { 'module-120': { params: before }, 'module-121': { title: 'Keep', params: after } } },
      null,
      2
    )
  )
  assert.throws(() => editLock(editLock(lock, e), e), /addressed array differs from from/)
  const slot = {
    key: 'module-121.2',
    entity: 'module-121',
    column: 'params',
    nestedJson: 'jatools-config',
    jsonPath: ['f[links]', 2],
    sample: old
  }
  const slots = [
    { ...slot, key: 'module-121.0', jsonPath: ['f[links]', 0], sample: '#' },
    { ...slot, key: 'module-121.1', jsonPath: ['f[links]', 1], sample: '#' },
    slot,
    { ...slot, key: 'module-120.2', entity: 'module-120' },
    { ...slot, key: 'module-121.3', column: 'title' },
    { ...slot, key: 'module-121.4', jsonPath: ['other', 2] }
  ]
  const map = JSON.stringify({ slots, marker: 'keep' }, null, 2)
  const result = editContentMap(map, e)
  assert.deepEqual(result.edited, [slot.key])
  assert.equal(
    result.text,
    JSON.stringify(
      { slots: slots.map((s) => (s.key === slot.key ? { ...s, sample: to[2] } : s)), marker: 'keep' },
      null,
      2
    )
  )
})
