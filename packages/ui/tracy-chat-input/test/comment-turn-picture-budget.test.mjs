// How much room a turn of PICTURE comments leaves for the person's words, with the ids the sites really send
// (30/09/2026).
//
// A picked picture is written through its field, and a `write:` line is never cut (a cut call fails), so it
// is the one part of a picture's block that no budget can shrink: the content id, the slot and the revision
// as the Content API gave them. A journal figure quoted for six-character ids overstated the room by half.
// Here the door runs on the captured WordPress and Joomla answers (`test/fixtures/provenance-spike`, the same
// data `comment-turn-locate.test.mjs` reads) and its picture picks with a write go into one turn, the way the
// Browser tab sends a batch. Measured with these answers, 12 picture comments leave about 190 characters of
// words each on Joomla and 230 on WordPress (2 comments: 270 and 310); the floors below keep a margin, so a
// longer write line or hint turns this red before a customer's batch is refused as `too-long`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { indexContents, locateElement } from '../../../../apps/tracy-web/src/sites/content-locate.js'
import { buildCommentTurn, commentTurnLimit, locateHintMany } from '../src/client/comment-turn.mjs'

/**
 * What the image road pays from its own room (merge of 30/09, `comment-turn.mjs` `buildCommentTurn`): the
 * hint's image clause once, and each block's `image:` / `alt:` / `alt write:` lines.
 */
const imageRoadRoom = (turn) =>
  locateHintMany({ image: true }).length -
  locateHintMany({}).length +
  turn
    .split('\n')
    .filter((line) => /^(image|alt|alt write): /.test(line))
    .reduce((n, line) => n + line.length + 1, 0)

const INPUTS = new URL('./fixtures/provenance-spike/', import.meta.url)
const load = (name) => JSON.parse(gunzipSync(readFileSync(new URL(name, INPUTS))).toString('utf8'))

/** The picture picks of one captured page whose sure answer hands the agent a write. */
function picturePicks(platform, detailFile, domFile, path) {
  const details = load(detailFile)
  const index = indexContents(details, { siteUrl: new URL(details[0].url).origin })
  const dom = load(domFile)
  const bare = (url) => new URL(url).pathname.replace(/\/+$/, '') || '/'
  const page = Object.keys(dom).find((url) => bare(url) === path)
  const picks = []
  for (const one of dom[page]) {
    if (one.kind !== 'image' || typeof one.src !== 'string') continue
    const image = { src: one.src, alt: '' }
    const query = { url: page.split('?')[0], image, marks: one.chain ?? [] }
    const answer = locateElement(index, query, { mayWrite: () => true, platform })
    if (answer.status === 'resolved' && answer.levels.some((level) => level.kind === 'field' && level.next))
      picks.push({ query, answer })
  }
  return picks
}

/** `count` comments, each about one of the picks and carrying `words` characters of the person's own. */
function batch(picks, count, words) {
  return Array.from({ length: count }, (_, i) => {
    const { query, answer } = picks[i % picks.length]
    return {
      n: i + 1,
      text: 'Replace this photo with the new one from the team folder. '.repeat(20).slice(0, words),
      element: {
        url: query.url,
        selector: `main > section:nth-child(${i + 1}) > figure > img`,
        label: answer.levels.at(-1).label,
        text: '',
        tag: 'img',
        image: query.image,
        marks: query.marks
      },
      locate: { ...answer, chosen: { level: 0, candidate: null, source: null } }
    }
  })
}

for (const [platform, files, path] of [
  ['wordpress', ['w-detail.json.gz', 'w-dom-stamped.json.gz'], '/'],
  ['joomla', ['j-detail.json.gz', 'j-dom-stamped.json.gz'], '/en']
]) {
  test(`${platform}: a batch of picture comments keeps room for the words, with the ids the site sends`, () => {
    const picks = picturePicks(platform, ...files, path)
    assert.ok(picks.length > 0, 'the captured page has picture picks with a write')
    for (const [count, words] of [
      [2, 200],
      [12, 150]
    ]) {
      const turn = buildCommentTurn({ items: batch(picks, count, words) })
      assert.ok(
        turn.length <= commentTurnLimit(count) + imageRoadRoom(turn),
        `${count} comments: ${turn.length} characters`
      )
      // Every block still carries its write: the line a budget may never cut.
      assert.equal(turn.split('\n').filter((line) => line.startsWith('write: ')).length, count)
    }
  })
}
