// The frame surface (ADR 0043 section 3e): an invented kit, an invented quickstart zip (one ACM layout, one stylesheet
// with a ::before overlay, one demo data row, one article layout that copies its picture behind the title) and the
// decisions the picture step takes from it. No model is called and no real template is read.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { strToU8, zipSync } from 'fflate'
import { wantsDark } from '../src/site-pictures/darken.js'
import { acmFieldOf, acmLayoutOf, pictureElementIn } from '../src/site-pictures/frame-surface/acm-markup.js'
import { colourOf, overlayOver, rulesOf } from '../src/site-pictures/frame-surface/css-overlays.js'
import { joinSurface, measureSurface, stampSurface } from '../src/site-pictures/frame-surface/surface.js'
import { quickstartFilesOf, surfaceFor } from '../src/site-pictures/frame-surface/surface-cache.js'
import { textOverOf } from '../src/site-pictures/frame-surface/text-over.js'
import { faultsFor, lookMessage, readLook, surfaceFacts } from '../src/site-pictures/looker-call.js'
import { readPictures } from '../src/site-pictures/manifest-shape.js'

const TPL = 'tpl_fernhill'
const BAND_PHP = `<?php
$bandBg = '';
if ($helper->get('band-bg')) { $bandBg = 'style="background-image: url(' . $helper->get('band-bg') . ')"'; }
?>
<div class="acm-band style-1" <?php echo $bandBg; ?>>
  <div class="container"><h2 class="band-title"><?php echo $helper->get('band-title'); ?></h2></div>
</div>`
const CARDS_PHP = `<div class="acm-cards style-1"><?php for ($i = 0; $i < 3; $i++): ?>
  <div class="card-item"><div class="card-img"><img src="<?php echo $helper->get('data.img', $i) ?>" alt="" /></div>
  <h3><?php echo $helper->get('data.title', $i) ?></h3></div>
<?php endfor; ?></div>`
const CSS = `
.acm-band.style-1 { position: relative; }
.acm-band.style-1:before { content: ""; background: rgba(0, 0, 0, 0.7); position: absolute; top: 0; left: 0; height: 100%; width: 100%; }
.acm-band.style-1:hover:before { background: rgba(0,0,0,.1); }
body.dark .acm-cards .card-img:after { content: ""; background: #000; position: absolute; inset: 0; }
@media (max-width: 600px) { .acm-cards .card-img:before { content: ""; background: #000; position: absolute; inset: 0; } }
.acm-cards .card-img img { filter: brightness(90%); }
`
const ARTICLE_PHP = `<div class="item-image"><img src="x"></div><script>
if ($('.item-image img').length > 0) { var u = $('.item-image img').attr('src'); $('.bg-mask').css('background-image', 'url(' + u + ')'); }
</script>`
const SQL = `INSERT INTO \`#__assets\` VALUES
(31,1,2,3,1,'com_content.article.4','x','{}');
INSERT INTO \`#__modules\` VALUES
,(31,90,'Band','',NULL,1,'section-1',NULL,NULL,NULL,NULL,1,'mod_ja_acm',1,0,'{\\"jatools-config\\":\\"{\\\\\\":type\\\\\\":\\\\\\"${TPL}:band\\\\\\",\\\\\\"band\\\\\\":{\\\\\\"jatools-layout-band\\\\\\":\\\\\\"style-1\\\\\\"}}\\"}',0,'*')
,(32,91,'Cards','',NULL,1,'section-2',NULL,NULL,NULL,NULL,1,'mod_ja_acm',1,0,'{\\"jatools-config\\":\\"{\\\\\\":type\\\\\\":\\\\\\"${TPL}:cards\\\\\\",\\\\\\"cards\\\\\\":{\\\\\\"jatools-layout-cards\\\\\\":\\\\\\"style-1\\\\\\"}}\\"}',0,'*');
INSERT INTO \`#__menu\` VALUES
,(50,'mainmenu','Courses','courses','','courses','index.php?option=com_content&view=category&layout=${TPL}:course&id=9','component',1);
`

const quickstartZip = () =>
  Buffer.from(
    zipSync({
      [`templates/${TPL}/acm/band/tmpl/style-1.php`]: strToU8(BAND_PHP),
      [`templates/${TPL}/acm/cards/tmpl/style-1.php`]: strToU8(CARDS_PHP),
      [`templates/${TPL}/css/template.css`]: strToU8(CSS),
      [`templates/${TPL}/css/rtl/template.css`]: strToU8(
        '.acm-cards .card-img:before{content:"";background:#000;position:absolute;inset:0}'
      ),
      [`templates/${TPL}/html/com_content/article/course.php`]: strToU8(ARTICLE_PHP),
      'installation/sql/mysql/custom.sql': strToU8(SQL),
      'images/big.jpg': strToU8('not read')
    })
  )

