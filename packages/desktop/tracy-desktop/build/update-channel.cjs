/**
 * Which feed a PACKAGED build follows — decided at package time, never at run time: `build/package.sh`
 * writes `Contents/Resources/app-update.yml` and `Contents/Resources/app/update-channel` from this, and
 * the running app reads only those two files (so `src/` holds no Tracy address; gate `origins`).
 *
 *   node -p "require('./build/update-channel.cjs').channelForOrigin('https://cowork.tracy.ai')"
 */

/**
 * The defaults: the feed each channel's published builds read (every platform's channel file,
 * `channelFile`, sits right under it), the origin a build is pinned to for that channel, and the
 * channel's documentation host. Two hosts, two buckets: stable is `tracy-releases` behind
 * update.tracy.ai (prod), dev is `tracy-releases-dev` behind update.tracy.site (the dev host) — so a
 * dev release never touches production.
 */
const DEFAULTS = Object.freeze({
  stable: {
    feed: 'https://update.tracy.ai/desktop',
    origin: 'https://cowork.tracy.ai',
    docs: 'https://docs.tracy.ai'
  },
  dev: {
    feed: 'https://update.tracy.site/desktop',
    origin: 'https://cowork.tracy.site',
    docs: 'https://docs.tracy.site'
  }
})

/**
 * Build-time overrides, so a fork packages against its own servers without editing this file:
 * `TRACY_UPDATE_FEED_<CHANNEL>`, `TRACY_APP_ORIGIN_<CHANNEL>`, `TRACY_DOCS_ORIGIN_<CHANNEL>`
 * (`<CHANNEL>` = `STABLE` or `DEV`). Empty or unset keeps the default above.
 * @param {Record<string, string | undefined>} env
 */
function channelConfig(env) {
  /** @type {Record<string, { feed: string, origin: string, docs: string }>} */
  const out = {}
  for (const [channel, d] of Object.entries(DEFAULTS)) {
    const pick = (name, fallback) => {
      const value = (env[`${name}_${channel.toUpperCase()}`] ?? '').trim()
      if (!value) return fallback
      if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(value))
        throw new Error(`${name}_${channel.toUpperCase()} must be a URL: ${value}`)
      return value.replace(/\/+$/, '')
    }
    out[channel] = Object.freeze({
      feed: pick('TRACY_UPDATE_FEED', d.feed),
      origin: pick('TRACY_APP_ORIGIN', d.origin),
      docs: pick('TRACY_DOCS_ORIGIN', d.docs)
    })
  }
  return Object.freeze(out)
}

const CONFIG = channelConfig(process.env)
const UPDATE_FEEDS = Object.freeze(Object.fromEntries(Object.entries(CONFIG).map(([c, v]) => [c, v.feed])))

/**
 * @param {string} channel - `stable` or `dev`.
 * @returns {string} the feed that channel's published builds read.
 */
function feedFor(channel) {
  if (!Object.hasOwn(UPDATE_FEEDS, channel)) throw new Error(`unknown update channel: ${channel}`)
  return UPDATE_FEEDS[channel]
}

/**
 * The two channels that have a feed, keyed by the origin the build is pinned to. Any other origin —
 * a stand, a laptop, the local dsh — gets no channel: the standard Dev zip would overwrite its
 * pinned `origin` file with cowork.tracy.site's (council 09/10).
 */
const CHANNEL_BY_ORIGIN = new Map(Object.entries(CONFIG).map(([c, v]) => [v.origin, c]))

/** The updater's download cache folder per channel, so the two variants never share one. */
const CACHE_DIR = { stable: 'tracy-cowork-updater', dev: 'tracy-cowork-dev-updater' }

/**
 * @param {string | undefined} origin - the origin pinned into the bundle.
 * @returns {'stable' | 'dev' | null}
 */
function channelForOrigin(origin) {
  if (typeof origin !== 'string') return null
  return CHANNEL_BY_ORIGIN.get(origin.replace(/\/+$/, '')) ?? null
}

/**
 * `Contents/Resources/app-update.yml`, the file electron-builder would write. Written by
 * `build/package.sh` BEFORE signing, so the signature seals it.
 * @param {{ channel: string, url: string }} input
 * @returns {string}
 */
function appUpdateYml({ channel, url }) {
  if (!(channel in CACHE_DIR)) throw new Error(`unknown update channel: ${channel}`)
  if (!/^https?:\/\/[^\s/]+(\/\S*)?$/.test(url)) throw new Error(`update feed must be a URL: ${url}`)
  return [
    'provider: generic',
    `url: ${url.replace(/\/+$/, '')}`,
    `channel: ${channel}`,
    `updaterCacheDirName: ${CACHE_DIR[channel]}`,
    ''
  ].join('\n')
}

/**
 * The feed an `app-update.yml` names — the reader of what `appUpdateYml` writes, for the release
 * tooling that checks a built bundle.
 * @param {string} yml
 * @returns {string | null}
 */
function feedOf(yml) {
  return /^url:\s*(\S+)\s*$/m.exec(yml)?.[1] ?? null
}

/** The platforms a release ships for, as the manifest and the artifact names say them. */
const PLATFORMS = Object.freeze(['mac', 'win', 'linux'])

/**
 * The channel file a platform's builds read under the feed — the name electron-updater 6.8.9's
 * generic provider asks for (`Provider.getChannelFilePrefix`): `-mac` on macOS, nothing on Windows
 * (one file lists the x64 and arm64 installers; NsisUpdater picks by `process.arch` in the name), and
 * `-linux` plus `-<arch>` for any arch but x64 on Linux (one file per arch).
 * @param {{ channel: string, platform: string, arch?: string }} input
 * @returns {string}
 */
function channelFile({ channel, platform, arch }) {
  if (!(channel in CACHE_DIR)) throw new Error(`unknown update channel: ${channel}`)
  if (platform === 'mac') return `${channel}-mac.yml`
  if (platform === 'win') return `${channel}.yml`
  if (platform === 'linux') {
    if (arch !== 'x64' && arch !== 'arm64')
      throw new Error(`a Linux channel file is per arch (x64, arm64), got: ${arch}`)
    return arch === 'x64' ? `${channel}-linux.yml` : `${channel}-linux-${arch}.yml`
  }
  throw new Error(`unknown platform: ${platform}`)
}

/**
 * The documentation host of each channel: where the changelog page a release links to is served
 * (release.mjs publish checks it before a feed moves; package.sh writes it into the bundle).
 */
const DOCS_ORIGINS = Object.freeze(Object.fromEntries(Object.entries(CONFIG).map(([c, v]) => [c, v.docs])))

/** @param {'stable' | 'dev'} channel */
function docsOriginFor(channel) {
  if (!Object.hasOwn(DOCS_ORIGINS, channel)) throw new Error(`unknown update channel: ${channel}`)
  return DOCS_ORIGINS[channel]
}

module.exports = {
  channelConfig,
  feedFor,
  docsOriginFor,
  channelForOrigin,
  appUpdateYml,
  feedOf,
  channelFile,
  PLATFORMS
}
