import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, readConfig } from '../src/config.js'

const base = {
  TRACY_ORIGIN: 'http://localhost:8080/',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://127.0.0.1:8090',
  HOST_local_DSH_ORIGIN: 'http://127.0.0.1:51790',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}

test('real Invitations needs a private key directory and an explicit local/dev origin, independently of sandbox', () => {
  assert.deepEqual(readConfig(base).invitationsReal, { enabled: false, keyRoot: null })
  const setting = { INVITATIONS_REAL_KEY_DIR: '/var/lib/tracy/invitations-real-keys' }
  assert.equal(readConfig({ ...base, ...setting, TRACY_ENVIRONMENT: 'local' }).invitationsReal.enabled, true)
  assert.equal(
    readConfig({
      ...base,
      ...setting,
      TRACY_ENVIRONMENT: 'dev',
      TRACY_ORIGIN: 'https://cowork.tracy.site',
      NODE_ENV: 'production'
    }).invitationsReal.enabled,
    true
  )
  for (const environment of ['production', 'prod', 'staging', 'unknown', '']) {
    assert.equal(
      readConfig({ ...base, ...setting, TRACY_ENVIRONMENT: environment }).invitationsReal.enabled,
      false
    )
  }
  for (const origin of [
    'https://cowork.tracy.ai',
    'https://cowork.tracy.site.attacker.test',
    'https://cowork.tracy.site/elsewhere'
  ]) {
    assert.equal(
      readConfig({ ...base, ...setting, TRACY_ENVIRONMENT: 'dev', TRACY_ORIGIN: origin }).invitationsReal
        .enabled,
      false
    )
  }
  for (const keyRoot of ['/', '../vault', '/tmp/../vault'])
    assert.throws(() => readConfig({ ...base, INVITATIONS_REAL_KEY_DIR: keyRoot }), ConfigError)
})

test('invitations sandbox requires explicit dev/local deployment and closes production', () => {
  assert.equal(readConfig(base).invitationsSandbox, false)
  assert.equal(
    readConfig({ ...base, INVITATIONS_SANDBOX_ENABLED: '1', TRACY_ENVIRONMENT: 'local' }).invitationsSandbox,
    true
  )
  assert.equal(
    readConfig({
      ...base,
      INVITATIONS_SANDBOX_ENABLED: '1',
      TRACY_ENVIRONMENT: 'dev',
      TRACY_ORIGIN: 'https://cowork.tracy.site',
      NODE_ENV: 'production'
    }).invitationsSandbox,
    true
  )
  for (const environment of ['prod', 'production', 'staging', '', 'unknown']) {
    assert.throws(
      () => readConfig({ ...base, INVITATIONS_SANDBOX_ENABLED: '1', TRACY_ENVIRONMENT: environment }),
      ConfigError
    )
  }
  assert.throws(
    () =>
      readConfig({
        ...base,
        INVITATIONS_SANDBOX_ENABLED: '1',
        TRACY_ENVIRONMENT: 'dev',
        TRACY_ORIGIN: 'https://cowork.tracy.ai'
      }),
    ConfigError
  )
})

test('Invitations Gmail needs its own complete client and encryption key', () => {
  const enabled = { ...base, INVITATIONS_SANDBOX_ENABLED: '1', TRACY_ENVIRONMENT: 'local' }
  assert.throws(() => readConfig({ ...enabled, INVITATIONS_GMAIL_CLIENT_ID: 'client' }), ConfigError)
  assert.throws(() => readConfig({ ...enabled, INVITATIONS_GMAIL_KEY: 'not-a-32-byte-key' }), ConfigError)
  const gmail = readConfig({
    ...enabled,
    INVITATIONS_GMAIL_CLIENT_ID: 'client',
    INVITATIONS_GMAIL_CLIENT_SECRET: 'secret',
    INVITATIONS_GMAIL_KEY_ID: 'key-v1',
    INVITATIONS_GMAIL_KEY: Buffer.alloc(32, 7).toString('base64'),
    INVITATIONS_GMAIL_ADDRESS: 'Sender@Example.com'
  }).invitationsGmail
  assert.equal(gmail.clientId, 'client')
  assert.equal(gmail.keyId, 'key-v1')
  assert.equal(gmail.address, 'sender@example.com')
  assert.throws(
    () =>
      readConfig({
        ...enabled,
        INVITATIONS_GMAIL_CLIENT_ID: 'client',
        INVITATIONS_GMAIL_CLIENT_SECRET: 'secret',
        INVITATIONS_GMAIL_KEY_ID: 'key-v1',
        INVITATIONS_GMAIL_KEY: Buffer.alloc(32, 7).toString('base64')
      }),
    ConfigError,
    'the sending mailbox is a setting, not a constant in the code'
  )
})

