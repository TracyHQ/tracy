/**
 * The animated scenes of the first-run "Welcome to Tracy" popup (`@tracy/dsh-onboard`,
 * `packages/ui/tracy-onboard/src/client/Welcome.tsx`).
 *
 * WHY HERE AND NOT IN THE PLUGIN. dsh serves a plugin's `lib/client.js` and its `client.*.js` chunks,
 * nothing else (`@deepseek-ai/client-modules` `CLIENT_CHUNK`), and the scenes are a small static site
 * of their own: two HTML pages, their scripts and styles, pictures and fonts (~5 MB). Inlined into
 * the plugin they would be megabytes of base64 every page downloads; served from here they load
 * only inside the popup's frame, so only for an account that has not seen it yet. Same origin as the
 * dsh page on every surface (tracy-web fronts it), and the desktop app shows the same page.
 *
 * WHAT IS SERVED. `scenes/` as it is, plus the 1 223 design system cards of the Add site scenes
 * (`addsite/img/systems/<uuid>.webp`), which are byte for byte the library's own thumbnails: they are
 * read from `@tracy/ds-slot`'s `refero-thumbs/` through `referoScreenshotPath` instead of a second
 * 14 MB copy. A uuid the library no longer offers answers 404 and the card shows no picture.
 *
 * WHO MAY READ IT. A signed-in account only: the scenes carry Tracy's own unreleased showcase
 * material (TracyHQ/tracy-ai-hero-showcase), so they are not a public page. Only Tracy's own pages
 * may frame them (`frame-ancestors 'self'`).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Hono } from 'hono'
import { referoScreenshotPath } from '../lib/ds-slot.js'
import { json, requireViewer } from '../lib/http.js'

/** Where the popup's frame finds the scenes (the plugin names the same prefix). */
export const WELCOME_SCENES_PATH = '/welcome/scenes/'

const ROOT = fileURLToPath(new URL('./scenes/', import.meta.url))

/** The file types the scenes are made of; anything else is not served. */
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2'
})

/** A design system card of the Add site scenes, by library uuid. */
const SYSTEM_PICTURE =
  /^addsite\/img\/systems\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.webp$/

/** Path segments that start with a letter or digit: no `..`, no hidden files, no empty segment. */
const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

/**
 * What the scenes load: their own files, inline style attributes their scripts write, pictures and
 * fonts from here. Nothing from another origin, and nobody else may frame them.
 */
const SCENE_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'"
].join('; ')

/**
 * The file `relative` names under the scenes, or null when it is not one of them.
 * @param {string} relative - the request path after {@link WELCOME_SCENES_PATH}
 * @returns {Promise<string | null>}
 */
export async function sceneFile(relative) {
  const picture = SYSTEM_PICTURE.exec(relative)
  if (picture) return referoScreenshotPath(picture[1])
  if (!SAFE_PATH.test(relative) || !(path.extname(relative) in TYPES)) return null
  const file = path.join(ROOT, relative)
  return file.startsWith(ROOT) ? file : null
}

/** @param {{config: {sessionSecret: string}}} deps */
export function welcomeSceneRoutes({ config }) {
  const app = new Hono()

  app.get(`${WELCOME_SCENES_PATH}*`, async (c) => {
    const email = await requireViewer(c, config)
    if (email instanceof Response) return email
    let relative = ''
    try {
      relative = decodeURIComponent(c.req.path.slice(WELCOME_SCENES_PATH.length))
    } catch {
      return json(c, { code: 'NOT_FOUND' }, 404)
    }
    const file = await sceneFile(relative)
    const bytes = file ? await readFile(file).catch(() => null) : null
    if (!file || !bytes) return json(c, { code: 'NOT_FOUND' }, 404)
    return c.body(bytes, 200, {
      'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
      'cache-control': 'private, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
      'content-security-policy': SCENE_POLICY
    })
  })

  return app
}
