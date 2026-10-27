import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  findSocialPages,
  matchSocialPage,
  searchPlaceOf,
  scrapeCreatorsGoogleSearch,
  socialQueries
} from '../domain/social-search.mjs'

const PLACE = {
  placeId: 'ChIJsundriftJBR',
  name: 'Sundrift Café',
  address: 'Shop 12, The Walk, Jumeirah Beach Residence, Dubai, United Arab Emirates',
  street: 'Shop 12, The Walk',
  locality: 'Dubai',
  phone: '+971 4 123 4567',
  socials: {}
}

const FB = 'https://www.facebook.com/sundriftjbr'

/** A search provider that answers once with `links`, recording each query. */
function searcher(links, seen = []) {
  return async (query) => {
    seen.push(query)
    return links
  }
}

test('searchPlaceOf: Google facts and the search seed give name, street, locality and phone', () => {
  const p = searchPlaceOf(
    {
      placeId: 'ChIJx',
      name: 'Pho Ba',
      website: 'https://www.facebook.com/phoba',
      addressComponents: [
        { longText: '14', types: ['street_number'] },
        { longText: 'Al Wasl Road', types: ['route'] },
        { longText: 'Dubai', types: ['locality', 'political'] }
      ]
    },
    { phone: '+971 4 555 0101', address: '14 Al Wasl Road, Dubai' }
  )
  assert.equal(p.name, 'Pho Ba')
  assert.equal(p.street, '14 Al Wasl Road')
  assert.equal(p.locality, 'Dubai')
  assert.equal(p.phone, '+971 4 555 0101')
  assert.deepEqual(
    p.socials,
    { facebook: 'https://www.facebook.com/phoba' },
    'a social "website" is a known social page'
  )
  assert.equal(p.website, undefined)
})

test('match: name + locality + the branch address on the page → confirmed, with its evidence', () => {
  const m = matchSocialPage(PLACE, { name: 'Sundrift Cafe JBR', address: 'Shop 12, The Walk, JBR, Dubai' })
  assert.equal(m.verdict, 'confirmed')
  assert.deepEqual(m.proofs, ['address'])
})

test('match: the branch phone on the page is a branch proof', () => {
  const m = matchSocialPage(PLACE, { name: 'Sundrift Café', city: 'Dubai', phone: '04 123 4567' })
  assert.equal(m.verdict, 'confirmed')
  assert.deepEqual(m.proofs, ['phone'])
})

test('match: a page linking the Maps entry of exactly this place is a branch proof', () => {
  const m = matchSocialPage(PLACE, {
    name: 'Sundrift Café',
    city: 'Dubai',
    links: ['https://www.google.com/maps/search/?api=1&query=x&query_place_id=ChIJsundriftJBR']
  })
  assert.equal(m.verdict, 'confirmed')
  assert.deepEqual(m.proofs, ['link'])
})

test('match: same name in the same city with no branch proof → pending, never confirmed', () => {
  const m = matchSocialPage(PLACE, { name: 'Sundrift Café', city: 'Dubai' })
  assert.equal(m.verdict, 'pending')
  assert.ok(m.reasons.includes('no_branch_proof'))
})

test('match: same name, same city, another branch address → pending (another branch)', () => {
  const m = matchSocialPage(PLACE, { name: 'Sundrift Café', address: 'Unit 3, Dubai Mall, Downtown, Dubai' })
  assert.equal(m.verdict, 'pending')
})

test("match: the chain's shared hotline only → pending", () => {
  const chain = { ...PLACE, phone: '+971 600 555 012' }
  const m = matchSocialPage(chain, { name: 'Sundrift Café', city: 'Dubai', phone: '600 555 012' })
  assert.equal(m.verdict, 'pending')
  assert.ok(m.reasons.includes('shared_phone'))
  const shared = { ...PLACE, sharedPhones: ['+971 4 123 4567'] }
  assert.equal(
    matchSocialPage(shared, { name: 'Sundrift Café', city: 'Dubai', phone: '04 123 4567' }).verdict,
    'pending'
  )
})