test('empty means off: no mail key is the console transport, no session domain is host-only', () => {
  const c = readConfig({ ...base, MAIL: '', SESSION_DOMAIN: '', DATABASE_URL: '' })
  assert.equal(c.origin, 'http://localhost:8080')
  assert.equal(c.secure, false)
  assert.deepEqual(c.mail, { kind: 'console' })
  assert.equal(c.sessionDomain, null)
  assert.equal(c.databaseUrl, null)
  assert.equal(c.commentPicker, false)
  assert.equal(c.commentPickerInsecureDev, false)
  assert.equal(c.discord, null)
  assert.equal(c.readinessDir, null, 'the Customize your site check uses the system temporary folder')
  assert.equal(c.apifyToken, null, 'no Apify token: social sources report credential_missing')
  assert.equal(c.serpapiApiKey, null)
  assert.equal(
    readConfig({ ...base, SERPAPI_API_KEY: 'test-private-serpapi' }).serpapiApiKey,
    'test-private-serpapi'
  )
  assert.equal(c.litescrapeApiKey, null, 'no Litescrape key: no TripAdvisor calls')
  assert.equal(
    readConfig({ ...base, LITESCRAPE_API_KEY: 'test-private-litescrape' }).litescrapeApiKey,
    'test-private-litescrape'
  )
  assert.equal(c.localStand, true, 'plain http on localhost outside production is a stand on this machine')
  assert.deepEqual(Object.keys(c).sort(), [
    'actorSecret',
    'apiKeyPepper',
    'apiOrigin',
    'apifyToken',
    'artifactStore',
    'backupExport',
    'badgeUrl',
    'beta',
    'ciToken',
    'commentPicker',
    'commentPickerInsecureDev',
    'csTelegram',
    'customHostnames',
    'databaseUrl',
    'deepseekApiKey',
    'defaultHost',
    'demoHost',
    'demoHosts',
    'demoTargets',
    'deploymentRole',
    'desktopDownloadUrl',
    'discord',
    'dnsResolver',
    'docsOrigin',
    'environment',
    'firecrawlApiKey',
    'github',
    'googleApiKey',
    'guestSiteKey',
    'hostName',
    'hostOrg',
    'hosts',
    'invitationsGmail',
    'invitationsReal',
    'invitationsSandbox',
    'invitationsSending',
    'jinaApiKey',
    'joomlartSso',
    'litescrapeApiKey',
    'localAccess',
    'localLoginPreview',
    'localReleasesDir',
    'localReview',
    'localStand',
    'mail',
    'mcpChallenge',
    'mcpOrigin',
    'model',
    'oauth',
    'onboardingHome',
    'origin',
    'ownDomainLabels',
    'ownDomainProbe',
    'placeMediaStore',
    'rapidapiKey',
    'readinessDir',
    'releaseStore',
    'releasesToken',
    'scrapeCreatorsApiKey',
    'seatPlanKek',
    'secure',
    'serpapiApiKey',
    'sessionCookieName',
    'sessionDomain',
    'sessionSecret',
    'shard',
    'shardAdoptAllow',
    'shardDns',
    'shardSeed',
    'siteAccessDir',
    'siteAddressPrefix',
    'siteDomain',
    'siteDomainAliases',
    'siteHttpPort',
    'siteMail',
    'sourceRepo',
    'speech',
    'speechSttMaxConcurrent',
    'telegram',
    'templatesPublicOrigin',
    'turnstileDisabled',
    'turnstileSecret',
    'updateOrigin',
    'usageTextReaders',
    'woPlacesIngest',
    'woSharedResearch',
    'woSiteReadTls',
    'woSocialKeyPepper',
    'woSocialOrigin',
    'woSocialRole',
    'woSocialToken'
  ])
  assert.deepEqual(c.ownDomainProbe, {})
  assert.equal(c.woSiteReadTls, false, 'the site read stays on Node unless WO_SITE_READ_TLS is set')
  assert.equal(c.hostName, null)
  assert.equal(c.artifactStore, null)
  assert.equal(c.github, null)
  assert.deepEqual(c.oauth, {})
  assert.equal(c.joomlartSso, null)
  assert.equal(c.guestSiteKey, null)
  assert.equal(c.model, null)
  assert.equal(c.speech, null, 'no speech key: voice input is off')
  assert.equal(c.speechSttMaxConcurrent, 4, 'four voice sessions at once per speech service by default')
  assert.equal(c.turnstileSecret, null)
  assert.equal(c.turnstileDisabled, false)
  // The seat pill is served by this app itself since 19/09; the default is its own door.
  assert.equal(c.badgeUrl, 'http://localhost:8080/badge.js')
  // Task 11: one GitHub org in every deployment — a default, not `need()`.
  assert.equal(c.hostOrg, 'TracyHQ')
  assert.deepEqual(c.siteDomainAliases, [])
  assert.equal(c.siteHttpPort, '8080')
})

test('siteDomainAliases and the two company-fact defaults are overridable', () => {
  const c = readConfig({
    ...base,
    DATABASE_URL: '',
    SITE_DOMAIN_ALIASES: 'tracy.test, other.example',
    HOST_ORG: 'TracyHQ-dev',
    BADGE_URL: 'https://dev.tracy.ai/dashboard/badge.js',
    SITE_HTTP_PORT: '9090'
  })
  assert.deepEqual(c.siteDomainAliases, ['tracy.test', 'other.example'])
  assert.equal(c.hostOrg, 'TracyHQ-dev')
  assert.equal(c.badgeUrl, 'https://dev.tracy.ai/dashboard/badge.js')
  assert.equal(c.siteHttpPort, '9090')
})

// ADR 0019: no customer page may call the retired Worker's badge script. A host env file that
// still names it (dev on 01/10, production on 19/09) must not beat the switch-aware default.
test('a BADGE_URL naming the retired Worker script is ignored, with a warning', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  for (const retired of [
    'https://tracy.ai/dashboard/badge.js',
    'http://tracy.ai/dashboard/badge.js',
    'https://TRACY.AI/dashboard/badge.js',
    'https://tracy.ai/dashboard/badge.js/',
    'https://tracy.ai/dashboard/badge.js?v=3',
    'https://tracy.ai:443/dashboard/badge.js#x',
    '//tracy.ai/dashboard/badge.js'
  ]) {
    const c = readConfig({ ...base, DATABASE_URL: '', BADGE_URL: retired })
    assert.equal(c.badgeUrl, 'http://localhost:8080/badge.js', retired)
  }
  assert.equal(warn.mock.callCount(), 7)
  assert.match(warn.mock.calls[0].arguments[0], /BADGE_URL.*https:\/\/tracy\.ai\/dashboard\/badge\.js/)
})

test('any other explicit BADGE_URL is kept, and unset falls back to this origin', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  for (const kept of [
    'https://cdn.example.com/badge.js',
    'https://tracy.ai/badge.js',
    'https://www.tracy.ai/dashboard/badge.js',
    'https://cowork.tracy.site/badge.js'
  ]) {
    assert.equal(readConfig({ ...base, DATABASE_URL: '', BADGE_URL: kept }).badgeUrl, kept)
  }
  assert.equal(readConfig({ ...base, DATABASE_URL: '' }).badgeUrl, 'http://localhost:8080/badge.js')
  assert.equal(
    readConfig({ ...base, DATABASE_URL: '', BADGE_URL: '' }).badgeUrl,
    'http://localhost:8080/badge.js'
  )
  assert.equal(warn.mock.callCount(), 0)
})

test('oauth is independent per provider: either, both, or neither', () => {
  const none = readConfig({ ...base, DATABASE_URL: '' })
  assert.deepEqual(none.oauth, {})
  const googleOnly = readConfig({
    ...base,
    DATABASE_URL: '',
    GOOGLE_OAUTH_CLIENT_ID: 'g-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret'
  })
  assert.deepEqual(googleOnly.oauth, { google: { id: 'g-id', secret: 'g-secret' } })
  // Half a provider (id with no secret, or vice versa) is the same as neither — an OAuth app that
  // can start a redirect but never exchange a code is worse than no button at all.
  const halfGoogle = readConfig({ ...base, DATABASE_URL: '', GOOGLE_OAUTH_CLIENT_ID: 'g-id' })
  assert.deepEqual(halfGoogle.oauth, {})
  const both = readConfig({
    ...base,
    DATABASE_URL: '',
    GOOGLE_OAUTH_CLIENT_ID: 'g-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
    GITHUB_OAUTH_CLIENT_ID: 'gh-id',
    GITHUB_OAUTH_CLIENT_SECRET: 'gh-secret'
  })
  assert.deepEqual(both.oauth, {
    google: { id: 'g-id', secret: 'g-secret' },
    github: { id: 'gh-id', secret: 'gh-secret' }
  })
})

