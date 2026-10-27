// The keyterms pilot (`src/lib/speech-keyterms.js`, council 19/10/2026 A1): which of a site's names
// are worth sending the speech service, where they come from, who may have them sent, and the
// operator's list. A stand-in pool answers the few queries; the relay's side is in
// `speech-relay.test.mjs`. Nothing here reaches a speech service.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanKeyterms,
  KEYTERM_LIMITS,
  keytermBook,
  keytermSites,
  parseKeytermSites,
  readKeytermCandidates,
  saveKeytermSites,
  speechKeyterms
} from '../src/lib/speech-keyterms.js'

test('a term is kept as written, once, NFC, spaces collapsed; markup, addresses, long names and labels every site has are left out', () => {
  const decomposed = 'Phở Hà Nội'.normalize('NFD')
  const kept = cleanKeyterms([
    '  Bánh   mì Phượng ',
    'BÁNH MÌ PHƯỢNG',
    decomposed,
    'Pho Ha Noi',
    '<b>Sale</b>',
    'Tom &amp; Jerry',
    'Tom & Jerry',
    'https://shop.example.com',
    'shop.example.com',
    'ana@example.com',
    '2026',
    '',
    'Lindqvist Sofa Collection 2026',
    'Home',
    'Trang chủ',
    'Liên hệ',
    'Über uns',
    '关于我们',
    'Ñoño',
    42,
    null
  ])
  assert.deepEqual(kept, [
    'Bánh mì Phượng',
    'Phở Hà Nội'.normalize('NFC'),
    'Pho Ha Noi',
    'Tom & Jerry',
    'Ñoño'
  ])
  assert.equal(kept[1], 'Phở Hà Nội'.normalize('NFC'), 'stored composed, marks kept')
})

test('a name is never cut: twenty characters fit, twenty-one is left out whole; Chinese counts characters', () => {
  assert.deepEqual(cleanKeyterms(['a'.repeat(20), 'b'.repeat(21)]), ['a'.repeat(20)])
  assert.deepEqual(cleanKeyterms(['越南法棍面包店']), ['越南法棍面包店'])
  // Characters, not UTF-16 units: an emoji-free 20-letter name with marks still fits.
  assert.deepEqual(cleanKeyterms(['Ẩm thực Phượng Hoàng']), ['Ẩm thực Phượng Hoàng'])
})

test('the list stops at the target (thirty), never past the service’s fifty', () => {
  const many = Array.from({ length: 80 }, (_, i) => `Name ${i}`)
  assert.equal(cleanKeyterms(many).length, KEYTERM_LIMITS.target)
  assert.equal(cleanKeyterms(many, { target: 200 }).length, KEYTERM_LIMITS.max)
  assert.deepEqual(cleanKeyterms(many).slice(0, 2), ['Name 0', 'Name 1'], 'in order of worth')
})

/** A pool that answers the brief and the admin log of one site. */
function poolOf({ brief = null, log = [], sites = null, role = 'owner', fail = null } = {}) {
  const asked = []
  return {
    asked,
    async query(sql, params) {
      asked.push({ sql, params })
      if (fail && sql.includes(fail)) throw new Error('database down')
      if (sql.includes('from site_brief')) return { rows: brief ? [brief] : [] }
      if (sql.includes('from site_cms_change')) return { rows: log }
      if (sql.includes('keyterm_sites')) return { rows: sites === null ? [] : [{ keyterm_sites: sites }] }
      if (sql.includes('from account')) return { rows: [{ id: 'acc-1', email: params[0] }] }
      if (sql.includes('from seat')) return { rows: role ? [{ role }] : [] }
      throw new Error(`unexpected query: ${sql}`)
    }
  }
}

const row = (resource_type, resource_title, op = 'update', resource_id = resource_title) => ({
  resource_type,
  resource_id,
  resource_title,
  op
})

test('names come in order of worth: the business name, then products, menu entries, then page titles', async () => {
  const pool = poolOf({
    brief: { name: 'Bánh mì Phượng', name_from: 'answer' },
    log: [
      row('page', 'Our story in Hội An'),
      row('product', 'Bánh mì thịt nướng'),
      row('menu_item', 'Phượng Catering'),
      row('media', 'IMG_2041.jpg'),
      row('user', 'Phuong Admin'),
      row('post', 'Hello world!')
    ]
  })
  const candidates = await readKeytermCandidates(pool, 'shop.example.com')
  assert.deepEqual(candidates, [
    'Bánh mì Phượng',
    'Bánh mì thịt nướng',
    'Phượng Catering',
    'Our story in Hội An',
    'Hello world!'
  ])
  assert.deepEqual(cleanKeyterms(candidates), [
    'Bánh mì Phượng',
    'Bánh mì thịt nướng',
    'Phượng Catering',
    'Our story in Hội An'
  ])
  // Both reads are bound to the site, and to rows newer than the site standing under the key now.
  for (const q of pool.asked) {
    assert.deepEqual(q.params, ['shop.example.com'])
    assert.match(q.sql, /s\.created_at is null or/)
  }
})

test('a name made from the address is not the business’s; a record deleted last is no name any more', async () => {
  const pool = poolOf({
    brief: { name: 'Shop', name_from: 'label' },
    log: [
      // Newest first, as the query orders them: the product was deleted after it was renamed.
      row('product', 'Old Sofa', 'delete', '17'),
      row('product', 'Old Sofa', 'update', '17'),
      row('page', 'Lindqvist Showroom', 'create', '9')
    ]
  })
  assert.deepEqual(await readKeytermCandidates(pool, 'shop.example.com'), ['Lindqvist Showroom'])
  assert.deepEqual(await readKeytermCandidates(poolOf(), 'shop.example.com'), [], 'no brief, no log: no list')
})

