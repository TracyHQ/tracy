// Step 8's alt reaches every placed picture whose record keeps an alt beside it (ADR 0043 section 3f): an article's intro or
// full picture (`image_intro_alt`, `image_fulltext_alt` in its images column) and a picture printed in a record's HTML (the
// `alt` of the img whose src the contract wrote). After the contract call, each record is read whole and its alt written with
// content.update, one write per record column. Every word, record and picture here is invented.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { runWriteStep } from '../src/write-step/write-step.js'
import { SITE } from './_write-step-run.mjs'
import { frozenWithPictures, HERO, pictureKit, picturePackage, pictureSite } from './_write-step-pictures.mjs'

const INTRO = 'A made-up coach tapes a boxer’s hands before class.'
const INLINE = 'Two made-up boxers spar in a bright ring.'

const CONTENT_MAP = {
  slots: [
    { key: 'article-7.5', entity: 'article-7', column: 'images', type: 'image', jsonPath: ['image_intro'] },
    {
      key: 'module-2.pic',
      entity: 'module-2',
      column: 'content',
      type: 'image',
      xpath: '/html/body/div/img/@src'
    }
  ]
}

/** The fake site, with an article and a module whose rows hold what the contract call just wrote. */
function siteWithRecords({ refuse = null } = {}) {
  const site = pictureSite()
  const rows = new Map([
    [
      'article 7',
      {
        images: JSON.stringify({
          image_intro: `${HERO.entry.sitePath}#joomlaImage://local-images/x.png?width=1&height=1`,
          image_intro_alt: 'The demo template alt',
          image_fulltext: '',
          image_fulltext_alt: ''
        })
      }
    ],
    ['module 2', { content: `<div><img src="/${HERO.entry.sitePath}" alt="The demo alt"><p>Words</p></div>` }]
  ])
  const updates = []
  const door = {
    async apply(call) {
      const { action, params } = call
      const name = `${params?.kind} ${params?.id}`
      if (action === 'content.get' && rows.has(name)) return { ok: true, item: { ...rows.get(name) } }
      if (action === 'content.update' && rows.has(name)) {
        updates.push(params)
        if (refuse) return refuse
        Object.assign(rows.get(name), params.fields)
        return { ok: true, kind: params.kind, id: params.id, created: false }
      }
      return site.door.apply(call)
    }
  }
  return { door, rows, updates, site }
}

async function run(alts, siteOpts) {
  const s = siteWithRecords(siteOpts)
  const frozen = frozenWithPictures({ pictures: { ...picturePackage(), alts } })
  try {
    const report = await runWriteStep({
      door: s.door,
      siteKey: SITE,
      kit: pictureKit(),
      contentMap: CONTENT_MAP,
      files: frozen.files,
      sleep: async () => {}
    })
    return { report, ...s, line: (slot) => report.slots.find((l) => l.slot === slot && l.part === 'alt') }
  } finally {
    frozen.done()
  }
}

test('an article picture and a picture in a record HTML take the alt step 8 wrote from them', async () => {
  const { report, rows, updates, line } = await run({ 'article-7.5': INTRO, 'block-2.pic': INLINE })
  assert.equal(report.status, 'done', JSON.stringify(report.cause))
  const images = JSON.parse(rows.get('article 7').images)
  assert.equal(images.image_intro_alt, INTRO)
  assert.match(images.image_intro, /^images\/tracy-content\//, 'the picture the contract wrote is kept')
  assert.match(rows.get('module 2').content, new RegExp(`alt="${INLINE}"`))
  assert.match(rows.get('module 2').content, /<p>Words<\/p>/, 'the rest of the HTML is kept')
  assert.equal(updates.length, 2, 'one write per record column')
  assert.ok(
    updates.every((u) => typeof u.apply_id === 'string' && u.apply_id),
    'each write can be undone'
  )
  for (const [slot, text] of [
    ['article-7.5', INTRO],
    ['block-2.pic', INLINE]
  ]) {
    assert.equal(line(slot).status, 'written', slot)
    assert.equal(line(slot).owner, 'picture', slot)
    assert.equal(line(slot).ordered, text, slot)
  }
})

test('a frame step 8 wrote no alt for keeps the record as it is', async () => {
  const { updates, rows } = await run({ 'article-7.5': INTRO })
  assert.equal(updates.length, 1)
  assert.match(rows.get('module 2').content, /alt="The demo alt"/)
})

test('an alt the site refuses fails on its line in the plugin words, and the run still ends done', async () => {
  const { report, line } = await run(
    { 'article-7.5': INTRO },
    { refuse: { ok: false, error: 'busy', message: 'try later' } }
  )
  assert.equal(report.status, 'done')
  assert.equal(line('article-7.5').status, 'failed')
  assert.match(line('article-7.5').reason, /try later/)
})