test('joomlart sso: both variables light the door, neither turns it off, one alone is a ConfigError', () => {
  const off = readConfig({ ...base, DATABASE_URL: '' })
  assert.equal(off.joomlartSso, null)
  const on = readConfig({
    ...base,
    DATABASE_URL: '',
    JOOMLART_SSO_URL: 'https://www.joomlart.com/member/sso/v1/authorize',
    JOOMLART_SSO_SECRET: 'shared-secret',
    JOOMLART_SSO_CLIENT: 'tracy-dev'
  })
  assert.deepEqual(on.joomlartSso, {
    authorizeUrl: 'https://www.joomlart.com/member/sso/v1/authorize',
    secret: 'shared-secret',
    client: 'tracy-dev'
  })
  // Half a door is not "off": a URL with no secret would redirect a person to aMember and then be
  // unable to verify what comes back, so the deployment is told at boot instead.
  assert.throws(
    () =>
      readConfig({
        ...base,
        DATABASE_URL: '',
        JOOMLART_SSO_URL: 'https://www.joomlart.com/member/sso/v1/authorize'
      }),
    (error) => error instanceof ConfigError && error.key === 'JOOMLART_SSO_SECRET'
  )
  assert.throws(
    () => readConfig({ ...base, DATABASE_URL: '', JOOMLART_SSO_SECRET: 'shared-secret' }),
    (error) => error instanceof ConfigError && error.key === 'JOOMLART_SSO_URL'
  )
  assert.throws(
    () =>
      readConfig({
        ...base,
        DATABASE_URL: '',
        TRACY_ORIGIN: 'https://cowork.tracy.site',
        JOOMLART_SSO_URL: 'http://www.joomlart.com/sso',
        JOOMLART_SSO_SECRET: 'x'
      }),
    (error) => error instanceof ConfigError && error.key === 'JOOMLART_SSO_URL'
  )
})

test('a local HTTP stand may point JOOMLART_SSO_URL at a fake aMember on loopback', () => {
  const config = readConfig({
    ...base,
    DATABASE_URL: '',
    TRACY_ORIGIN: 'http://sso.tracy.test:45080',
    JOOMLART_SSO_URL: 'http://host.docker.internal:45900/sso/v1/authorize',
    JOOMLART_SSO_SECRET: 'x',
    JOOMLART_SSO_CLIENT: 'tracy-dev'
  })
  assert.equal(config.joomlartSso?.authorizeUrl, 'http://host.docker.internal:45900/sso/v1/authorize')
})

test('guestSiteKey is empty unless set', () => {
  const c = readConfig({ ...base, DATABASE_URL: '', GUEST_SITE_KEY: 'demo.tracy.ai' })
  assert.equal(c.guestSiteKey, 'demo.tracy.ai')
})

test('model is off unless MODEL_API_KEY is set, and baseUrl/words default', () => {
  const off = readConfig({ ...base, DATABASE_URL: '' })
  assert.equal(off.model, null)
  const on = readConfig({ ...base, DATABASE_URL: '', MODEL_API_KEY: 'sk-test' })
  assert.deepEqual(on.model, {
    apiKey: 'sk-test',
    baseUrl: 'https://openrouter.ai/api/v1',
    words: 'meta-llama/llama-3.3-70b-instruct'
  })
  const custom = readConfig({
    ...base,
    DATABASE_URL: '',
    MODEL_API_KEY: 'sk-test',
    MODEL_BASE_URL: 'https://api.example.com/v1/',
    MODEL_WORDS: 'org/other-model'
  })
  assert.deepEqual(custom.model, {
    apiKey: 'sk-test',
    baseUrl: 'https://api.example.com/v1',
    words: 'org/other-model'
  })
})

test('turnstileSecret is empty unless set', () => {
  const off = readConfig({ ...base, DATABASE_URL: '' })
  assert.equal(off.turnstileSecret, null)
  const on = readConfig({ ...base, DATABASE_URL: '', TURNSTILE_SECRET: 'ts_abc' })
  assert.equal(on.turnstileSecret, 'ts_abc')
})

test('turnstileDisabled is false unless the flag is set — never inferred from a missing secret', () => {
  assert.equal(readConfig({ ...base, DATABASE_URL: '' }).turnstileDisabled, false)
  assert.equal(readConfig({ ...base, DATABASE_URL: '', TURNSTILE_SECRET: 'ts_abc' }).turnstileDisabled, false)
  assert.equal(readConfig({ ...base, DATABASE_URL: '', TURNSTILE_DISABLED: '1' }).turnstileDisabled, true)
  assert.equal(readConfig({ ...base, DATABASE_URL: '', TURNSTILE_DISABLED: 'true' }).turnstileDisabled, true)
})

test('turnstileDisabled: TURNSTILE_DISABLED=false is not the same as unset — verification stays ON', () => {
  // A bare `opt(env, key) !== null` check would have read ANY non-empty string, "false" included,
  // as "set" and therefore disabled — the exact value someone writes to mean "leave it on".
  assert.equal(
    readConfig({ ...base, DATABASE_URL: '', TURNSTILE_DISABLED: 'false' }).turnstileDisabled,
    false
  )
  assert.equal(readConfig({ ...base, DATABASE_URL: '', TURNSTILE_DISABLED: '0' }).turnstileDisabled, false)
  assert.equal(readConfig({ ...base, DATABASE_URL: '', TURNSTILE_DISABLED: 'nope' }).turnstileDisabled, false)
})

test('github is all four settings or none, and a \\n-escaped key is restored to real newlines', () => {
  const none = readConfig({ ...base, DATABASE_URL: '' })
  assert.equal(none.github, null)
  const half = readConfig({ ...base, DATABASE_URL: '', GITHUB_APP_ID: '123456' })
  assert.equal(half.github, null)
  const escaped = readConfig({
    ...base,
    DATABASE_URL: '',
    GITHUB_APP_ID: '123456',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nabc\\n-----END RSA PRIVATE KEY-----\\n',
    GITHUB_ORG: 'TracyHQ',
    GITHUB_WEBHOOK_SECRET: 'whsec'
  })
  assert.deepEqual(escaped.github, {
    appId: '123456',
    privateKey: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n',
    org: 'TracyHQ',
    webhookSecret: 'whsec'
  })
  // A key that already carries real newlines (a quoted multi-line .env value) is left untouched.
  const real = readConfig({
    ...base,
    DATABASE_URL: '',
    GITHUB_APP_ID: '123456',
    GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n',
    GITHUB_ORG: 'TracyHQ',
    GITHUB_WEBHOOK_SECRET: 'whsec'
  })
  assert.equal(
    real.github.privateKey,
    '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n'
  )
})

