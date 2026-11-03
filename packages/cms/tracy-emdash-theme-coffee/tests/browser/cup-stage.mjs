// The home page cup, drawn by a real headless browser on a running site.
//
//   SITE=http://127.0.0.1:4400 node --test tests/browser/
//
// Kept out of `tests/*.test.mjs` on purpose: it needs a running site and a GPU, the regression
// suite needs neither. For the same reason the file name carries no `.test.`: Tracy's tests gate
// counts every `*.test.mjs` as a suite CI must run, and CI has no running site to point it at. Two cases write the site's own content through the admin
// API and put it back — renaming the site, and the owner's cup (upload a .glb, set the "Cup model"
// field, then clear the field and delete the file): run them only against a site you can spare. The browser is the one Base pins
// (`tools/qa-browser.mjs` browserChoice); the flags turn its GPU on (measured on this Mac: without them headless Chromium has no WebGL
// renderer worth testing, with them it draws through ANGLE Metal).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import { REACH, REACH_TURN } from '../../src/lib/decor-motion.mjs'
import { browserChoice } from '../../tools/qa-browser.mjs'

const SITE = process.env.SITE
const GPU = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist']

async function openHome(
  t,
  contextOptions = {},
  viewport = { width: 1440, height: 900 },
  prepare = async () => {}
) {
  assert.ok(SITE, 'set SITE to the origin of a running site, e.g. SITE=http://127.0.0.1:4400')
  const { launch: _launch, ...options } = browserChoice()
  const browser = await chromium.launch({ ...options, args: GPU })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport, ...contextOptions })
  const models = []
  page.on('request', (r) => {
    if (/\.glb(\?|$)|\/_emdash\/api\/media\/file\//.test(r.url()) && r.resourceType() !== 'image')
      models.push(r.url())
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await prepare(page)
  await page.goto(new URL('/', SITE).href, { waitUntil: 'load' })
  const stage = page.locator('[data-cup-stage]')
  await stage.waitFor()
  await page.waitForFunction(() => document.querySelector('[data-cup-stage]')?.dataset.cupRoute)
  return { page, stage, models, errors }
}

// The stage sits behind the home page's text and under the sticky header: a picture of the cup alone hides both.
const cupShot = (stage) =>
  stage.screenshot({ style: '.home-track, header { visibility: hidden !important; }' })

test('the home page draws the cup in WebGL, centred and standing on the floor', async (t) => {
  const { page, stage, models, errors } = await openHome(t)
  assert.equal(await stage.getAttribute('data-cup-route'), '3d')
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  const pose = JSON.parse(await stage.getAttribute('data-cup-pose'))
  t.diagnostic(`model ${models.join(', ')}`)
  t.diagnostic(`pose ${JSON.stringify(pose)}`)
  assert.ok(Math.abs(pose.centre[0]) < 1e-3 && Math.abs(pose.centre[1]) < 1e-3, 'centred on the floor')
  assert.ok(Math.abs(pose.floor) < 1e-3, 'standing on the floor')
  assert.ok(Math.abs(Math.max(...pose.size) - 1) < 1e-3, 'longest side fitted to one unit')
  assert.equal(pose.view, 'front')
  // The canvas really shows an object: a good share of the stage differs from its background. Section 1, past the
  // brewing scene, so the share is the cup's alone.
  await toSection(page, 1)
  await page.waitForTimeout(1800) // the intro turn
  const png = PNG.sync.read(await cupShot(stage))
  const at = (i) => [png.data[i], png.data[i + 1], png.data[i + 2]]
  const bg = at(0)
  let drawn = 0
  for (let i = 0; i < png.data.length; i += 4) if (at(i).some((v, k) => Math.abs(v - bg[k]) > 24)) drawn++
  const share = drawn / (png.width * png.height)
  t.diagnostic(`drawn share ${share.toFixed(3)}`)
  assert.ok(share > 0.02, `the stage shows an object (${(share * 100).toFixed(1)} % of pixels)`)
  assert.equal(models.length, 1, 'the model file is loaded once')
  assert.deepEqual(errors, [])
})

test('with reduced motion the default still image shows, no canvas is built, no model file loads', async (t) => {
  const { stage, models, errors } = await openHome(t, { reducedMotion: 'reduce' })
  assert.equal(await stage.getAttribute('data-cup-route'), 'still')
  const img = stage.locator('img.cup-stage__still')
  await img.waitFor({ state: 'visible' })
  assert.match(await img.getAttribute('src'), /default-cup-still.*\.webp$/)
  assert.ok(await img.evaluate((el) => el.complete && el.naturalWidth > 0), 'the still image loaded')
  assert.equal(await stage.locator('canvas').count(), 0)
  assert.deepEqual(models, [])
  assert.deepEqual(errors, [])
})

test('with reduced motion the page builds no canvas and loads no model file', async (t) => {
  const { page, stage, models, errors } = await openHome(t, { reducedMotion: 'reduce' })
  assert.notEqual(await stage.getAttribute('data-cup-route'), '3d')
  await page.waitForTimeout(1000)
  assert.equal(await stage.locator('canvas').count(), 0)
  // No brewing scene either: its block takes no room, the page opens on section 1 under the header.
  assert.equal(
    await page.locator('[data-brew]').evaluate((b) => b.offsetHeight),
    0,
    'the brewing block is hidden'
  )
  const below = await page.evaluate(
    () =>
      document.querySelector('[data-section="1"]').getBoundingClientRect().top -
      document.querySelector('header').getBoundingClientRect().bottom
  )
  assert.ok(Math.abs(below) <= 1, `section 1 starts under the header (${below} px)`)
  assert.deepEqual(models, [])
  assert.deepEqual(errors, [])
})

test('scrolling moves the cup from pose to pose, and scrolling back returns it', async (t) => {
  const { page, stage, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  /** Scroll section `n`'s middle to the window's middle and read the pose once the smoothed scroll settles. */
  const visit = async (n) => {
    await page.evaluate((n) => {
      const r = document.querySelector(`[data-section="${n}"]`).getBoundingClientRect()
      scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
    }, n)
    await page.waitForTimeout(1500)
    return {
      section: await stage.getAttribute('data-cup-section'),
      motion: JSON.parse(await stage.getAttribute('data-cup-motion'))
    }
  }
  const first = await visit(1)
  const second = await visit(2)
  const close = await visit(4)
  const back = await visit(1)
  t.diagnostic(JSON.stringify({ first, second, close, back }))
  assert.equal(first.section, '1')
  assert.equal(second.section, '2')
  assert.notEqual(first.motion.tilt, 0, 'section 1 leans the cup')
  assert.equal(second.motion.tilt, 0, 'section 2 stands it up')
  assert.ok(
    Math.abs(second.motion.turn - first.motion.turn - Math.PI) < 1e-3,
    'section 2 turns it half a round'
  )
  assert.equal(close.section, '4')
  assert.ok(close.motion.h > second.motion.h * 1.3, 'section 4 comes close')
  assert.deepEqual(back, first, 'scrolling back returns the same pose')
  assert.deepEqual(errors, [])
})

test('in sections 5 and 6 the cup stays on the card, frame by frame while scrolling, and stops turning', async (t) => {
  const { page, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  // Land the cup in the card (section 5's middle) and let the smoothed scroll and the intro settle.
  await page.evaluate(() => {
    const r = document.querySelector('[data-section="5"]').getBoundingClientRect()
    scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
  })
  await page.waitForTimeout(2000)
  for (const step of [12, 60]) {
    /** Scroll down `step` px per frame through section 6; after each frame, where the drawn cup's middle is
     *  against the card's middle (stage pixels) and the scene's turn, while the card is on the stage. */
    const frames = await page.evaluate(async (step) => {
      const stage = document.querySelector('[data-cup-stage]')
      const card = document.querySelector('[data-cup-dock]')
      const out = []
      for (let i = 0; i < 80; i++) {
        scrollBy(0, step)
        await new Promise((r) => requestAnimationFrame(() => r()))
        const s = stage.getBoundingClientRect()
        const d = card.getBoundingClientRect()
        if (d.bottom <= s.top + 1) break
        out.push({
          dx: parseFloat(stage.style.getPropertyValue('--cup-cx')) - (d.left + d.width / 2 - s.left),
          dy: parseFloat(stage.style.getPropertyValue('--cup-cy')) - (d.top + d.height / 2 - s.top),
          spin: stage.cupScene.spin
        })
      }
      return out
    }, step)
    const worst = Math.max(...frames.map((f) => Math.max(Math.abs(f.dx), Math.abs(f.dy))))
    const spins = frames.map((f) => f.spin)
    t.diagnostic(
      `${step} px/frame: ${frames.length} frames, worst offset ${worst.toFixed(2)} px, turn ${Math.min(...spins)}…${Math.max(...spins)}`
    )
    assert.ok(frames.length >= 5, 'the card was followed for several frames')
    assert.ok(worst < 2, `the cup sits on the card in every frame (worst ${worst.toFixed(2)} px)`)
    assert.ok(Math.max(...spins) - Math.min(...spins) < 1e-6, 'the cup does not sway in the card')
    // back to section 5 for the faster pass
    await page.evaluate(() => {
      const r = document.querySelector('[data-section="5"]').getBoundingClientRect()
      scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
    })
    await page.waitForTimeout(1500)
  }
  assert.deepEqual(errors, [])
})

// Size of what the stage shows over its own background, in CSS pixels. The height is the whole
// object; the width is read over its top 40 % (lid and upper cup) because the live scene draws no
// floor shadow on narrow screens while the still image always carries one.
async function objectBox(stage) {
  const png = PNG.sync.read(await cupShot(stage))
  const bg = [png.data[0], png.data[1], png.data[2]]
  const differs = (x, y) =>
    [0, 1, 2].some((k) => Math.abs(png.data[(y * png.width + x) * 4 + k] - bg[k]) > 24)
  let [top, bottom] = [png.height, -1]
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++)
      if (differs(x, y)) [top, bottom] = [Math.min(top, y), Math.max(bottom, y)]
  const h = bottom - top + 1
  let [left, right] = [png.width, -1]
  for (let y = top; y < top + h * 0.4; y++)
    for (let x = 0; x < png.width; x++)
      if (differs(x, y)) [left, right] = [Math.min(left, x), Math.max(right, x)]
  return { w: right - left + 1, h }
}

for (const width of [1440, 390]) {
  test(`at ${width} px the still cup is drawn as large as the 3D cup`, async (t) => {
    const viewport = { width, height: 900 }
    const live = await openHome(t, {}, viewport)
    await live.page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    await toSection(live.page, 1) // past the brewing scene
    await live.page.waitForTimeout(2200) // the intro turn
    const cup3d = await objectBox(live.stage)
    const still = await openHome(t, { reducedMotion: 'reduce' }, viewport)
    await still.page.locator('img.cup-stage__still').waitFor({ state: 'visible' })
    await still.page.waitForTimeout(300)
    const cup2d = await objectBox(still.stage)
    t.diagnostic(`${width}px 3D ${cup3d.w}x${cup3d.h}, still ${cup2d.w}x${cup2d.h}`)
    for (const k of ['w', 'h'])
      assert.ok(Math.abs(cup2d[k] - cup3d[k]) / cup3d[k] <= 0.15, `${k}: still ${cup2d[k]} vs 3D ${cup3d[k]}`)
  })
}

test('while the 3D cup loads the plain still image shows, then fades into it in half a second', async (t) => {
  // Hold the model file back so the wait is long enough to see.
  const slow = (page) =>
    page.route(/\.glb(\?|$)/, async (route) => {
      await new Promise((r) => setTimeout(r, 1500))
      await route.continue()
    })
  const { page, stage, errors } = await openHome(t, {}, undefined, slow)
  assert.equal(await stage.getAttribute('data-cup-route'), '3d')
  const img = stage.locator('img.cup-stage__still')
  // Over the brewing scene the still stays hidden (the cup waits on the drip tray); in section 1 it stands in.
  assert.equal(
    await img.evaluate((el) => getComputedStyle(el).visibility),
    'hidden',
    'no still over the brewing scene'
  )
  await toSection(page, 1)
  await img.waitFor({ state: 'visible' })
  assert.match(await img.getAttribute('src'), /default-cup-still.*\.webp$/)
  assert.equal(
    await img.evaluate((el) => getComputedStyle(el).opacity),
    '1',
    'the still shows while the cup loads'
  )
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  const fade = await stage.evaluate((el) =>
    [el.querySelector('img'), el.querySelector('canvas')].map((e) => getComputedStyle(e).transitionDuration)
  )
  assert.deepEqual(fade, ['0.5s', '0.5s'], 'still out and 3D in, both over half a second')
  await page.waitForTimeout(800)
  assert.equal(
    await img.evaluate((el) => getComputedStyle(el).opacity),
    '0',
    'the still is gone once the 3D cup shows'
  )
  assert.deepEqual(errors, [])
})

// The admin token of the site at SITE: SITE_TOKEN, else the token file of the local tracy-dev site that serves it.
function siteToken() {
  const { SITE_TOKEN } = process.env
  if (SITE_TOKEN) return SITE_TOKEN
  const cli = (...args) => JSON.parse(execFileSync('tracy-dev', [...args, '--json'], { encoding: 'utf8' }))
  const site = cli('sites').find((s) => new URL(s.url).origin === new URL(SITE).origin)
  assert.ok(site, `no local tracy-dev site serves ${SITE}: set SITE_TOKEN to its admin token`)
  return readFileSync(cli('admin', site.name).admin.token, 'utf8').trim()
}

// The site's admin API (docs/content-api.md), path under /_emdash/api/, answering the envelope's data.
function adminApi(token) {
  return async (method, path, body) => {
    const r = await fetch(new URL(`/_emdash/api/${path}`, SITE), {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'X-EmDash-Request': '1',
        'Content-Type': 'application/json'
      },
      body: body && JSON.stringify(body)
    })
    const json = await r.json()
    assert.ok(r.ok, `${method} ${path}: ${JSON.stringify(json)}`)
    return json.data
  }
}

// The safe write sequence of docs/content-api.md: read with _rev, change one field, publish.
async function setField(api, collection, field, value) {
  const { item, _rev } = await api('GET', `content/${collection}/${collection}?locale=en`)
  await api('PUT', `content/${collection}/${item.id}?locale=en`, { data: { [field]: value }, _rev })
  await api('POST', `content/${collection}/${item.id}/publish?locale=en`, {})
}

// Stops a case that would publish over an editor's unpublished draft of that entry.
async function publishedEntry(api, collection) {
  const { item } = await api('GET', `content/${collection}/${collection}?locale=en`)
  assert.deepEqual(
    item.data,
    item.liveData ?? item.data,
    `the ${collection} entry has no unpublished draft to publish over`
  )
  return item
}

test('the default cup prints the shop name the header shows, and renaming the site reprints it', async (t) => {
  const api = adminApi(siteToken())
  const rename = (name) => setField(api, 'site', 'brand_name', name)
  const printed = async () => {
    const { page, stage, errors } = await openHome(t)
    await page.waitForSelector('[data-cup-stage].is-ready[data-cup-name]', { timeout: 60000 })
    return {
      header: await page.locator('header').innerText(),
      cup: await stage.getAttribute('data-cup-name'),
      errors
    }
  }
  const original = (await publishedEntry(api, 'site')).data.brand_name
  const before = await printed()
  assert.equal(before.cup, original)
  assert.ok(before.header.includes(original), `the header shows "${original}"`)
  t.after(() => rename(original))
  await rename('Kiln & Crema')
  const after = await printed()
  t.diagnostic(JSON.stringify({ before: before.cup, after: after.cup }))
  assert.equal(after.cup, 'Kiln & Crema')
  assert.ok(after.header.includes('Kiln & Crema'), 'the header shows the new name')
  assert.deepEqual([...before.errors, ...after.errors], [])
})

// A wide object (the default cup laid on its side, made by the acceptance tooling outside the repo)
// stays inside the stage in every section, at a wide and at a narrow window.
const LYING = new URL(
  '../../.scratch/template-3d-emdash/bang-chung/cum/vat-thu/ly-nam-ngang.glb',
  import.meta.url
)
for (const width of [1440, 848]) {
  test(`at ${width} px a wide object fits the stage in sections 1, 2 and 4`, {
    skip: !existsSync(LYING) && 'no lying cup file'
  }, async (t) => {
    const route = (page) =>
      page.route('**/models/default-cup.glb', (r) =>
        r.fulfill({ path: LYING.pathname, contentType: 'model/gltf-binary' })
      )
    const { page, stage, errors } = await openHome(t, {}, { width, height: 900 }, route)
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    for (const n of [1, 2, 4]) {
      await page.evaluate((n) => {
        const r = document.querySelector(`[data-section="${n}"]`).getBoundingClientRect()
        scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
      }, n)
      await page.waitForTimeout(2200)
      const png = PNG.sync.read(await cupShot(stage))
      const bg = [png.data[0], png.data[1], png.data[2]]
      let [left, right] = [png.width, -1]
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++)
          if ([0, 1, 2].some((k) => Math.abs(png.data[(y * png.width + x) * 4 + k] - bg[k]) > 24))
            [left, right] = [Math.min(left, x), Math.max(right, x)]
      t.diagnostic(`section ${n}: object ${left}-${right} of ${png.width}`)
      assert.ok(left > 4 && right < png.width - 5, `section ${n} stays inside the stage`)
    }
    // Served in place of the default cup's file, so the page takes it for the default cup: its paper body
    // turns see-through in section 4 like the upright one's. An owner's file never does (the case below).
    t.diagnostic(`clear in section 4 (default cup's path): ${await stage.evaluate((s) => s.cupScene?.clear)}`)
    assert.deepEqual(errors, [])
  })
}

// An owner's cup: a .glb in the home page's "Cup model" field. The page draws it as it is: no shop name
// printed on it, no see-through inside in "A closer look". The default cup's own file stands in for the
// owner's (uploaded under another name); afterwards the field is emptied and the file deleted, as the
// rename case puts the name back. Run it only against a site you can spare.
test("an owner's cup in the Cup model field is drawn as it is: no shop name, never see-through", async (t) => {
  const token = siteToken()
  const api = adminApi(token)
  assert.ok(!(await publishedEntry(api, 'home')).data.cup_model, 'the Cup model field starts empty')
  const { items } = await api('GET', 'schema/collections/home/fields')
  const bytes = readFileSync(new URL('../../public/models/default-cup.glb', import.meta.url))
  const contentHash = `sha1:${createHash('sha1').update(bytes).digest('hex')}`
  // The field's id makes EmDash check the field's own allowed types (docs/object-template.md).
  const ask = await api('POST', 'media/upload-url', {
    filename: 'owner-cup.glb',
    contentType: 'model/gltf-binary',
    size: bytes.length,
    contentHash,
    fieldId: items.find((f) => f.slug === 'cup_model').id,
    ensureUniqueFilename: true
  })
  t.after(async () => {
    await setField(api, 'home', 'cup_model', null)
    await api('DELETE', `media/${ask.mediaId}`)
  })
  const put = await fetch(new URL(ask.uploadUrl, SITE), {
    method: ask.method,
    headers: { ...ask.headers, Authorization: `Bearer ${token}` },
    body: bytes
  })
  assert.ok(put.ok, `upload: HTTP ${put.status}`)
  // The stored file's key is the confirmed item's, not the one the upload door answered with.
  const { storageKey } = (
    await api('POST', `media/${ask.mediaId}/confirm`, { contentHash, size: bytes.length })
  ).item
  await setField(api, 'home', 'cup_model', {
    id: ask.mediaId,
    src: `/_emdash/api/media/file/${storageKey}`,
    filename: 'owner-cup.glb',
    mimeType: 'model/gltf-binary',
    provider: 'local',
    meta: { storageKey }
  })
  const { page, stage, models, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  assert.equal(await stage.getAttribute('data-cup-route'), '3d')
  assert.ok(
    models.some((u) => u.includes(storageKey)),
    `the owner's file is drawn: ${models.join(', ')}`
  )
  assert.equal(await stage.getAttribute('data-cup-shop'), null, 'no shop name is handed to the scene')
  assert.equal(await stage.getAttribute('data-cup-name'), null, 'no shop name is printed')
  // Through the brewing scene the owner's cup stands on the tray and takes the coffee as it is: never see-through.
  for (const q of [0.2, 0.55, 0.85]) {
    const drawn = await brewTo(page, q)
    const clear = await stage.evaluate((s) => s.cupScene?.clear)
    t.diagnostic(`brewing ${q}: drawn ${drawn}, clear ${clear}`)
    assert.ok(Math.abs(drawn - q) < 0.01, `the brewing scene is drawn at ${q} (${drawn})`)
    assert.ok(clear === null || clear <= 0, `brewing ${q}: the owner's cup stays as it is`)
  }
  for (const n of [3, 4, 5]) {
    await toSection(page, n)
    await page.waitForTimeout(2500)
    const clear = await stage.evaluate((s) => s.cupScene?.clear)
    t.diagnostic(`section ${n}: clear ${clear}`)
    assert.ok(clear === null || clear <= 0, `section ${n}: the owner's cup stays as it is`)
  }
  assert.deepEqual(errors, [])
})

// In a mid-width window (768–1100) the text sits beside the cup with little room: the labels of the
// close-up stay inside the window and the text of sections 2 and 3 stays clear of the cup.
for (const width of [848, 1024]) {
  test(`at ${width} px the labels fit the window and the text keeps clear of the cup`, async (t) => {
    const { page, stage, errors } = await openHome(t, {}, { width, height: 900 })
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    const goTo = async (n) => {
      await page.evaluate((n) => {
        const r = document.querySelector(`[data-section="${n}"]`).getBoundingClientRect()
        scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
      }, n)
      await page.waitForTimeout(2200)
    }
    await goTo(4)
    const boxes = await page.$$eval('.cup-label__box', (els) =>
      els.map((e) => e.getBoundingClientRect()).map((r) => ({ l: r.left, r: r.right }))
    )
    t.diagnostic(JSON.stringify(boxes))
    assert.ok(boxes.length > 0)
    for (const b of boxes) assert.ok(b.l >= 0 && b.r <= width, `label box ${b.l}-${b.r} inside ${width}`)
    for (const n of [2, 3]) {
      await goTo(n)
      const png = PNG.sync.read(await cupShot(stage))
      const bg = [png.data[0], png.data[1], png.data[2]]
      let [left, right] = [png.width, -1]
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++)
          if ([0, 1, 2].some((k) => Math.abs(png.data[(y * png.width + x) * 4 + k] - bg[k]) > 24))
            [left, right] = [Math.min(left, x), Math.max(right, x)]
      const text = await page.$$eval(`[data-section="${n}"] :is(h2, h3, p)`, (els) =>
        els
          .map((e) => e.getBoundingClientRect())
          .filter((r) => r.width)
          .map((r) => ({ l: r.left, r: r.right }))
      )
      t.diagnostic(`section ${n}: cup ${left}-${right}, text ${JSON.stringify(text)}`)
      for (const r of text)
        assert.ok(
          r.r <= left + 4 || r.l >= right - 4, // a text box may touch the cup's floor shadow by a few pixels
          `section ${n}: text ${r.l}-${r.r} crosses the cup ${left}-${right}`
        )
    }
    assert.deepEqual(errors, [])
  })
}

// The coffee tools drawn into empty corners (src/assets/decor/): a fixed picture of the template that flies in,
// floats and reacts to a click (src/lib/decor-motion.mjs), never over text, a button, a photo or the cup — measured
// on the box the page places it in, grown by the farthest its moves take it — and still for a reader who turned
// motion off.
const DECOR_PAGES = {
  '/': [
    'beans',
    'espresso',
    'roaster',
    'green-beans',
    'roasted-beans',
    'pour',
    'table-cup',
    'spoon',
    'kettle'
  ],
  '/menu': ['moka']
}
/** The box each shown tool is placed in (its moves undone), grown by its reach, in window coordinates. */
const placedDecor = (page) =>
  page.evaluate(
    ({ reach, turn }) =>
      [...document.querySelectorAll('[data-decor]')]
        .filter((d) => getComputedStyle(d).display !== 'none')
        .map((d) => {
          const moved = d.style.transform
          d.style.transform = 'none'
          const r = d.getBoundingClientRect()
          d.style.transform = moved
          const grow = reach + (Math.max(r.width, r.height) * Math.sin((turn * Math.PI) / 180)) / 2
          return {
            name: d.dataset.decor,
            l: r.left - grow,
            t: r.top - grow,
            r: r.right + grow,
            b: r.bottom + grow,
            w: r.width
          }
        })
        .filter((d) => d.w > 0),
    { reach: REACH, turn: REACH_TURN }
  )
/** Overlaps in page coordinates between each shown tool's reach and the page's text, links, buttons and photos. */
async function decorClashes(page) {
  const decor = await placedDecor(page)
  return page.evaluate((decor) => {
    const box = (r) => ({ l: r.left, t: r.top + scrollY, r: r.right, b: r.bottom + scrollY })
    const shown = (r) => r.width > 0 && r.height > 0
    const things = []
    const skip = (el) => el.closest('[data-decor], [data-cup-stage], body > header, footer, [hidden]') // the cup is measured on its own below
    const walk = document.createTreeWalker(document.querySelector('main'), NodeFilter.SHOW_TEXT)
    while (walk.nextNode()) {
      const n = walk.currentNode
      if (!n.textContent.trim() || skip(n.parentElement)) continue
      if (getComputedStyle(n.parentElement).visibility === 'hidden') continue
      const range = document.createRange()
      range.selectNodeContents(n)
      for (const r of range.getClientRects())
        if (shown(r)) things.push({ what: n.textContent.trim().slice(0, 30), ...box(r) })
    }
    for (const el of document.querySelectorAll(
      'main :is(a, button, input, textarea, select, img:not([data-decor]), .home-card__link)'
    )) {
      if (skip(el)) continue
      const r = el.getBoundingClientRect()
      if (shown(r)) things.push({ what: el.tagName + '.' + el.className, ...box(r) })
    }
    const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b
    const placed = decor.map((d) => ({ ...d, t: d.t + scrollY, b: d.b + scrollY }))
    return {
      decor: placed,
      clashes: placed.flatMap((d) => things.filter((x) => hit(d, x)).map((x) => `${d.name} over "${x.what}"`))
    }
  }, decor)
}
/** Every link, button and field in the window that a click on its middle does not reach. */
const blockedControls = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main :is(a, button, input, textarea, select)')]
      .filter((el) => !el.closest('[data-cup-stage], [hidden]'))
      .map((el) => [el, el.getBoundingClientRect()])
      .filter(
        ([, r]) =>
          r.width && r.height && r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth
      )
      .map(([el, r]) => [el, document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)])
      // under the sticky site header is scrolled out of reach, not covered by a tool
      .filter(
        ([el, at]) => !(at && (el === at || el.contains(at) || (at.closest('header') && !at.closest('main'))))
      )
      .map(
        ([el, at]) =>
          `${el.tagName} "${el.textContent.trim().slice(0, 30)}" under ${at?.tagName}.${at?.className}`
      )
  )
