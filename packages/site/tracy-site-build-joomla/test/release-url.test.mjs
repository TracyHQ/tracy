import assert from 'node:assert/strict'
import { test } from 'node:test'
import { releaseUrl } from '../src/host/release-url.mjs'

const artifact = {
  url: 'https://github.com/JoomlArt-Products/joomlart-products/releases/download/test/template.zip',
  githubAssetId: 123
}
test('the private release credential only goes to the GitHub API; the installer gets a signed URL', async () => {
  const url = await releaseUrl(artifact, {
    token: 'test-private-key',
    fetch: async (url, request) => {
      assert.equal(
        url,
        'https://api.github.com/repos/JoomlArt-Products/joomlart-products/releases/assets/123'
      )
      assert.equal(request.redirect, 'manual')
      assert.equal(request.headers.Authorization, 'Bearer test-private-key')
      return new Response(null, {
        status: 302,
        headers: {
          location:
            'https://release-assets.githubusercontent.com/github-production-release-asset/123?signature=short-lived'
        }
      })
    }
  })
  assert.match(url, /^https:\/\/release-assets\.githubusercontent\.com\//)
  assert.equal(url.includes('test-private-key'), false)
})
test('missing credentials and untrusted redirects fail before any installation', async () => {
  await assert.rejects(releaseUrl(artifact, { token: '' }), /needs access/)
  await assert.rejects(
    releaseUrl(artifact, {
      token: 'test-key',
      fetch: async () =>
        new Response(null, { status: 302, headers: { location: 'https://example.com/package.zip' } })
    }),
    /unexpected download host/
  )
  await assert.rejects(
    releaseUrl(artifact, { token: 'test-key', fetch: async () => new Response(null, { status: 404 }) }),
    /HTTP 404/
  )
})
