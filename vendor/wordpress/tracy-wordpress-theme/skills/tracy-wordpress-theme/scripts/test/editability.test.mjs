// review/editability.mjs reads where each occurrence of a run is drawn (issue #7 item 14). A run
// rendered inside the post content (`.wp-block-post-content`) is that post's own text, edited in the
// block editor: the same words in some template file ("Nothing here yet." of an archive template
// against a page body that says it) do not make it baked. The same run drawn OUTSIDE the post
// content is still matched against the templates — baked copy fails, a 404 template included — and
// content copy that still equals a pattern's sample is still flagged for review. A 404 page whose
// copy lives in a synced pattern (a wp_block, text in the database) passes.
import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { judgeEditability } from '../review/editability.mjs'

const THEME = {
  templates: [
    { file: 'templates/archive.html', text: 'nothing here yet for this list.' },
    { file: 'templates/404.html', text: 'this page could not be found anywhere.' },
    { file: 'parts/footer.html', text: 'made with care in the city.' }
  ],
  patterns: [{ file: 'patterns/cta.php', text: 'start your free trial today.' }]
}
const doc = (main, footer = '') => `<!doctype html><html><body><main>${main}</main><footer>${footer}</footer></body></html>`
const content = (html) => `<div class="entry-content wp-block-post-content">${html}</div>`

test('editability: a post-content run is not blamed on a template that carries the same words', () => {
  const v = judgeEditability('http://x/services/', doc(content('<p>Nothing here yet for this list.</p>')), THEME)
  assert.equal(v.status, 'pass', JSON.stringify(v))
  assert.deepEqual(v.baked, [])
  assert.equal(v.inContent, 1)
})

test('editability: the same words outside the post content are baked; one occurrence outside is enough', () => {
  const outside = judgeEditability('http://x/blog/', doc('<p>Nothing here yet for this list.</p>'), THEME)
  assert.deepEqual(outside.baked, [{ run: 'Nothing here yet for this list.', file: 'templates/archive.html' }])
  const both = judgeEditability('http://x/blog/', doc(`${content('<p>Nothing here yet for this list.</p>')}<p>Nothing here yet for this list.</p>`), THEME)
  assert.equal(both.status, 'fail')
  assert.equal(both.inContent, 0)
})

test('editability: post-content copy equal to a pattern sample still needs review; a part inside the content is still a part', () => {
  const v = judgeEditability('http://x/', doc(content('<p>Start your free trial today.</p><p>Made with care in the city.</p>')), THEME)
  assert.equal(v.status, 'needs-review')
  assert.deepEqual(v.sample, [{ run: 'Start your free trial today.', file: 'patterns/cta.php' }])
  assert.deepEqual(v.part, [{ run: 'Made with care in the city.', file: 'parts/footer.html' }])
})

test('editability: 404 copy baked in templates/404.html fails; the same copy from a synced pattern passes', () => {
  const baked = judgeEditability('http://x/404', doc('<h1>This page could not be found anywhere.</h1>'), THEME)
  assert.deepEqual(baked.baked, [{ run: 'This page could not be found anywhere.', file: 'templates/404.html' }])
  const synced = judgeEditability('http://x/404', doc('<div class="wp-block-group"><h1>Sorry, that address is gone.</h1></div>'), THEME)
  assert.equal(synced.status, 'pass')
  assert.equal(synced.examined, 1)
})

test('editability CLI: a --theme that does not exist exits 2 instead of passing every run', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'editability-'))
  try {
    const child = spawn(process.execPath, [new URL('../review/editability.mjs', import.meta.url).pathname, 'http://127.0.0.1:9/', '--theme', join(scratch, 'no-theme')])
    let stderr = ''
    child.stderr.on('data', (d) => (stderr += d))
    child.stdout.resume()
    const [code] = await once(child, 'close')
    assert.equal(code, 2, stderr)
    assert.match(stderr, /--theme.*no-theme/)
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
})