test("match: the chain's shared domain is not a branch link", () => {
  const m = matchSocialPage(
    { ...PLACE, website: 'https://sundrift.example/' },
    {
      name: 'Sundrift Café',
      city: 'Dubai',
      website: 'https://sundrift.example'
    }
  )
  assert.equal(m.verdict, 'pending')
})

test('match: a page in another city → rejected', () => {
  assert.equal(matchSocialPage(PLACE, { name: 'Sundrift Café', city: 'Abu Dhabi' }).verdict, 'rejected')
  const m = matchSocialPage(PLACE, {
    name: 'Sundrift Café',
    address: 'Shop 12, The Walk, Al Reem Island, Abu Dhabi'
  })
  assert.equal(m.verdict, 'rejected')
  assert.ok(m.reasons.includes('locality_mismatch'))
})

test('match: another name → rejected; a contradicting phone blocks confirmation', () => {
  assert.equal(matchSocialPage(PLACE, { name: 'Burger Palace', city: 'Dubai' }).verdict, 'rejected')
  const m = matchSocialPage(PLACE, {
    name: 'Sundrift Café',
    address: 'Shop 12, The Walk, Dubai',
    phone: '04 999 0000'
  })
  assert.equal(m.verdict, 'pending')
  assert.ok(m.reasons.includes('phone_differs'))
})

test('find: a place without a website finds its Facebook page with branch evidence', async () => {
  const seen = []
  const out = await findSocialPages(PLACE, {
    order: ['scrapecreators'],
    searchers: {
      scrapecreators: searcher(
        [
          { title: 'Sundrift Café JBR | Facebook', url: `${FB}/`, description: 'Sundrift Café, The Walk' },
          { title: 'Sundrift menu', url: 'https://www.zomato.com/dubai/sundrift/menu', description: '' }
        ],
        seen
      )
    },
    networks: ['facebook'],
    pageFacts: async (network, url) => {
      assert.equal(network, 'facebook')
      assert.equal(url, FB)
      return { name: 'Sundrift Café JBR', address: 'Shop 12, The Walk, JBR, Dubai', followers: 4000 }
    }
  })
  assert.equal(seen.length, 1)
  assert.match(seen[0], /Sundrift Café/)
  assert.match(seen[0], /Dubai/)
  assert.equal(out.confirmed.length, 1)
  const [hit] = out.confirmed
  assert.equal(hit.network, 'facebook')
  assert.equal(hit.url, FB)
  assert.equal(hit.provider, 'scrapecreators')
  assert.deepEqual(hit.evidence.proofs, ['address'])
  assert.equal(hit.evidence.query, seen[0])
  assert.deepEqual(out.pending, [])
})

test('find: a search snippet alone (no page facts) is pending, not a confirmed source', async () => {
  const out = await findSocialPages(PLACE, {
    order: ['jina'],
    searchers: {
      jina: searcher([
        { title: 'Sundrift Café Dubai', url: FB, description: 'Shop 12, The Walk, Dubai +971 4 123 4567' }
      ])
    },
    networks: ['facebook']
  })
  assert.deepEqual(out.confirmed, [])
  assert.equal(out.pending.length, 1)
  assert.ok(out.pending[0].evidence.reasons.includes('no_page_facts'))
})

test('find: a page in another city is dropped; the same name in the same city stays pending', async () => {
  const facts = {
    'https://www.facebook.com/sundriftad': { name: 'Sundrift Café', city: 'Abu Dhabi' },
    'https://www.facebook.com/sundriftdubai': { name: 'Sundrift Café', city: 'Dubai' }
  }
  const out = await findSocialPages(PLACE, {
    order: ['scrapecreators'],
    searchers: {
      scrapecreators: searcher(Object.keys(facts).map((url) => ({ title: 'Sundrift', url })))
    },
    networks: ['facebook'],
    pageFacts: async (_n, url) => facts[url]
  })
  assert.deepEqual(out.confirmed, [])
  assert.deepEqual(
    out.pending.map((p) => p.url),
    ['https://www.facebook.com/sundriftdubai']
  )
  assert.deepEqual(
    out.rejected.map((p) => p.url),
    ['https://www.facebook.com/sundriftad']
  )
})

