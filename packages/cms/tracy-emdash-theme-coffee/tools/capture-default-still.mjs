#!/usr/bin/env node
// Draw the still image shown in place of the 3D cup (reduced motion, no WebGL, data saver): the
// default cup, plain sleeve, on a transparent background, in the pose the page starts with.
//
//   node tools/capture-default-still.mjs <origin of a running site> [--out src/assets/default-cup-still.webp]
//
// The picture is taken from the page's own canvas, so it cannot drift from the scene: the page
// is opened in the browser Base pins (`qa-browser.mjs`) with the GPU on, the intro and idle sway
// are held at their rest pose (clock fixed, so the cup stands at full size in section 1's lean and
// turn), the page is asked for that pose centred at the still image's share (`window.__cupCapture`,
// `src/lib/home-scroll.mjs` STILL_SHARE) with the sleeve left plain (`CupStage.astro` prints no shop
// name under `__cupCapture`: the still fades into the named 3D cup), on the espresso side the site opens
// on (`?theme=dark`; its soft shadow, the stage's background colour, reads on the cream side too), and the WebGL
// canvas is read back as PNG, cut to its centred square and turned into WebP. Run it again whenever the default cup or the
// scene's first pose changes, then rebuild / `tracy-dev sync` the site so the page picks it up.
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { browserChoice } from './qa-browser.mjs'

const GPU = ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist']
// The scene sways by sin(now * 0.55 / 1000); pi / 0.55 s is the first instant that sway is zero.
const REST_MS = (Math.PI / 0.55) * 1000

// Runs before the page's scripts. Keeps the drawing buffer so the canvas can be read back, and
// pins both clocks the scene reads so the first frame shown is the rest pose.
function holdRestPose(restMs) {
  const getContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    return getContext.call(this, type, /webgl/.test(type) ? { ...attrs, preserveDrawingBuffer: true } : attrs)
  }
  performance.now = () => 0
  window.__cupCapture = true
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(restMs), 16)
}

/** @returns {Promise<Buffer>} the WebP bytes */
export async function captureDefaultStill(
  site,
  { viewport = { width: 1440, height: 900 }, theme = 'dark' } = {}
) {
  const { chromium } = await import('playwright')
  const { launch: _launch, ...options } = browserChoice()
  const browser = await chromium.launch({ ...options, args: GPU })
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
    await page.addInitScript(holdRestPose, REST_MS)
    await page.goto(new URL(`/?theme=${theme}`, site).href, { waitUntil: 'load' })
    const stage = page.locator('[data-cup-stage]')
    await stage.waitFor()
    await page.waitForFunction(() => document.querySelector('[data-cup-stage]')?.dataset.cupRoute)
    const fields = JSON.parse((await stage.getAttribute('data-cup-fields')) ?? '{}')
    if (fields.model)
      throw new Error('the home page "Cup model" field is filled: empty it so the default cup is drawn')
    const route = await stage.getAttribute('data-cup-route')
    if (route !== '3d')
      throw new Error(
        `the page took the "${route}" route, not 3d (is the GPU on and the default cup served?)`
      )
    await stage.scrollIntoViewIfNeeded()
    await page.waitForSelector('[data-cup-stage].is-ready canvas', { timeout: 60000 })
    await page.waitForTimeout(500) // a few frames at the rest pose
    const dataUrl = await page.evaluate(() =>
      document.querySelector('[data-cup-stage] canvas').toDataURL('image/png')
    )
    const png = Buffer.from(dataUrl.split(',')[1], 'base64')
    // The scene frames the cup against the stage's shorter side, so the centred square of the
    // canvas holds the cup at the same share as the live scene; the page sizes the image to the
    // stage's shorter side (CupStage.astro), which puts the still cup where the 3D cup stands.
    const { width, height } = await sharp(png).metadata()
    const side = Math.min(width, height)
    const square = {
      left: Math.round((width - side) / 2),
      top: Math.round((height - side) / 2),
      width: side,
      height: side
    }
    return sharp(png).extract(square).webp({ quality: 90, alphaQuality: 100 }).toBuffer()
  } finally {
    await browser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf('--out')
  const out = outIndex >= 0 ? args[outIndex + 1] : 'src/assets/default-cup-still.webp'
  const site = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--out')
  if (!site) {
    console.error('usage: node tools/capture-default-still.mjs <origin of a running site> [--out <file>]')
    process.exit(2)
  }
  const bytes = await captureDefaultStill(site)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`wrote ${out} (${bytes.length} bytes)`)
}
