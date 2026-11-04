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
import { drawWhere } from '../src/site-pictures/reading-page/where-images.js'

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
const flags = { darkened: false, seen: null, enlarge: null, sharpness: null, crop: null }

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
      icon: { light: 'flame', dark: 'flame', set: '@phosphor-icons/core@2.1.1', weight: 'regular' },
      ...flags,
      paint: { light: { glyph: 'accent', plate: null }, dark: { glyph: 'on-dark', plate: null } },
      preview: true,
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
    {
      frame: 'team-1',
      source: 'initials',
      letters: 'MQ',
      ...file('mara', 150, 150),
      ...flags,
      paint: { background: 'accent', foreground: 'on-accent' },
      preview: true,
      reason: 'initials MQ'
    },
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
    const team = articleOf(html, 'team-1')
    assert.match(team, /not looked at yet/)
    // A painted frame shows its colour roles and says its file is only a preview.
    assert.match(
      team,
      /<b>Colour:<\/b> accent, letters on-accent <span class="muted">\(decided when written\)/
    )
    assert.match(team, /Preview, neutral colours/)
    assert.doesNotMatch(team, /Finished picture/)
    const logo = articleOf(html, 'logo')
    assert.match(
      logo,
      /<b>Colour:<\/b> accent, other theme on-dark <span class="muted">\(decided when written\)/
    )
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

// A tiny kit with page and block shots drawn by code: a grey page with a blue demo picture where the hero box is.
const box = (left, top, width, height) => ({ left, top, width, height })
const ev = (b, measuredIn = null) => ({ kindEvidence: { measuredIn, box: b } })
const shotKit = {
  pages: [
    { id: 'p-home', path: '/', blocks: { 1440: ['block-2'] }, images: { 1440: 'p-home-1440' } },
    {
      id: 'p-about',
      path: '/about',
      blocks: { 1440: ['block-2', 'block-4'] },
      images: { 1440: 'p-about-1440' }
    },
    { id: 'p-copy', path: '/copy', blocks: { 1440: ['block-3', 'block-5'] }, images: { 1440: 'p-home-1440' } }
  ],
  blocks: [
    {
      id: 'block-2',
      frames: [
        { id: 'hero', kind: 'photo', ...ev(box(100, 300, 400, 200)) },
        { id: 'team-1', kind: 'photo', ...ev(box(100, 300, 400, 200), 'main-body') }
      ]
    },
    {
      id: 'block-3',
      images: { 1440: 'block-3-1440' },
      frames: [
        {
          id: 'banner',
          kind: 'photo',
          ...ev(box(50, 550, 200, 100)),
          hideEvidence: { measured: { 1440: { blockBefore: box(0, 500, 600, 300) } } }
        },
        { id: 'badge', kind: 'photo', ...ev(box(300, 550, 100, 100)) }
      ]
    },
    { id: 'block-4', frames: [{ id: 'about-pic', kind: 'photo', twinOf: 'hero', ...ev(box(0, 0, 0, 0)) }] },
    { id: 'block-5', frames: [{ id: 'gallery-1', kind: 'photo', ...ev(box(10, 10, 50, 50)) }] }
  ]
}

async function writeShots(dir) {
  await mkdir(dir, { recursive: true })
  const page = (demo) =>
    sharp({ create: { width: 800, height: 1200, channels: 3, background: '#808080' } }).composite([
      { input: { create: { width: 400, height: 200, channels: 3, background: demo } }, left: 100, top: 300 }
    ])
  await page('#0000ff').jpeg().toFile(path.join(dir, 'p-home-1440.jpg'))
  await page('#00ff00').jpeg().toFile(path.join(dir, 'p-about-1440.jpg'))
  await sharp({ create: { width: 600, height: 300, channels: 3, background: '#404040' } })
    .jpeg()
    .toFile(path.join(dir, 'block-3-1440.jpg'))
}