test('artifact store is all four settings or none', () => {
  const none = readConfig({ ...base, ARTIFACT_S3_ENDPOINT: '', DATABASE_URL: '' })
  assert.equal(none.artifactStore, null)
  const half = readConfig({ ...base, ARTIFACT_S3_ENDPOINT: 'https://r2.example/', DATABASE_URL: '' })
  assert.equal(half.artifactStore, null)
  const full = readConfig({
    ...base,
    DATABASE_URL: '',
    ARTIFACT_S3_ENDPOINT: 'https://r2.example/',
    ARTIFACT_S3_BUCKET: 'b',
    ARTIFACT_S3_ACCESS_KEY: 'ak',
    ARTIFACT_S3_SECRET_KEY: 'sk'
  })
  assert.deepEqual(full.artifactStore, {
    endpoint: 'https://r2.example',
    bucket: 'b',
    accessKey: 'ak',
    secretKey: 'sk'
  })
})

test('artifact store: ARTIFACT_S3_PUBLIC_ENDPOINT is optional, and read only beside a full store', () => {
  const four = {
    ...base,
    DATABASE_URL: '',
    ARTIFACT_S3_ENDPOINT: 'http://host.docker.internal:51740',
    ARTIFACT_S3_BUCKET: 'b',
    ARTIFACT_S3_ACCESS_KEY: 'ak',
    ARTIFACT_S3_SECRET_KEY: 'sk'
  }
  assert.equal(
    'publicEndpoint' in readConfig({ ...four, ARTIFACT_S3_PUBLIC_ENDPOINT: '' }).artifactStore,
    false
  )
  const withPublic = readConfig({ ...four, ARTIFACT_S3_PUBLIC_ENDPOINT: 'https://store.example.net/' })
  assert.equal(withPublic.artifactStore.publicEndpoint, 'https://store.example.net')
  assert.equal(withPublic.artifactStore.endpoint, 'http://host.docker.internal:51740')
  // A public address alone is not a store.
  const alone = readConfig({
    ...base,
    DATABASE_URL: '',
    ARTIFACT_S3_ENDPOINT: '',
    ARTIFACT_S3_PUBLIC_ENDPOINT: 'https://x'
  })
  assert.equal(alone.artifactStore, null)
})

test('hosts are read as triplets and the first is the default', () => {
  const c = readConfig({
    ...base,
    HOSTS: 'prod1,contabo',
    HOST_prod1_ORIGIN: 'https://prod1-agent.tracy.ai',
    HOST_prod1_DSH_ORIGIN: 'https://prod1-agent.tracy.ai',
    HOST_prod1_SECRET: 'a',
    SEAT_prod1_SECRET: 'b',
    HOST_contabo_ORIGIN: 'https://contabo-agent.tracy.ai',
    HOST_contabo_DSH_ORIGIN: 'https://contabo-agent.tracy.ai',
    HOST_contabo_SECRET: 'c',
    SEAT_contabo_SECRET: 'd'
  })
  assert.equal(c.defaultHost, 'prod1')
  assert.equal(
    c.demoHost,
    null,
    'no host called demo and none named: demos have nowhere to go, and the screen says so'
  )
  assert.deepEqual(c.hosts.get('contabo'), {
    origin: 'https://contabo-agent.tracy.ai',
    dshOrigin: 'https://contabo-agent.tracy.ai',
    hostSecret: 'c',
    seatSecret: 'd'
  })
})

test('API_ORIGIN: empty means no API host; set, it is normalised and must not be Tracy’s own hostname', () => {
  assert.equal(readConfig({ ...base, API_ORIGIN: '' }).apiOrigin, null)
  assert.equal(readConfig(base).apiOrigin, null)
  assert.equal(readConfig({ ...base, API_ORIGIN: 'https://api.tracy.ai/' }).apiOrigin, 'https://api.tracy.ai')
  assert.equal(
    readConfig({ ...base, API_ORIGIN: 'http://api.tracy.test:51710//' }).apiOrigin,
    'http://api.tracy.test:51710'
  )
  // Not a URL at all.
  assert.throws(
    () => readConfig({ ...base, API_ORIGIN: 'api.tracy.ai' }),
    (e) => e instanceof ConfigError && e.key === 'API_ORIGIN' && /URL/.test(e.message)
  )
  // The same hostname as TRACY_ORIGIN would make every request on Tracy's own surface an API
  // request (or the reverse): refused at boot, by name, before it can happen.
  assert.throws(
    () => readConfig({ ...base, API_ORIGIN: 'http://localhost:9999' }),
    (e) => e instanceof ConfigError && e.key === 'API_ORIGIN' && /TRACY_ORIGIN/.test(e.message)
  )
  assert.throws(
    () => readConfig({ ...base, API_ORIGIN: 'https://LOCALHOST' }),
    (e) => e instanceof ConfigError && e.key === 'API_ORIGIN'
  )
})

test('TRACY_DNS_RESOLVER: empty means the machine’s resolver; set, every entry must be an address', () => {
  assert.equal(readConfig(base).dnsResolver, '')
  assert.equal(readConfig({ ...base, TRACY_DNS_RESOLVER: '   ' }).dnsResolver, '')
  assert.equal(readConfig({ ...base, TRACY_DNS_RESOLVER: '127.0.0.1:5353' }).dnsResolver, '127.0.0.1:5353')
  assert.equal(
    readConfig({ ...base, TRACY_DNS_RESOLVER: ' 1.1.1.1 , [2606:4700:4700::1111]:53 ' }).dnsResolver,
    '1.1.1.1,[2606:4700:4700::1111]:53'
  )
  // A host name, a URL, an empty entry between commas: refused at start, by name.
  for (const bad of ['x', 'dns.example.com', 'http://1.1.1.1', '1.1.1.1,', '1.1.1.1,,8.8.8.8'])
    assert.throws(
      () => readConfig({ ...base, TRACY_DNS_RESOLVER: bad }),
      (e) => e instanceof ConfigError && e.key === 'TRACY_DNS_RESOLVER',
      bad
    )
})

test('a host missing one of its four lines is refused by name', () => {
  assert.throws(
    () => readConfig({ ...base, HOSTS: 'local', SEAT_local_SECRET: '' }),
    (e) => e instanceof ConfigError && e.key === 'SEAT_local_SECRET'
  )
})

test('resend mail needs a key and a from', () => {
  const c = readConfig({ ...base, MAIL: 'resend:re_123', MAIL_FROM: 'Tracy <no-reply@tracy.ai>' })
  assert.deepEqual(c.mail, { kind: 'resend', key: 're_123', from: 'Tracy <no-reply@tracy.ai>' })
  assert.throws(
    () => readConfig({ ...base, MAIL: 'resend:re_123' }),
    (e) => e.key === 'MAIL_FROM'
  )
})

test('ConfigError names the missing or unknown setting: SESSION_SECRET, HOSTS, MAIL', () => {
  assert.throws(
    () => readConfig({ ...base, SESSION_SECRET: '' }),
    (e) => e instanceof ConfigError && e.key === 'SESSION_SECRET'
  )
  assert.throws(
    () => readConfig({ ...base, HOSTS: '' }),
    (e) => e instanceof ConfigError && e.key === 'HOSTS'
  )
  assert.throws(
    () => readConfig({ ...base, MAIL: 'sendgrid:xyz' }),
    (e) => e instanceof ConfigError && e.key === 'MAIL'
  )
})

