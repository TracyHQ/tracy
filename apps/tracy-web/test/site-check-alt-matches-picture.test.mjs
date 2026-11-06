// The site check's `alt-matches-picture` measure: on the written site, each picture step 8 placed is printed with an alt, and that
// alt is compared with what step 8's looker said the picture shows (site-pictures.json `seen`), by the same word overlap step 8 uses
// for its alt notes (lib/alt-compare.js). Every fixture is invented: a made-up swim club, made-up files, no real business.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { altCheckFor } from '../src/site-pictures/alt-notes.js'
import { altMatchesPictureGroup, printedAlts } from '../src/site-check/alt-matches-picture.js'
import { checkLines } from '../src/site-check/check-lines.js'
import { PAGE_READ_GROUPS, runSiteCheck } from '../src/site-check/site-check.js'

const SITE = 'alt-bench.sites.example'
const POOL = 'images/tracy-content/aaaa1111.jpg'
const KIDS = 'images/tracy-content/bbbb2222.jpg'
const TOWELS = 'images/tracy-content/cccc3333.jpg'
const HERO = 'images/tracy-content/dddd4444.jpg'

const kit = () => ({
  pages: [{ id: 'page-pools', path: '/our-pools', blocks: { 1440: ['block-pools'], 390: ['block-pools'] } }],
  blocks: [
    {
      id: 'block-pools',
      slots: [{ id: 'block-5.9', type: 'text', role: 'editorial.heading' }],
      frames: [{ id: 'block-5.1' }, { id: 'block-5.2' }, { id: 'block-5.3' }, { id: 'block-5.4' }],
      lists: []
    }
  ]
})
const keptPages = [{ id: 'page-pools', path: '/our-pools' }]

const picture = (slot, ordered) => ({
  slot,
  key: slot,
  owner: 'picture',
  part: 'picture',
  status: 'written',
  ordered
})
const words = (slot, ordered) => ({ slot, key: slot, owner: 'writer', status: 'written', ordered })
const lines = () => [
  picture('block-5.1', POOL),
  picture('block-5.2', KIDS),
  picture('block-5.3', TOWELS),
  picture('block-5.4', HERO),
  words('block-5.9', 'Two pools for every swimmer'),
  // The writer's alts, written through their alt slots.
  words('block-5.11', 'Indoor swimming pool with four racing lanes'),
  words('block-5.12', 'Outdoor tennis court with a green net')
]
const report = (slots = lines()) => ({
  version: 'site-write-report/1',
  status: 'done',
  site: SITE,
  keptPages,
  slots
})

const frame = (id, sitePath, seen) => ({ frame: id, source: 'owner-photo', sitePath, seen })
const manifest = (frames) => ({ version: 'site-pictures/1', frames, siteSettings: [], altNotes: [] })
const seenAll = () =>
  manifest([
    frame('block-5.1', POOL, 'An indoor swimming pool with four racing lanes and blue water'),
    frame('block-5.2', KIDS, 'A shallow swimming pool where children play with floating toys'),
    frame('block-5.3', TOWELS, null),
    frame('block-5.4', HERO, 'A swimming pool seen from above at dawn')
  ])

const page = (alts) => `<!doctype html><html><head><meta property="og:image" content="/${POOL}"></head><body>
<section class="hero" style="background-image: url('/${HERO}')"><h2>Two pools for every swimmer</h2></section>
<figure><img src="/${POOL}" alt="${alts.pool}"></figure>
<picture><source srcset="/${KIDS} 1x"><img src="/fallback.jpg" alt="${alts.kids}"></picture>
<img src="/${TOWELS}?v=3" alt="Fresh towels by the pool">
</body></html>`

const door = {
  async apply() {
    return { ok: false, error: 'not_found' }
  }
}
const gate = ({ pictures = seenAll(), alts, slots } = {}) =>
  runSiteCheck({
    door,
    report: report(slots),
    kit: kit(),
    pictures,
    pageHtml: async (path) =>
      path === '/our-pools'
        ? page({
            pool: 'Indoor swimming pool with four racing lanes',
            kids: 'Outdoor tennis court with a green net',
            ...alts
          })
        : null,
    groups: [altMatchesPictureGroup],
    now: () => 0
  })

