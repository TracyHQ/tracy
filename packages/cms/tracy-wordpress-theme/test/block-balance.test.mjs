// Every template, part and pattern of every built theme is block markup that closes what it opens,
// in its own file. WordPress parses each file on its own (a pattern is drawn as its own block), and
// a closer with nothing open stops the parse: the rest of the page prints as raw text. The news
// index's head pattern opened a group its template closed, and /news lost its footer (15/10/2026).
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src')
const DELIMITER = /<!--\s+(\/)?wp:([a-z][a-z0-9_-]*(?:\/[a-z][a-z0-9_-]*)?)\s+(\{[\s\S]*?\}\s+)?(\/)?-->/g

/** The first nesting fault of block markup, or null when every opener is closed in order. */
export function blockFault(markup) {
  const open = []
  for (const [, closer, name, , void_] of markup.matchAll(DELIMITER)) {
    if (void_) continue
    if (!closer) open.push(name)
    else if (open.at(-1) !== name)
      return `closes wp:${name} while ${open.at(-1) ? `wp:${open.at(-1)}` : 'nothing'} is open`
    else open.pop()
  }
  return open.length ? `leaves ${open.map((n) => `wp:${n}`).join(' > ')} open` : null
}

test('the fault finder sees a split block both ways', () => {
  assert.equal(blockFault('<!-- wp:group --><div></div><!-- /wp:group -->'), null)
  assert.match(blockFault('<!-- wp:group --><!-- wp:pattern {"slug":"a"} /-->'), /leaves wp:group open/)
  assert.match(blockFault('<!-- /wp:group -->'), /while nothing is open/)
})

test('every template, part and pattern closes the blocks it opens', () => {
  const faults = []
  for (const target of readdirSync(SRC))
    for (const dir of ['templates', 'parts', 'patterns']) {
      let files = []
      try {
        files = readdirSync(path.join(SRC, target, dir))
      } catch {
        continue
      }
      for (const f of files.filter((n) => /\.(html|php)$/.test(n))) {
        // a pattern's PHP prints words, never block delimiters
        const markup = readFileSync(path.join(SRC, target, dir, f), 'utf8').replace(/<\?php[\s\S]*?\?>/g, '')
        const fault = blockFault(markup)
        if (fault) faults.push(`${target}/${dir}/${f} ${fault}`)
      }
    }
  assert.deepEqual(faults, [])
})
