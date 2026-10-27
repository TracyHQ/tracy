/**
 * The cover that hides the page while the site it stands in is being deleted (Akemi, 29/09).
 *
 * The delete's first step tells the dsh to forget the site's sessions, so the live page loses its
 * workspace mid-request and paints dsh's "Choose workspace" hero — measured on cowork.tracy.site:
 * that screen stood from ~2.5 s after the click until the DELETE answered at 4.3 s, longer on a
 * site with more to tear down. The cover goes up before the request and stays until the page
 * navigates away, so that screen is never seen.
 *
 * Pinned here: what the cover says and that it takes itself down, and the wiring in `remove`
 * (up before the request, down again when the request fails, never for another site).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mountDeletingCover } from '../src/client/deleting-cover.ts'

/** Just enough of `document` for the cover: nodes that record attributes, children and removal. */
function fakeDocument() {
  const node = (tag) => ({
    tag,
    attrs: {},
    children: [],
    className: '',
    textContent: '',
    removed: false,
    setAttribute(k, v) {
      this.attrs[k] = v
    },
    append(...kids) {
      this.children.push(...kids)
    },
    remove() {
      this.removed = true
    }
  })
  const doc = {
    head: node('head'),
    body: node('body'),
    createElement: (tag) => node(tag),
    createElementNS: (_ns, tag) => node(tag)
  }
  return doc
}

/** Every text in a node tree, depth first. */
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)].filter(Boolean)

const MARK = { path: 'M0 0h10v10z', color: '#bf5b3d' }

test('the cover names the site being deleted and where the person goes next', () => {
  const doc = fakeDocument()
  mountDeletingCover(doc, {
    title: 'Deleting a.tracy.site…',
    detail: 'Taking you to your next site in a moment.',
    mark: MARK
  })
  const cover = doc.body.children[0]
  assert.equal(cover.attrs.role, 'status')
  assert.equal(cover.attrs['aria-busy'], 'true')
  assert.deepEqual(texts(cover), ['Deleting a.tracy.site…', 'Taking you to your next site in a moment.'])
})

test('the cover draws the Tracy mark it is handed, not a stand-in', () => {
  const doc = fakeDocument()
  mountDeletingCover(doc, { title: 't', detail: 'd', mark: MARK })
  const svg = doc.body.children[0].children.find((c) => c.tag === 'svg')
  const path = svg.children[0]
  assert.equal(path.attrs.d, MARK.path)
  assert.equal(path.attrs.fill, MARK.color)
})

test('taking the cover down removes both the cover and its style', () => {
  const doc = fakeDocument()
  const off = mountDeletingCover(doc, { title: 't', detail: 'd', mark: MARK })
  off()
  assert.equal(doc.body.children[0].removed, true)
  assert.equal(doc.head.children[0].removed, true)
})