test('find: networks the place already has are not searched; non-profile links are ignored', async () => {
  const seen = []
  const out = await findSocialPages(
    { ...PLACE, socials: { facebook: FB } },
    {
      order: ['scrapecreators'],
      searchers: {
        scrapecreators: searcher(
          [{ url: 'https://www.instagram.com/p/Cgrq261/' }, { url: 'https://www.facebook.com/other' }],
          seen
        )
      },
      networks: ['facebook', 'instagram'],
      pageFacts: async () => ({ name: 'Sundrift Café', address: 'Shop 12, The Walk, Dubai' })
    }
  )
  assert.ok(seen.length >= 1 && seen.every((q) => /instagram/i.test(q)), 'only instagram is searched')
  assert.deepEqual([...out.confirmed, ...out.pending, ...out.rejected], [])
})

test('find: falls to the next provider on credential/quota/error, not on not_found', async () => {
  const fail = (code) => async () => {
    throw Object.assign(new Error(code), { code })
  }
  const out = await findSocialPages(PLACE, {
    order: ['deepseek', 'jina', 'missing', 'scrapecreators', 'firecrawl'],
    searchers: {
      deepseek: fail('CREDENTIAL_INVALID'),
      jina: fail('QUOTA'),
      scrapecreators: async () => [],
      firecrawl: async () => {
        throw new Error('must not be called after not_found')
      }
    },
    networks: ['facebook'],
    pageFacts: async () => null
  })
  assert.deepEqual(
    out.tried
      .filter((t) => t.query === out.tried[0].query)
      .map((t) => [t.provider, t.status, t.reason ?? null]),
    [
      ['deepseek', 'skipped', 'credential_invalid'],
      ['jina', 'skipped', 'quota'],
      ['missing', 'skipped', 'credential_missing'],
      ['scrapecreators', 'not_found', null]
    ]
  )
})

test('find: an empty order searches nothing', async () => {
  const out = await findSocialPages(PLACE, {
    order: [],
    searchers: {
      jina: async () => {
        throw new Error('no')
      }
    }
  })
  assert.deepEqual(out.tried, [])
  assert.deepEqual(out.confirmed, [])
})

test('scrapeCreatorsGoogleSearch: one GET with the key in a header, links mapped', async () => {
  let call
  const links = await scrapeCreatorsGoogleSearch('Sundrift Café Dubai facebook', {
    key: 'sk-test',
    fetch: async (url, init) => {
      call = { url: String(url), init }
      return new Response(
        JSON.stringify({ success: true, results: [{ title: 'T', url: FB, description: 'D' }, { url: 7 }] }),
        { status: 200 }
      )
    }
  })
  assert.equal(new URL(call.url).pathname, '/v1/google/search')
  assert.equal(new URL(call.url).searchParams.get('query'), 'Sundrift Café Dubai facebook')
  assert.equal(call.init.headers['x-api-key'], 'sk-test')
  assert.deepEqual(links, [{ title: 'T', url: FB, description: 'D' }])
})

test('scrapeCreatorsGoogleSearch: errors carry contract codes', async () => {
  const at = (status, body = {}) =>
    scrapeCreatorsGoogleSearch('q', {
      key: 'k',
      fetch: async () => new Response(JSON.stringify(body), { status })
    }).then(
      () => null,
      (e) => e.code
    )
  assert.equal(
    await scrapeCreatorsGoogleSearch('q', {}).then(
      () => null,
      (e) => e.code
    ),
    'CREDENTIAL_MISSING'
  )
  assert.equal(await at(401), 'CREDENTIAL_INVALID')
  assert.equal(await at(402), 'QUOTA')
  assert.equal(await at(429), 'RATE_LIMITED')
  assert.equal(await at(500), 'PROVIDER_ERROR')
})

