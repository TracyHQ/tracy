/**
 * Stage-6 acceptance e2e v4 (send, SEND-v4-new-6, 30/09/2026): ONE comment on the WordPress admin bar's
 * avatar image was refused with "Too much to send at once — send fewer comments" — Enter and Send alike.
 *
 * Every stage-6 send is numbered, so even one comment takes the several-comments form, whose hint is
 * longer than the one-comment hint {@link COMMENT_TURN_LIMIT} was sized against (up to ~4,600 characters
 * with every clause, over the whole 3,944 budget) — for an image with no words of its own, on a page
 * the lookup could not finish, the page data had no room left and nothing more could be cut. And an
 * image's picture could be a data URI or a srcset, its label markup whose quotes grow six-fold when
 * escaped.
 *
 * A single comment always fits: the hint is paid by its own room, a picture is named by a short form
 * (a data URI or blob says so and never its bytes; a srcset by its first address), a head attribute
 * stays near its cap once escaped, and a lone comment is never refused. "Too much" is only for many.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildCommentTurn, COMMENT_TURN_LIMIT, TooLong } from '../src/client/comment-turn.mjs'

const DATA_URI = `data:image/png;base64,${'iVBORw0KGgoAAAANSUhEUgAAABoAAAAa'.repeat(400)}`
const GRAVATAR = (s) => `https://secure.gravatar.com/avatar/${'9f'.repeat(32)}?s=${s}&d=mm&r=g`
const SRCSET = [26, 52, 78].map((s, i) => `${GRAVATAR(s)} ${i + 1}x`).join(', ')
const MARKUP = `<img alt="" src="${GRAVATAR(26)}" srcset="${SRCSET}" class="avatar avatar-26 photo" height="26" width="26" loading="lazy" decoding="async">`
const QUOTES = '"<&>'.repeat(60)

/** The admin bar's avatar, as the picker could send it; the lookup did not finish (`incomplete`). */
const avatar = (image, label = MARKUP) => ({
  url: 'http://e3sw0330.tracy.test/',
  selector: `#wpadminbar #wp-admin-bar-my-account > a.ab-item > img.avatar.avatar-26.photo[srcset="${SRCSET}"]`,
  label,
  text: '',
  inside: `Howdy, e2e3-send-a ${QUOTES}`,
  image,
  marks: Array.from({ length: 12 }, (_, i) => `mark-${i} ${QUOTES}`)
})
const locate = {
  status: 'unknown',
  incomplete: true,
  levels: [
    { kind: 'block', label: MARKUP },
    { kind: 'record', label: `page "Home" ${QUOTES}`, id: 'post:2' }
  ]
}
const one = (element) =>
  buildCommentTurn({
    items: [{ n: 81, text: 'Replace this picture with our logo', element, locate, author: 'e2e3-send-a' }],
    numbered: true
  })

test('one comment on an image with a data-URI src, a srcset and markup for a label is sent, never refused', () => {
  for (const image of [
    { src: DATA_URI, alt: '' },
    { src: SRCSET, alt: QUOTES },
    { src: GRAVATAR(26), alt: '' },
    { src: `blob:http://e3sw0330.tracy.test/${'0'.repeat(36)}`, alt: '' }
  ]) {
    for (const label of [MARKUP, QUOTES]) {
      /** @type {string} */
      let turn = ''
      assert.doesNotThrow(
        () => {
          turn = one(avatar(image, label))
        },
        `src ${image.src.slice(0, 30)}…`
      )
      assert.match(turn, /^Replace this picture with our logo\n/)
      assert.match(turn, /<mentioned-element n="81" /)
      assert.ok(!turn.includes('iVBORw0KGgoAAAANSUhEUgAAABoAAAAa'), 'no bytes of a data URI')
    }
  }
})

test('a picture is named by a short form: a data URI or blob says so, a srcset gives its first address', () => {
  assert.match(
    one(avatar({ src: DATA_URI, alt: 'Logo' })),
    /\nimage: inline picture \(data: URI\) · alt "Logo"\n/
  )
  assert.match(one(avatar({ src: SRCSET, alt: 'Logo' })), /\nimage: alt "Logo"\n/)
  assert.match(
    one(
      avatar({
        src: 'https://w.test/wp-content/uploads/a-photo.jpg 1x, https://w.test/b-photo.jpg 2x',
        alt: ''
      })
    ),
    /\nimage: a-photo\.jpg · no alt printed\n/
  )
})

test('a head attribute full of quotes stays near its cap once escaped', () => {
  const turn = one(avatar({ src: GRAVATAR(26), alt: '' }, QUOTES))
  const head = /<mentioned-element [^\n]*>/.exec(turn)?.[0] ?? ''
  const name = /name="([^"]*)"/.exec(head)?.[1] ?? ''
  assert.ok(name.length <= 2 * 120 + 1, `name is ${name.length} characters escaped`)
})

test('many comments that cannot fit are still refused as too many', () => {
  const words = 'x'.repeat(1500)
  const items = Array.from({ length: 12 }, (_, i) => ({
    n: i + 1,
    text: `${words} ${i}`,
    // Twelve different elements (the same one would make one grouped block).
    element: {
      ...avatar({ src: GRAVATAR(26), alt: '' }),
      selector: `#post-${i} img`,
      url: `http://e3sw0330.tracy.test/p${i}/`
    },
    locate
  }))
  assert.throws(() => buildCommentTurn({ items }), TooLong)
  assert.ok(COMMENT_TURN_LIMIT > 0)
})