const measured = (w, h) => ({ measured: { 1440: { blockBefore: { left: 0, top: 0, width: w, height: h } } } })
const kit = {
  contract: 'fernhill/j6/1.0.0',
  template: { name: TPL },
  pages: [
    { id: 'page-home', path: '/', blocks: { 1440: ['block-31', 'block-32'] } },
    { id: 'page-course', path: '/courses/wheel-basics', blocks: { 1440: ['body-course'] } },
    { id: 'page-blog', path: '/blog/clay', blocks: { 1440: ['body-blog'] } }
  ],
  blocks: [
    {
      id: 'block-31',
      demoOwned: [{ id: 'block-31.0', type: 'text', sample: 'Book a class' }],
      frames: [
        {
          id: 'block-31.1',
          kind: 'photo',
          width: 1440,
          height: 500,
          hideEvidence: measured(1440, 500),
          kindEvidence: {
            overPicture: false,
            paintedBy: null,
            box: { left: 0, top: 0, width: 1440, height: 500 }
          }
        }
      ]
    },
    {
      id: 'block-32',
      lists: [{ id: 'block-32.cards', rowSlots: [{ id: 'block-32.0', type: 'text' }] }],
      frames: [0, 1, 2].map((i) => ({
        id: `block-32.${i + 1}`,
        kind: 'photo',
        width: 400,
        height: 300,
        hideEvidence: measured(1440, 700),
        kindEvidence: { overPicture: false, box: { left: 20 + i * 460, top: 40, width: 400, height: 300 } }
      }))
    },
    {
      id: 'block-33',
      frames: [
        {
          id: 'block-33.0',
          kind: 'photo',
          hideEvidence: measured(1440, 500),
          kindEvidence: { overPicture: false, box: { left: 0, top: 0, width: 1440, height: 500 } }
        }
      ]
    },
    {
      id: 'body-course',
      frames: [
        {
          id: 'article-4.6',
          kind: 'photo',
          kindEvidence: { measuredIn: 'main-body', box: { width: 900, height: 500 } }
        }
      ]
    },
    {
      id: 'body-blog',
      frames: [
        {
          id: 'article-5.6',
          kind: 'photo',
          kindEvidence: { measuredIn: 'main-body', box: { width: 900, height: 500 } }
        }
      ]
    }
  ]
}
const contentMap = {
  slots: [
    {
      key: 'module-31.1',
      entity: 'module-31',
      column: 'params',
      nestedJson: 'jatools-config',
      jsonPath: ['band', 'band[band-bg]', 0]
    },
    ...[1, 2, 3].map((i) => ({
      key: `module-32.${i}`,
      entity: 'module-32',
      column: 'params',
      nestedJson: 'jatools-config',
      jsonPath: ['cards', 'cards[data]', 'cards[data][img]', i - 1]
    })),
    { key: 'article-4.6', entity: 'article-4', column: 'images', jsonPath: ['image_fulltext'] },
    { key: 'article-5.6', entity: 'article-5', column: 'images', jsonPath: ['image_fulltext'] }
  ]
}

function surfaceOfZip() {
  const bytes = quickstartZip()
  const files = quickstartFilesOf(bytes, TPL)
  return {
    files,
    surface: measureSurface({
      kit,
      contentMap,
      kitId: kit.contract,
      quickstart: { file: 'qs.zip', sha256: createHash('sha256').update(bytes).digest('hex'), files }
    })
  }
}

test('a frame that fills its block, which has text, has text over it; a card picture or a block with no text does not', () => {
  const [band, cards, bare] = kit.blocks
  assert.deepEqual(textOverOf(band, band.frames[0]), { textOver: true, textOverFrom: 'derived', share: 1 })
  assert.equal(textOverOf(cards, cards.frames[0]).textOver, false)
  assert.equal(textOverOf(bare, bare.frames[0]).textOver, false, 'no text in the block')
  // The kit's own word is kept when it says yes.
  assert.equal(
    textOverOf(cards, { ...cards.frames[0], kindEvidence: { overPicture: true } }).textOverFrom,
    'kit'
  )
  // A box larger than its block (a page background measured on the viewport) is never derived.
  const big = { ...band.frames[0], kindEvidence: { box: { left: 0, top: 0, width: 1440, height: 960 } } }
  assert.equal(textOverOf(band, big).textOver, false)
})

