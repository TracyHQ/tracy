import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findMenuLinks, menuLinksFromResults, menuSearchQuery } from '../domain/menu-search.mjs'
import { serpapiGoogleSearch } from '../domain/web-search.mjs'

const PLACE = { name: 'Velvet Wonton', locality: 'Dubai' }

test('a search result is a menu link only when it looks like a menu and names the place', () => {
  const rows = [
    {
      title: 'Velvet Wonton Menu, Motor City, Dubai | Zomato',
      url: 'https://www.zomato.com/dubai/velvet-wonton-motor-city/menu',
      description: ''
    },
    {
      title: 'Velvet Wonton menu (PDF)',
      url: 'https://velvetwonton.example/files/menu.pdf',
      description: ''
    },
    { title: 'Velvet Wonton | Facebook', url: 'https://www.facebook.com/velvetwonton/menu', description: '' },
    {
      title: 'Dumpling House Menu',
      url: 'https://www.zomato.com/dubai/dumpling-house/menu',
      description: ''
    },
    {
      title: 'Velvet Wonton - Reviews',
      url: 'https://www.tripadvisor.com/Restaurant_Review-velvet-wonton',
      description: ''
    },
    { title: 'Velvet Wonton menu', url: 'javascript:alert(1)', description: '' }
  ]
  assert.deepEqual(menuLinksFromResults(PLACE, rows, 'serpapi-google-search'), [
    {
      url: 'https://www.zomato.com/dubai/velvet-wonton-motor-city/menu',
      source: 'search',
      provider: 'serpapi-google-search'
    },
    {
      url: 'https://velvetwonton.example/files/menu.pdf',
      source: 'search',
      provider: 'serpapi-google-search'
    }
  ])
})

test('the query names the place, its locality and the word menu', () => {
  assert.equal(menuSearchQuery(PLACE), '"Velvet Wonton" Dubai menu')
})

test('findMenuLinks walks the order: website first keeps what the crawl found and calls nobody', async () => {
  const calls = []
  const searchers = {
    'serpapi-google-search': async () => {
      calls.push('serp')
      return []
    }
  }
  const found = await findMenuLinks(PLACE, {
    order: ['website', 'serpapi-google-search'],
    websiteMenus: [{ url: 'https://x.ae/menu' }],
    searchers
  })
  assert.deepEqual(found, { menus: [{ url: 'https://x.ae/menu' }], provider: 'website' })
  assert.deepEqual(calls, [])
})

test('findMenuLinks: a search first is asked first; a missing key or spent quota falls to the next', async () => {
  const calls = []
  const hit = [
    { title: 'Velvet Wonton Menu | Talabat', url: 'https://www.talabat.com/uae/velvet-wonton/menu' }
  ]
  const searchers = {
    'serpapi-google-search': async () => {
      calls.push('serp')
      throw Object.assign(new Error('q'), { code: 'QUOTA' })
    },
    'scrapecreators-google': async () => {
      calls.push('sc')
      return hit
    }
  }
  const found = await findMenuLinks(PLACE, {
    order: ['missing-key', 'serpapi-google-search', 'scrapecreators-google', 'website'],
    websiteMenus: [{ url: 'https://x.ae/menu' }],
    searchers
  })
  assert.deepEqual(calls, ['serp', 'sc'])
  assert.equal(found.provider, 'scrapecreators-google')
  assert.deepEqual(
    found.menus.map((m) => m.url),
    ['https://www.talabat.com/uae/velvet-wonton/menu']
  )
})

test('findMenuLinks: an empty order finds nothing, and a budget error is not swallowed', async () => {
  assert.deepEqual(
    await findMenuLinks(PLACE, { order: [], websiteMenus: [{ url: 'https://x.ae/menu' }], searchers: {} }),
    { menus: [], provider: null }
  )
  const budget = Object.assign(new Error('spent'), { name: 'BudgetExceededError' })
  await assert.rejects(
    findMenuLinks(PLACE, {
      order: ['scrapecreators-google'],
      searchers: {
        'scrapecreators-google': async () => {
          throw budget
        }
      },
      rethrow: (e) => e === budget
    }),
    budget
  )
})

test('SerpApi Google search reads organic results and names key and quota failures', async () => {
  let seen
  const fetch = async (url) => {
    seen = new URL(String(url))
    return new Response(
      JSON.stringify({ organic_results: [{ title: 'Menu', link: 'https://a.ae/menu', snippet: 's' }] }),
      { status: 200 }
    )
  }
  assert.deepEqual(await serpapiGoogleSearch('q', { key: 'sk', fetch }), [
    { title: 'Menu', url: 'https://a.ae/menu', description: 's' }
  ])
  assert.equal(seen.searchParams.get('engine'), 'google')
  assert.equal(seen.searchParams.get('api_key'), 'sk')
  const status = (n) => async () => new Response('{}', { status: n })
  await assert.rejects(serpapiGoogleSearch('q', { key: 'sk', fetch: status(401) }), {
    code: 'CREDENTIAL_INVALID'
  })
  await assert.rejects(serpapiGoogleSearch('q', { key: 'sk', fetch: status(429) }), { code: 'QUOTA' })
  await assert.rejects(serpapiGoogleSearch('q', { key: '' }), { code: 'CREDENTIAL_MISSING' })
})
