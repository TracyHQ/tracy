/**
 * REG-PR-532: JA Restaurant EmDash 1.0.2 prints a post's category label as a link only while that
 * category has a live list page. The fence is what the release is made of: the post view gates the
 * link, the list route answers only the blog categories, the release carries its own contract files and
 * the committed coverage of 1.0.2 holds no dead link.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checks, ROOT } from './lib.mjs'

const THEME = join(ROOT, 'packages/cms/tracy-emdash-theme-restaurant')
const c = checks()
const read = (/** @type {string} */ f) => readFileSync(join(THEME, f), 'utf8')

for (const f of ['package.json', 'template.config.json', 'artifact.json']) {
  c.check(`${f} is 1.0.2`, JSON.parse(read(f)).version === '1.0.2', JSON.parse(read(f)).version)
}
c.check('Dockerfile label is 1.0.2', /io\.tracy\.template\.version="1\.0\.2"/.test(read('Dockerfile')))

const view = read('src/views/Post.astro')
c.check(
  'the category link needs a blog category and a live page',
  /BLOG_SIDEBAR\.includes\(terms\[0\]\.slug\) && termLive/.test(view) &&
    /liveLinks\(Astro\.request/.test(view)
)
c.check(
  'the unlinked label is bare text',
  /termLink \? <a href=[^>]*>\{terms\[0\]\.label\}<\/a> : terms\[0\]\.label/.test(view)
)
c.check(
  'only the blog categories have a list route',
  /segs\.length === 1 && BLOG_SIDEBAR\.includes\(segs\[0\]\)/.test(read('src/pages/[...path].astro'))
)

const posts = JSON.parse(read('seed/seed.json')).content.posts
const chefs = posts.find((/** @type {any} */ p) => p.slug === 'chefs')
c.check('Chefs is a post of the category pages (no list page)', chefs?.taxonomies?.category?.[0] === 'pages')

const file = join(THEME, 'contracts/1.0.2/content-coverage.json')
c.check('the 1.0.2 content coverage is committed', existsSync(file))
if (existsSync(file)) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  c.check(
    'the coverage is of 1.0.2',
    doc.contract?.id === 'tracy-restaurant/emdash-0.x/1.0.2',
    doc.contract?.id
  )
  c.check('no page fails the audit', doc.pages?.failed === 0, JSON.stringify(doc.pages?.failures))
  c.check('the audit was not cut short', doc.pages?.capReached === false)
}
c.done()
