// The picture reading page (#341): an invented run folder (Fernhill Clay Studio, pictures drawn by code, an invented
// manifest) goes through the script, and the page is checked for every planned frame once with its source label, the
// request, the cut box, the icon grounds, the summary, escaping, and files that are missing. No model is called.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import sharp from 'sharp'
import { main } from '../scripts/site-pictures-reading-page.mjs'
import { buildModel, LABEL_ORDER } from '../src/site-pictures/reading-page/model.js'

const SHA = (c) => c.repeat(64)
const png = (width, height, background) =>
  sharp({ create: { width, height, channels: 3, background } })
    .png()
    .toBuffer()
const file = (name, width, height) => ({
  file: `files/${name}.png`,
  width,
  height,
  sha256: SHA('a'),
  sitePath: `images/tracy-content/${name}.png`
})
const flags = { darkened: false, recolourable: false, seen: null, enlarge: null, sharpness: null, crop: null }

const plan = {
  sharedBlocks: [{ id: 'block-1', pictures: [{ frame: 'logo', kind: 'icon', shows: 'The studio mark' }] }],
  pages: [
    {
      id: 'home',
      decision: 'keep',
      blocks: [
        {
          id: 'block-2',
          pictures: [
            {
              frame: 'hero',
              kind: 'any-real',
              shows: 'A potter at the wheel <b>raw</b>',
              mustInclude: ['hands', 'clay'],
              avoid: ['faces'],
              mood: 'warm',
              size: { width: 400, height: 200 },
              match: 'same offering'
            },
            { frame: 'team-1', kind: 'person', shows: 'Mara' }
          ],
          lists: [{ items: [{ pictures: [{ frame: 'gallery-1', shows: 'A glazed bowl' }] }] }]
        },
        {
          id: 'block-3',
          pictures: [
            { frame: 'banner', shows: 'A drawn kiln' },
            { frame: 'badge', shows: 'A badge' }
          ]
        }
      ]
    },
    {
      id: 'about',
      decision: 'keep',
      blocks: [
        {
          id: 'block-4',
          pictures: [
            { frame: 'about-pic', sameAs: 'hero' },
            { frame: 'cutout-1', shows: 'Mara cut out' },
            { frame: 'wall', shows: 'Wall' },
            { frame: 'unlisted', shows: 'No entry anywhere' }
          ]
        }
      ]
    },
    { id: 'old', decision: 'hide', blocks: [{ id: 'block-9', pictures: [{ frame: 'ghost' }] }] }
  ]
}
const manifest = {
  version: 'site-pictures/1',
  fingerprint: { kit: 'demo-clay/j6/1.0.0' },
  frames: [
    {
      frame: 'logo',
      source: 'icon',
      ...file('logo-light', 64, 64),
      dark: file('logo-dark', 64, 64),
      icon: { light: 'flame', dark: 'flame' },
      ...flags,
      reason: 'library icon'
    },
    {
      frame: 'hero',
      source: 'owner-photo',
      asset: 'photo-1',
      ...file('hero', 400, 200),
      ...flags,
      crop: { x: 100, y: 50, width: 400, height: 200 },
      enlarge: 1.2,
      darkened: true,
      seen: 'A potter shapes a bowl',
      reason: 'chosen'
    },
    { frame: 'team-1', source: 'initials', ...file('mara', 150, 150), ...flags, reason: 'initials MQ' },
    {
      frame: 'gallery-1',
      source: 'owner-photo-extended',
      asset: 'photo-2',
      ...file('gallery', 300, 200),
      ...flags,
      reason: 'extended'
    },
    { frame: 'banner', source: 'drawn', ...file('banner-gone', 320, 200), ...flags, reason: 'drawn' },
    { frame: 'badge', source: 'hide', file: null, ...flags, reason: 'no fitting photo' },
    {
      frame: 'about-pic',
      source: 'twin',
      twinOf: 'hero',
      ...file('hero', 400, 200),
      ...flags,
      reason: 'follows hero'
    },
    {
      frame: 'logo-dark',
      source: 'twin',
      twinOf: 'logo',
      ...file('logo-dark', 64, 64),
      ...flags,
      reason: 'follows logo'
    }
  ],
  siteSettings: [],
  returns: [{ frame: 'wall', reason: 'cannot hide and no photo fits' }],
  pending: [{ frame: 'cutout-1', waitsFor: 'cut-out', reason: 'a cut-out waits for the cut-out step' }],
  altNotes: [{ frame: 'hero', alt: 'A potter at work', seen: 'A potter shapes a bowl' }],
  cost: { code: 0, picker: 0.0123 },
  timing: { code: 800, picker: 4200 }
}
const brief = {
  assets: [
    { id: 'photo-1', kind: 'image', sha256: SHA('b') },
    { id: 'photo-2', kind: 'image', sha256: SHA('c') }
  ]
}

