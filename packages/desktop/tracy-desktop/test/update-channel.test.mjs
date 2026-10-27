/**
 * Which feed a packaged build follows (`build/update-channel.cjs`): the channel per pinned origin and
 * the `app-update.yml` package.sh writes into the bundle.
 *
 *   node --test packages/desktop/tracy-desktop/test/update-channel.test.mjs
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const plan = require('../build/update-channel.cjs')

test('the production build follows stable, the cowork.tracy.site build follows dev', () => {
  assert.equal(plan.channelForOrigin('https://cowork.tracy.ai'), 'stable')
  assert.equal(plan.channelForOrigin('https://cowork.tracy.site'), 'dev')
  assert.equal(plan.channelForOrigin('https://cowork.tracy.ai/'), 'stable')
})

test('a build pinned to any other origin, or the local dsh, has no channel and never updates itself', () => {
  assert.equal(plan.channelForOrigin('http://tracy.test:8080'), null)
  assert.equal(plan.channelForOrigin('https://cowork.tracy.ai.evil.test'), null)
  assert.equal(plan.channelForOrigin(''), null)
  assert.equal(plan.channelForOrigin(undefined), null)
})

test('app-update.yml names the generic feed, the channel and a cache folder of its own per variant', () => {
  assert.equal(
    plan.appUpdateYml({ channel: 'stable', url: 'https://update.tracy.ai/desktop' }),
    [
      'provider: generic',
      'url: https://update.tracy.ai/desktop',
      'channel: stable',
      'updaterCacheDirName: tracy-cowork-updater',
      ''
    ].join('\n')
  )
  assert.match(
    plan.appUpdateYml({ channel: 'dev', url: 'https://update.tracy.ai/desktop' }),
    /^updaterCacheDirName: tracy-cowork-dev-updater$/m
  )
})

test('app-update.yml refuses a channel it does not know or a feed that is not a URL', () => {
  assert.throws(() => plan.appUpdateYml({ channel: 'beta', url: 'https://update.tracy.ai/desktop' }))
  assert.throws(() => plan.appUpdateYml({ channel: 'stable', url: 'update.tracy.ai/desktop' }))
})

test('feedOf reads back the feed appUpdateYml wrote, and nothing from a file without one', () => {
  assert.equal(
    plan.feedOf(plan.appUpdateYml({ channel: 'dev', url: 'http://127.0.0.1:17910/desktop/' })),
    'http://127.0.0.1:17910/desktop'
  )
  assert.equal(plan.feedOf('provider: generic\nchannel: dev\n'), null)
})

test('each channel has its own feed: stable on update.tracy.ai, dev on update.tracy.site', () => {
  assert.equal(plan.feedFor('stable'), 'https://update.tracy.ai/desktop')
  assert.equal(plan.feedFor('dev'), 'https://update.tracy.site/desktop')
  assert.throws(() => plan.feedFor('beta'), /unknown update channel/)
})

test('the channel file of each platform is the name electron-updater 6.8.9 reads', () => {
  const { channelFile } = plan
  assert.equal(channelFile({ channel: 'stable', platform: 'mac' }), 'stable-mac.yml')
  assert.equal(channelFile({ channel: 'dev', platform: 'mac' }), 'dev-mac.yml')
  // Windows: no platform suffix (Provider.getChannelFilePrefix); one file lists both installers.
  assert.equal(channelFile({ channel: 'stable', platform: 'win' }), 'stable.yml')
  assert.equal(channelFile({ channel: 'dev', platform: 'win' }), 'dev.yml')
  // Linux: one file per arch, x64 without a suffix.
  assert.equal(channelFile({ channel: 'stable', platform: 'linux', arch: 'x64' }), 'stable-linux.yml')
  assert.equal(channelFile({ channel: 'dev', platform: 'linux', arch: 'arm64' }), 'dev-linux-arm64.yml')
  assert.throws(() => channelFile({ channel: 'stable', platform: 'linux' }), /arch/)
  assert.throws(() => channelFile({ channel: 'beta', platform: 'win' }), /channel/)
  assert.throws(() => channelFile({ channel: 'stable', platform: 'android' }), /platform/)
})

test('those names are what electron-updater itself asks for, on each platform and arch', () => {
  const { GenericProvider } = require('../build/electron-updater-entry.cjs')
  const asked = (platform, arch, channel) => {
    const before = process.env.TEST_UPDATER_ARCH
    process.env.TEST_UPDATER_ARCH = arch
    try {
      const provider = new GenericProvider(
        { provider: 'generic', url: 'https://x.test/d' },
        { channel },
        { platform }
      )
      return `${provider.channel}.yml`
    } finally {
      if (before === undefined) delete process.env.TEST_UPDATER_ARCH
      else process.env.TEST_UPDATER_ARCH = before
    }
  }
  for (const channel of ['stable', 'dev']) {
    assert.equal(asked('darwin', 'arm64', channel), plan.channelFile({ channel, platform: 'mac' }))
    for (const arch of ['x64', 'arm64']) {
      assert.equal(asked('win32', arch, channel), plan.channelFile({ channel, platform: 'win' }))
      assert.equal(asked('linux', arch, channel), plan.channelFile({ channel, platform: 'linux', arch }))
    }
  }
})

test('a fork overrides each channel feed, pinned origin and docs host at build time; unset keeps the defaults', () => {
  const custom = plan.channelConfig({
    TRACY_UPDATE_FEED_STABLE: 'https://updates.example.org/desktop/',
    TRACY_APP_ORIGIN_STABLE: 'https://app.example.org',
    TRACY_DOCS_ORIGIN_DEV: 'https://docs-dev.example.org',
    TRACY_UPDATE_FEED_DEV: '  '
  })
  assert.deepEqual(custom.stable, {
    feed: 'https://updates.example.org/desktop',
    origin: 'https://app.example.org',
    docs: 'https://docs.tracy.ai'
  })
  assert.deepEqual(custom.dev, {
    feed: 'https://update.tracy.site/desktop',
    origin: 'https://cowork.tracy.site',
    docs: 'https://docs-dev.example.org'
  })
  assert.deepEqual(plan.channelConfig({}).stable.feed, 'https://update.tracy.ai/desktop')
  assert.throws(() => plan.channelConfig({ TRACY_UPDATE_FEED_DEV: 'updates.example.org' }), /must be a URL/)
})

test('the overrides reach the module itself, the way package.sh reads it through node -p', async () => {
  const { execFileSync } = await import('node:child_process')
  const file = require.resolve('../build/update-channel.cjs')
  const read = (env) =>
    execFileSync(
      process.execPath,
      [
        '-p',
        "const p = require(process.argv[1]); [p.feedFor('stable'), String(p.channelForOrigin('https://app.example.org')), String(p.channelForOrigin('https://cowork.tracy.ai')), p.docsOriginFor('stable')].join(' ')",
        file
      ],
      { env: { PATH: process.env.PATH, ...env } }
    )
      .toString()
      .trim()
  assert.equal(read({}), 'https://update.tracy.ai/desktop null stable https://docs.tracy.ai')
  assert.equal(
    read({
      TRACY_UPDATE_FEED_STABLE: 'https://updates.example.org/desktop',
      TRACY_APP_ORIGIN_STABLE: 'https://app.example.org'
    }),
    'https://updates.example.org/desktop stable null https://docs.tracy.ai'
  )
})