/** Scroll to brewing progress `q` (`home-scroll.mjs` brewAt) and answer the progress the scene drew. */
async function brewTo(page, q) {
  await page.evaluate((q) => {
    const top = document.querySelector('[data-home-runway]').getBoundingClientRect().top + scrollY
    const s1 = document.querySelector('[data-section="1"]').getBoundingClientRect().top + scrollY - top
    const fly = document.querySelector('[data-brew]').getBoundingClientRect().bottom + scrollY - innerHeight
    scrollTo(0, q <= 0.9 ? (q / 0.9) * fly : fly + ((q - 0.9) / 0.1) * (s1 - fly))
  }, q)
  await page.waitForTimeout(1600) // the smoothed scroll settles
  return page.evaluate(() => document.querySelector('[data-cup-stage]').cupScene?.brew)
}
const toSection = (page, n) =>
  page.evaluate((n) => {
    const r = document.querySelector(`[data-section="${n}"]`).getBoundingClientRect()
    scrollTo(0, r.top + scrollY + r.height / 2 - innerHeight / 2)
  }, n)

// Desktop, small laptop, landscape and upright tablet, and three phones.
const WIDTHS = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [848, 900],
  [768, 1024],
  [430, 932],
  [390, 844],
  [360, 780]
]
for (const viewport of WIDTHS.map(([width, height]) => ({ width, height }))) {
  test(`at ${viewport.width} px the coffee tools keep clear of the text, the buttons, the photos and the cup`, async (t) => {
    const { page, stage, errors } = await openHome(t, {}, viewport)
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    for (const [path, names] of Object.entries(DECOR_PAGES)) {
      if (path !== '/') await page.goto(new URL(path, SITE).href, { waitUntil: 'load' })
      const all = await page.$$eval('[data-decor]', (els) =>
        els.map((e) => ({
          name: e.dataset.decor,
          pointer: getComputedStyle(e).pointerEvents,
          hidden: e.getAttribute('aria-hidden'),
          alt: e.getAttribute('alt'),
          filter: getComputedStyle(e).filter
        }))
      )
      assert.deepEqual(all.map((d) => d.name).sort(), [...names].sort(), `${path} carries its decor`)
      for (const d of all) {
        assert.equal(d.pointer, 'auto', `${d.name} takes a click`)
        assert.equal(d.hidden, 'true', `${d.name} is hidden from screen readers`)
        assert.equal(d.alt, '', `${d.name} has an empty alt`)
        assert.equal(d.filter, 'none', `${d.name} keeps its own colours`)
      }
      const { decor, clashes } = await decorClashes(page)
      t.diagnostic(
        `${path}: ${JSON.stringify(decor.map((d) => [d.name, Math.round(d.l), Math.round(d.t), Math.round(d.w)]))}`
      )
      assert.deepEqual(clashes, [], `${path}: decor over content`)
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${path}: nothing pushes the page sideways`
      )
      if (viewport.width >= 768) assert.ok(decor.length > 0, `${path} shows its decor on a wide screen`)
      if (path !== '/') {
        await page.waitForTimeout(1200)
        assert.deepEqual(
          await blockedControls(page),
          [],
          `${path}: every button and link still takes its click`
        )
      }
    }
    // The cup and the buttons: in each section, no tool in the window reaches the cup's drawn box, and a click on
    // the middle of every button and link still lands on it while the tools float.
    await page.goto(new URL('/', SITE).href, { waitUntil: 'load' })
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    for (const n of [1, 2, 3, 5, 6]) {
      await toSection(page, n)
      await page.waitForTimeout(2200)
      const at = await stage.evaluate((s) => s.getBoundingClientRect().toJSON())
      const png = PNG.sync.read(await cupShot(stage))
      const bg = [png.data[0], png.data[1], png.data[2]]
      let [l, t2, r, b] = [png.width, png.height, -1, -1]
      for (let y = 0; y < png.height; y++)
        for (let x = 0; x < png.width; x++)
          if ([0, 1, 2].some((k) => Math.abs(png.data[(y * png.width + x) * 4 + k] - bg[k]) > 24))
            [l, t2, r, b] = [Math.min(l, x), Math.min(t2, y), Math.max(r, x), Math.max(b, y)]
      const cup = { l: l + at.x, t: t2 + at.y, r: r + at.x, b: b + at.y }
      const near = (await placedDecor(page)).filter((d) => d.b > 0 && d.t < viewport.height)
      t.diagnostic(
        `section ${n}: cup ${JSON.stringify(cup)} decor ${JSON.stringify(near.map((d) => d.name))}`
      )
      assert.deepEqual(
        await blockedControls(page),
        [],
        `section ${n}: every button and link still takes its click`
      )
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `section ${n}: nothing pushes the page sideways`
      )
      if (r < 0) continue
      for (const d of near)
        assert.ok(
          d.r <= cup.l || d.l >= cup.r || d.b <= cup.t || d.t >= cup.b,
          `section ${n}: ${d.name} reaches the cup`
        )
    }
    assert.deepEqual(errors, [])
  })
}

// Common laptop and desktop windows and a phone: the first screen is the brewing scene's first frame, no shop name
// over it (the header has it), a menu sheet on the wall and a small "View the menu" button, one link a click reaches,
// clear of the espresso machine; section 1 at rest, under the sticky header, holds the whole invitation.
for (const [width, height] of [
  [1366, 768],
  [1440, 900],
  [1536, 864],
  [1920, 1080],
  [768, 1024],
  [390, 844]
]) {
  test(`at ${width}x${height} the first frame's menu sheet and button take a click clear of the machine, and section 1 holds its button and the espresso machine`, async (t) => {
    const { page, stage, errors } = await openHome(t, {}, { width, height })
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    assert.equal(await stage.evaluate((s) => s.cupScene?.brew), 0, 'the first screen is the brewing scene')
    assert.equal(
      await page.locator('[data-brew] h1, [data-brew] h2, [data-brew] p').count(),
      0,
      'no shop name or other words over the first frame'
    )
    const link = page.locator('.home-brew__first a.home-brew__menu')
    assert.equal(await link.count(), 1, 'one link: the sheet and the button')
    const [sheet, btn] = await Promise.all(
      ['.home-brew__sheet', '.home-brew__btn'].map((c) =>
        link.locator(c).evaluate((e) => e.getBoundingClientRect().toJSON())
      )
    )
    const header = await page.locator('header').evaluate((h) => h.getBoundingClientRect().bottom)
    const machine = await stage.evaluate((s) => {
      const b = s.cupScene.machineBox
      const r = s.getBoundingClientRect()
      return { left: b.left + r.left, top: b.top + r.top, right: b.right + r.left, bottom: b.bottom + r.top }
    })
    t.diagnostic(
      `sheet ${Math.round(sheet.left)},${Math.round(sheet.top)}–${Math.round(sheet.right)},${Math.round(sheet.bottom)} · button ${Math.round(btn.top)}-${Math.round(btn.bottom)} · machine ${Math.round(machine.left)},${Math.round(machine.top)}–${Math.round(machine.right)},${Math.round(machine.bottom)} · header ${header}`
    )
    assert.ok(btn.height <= 36, `the button is small: ${btn.height} px tall`)
    for (const [name, r] of [
      ['sheet', sheet],
      ['button', btn]
    ]) {
      assert.ok(
        r.top >= header && r.bottom <= height && r.left >= 0 && r.right <= width,
        `the ${name} is in the first screen, under the header`
      )
      const clear =
        r.right <= machine.left ||
        r.left >= machine.right ||
        r.bottom <= machine.top ||
        r.top >= machine.bottom
      assert.ok(clear, `the ${name} stays clear of the espresso machine`)
      const at = await page.evaluate(
        ([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.className ?? '',
        [r.x + r.width / 2, r.y + r.height / 2]
      )
      assert.match(at, /home-brew__menu/, `a click on the ${name} reaches the menu link`)
    }
    const href = await link.getAttribute('href')
    assert.equal(
      href,
      await page.locator('.home-intro a.btn').getAttribute('href'),
      'the same address as the menu button in section 1'
    )
    await page.evaluate((y) => scrollTo(0, y), 0)
    if (width === 1440) {
      for (const c of ['.home-brew__sheet', '.home-brew__btn']) {
        await link.locator(c).click()
        await page.waitForURL((u) => u.pathname === new URL(href, SITE).pathname)
        await page.goBack({ waitUntil: 'load' })
        await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
      }
    }
    // Section 1 at rest: its top under the header.
    await page.evaluate(() => {
      const top = document.querySelector('[data-section="1"]').getBoundingClientRect().top + scrollY
      scrollTo(0, top - document.querySelector('header').getBoundingClientRect().height)
    })
    await page.waitForTimeout(1200)
    if (width < 768) {
      const cta = await page.locator('.home-intro a.btn').evaluate((a) => a.getBoundingClientRect().toJSON())
      assert.ok(
        cta.bottom <= height,
        `section 1's button ends at ${cta.bottom}, past the ${height} px window`
      )
      assert.deepEqual(errors, [])
      return
    }
    const cta = await page.locator('.home-intro a.btn').evaluate((a) => a.getBoundingClientRect().toJSON())
    const espresso = (await placedDecor(page)).find((d) => d.name === 'espresso')
    t.diagnostic(
      `button ${Math.round(cta.top)}-${Math.round(cta.bottom)}, espresso reach to ${Math.round(espresso.b)}`
    )
    assert.ok(cta.bottom <= height, `the button ends at ${cta.bottom}, past the ${height} px window`)
    assert.ok(
      espresso.b <= height,
      `the espresso machine reaches ${espresso.b}, past the ${height} px window`
    )
    assert.deepEqual(errors, [])
  })
}

// The buttons that order: the header's green button and the mobile menu's last one read "Order", the home page's last
// button "Order now", all into the menu; the "Contact" menu item still opens the Contact page and its form.
for (const [width, height] of [
  [1440, 900],
  [390, 844]
]) {
  test(`at ${width}x${height} the order buttons open the menu, and the Contact menu item opens the Contact page and its form`, async (t) => {
    const { page, errors } = await openHome(t, {}, { width, height })
    const menu = new URL('/menu', SITE).pathname
    const order = width < 1024 ? null : page.locator('header a.btn-primary')
    if (order) {
      assert.equal((await order.innerText()).trim(), 'Order')
      assert.equal(new URL(await order.getAttribute('href'), SITE).pathname, menu)
      const contact = page.locator('header nav a', { hasText: /^Contact$/ })
      assert.equal(
        new URL(await contact.getAttribute('href'), SITE).pathname,
        '/contact',
        'the menu item keeps the Contact page'
      )
    } else {
      await page.locator('header button[aria-controls="mobile-nav"]').click()
      const nav = page.locator('#mobile-nav')
      const last = nav.locator('a.btn-primary')
      assert.equal((await last.innerText()).trim(), 'Order')
      assert.equal(new URL(await last.getAttribute('href'), SITE).pathname, menu)
      const contact = nav.locator('a', { hasText: /^Contact$/ })
      assert.equal(
        new URL(await contact.getAttribute('href'), SITE).pathname,
        '/contact',
        'the menu item keeps the Contact page'
      )
      await page.reload({ waitUntil: 'load' })
    }
    const now = page.locator('[data-section="6"] a.btn-primary')
    assert.equal((await now.innerText()).trim(), 'Order now')
    const href = await now.getAttribute('href')
    assert.equal(new URL(href, SITE).pathname, menu)
    await now.scrollIntoViewIfNeeded()
    await now.click()
    await page.waitForURL((u) => u.pathname === menu)
    await page.goto(new URL('/contact', SITE).href, { waitUntil: 'load' })
    assert.ok(
      await page.locator('[data-contact-form] form.ec-form').count(),
      'the Contact page keeps its form'
    )
    assert.deepEqual(errors, [])
  })
}

test('the coffee tools float, and a click on one makes it react', async (t) => {
  const { page, errors } = await openHome(t)
  await toSection(page, 1) // the beans are in section 1, past the brewing scene
  await page.waitForTimeout(1500)
  const beans = page.locator('[data-decor="beans"]')
  const a = await beans.evaluate((e) => e.style.transform)
  await page.waitForTimeout(700)
  const b = await beans.evaluate((e) => e.style.transform)
  assert.notEqual(a, b, 'the beans float')
  const box = await beans.boundingBox()
  const middle = [box.x + box.width / 2, box.y + box.height / 2]
  assert.equal(
    await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.dataset.decor, middle),
    'beans',
    'nothing covers the beans'
  )
  const before = await page.$$eval('main img', (els) => els.length)
  await page.mouse.click(...middle)
  await page.waitForTimeout(300)
  const after = await page.$$eval('main img', (els) => els.length)
  assert.ok(after > before, 'beans burst out of the cluster')
  await page.waitForTimeout(2200)
  assert.equal(await page.$$eval('main img', (els) => els.length), before, 'and drift back')
  assert.deepEqual(errors, [])
})

test('with reduced motion the coffee tools stand still while the page scrolls, and a click does nothing', async (t) => {
  const { page, errors } = await openHome(t, { reducedMotion: 'reduce' })
  const read = () =>
    page.$$eval('[data-decor]', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return {
          name: e.dataset.decor,
          at: [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width)],
          moving: e.getAnimations().length,
          transform: getComputedStyle(e).transform,
          pointer: getComputedStyle(e).pointerEvents
        }
      })
    )
  const first = await read()
  assert.ok(first.length > 0)
  for (const n of [2, 4, 6, 1]) {
    await page.evaluate((n) => document.querySelector(`[data-section="${n}"]`).scrollIntoView(), n)
    await page.waitForTimeout(600)
    assert.deepEqual(await read(), first, `the decor stays put at section ${n}`)
  }
  for (const d of first) {
    assert.equal(d.moving, 0, `${d.name} has no animation`)
    assert.equal(d.transform, 'none', `${d.name} is not moved by script`)
    assert.equal(d.pointer, 'none', `${d.name} takes no pointer`)
  }
  await page.mouse.move(400, 400)
  const box = await page.locator('[data-decor="beans"]').boundingBox()
  const before = await page.$$eval('main img', (els) => els.length)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(400)
  assert.equal(await page.$$eval('main img', (els) => els.length), before, 'a click spills no beans')
  assert.deepEqual(await read(), first, 'nor moves anything')
  assert.deepEqual(errors, [])
})

