/**
 * An imported copy's derived map lists every string leaf of its module and option params, so a
 * password, an API key or a webhook address the customer typed into a setting is a "slot" like any
 * heading. The documents the agent reads must not carry those values (they would reach the model's
 * context and anything that logs it), while a company e-mail or a phone number must stay findable.
 *
 * Every secret below is SYNTHETIC and assembled from fragments, so no literal in this file looks
 * like a live credential to a scanner.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  buildImportContract,
  publishImportContract
} from '../scripts/provision/import-contract-documents.mjs'
import {
  isSensitiveName,
  isSensitiveSlot,
  isSensitiveValue
} from '../scripts/provision/import-contract-sensitive.mjs'

/** Values whose SHAPE gives them away, whatever the setting is called. */
const SHAPED = {
  stripe: ['sk', 'live', '51HxAbCdEfGhIjKlMnOpQrStUv'].join('_'),
  stripePublishable: ['pk', 'test', '51HxAbCdEfGhIjKlMnOpQrStUv'].join('_'),
  google: ['AIza', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'].join(''),
  aws: ['AKIA', 'IOSFODNN7EXAMPLE'].join(''),
  jwt: [
    ['eyJ', 'hbGciOiJIUzI1NiJ9'].join(''),
    ['eyJ', 'zdWIiOiJ0ZXN0LXVzZXIifQ'].join(''),
    'c2lnbmF0dXJlLW5vdC1yZWFs'
  ].join('.'),
  slackToken: ['xox', 'b-0000000000-0000000000-', 'ABCDEFGHIJKLMNOPQRSTUVWX'].join(''),
  githubToken: ['gh', 'p_', 'AbCd1234'.repeat(5)].join(''),
  slackWebhook: [
    'https://hooks.slack.com/',
    'services/T00000000/B00000000/',
    'XXXXXXXXXXXXXXXXXXXXXXXX'
  ].join(''),
  discordWebhook: [
    'https://discord.com/',
    'api/webhooks/000000000000000000/',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ-abcdefghij_0123456789'
  ].join(''),
  urlWithToken: 'https://api.example.com/v1/feed?format=json&token=' + 'abc123SECRETvalue',
  mapsWithKey:
    'https://www.google.com/maps/embed/v1/place?q=Brisbane&key=' +
    ['AIza', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q'].join(''),
  urlWithPassword: ['postgres://app:', 'notarealpass', '@db.example.internal/site'].join(''),
  hex: 'd41d8cd98f00b204e9800998ecf8427e',
  hexUpper: 'D41D8CD98F00B204E9800998ECF8427EAABBCCDD',
  opaque: 'IGQVJWcXk8hYtZ0aBcDeFgHiJkLmNoPqRsTuVwXyZ',
  captcha: '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe',
  privateKey: [
    '-----BEGIN ',
    'RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----'
  ].join(''),
  bearer: 'Bearer ' + 'abcdefghijklmnop0123456789'
}

/** Values that look harmless; only the NAME of the setting gives them away. */
const NAMED = [
  ['key:smtp_password', 'letmein-2026'],
  ['key:apiKey', 'zq-api-0002'],
  ['key:client_secret', 'plain words zq0003'],
  ['key:mailchimp_webhook_url', 'https://hooks.example.test/in/zq0004'],
  ['key:recaptcha_site', 'zq-captcha-0005'],
  ['key:license_key', 'ZZZ-zq0006'],
  ['key:db_pass', 'hunter-zq0007'],
  ['key:accessToken', 'zq-token-0008'],
  ['key:privateNote', 'call me zq0009']
]

/** Ordinary content an agent must still be able to find and change. */
const ORDINARY = {
  title: 'A real imported title',
  phone: 'Ph: +61 (0)7 5550 6697',
  email: 'info@acme-travel.example',
  mailto: 'mailto:info@acme-travel.example',
  tel: 'tel:+61755506697',
  link: 'https://www.instagram.com/acme.travel',
  linkWithQuery: 'https://example.com/shop?category=tours&page=2',
  video: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  handle: 'https://www.youtube.com/@acmetravel',
  picture: '/images/headers/sunset-2024-summer-header-photo.jpg',
  hashedPicture:
    'images/cache/d41d8cd98f00b204e9800998ecf8427e.jpg#joomlaImage://local-images/cache/x.jpg?width=700&height=180',
  colour: '#1a2b3c',
  slug: 'Summer-Sale-2024-Collection-Page',
  sentence: 'Our private tours leave every Tuesday at 9am and cost 120 dollars per person.'
}

const slot = (index, leaf, current, type = 'text') => ({
  key: `module-${index}.params.${String(index).padStart(10, 'a')}`,
  entity: `module-${index}`,
  column: 'params',
  leaf,
  type,
  current,
  maxCharacters: 400
})

/** A Joomla-shaped inspect over the given slots, with one page that points at the first of them. */
function inputOf(slots, { calibrated } = {}) {
  return {
    platform: 'joomla',
    siteKey: 'source.example',
    copyUrl: 'http://copy.tracy.test:51710',
    inspect: {
      ok: true,
      contract: 'derived/source-copy',
      revision: 'revision-1',
      ...(calibrated === undefined ? {} : { calibrated }),
      slots
    },
    content: {
      site: { name: 'Actual source', defaultLocale: 'en-GB' },
      completeness: { scope: 'supported-content', status: 'complete', unresolved: [] },
      pagination: { nextCursor: null },
      contents: [
        {
          id: 'page-1',
          type: 'page',
          title: 'About',
          url: '/about',
          fields: slots.map((s) => ({ slotKey: s.key })),
          blocks: []
        }
      ]
    },
    info: {}
  }
}

async function everyFile(directory) {
  const found = new Map()
  async function walk(at) {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name)
      if (entry.isDirectory()) await walk(file)
      else found.set(path.relative(directory, file), await readFile(file, 'utf8'))
    }
  }
  await walk(directory)
  return found
}

