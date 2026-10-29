#!/usr/bin/env node
/**
 * Every PUBLISHED quickstart of one CMS through the slot, one after the other: what a customer who
 * builds a site from it today gets when they press Design system.
 *
 *   node scripts/sweep.mjs --cms wordpress|joomla --out <dir> [--port 52110] [--cdp 9400]
 *        [--only slug,slug] [--systems od:bmw,od:stripe,od:spotify,od:vercel] [--no-bands] [--theme-tree]
 *        [--inner <n> [--inner-systems id,id]]
 *
 * The list is the releases on JoomlArt-Products/joomlart-products (`<x>/wp7`, `quickstart/<x>/wp7`,
 * `<x>/j6`, `quickstart/<x>/j6`). Each goes through pass-wordpress.mjs / pass-joomla.mjs on its
 * NEWEST release with --no-tokenize (the stylesheets as released) and --bands (the kept bands
 * drafted into the contract when it has none), measured under OpenDesign systems — the library a
 * customer picks from. ONE stand at a time, taken down before the next (the Mac is shared). Each
 * result is one line of <out>/sweep.jsonl; a template already measured there is skipped, so a stopped
 * sweep resumes where it stopped (one that ended in an error is measured again). --inner: each pass
 * also measures up to n inner pages of other kinds (inner.mjs), under --inner-systems.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const args = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args.splice(i, 2)[1]
}
const CMS = opt('--cms')
const OUT = opt('--out')
const PORT = opt('--port', '52110')
const CDP = opt('--cdp', '9400')
const ONLY = opt('--only')?.split(',').filter(Boolean) ?? null
const SYSTEMS = opt('--systems', 'od:bmw,od:stripe,od:spotify,od:vercel')
const BANDS = !args.includes('--no-bands')
// --theme-tree (WordPress): each theme as this tree builds it, laid over the release (pass-wordpress.mjs)
const THEME_TREE = CMS === 'wordpress' && args.includes('--theme-tree')
const INNER = opt('--inner')
const INNER_SYSTEMS = opt('--inner-systems')
if (!['wordpress', 'joomla'].includes(CMS) || !OUT) {
  console.error('usage: sweep.mjs --cms wordpress|joomla --out <dir> [--only a,b] [--systems …]')
  process.exit(2)
}
mkdirSync(OUT, { recursive: true })
const LOG = join(OUT, 'sweep.jsonl')
const done = new Set(
  existsSync(LOG)
    ? readFileSync(LOG, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        // a template that failed before (a stand that would not come up) is measured again
        .filter((r) => r.pass)
        .map((r) => r.tag)
    : []
)

const suffix = CMS === 'wordpress' ? 'wp7' : 'j6'
const tags = JSON.parse(
  execFileSync(
    'gh',
    [
      'release',
      'list',
      '-R',
      'JoomlArt-Products/joomlart-products',
      '--limit',
      '1000',
      '--json',
      'tagName,isDraft'
    ],
    { encoding: 'utf8' }
  )
)
  .filter((r) => !r.isDraft && r.tagName.endsWith(`/${suffix}`))
  .map((r) => r.tagName)
  .sort()
// quickstart/<slug>/<cms> or <slug>/<cms>: pass-*.mjs names a release by its slug
const slugOf = (tag) => (tag.startsWith('quickstart/') ? tag.split('/')[1] : tag.split('/')[0])
const list = tags.filter((t) => !ONLY || ONLY.includes(slugOf(t)))
console.log(`${list.length} ${CMS} releases, ${list.filter((t) => done.has(t)).length} already measured`)

for (const tag of list) {
  if (done.has(tag)) continue
  const slug = slugOf(tag)
  const t0 = Date.now()
  const script = CMS === 'wordpress' ? 'pass-wordpress.mjs' : 'pass-joomla.mjs'
  const run = spawnSync(
    process.execPath,
    [
      join(HERE, script),
      slug,
      '--port',
      PORT,
      '--cdp',
      CDP,
      '--evidence',
      OUT,
      '--no-tokenize',
      '--systems',
      SYSTEMS,
      ...(BANDS ? ['--bands'] : []),
      ...(THEME_TREE ? ['--theme-tree'] : []),
      ...(INNER ? ['--inner', INNER] : []),
      ...(INNER_SYSTEMS ? ['--inner-systems', INNER_SYSTEMS] : [])
    ],
    { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 60 * 60_000 }
  )
  const last = (run.stdout ?? '').trim().split('\n').pop() ?? ''
  let result
  try {
    result = JSON.parse(last)
  } catch {
    result = {
      error: `${run.signal ?? `exit ${run.status}`}: ${(run.stderr || run.stdout || '').slice(-800)}`
    }
  }
  const line = { tag, slug, minutes: Math.round((Date.now() - t0) / 6000) / 10, ...result }
  appendFileSync(LOG, `${JSON.stringify(line)}\n`)
  console.log(
    `${tag}: ${result.pass ?? 'ERROR'}${result.inner ? ` · inner ${result.inner.map((i) => `${i.page ?? ''} ${i.pass ?? 'ERROR'}`).join(', ')}` : ''}${result.left ? ` · left ${JSON.stringify(result.left)}` : ''}${result.error ? ` ${result.error.slice(0, 200)}` : ''}`
  )
}
