/**
 * The two appliers against a fake lane: which commands run, in what order, with what; a rerun
 * updates in place; a narrowed `--pages` leaves the rest alone.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'

import { applyJoomla } from '../src/apply-joomla.mjs'
import { applyWordPress, postContent, postDate, wanted } from '../src/apply-wordpress.mjs'
import { parseArgs } from '../src/cli.mjs'
import { imagesOf, keysFromCredentials, providerOf } from '../src/model.mjs'

const PLAN = {
  schemaVersion: 'tracy-seed-plan/v1',
  system: 'brutalism',
  cms: 'wordpress',
  style: { inspiration: 'brutalism' },
  contact: { email: 'hello@studio.test', name: 'Claude Studio' },
  menu: [
    { slug: 'home', label: 'Home', url: '/' },
    { slug: 'design', label: 'Design', url: '/design/' },
    { slug: 'blog', label: 'Blog', url: '/blog/' }
  ],
  pages: [
    {
      slug: 'home',
      title: 'Claude Studio',
      kind: 'artifact',
      artifact: 'landing',
      body: '<div class="tracy-artifact">home</div>'
    },
    { slug: 'design', title: 'Design', kind: 'fixture', body: '<div class="tracy-fixture">design</div>' }
  ],
  posts: [
    { title: 'First', slug: 'first', excerpt: 'One.', paragraphs: ['a', 'b', 'c'], imagePrompt: 'a desk' },
    { title: 'Second', slug: 'second', excerpt: 'Two.', paragraphs: ['d', 'e', 'f'], imagePrompt: '' }
  ]
}

/** A lane that remembers every command and answers like wp would. */
function fakeLane(existing = {}) {
  const calls = []
  let nextId = 100
  const run = async (cmd, args, stdin) => {
    calls.push({ cmd, args, stdin })
    const a = args.join(' ')
    if (cmd === 'wp' && args[0] === 'post' && args[1] === 'list') {
      const slug = args.find((x) => x.startsWith('--name='))?.slice(7)
      return { code: 0, stdout: existing[slug] ? `${existing[slug]}\n` : '', stderr: '' }
    }
    if (cmd === 'wp' && args[0] === 'post' && args[1] === 'create')
      return { code: 0, stdout: `${nextId++}\n`, stderr: '' }
    if (cmd === 'wp' && args[0] === 'term' && args[1] === 'list')
      return { code: 0, stdout: '7\n', stderr: '' }
    if (cmd === 'wp' && args[0] === 'media') return { code: 0, stdout: '55\n', stderr: '' }
    if (cmd === 'php')
      return {
        code: 0,
        stdout: `${JSON.stringify({ pages: { home: 1 }, posts: {}, menu: {}, warnings: [], echo: JSON.parse(stdin).pages_wanted })}\n`,
        stderr: ''
      }
    if (a.includes('--fail')) return { code: 1, stdout: '', stderr: 'boom\nmore' }
    return { code: 0, stdout: '', stderr: '' }
  }
  return { run, calls }
}

test('wanted: all, a slug, posts as blog', () => {
  assert.equal(wanted(['all'], 'design'), true)
  assert.equal(wanted(['design'], 'home'), false)
  assert.equal(wanted(['blog'], 'posts'), true)
  assert.equal(wanted([], 'x'), true)
})

test('postContent escapes and wraps; postDate walks back a day at a time', () => {
  assert.match(postContent(['a <b>']), /<p>a &lt;b&gt;<\/p>/)
  const now = Date.UTC(2026, 8, 7, 10, 0, 0)
  assert.equal(postDate(0, now), '2026-09-07 10:00:00')
  assert.equal(postDate(2, now), '2026-09-05 10:00:00')
})

