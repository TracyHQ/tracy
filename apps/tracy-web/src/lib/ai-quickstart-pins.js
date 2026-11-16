/**
 * The pinned AI quickstarts this server ships (#598): the data the build path chooser reads
 * (`website-opportunities/domain` `aiQuickstartPinsOf`). For every template folder `<slug>/<cms>/` under the AI
 * quickstart folder the build chat reads (`build-draft/ai-quickstarts.js` `AI_QUICKSTARTS_DIR`), the pin reader of
 * #588 answers (`resolvePinnedAiQuickstart`: exactly the pinned version, as published, from `pins.json` beside the
 * kits), and the pinned folder's `kit-manifest.json` says what it fits.
 *
 * A template joins by being pinned; no template is named in code. With no pin (an empty `pins.json`) nothing is
 * pinned and every trade takes the current build path. `refused` keeps, per template, the pin reader's codes, so a
 * caller can log why a kit is not offered. Read once: a new image brings new kits and pins.
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { aiQuickstartPinsOf } from 'website-opportunities/domain'
import { resolvePinnedAiQuickstart } from 'website-opportunities/domain/ai-quickstart-pin.mjs'
import { AI_QUICKSTARTS_DIR, KIT_MANIFEST_FILE } from '../build-draft/ai-quickstarts.js'

const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/i

const subdirs = (dir) => {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && SEGMENT.test(e.name))
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * The pinned AI quickstarts of a folder of kits, and why every other template is not one.
 * @param {{root?: string, pins?: Record<string, object>}} [where] `pins`: the pins to use instead of
 *   `<root>/pins.json` (a test's own)
 * @returns {ReturnType<typeof aiQuickstartPinsOf>}
 */
export function readAiQuickstartPins({ root = AI_QUICKSTARTS_DIR, pins } = {}) {
  const templates = subdirs(root).flatMap((slug) =>
    subdirs(path.join(root, slug)).map((cms) => {
      const pin = resolvePinnedAiQuickstart({ root, slug, cms, ...(pins ? { pins } : {}) })
      const manifest = pin.ok ? readJson(path.join(pin.folder, KIT_MANIFEST_FILE)) : null
      return { slug, cms, pin, manifest }
    })
  )
  return aiQuickstartPinsOf({ templates })
}

/** The pinned AI quickstarts alone. @param {{root?: string, pins?: Record<string, object>}} [where] */
export const readPinnedAiQuickstarts = (where) => readAiQuickstartPins(where).pinned

let shipped = null
/** The AI quickstart pins this server ships, read once: `{pinned, refused}`. */
export function shippedAiQuickstartPins() {
  shipped ??= readAiQuickstartPins()
  return shipped
}

/** The pinned AI quickstarts this server ships. */
export const shippedAiQuickstarts = () => shippedAiQuickstartPins().pinned

/**
 * For tests: answer `pins` (`{pinned, refused}`, as `aiQuickstartPinsOf` makes them) instead of the shipped ones
 * until the returned function is called. The shipped `pins.json` stays empty until a kit passes the release gate, so a
 * test of a build that needs a pinned template pins one this way, never in that file.
 * @param {ReturnType<typeof aiQuickstartPinsOf>} pins
 * @returns {() => void} puts the shipped pins back
 */
export function overrideShippedAiQuickstartPins(pins) {
  const before = shipped
  shipped = pins
  return () => {
    shipped = before
  }
}
