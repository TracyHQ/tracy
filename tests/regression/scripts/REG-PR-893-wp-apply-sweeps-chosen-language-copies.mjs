/**
 * REG-PR-893-wp-apply-sweeps-chosen-language-copies: Apply on WordPress sweeps the pages of every
 * chosen language, including ones the page list does not show. S1/S2: the residue suite exits 0
 * with # fail 0, # pass equal to # tests (at least 28), and both named cases 'ok'. S3: the release
 * inventory of tracy-business/wp7/1.3.2 yields 17 Vietnamese and 17 Russian pages, each with the
 * source page it translates — the probe prints exactly 'vi 17 0' and 'ru 17 0'.
 */
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()

const s1 = nodeTest(['apps/tracy-web/test/brief-wp-residue.test.mjs'])
c.tapClean('S1', s1, { noSkip: false })
c.eq('S2: # pass equals # tests', s1.counts.pass, s1.counts.tests)
c.check('S2: # tests is at least 28', s1.counts.tests >= 28, s1.counts.tests)
c.passes('S2', s1, "a language the site's page list does not show is still swept")
c.passes('S2', s1, 'the pages of the languages asked for are found in the release inventory')

// S3: the case's probe, verbatim.
const probe = String.raw`import('./apps/tracy-web/src/sites/brief-engines/wp-residue.js').then(async (m) => { const inv = JSON.parse(require('node:fs').readFileSync('packages/cms/tracy-wordpress-quickstart/contracts/tracy-business/wp7/1.3.2/inventory.json', 'utf8')); for (const l of ['vi', 'ru']) { const r = m.editionPageIds(inv, [l]); console.log(l, r.length, r.filter((x) => x.base === null).length) } })`
const s3 = run(process.execPath, ['-e', probe])
c.eq('S3: exit code', s3.status, 0)
c.eq('S3: prints', s3.stdout.trim(), 'vi 17 0\nru 17 0')
if (s3.status !== 0) process.stdout.write(s3.stderr.slice(-1500))
c.done()