test('login preview requires explicit opt-in, local origin and console mail', () => {
  assert.equal(readConfig(base).localLoginPreview, false)
  for (const origin of [
    'http://tracy.test:51710',
    'https://tracy.test:8443',
    'http://localhost:51710',
    'http://127.0.0.1:51710',
    'http://qa.tracy.test:51770'
  ]) {
    assert.equal(
      readConfig({ ...base, TRACY_ORIGIN: origin, LOCAL_LOGIN_PREVIEW: '1' }).localLoginPreview,
      true
    )
  }
  for (const extra of [
    { TRACY_ORIGIN: 'https://cowork.tracy.ai' },
    { TRACY_ORIGIN: 'http://tracy.test.evil.example' },
    { TRACY_ORIGIN: 'https://qa.tracy.test' },
    { MAIL: 'resend:key', MAIL_FROM: 'test@example.com' },
    { NODE_ENV: 'production' }
  ])
    assert.throws(() => readConfig({ ...base, LOCAL_LOGIN_PREVIEW: '1', ...extra }), ConfigError)
})

test('unpublished quickstart packs are read only on a local, non-production stand', () => {
  assert.equal(readConfig(base).localReleasesDir, null)
  assert.equal(
    readConfig({
      ...base,
      TRACY_ORIGIN: 'http://tracy.test:8080',
      TRACY_LOCAL_RELEASES_DIR: '/x/local-releases/'
    }).localReleasesDir,
    '/x/local-releases'
  )
  // Each of these is a server, or a path the host could not find at the same address: refused at
  // boot, never ignored — an ignored variable reads exactly like a stand with no packs.
  for (const extra of [
    { TRACY_ORIGIN: 'https://cowork.tracy.ai' },
    { TRACY_ORIGIN: 'http://tracy.test.evil.example' },
    { TRACY_ORIGIN: 'http://tracy.test:8080', NODE_ENV: 'production' },
    { TRACY_ORIGIN: 'http://tracy.test:8080', TRACY_LOCAL_RELEASES_DIR: 'relative/dir' }
  ])
    assert.throws(
      () => readConfig({ ...base, TRACY_LOCAL_RELEASES_DIR: '/x/local-releases', ...extra }),
      (e) => e instanceof ConfigError && e.key === 'TRACY_LOCAL_RELEASES_DIR'
    )
})

test('the demo host is the one called demo, or the one DEMO_HOST names', () => {
  const two = {
    ...base,
    HOSTS: 'prod1,demo',
    HOST_prod1_ORIGIN: 'https://prod1-agent.tracy.ai',
    HOST_prod1_DSH_ORIGIN: 'https://prod1-agent.tracy.ai',
    HOST_prod1_SECRET: 'a',
    SEAT_prod1_SECRET: 'b',
    HOST_demo_ORIGIN: 'https://demo-host.tracy.ai',
    HOST_demo_DSH_ORIGIN: 'https://demo-host.tracy.ai',
    HOST_demo_SECRET: 'c',
    SEAT_demo_SECRET: 'd'
  }
  assert.equal(readConfig(two).demoHost, 'demo')
  assert.equal(
    readConfig(two).defaultHost,
    'prod1',
    'a demo host is never where a customer site goes by default'
  )
  assert.equal(readConfig({ ...two, DEMO_HOST: 'prod1' }).demoHost, 'prod1')
})

test('DEMO_HOSTS: every host a demo may go on, the first the default, each one of HOSTS', () => {
  const two = {
    ...base,
    HOSTS: 'dev,fleet01',
    HOST_dev_ORIGIN: 'http://host.docker.internal:51720',
    HOST_dev_DSH_ORIGIN: 'http://tracy-dsh:8080',
    HOST_dev_SECRET: 'a',
    SEAT_dev_SECRET: 'b',
    HOST_fleet01_ORIGIN: 'https://fleet01-agent.tracy.site/_host',
    HOST_fleet01_SECRET: 'c',
    DEMO_SERVER_NAME: 'contabo2',
    DEMO_SERVER_IP: '198.51.100.41'
  }
  const config = readConfig({ ...two, DEMO_HOSTS: 'dev,fleet01=tracy-fleet-01' })
  assert.equal(config.demoHost, 'dev')
  assert.deepEqual(config.demoHosts, [
    { name: 'dev', serverName: 'contabo2', serverIp: '198.51.100.41' },
    { name: 'fleet01', serverName: 'tracy-fleet-01', serverIp: null }
  ])
  // A demo-only host runs no dsh — its two dsh lines may be absent, and nothing signs for a door
  // that is not there.
  assert.equal(config.hosts.get('fleet01').dshOrigin, null)
  assert.equal(config.hosts.get('fleet01').seatSecret, null)
  assert.equal(config.defaultHost, 'dev', 'customers keep going to the first of HOSTS')
  assert.equal(readConfig({ ...two, DEMO_HOSTS: 'dev,fleet01', DEMO_HOST: 'fleet01' }).demoHost, 'fleet01')

  // Half a dsh door is refused; so is a demo host that is not a host, and a DEMO_HOST outside the list.
  assert.throws(
    () => readConfig({ ...two, DEMO_HOSTS: 'dev,fleet01', HOST_fleet01_DSH_ORIGIN: 'http://x' }),
    ConfigError
  )
  assert.throws(() => readConfig({ ...two, DEMO_HOSTS: 'dev,fleet02' }), ConfigError)
  assert.throws(() => readConfig({ ...two, DEMO_HOSTS: 'dev', DEMO_HOST: 'fleet01' }), ConfigError)
  // A host that is NOT a demo host still owes both dsh lines.
  assert.throws(() => readConfig({ ...two, DEMO_HOSTS: 'dev' }), ConfigError)
})

test('without DEMO_HOSTS the list is the one DEMO_HOST, as before', () => {
  const config = readConfig({ ...base, DEMO_HOST: base.HOSTS.split(',')[0], DEMO_SERVER_NAME: 'laptop' })
  assert.deepEqual(
    config.demoHosts.map((d) => d.serverName),
    ['laptop']
  )
  assert.equal(config.demoHosts[0].name, config.demoHost)
})

test('API_KEY_PEPPER is optional: absent or empty reads null (seat keys off), a value is kept verbatim', () => {
  assert.equal(readConfig(base).apiKeyPepper, null)
  assert.equal(readConfig({ ...base, API_KEY_PEPPER: '' }).apiKeyPepper, null)
  assert.equal(readConfig({ ...base, API_KEY_PEPPER: 'p'.repeat(64) }).apiKeyPepper, 'p'.repeat(64))
})