test('wordpress: pages created with template and artifact meta, front page set, posts with covers, navigation with page ids', async () => {
  const lane = fakeLane()
  const images = new Map([['first', { mime: 'image/png', bytes: Buffer.from('png') }]])
  const r = await applyWordPress({
    plan: PLAN,
    run: lane.run,
    images,
    now: Date.UTC(2026, 8, 7),
    tmp: mkdtempSync(path.join(tmpdir(), 'seed-test-'))
  })
  assert.deepEqual(r.pages, { home: 100, design: 101, blog: 102 })
  assert.deepEqual(r.posts, { first: 103, second: 104 })
  assert.equal(r.navigation, 105)
  const wp = lane.calls.filter((c) => c.cmd === 'wp').map((c) => c.args)
  assert.ok(wp.every((a) => a.includes('--path=.webroot') && a.includes('--allow-root')))
  const create = wp.find((a) => a[1] === 'create' && a.includes('--post_name=home'))
  assert.ok(create.includes('--post_type=page'))
  const homeStdin = lane.calls.find((c) => c.args.includes('--post_name=home')).stdin
  assert.ok(homeStdin.includes('tracy-artifact'))
  assert.match(homeStdin, /^<!-- wp:html -->\n[\s\S]*\n<!-- \/wp:html -->$/)
  assert.ok(wp.some((a) => a.join(' ').startsWith('post meta update 100 _wp_page_template artifact')))
  assert.ok(wp.some((a) => a.join(' ').startsWith('post meta update 100 tracy_artifact landing')))
  assert.ok(wp.some((a) => a.join(' ').startsWith('post meta update 101 _wp_page_template fixture')))
  assert.ok(wp.some((a) => a.join(' ') === 'option update page_on_front 100 --path=.webroot --allow-root'))
  assert.ok(wp.some((a) => a.join(' ') === 'option update page_for_posts 102 --path=.webroot --allow-root'))
  // The contact form's mail goes where the customer said, not to the lane's admin address.
  assert.ok(
    wp.some(
      (a) => a.join(' ') === 'option update tracy_contact_to hello@studio.test --path=.webroot --allow-root'
    )
  )
  const post = wp.find((a) => a[1] === 'create' && a.includes('--post_name=first'))
  assert.ok(post.includes('--post_category=7'))
  assert.ok(post.includes('--post_excerpt=One.'))
  assert.ok(post.some((x) => x.startsWith('--post_date=2026-09-07')))
  assert.ok(
    wp.some(
      (a) =>
        a[0] === 'media' && a[1] === 'import' && a.includes('--post_id=103') && a.includes('--featured_image')
    )
  )
  assert.ok(wp.some((a) => a.join(' ').startsWith('post meta update 103 tracy_image_prompt a desk')))
  const nav = lane.calls.find((c) => c.args[1] === 'create' && c.args.includes('--post_type=wp_navigation'))
  assert.match(nav.stdin, /wp:home-link/)
  assert.match(nav.stdin, /"label":"Design","type":"page","id":101/)
  assert.match(nav.stdin, /"id":102,"url":"\/blog\/"/)
})

test('wordpress: a second run updates by slug; --pages design touches only design and the menu', async () => {
  const lane = fakeLane({ home: 10, design: 11, blog: 12, main: 13, first: 14 })
  const r = await applyWordPress({ plan: PLAN, run: lane.run, pages: ['design'] })
  assert.deepEqual(r.pages, { home: 10, design: 11, blog: 12 })
  assert.deepEqual(r.posts, {})
  const wp = lane.calls.filter((c) => c.cmd === 'wp').map((c) => c.args.join(' '))
  assert.ok(wp.some((a) => a.startsWith('post update 11 - --post_title=Design')))
  assert.ok(!wp.some((a) => a.startsWith('post update 10 ')))
  assert.ok(!wp.some((a) => a.startsWith('post create')))
  assert.equal(r.navigation, null)
})

test('wordpress: a failing wp stops with its first stderr line', async () => {
  const run = async () => ({ code: 1, stdout: '', stderr: 'Error: theme missing\nstack' })
  await assert.rejects(applyWordPress({ plan: PLAN, run }), /wp post list: Error: theme missing/)
})

test('joomla: the plan goes to seed-joomla.php on stdin with the pages wanted and the covers as data URIs', async () => {
  const lane = fakeLane()
  const images = new Map([['first', { mime: 'image/png', bytes: Buffer.from('png') }]])
  const r = await applyJoomla({
    plan: PLAN,
    run: lane.run,
    pages: ['all'],
    images,
    script: '/opt/seed-joomla.php',
    author: 'Claude Studio'
  })
  assert.deepEqual(r.echo, ['all'])
  const call = lane.calls[0]
  assert.equal(call.cmd, 'php')
  assert.deepEqual(call.args, ['/opt/seed-joomla.php', '.webroot'])
  const sent = JSON.parse(call.stdin)
  assert.equal(sent.author, 'Claude Studio')
  assert.equal(sent.images.first, `data:image/png;base64,${Buffer.from('png').toString('base64')}`)
  assert.equal(sent.pages.length, 2)
})