test('find: an error deps.rethrow claims (the budget running out) stops the search instead of falling through', async () => {
  class Spent extends Error {}
  const run = (pageFacts, search = async () => [{ url: FB }]) =>
    findSocialPages(PLACE, {
      order: ['scrapecreators', 'jina'],
      searchers: {
        scrapecreators: search,
        jina: async () => {
          throw new Error('must not be reached')
        }
      },
      networks: ['facebook'],
      pageFacts,
      rethrow: (e) => e instanceof Spent
    })
  await assert.rejects(
    run(
      async () => null,
      async () => {
        throw new Spent('budget')
      }
    ),
    Spent
  )
  await assert.rejects(
    run(async () => {
      throw new Spent('budget')
    }),
    Spent
  )
})

// The Tomaru case (dev, 24/10/2026): Instagram writes the name one letter short and drops the cuisine word.
const TOMARU = {
  placeId: 'ChIJtomaru',
  name: 'Tomaru Sushi Bar',
  street: 'Sarab 1B',
  locality: 'Dubai',
  phone: '+971 56 555 0146',
  socials: {}
}

test('match: a name one letter off with the branch phone → confirmed, marked name_near', () => {
  const m = matchSocialPage(TOMARU, { name: 'Tomar • Dubai', city: 'Dubai', phone: '056 555 0146' })
  assert.equal(m.verdict, 'confirmed')
  assert.deepEqual(m.proofs, ['phone'])
  assert.ok(m.reasons.includes('name_near'))
})

test('match: a name one letter off with no branch proof → pending, not rejected', () => {
  const m = matchSocialPage(TOMARU, { name: 'Tomar • Dubai', city: 'Dubai' })
  assert.equal(m.verdict, 'pending')
  assert.ok(m.reasons.includes('name_near'))
})

test('match: a name one letter off with only a short phone tail → pending', () => {
  const m = matchSocialPage(TOMARU, { name: 'Tomar • Dubai', city: 'Dubai', phone: '0146' })
  assert.equal(m.verdict, 'pending')
})

test('match: two letters off, or a short word one letter off → rejected', () => {
  assert.equal(
    matchSocialPage(TOMARU, { name: 'Toma Dubai', city: 'Dubai', phone: '056 555 0146' }).verdict,
    'rejected'
  )
  const pho = { ...TOMARU, name: 'Pho Ba' }
  assert.equal(
    matchSocialPage(pho, { name: 'Pho Bo', city: 'Dubai', phone: '056 555 0146' }).verdict,
    'rejected'
  )
})

test('match: a page that says it is closed is never confirmed', () => {
  const m = matchSocialPage(TOMARU, {
    name: 'Tomaru Sushi Bar',
    city: 'Dubai',
    phone: '056 555 0146',
    bio: 'TEMPORARILY CLOSED 🍣 Sushi & rolls'
  })
  assert.equal(m.verdict, 'pending')
  assert.ok(m.reasons.includes('page_closed'))
})

test("searchPlaceOf: the seed's shared phones reach the matcher", () => {
  const p = searchPlaceOf({ name: 'X' }, { phone: '+971 4 123 4567', sharedPhones: ['+971 4 123 4567'] })
  assert.deepEqual(p.sharedPhones, ['+971 4 123 4567'])
})