test('confirmation relay is off by default and rejects weak secrets or invalid daily limits', () => {
  assert.equal(readConfig(base).beta.confirmationSecret, null)
  assert.equal(readConfig(base).beta.confirmationDaily, 80)
  assert.throws(
    () => readConfig({ ...base, WHITELIST_CONFIRMATION_SECRET: 'short' }),
    /WHITELIST_CONFIRMATION_SECRET/
  )
  for (const value of ['0', '-1', '1.5', 'invalid']) {
    assert.throws(
      () => readConfig({ ...base, WHITELIST_CONFIRMATION_DAILY: value }),
      /WHITELIST_CONFIRMATION_DAILY/
    )
  }
})

test('#1037: the own-domain probe dials a private address only on a stand that says so, and never in production', () => {
  assert.deepEqual(readConfig({ ...base, TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE: '0' }).ownDomainProbe, {})
  assert.deepEqual(readConfig({ ...base, TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE: '1' }).ownDomainProbe, {
    allowPrivate: true,
    port: 443
  })
  assert.deepEqual(readConfig({ ...base, TRACY_OWN_DOMAIN_PROBE_PORT: '53743' }).ownDomainProbe, {
    allowPrivate: false,
    port: 53743
  })
  for (const port of ['0', '65536', '44x', '-1', '4.5'])
    assert.throws(
      () => readConfig({ ...base, TRACY_OWN_DOMAIN_PROBE_PORT: port }),
      /TRACY_OWN_DOMAIN_PROBE_PORT/
    )
  for (const extra of [
    { TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE: '1' },
    { TRACY_OWN_DOMAIN_PROBE_PORT: '8443' }
  ])
    assert.throws(
      () => readConfig({ ...base, ...extra, NODE_ENV: 'production' }),
      /TRACY_OWN_DOMAIN_PROBE_ALLOW_PRIVATE/
    )
})

test('CI GitHub access is optional and never falls back to the release token', () => {
  assert.equal(readConfig({ ...base, TRACY_RELEASES_GITHUB_TOKEN: 'release-only' }).ciToken, null)
  assert.equal(readConfig({ ...base, TRACY_CI_GITHUB_TOKEN: 'ci-read-only' }).ciToken, 'ci-read-only')
})

test('TRACY_SOURCE_REPO: the source repository the CI dashboard reads, TracyHQ/tch until cutover; only our two homes', () => {
  assert.equal(readConfig(base).sourceRepo, 'TracyHQ/tch')
  assert.equal(readConfig({ ...base, TRACY_SOURCE_REPO: 'TracyHQ/tracy' }).sourceRepo, 'TracyHQ/tracy')
  for (const bad of ['Someone/tracy', 'TracyHQ/tracy/extra', 'tracyhq/tracy'])
    assert.throws(() => readConfig({ ...base, TRACY_SOURCE_REPO: bad }), /TRACY_SOURCE_REPO/)
})

test('DESKTOP_DOWNLOAD_URL: the Tracy Desktop download page, tracy.ai by default; set, it must be an http(s) URL', () => {
  assert.equal(readConfig(base).desktopDownloadUrl, 'https://tracy.ai/download/')
  assert.equal(
    readConfig({ ...base, DESKTOP_DOWNLOAD_URL: 'https://tracy.site/download/' }).desktopDownloadUrl,
    'https://tracy.site/download/'
  )
  assert.throws(
    () => readConfig({ ...base, DESKTOP_DOWNLOAD_URL: 'tracy.site/download' }),
    /DESKTOP_DOWNLOAD_URL/
  )
  assert.throws(
    () => readConfig({ ...base, DESKTOP_DOWNLOAD_URL: 'javascript:alert(1)' }),
    /DESKTOP_DOWNLOAD_URL/
  )
})

test('UPDATE_ORIGIN: empty means no update host; set, it is normalised and must not be Tracy’s own hostname', () => {
  assert.equal(readConfig(base).updateOrigin, null)
  assert.equal(
    readConfig({ ...base, UPDATE_ORIGIN: 'https://update.tracy.test/' }).updateOrigin,
    'https://update.tracy.test'
  )
  assert.throws(() => readConfig({ ...base, UPDATE_ORIGIN: 'update.tracy.test' }), /UPDATE_ORIGIN/)
  assert.throws(() => readConfig({ ...base, UPDATE_ORIGIN: 'http://localhost:9999' }), /UPDATE_ORIGIN/)
})

test('release store: its own bucket on the artifact store unless its own endpoint and keys are given', () => {
  const artifacts = {
    ARTIFACT_S3_ENDPOINT: 'http://minio:9000/',
    ARTIFACT_S3_BUCKET: 'tracy-artifacts',
    ARTIFACT_S3_ACCESS_KEY: 'ak',
    ARTIFACT_S3_SECRET_KEY: 'sk'
  }
  assert.equal(readConfig({ ...base, ...artifacts }).releaseStore, null)
  assert.deepEqual(readConfig({ ...base, ...artifacts, RELEASES_S3_BUCKET: 'tracy-releases' }).releaseStore, {
    endpoint: 'http://minio:9000',
    bucket: 'tracy-releases',
    accessKey: 'ak',
    secretKey: 'sk'
  })
  assert.deepEqual(
    readConfig({
      ...base,
      RELEASES_S3_BUCKET: 'tracy-releases',
      RELEASES_S3_ENDPOINT: 'https://r2.test',
      RELEASES_S3_ACCESS_KEY: 'rk',
      RELEASES_S3_SECRET_KEY: 'rs'
    }).releaseStore,
    { endpoint: 'https://r2.test', bucket: 'tracy-releases', accessKey: 'rk', secretKey: 'rs' }
  )
  assert.equal(readConfig({ ...base, RELEASES_S3_BUCKET: 'tracy-releases' }).releaseStore, null)
})

