import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readConfig, ConfigError } from '../src/config.js'
import { browserRunsOf, demoQaTabsOf, demoReadCacheBytesOf } from '../src/browser-room.js'

const fullEnv = {
  HOST_NAME: 'local',
  HOST_SECRET: 's3cr3t',
  TRACY_SITES_ROOT: '/data/sites',
  TRACY_PRIVATE_ROOT: '/srv/tracy',
  TRACY_FLEET_DIR: '/opt/tracy-fleet'
}

test('readConfig: reads hostName, hostSecret, sitesRoot, privateRoot and scriptsDir from env, and defaults jobsDir/logDir', () => {
  assert.deepEqual(readConfig(fullEnv), {
    hostName: 'local',
    hostSecret: 's3cr3t',
    sitesRoot: '/data/sites',
    privateRoot: '/srv/tracy',
    scriptsDir: '/opt/tracy-fleet',
    siteProxyOrigin: null,
    jobsDir: '/var/lib/tracy-host/jobs',
    logDir: '/var/lib/tracy-host/logs',
    cloudflare: null,
    tunnelMode: null,
    localReleasesDir: null,
    exportOverHttp: false,
    demoInstallSlots: 2,
    demoInstallMinFreeMb: 600,
    browserRuns: browserRunsOf(fullEnv),
    demoQaTabs: demoQaTabsOf(fullEnv),
    demoReadCacheBytes: demoReadCacheBytesOf(fullEnv)
  })
})

test('readConfig: DEMO_INSTALL_SLOTS sets how many demo installs run at once; anything but a positive whole number is 2', () => {
  assert.equal(readConfig({ ...fullEnv, DEMO_INSTALL_SLOTS: '3' }).demoInstallSlots, 3)
  for (const bad of ['0', '-1', '1.5', 'many', ''])
    assert.equal(readConfig({ ...fullEnv, DEMO_INSTALL_SLOTS: bad }).demoInstallSlots, 2, bad)
})

test('readConfig: a backup export may upload over plain http only on a development host', () => {
  assert.equal(readConfig(fullEnv).exportOverHttp, false)
  assert.equal(readConfig({ ...fullEnv, NODE_ENV: 'production' }).exportOverHttp, false)
  assert.equal(readConfig({ ...fullEnv, NODE_ENV: 'development' }).exportOverHttp, true)
})

test('readConfig: TRACY_LOCAL_RELEASES_DIR boots only a development runtime, and only as an absolute path', () => {
  const dev = { ...fullEnv, NODE_ENV: 'development' }
  assert.equal(readConfig({ ...dev, TRACY_LOCAL_RELEASES_DIR: '/x/local' }).localReleasesDir, '/x/local')
  // The image sets no NODE_ENV: a server host with the variable set is refused, not started open.
  for (const env of [
    { ...fullEnv, TRACY_LOCAL_RELEASES_DIR: '/x/local' },
    { ...fullEnv, NODE_ENV: 'production', TRACY_LOCAL_RELEASES_DIR: '/x/local' },
    { ...dev, TRACY_LOCAL_RELEASES_DIR: 'x/local' }
  ])
    assert.throws(
      () => readConfig(env),
      (e) => e instanceof ConfigError && e.key === 'TRACY_LOCAL_RELEASES_DIR'
    )
})

test('readConfig: cloudflare is null when CLOUDFLARE_TOKEN/ACCOUNT/TUNNEL are unset — /_host/address and /_host/go-live answer NOT_CONFIGURED', () => {
  assert.equal(readConfig(fullEnv).cloudflare, null)
})

test('readConfig: cloudflare is populated only when all three of TOKEN/ACCOUNT/TUNNEL are set', () => {
  const config = readConfig({
    ...fullEnv,
    CLOUDFLARE_TOKEN: 'cf-tok',
    CLOUDFLARE_ACCOUNT: 'acct-1',
    CLOUDFLARE_TUNNEL: 'tun-1'
  })
  assert.deepEqual(config.cloudflare, { token: 'cf-tok', account: 'acct-1', tunnel: 'tun-1' })
})

