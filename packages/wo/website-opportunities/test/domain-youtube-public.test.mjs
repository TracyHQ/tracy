import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectYoutubePublic, channelVideosUrl } from '../domain/youtube-public.mjs'

const resolve = async () => [{ address: '93.184.216.34', family: 4 }]
const vr = (id, title) => ({
  richItemRenderer: {
    content: {
      videoRenderer: {
        videoId: id,
        title: { runs: [{ text: title }] },
        thumbnail: {
          thumbnails: [
            { url: `https://i.ytimg.com/vi/${id}/default.jpg` },
            { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
          ]
        }
      }
    }
  }
})
const cont = (token) => ({
  continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token } } }
})

const INITIAL = {
  metadata: {
    channelMetadataRenderer: {
      title: 'Brewlet Coffee',
      description: 'Coffee from Hội An',
      externalId: 'UCabc123'
    }
  },
  contents: {
    twoColumnBrowseResultsRenderer: {
      tabs: [
        {
          tabRenderer: {
            content: {
              richGridRenderer: {
                contents: [vr('vid1', 'Making egg coffee'), vr('vid2', 'Our rooftop'), cont('TOKEN-1')]
              }
            }
          }
        }
      ]
    }
  }
}
const PAGE = `<!doctype html><html><head><script>ytcfg.set({"INNERTUBE_API_KEY":"KEY123","INNERTUBE_CLIENT_VERSION":"2.20261001.00.00"});</script>
<script>var ytInitialData = ${JSON.stringify(INITIAL)};</script></head><body></body></html>`

test('channelVideosUrl accepts handles and channel URLs', () => {
  assert.equal(channelVideosUrl('brewletcoffee'), 'https://www.youtube.com/@brewletcoffee/videos')
  assert.equal(channelVideosUrl('@brewletcoffee'), 'https://www.youtube.com/@brewletcoffee/videos')
  assert.equal(
    channelVideosUrl('https://www.youtube.com/@brewletcoffee'),
    'https://www.youtube.com/@brewletcoffee/videos'
  )
  assert.equal(
    channelVideosUrl('https://youtube.com/channel/UCabc123/featured'),
    'https://www.youtube.com/channel/UCabc123/videos'
  )
})

test('first page: videos, thumbnails, channel profile and a continuation cursor', async () => {
  const urls = []
  const fetch = async (url) => {
    urls.push(url)
    return new Response(PAGE, { headers: { 'content-type': 'text/html' } })
  }
  const r = await collectYoutubePublic('brewletcoffee', {}, { fetch, resolve })
  assert.equal(urls[0], 'https://www.youtube.com/@brewletcoffee/videos')
  assert.equal(r.source, 'youtube')
  assert.equal(r.status, 'partial')
  assert.deepEqual(r.profile, { name: 'Brewlet Coffee', bio: 'Coffee from Hội An', channelId: 'UCabc123' })
  assert.deepEqual(r.posts, [
    { id: 'vid1', url: 'https://www.youtube.com/watch?v=vid1', caption: 'Making egg coffee' },
    { id: 'vid2', url: 'https://www.youtube.com/watch?v=vid2', caption: 'Our rooftop' }
  ])
  assert.deepEqual(r.media.slice(0, 2), [
    {
      url: 'https://www.youtube.com/watch?v=vid1',
      kind: 'video',
      sourceUrl: 'https://www.youtube.com/watch?v=vid1',
      postId: 'vid1',
      caption: 'Making egg coffee'
    },
    {
      url: 'https://i.ytimg.com/vi/vid1/hqdefault.jpg',
      kind: 'image',
      sourceUrl: 'https://www.youtube.com/watch?v=vid1',
      postId: 'vid1',
      caption: 'Making egg coffee'
    }
  ])
  assert.equal(r.cursor.continuation, 'TOKEN-1')
  assert.equal(r.cursor.apiKey, 'KEY123')
  assert.deepEqual(r.coverage, { fetched: 2 })
})

test('resuming posts the continuation to youtubei browse and completes when no token is left', async () => {
  const calls = []
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) })
    return new Response(
      JSON.stringify({
        onResponseReceivedActions: [
          { appendContinuationItemsAction: { continuationItems: [vr('vid3', 'Live music')] } }
        ]
      }),
      { headers: { 'content-type': 'application/json' } }
    )
  }
  const cursor = { continuation: 'TOKEN-1', apiKey: 'KEY123', clientVersion: '2.20261001.00.00', fetched: 2 }
  const r = await collectYoutubePublic('brewletcoffee', { cursor }, { fetch, resolve })
  assert.equal(calls[0].url, 'https://www.youtube.com/youtubei/v1/browse?key=KEY123&prettyPrint=false')
  assert.deepEqual(calls[0].body, {
    context: { client: { clientName: 'WEB', clientVersion: '2.20261001.00.00' } },
    continuation: 'TOKEN-1'
  })
  assert.equal(r.status, 'complete')
  assert.equal(r.cursor, null)
  assert.deepEqual(
    r.posts.map((p) => p.id),
    ['vid3']
  )
  assert.deepEqual(r.coverage, { fetched: 3 })
})

test('a failed continuation keeps the cursor and reports partial', async () => {
  const fetch = async () => new Response('slow down', { status: 429 })
  const cursor = { continuation: 'TOKEN-1', apiKey: 'KEY123', clientVersion: 'x', fetched: 2 }
  const r = await collectYoutubePublic('brewletcoffee', { cursor }, { fetch, resolve })
  assert.equal(r.status, 'partial')
  assert.equal(r.reason, 'rate_limited')
  assert.deepEqual(r.cursor, cursor)
})

test('a page without ytInitialData (consent wall, missing channel) fails clearly', async () => {
  const fetch = async (url) =>
    url.includes('gone')
      ? new Response('', { status: 404 })
      : new Response('<html><body>Before you continue</body></html>', {
          headers: { 'content-type': 'text/html' }
        })
  assert.equal((await collectYoutubePublic('gone', {}, { fetch, resolve })).reason, 'not_found')
  const r = await collectYoutubePublic('walled', {}, { fetch, resolve })
  assert.equal(r.status, 'failed')
  assert.equal(r.reason, 'unparseable_page')
})

test('newer lockupViewModel layout is read too', async () => {
  const data = {
    contents: {
      x: [
        {
          lockupViewModel: {
            contentId: 'vid9',
            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            metadata: { lockupMetadataViewModel: { title: { content: 'New layout' } } },
            contentImage: {
              thumbnailViewModel: {
                image: {
                  sources: [
                    { url: 'https://i.ytimg.com/vi/vid9/a.jpg', width: 168 },
                    { url: 'https://i.ytimg.com/vi/vid9/b.jpg', width: 336 }
                  ]
                }
              }
            }
          }
        }
      ]
    }
  }
  const html = `<script>var ytInitialData = ${JSON.stringify(data)};</script>`
  const fetch = async () =>
    new Response(`<!doctype html>${html}`, { headers: { 'content-type': 'text/html' } })
  const r = await collectYoutubePublic('x', {}, { fetch, resolve })
  assert.equal(r.status, 'complete')
  assert.deepEqual(r.posts, [
    { id: 'vid9', url: 'https://www.youtube.com/watch?v=vid9', caption: 'New layout' }
  ])
  assert.equal(r.media[1].url, 'https://i.ytimg.com/vi/vid9/b.jpg')
})
