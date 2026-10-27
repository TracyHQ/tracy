/**
 * REG-PR-893-joomla-unreadable-batch-and-icon-markup: a batch the model never answers readably
 * keeps its slots pending while the others are written, and icon markup never reaches the model.
 * S1/S2: the Joomla contract planner suite exits 0 with # fail 0, # pass equal to # tests (at least
 * 18), and both named cases 'ok'. S3: every SVG icon text slot of ja-vega/j6/1.0.3 is markup with
 * no words — the probe prints exactly '11 11'.
 */
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()

const s1 = nodeTest(['packages/cms/tracy-seeder/test/plan-joomla-contract.test.mjs'])
c.tapClean('S1', s1, { noSkip: false })
c.eq('S2: # pass equals # tests', s1.counts.pass, s1.counts.tests)
c.check('S2: # tests is at least 18', s1.counts.tests >= 18, s1.counts.tests)
c.passes('S2', s1, '🔒 a batch the model never answers readably')
c.passes('S2', s1, 'markup with no words in it never reaches the model')

// S3: the case's probe, verbatim.
const probe = String.raw`import { isMarkupOnly } from './packages/cms/tracy-seeder/src/plan-joomla-contract.mjs'; import { readFileSync } from 'node:fs'; const m = JSON.parse(readFileSync('packages/cms/tracy-joomla-quickstart/contracts/ja-vega/j6/1.0.3/content-map.json','utf8')); const svg = m.slots.filter(s => /\(\(\s*svg/i.test(String(s.sample||''))); console.log(svg.length, svg.filter(s => isMarkupOnly(s.sample)).length)`
const s3 = run(process.execPath, ['--input-type=module', '-e', probe])
c.eq('S3: exit code', s3.status, 0)
c.eq('S3: prints', s3.stdout.trim(), '11 11')
if (s3.status !== 0) process.stdout.write(s3.stderr.slice(-1500))
c.done()
