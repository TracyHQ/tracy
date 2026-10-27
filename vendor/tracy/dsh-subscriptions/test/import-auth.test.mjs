import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverLocalCliSessions, loadLocalCliBlob } from '../lib/import-auth.js'

// #296: the CLI importers read local credential files. A fixture home
// keeps the tests hermetic - no real HOME, no env mutation for the
// file-based providers.

async function fixtureHome(files) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-import-'))
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

async function withHome(files, fn) {
  const root = await fixtureHome(files)
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('detects a Codex CLI session from auth.json', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at', refresh_token: 'rt', email: 'user@example.com' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.codex, 'codex session detected')
    assert.equal(found.codex.provider, 'codex')
    assert.equal(found.codex.email, 'user@example.com')
    assert.equal(found.codex.hasRefreshToken, true)
    assert.ok(found.codex.path.startsWith(home))
  })
})

test('detects a Grok session from .grok/auth.json and ignores legacy paths', async () => {
  await withHome({ '.grok/auth.json': { token: 'gt' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.grok, 'grok session detected via .grok')
  })
  await withHome({ '.hermes/auth.json': { access_token: 'ht' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.equal(found.grok, undefined, 'legacy agent paths must not be detected')
  })
})

test('detects an Antigravity session from the proxy credentials file', async () => {
  await withHome({ '.cli-proxy-api/antigravity.json': { token: { access_token: 'agt' } } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.antigravity, 'antigravity session detected')
  })
})

test('a missing or corrupted credential file is ignored without throwing', async () => {
  await withHome({ '.codex/auth.json': 'not json at all' }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.equal(found.codex, undefined)
  })
  await withHome({}, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.equal(found.codex, undefined)
    assert.equal(found.grok, undefined)
    assert.equal(found.antigravity, undefined)
  })
})

test('loadLocalCliBlob rejects a provider with no detected session', async () => {
  await withHome({}, async (home) => {
    await assert.rejects(() => loadLocalCliBlob('codex', { home }), /no local CLI session found/)
  })
})

test('loadLocalCliBlob returns a usable blob for Codex', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at', refresh_token: 'rt', email: 'e@x' } }, async (home) => {
    const blob = await loadLocalCliBlob('codex', { home })
    assert.equal(blob.accessToken, 'at')
    assert.ok(blob.expiresAt > Date.now())
  })
})

test('loadLocalCliBlob reads Copilot from the environment token', async () => {
  const prev = process.env.GITHUB_COPILOT_TOKEN
  process.env.GITHUB_COPILOT_TOKEN = 'ghu_test'
  try {
    await withHome({}, async (home) => {
      const blob = await loadLocalCliBlob('copilot', { home })
      assert.equal(blob.accessToken, 'ghu_test')
      assert.equal(blob.refreshToken, 'ghu_test')
    })
  } finally {
    if (prev === undefined) delete process.env.GITHUB_COPILOT_TOKEN
    else process.env.GITHUB_COPILOT_TOKEN = prev
  }
})

test('loadLocalCliBlob reads Cursor and Kiro tokens from their files', async () => {
  await withHome({ '.cursor/auth.json': { accessToken: 'cur', authInfo: { email: 'c@x' } } }, async (home) => {
    const detected = await discoverLocalCliSessions({ home })
    if (detected.cursor) {
      const blob = await loadLocalCliBlob('cursor', { home })
      assert.equal(blob.accessToken, 'cur')
    }
  })
})

test('loadLocalCliBlob rejects unsupported providers explicitly', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at' } }, async (home) => {
    const detected = await discoverLocalCliSessions({ home })
    if (detected.codex) {
      await assert.rejects(() => loadLocalCliBlob('codex-unknown', { home }), /(no local CLI session found|unsupported)/)
    }
  })
})

test('#413: discoverLocalCliSessions returns only supported subscription providers without unsupported coding-agent configs', async () => {
  await withHome({
    '.aider.conf.yml': 'OPENAI_API_KEY=sk-test',
    '.roo-code/settings.json': JSON.stringify({ apiKey: 'sk-test' }),
    '.codex/auth.json': JSON.stringify({ access_token: 'valid-token', email: 'test@example.com' }),
  }, async (home) => {
    const discovered = await discoverLocalCliSessions({ home })
    assert.equal(discovered.aider, undefined, 'Aider config must not be discovered as a subscription')
    assert.equal(discovered.roocode, undefined, 'Roo-Code config must not be discovered as a subscription')
    assert.ok(discovered.codex, 'Codex subscription should be discovered')

    for (const provider of Object.keys(discovered)) {
      const blob = await loadLocalCliBlob(provider, { home })
      assert.ok(blob, `loadLocalCliBlob must succeed for discovered provider ${provider}`)
    }
  })
})

test('#452: detects Claude session and loads via canonical claude and claude-cli alias', async () => {
  const claudeFixture = {
    claudeAiOauth: {
      accessToken: 'claude-test-at',
      refreshToken: 'claude-test-rt',
      expiresAt: Date.now() + 3600000,
    },
    email: 'claude-user@example.com',
  }
  await withHome({ '.claude/credentials.json': claudeFixture }, async (home) => {
    const discovered = await discoverLocalCliSessions({ home })
    assert.ok(discovered.claude, 'claude must be discovered under canonical key')
    assert.equal(discovered.claude.provider, 'claude')
    assert.equal(discovered.claude.source, 'file')
    assert.equal(discovered.claude.email, 'claude-user@example.com')
    assert.equal(discovered.claude.hasRefreshToken, true)

    // Load via canonical 'claude'
    const blob1 = await loadLocalCliBlob('claude', { home })
    assert.equal(blob1.accessToken, 'claude-test-at')
    assert.equal(blob1.refreshToken, 'claude-test-rt')
    assert.equal(blob1.email, 'claude-user@example.com')

    // Load via alias 'claude-cli'
    const blob2 = await loadLocalCliBlob('claude-cli', { home })
    assert.equal(blob2.accessToken, 'claude-test-at')
    assert.equal(blob2.refreshToken, 'claude-test-rt')
  })
})