test('the ACM field, layout and picture element are read from the markup and the demo data', () => {
  assert.equal(acmFieldOf(['cta', 'parallax[cta-bg]', 0]), 'cta-bg')
  assert.equal(acmFieldOf(['teams', 'teams-intro[data]', 'teams-intro[data][img]', 0]), 'data.img')
  assert.deepEqual(
    acmLayoutOf(SQL, '31'),
    { type: 'band', layout: 'style-1' },
    'the assets row of id 31 is skipped'
  )
  assert.equal(acmLayoutOf(SQL, '77'), null)
  const band = pictureElementIn(BAND_PHP, 'band-bg')
  assert.equal(band.shownAs, 'background')
  assert.deepEqual(band.container, { tag: 'div', classes: ['acm-band', 'style-1'] })
  const card = pictureElementIn(CARDS_PHP, 'data.img')
  assert.equal(card.shownAs, 'img')
  assert.deepEqual(card.container.classes, ['card-img'])
  assert.deepEqual(
    card.ancestors.map((a) => a.classes.join('.')),
    ['acm-cards.style-1', 'card-item']
  )
  assert.match(pictureElementIn('<div><?php echo icon($helper->get("x")) ?></div>', 'x').unknown, /helper/)
})

test('a covering ::before with an rgba background is the overlay; states, other pages and narrow queries are not', () => {
  const rules = rulesOf(CSS)
  const band = overlayOver(rules, pictureElementIn(BAND_PHP, 'band-bg'))
  assert.deepEqual(band, { colour: 'rgba(0,0,0,0.7)', strength: 0.7, from: '.acm-band.style-1:before' })
  // body.dark is a condition the module does not print, the max-width query is not the 1440 page: only the filter counts.
  const card = overlayOver(rules, pictureElementIn(CARDS_PHP, 'data.img'))
  assert.deepEqual(card, { colour: 'rgba(0,0,0,1)', strength: 0.1, from: '.acm-cards .card-img img' })
  assert.equal(
    overlayOver(rulesOf('.x:before{content:"";background:#000}'), {
      container: { tag: 'div', classes: ['x'] },
      ancestors: [],
      img: null
    }),
    null,
    'not covering'
  )
  assert.deepEqual(colourOf('var(--ds-veil, rgba(0,0,0,.5))'), { colour: 'rgba(0,0,0,0.5)', alpha: 0.5 })
  assert.equal(colourOf('#00000080').alpha, 0.502)
  const fade = overlayOver(
    rulesOf(
      '.y::after{content:"";position:absolute;inset:0;background:linear-gradient(transparent, rgba(0,0,0,.9))}'
    ),
    { container: { tag: 'div', classes: ['y'] }, ancestors: [], img: null }
  )
  assert.equal(fade, null, 'a fade from transparent counts its clearest stop, 0: no cover')
})

test('the surface: overlay found, none, or unknown; the article picture copied behind the title', () => {
  const { files, surface } = surfaceOfZip()
  assert.ok(
    ![...files.keys()].some((n) => n.includes('/rtl/') || n.startsWith('images/')),
    'only the wanted files are read'
  )
  const f = surface.frames
  assert.deepEqual(f['block-31.1'].overlay, {
    colour: 'rgba(0,0,0,0.7)',
    strength: 0.7,
    from: '.acm-band.style-1:before'
  })
  assert.equal(f['block-31.1'].textOver, true)
  assert.equal(f['block-31.1'].textOverFrom, 'derived')
  assert.equal(f['block-32.1'].overlay.strength, 0.1)
  assert.equal(f['block-33.0'].overlay, 'unknown', 'no content map slot')
  assert.equal(f['article-4.6'].overlay, 'unknown', 'article pictures are not read yet')
  assert.deepEqual(f['article-4.6'].behindTitle, { layout: 'course', menuPath: '/courses/' })
  assert.equal(f['article-5.6'].behindTitle, undefined, 'not under the menu item of that layout')
  // Without a quickstart every overlay is unknown, the text over is still known.
  const alone = measureSurface({ kit, contentMap, kitId: 'k' })
  assert.equal(alone.frames['block-31.1'].overlay, 'unknown')
  assert.equal(alone.frames['block-31.1'].textOver, true)
})