test('find: the first query finds nothing → the phone query finds the page', async () => {
  const seen = []
  const out = await findSocialPages(TOMARU, {
    order: ['scrapecreators'],
    networks: ['instagram'],
    searchers: {
      scrapecreators: async (q) => {
        seen.push(q)
        return q.includes('555') ? [{ url: 'https://www.instagram.com/tomardubai/' }] : []
      }
    },
    pageFacts: async () => ({ name: 'Tomar • Dubai', city: 'Dubai', phone: '056 555 0146' })
  })
  assert.equal(seen.length, 2)
  assert.match(seen[0], /Tomaru Sushi Bar Dubai instagram/)
  assert.match(seen[1], /555/)
  assert.equal(out.confirmed.length, 1)
  assert.equal(out.confirmed[0].evidence.query, seen[1])
})

test('find: a confirmed page on the first query runs no other query', async () => {
  const seen = []
  await findSocialPages(TOMARU, {
    order: ['scrapecreators'],
    networks: ['facebook'],
    searchers: {
      scrapecreators: async (q) => (seen.push(q), [{ url: 'https://www.facebook.com/tomarusushibar' }])
    },
    pageFacts: async () => ({ name: 'Tomaru Sushi Bar | Dubai', city: 'Dubai', phone: '056 555 0146' })
  })
  assert.equal(seen.length, 1)
})

test('find: at most three queries a network, each a priced search', async () => {
  const seen = []
  const out = await findSocialPages(TOMARU, {
    order: ['scrapecreators'],
    networks: ['instagram'],
    searchers: { scrapecreators: async (q) => (seen.push(q), []) },
    pageFacts: async () => null
  })
  assert.equal(seen.length, 3)
  assert.equal(new Set(seen).size, 3)
  assert.deepEqual(out.searched, { instagram: { status: 'not_found', queries: 3 } })
})

test('find: every provider failing a network reports it failed, not not_found', async () => {
  const out = await findSocialPages(TOMARU, {
    order: ['scrapecreators'],
    networks: ['facebook', 'instagram'],
    searchers: {
      scrapecreators: async (q) => {
        if (q.includes('instagram')) throw Object.assign(new Error('t'), { code: 'TIMEOUT' })
        return []
      }
    },
    pageFacts: async () => null
  })
  assert.equal(out.searched.facebook.status, 'not_found')
  assert.equal(out.searched.instagram.status, 'failed')
  assert.equal(out.searched.instagram.reason, 'timeout')
})

// Tin Lantern Saigon (stand, 24/10/2026): one ScrapeCreators search got no answer, the same query 2 s later found the page.
test('find: a search that got no answer is asked once more before the network is reported failed', async () => {
  const IG_PAGE = 'https://www.instagram.com/tomardubai'
  const noAnswer = Object.assign(new Error('scrapecreators: request failed'), {
    code: 'PROVIDER_ERROR',
    noAnswer: true
  })
  for (const first of [noAnswer, Object.assign(new Error('t'), { code: 'TIMEOUT' })]) {
    const seen = []
    const out = await findSocialPages(TOMARU, {
      order: ['scrapecreators'],
      networks: ['instagram'],
      searchers: {
        scrapecreators: async (q) => {
          seen.push(q)
          if (seen.length === 1) throw first
          return [{ url: IG_PAGE }]
        }
      },
      pageFacts: async () => ({ name: 'Tomar • Dubai', city: 'Dubai', phone: '056 555 0146' })
    })
    assert.deepEqual(seen, [seen[0], seen[0]], 'the same query, twice')
    assert.equal(out.searched.instagram.status, 'confirmed', first.code)
    assert.equal(out.searched.instagram.queries, 1)
  }
})

test('find: a second silence fails that query, every query silent fails the network; a refusal is never asked twice', async () => {
  const calls = { timeout: 0, quota: 0 }
  const out = await findSocialPages(TOMARU, {
    order: ['scrapecreators'],
    networks: ['instagram'],
    searchers: {
      scrapecreators: async () => {
        calls.timeout += 1
        throw Object.assign(new Error('t'), { code: 'TIMEOUT' })
      }
    },
    pageFacts: async () => null
  })
  assert.equal(calls.timeout, 2 * socialQueries(TOMARU, 'instagram').length)
  assert.deepEqual(out.searched.instagram, { status: 'failed', queries: 0, reason: 'timeout' })
  for (const code of ['QUOTA', 'CREDENTIAL_INVALID']) {
    calls.quota = 0
    await findSocialPages(TOMARU, {
      order: ['scrapecreators'],
      networks: ['instagram'],
      searchers: {
        scrapecreators: async () => {
          calls.quota += 1
          throw Object.assign(new Error('x'), { code })
        }
      },
      pageFacts: async () => null
    })
    assert.equal(calls.quota, 1, code)
  }
})