test('#1037 Cloudflare for SaaS: both of zone and token or neither — one alone leaves own domains unavailable and never stops the start; a stand-in API never in production, and the token never in an error', () => {
  const zone = '0123456789abcdef0123456789ABCDEF'
  const token = 'cf-saas-test-token-do-not-print'
  assert.equal(readConfig(base).customHostnames, null, 'neither set: no custom hostnames')
  assert.deepEqual(
    readConfig({ ...base, CLOUDFLARE_SAAS_ZONE_ID: zone, CLOUDFLARE_SAAS_TOKEN: token }).customHostnames,
    {
      zoneId: zone.toLowerCase(),
      token
    }
  )
  // Half a set-up (one of the two, or a stand-in API with neither): the server starts, and the
  // Connect domain doors answer that own domains are not available here (`address.js`).
  for (const half of [
    { CLOUDFLARE_SAAS_ZONE_ID: zone },
    { CLOUDFLARE_SAAS_TOKEN: token },
    { CLOUDFLARE_SAAS_API: 'http://127.0.0.1:9/' },
    { CLOUDFLARE_SAAS_ZONE_ID: zone, CLOUDFLARE_SAAS_API: 'http://127.0.0.1:9/' }
  ])
    assert.equal(readConfig({ ...base, ...half }).customHostnames, null, JSON.stringify(Object.keys(half)))
  const refusals = [
    [{ CLOUDFLARE_SAAS_ZONE_ID: 'tracy.site', CLOUDFLARE_SAAS_TOKEN: token }, 'CLOUDFLARE_SAAS_ZONE_ID'],
    [{ CLOUDFLARE_SAAS_ZONE_ID: 'tracy.site' }, 'CLOUDFLARE_SAAS_ZONE_ID'],
    [{ CLOUDFLARE_SAAS_ZONE_ID: zone, CLOUDFLARE_SAAS_TOKEN: `${token} extra` }, 'CLOUDFLARE_SAAS_TOKEN'],
    [{ CLOUDFLARE_SAAS_API: 'http://127.0.0.1:9/', NODE_ENV: 'production' }, 'CLOUDFLARE_SAAS_API'],
    [
      { CLOUDFLARE_SAAS_ZONE_ID: zone, CLOUDFLARE_SAAS_TOKEN: token, CLOUDFLARE_SAAS_API: 'ftp://x' },
      'CLOUDFLARE_SAAS_API'
    ],
    [
      {
        CLOUDFLARE_SAAS_ZONE_ID: zone,
        CLOUDFLARE_SAAS_TOKEN: token,
        CLOUDFLARE_SAAS_API: 'http://127.0.0.1:9/',
        NODE_ENV: 'production'
      },
      'CLOUDFLARE_SAAS_API'
    ]
  ]
  for (const [extra, key] of refusals) {
    let error = null
    try {
      readConfig({ ...base, ...extra })
    } catch (caught) {
      error = caught
    }
    assert.ok(error instanceof ConfigError, `${JSON.stringify(Object.keys(extra))} is refused`)
    assert.match(error.message, new RegExp(key))
    assert.equal(error.message.includes(token), false, 'the token is never in the error')
  }
  const stand = readConfig({
    ...base,
    CLOUDFLARE_SAAS_ZONE_ID: zone,
    CLOUDFLARE_SAAS_TOKEN: token,
    CLOUDFLARE_SAAS_API: 'http://127.0.0.1:9/client/v4/'
  }).customHostnames
  assert.equal(stand.apiBase, 'http://127.0.0.1:9/client/v4')
})

test('#1037 the zone names for own domains: connect and origin unless configured, one DNS label each, never the same', () => {
  assert.deepEqual(readConfig(base).ownDomainLabels, { connect: 'connect', origin: 'origin' })
  assert.deepEqual(
    readConfig({
      ...base,
      CLOUDFLARE_SAAS_CONNECT_LABEL: 'Connect',
      CLOUDFLARE_SAAS_ORIGIN_LABEL: 'origin-dev'
    }).ownDomainLabels,
    { connect: 'connect', origin: 'origin-dev' }
  )
  for (const extra of [
    { CLOUDFLARE_SAAS_CONNECT_LABEL: 'connect.tracy.site' },
    { CLOUDFLARE_SAAS_ORIGIN_LABEL: '-origin' },
    { CLOUDFLARE_SAAS_CONNECT_LABEL: 'edge', CLOUDFLARE_SAAS_ORIGIN_LABEL: 'edge' }
  ])
    assert.throws(() => readConfig({ ...base, ...extra }), ConfigError, JSON.stringify(extra))
})

test('JOOMLART_SSO_CLIENT is said outright: tracy or tracy-dev, never guessed from the origin', () => {
  for (const client of ['tracy', 'tracy-dev']) {
    const config = readConfig({
      ...base,
      DATABASE_URL: '',
      JOOMLART_SSO_URL: 'https://www.joomlart.com/member/sso/v1/authorize',
      JOOMLART_SSO_SECRET: 'x',
      JOOMLART_SSO_CLIENT: client
    })
    assert.equal(config.joomlartSso?.client, client)
  }
  for (const client of ['', 'prod', 'TRACY'])
    assert.throws(
      () =>
        readConfig({
          ...base,
          DATABASE_URL: '',
          JOOMLART_SSO_URL: 'https://www.joomlart.com/member/sso/v1/authorize',
          JOOMLART_SSO_SECRET: 'x',
          JOOMLART_SSO_CLIENT: client
        }),
      (error) => error instanceof ConfigError && error.key === 'JOOMLART_SSO_CLIENT'
    )
})

test('DOCS_ORIGIN: set, it is normalised and must name a hostname of its own', () => {
  const api = { ...base, API_ORIGIN: 'https://api.tracy.test' }
  assert.equal(
    readConfig({ ...api, DOCS_ORIGIN: 'https://docs.tracy.test/' }).docsOrigin,
    'https://docs.tracy.test'
  )
  assert.throws(
    () => readConfig({ ...api, DOCS_ORIGIN: 'docs.tracy.test' }),
    (e) => e instanceof ConfigError && e.key === 'DOCS_ORIGIN' && /URL/.test(e.message)
  )
  // The docs host answers only the documentation; sharing a hostname with Tracy's own surface or
  // with the API host would turn one of them into the other's allowlist at the first request.
  assert.throws(
    () => readConfig({ ...api, DOCS_ORIGIN: 'http://localhost:7000' }),
    (e) => e instanceof ConfigError && e.key === 'DOCS_ORIGIN' && /TRACY_ORIGIN/.test(e.message)
  )
  assert.throws(
    () => readConfig({ ...api, DOCS_ORIGIN: 'https://API.tracy.test:8443' }),
    (e) => e instanceof ConfigError && e.key === 'DOCS_ORIGIN' && /API_ORIGIN/.test(e.message)
  )
  assert.throws(
    () =>
      readConfig({
        ...api,
        UPDATE_ORIGIN: 'https://update.tracy.test',
        DOCS_ORIGIN: 'https://update.tracy.test'
      }),
    (e) => e instanceof ConfigError && e.key === 'DOCS_ORIGIN' && /UPDATE_ORIGIN/.test(e.message)
  )
})

test('DOCS_ORIGIN: required once this deployment carries the built documentation site, by name', () => {
  // A checkout without `static/docs` keeps running without it.
  assert.equal(readConfig(base).docsOrigin, null)
  assert.equal(readConfig(base, { docsBuilt: false }).docsOrigin, null)
  // An image with the site built for `base: '/'` cannot serve it anywhere but its own host.
  assert.throws(
    () => readConfig(base, { docsBuilt: true }),
    (e) => e instanceof ConfigError && e.key === 'DOCS_ORIGIN' && /static\/docs/.test(e.message)
  )
  assert.equal(
    readConfig({ ...base, DOCS_ORIGIN: 'https://docs.tracy.test' }, { docsBuilt: true }).docsOrigin,
    'https://docs.tracy.test'
  )
})