test('an overlay of at least 0.45 is never darkened again; text over a picture with no overlay is', () => {
  const { surface } = surfaceOfZip()
  const doc = joinSurface(kit, surface)
  const frame = (id) => doc.blocks.flatMap((b) => b.frames).find((x) => x.id === id)
  assert.equal(kit.blocks[0].frames[0].textOver, undefined, 'the kit itself is not changed')
  assert.equal(wantsDark(frame('block-31.1')), false, 'the template overlay of 0.7 carries the text')
  const weak = {
    ...frame('block-31.1'),
    templateOverlay: { colour: 'rgba(0,0,0,0.3)', strength: 0.3, from: 'x' }
  }
  assert.equal(wantsDark(weak), true, 'a weak overlay still needs a dark picture')
  assert.equal(wantsDark({ ...frame('block-31.1'), templateOverlay: null }), true)
  assert.equal(wantsDark({ ...frame('block-31.1'), templateOverlay: 'unknown' }), true)
  assert.equal(wantsDark(frame('block-32.1')), false, 'no text over a card picture')

  // The looker: told of the overlay (no brightness judged), or asked whether light text reads (one more fault).
  const covered = surfaceFacts(frame('block-31.1'))
  assert.deepEqual(covered, { textOver: true, overlay: { colour: 'rgba(0,0,0,0.7)', strength: 0.7 } })
  const image = { width: 10, height: 10, base64: '' }
  const said = lookMessage({ words: {}, image, outlined: false, surface: covered })[0].text
  assert.match(said, /own dark overlay \(rgba\(0,0,0,0.7\), 70% strong\)/)
  assert.match(said, /do not judge how bright/)
  assert.ok(!faultsFor({ surface: covered }).includes('text would not read'))
  const bare = surfaceFacts({ ...frame('block-31.1'), templateOverlay: null })
  assert.match(
    lookMessage({ words: {}, image, outlined: false, surface: bare })[0].text,
    /text would not read/
  )
  const answer = '{"verdict":"fail","faults":["text would not read"],"seen":"A white wall."}'
  assert.equal(readLook(answer, { surface: bare }).verdict, 'fail')
  assert.deepEqual(readLook(answer, { surface: covered }).dropped, ['text would not read'])
  assert.equal(surfaceFacts(frame('block-32.1')), null)

  // Every manifest entry carries the surface, and the shape check keeps it.
  const frames = new Map(doc.blocks.flatMap((b) => b.frames).map((x) => [x.id, x]))
  const entry = { frame: 'block-31.1', source: 'hide', file: null, darkened: false, seen: null, reason: 'x' }
  const stamped = stampSurface({ frames: [entry], siteSettings: [] }, frames)
  assert.equal(stamped.frames[0].textOver, true)
  const { view, problems } = readPictures({
    frames: stamped.frames,
    siteSettings: [],
    returns: [],
    altNotes: [],
    usage: []
  })
  assert.ok(!problems.some((p) => p.where.includes('block-31.1')), JSON.stringify(problems))
  assert.equal(view.entries[0].templateOverlay.strength, 0.7)
  const bad = readPictures({
    frames: [{ ...entry, templateOverlay: { strength: 2 } }],
    siteSettings: [],
    returns: [],
    altNotes: [],
    usage: []
  })
  assert.ok(bad.problems.some((p) => /templateOverlay/.test(p.detail)))
  assert.equal(
    readPictures({ frames: [entry], siteSettings: [], returns: [], altNotes: [], usage: [] }).view.entries[0]
      .templateOverlay,
    'unknown',
    'an older manifest reads as unknown'
  )
})

