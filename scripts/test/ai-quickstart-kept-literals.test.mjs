// The kept literals and the site icon of a mapping file name files of the template release the source contract
// locks (ticket #587). On an invented source contract in a throwaway tree.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { keptLiteralFileProblems } from '../ai-quickstart/check-kept-literals.mjs'

const CONTRACT = 'example-gym/j6/1.0.0'

function tree(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'ai-quickstart-kept-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const dir = path.join(root, 'packages/cms/tracy-joomla-quickstart/contracts', CONTRACT)
  mkdirSync(dir, { recursive: true })
  const files = { 'templates/example/html/article.php': 'a1', 'templates/example/favicon.ico': 'b2' }
  writeFileSync(path.join(dir, 'presentation-lock.json'), JSON.stringify({ files }))
  return root
}

const store = { draftedBy: { kit: CONTRACT } }

test('a kept literal and the site icon name files the source contract locks (#587)', (t) => {
  const root = tree(t)
  const mapping = {
    keptLiterals: [{ file: 'templates/example/html/article.php', values: ['facebook'], why: 'x' }],
    look: { favicon: { path: 'templates/example/favicon.ico' } }
  }
  assert.deepEqual(keptLiteralFileProblems(mapping, store, root), [])
  mapping.keptLiterals.push({ file: 'templates/example/html/missing.php', values: ['01'], why: 'x' })
  mapping.look.favicon.path = 'templates/example/icon.png'
  assert.deepEqual(
    keptLiteralFileProblems(mapping, store, root).map((p) => `${p.at}: ${p.message}`),
    [
      'keptLiterals[1].file: templates/example/html/missing.php is no file of the template release the source contract locks',
      'look.favicon.path: templates/example/icon.png is no file of the template release the source contract locks'
    ]
  )
  // A store drafted from a contract not in the tree is not read here.
  assert.deepEqual(keptLiteralFileProblems(mapping, { draftedBy: { kit: 'other/j6/1.0.0' } }, root), [])
})