test('a site’s list is read once per site and language while it is fresh, single-flight; a failed read is not kept', async () => {
  let reads = 0
  let time = 0
  let fail = false
  const book = keytermBook({
    read: async () => {
      reads += 1
      if (fail) throw new Error('down')
      return ['Lindqvist', 'Home', 'Lindqvist']
    },
    now: () => time,
    ttlMs: 1000,
    entries: 2
  })
  const [a, b] = await Promise.all([
    book.termsFor('a.example.com', 'vi'),
    book.termsFor('a.example.com', 'vi')
  ])
  assert.deepEqual(a, ['Lindqvist'])
  assert.equal(a, b, 'one read for two sessions at once')
  assert.equal(reads, 1)
  await book.termsFor('a.example.com', 'en')
  assert.equal(reads, 2, 'kept per language')
  time = 1000
  await book.termsFor('a.example.com', 'vi')
  assert.equal(reads, 3, 'read again once stale')
  await book.termsFor('b.example.com', '')
  assert.equal(book.size, 2, 'bounded')
  fail = true
  assert.deepEqual(await book.termsFor('c.example.com', ''), [])
  assert.equal(book.size, 1, 'a failed read is not kept')
})

test('the relay’s lookup: nothing for a site outside the pilot, nothing without a live seat, the names otherwise', async () => {
  const names = { brief: { name: 'Lindqvist', name_from: 'text' } }
  const seats = {
    accountByEmail: async (pool, email) =>
      (await pool.query('select id from account where email = $1', [email])).rows[0],
    grantFor: async (pool, id, siteKey) =>
      (await pool.query('select * from seat where x', [id, siteKey])).rows[0]
  }
  const lookup = (pool) => speechKeyterms({ pool, seats })
  const asking = { email: 'ana@example.com', siteKey: 'shop.example.com', language: 'vi' }
  assert.deepEqual(await lookup(poolOf({ ...names, sites: [] }))(asking), [], 'the pilot off')
  assert.deepEqual(await lookup(poolOf({ ...names, sites: ['other.example.com'] }))(asking), [])
  const unseated = poolOf({ ...names, sites: ['shop.example.com'], role: null })
  assert.deepEqual(await lookup(unseated)(asking), [], 'no live seat: no names')
  assert.ok(!unseated.asked.some((q) => q.sql.includes('site_brief')), 'and nothing of the site is read')
  assert.deepEqual(await lookup(poolOf({ ...names, sites: ['shop.example.com'] }))(asking), ['Lindqvist'])
  assert.deepEqual(
    await lookup(poolOf({ ...names, sites: ['shop.example.com'], fail: 'keyterm_sites' }))(asking),
    [],
    'a list that cannot be read: none, never a throw'
  )
  assert.deepEqual(await speechKeyterms({ pool: null, seats })(asking), [], 'no database')
  assert.deepEqual(
    await lookup(poolOf({ ...names, sites: ['shop.example.com'] }))({ ...asking, siteKey: 'x' }),
    []
  )
})

test('the operator’s list: site keys, lower case, each once; anything else is refused', () => {
  assert.deepEqual(parseKeytermSites([' Shop.Example.com ', 'shop.example.com', '', 'b.tracy.site']), {
    ok: true,
    sites: ['shop.example.com', 'b.tracy.site']
  })
  assert.deepEqual(parseKeytermSites([]), { ok: true, sites: [] })
  assert.deepEqual(parseKeytermSites('shop.example.com'), { ok: false, error: 'SITES_NOT_LIST' })
  assert.deepEqual(parseKeytermSites([42]), { ok: false, error: 'SITE_KEY_INVALID' })
  assert.deepEqual(parseKeytermSites(['shop']), { ok: false, error: 'SITE_KEY_INVALID' })
  assert.deepEqual(parseKeytermSites(['shop example.com']), { ok: false, error: 'SITE_KEY_INVALID' })
  const tooMany = Array.from({ length: KEYTERM_LIMITS.sites + 1 }, (_, i) => `s${i}.example.com`)
  assert.deepEqual(parseKeytermSites(tooMany), { ok: false, error: 'TOO_MANY_SITES' })
})

test('the list is read and saved in speech_setting; saving leaves the key’s own stamp alone', async () => {
  assert.deepEqual(await keytermSites(null), [], 'no database: the pilot is off')
  assert.deepEqual(await keytermSites(poolOf()), [], 'no row: the pilot is off')
  assert.deepEqual(await keytermSites(poolOf({ sites: ['a.example.com'] })), ['a.example.com'])
  const asked = []
  await saveKeytermSites(
    { query: async (sql, params) => asked.push({ sql, params }) },
    ['a.example.com'],
    'ops@example.com'
  )
  assert.match(asked[0].sql, /insert into speech_setting/)
  assert.match(asked[0].sql, /on conflict \(id\) do update set keyterm_sites = excluded\.keyterm_sites$/m)
  assert.doesNotMatch(asked[0].sql.split('on conflict')[1], /updated_by|updated_at/)
  assert.deepEqual(asked[0].params, [['a.example.com'], 'ops@example.com'])
})
