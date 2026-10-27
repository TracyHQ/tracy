/**
 * REG-PR-926-where-contact-form-switch: each Tracy Business where-map names how the contact form
 * goes off and comes back exactly. Runs S2 (content-where.test.mjs) and S3 (the forms "off" entry
 * of each map's release the case was written on, through describeWhere as the case prints it).
 *
 * S3 versions are pinned (EmDash 1.6.0, j6 1.2.0, wp7 1.3.2), not the newest of each map: the maps
 * gained EmDash 1.7.0-1.7.2 (PRs #1022, #1040, #1050) and j6 1.2.1 (PR #1040) after the case was
 * written, which moved `versions.at(-1)`. S2 checks the entry on every version.
 *
 * S2 count: the case was written (227c45cca) when the file held 10 tests; 34197e035 of the same PR
 * added an 11th (the WordPress search-title entry, REG-PR-926-wp-seo-title-own-meta). So the ten
 * tests the case counted are required by name, and none may fail or skip.
 */
import { checks, nodeTest, run } from './lib.mjs'

const c = checks()
const s2 = nodeTest(['apps/tracy-web/test/content-where.test.mjs'])
c.tapClean('S2', s2)
for (const name of [
  'where-maps: there is one per Tracy Business release the v6 stand runs',
  'where-maps: each version is a release this repository holds',
  'where-maps: every entry is complete, and every proof holds on the released bytes',
  'where-maps: an entry proven on one release’s profile is proven on each release it is said for',
  'where-maps: every place an entry names exists in each release it is said for',
  'where-maps: every door is callable on that site, with only the arguments it takes',
  'where-maps: every release says how its contact form goes off for a while and comes back exactly',
  'describe: the where block is served per release, toolsets from the doors, and validates',
  'describe: a release no map was read off gets no where block',
  'toolsetOfDoor: read off the Apply door’s own rules'
])
  c.passes('S2', s2, name, 1)

// S3, printing the whole call as JSON instead of its first 160 characters.
const s3 = run(process.execPath, [
  '--input-type=module',
  '-e',
  "import {describeWhere, readWhereMaps} from './apps/tracy-web/src/sites/content-where.js'; import {toolsetOfDoor} from './apps/tracy-web/src/sites/route.js'; const PIN = {emdash: '1.6.0', joomla: '1.2.0', wordpress: '1.3.2'}; for (const m of readWhereMaps()) { const v = PIN[m.platform]; const tag = m.platform === 'emdash' ? m.quickstart + '/emdash-0.x' : m.quickstart; const w = describeWhere({platform: m.platform, quickstart_tag: tag, quickstart_version: v}, {profile: null, toolsetOfDoor}); const s = w.topics.forms.find((e) => / off/.test(e.what)); console.log(JSON.stringify({platform: m.platform, version: v, inMap: m.versions.includes(v), toolset: s.toolset, call: s.door.call})) }"
])
c.eq('S3 exit code', s3.status, 0)
const lines = s3.stdout
  .split('\n')
  .filter((l) => l !== '')
  .map((l) => JSON.parse(l))
c.eq('S3 lines', lines.map((l) => l.platform).join(','), 'emdash,joomla,wordpress')
const of = (p) => lines.find((l) => l.platform === p) ?? { call: {} }

const em = of('emdash')
c.eq('S3 emdash version', em.version, '1.6.0')
c.eq('S3 emdash 1.6.0 is still in its map', em.inMap, true)
c.eq('S3 emdash toolset', em.toolset, 'content')
c.eq('S3 emdash tool', em.call.tool, 'content_update')
c.eq('S3 emdash data', JSON.stringify(em.call.arguments?.data), '{"form_id":""}')

const jo = of('joomla')
c.eq('S3 joomla version', jo.version, '1.2.0')
c.eq('S3 joomla 1.2.0 is still in its map', jo.inMap, true)
c.eq('S3 joomla toolset', jo.toolset, 'site')
c.eq('S3 joomla action', jo.call.action, 'content.update')
c.eq('S3 joomla kind', jo.call.params?.kind, 'extensionParams')
c.eq('S3 joomla id', jo.call.params?.id, 8)
c.eq('S3 joomla fields', JSON.stringify(jo.call.params?.fields), '{"params":{"patch":{"show_email_form":0}}}')

const wp = of('wordpress')
c.eq('S3 wordpress version', wp.version, '1.3.2')
c.eq('S3 wordpress 1.3.2 is still in its map', wp.inMap, true)
c.eq('S3 wordpress toolset', wp.toolset, 'content')
c.eq('S3 wordpress action', wp.call.action, 'content.update')
c.eq('S3 wordpress kind', wp.call.params?.kind, 'post')
c.eq('S3 wordpress id', wp.call.params?.id, 39)
const blocks = Object.values(wp.call.params?.blocks ?? {})
c.eq('S3 wordpress blocks', blocks.length, 1)
c.check(
  'S3 wordpress find names the [contact-form-7 …] shortcode',
  String(blocks[0]?.find).startsWith('<the [contact-form-7 '),
  blocks[0]?.find
)
c.eq('S3 wordpress replace', blocks[0]?.replace, '')
c.done()