test('backupExport: the backup download doors are on by default and can be disabled (ADR 0024, amendment 3)', () => {
  assert.equal(readConfig(base).backupExport, true)
  assert.equal(readConfig({ ...base, BACKUP_EXPORT: 'off' }).backupExport, false)
  assert.equal(readConfig({ ...base, BACKUP_EXPORT: 'on' }).backupExport, true)
  for (const value of ['yes', 'true', '1', 'ON'])
    assert.throws(
      () => readConfig({ ...base, BACKUP_EXPORT: value }),
      (e) => e instanceof ConfigError && e.key === 'BACKUP_EXPORT',
      value
    )
})

test('test sending opens only where real campaigns run, only with a list, and never on staging or production', () => {
  const gmail = {
    INVITATIONS_SANDBOX_ENABLED: '1',
    INVITATIONS_GMAIL_CLIENT_ID: 'c',
    INVITATIONS_GMAIL_CLIENT_SECRET: 's',
    INVITATIONS_GMAIL_KEY_ID: 'k',
    INVITATIONS_GMAIL_KEY: Buffer.alloc(32, 1).toString('base64'),
    INVITATIONS_GMAIL_ADDRESS: 'sender@example.com'
  }
  const on = {
    ...base,
    ...gmail,
    INVITATIONS_REAL_KEY_DIR: '/var/lib/tracy/invitations-real-keys',
    TRACY_ENVIRONMENT: 'local',
    INVITATIONS_SENDING: 'test',
    INVITATIONS_TEST_RECIPIENTS: ' A@Example.com, b@example.com ,a@example.com'
  }
  assert.deepEqual(readConfig(on).invitationsSending, {
    mode: 'test',
    pilotMissing: [],
    testRecipients: ['a@example.com', 'b@example.com'],
    testDailyLimit: 50,
    pilotMax: 2000,
    pacingSeconds: 180
  })
  // Pilot needs the aMember key; without it, it falls back to test sending and names what is missing.
  const pilotOff = readConfig({ ...on, INVITATIONS_SENDING: 'pilot' }).invitationsSending
  assert.equal(pilotOff.mode, 'test')
  assert.deepEqual(pilotOff.pilotMissing, ['AMEMBER_API_KEY'])
  const pilotOn = readConfig({
    ...on,
    INVITATIONS_SENDING: 'pilot',
    AMEMBER_API_KEY: 'fixture',
    INVITATIONS_PILOT_MAX: '5'
  }).invitationsSending
  assert.equal(pilotOn.mode, 'pilot')
  assert.equal(pilotOn.pilotMax, 5)
  assert.throws(() => readConfig({ ...on, INVITATIONS_PILOT_MAX: '10001' }), ConfigError)
  assert.equal(readConfig(base).invitationsSending.mode, 'off')
  // Staging and production refuse the sandbox and Gmail settings outright; the sending switch and
  // list on their own still read as off there.
  for (const environment of ['staging', 'production'])
    assert.equal(
      readConfig({
        ...base,
        INVITATIONS_REAL_KEY_DIR: '/var/lib/tracy/invitations-real-keys',
        TRACY_ENVIRONMENT: environment,
        INVITATIONS_SENDING: 'test',
        INVITATIONS_TEST_RECIPIENTS: 'a@example.com'
      }).invitationsSending.mode,
      'off'
    )
  assert.equal(readConfig({ ...on, INVITATIONS_TEST_RECIPIENTS: '' }).invitationsSending.mode, 'off')
  assert.throws(() => readConfig({ ...on, INVITATIONS_SENDING: 'live' }), ConfigError)
  assert.throws(() => readConfig({ ...on, INVITATIONS_TEST_RECIPIENTS: 'not-an-address' }), ConfigError)
  assert.throws(() => readConfig({ ...on, INVITATIONS_TEST_DAILY_LIMIT: '0' }), ConfigError)
})

test('MCP can share the application origin without exposing the marketing host', () => {
  assert.equal(readConfig(base).mcpOrigin, null)
  assert.equal(readConfig({ ...base, MCP_ORIGIN: base.TRACY_ORIGIN }).mcpOrigin, 'http://localhost:8080')
  for (const value of [
    'https://cowork.tracy.ai/mcp',
    'https://u:p@cowork.tracy.ai',
    'https://cowork.tracy.ai?x=1'
  ])
    assert.throws(() => readConfig({ ...base, MCP_ORIGIN: value }), ConfigError)
})

test('local review mode is off by default and needs a local releases directory', () => {
  const local = { ...base, TRACY_ORIGIN: 'http://tracy.test:8080' }
  assert.equal(readConfig(local).localReview, false)
  assert.equal(
    readConfig({ ...local, TRACY_LOCAL_RELEASES_DIR: '/x/local-releases', TRACY_LOCAL_REVIEW: '1' })
      .localReview,
    true
  )
  assert.throws(
    () => readConfig({ ...local, TRACY_LOCAL_REVIEW: '1' }),
    (e) => e instanceof ConfigError && e.key === 'TRACY_LOCAL_REVIEW'
  )
})

test('SPEECH_STT_MAX_CONCURRENT: voice sessions at once per speech service; anything but a positive integer is refused', () => {
  assert.equal(readConfig({ ...base, SPEECH_STT_MAX_CONCURRENT: '9' }).speechSttMaxConcurrent, 9)
  for (const bad of ['0', '-1', '2.5', 'many'])
    assert.throws(
      () => readConfig({ ...base, SPEECH_STT_MAX_CONCURRENT: bad }),
      (error) => error instanceof ConfigError && error.key === 'SPEECH_STT_MAX_CONCURRENT'
    )
})

test('WO_SITE_READ_TLS: on, 1 or true turns the two-tier homepage read on; anything else leaves it off', () => {
  for (const v of ['on', '1', 'true', 'ON'])
    assert.equal(readConfig({ ...base, WO_SITE_READ_TLS: v }).woSiteReadTls, true, v)
  for (const v of ['', 'off', '0', 'false', 'yes'])
    assert.equal(readConfig({ ...base, WO_SITE_READ_TLS: v }).woSiteReadTls, false, v)
})

test('TEMPLATES_PUBLIC_ORIGIN defaults to TRACY_ORIGIN and accepts a bare origin only', () => {
  assert.equal(readConfig(base).templatesPublicOrigin, 'http://localhost:8080')
  assert.equal(
    readConfig({ ...base, TEMPLATES_PUBLIC_ORIGIN: 'https://tracy.ai/' }).templatesPublicOrigin,
    'https://tracy.ai'
  )
  for (const bad of ['tracy.ai', 'https://tracy.ai/templates', 'ftp://tracy.ai'])
    assert.throws(() => readConfig({ ...base, TEMPLATES_PUBLIC_ORIGIN: bad }), ConfigError)
})