test('the default cup turns see-through in "A closer look" and back to paper on either side', async (t) => {
  const { page, stage, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  const clearAt = async (n) => {
    await toSection(page, n)
    await page.waitForTimeout(2500)
    return stage.evaluate((s) => s.cupScene?.clear)
  }
  const shots = {}
  for (const n of [3, 4, 5]) {
    const c = await clearAt(n)
    t.diagnostic(`section ${n}: clear ${c}`)
    assert.equal(c, n === 4 ? 1 : 0, `section ${n}`)
    if (n !== 5) shots[n] = PNG.sync.read(await cupShot(stage))
  }
  // Through the paper the coffee shows: the cup's lower body is darker in section 4 than as paper in section 3.
  const lowerBody = (png) => {
    let [sum, count] = [0, 0]
    const bg = [png.data[0], png.data[1], png.data[2]]
    for (let y = Math.round(png.height * 0.5); y < png.height * 0.85; y++)
      for (let x = 0; x < png.width; x++) {
        const i = (y * png.width + x) * 4
        if ([0, 1, 2].some((k) => Math.abs(png.data[i + k] - bg[k]) > 24)) {
          sum += png.data[i] + png.data[i + 1] + png.data[i + 2]
          count++
        }
      }
    return sum / count
  }
  t.diagnostic(
    `lower body brightness: paper ${lowerBody(shots[3]).toFixed(0)}, clear ${lowerBody(shots[4]).toFixed(0)}`
  )
  assert.notEqual(Math.round(lowerBody(shots[3])), Math.round(lowerBody(shots[4])))
  assert.equal(await clearAt(1), 0, 'paper again back at the top')
  assert.deepEqual(errors, [])
})

// The brewing scene before section 1 (`brew-shot.mjs`): drawn from the page top, its progress follows the scroll
// both ways, its line under the scene changes with the step, the cup stands on the tray (the still is hidden) and
// lands in section 1's pose; the default cup goes see-through only while the espresso rises.
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 }
]) {
  test(`at ${viewport.width} px the brewing scene runs with the scroll, both ways, and the cup lands in section 1`, async (t) => {
    const { page, stage, errors } = await openHome(t, {}, viewport)
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    const read = () =>
      stage.evaluate((s) => ({
        drawn: s.cupScene?.brew,
        brew: s.dataset.cupBrew ?? null,
        caption: s.querySelector('[data-brew-caption]').textContent,
        shown: getComputedStyle(s.querySelector('[data-brew-caption]')).opacity,
        still: getComputedStyle(s.querySelector('img.cup-stage__still')).visibility
      }))
    const seen = []
    for (const [q, caption] of [
      [0, 'Scroll to pull a shot'],
      [0.2, 'Hot water leaves the boiler'],
      [0.36, 'It presses through the coffee'],
      [0.55, 'Espresso fills the cup'],
      [0.72, 'Flow stops'],
      [0.8, 'Cup out, lid on'],
      [0.95, '']
    ]) {
      await brewTo(page, q)
      const r = await read()
      seen.push(r.drawn)
      t.diagnostic(`${q}: ${JSON.stringify(r)}`)
      assert.ok(Math.abs(r.drawn - q) < 0.01, `drawn at ${q} (${r.drawn})`)
      assert.equal(r.caption, caption, `the line at ${q}`)
      if (caption) assert.ok(Number(r.shown) > 0.5, `the line shows at ${q}`)
      assert.equal(r.still, 'hidden', 'the still never stands in over the brewing scene')
      assert.equal(r.brew, r.drawn.toFixed(4), 'the stage carries the progress')
    }
    // Lands in section 1: no brewing left, the cup in the same pose as when section 1 is reached from below.
    await page.evaluate(() => {
      const top = document.querySelector('[data-section="1"]').getBoundingClientRect().top + scrollY
      scrollTo(0, top - document.querySelector('header').getBoundingClientRect().height)
    })
    await page.waitForTimeout(1600)
    const landed = await read()
    assert.equal(landed.drawn, 1, 'past the brewing scene')
    assert.equal(landed.brew, null)
    const down = await stage.getAttribute('data-cup-motion')
    await toSection(page, 2)
    await page.waitForTimeout(1600)
    await page.evaluate(() => {
      const top = document.querySelector('[data-section="1"]').getBoundingClientRect().top + scrollY
      scrollTo(0, top - document.querySelector('header').getBoundingClientRect().height)
    })
    await page.waitForTimeout(1600)
    assert.equal(await stage.getAttribute('data-cup-motion'), down, 'section 1 from above and from below')
    // And back up: the scene runs backwards to the first frame.
    const back = await brewTo(page, 0.55)
    assert.ok(Math.abs(back - 0.55) < 0.01, 'scrolling back runs the shot backwards')
    assert.equal(await brewTo(page, 0), 0, 'and back to the first frame')
    assert.deepEqual(errors, [])
  })
}

