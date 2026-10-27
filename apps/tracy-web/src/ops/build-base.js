/** Live construction setting, one per CMS. Historical /api/ops/cms snapshots remain immutable. */
import { Hono } from 'hono'
import { baseChoices, readBuildBase, saveBuildBase } from '../lib/build-base.js'
import { readReleases } from '../lib/quickstart-releases.js'
import { loadDesignRegistry } from '../lib/joomla-designs.js'
import { admit, denied } from './admit.js'

/**
 * The platforms this door answers for. An id outside it is 404, not an empty setting: a screen
 * asking about a CMS this build never heard of has a bug, and an empty answer would hide it.
 */
const PLATFORMS = new Set(['joomla', 'wordpress', 'emdash'])

export function buildBaseRoutes({ pool, config, designs = loadDesignRegistry() }) {
  const app = new Hono()
  const endpoint = '/api/ops/build-base/:platform'

  /** @param {string} platform */
  const choicesFor = async (platform) =>
    baseChoices(platform, designs, platform === 'joomla' ? [] : await readReleases(pool, { platform }))

  app.get(endpoint, async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    const platform = c.req.param('platform')
    if (!PLATFORMS.has(platform)) return c.json({ error: 'UNKNOWN_PLATFORM' }, 404)
    c.header('cache-control', 'no-store')
    const choices = await choicesFor(platform)
    // A platform with no archive at this ref has no setting to show. Said out loud, with the reason,
    // rather than drawn as a chooser with nothing in it.
    if (choices.options.length === 0)
      return c.json({
        platform,
        quickstart: null,
        options: [],
        writable: false,
        reason: `No base quickstart in this build restores ${platform}; a new site of this CMS starts from the image, not an archive.`,
        server: new URL(c.req.url).host
      })
    return c.json({
      ...(await readBuildBase(pool, platform, choices)),
      writable: ['owner', 'admin'].includes(who.role),
      server: new URL(c.req.url).host,
      registryRevision: choices.revision,
      options: choices.options
    })
  })

  app.put(endpoint, async (c) => {
    const who = await admit(c, { pool, config })
    if (who === 'sign-in' || who === null) return denied(c, who)
    const platform = c.req.param('platform')
    if (!PLATFORMS.has(platform)) return c.json({ error: 'UNKNOWN_PLATFORM' }, 404)
    if (!['owner', 'admin'].includes(who.role)) return c.body(null, 403)
    if (
      c.req.header('origin') !== config.origin ||
      !c.req.header('content-type')?.startsWith('application/json')
    )
      return c.body(null, 403)
    const body = await c.req.json().catch(() => null)
    if (!body || typeof body.quickstart !== 'string') return c.json({ error: 'INVALID_BASE' }, 400)
    const choices = await choicesFor(platform)
    // Only a generated list can move under a reader, so only a generated list is asserted against.
    if (choices.revision !== null && body.registryRevision !== choices.revision)
      return c.json({ error: 'REGISTRY_CHANGED' }, 409)
    const result = await saveBuildBase(pool, platform, choices, body.quickstart, body.revision, who.email)
    return c.json(result, result.error === 'BASE_CHANGED' ? 409 : result.error ? 400 : 200)
  })

  return app
}
