// The turn of a picked PICTURE, written from the REAL `content.locate` answer (30/09/2026).
//
// `comment-turn-picture.test.mjs` feeds the builder answers written by hand. A picture the record prints
// more than once is decided by the door — `finestPictures` in `apps/tracy-web` — so this file runs the
// door on neutral WordPress pages and hands its answer to the turn exactly as the Browser tab sends it:
// the answer untouched, the element labelled with its LAST level (`resolvedLabel`), the record.
//
// A picture the named block prints once is written through that block's field: its slot, its revision.
// A picture that a second place also prints — an unnamed image block, an `<img>` in another block's
// HTML — is a pick the answer cannot pin to one of the two, so the turn carries no write line: a `write:`
// there would tell the agent, as certain, to replace the picture the person did not pick.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexContents, locateElement } from '../../../../apps/tracy-web/src/sites/content-locate.js'
import { buildCommentTurn } from '../src/client/comment-turn.mjs'

const ORIGIN = 'https://w.test'
const FILE = '/wp-content/uploads/2026/09/assembly-line-photo.png'
const RESIZED = '/wp-content/uploads/2026/09/assembly-line-photo-1024x683.png'

/** One image the way a block's HTML prints it. */
const printed = (src) => `<figure class="wp-block-image"><img src="${src}" alt=""></figure>`

/** A WordPress page with one named image block; `body` lists what its static HTML prints. */
function page({ body, blocks = [] }) {
  return {
    id: 'c1',
    type: 'page',
    title: 'Landing',
    slug: 'landing',
    url: `${ORIGIN}/`,
    revision: 'rev-1',
    native: [{ kind: 'post', id: 7 }],
    bodyHtml: body.map(printed).join(''),
    blocks: [
      {
        id: 'bBanner',
        key: 'banner',
        fields: [{ key: 'banner.img', type: 'image', value: FILE, slotKey: 'landing.banner.img' }]
      },
      ...blocks
    ],
    images: [
      {
        id: 'mLine',
        src: FILE,
        alt: 'Assembly line',
        usages: [{ contentId: 'c1', blockId: 'bBanner', itemId: null }]
      }
    ]
  }
}

/** The turn for a pick of the picture at `src`: what the tab sends, through the door's own answer. */
function turnFor(record, src) {
  const image = { src: `${ORIGIN}${src}`, alt: '' }
  const marks = ['post:7:landing block:core/image', 'post:7:landing']
  const answer = locateElement(
    indexContents([record], { siteUrl: ORIGIN }),
    { url: `${ORIGIN}/`, image, marks },
    { mayWrite: () => true, platform: 'wordpress' }
  )
  assert.equal(answer.status, 'resolved')
  const turn = buildCommentTurn({
    text: 'Replace this picture with the team photo.',
    element: {
      url: `${ORIGIN}/`,
      selector: 'main figure > img',
      label: answer.levels.at(-1).label,
      text: '',
      tag: 'img',
      image,
      marks
    },
    locate: { ...answer, chosen: { level: 0, candidate: null, source: null } }
  })
  return { answer, turn }
}

test('a picture the named block prints once: the turn writes it through that block, the chip on the record', () => {
  const { answer, turn } = turnFor(page({ body: [FILE] }), FILE)
  assert.deepEqual(
    answer.levels.map((level) => level.kind),
    ['field', 'block', 'record']
  )
  assert.match(
    turn,
    /^write: content\.contract \{operation:"apply", changes:\{"landing\.banner\.img":"<new value>"\}, expected_content_revisions:\{"c1":"rev-1"\}\}$/m
  )
  assert.match(turn, new RegExp(`^value: ${FILE.replaceAll('.', '\\.')}$`, 'm'))
  // The chip is the record the tab named, as for every picture pick.
  assert.deepEqual(
    turn.split('\n').filter((line) => line.endsWith(' [picked]')),
    ['- record "page "Landing"" id=c1 (post #7) [picked]']
  )
})

test('a copy of the picture that no named block prints: no write line, the record alone is answered', () => {
  // The unnamed image block's own `<img>` is picked: the same address as the named block's picture.
  const { answer, turn } = turnFor(page({ body: [FILE, RESIZED] }), RESIZED)
  assert.deepEqual(
    answer.levels.map((level) => level.kind),
    ['record']
  )
  assert.doesNotMatch(turn, /^(write|value): /m)
  assert.doesNotMatch(turn, /landing\.banner\.img/)
})

test("the picture inside another named block's HTML: no write line either", () => {
  const about = {
    id: 'bAbout',
    key: 'about',
    fields: [
      {
        key: 'about.body',
        type: 'html',
        value: `<p>How the line runs</p>${printed(RESIZED)}`,
        slotKey: 'landing.about.body'
      }
    ]
  }
  const { turn } = turnFor(page({ body: [FILE, RESIZED], blocks: [about] }), RESIZED)
  assert.doesNotMatch(turn, /^(write|value): /m)
  assert.doesNotMatch(turn, /landing\.banner\.img/)
})
