/**
 * The quickstart preview while its live demo is still loading, driven in a real browser.
 *
 * Measured 30/09 on cowork.tracy.site: Tracy mounts the demo frame ~40–100 ms after the click and
 * asks nothing first, but the demo itself takes 1.2–4.7 s to load on a cold browser cache (a
 * no-store PHP page, 0.5–1.9 s to first byte, plus 2.5–14 MB of pictures) and 0.4–1.3 s on every
 * Light/Dark switch (the page is reloaded with a new `?theme=`, and its HTML is never cached).
 *
 * The first answer (PR #645) laid the layout's picture under a transparent frame and let the demo
 * paint over it; a CDP screencast then showed three pictures in ~2 s (blurry poster, half-painted
 * demo, real demo) — a flicker. Akemi chose option B (30/09): the dialog's own ground with the
 * Tracy mark turning in the centre and "Loading the live demo…" under it, and the frame INVISIBLE
 * until its `load`. Pinned here, on the REAL `TemplateBody` with the plugin's own Tailwind sheet
 * (`fixtures/template-body-page.mjs`), framing a demo that answers only when the test says so
 * (`held`):
 *
 *   - the frame is mounted at once (no request is waited on before it), but is not visible and
 *     takes no clicks while its document has not loaded; a centred loader (mark + text) stands in
 *     its place, and there is no picture and no skeleton;
 *   - a demo that has painted only its first half (`streamed`: a flat ground, no text or pictures)
 *     is still hidden — that is the frame the old version let through;
 *   - once the demo's `load` fires, the loader goes and the frame is visible;
 *   - a Light/Dark switch (a new document) and a device switch hide the frame and show the loader
 *     again until the new document loads — in the phone, the loader is centred in the phone.
 */
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'

import { openHarness, settle, show, templateCard } from '../fixtures/template-body-page.mjs'

let h
let page

before(async () => {
  h = await openHarness()
  page = await h.browser.newPage({ viewport: { width: 1700, height: 900 } })
  await page.goto(`${h.base}/index.html`)
})

after(async () => {
  await h?.close()
})

const props = (over = {}) => ({
  template: templateCard(h.base, { held: true }),
  name: 'Preview',
  device: 'desktop',
  theme: 'light',
  ...over
})

/** What the frame area shows right now. */
const state = () =>
  page.evaluate(() => {
    const q = (sel) => document.querySelector(`#dialog ${sel}`)
    const loader = q('[data-frame-loading]')
    const iframe = q('iframe')
    const shown = (el) => {
      if (!el) return false
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && Number(cs.opacity) > 0
    }
    const centre = (el) => {
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }
    const mark = loader?.querySelector('svg') ?? null
    const frameBox = q('[data-phone-frame]') ?? iframe?.parentElement ?? null
    const iframeStyle = iframe ? getComputedStyle(iframe) : null
    return {
      iframeSrc: iframe?.getAttribute('src') ?? null,
      // Opacity as the browser resolves it once the transition has run; pointer-events too, so a
      // hidden frame cannot swallow a click either.
      iframeOpacity: iframeStyle ? Number(iframeStyle.opacity) : null,
      iframeClickable: iframeStyle ? iframeStyle.pointerEvents !== 'none' : null,
      loader: shown(loader) ? loader.getAttribute('role') : null,
      loaderMounted: loader !== null,
      loaderText: loader?.textContent?.trim() ?? null,
      mark: mark
        ? {
            // The layout size, not the bounding box: a turning square's box grows with its angle.
            width: parseFloat(getComputedStyle(mark).width),
            animation: getComputedStyle(mark).animationName,
            duration: getComputedStyle(mark).animationDuration
          }
        : null,
      // How far the mark's centre is from the frame's centre, horizontally and vertically.
      offCentre:
        mark && frameBox
          ? (() => {
              const a = centre(mark)
              const b = centre(frameBox)
              return { x: Math.round(Math.abs(a.x - b.x)), y: Math.round(Math.abs(a.y - b.y)) }
            })()
          : null,
      // From the mark's centre plus half its layout size: its bounding box grows as it turns.
      markAboveText: mark
        ? centre(mark).y + parseFloat(getComputedStyle(mark).height) / 2 <=
          loader.querySelector('span').getBoundingClientRect().top + 0.5
        : null,
      pictures: document.querySelectorAll('#dialog img').length,
      skeleton:
        document.querySelector('#dialog [data-slot="skeleton"], #dialog [data-frame-skeleton]') !== null
    }
  })