test('the surface is kept per kit and quickstart sha256, and a wrong download is never kept', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'surface-'))
  try {
    const bytes = quickstartZip()
    const sha = createHash('sha256').update(bytes).digest('hex')
    const held = {
      ref: 'fernhill/j6/1.0.0',
      release: 'quickstart/fernhill/j6',
      doc: { ...kit, contentMap },
      installer: { file: 'qs.zip', sha256: sha }
    }
    let calls = 0
    const fetchAsset = async ({ name }) => {
      calls++
      return name === 'qs.zip' ? { ok: true, bytes } : { ok: false, reason: 'no such asset' }
    }
    const first = await surfaceFor({ dir, kit: held, kitId: held.ref, fetchAsset })
    assert.equal(first.note, null)
    assert.equal(first.surface.frames['block-31.1'].overlay.strength, 0.7)
    const again = await surfaceFor({ dir, kit: held, kitId: held.ref, fetchAsset })
    assert.equal(calls, 1, 'read from the cache')
    assert.deepEqual(again.surface, first.surface)
    const kept = JSON.parse(
      await readFile(path.join(dir, 'kit-surface', 'fernhill_j6_1.0.0', `${sha}.json`), 'utf8')
    )
    assert.equal(kept.quickstart.sha256, sha)
    const wrong = await surfaceFor({
      dir,
      kit: { ...held, installer: { file: 'qs.zip', sha256: 'b'.repeat(64) } },
      kitId: held.ref,
      fetchAsset
    })
    assert.match(wrong.note, /does not match/)
    assert.equal(wrong.surface.frames['block-31.1'].overlay, 'unknown')
    const none = await surfaceFor({ dir, kit: { ...held, installer: null }, kitId: held.ref, fetchAsset })
    assert.match(none.note, /names no quickstart installer/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

function sharedSurfaceKit(bytes) {
  return {
    ref: 'fernhill/j6/1.0.0',
    release: 'quickstart/fernhill/j6',
    doc: { ...kit, contentMap },
    installer: { file: 'qs.zip', sha256: createHash('sha256').update(bytes).digest('hex') }
  }
}

const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

test('concurrent cold requests for the exact surface share one fetch and preserve the warm disk cache', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'surface-shared-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const bytes = quickstartZip()
  const held = sharedSurfaceKit(bytes)
  const started = deferred()
  const release = deferred()
  let calls = 0
  const fetchAsset = async () => {
    calls++
    started.resolve()
    await release.promise
    return { ok: true, bytes }
  }
  const a = surfaceFor({ dir, kit: held, kitId: held.ref, fetchAsset })
  const b = surfaceFor({ dir, kit: structuredClone(held), kitId: held.ref, fetchAsset })
  await started.promise
  release.resolve()
  const [first, second] = await Promise.all([a, b])
  assert.equal(calls, 1)
  assert.deepEqual(first, second)
  assert.equal(first.surface.frames['block-31.1'].overlay.strength, 0.7)
  const warm = await surfaceFor({
    dir,
    kit: held,
    kitId: held.ref,
    fetchAsset: async () => assert.fail('the successful surface must remain on disk')
  })
  assert.deepEqual(warm, first)
})

test('a shared failed fetch remains unknown and the next request retries instead of caching the failure', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'surface-retry-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const bytes = quickstartZip()
  const held = sharedSurfaceKit(bytes)
  let calls = 0
  const fetchAsset = async () => {
    calls++
    if (calls === 1) throw new Error('temporary asset timeout')
    return { ok: true, bytes }
  }
  const request = { dir, kit: held, kitId: held.ref, fetchAsset }
  const failed = await Promise.all([surfaceFor(request), surfaceFor(request)])
  assert.equal(calls, 1)
  for (const out of failed) {
    assert.match(out.note, /temporary asset timeout/)
    assert.equal(out.surface.frames['block-31.1'].overlay, 'unknown')
  }
  const cache = path.join(dir, 'kit-surface', 'fernhill_j6_1.0.0', `${held.installer.sha256}.json`)
  await assert.rejects(readFile(cache), { code: 'ENOENT' })
  const retried = await surfaceFor(request)
  assert.equal(calls, 2)
  assert.equal(retried.note, null)
  assert.equal(retried.surface.frames['block-31.1'].overlay.strength, 0.7)
})

test('different destinations, releases and measurement inputs never borrow an in-flight surface', async (t) => {
  // Distinct identities can publish to the same legacy cache destination in the same millisecond.
  t.mock.method(Date, 'now', () => 1_800_000_000_000)
  const dir = await mkdtemp(path.join(tmpdir(), 'surface-identity-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const bytes = quickstartZip()
  const held = sharedSurfaceKit(bytes)
  const changed = structuredClone(held)
  changed.doc.blocks[0].frames[0].id = 'changed-frame'
  const released = deferred()
  let calls = 0
  const fetchAsset = async () => {
    calls++
    await released.promise
    return { ok: true, bytes }
  }
  const requests = [
    { dir, kit: held, kitId: held.ref, fetchAsset },
    { dir: path.join(dir, 'other-store'), kit: held, kitId: held.ref, fetchAsset },
    { dir, kit: { ...held, release: 'quickstart/other/j6' }, kitId: held.ref, fetchAsset },
    { dir, kit: changed, kitId: held.ref, fetchAsset }
  ]
  const pending = requests.map((request) => surfaceFor(request))
  released.resolve()
  const out = await Promise.all(pending)
  assert.equal(calls, 4)
  assert.ok(out[0].surface.frames['block-31.1'])
  assert.equal(out[0].surface.frames['changed-frame'], undefined)
  assert.ok(out[3].surface.frames['changed-frame'])
  assert.equal(out[3].surface.frames['block-31.1'], undefined)
  assert.deepEqual(await readdir(path.join(dir, 'kit-surface', 'fernhill_j6_1.0.0')), [
    `${held.installer.sha256}.json`
  ])
})
