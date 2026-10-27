import { test } from 'node:test'
import assert from 'node:assert/strict'
import { firecrawlSearch, jinaSearch, serpapiGoogleSearch } from '../domain/web-search.mjs'

const json =
  (body, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

test('Jina search returns title, url and description of each http(s) result, with the key as a bearer', async () => {
  let seen
  const fetch = async (url, init) => {
    seen = { url: String(url), auth: init.headers.authorization, accept: init.headers.accept }
    return json({
      data: [
        {
          title: 'Pho Ba | Facebook',
          url: 'https://www.facebook.com/phoba',
          description: 'Pho in Dubai',
          content: 'x'
        },
        { title: 'bad', url: 'javascript:alert(1)' }
      ]
    })()
  }
  const rows = await jinaSearch('Pho Ba Dubai facebook', { key: 'jk', fetch })
  assert.deepEqual(rows, [
    { title: 'Pho Ba | Facebook', url: 'https://www.facebook.com/phoba', description: 'Pho in Dubai' }
  ])
  assert.match(seen.url, /^https:\/\/s\.jina\.ai\/\?q=Pho\+Ba\+Dubai\+facebook$/)
  assert.equal(seen.auth, 'Bearer jk')
  assert.equal(seen.accept, 'application/json')
})

test('Firecrawl search posts the query and reads data[]', async () => {
  let body
  const fetch = async (url, init) => {
    assert.equal(String(url), 'https://api.firecrawl.dev/v1/search')
    body = JSON.parse(init.body)
    return json({
      success: true,
      data: [{ url: 'https://instagram.com/phoba', title: 'Pho Ba', description: 'IG' }]
    })()
  }
  const rows = await firecrawlSearch('Pho Ba instagram', { key: 'fk', fetch })
  assert.deepEqual(rows, [{ title: 'Pho Ba', url: 'https://instagram.com/phoba', description: 'IG' }])
  assert.equal(body.query, 'Pho Ba instagram')
  assert.ok(body.limit <= 10)
})

test('both adapters name a missing key, a refused key, a spent quota and any other failure', async () => {
  for (const search of [jinaSearch, firecrawlSearch]) {
    await assert.rejects(search('q', { key: '', fetch: json({}) }), { code: 'CREDENTIAL_MISSING' })
    await assert.rejects(search('q', { key: 'k', fetch: json({}, 401) }), { code: 'CREDENTIAL_INVALID' })
    await assert.rejects(search('q', { key: 'k', fetch: json({}, 402) }), { code: 'QUOTA' })
    await assert.rejects(search('q', { key: 'k', fetch: json({}, 429) }), { code: 'QUOTA' })
    await assert.rejects(search('q', { key: 'k', fetch: json({}, 500) }), { code: 'PROVIDER_ERROR' })
    await assert.rejects(
      search('q', {
        key: 'k',
        fetch: async () => {
          throw new Error('down')
        }
      }),
      { code: 'PROVIDER_ERROR' }
    )
  }
})

test("each adapter searches as from the place's country when given one, and as before without", async () => {
  const seen = []
  const fetch = async (url, init) => {
    seen.push({ url: new URL(String(url)), body: init.body ? JSON.parse(init.body) : null })
    return json({ data: [], organic_results: [] })()
  }
  await jinaSearch('q', { key: 'k', country: 'AE', fetch })
  await firecrawlSearch('q', { key: 'k', country: 'AE', fetch })
  await serpapiGoogleSearch('q', { key: 'k', country: 'AE', fetch })
  assert.equal(seen[0].url.searchParams.get('gl'), 'ae')
  assert.equal(seen[1].body.country, 'ae')
  assert.equal(seen[2].url.searchParams.get('gl'), 'ae')
  seen.length = 0
  await jinaSearch('q', { key: 'k', fetch })
  await firecrawlSearch('q', { key: 'k', fetch })
  await serpapiGoogleSearch('q', { key: 'k', fetch })
  assert.equal(seen[0].url.searchParams.has('gl'), false)
  assert.equal('country' in seen[1].body, false)
  assert.equal(seen[2].url.searchParams.has('gl'), false)
})