async function setup() {
  const root = await mkdtemp(path.join(tmpdir(), 'pictures-page-'))
  const run = path.join(root, 'run')
  await mkdir(path.join(run, 'files'), { recursive: true })
  await mkdir(path.join(root, 'photos'))
  await mkdir(path.join(root, 'kit'))
  await writeFile(path.join(run, 'plan.json'), JSON.stringify(plan))
  await writeFile(path.join(run, 'site-pictures.json'), JSON.stringify(manifest))
  await writeFile(path.join(run, 'brief.json'), JSON.stringify(brief))
  for (const [name, w, h, c] of [
    ['logo-light', 64, 64, '#222'],
    ['logo-dark', 64, 64, '#eee'],
    ['hero', 400, 200, '#8a5a44'],
    ['mara', 150, 150, '#b75436'],
    ['gallery', 300, 200, '#c9b79c']
  ])
    await writeFile(path.join(run, 'files', `${name}.png`), await png(w, h, c))
  await writeFile(path.join(root, 'photos', `${SHA('b')}.png`), await png(800, 600, '#6b4f3a'))
  await mkdir(path.join(root, 'webroot', 'images', 'demo'), { recursive: true })
  await sharp({ create: { width: 400, height: 200, channels: 3, background: '#777' } })
    .jpeg()
    .toFile(path.join(root, 'webroot', 'images', 'demo', 'hero.jpg'))
  await writeFile(
    path.join(root, 'template-kit.json'),
    JSON.stringify({
      blocks: [
        {
          id: 'block-2',
          frames: [
            {
              id: 'hero',
              picture: 'images/demo/hero.jpg#joomlaImage://local-images/demo/hero.jpg?width=400&height=200',
              width: 300,
              height: 150
            }
          ]
        }
      ]
    })
  )
  await writeFile(path.join(root, 'kit', 'block-2-hero-demo.png'), await png(400, 200, '#999'))
  return { root, run, out: path.join(root, 'reading.html') }
}

const run = async (args) => {
  const lines = { out: [], err: [] }
  const code = await main(args, { out: (l) => lines.out.push(l), err: (l) => lines.err.push(l) })
  return { code, ...lines }
}
const articleOf = (html, frame) => {
  const m = new RegExp(`<article class="frame[^"]*" id="g-${frame}">[\\s\\S]*?</article>`).exec(html)
  assert.ok(m, `frame ${frame} has a card`)
  return m[0]
}

test('every planned frame appears once with its source label, and hidden pages are left out', async () => {
  const s = await setup()
  try {
    const r = await run([
      '--run',
      s.run,
      '--out',
      s.out,
      '--photos',
      path.join(s.root, 'photos'),
      '--kit',
      path.join(s.root, 'template-kit.json'),
      '--webroot',
      path.join(s.root, 'webroot')
    ])
    assert.equal(r.code, 0, r.err.join('\n'))
    const html = await readFile(s.out, 'utf8')
    const expected = {
      logo: 'icon',
      hero: 'owner photo',
      'team-1': 'initials',
      'gallery-1': 'extended photo',
      banner: 'drawn',
      badge: 'hidden',
      'about-pic': 'twin of hero',
      'cutout-1': 'pending, waits for cut-out',
      wall: 'returned',
      unlisted: 'no entry',
      'logo-dark': 'twin of logo'
    }
    for (const [frame, label] of Object.entries(expected)) {
      assert.equal(html.split(`id="g-${frame}"`).length, 2, `${frame} appears once`)
      assert.match(
        articleOf(html, frame),
        new RegExp(`<span class="chip src(?: warn)?">${label}</span>`),
        frame
      )
    }
    assert.ok(!html.includes('g-ghost'), 'a hidden page is not listed')
    assert.match(html, /Frames outside the plan wishes/)
  } finally {
    await rm(s.root, { recursive: true, force: true })
  }
})