test('scrapeCreatorsGoogleSearch: a request that got no HTTP answer says so', async () => {
  const e = await scrapeCreatorsGoogleSearch('q', {
    key: 'k',
    fetch: async () => {
      throw new TypeError('fetch failed')
    }
  }).catch((x) => x)
  assert.equal(e.code, 'PROVIDER_ERROR')
  assert.equal(e.noAnswer, true)
  const http = await scrapeCreatorsGoogleSearch('q', {
    key: 'k',
    fetch: async () => new Response('{}', { status: 500 })
  }).catch((x) => x)
  assert.equal(http.noAnswer, undefined)
})

// Tin Lantern Saigon / Reverb (stand, 24/10/2026, reproduced live): ScrapeCreators answers "no results" with HTTP 404
// `{error: 'not_found', credits_charged: 0}`; read as a provider error it ended the network before its other queries.
test('scrapeCreatorsGoogleSearch: a 404 "no results" is an empty answer, marked not charged', async () => {
  const body = {
    success: false,
    credits_charged: 0,
    error: 'not_found',
    errorStatus: 404,
    message: 'No Google search results found. You were not charged for this request.'
  }
  const links = await scrapeCreatorsGoogleSearch('q', {
    key: 'k',
    fetch: async () => new Response(JSON.stringify(body), { status: 404 })
  })
  assert.deepEqual([...links], [])
  assert.equal(links.charged, false)
})

test('scrapeCreatorsGoogleSearch: 5xx, a rate limit and an unreadable body are transient; no credit and a bad key are not', async () => {
  const at = (status, body = '{}') =>
    scrapeCreatorsGoogleSearch('q', { key: 'k', fetch: async () => new Response(body, { status }) }).catch(
      (e) => e
    )
  for (const [status, body, code] of [
    [500, '{}', 'PROVIDER_ERROR'],
    [503, 'oops', 'PROVIDER_ERROR'],
    [200, '<html>', 'PROVIDER_ERROR'],
    [429, '{}', 'RATE_LIMITED']
  ]) {
    const e = await at(status, body)
    assert.equal(e.code, code, `${status}`)
    assert.equal(e.transient, true, `${status}`)
  }
  for (const [status, code] of [
    [401, 'CREDENTIAL_INVALID'],
    [402, 'QUOTA']
  ]) {
    const e = await at(status)
    assert.equal(e.code, code)
    assert.equal(e.transient, undefined)
  }
})

test('find: a query every provider failed on twice falls through to the next query', async () => {
  const seen = []
  const out = await findSocialPages(PLACE, {
    order: ['scrapecreators'],
    networks: ['facebook'],
    searchers: {
      scrapecreators: async (q) => {
        seen.push(q)
        if (seen.length <= 2) throw Object.assign(new Error('x'), { code: 'PROVIDER_ERROR', transient: true })
        return [{ url: FB }]
      }
    },
    pageFacts: async () => ({
      name: 'Sundrift Café',
      address: 'Shop 12, The Walk, Jumeirah Beach Residence',
      city: 'Dubai',
      phone: '+971 4 123 4567'
    })
  })
  assert.equal(seen[0], seen[1], 'the failed query is asked once more')
  assert.notEqual(seen[2], seen[0], 'then the next query')
  assert.equal(out.searched.facebook.status, 'confirmed')
  assert.equal(out.searched.facebook.queries, 1)
})