test('readConfig: cloudflare stays null when only some of TOKEN/ACCOUNT/TUNNEL are set', () => {
  const config = readConfig({ ...fullEnv, CLOUDFLARE_TOKEN: 'cf-tok' })
  assert.equal(config.cloudflare, null)
})

test('readConfig: never produces a seatSecret field — tracy-host holds no seat secret', () => {
  const config = readConfig(fullEnv)
  assert.equal('seatSecret' in config, false)
})

test('readConfig: TRACY_HOST_JOBS_DIR / TRACY_HOST_LOG_DIR override the defaults when set', () => {
  const config = readConfig({
    ...fullEnv,
    TRACY_HOST_JOBS_DIR: '/tmp/jobs',
    TRACY_HOST_LOG_DIR: '/tmp/logs'
  })
  assert.equal(config.jobsDir, '/tmp/jobs')
  assert.equal(config.logDir, '/tmp/logs')
})

for (const key of ['HOST_NAME', 'HOST_SECRET', 'TRACY_SITES_ROOT', 'TRACY_PRIVATE_ROOT', 'TRACY_FLEET_DIR']) {
  test(`readConfig: throws ConfigError when ${key} is missing`, () => {
    const { [key]: _omit, ...rest } = fullEnv
    assert.throws(() => readConfig(rest), ConfigError)
  })

  test(`readConfig: throws ConfigError when ${key} is empty`, () => {
    assert.throws(() => readConfig({ ...fullEnv, [key]: '' }), ConfigError)
  })
}

test('readConfig: DEMO_INSTALL_MIN_FREE_MB sets the free-memory floor of a demo install; 0 turns it off, bad values give 600', () => {
  assert.equal(readConfig({ ...fullEnv, DEMO_INSTALL_MIN_FREE_MB: '800' }).demoInstallMinFreeMb, 800)
  assert.equal(readConfig({ ...fullEnv, DEMO_INSTALL_MIN_FREE_MB: '0' }).demoInstallMinFreeMb, 0)
  for (const bad of ['-1', '1.5', 'lots', ''])
    assert.equal(readConfig({ ...fullEnv, DEMO_INSTALL_MIN_FREE_MB: bad }).demoInstallMinFreeMb, 600, bad)
})

test('readConfig: TRACY_TUNNEL=catch-all is a shard host whose tunnel sends every name to tracy-web; none or empty is no mode', () => {
  assert.equal(readConfig({ ...fullEnv, TRACY_TUNNEL: 'catch-all' }).tunnelMode, 'catch-all')
  for (const value of ['', 'none', undefined])
    assert.equal(readConfig({ ...fullEnv, TRACY_TUNNEL: value }).tunnelMode, null)
  assert.throws(() => readConfig({ ...fullEnv, TRACY_TUNNEL: 'all' }), ConfigError)
  assert.throws(
    () =>
      readConfig({
        ...fullEnv,
        TRACY_TUNNEL: 'catch-all',
        CLOUDFLARE_TOKEN: 't',
        CLOUDFLARE_ACCOUNT: 'a',
        CLOUDFLARE_TUNNEL: 'u'
      }),
    ConfigError
  )
})

test('the browser proxy origin comes only from the fixed stack origin setting', () => {
  assert.equal(
    readConfig({ ...fullEnv, TRACY_WEB_ORIGIN: 'http://tracy-web:51710/' }).siteProxyOrigin,
    'http://tracy-web:51710'
  )
  for (const value of [
    'http://user:secret@web',
    'http://web/path',
    'http://web?site=other',
    'file:///tmp/web'
  ]) {
    assert.throws(
      () => readConfig({ ...fullEnv, TRACY_WEB_ORIGIN: value }),
      (error) => error instanceof ConfigError && error.key === 'TRACY_WEB_ORIGIN'
    )
  }
})