test('the request, flags, cut box, icon grounds, looker blanks, summary and costs are shown', async () => {
  const s = await setup()
  try {
    await run([
      '--run',
      s.run,
      '--out',
      s.out,
      '--photos',
      path.join(s.root, 'photos'),
      '--kit',
      path.join(s.root, 'template-kit.json'),
      '--webroot',
      path.join(s.root, 'webroot')
    ])
    const html = await readFile(s.out, 'utf8')
    const hero = articleOf(html, 'hero')
    for (const text of [
      'hands, clay',
      'faces',
      'warm',
      '400 x 200',
      'same offering',
      'enlarged x1.2',
      'darkened',
      'A potter shapes a bowl'
    ])
      assert.ok(hero.includes(text), text)
    assert.match(hero, /&lt;b&gt;raw&lt;\/b&gt;/, 'plan text is escaped')
    assert.ok(!hero.includes('<b>raw</b>'))
    assert.match(
      hero,
      /class="cut" style="left:12\.5%;top:8\.33\d*%;width:50%;height:33\.33\d*%"/,
      'cut box on the 800 x 600 original'
    )
    assert.match(hero, /src="webroot\/images\/demo\/hero\.jpg"/, 'the demo is webroot + frame.picture')
    assert.match(
      hero,
      /class="frame-img" style="width:300px"/,
      'the finished picture is drawn at the kit frame width'
    )
    assert.match(hero, /src="run\/files\/hero\.png"/)
    assert.match(articleOf(html, 'team-1'), /not looked at yet/)
    const logo = articleOf(html, 'logo')
    assert.equal(logo.match(/class="ground light"/g).length, 2)
    assert.equal(logo.match(/class="ground dark"/g).length, 2)
    assert.match(html, /<b>1<\/b>twin|<b>2<\/b>twin/)
    assert.match(html, /\$0\.0123/)
    assert.match(html, /4\.2 s/)
    assert.match(html, /A potter at work/)
    assert.match(html, /cannot hide and no photo fits/)
    assert.ok(!html.includes('data:image'), 'no picture is embedded')
    assert.ok(!/[–—]/.test(html), 'no long dashes in the page')
  } finally {
    await rm(s.root, { recursive: true, force: true })
  }
})

test('missing files are shown as missing, not a crash, and a folder without photos or kit images still builds', async () => {
  const s = await setup()
  try {
    const r = await run(['--run', s.run, '--out', s.out])
    assert.equal(r.code, 0, r.err.join('\n'))
    assert.match(r.out[0], /3 files missing/)
    const html = await readFile(s.out, 'utf8')
    assert.match(articleOf(html, 'banner'), /File missing: files\/banner-gone\.png/)
    assert.match(articleOf(html, 'hero'), /Original missing: photo-1/)
    assert.match(articleOf(html, 'hero'), /No kit demo image found/)
    assert.match(articleOf(html, 'unlisted'), /No entry for this frame in the manifest/)
    assert.match(articleOf(html, 'badge'), /Hidden: no fitting photo/)
  } finally {
    await rm(s.root, { recursive: true, force: true })
  }
})

test('the kit images folder is only a fallback, and a picture outside the webroot is not read', async () => {
  const s = await setup()
  try {
    await run(['--run', s.run, '--out', s.out, '--kit-images', path.join(s.root, 'kit')])
    const html = await readFile(s.out, 'utf8')
    assert.match(articleOf(html, 'hero'), /src="kit\/block-2-hero-demo\.png"/)
    await writeFile(
      path.join(s.root, 'template-kit.json'),
      JSON.stringify({ blocks: [{ id: 'b', frames: [{ id: 'hero', picture: '../photos/x.png' }] }] })
    )
    await run([
      '--run',
      s.run,
      '--out',
      s.out,
      '--kit',
      path.join(s.root, 'template-kit.json'),
      '--webroot',
      path.join(s.root, 'webroot')
    ])
    assert.match(articleOf(await readFile(s.out, 'utf8'), 'hero'), /No kit demo image found/)
  } finally {
    await rm(s.root, { recursive: true, force: true })
  }
})

test('the model counts every frame once by label; usage errors and a bad run folder exit non-zero', async () => {
  const m = buildModel({ plan, brief, manifest })
  assert.equal(m.total, 11)
  assert.equal(
    Object.values(m.counts).reduce((a, b) => a + b, 0),
    11
  )
  assert.deepEqual(Object.keys(m.counts), [...LABEL_ORDER])
  assert.equal(m.counts.twin, 2)
  assert.equal((await run([])).code, 2)
  const bad = await run([
    '--run',
    path.join(tmpdir(), 'no-such-run-folder'),
    '--out',
    path.join(tmpdir(), 'x.html')
  ])
  assert.equal(bad.code, 1)
  assert.match(bad.err[0], /cannot open the run folder/)
})