test('no credential-looking value reaches any published file, and the slots stay mapped', async () => {
  const shaped = Object.values(SHAPED).map((value, at) => slot(at + 1, null, value, 'text'))
  const named = NAMED.map(([leaf, value], at) => slot(100 + at, leaf, value))
  const slots = [...shaped, ...named]
  const bundle = buildImportContract(inputOf(slots, { calibrated: false }))
  const dir = await mkdtemp(path.join(os.tmpdir(), 'import-sensitive-'))
  try {
    await publishImportContract(dir, bundle)
    const files = await everyFile(dir)
    assert.ok(files.size > 10, 'the walk reached the revision directory too')
    const secrets = [...Object.values(SHAPED), ...NAMED.map(([, value]) => value)]
    for (const [name, content] of files) {
      for (const secret of secrets) {
        // The first line of a multi-line key is enough to prove the block was not written.
        const probe = secret.split('\n')[0]
        assert.ok(!content.includes(probe), `${name} carries a withheld value (${probe.slice(0, 8)}…)`)
      }
    }
    assert.ok(!JSON.stringify(bundle).includes(SHAPED.stripe), 'not in any in-memory artifact either')
    // Still mapped: the map, the inventory and the page that names them all keep the keys.
    assert.equal(bundle.contentMap.slots.length, slots.length)
    assert.deepEqual(bundle.inventory.pages[0].slots, slots.map((s) => s.key).sort())
    for (const kept of bundle.contentMap.slots) {
      assert.equal(kept.withheld, true, kept.key)
      assert.equal(kept.writable, true, 'a withheld slot is still a slot the plugin can write')
      assert.equal(kept.current, null, kept.key)
    }
    assert.equal(bundle.coverage.withheld, slots.length)
    assert.equal(
      JSON.parse(files.get(path.join('revisions', bundle.manifest.revision, 'coverage.json'))).withheld,
      slots.length
    )
    assert.equal(files.get('slots.tsv'), '\n', 'every one of them is out of the index')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the entity documents say a value is withheld instead of showing it', () => {
  const bundle = buildImportContract(
    inputOf([slot(1, 'key:smtp_password', 'letmein-2026'), slot(2, 'key:heading', 'Welcome aboard')])
  )
  const secret = bundle.documents['entities/module-1.md']
  assert.match(secret, /key:smtp_password/, 'the setting name is not secret')
  assert.match(secret, /\| withheld \|/)
  assert.doesNotMatch(secret, /letmein/)
  assert.match(bundle.documents['entities/module-2.md'], /Welcome aboard/)
})

test('the name alone withholds a slot, and the same words under an ordinary name stay', () => {
  for (const [leaf, value] of NAMED) {
    assert.equal(isSensitiveValue(value), false, `${value}: only its name (${leaf}) may give it away`)
    assert.equal(isSensitiveSlot(slot(1, leaf, value)), true, leaf)
    assert.equal(isSensitiveSlot(slot(1, 'key:heading', value)), false, `${value} under an ordinary name`)
  }
  assert.equal(isSensitiveSlot(slot(1, 'key:smtp_password', 'letmein-2026')), true)
  assert.equal(isSensitiveSlot(slot(1, 'key:heading', 'letmein-2026')), false)
  for (const name of ['clientSecret', 'API_KEY', 'api-key', 'apikey', 'db_passwd', 'WEBHOOK', 'X-Signature'])
    assert.equal(isSensitiveName(name), true, name)
  for (const name of [
    'title',
    'heading',
    'contact_email',
    'phone',
    'passport_office',
    'bypass_text',
    'params'
  ])
    assert.equal(isSensitiveName(name), false, name)
})

test('the column and the slot key are read as names too', () => {
  assert.equal(
    isSensitiveSlot({
      key: 'option-5.option_value.aaaaaaaaaa',
      column: 'option_value',
      leaf: null,
      current: 'x'
    }),
    false
  )
  assert.equal(
    isSensitiveSlot({
      key: 'option-5.api_token.aaaaaaaaaa',
      column: 'option_value',
      leaf: null,
      current: 'x'
    }),
    true
  )
  assert.equal(
    isSensitiveSlot({ key: 'option-5.x.aaaaaaaaaa', column: 'secret_store', leaf: null, current: 'x' }),
    true
  )
})

test('every credential shape is recognised without any name to go by', () => {
  for (const [name, value] of Object.entries(SHAPED)) assert.equal(isSensitiveValue(value), true, name)
})

test('ordinary content is never withheld: e-mails, links, pictures, colours, sentences', () => {
  for (const [name, value] of Object.entries(ORDINARY)) assert.equal(isSensitiveValue(value), false, name)
  const slots = Object.entries(ORDINARY).map(([name, value], at) =>
    slot(at + 1, `key:${name}`, value, /^(picture|hashedPicture)$/.test(name) ? 'image' : 'text')
  )
  const bundle = buildImportContract(inputOf(slots))
  assert.equal(bundle.coverage.withheld, 0)
  const lines = new Map(
    bundle.documents['slots.tsv']
      .trimEnd()
      .split('\n')
      .map((l) => l.split('\t'))
  )
  for (const [at, [name, value]] of Object.entries(ORDINARY).entries()) {
    assert.equal(lines.get(slots[at].key), value.replace(/\s+/g, ' ').slice(0, 120), name)
  }
  assert.doesNotMatch(bundle.documents['README.md'], /look like passwords, keys or tokens/)
})

test('the README says how many were withheld and names none of them', () => {
  const slots = [
    slot(1, 'key:smtp_password', 'letmein-2026'),
    slot(2, null, SHAPED.stripe),
    slot(3, 'key:heading', 'Welcome aboard')
  ]
  const bundle = buildImportContract(inputOf(slots))
  const readme = bundle.documents['README.md']
  assert.match(readme, /look like passwords, keys or tokens are not written in this folder \(2 of 3\)/)
  for (const s of slots.slice(0, 2)) assert.ok(!readme.includes(s.key), 'no key name on that line')
  assert.equal(bundle.coverage.withheld, 2)
})

test('withholding does not depend on the plugin having calibrated its map', () => {
  for (const calibrated of [true, false, null, undefined]) {
    const bundle = buildImportContract(
      inputOf([slot(1, 'key:smtp_password', 'letmein-2026')], { calibrated })
    )
    assert.equal(bundle.coverage.withheld, 1, String(calibrated))
  }
})
