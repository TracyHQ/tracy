/**
 * REG-PR-1290-ja-vega-wp7-php-leak-1-1-15: a new JA Vega WordPress site no longer prints PHP source.
 * S1: every PHP file the 1.1.15 contract locks under the theme root is byte-identical to the theme
 * source (wp-ja-vega 1.1.17), and every one holding PHP opens with `<?php` (1.1.16's inc/extra.php
 * had four lines of code before it, printed on every page; a file with no `<?php` is a markup
 * fragment the theme includes on purpose).
 * S2: the recorded restore of the 1.1.15 pack answers 200 on every page, none prints PHP, and the
 * theme stylesheet loads on all of them; the 1.1.14 restore beside it shows the defect.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks, needsTasks } from './lib.mjs'

needsTasks()

const c = checks()
const SRC = 'packages/cms/tracy-wordpress-theme/src/wp-ja-vega'
const LOCK = 'packages/cms/tracy-wordpress-quickstart/contracts/ja-vega/wp7/1.1.15/presentation-lock.json'
const EV = 'tasks/evidence/ja-vega-wp7-1-1-15'
const read = (p) => readFileSync(join(ROOT, p))
const json = (p) => JSON.parse(read(p).toString('utf8'))

const lock = json(LOCK)
const root = `${lock.fileRoots[0]}/`
const php = Object.entries(lock.files).filter(([k]) => k.startsWith(root) && k.endsWith('.php'))
c.check('S1: the lock records theme PHP files', php.length > 0, php.length)
const differ = []
const late = []
for (const [k, sha] of php) {
  const buf = read(`${SRC}/${k.slice(root.length)}`)
  if (createHash('sha256').update(buf).digest('hex') !== sha) differ.push(k)
  if (buf.toString('utf8').indexOf('<?php') > 0) late.push(k)
}
c.eq('S1: locked PHP files that differ from the theme source', differ.join(','), '')
c.eq('S1: theme PHP files with text before <?php', late.join(','), '')
c.eq(
  'S1: theme source version',
  /^Version:\s*(\S+)/m.exec(read(`${SRC}/style.css`).toString('utf8'))?.[1],
  '1.1.17'
)

const now = json(`${EV}/1.1.15/pages.json`).summary
const was = json(`${EV}/1.1.14/pages.json`).summary
c.eq('S2: 1.1.15 pages answering 200', `${now.ok}/${now.pages}`, '60/60')
c.eq('S2: 1.1.15 pages printing PHP', now.leaking, 0)
c.eq('S2: 1.1.15 pages with the theme stylesheet', now.withThemeCss, now.pages)
c.check('S2: 1.1.14 showed the defect', was.leaking > 0, was.leaking)
c.done()