// The colour of one pixel of an image file.
async function pixel(file, x, y) {
  const { data } = await sharp(file)
    .extract({ left: x, top: y, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  return [...data.subarray(0, 3)]
}
const near = (got, want, what) =>
  assert.ok(
    got.every((c, i) => Math.abs(c - want[i]) < 40),
    `${what}: ${got} is not near ${want}`
  )

test('where on the template: the box on the page shot, our picture in it, and frames that cannot be placed', async () => {
  const s = await setup()
  try {
    const kitFile = path.join(s.root, 'shot-kit.json')
    await writeFile(kitFile, JSON.stringify(shotKit))
    await writeShots(path.join(s.root, 'shots'))
    const r = await run([
      '--run',
      s.run,
      '--out',
      s.out,
      '--kit',
      kitFile,
      '--kit-images',
      path.join(s.root, 'shots')
    ])
    assert.equal(r.code, 0, r.err.join('\n'))
    const html = await readFile(s.out, 'utf8')
    const hero = articleOf(html, 'hero')
    assert.match(hero, /Where on the template: <code>\/<\/code>/, 'the first page holding the block')
    assert.match(hero, /href="shots\/p-home-1440\.jpg" data-box="100,300,400,200" data-size="800,1200"/)
    assert.match(hero, /Also on 1 other page: <code>\/about<\/code>/)
    assert.match(hero, /src="reading-where\/hero-before\.jpg"/)
    assert.match(hero, /src="reading-where\/hero-after\.jpg"/)
    // The crop keeps 140 px around the box (0.35 of its 400 px side), cut at the page's left edge: the box sits at
    // 100, 140 in the crop and its centre at 300, 240.
    const where = path.join(s.root, 'reading-where')
    near(
      await pixel(path.join(where, 'hero-before.jpg'), 300, 240),
      [0, 0, 255],
      'the demo is inside the box'
    )
    near(
      await pixel(path.join(where, 'hero-after.jpg'), 300, 240),
      [0x8a, 0x5a, 0x44],
      'our picture fills the box'
    )
    near(
      await pixel(path.join(where, 'hero-before.jpg'), 101, 240),
      [0xff, 0x2b, 0xd6],
      'the box is outlined'
    )
    near(await pixel(path.join(where, 'hero-before.jpg'), 50, 240), [128, 128, 128], 'the page is around it')
    assert.match(articleOf(html, 'about-pic'), /position of its twin hero/)
    assert.match(articleOf(html, 'about-pic'), /data-box="100,300,400,200"/)
    const banner = articleOf(html, 'banner')
    assert.match(banner, /<code>\/copy<\/code> <span class="muted small">\(block shot\)<\/span>/)
    assert.match(
      banner,
      /href="shots\/block-3-1440\.jpg" data-box="50,50,200,100"/,
      'offset by the block box'
    )
    assert.match(banner, /File missing: files\/banner-gone\.png/)
    assert.match(articleOf(html, 'badge'), /Hidden: the frame is taken off the page\./)
    assert.match(articleOf(html, 'team-1'), /Position not measured: the box was measured inside main-body/)
    assert.match(articleOf(html, 'gallery-1'), /Position not measured: the shot of \/copy shows another page/)
    assert.ok(
      !/data-box/.test(articleOf(html, 'gallery-1')),
      'no box is drawn for a frame that cannot be placed'
    )
    assert.ok(
      !/Where on the template/.test(articleOf(html, 'unlisted')),
      'a frame the kit lacks has no strip'
    )
    const plain = path.join(s.root, 'plain.html')
    await run(['--run', s.run, '--out', plain])
    assert.ok(!(await readFile(plain, 'utf8')).includes('Where on the template'), 'no kit, no strip')
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

// A made-up pottery studio: block-2 has its own copy, two team rows with their own copy and one gallery tile with none.
const copyPlan = {
  sharedBlocks: [],
  pages: [
    {
      id: 'home',
      decision: 'keep',
      blocks: [
        {
          block: 'block-2',
          why: 'The first screen says who the studio is.',
          message: 'Hand made pots, taught in small groups.',
          copy: [
            { says: 'the hero heading, the studio claim', slot: 'block-2.1' },
            { says: 'the hero intro', slot: 'block-2.2' },
            { says: 'the hero button', slot: 'block-2.3' }
          ],
          pictures: [{ frame: 'hero', shows: 'A potter at the wheel' }],
          lists: [
            {
              list: 'block-2.team',
              items: [
                {
                  about: 'Mara, the teacher',
                  copy: [{ says: 'name', slot: 'block-2.10' }],
                  pictures: [{ frame: 'team-1' }]
                },
                {
                  about: 'Joss, the glazer',
                  copy: [{ says: 'name', slot: 'block-2.11' }],
                  pictures: [{ frame: 'team-2' }]
                },
                { about: 'a bowl', copy: [], pictures: [{ frame: 'gallery-1' }] }
              ]
            }
          ]
        }
      ]
    }
  ]
}
const longBody = `${'Clay is patient. '.repeat(40)}The end.`
const siteCopy = {
  version: 'site-copy/1',
  slots: [
    { slot: 'block-2.1', owner: 'writer', text: 'Pots made by hand', factIds: [] },
    { slot: 'block-2.2', owner: 'writer', text: ['First line.', longBody], factIds: [] },
    { slot: 'block-2.3', owner: 'plan-label', text: 'Book a <b>class</b>', factIds: [] },
    { slot: 'block-2.10', owner: 'writer', text: 'Mara', factIds: [] },
    { slot: 'block-2.11', owner: 'writer', text: 'Joss', factIds: [] }
  ],
  alts: [{ frame: 'team-2', text: 'Joss at the glaze bench' }],
  seo: [],
  pages: []
}

test('--copy adds a "Copy around this picture" panel with the block role, block text, the card text and the alt', async () => {
  const s = await setup()
  await writeFile(path.join(s.run, 'plan.json'), JSON.stringify(copyPlan))
  const copyFile = path.join(s.root, 'site-copy.json')
  await writeFile(copyFile, JSON.stringify(siteCopy))
  const plain = await run(['--run', s.run, '--out', s.out])
  assert.equal(plain.code, 0)
  assert.ok(!(await readFile(s.out, 'utf8')).includes('Copy around this picture'), 'no panel without --copy')
  const r = await run(['--run', s.run, '--out', s.out, '--copy', copyFile])
  assert.equal(r.code, 0, r.err.join())
  const html = await readFile(s.out, 'utf8')
  const hero = articleOf(html, 'hero')
  assert.match(hero, /Copy around this picture/)
  assert.match(hero, /The first screen says who the studio is\./)
  assert.match(hero, /Pots made by hand/)
  assert.match(hero, /Book a &lt;b&gt;class&lt;\/b&gt;/, 'text is escaped')
  assert.match(hero, /<details/, 'a long body is trimmed with a more control')
  assert.ok(hero.indexOf('Pots made by hand') < hero.indexOf('Book a'), 'plan order')
  const team = articleOf(html, 'team-2')
  assert.match(team, /Joss/)
  assert.ok(!/>Mara</.test(team), 'the other row is not shown')
  assert.match(team, /Joss at the glaze bench/, 'the frame alt')
  assert.match(team, /Pots made by hand/, 'the block text is shown too')
  const tile = articleOf(html, 'gallery-1')
  assert.match(tile, /no text of its own/)
  const bad = await run(['--run', s.run, '--out', s.out, '--copy', path.join(s.root, 'nope.json')])
  assert.equal(bad.code, 1)
})

// A made-up band block: no block copy of its own, its heading and notice in a one-row list, its button label named by
// the link (the shape of a call-to-action band).
const bandPlan = {
  sharedBlocks: [],
  pages: [
    {
      id: 'home',
      decision: 'keep',
      blocks: [
        {
          block: 'block-2',
          why: 'A pause that repeats the booking action.',
          links: [{ link: 'block-2.4', leadsTo: 'page-contact', labelSlot: 'block-2.3' }],
          lists: [
            {
              list: 'block-2.claim',
              items: [
                {
                  about: 'the band heading',
                  copy: [
                    { says: 'short invitation', slot: 'block-2.0' },
                    { says: 'what the studio teaches', slot: 'block-2.1' }
                  ]
                }
              ]
            }
          ],
          pictures: [{ frame: 'hero', shows: 'A kiln at night' }]
        }
      ]
    }
  ]
}

test('a band picture shows its list copy and link label, the template overlay over it and the title background note', async () => {
  const s = await setup()
  try {
    await writeFile(path.join(s.run, 'plan.json'), JSON.stringify(bandPlan))
    const copyFile = path.join(s.root, 'band-copy.json')
    await writeFile(
      copyFile,
      JSON.stringify({
        version: 'site-copy/1',
        slots: [
          { slot: 'block-2.0', owner: 'writer', text: 'Ready to throw a pot?', factIds: [] },
          { slot: 'block-2.1', owner: 'writer', text: 'Wheel, glaze and kiln.', factIds: [] },
          { slot: 'block-2.3', owner: 'writer', text: 'Book your seat', factIds: [] }
        ],
        alts: [],
        seo: [],
        pages: []
      })
    )
    const surfaceFile = path.join(s.root, 'surface.json')
    await writeFile(
      surfaceFile,
      JSON.stringify({
        version: 'frame-surface/1',
        frames: {
          hero: {
            textOver: true,
            textOverFrom: 'derived',
            overlay: { colour: 'rgba(0,0,0,0.8)', strength: 0.8, from: '.acm-band.style-1:before' },
            behindTitle: { layout: 'course', menuPath: '/courses/' }
          }
        }
      })
    )
    const kitFile = path.join(s.root, 'shot-kit.json')
    await writeFile(kitFile, JSON.stringify(shotKit))
    await writeShots(path.join(s.root, 'shots'))
    const r = await run([
      '--run',
      s.run,
      '--out',
      s.out,
      '--kit',
      kitFile,
      '--kit-images',
      path.join(s.root, 'shots'),
      '--copy',
      copyFile,
      '--surface',
      surfaceFile
    ])
    assert.equal(r.code, 0, r.err.join('\n'))
    const hero = articleOf(await readFile(s.out, 'utf8'), 'hero')
    assert.ok(!/gives this block no text/.test(hero), 'the list copy is block text')
    for (const t of ['Ready to throw a pot?', 'Wheel, glaze and kiln.', 'Book your seat'])
      assert.ok(hero.includes(t), `shows ${t}`)
    assert.match(hero, /link label \(leads to page-contact\)/)
    assert.match(hero, /Our picture in the box, template overlay 80% black drawn/)
    assert.match(hero, /Text sits over this picture \(derived/)
    assert.match(hero, /no overlay is baked in for it/)
    assert.match(hero, /Also shown dimmed behind the page title \(course article layout/)
    // Our picture (#8a5a44) under 80% black, at the box centre of the crop.
    near(
      await pixel(path.join(s.root, 'reading-where', 'hero-after.jpg'), 300, 240),
      [28, 18, 14],
      'the template overlay is drawn over our picture'
    )
  } finally {
    await rm(s.root, { recursive: true, force: true })
  }
})

test('where on the template: a transparent picture shows the page colour around the box, not a grey', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'where-ground-'))
  try {
    const page = '#14161a'
    const shotFile = path.join(dir, 'shot.png')
    // A near-black page; the demo picture in the box is light grey, and a light strip crosses the ring on one side.
    await sharp({ create: { width: 600, height: 400, channels: 3, background: page } })
      .composite([
        {
          input: { create: { width: 200, height: 150, channels: 3, background: '#bbbbbb' } },
          left: 200,
          top: 120
        },
        {
          input: { create: { width: 6, height: 400, channels: 3, background: '#eeeeee' } },
          left: 194,
          top: 0
        }
      ])
      .png()
      .toFile(shotFile)
    // A cut-out: a small opaque square on a fully transparent file.
    const pictureFile = path.join(dir, 'cut.png')
    await sharp({
      create: { width: 100, height: 75, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
    })
      .composite([
        {
          input: { create: { width: 10, height: 10, channels: 3, background: '#ff0000' } },
          left: 45,
          top: 30
        }
      ])
      .png()
      .toFile(pictureFile)
    const r = await drawWhere({
      shotFile,
      shotSize: { width: 600, height: 400 },
      box: { left: 200, top: 120, width: 200, height: 150 },
      pictureFile,
      fit: 'contain',
      outDir: dir,
      name: 'x'
    })
    // The box sits at 70, 70 in the crop (margin 70); a point inside it, far from the figure.
    const got = await pixel(r.after.file, 80, 80)
    near(got, [0x14, 0x16, 0x1a], 'the box shows the page colour')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