test('in the brewing scene the default cup is see-through only while the espresso rises', async (t) => {
  const { page, stage, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  const paper = () => stage.evaluate((s) => s.cupScene?.paperOpacity)
  const at = {}
  for (const q of [0.2, 0.55, 0.85]) {
    await brewTo(page, q)
    at[q] = await paper()
  }
  t.diagnostic(JSON.stringify(at))
  assert.equal(at[0.2], 1, 'paper before the espresso runs')
  assert.ok(at[0.55] < 0.5, `see-through while it fills (${at[0.55]})`)
  assert.equal(at[0.85], 1, 'paper again once the lid is on')
  assert.deepEqual(errors, [])
})

// WebGL can be lost at any time (driver reset, a tab swapped out). The page then takes the still route; the brewing
// scene's line goes with the scene, so no "Espresso fills the cup" stays in the corner over the sections below.
test('when WebGL is lost in the brewing scene, the still route shows and the scene line goes with it', async (t) => {
  const { page, errors } = await openHome(t)
  await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
  await brewTo(page, 0.5)
  const caption = page.locator('[data-brew-caption]')
  assert.notEqual((await caption.textContent()).trim(), '', 'the brewing scene has a line before the loss')
  await page.evaluate(() =>
    document
      .querySelector('[data-cup-stage] canvas')
      .getContext('webgl2')
      .getExtension('WEBGL_lose_context')
      .loseContext()
  )
  await page.waitForFunction(() => document.querySelector('[data-cup-stage]').dataset.cupRoute === 'still')
  for (const n of [1, 6]) {
    await toSection(page, n)
    await page.waitForTimeout(1200)
    const line = await caption.evaluate((el) => ({
      text: el.textContent,
      shown: el.getBoundingClientRect().height > 0
    }))
    t.diagnostic(`section ${n}: ${JSON.stringify(line)}`)
    assert.deepEqual(line, { text: '', shown: false }, `section ${n}: no brewing line`)
  }
  assert.deepEqual(errors, [])
})

// Without script there is no 3D, so no brewing scene either: the page opens on section 1 under the header, as it did
// before the scene was added, and nothing of the scene's first frame shows.
test('with JavaScript off the page opens on section 1, with no brewing scene above it', async (t) => {
  assert.ok(SITE, 'set SITE to the origin of a running site, e.g. SITE=http://127.0.0.1:4400')
  const { launch: _launch, ...options } = browserChoice()
  const browser = await chromium.launch({ ...options, args: GPU })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false })
  await page.goto(new URL('/', SITE).href, { waitUntil: 'load' })
  const m = await page.evaluate(() => ({
    brew: document.querySelector('[data-brew]').getBoundingClientRect().height,
    header: Math.round(document.querySelector('header').getBoundingClientRect().bottom),
    section1: Math.round(document.querySelector('[data-section="1"]').getBoundingClientRect().top)
  }))
  t.diagnostic(JSON.stringify(m))
  assert.equal(m.brew, 0, 'the brewing scene takes no room')
  assert.ok(
    m.section1 >= 0 && m.section1 <= m.header + 40,
    `section 1 starts under the header (${m.section1})`
  )
  assert.ok(await page.locator('[data-section="1"] h1').isVisible(), 'the shop name is in the first screen')
})