test('#452: loadLocalCliBlob reads Cursor from environment variable without files', async () => {
  const prev = process.env.CURSOR_ACCESS_TOKEN
  process.env.CURSOR_ACCESS_TOKEN = 'cur_env_token_452'
  try {
    await withHome({}, async (home) => {
      const discovered = await discoverLocalCliSessions({ home })
      assert.ok(discovered.cursor, 'cursor session detected via env')
      assert.equal(discovered.cursor.source, 'env')
      assert.equal(discovered.cursor.provider, 'cursor')

      const blob = await loadLocalCliBlob('cursor', { home })
      assert.equal(blob.accessToken, 'cur_env_token_452')
      assert.equal(blob.email, 'Cursor IDE User')
      assert.ok(blob.expiresAt > Date.now())
    })
  } finally {
    if (prev === undefined) delete process.env.CURSOR_ACCESS_TOKEN
    else process.env.CURSOR_ACCESS_TOKEN = prev
  }
})

test('#452: loadLocalCliBlob reads Kiro from environment variable without files', async () => {
  const prev = process.env.KIRO_API_KEY
  process.env.KIRO_API_KEY = 'kiro_env_key_452'
  try {
    await withHome({}, async (home) => {
      const discovered = await discoverLocalCliSessions({ home })
      assert.ok(discovered.kiro, 'kiro session detected via env')
      assert.equal(discovered.kiro.source, 'env')
      assert.equal(discovered.kiro.provider, 'kiro')

      const blob = await loadLocalCliBlob('kiro', { home })
      assert.equal(blob.accessToken, 'kiro_env_key_452')
      assert.equal(blob.email, 'AWS Kiro API Key')
      assert.ok(blob.expiresAt > Date.now())
    })
  } finally {
    if (prev === undefined) delete process.env.KIRO_API_KEY
    else process.env.KIRO_API_KEY = prev
  }
})

test('GH #13: detects Antigravity session from ~/.gemini/oauth_creds.json', async () => {
  await withHome({
    '.gemini/oauth_creds.json': {
      access_token: 'test-google-at',
      refresh_token: 'test-google-rt',
      expiry_date: 1787252123978,
    },
  }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.antigravity, 'antigravity session detected via oauth_creds.json')
    assert.equal(found.antigravity.provider, 'antigravity')
    assert.equal(found.antigravity.hasRefreshToken, true)
  })
})

test('GH #13: loadLocalCliBlob normalizes Antigravity ISO expiry and extracts client ID from id_token', async () => {
  const dummyGoogleCid = '764086051850-6qr4p6gpi6hn506pt8ejuq83di341hur.apps.googleusercontent.com'
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    iss: 'https://accounts.google.com',
    aud: dummyGoogleCid,
    azp: dummyGoogleCid,
    email: 'gemini-tester@example.com',
  })).toString('base64url')
  const dummyIdToken = `${header}.${payload}.signature`

  const isoExpiry = '2026-05-29T17:29:26.476509737+03:00'
  const expectedMs = Date.parse(isoExpiry)

  await withHome({
    '.gemini/antigravity-cli/antigravity-oauth-token': {
      token: {
        access_token: 'agt-12345',
        refresh_token: 'rt-67890',
        token_type: 'Bearer',
        expiry: isoExpiry,
      },
      id_token: dummyIdToken,
      auth_method: 'consumer',
    },
  }, async (home) => {
    const blob = await loadLocalCliBlob('antigravity', { home })
    assert.equal(blob.accessToken, 'agt-12345')
    assert.equal(blob.refreshToken, 'rt-67890')
    assert.equal(typeof blob.expiresAt, 'number')
    assert.equal(blob.expiresAt, expectedMs)
    assert.notEqual(blob.expiresAt, 0, 'expiresAt must not be 0')
    assert.equal(blob.clientId, dummyGoogleCid)
    assert.equal(blob.email, 'gemini-tester@example.com')
  })
})

test('GH #13: loadLocalCliBlob supports explicit clientId in Antigravity CLI credentials', async () => {
  const explicitCid = '112233445566-customclient.apps.googleusercontent.com'
  await withHome({
    '.gemini/antigravity-cli/antigravity-oauth-token': {
      token: {
        access_token: 'agt-at',
        refresh_token: 'agt-rt',
        expiry: 1787252123, // epoch seconds
        client_id: explicitCid,
        client_secret: 'sec-val',
      },
    },
  }, async (home) => {
    const blob = await loadLocalCliBlob('antigravity', { home })
    assert.equal(blob.clientId, explicitCid)
    assert.equal(blob.clientSecret, 'sec-val')
    assert.equal(blob.expiresAt, 1787252123000)
  })
})

test('GH #13: loadLocalCliBlob does not fabricate future expiry when timestamps are absent', async () => {
  await withHome({
    '.gemini/antigravity-cli/antigravity-oauth-token': {
      token: {
        access_token: 'agt-at',
        refresh_token: 'agt-rt',
      },
    },
  }, async (home) => {
    const blob = await loadLocalCliBlob('antigravity', { home })
    assert.equal(blob.expiresAt, 0, 'expiresAt must be 0 when absent')
  })
})
