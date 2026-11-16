// A Joomla content plugin code typed into a text (`{loadposition ...}`, `{emailcloak=off}`) is run by the page when the
// field's marker prints and the code is gone (ticket #586). A list that cuts its items' text to a length (a category
// module's intro limit) also leaves the marker without the code; that is a cut, not a run (review 5 Z2), and the page
// says so with an ellipsis or the start of the code. Invented markers only.
import assert from 'node:assert/strict'
import test from 'node:test'
import { parseHTML } from 'linkedom'
import { JOOMLA_PROBES } from '../ai-quickstart/gate/adapters/joomla-probes.mjs'

const judge = (id, body) => {
  const probe = JOOMLA_PROBES.find((p) => p.id === id)
  const html = '<html><body>' + body + '</body></html>'
  return probe.judge({ doc: parseHTML(html).document, code: 'ABC', html })
}

test('Z2: the page that printed the code whole did not run it', () => {
  assert.equal(judge('loadposition', '<p>QxABC {loadposition qxabcl}</p>'), null)
  assert.equal(judge('emailcloak', '<p>QxABC {emailcloak=off}</p>'), null)
})

test('Z2: a text cut by a list (the start of the code, then an ellipsis) is no run, and judges nothing', () => {
  // Review 6 S2: a cut print is not judged either way; the judge says so instead of answering clean.
  assert.deepEqual(judge('loadposition', '<p>QxABC {loadpos...</p>'), { cut: true })
  assert.deepEqual(judge('emailcloak', '<p>QxABC {emailcloak=...</p>'), { cut: true })
})

// Review 7: an ellipsis right after the marker, with no part of the code before it, is read two ways: a page that ran
// the code and printed nothing in its place, then a list's own "..." or "Read more", or a list whose length cut fell
// right after the marker. This page cannot tell them apart, so it judges nothing; the place is judged on a page that
// prints it whole (its own article), and one no page printed whole is `not_judged`.
test('S2: the marker, then an ellipsis with nothing of the code before it, judges nothing on that page', () => {
  assert.deepEqual(judge('loadposition', '<p>QxABC ...</p>'), { cut: true })
  assert.deepEqual(judge('loadposition', '<p>QxABC…</p>'), { cut: true })
  assert.deepEqual(judge('loadposition', '<p>QxABC</p><span>… Read more</span>'), { cut: true })
  assert.deepEqual(judge('emailcloak', '<p>QxABC</p><a>...</a>'), { cut: true })
})

test('S2: the same place printed after the marker with other words on another page is a run there', () => {
  assert.equal(judge('loadposition', '<p>QxABC Next words</p>')?.kind, 'markup_injected')
  assert.equal(judge('loadposition', '<li>QxABC...</li><p>QxABC Next words</p>')?.kind, 'markup_injected')
})

test('S2: a place printed whole on one page and cut on another is judged on the whole print', () => {
  assert.equal(judge('loadposition', '<p>QxABC {loadposition qxabcl}</p><li>QxABC {load...</li>'), null)
})

test('Z2: the marker with the code gone and no cut is a run', () => {
  assert.equal(judge('loadposition', '<p>QxABC </p><p>Next words</p>')?.kind, 'markup_injected')
  assert.equal(judge('emailcloak', '<h3>QxABC</h3>')?.kind, 'markup_injected')
})