test('find: a rate limit is asked once more after a pause', async () => {
  const waits = []
  let calls = 0
  const out = await findSocialPages(PLACE, {
    order: ['scrapecreators'],
    networks: ['facebook'],
    wait: async (ms) => {
      waits.push(ms)
    },
    searchers: {
      scrapecreators: async () => {
        calls += 1
        if (calls === 1) throw Object.assign(new Error('x'), { code: 'RATE_LIMITED', transient: true })
        return []
      }
    },
    pageFacts: async () => null
  })
  assert.equal(waits.length, 1)
  assert.ok(waits[0] > 0)
  assert.equal(out.tried[0].status, 'not_found')
})

test('find: a permanent refusal (no credit, bad key) stops the network with its reason', async () => {
  for (const [code, reason] of [
    ['QUOTA', 'quota'],
    ['CREDENTIAL_INVALID', 'credential_invalid']
  ]) {
    let calls = 0
    const out = await findSocialPages(PLACE, {
      order: ['scrapecreators'],
      networks: ['facebook'],
      searchers: {
        scrapecreators: async () => {
          calls += 1
          throw Object.assign(new Error('x'), { code })
        }
      },
      pageFacts: async () => null
    })
    assert.equal(calls, 1, code)
    assert.deepEqual(out.searched.facebook, { status: 'failed', queries: 0, reason })
  }
})

// Tomaru Sushi Bar (dev, place f0e9664d…, 24/10/2026): Google Place Details as fetched, the city in Arabic.
const TOMARU_FACTS = {
  placeId: 'ChIJ_qt6cq6gIk1C4RbXt0lIMkX',
  name: 'Tomaru Sushi Bar',
  addressComponents: [
    { longText: 'Emirates Accommodation Sarab 1B', languageCode: 'ar-Latn' },
    {
      types: ['neighborhood', 'political'],
      longText: 'Al Barari',
      shortText: 'Al Barari',
      languageCode: 'en'
    },
    {
      types: ['sublocality_level_1', 'sublocality', 'political'],
      longText: 'وادي الصفا 3',
      languageCode: 'ar'
    },
    { types: ['locality', 'political'], longText: 'دبي', shortText: 'دبي', languageCode: 'ar' },
    {
      types: ['administrative_area_level_1', 'political'],
      longText: 'دبي',
      shortText: 'دبي',
      languageCode: 'ar'
    },
    { types: ['country', 'political'], longText: 'United Arab Emirates', shortText: 'AE', languageCode: 'en' }
  ]
}
const TOMARU_SEED = {
  address: 'Emirates Accommodation Sarab 1B - وادي الصفا 3 - Al Barari - دبي - United Arab Emirates',
  phone: '056 555 0146'
}
// The page as ScrapeCreators read it on 24/10/2026.
const TOMARU_FB_PAGE = {
  name: 'Tomaru Sushi Bar',
  address: 'Emirates Accommodation Sarab 1B, Al Barari, Dubai, United Arab Emirates',
  phone: '+971 56 555 0146',
  website: 'http://www.tomarusushibar.example/'
}

test('searchPlaceOf: a city in another script than the name is left out; the Latin areas and the country stay', () => {
  const p = searchPlaceOf(TOMARU_FACTS, TOMARU_SEED)
  assert.equal(p.locality, undefined)
  assert.deepEqual(p.localities, ['Al Barari'])
  assert.equal(p.country, 'AE')
})

test('searchPlaceOf: a name and city in the same non-Latin script keep the city', () => {
  const p = searchPlaceOf({
    name: 'すし処 銀座',
    addressComponents: [
      { types: ['locality', 'political'], longText: '中央区' },
      { types: ['country', 'political'], longText: '日本', shortText: 'JP' }
    ]
  })
  assert.equal(p.locality, '中央区')
  assert.equal(p.country, 'JP')
})

