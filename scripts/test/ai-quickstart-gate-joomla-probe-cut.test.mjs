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

// Review 6 S2: an ellipsis right after the marker, with no part of the code before it, is no cut. The page ran the code
// and printed nothing in its place; what follows is a list's own "..." or "Read more".
test('S2: the marker, the code gone and an ellipsis with nothing of the code before it is a run', () => {
  assert.equal(judge('loadposition', '<p>QxABC ...</p>')?.kind, 'markup_injected')
  assert.equal(judge('loadposition', '<p>QxABC…</p>')?.kind, 'markup_injected')
  assert.equal(judge('loadposition', '<p>QxABC</p><span>… Read more</span>')?.kind, 'markup_injected')
  assert.equal(judge('emailcloak', '<p>QxABC</p><a>...</a>')?.kind, 'markup_injected')
})

test('S2: a place printed whole on one page and cut on another is judged on the whole print', () => {
  assert.equal(judge('loadposition', '<p>QxABC {loadposition qxabcl}</p><li>QxABC {load...</li>'), null)
})

test('Z2: the marker with the code gone and no cut is a run', () => {
  assert.equal(judge('loadposition', '<p>QxABC </p><p>Next words</p>')?.kind, 'markup_injected')
  assert.equal(judge('emailcloak', '<h3>QxABC</h3>')?.kind, 'markup_injected')
})