/** Wait until the frame's fade has finished, so the computed opacity is the resting one. */
const faded = () =>
  page.waitForFunction(
    () => {
      const frame = document.querySelector('#dialog iframe')
      return (
        frame !== null &&
        Number(getComputedStyle(frame).opacity) === 1 &&
        document.querySelector('#dialog [data-frame-loading]') === null
      )
    },
    undefined,
    { timeout: 15_000 }
  )

const release = () => page.evaluate((base) => fetch(`${base}/release`), h.base)

async function waitLoaded() {
  await page.waitForFunction(() => {
    const f = document.querySelector('#dialog iframe')
    return f?.contentWindow?.document?.getElementById('page') != null
  })
  await settle(page)
}

/** The loading state every case below expects, whatever the device or theme. */
function assertLoading(s, label) {
  assert.equal(s.loader, 'status', `${label}: a loading status stands in the frame`)
  assert.equal(s.loaderText, 'template.loading', `${label}: and says what it is waiting for`)
  assert.equal(s.iframeOpacity, 0, `${label}: the half-loaded demo is not visible`)
  assert.equal(s.iframeClickable, false, `${label}: nor clickable`)
  assert.equal(s.pictures, 0, `${label}: no picture stands in for the page`)
  assert.equal(s.skeleton, false, `${label}: no skeleton either`)
  assert.equal(s.mark?.width, 56, `${label}: the Tracy mark at the boot cover's size`)
  assert.equal(s.mark?.animation, 'spin', `${label}: turning`)
  assert.equal(s.mark?.duration, '9s', `${label}: one turn per 9 s, like the boot cover`)
  assert.equal(s.markAboveText, true, `${label}: the text sits under the mark`)
  assert.ok(s.offCentre && s.offCentre.x <= 1, `${label}: centred across (${JSON.stringify(s.offCentre)})`)
}

function assertLoaded(s, label) {
  assert.equal(s.loader, null, `${label}: the loader goes once the demo has loaded`)
  assert.equal(
    s.loaderMounted,
    false,
    `${label}: and, its fade done, leaves the page (no mark turning unseen)`
  )
  assert.equal(s.iframeOpacity, 1, `${label}: and the demo is visible`)
  assert.equal(s.iframeClickable, true, `${label}: and usable`)
}

test('first open: the frame mounts at once, hidden behind a centred loader until the demo loads', async () => {
  await show(page, { room: 1200, props: props() })
  const loading = await state()
  assert.match(loading.iframeSrc ?? '', /\/held\.html\?theme=light$/, 'the frame is mounted without waiting')
  assertLoading(loading, 'first open')
  assert.ok(loading.offCentre.y <= 30, `centred down the frame too (${JSON.stringify(loading.offCentre)})`)
  await release()
  await waitLoaded()
  await faded()
  assertLoaded(await state(), 'first open')
})

test('a half-painted demo stays hidden: the frame shows only once the whole document has loaded', async () => {
  await show(page, { room: 1200, props: props({ template: templateCard(h.base, { streamed: true }) }) })
  // The demo's first half has arrived and is laid out inside the frame ...
  await page.waitForFunction(
    () => document.querySelector('#dialog iframe')?.contentWindow?.document?.getElementById('partial') != null
  )
  await settle(page)
  // ... and still none of it is on screen: this is the flat-ground frame the old poster let through.
  assertLoading(await state(), 'half-painted demo')
  await release()
  await waitLoaded()
  await faded()
  assertLoaded(await state(), 'half-painted demo')
})

test('Light/Dark switch: a new document, so the frame hides and the loader shows until it loads', async () => {
  await show(page, { room: 1200, props: props() })
  await release()
  await waitLoaded()
  await faded()
  assertLoaded(await state(), 'before the switch')
  await show(page, { room: 1200, props: props({ theme: 'dark' }) })
  const switching = await state()
  assert.match(switching.iframeSrc ?? '', /theme=dark$/)
  assertLoading(switching, 'dark switch')
  await release()
  await waitLoaded()
  await faded()
  assertLoaded(await state(), 'dark switch')
})

test('device switch: the phone frame loads its own document, with the loader centred in the phone', async () => {
  await show(page, { room: 1200, props: props() })
  await release()
  await waitLoaded()
  await faded()
  await show(page, { room: 1200, props: props({ device: 'mobile' }) })
  const phone = await state()
  assertLoading(phone, 'phone')
  assert.ok(phone.offCentre.y <= 30, `centred down the phone too (${JSON.stringify(phone.offCentre)})`)
  await release()
  await waitLoaded()
  await faded()
  assertLoaded(await state(), 'phone')
})