test('match: a page naming one of the Latin areas (the neighbourhood) matches the locality', () => {
  const m = matchSocialPage(searchPlaceOf(TOMARU_FACTS, TOMARU_SEED), TOMARU_FB_PAGE)
  assert.equal(m.verdict, 'confirmed')
  assert.deepEqual(m.proofs, ['phone'])
})

test("find: every search carries the place's country, and no query carries a city in another script", async () => {
  const seen = []
  const found = await findSocialPages(searchPlaceOf(TOMARU_FACTS, TOMARU_SEED), {
    order: ['serp'],
    networks: ['facebook'],
    searchers: {
      serp: async (query, where) => {
        seen.push({ query, where })
        return [
          { title: 'Tomaru Sushi Bar | Dubai', url: 'https://www.facebook.com/tomarusushibar.example/' }
        ]
      }
    },
    pageFacts: async () => TOMARU_FB_PAGE
  })
  assert.deepEqual(seen, [{ query: 'Tomaru Sushi Bar facebook', where: { country: 'AE' } }])
  assert.equal(found.searched.facebook.status, 'confirmed')
  assert.equal(found.confirmed[0].url, 'https://www.facebook.com/tomarusushibar.example')
})

test('scrapeCreatorsGoogleSearch: a country becomes the region parameter', async () => {
  let call
  await scrapeCreatorsGoogleSearch('q', {
    key: 'k',
    country: 'ae',
    fetch: async (url) => {
      call = new URL(String(url))
      return new Response(JSON.stringify({ results: [] }), { status: 200 })
    }
  })
  assert.equal(call.searchParams.get('region'), 'AE')
})

// Tomaru Sushi Bar (dev, Research again job 7036a8f9, 24/10/2026, replayed live): the city comes in another script, so
// the name query has no city; the phone query, asked as from the place's country, has no Google result, and
// ScrapeCreators says so with HTTP 404. Read as a provider error that ended the network after one query, so the
// `site:` query never ran. Any place whose phone search finds nothing must still reach its next query.
test('find: a phone search with no result (ScrapeCreators 404) still lets the site: query find the page', async () => {
  const place = searchPlaceOf(
    {
      name: 'Tomaru Sushi Bar',
      addressComponents: [
        { longText: 'دبي', types: ['locality'] },
        { longText: 'AE', shortText: 'AE', types: ['country'] }
      ]
    },
    { phone: '056 555 0146' }
  )
  const asked = []
  const PAGE = 'https://www.facebook.com/tomarusushibardubai'
  const sc = (query, where) =>
    scrapeCreatorsGoogleSearch(query, {
      key: 'k',
      ...where,
      fetch: async (url) => {
        const q = new URL(url).searchParams.get('query')
        asked.push([q, new URL(url).searchParams.get('region')])
        if (q.includes('site:'))
          return Response.json({ success: true, results: [{ title: 'Tomaru Sushi Bar | Dubai', url: PAGE }] })
        if (q.includes('"'))
          return Response.json({ success: false, credits_charged: 0, error: 'not_found' }, { status: 404 })
        return Response.json({ success: true, results: [] })
      }
    })
  const out = await findSocialPages(place, {
    order: ['scrapecreators'],
    networks: ['facebook'],
    searchers: { scrapecreators: sc },
    pageFacts: async () => ({
      name: 'Tomaru Sushi Bar | Dubai',
      address: 'Emirates Accommodation Sarab 1B, Al Barari, Dubai',
      phone: '0565550146'
    })
  })
  assert.deepEqual(asked, [
    ['Tomaru Sushi Bar facebook', 'AE'],
    ['"056 555 0146" facebook', 'AE'],
    ['tomaru site:facebook.com', 'AE']
  ])
  assert.equal(out.searched.facebook.queries, 3)
  // Found, with the branch phone as proof; the city Google gave in another script leaves it for a person to confirm.
  const found = out.pending.find((p) => p.url === PAGE)
  assert.deepEqual([found?.evidence.proofs, found?.evidence.reasons], [['phone'], ['locality_unknown']])
})