test("joomla: a non-zero exit surfaces the script's first stderr line", async () => {
  const run = async () => ({ code: 1, stdout: '', stderr: 'seed-joomla: article home: bad\nmore' })
  await assert.rejects(applyJoomla({ plan: PLAN, run }), /seed-joomla: article home: bad/)
})

test('model door: OpenRouter first (draws), then DeepSeek (text), else none; images come out of data URIs', () => {
  assert.equal(providerOf({ OPENROUTER_API_KEY: 'k' }).imageModel, 'google/gemini-3.1-flash-lite-image')
  assert.equal(providerOf({ DEEPSEEK_API_KEY: 'k' }).imageModel, null)
  assert.equal(providerOf({}), null)
  // `deepseek-chat` is a retired name: DeepSeek's price list no longer carries it, and asked on
  // 23/09/2026 the API answered `"model": "deepseek-flash"`. Name the model that is billed.
  assert.equal(providerOf({ DEEPSEEK_API_KEY: 'k' }).textModel, 'deepseek-flash')
  assert.equal(
    providerOf({ DEEPSEEK_API_KEY: 'k', TRACY_SEED_TEXT_MODEL: 'deepseek-v4-pro' }).textModel,
    'deepseek-v4-pro'
  )
  // /ops assigns the seed's text to a provider (`TRACY_SEED_TEXT_PROVIDER`, pushed with the keys); the
  // order of the environment no longer decides. Measured 23/09/2026 on the dev host: assigned
  // openrouter / openai/gpt-5.4-mini, the seeder wrote with DeepSeek.
  const both = { DEEPSEEK_API_KEY: 'd', OPENROUTER_API_KEY: 'o' }
  assert.equal(providerOf({ ...both, TRACY_SEED_TEXT_PROVIDER: 'deepseek' }).provider, 'deepseek')
  assert.equal(
    providerOf({
      ...both,
      TRACY_SEED_TEXT_PROVIDER: 'openrouter',
      TRACY_SEED_TEXT_MODEL: 'openai/gpt-5.4-mini'
    }).textModel,
    'openai/gpt-5.4-mini'
  )
  // An assignment whose key is not here falls back to the provider that is.
  assert.equal(
    providerOf({ DEEPSEEK_API_KEY: 'd', TRACY_SEED_TEXT_PROVIDER: 'openrouter' }).provider,
    'deepseek'
  )
  const im = imagesOf({
    images: [
      { image_url: { url: `data:image/png;base64,${Buffer.from('x').toString('base64')}` } },
      { image_url: { url: 'https://nope' } }
    ]
  })
  assert.equal(im.length, 1)
  assert.equal(im[0].mime, 'image/png')
})

test('cli args: platform and preview required, pages default to all, flags parsed', () => {
  const o = parseArgs([
    '--platform',
    'wordpress',
    '--preview',
    'p.json',
    '--copy',
    'c.json',
    '--pages',
    'design',
    'posts',
    '--dry'
  ])
  assert.equal(o.platform, 'wordpress')
  assert.deepEqual(o.pages, ['design', 'posts'])
  assert.equal(o.dry, true)
  assert.deepEqual(parseArgs(['--platform', 'joomla', '--preview', 'p']).pages, ['all'])
  assert.throws(() => parseArgs(['--preview', 'p']), /--platform/)
  assert.throws(() => parseArgs(['--platform', 'x', '--preview', 'p', '--bogus']), /unknown argument/)
  assert.equal(parseArgs(['--platform', 'joomla', '--preview', 'p', '--fresh']).fresh, true)
})

test('cli: --pages takes a list separated by spaces or by commas', () => {
  const base = ['--platform', 'joomla', '--preview', 'p.json']
  assert.deepEqual(parseArgs([...base, '--pages', 'contact', 'menu']).pages, ['contact', 'menu'])
  assert.deepEqual(parseArgs([...base, '--pages', 'contact,menu']).pages, ['contact', 'menu'])
  assert.deepEqual(parseArgs([...base, '--pages', 'contact, menu']).pages, ['contact', 'menu'])
})

test('keys in dsh credential store: the refs block, quoted or not; nothing outside it', () => {
  const yaml =
    'version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-deep\n  OPENROUTER_API_KEY: "sk-or-1"\nother:\n  NOT_A_KEY: x\n'
  assert.deepEqual(keysFromCredentials(yaml), { DEEPSEEK_API_KEY: 'sk-deep', OPENROUTER_API_KEY: 'sk-or-1' })
  assert.deepEqual(keysFromCredentials('version: 1\n'), {})
})