test('the alt of a picture is read from the img that prints it, inside a picture element too, and not from the head', () => {
  const html = page({ pool: 'Pool &amp; lanes', kids: 'Kids' })
  assert.deepEqual(printedAlts(html, POOL), ['Pool & lanes'])
  assert.deepEqual(printedAlts(html, KIDS), ['Kids'])
  assert.deepEqual(printedAlts(html, TOWELS), ['Fresh towels by the pool'])
  assert.deepEqual(printedAlts(html, HERO), [], 'a painted background carries no alt')
  assert.deepEqual(printedAlts('<body><img src="/x.jpg"></body>', 'x.jpg'), [null])
})

test('an alt that describes its picture agrees; one that names another scene blocks on that slot, blamed on step 6', async () => {
  const check = await gate()
  assert.equal(check.status, 'red')
  const [group] = check.groups
  assert.equal(group.name, 'alt-matches-picture')
  assert.equal(group.checked, 2)
  assert.deepEqual(
    group.failures.map((f) => [f.page, f.slot, f.measured, f.seen, f.causingStep, f.level]),
    [
      [
        '/our-pools',
        'block-5.2',
        'Outdoor tennis court with a green net',
        'A shallow swimming pool where children play with floating toys',
        6,
        'block'
      ]
    ]
  )
  assert.match(group.failures[0].reason, /does not describe the picture/)
  assert.deepEqual(group.failures[0].shared, [])
  // The towels picture was never looked at, and the background prints no alt: neither is measured, and each says why.
  assert.deepEqual(
    group.notMeasured.map((n) => n.slot),
    ['block-5.3', 'block-5.4']
  )
  assert.match(group.notMeasured[0].reason, /step 8 left no description/)
  assert.match(group.notMeasured[1].reason, /no alt/)
  assert.ok(
    checkLines(check).some((l) =>
      l.startsWith(
        '  block step 6 (copy) page=/our-pools slot=block-5.2 measured="Outdoor tennis court with a green net"'
      )
    )
  )
})

test('the group is green when every alt describes its picture', async () => {
  const check = await gate({ alts: { kids: 'Children play with floating toys in a shallow pool' } })
  assert.equal(check.status, 'green', JSON.stringify(check.groups[0].failures))
  assert.equal(check.groups[0].checked, 2)
})

test('with no description left by step 8 nothing is measured: checked 0 with a reason, never a failure', async () => {
  const pictures = manifest([frame('block-5.1', POOL, null), frame('block-5.2', KIDS, null)])
  const [group] = (await gate({ pictures })).groups
  assert.equal(group.checked, 0)
  assert.deepEqual(group.failures, [])
  assert.match(group.reason, /no picture was compared/)
  assert.equal(group.notMeasured.length, 4)
})

test('an alt the writer did not write is not blamed on the writer: the write step left it on the page', async () => {
  const slots = lines().filter((l) => l.slot !== 'block-5.12')
  const [group] = (await gate({ slots, alts: { kids: 'Boxers sparring in the ring' } })).groups
  assert.deepEqual(
    group.failures.map((f) => [f.slot, f.causingStep]),
    [['block-5.2', 9]]
  )
  assert.match(group.failures[0].reason, /not words the writer wrote/)
})

test('without the step 8 manifest, a page reader or a kit the group cannot tell; with no written picture it has nothing to do', async () => {
  for (const over of [{ pictures: null }, { pictures: { version: 'site-plan/3' } }]) {
    const [group] = (await gate(over)).groups
    assert.equal(group.status, 'unmeasured', JSON.stringify(over))
  }
  const noReader = await runSiteCheck({
    door,
    report: report(),
    kit: kit(),
    pictures: seenAll(),
    groups: [altMatchesPictureGroup]
  })
  assert.equal(noReader.groups[0].status, 'unmeasured')
  const [none] = (await gate({ slots: [words('block-5.9', 'Two pools')] })).groups
  assert.equal(none.checked, 0)
  assert.match(none.reason, /no written picture/)
  assert.ok(PAGE_READ_GROUPS.includes(altMatchesPictureGroup))
})

test('step 8 says when its alt check is deferred to the site check, instead of leaving altNotes empty in silence', () => {
  assert.equal(altCheckFor(null).status, 'deferred')
  assert.match(altCheckFor(null).reason, /alt-matches-picture/)
  assert.equal(altCheckFor([{ frame: 'block-5.1', text: 'A pool' }]).status, 'compared')
})
