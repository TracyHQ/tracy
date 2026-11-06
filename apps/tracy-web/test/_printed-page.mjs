// Fixtures for the printed check: an invented swim school whose lesson page is article 7. The template prints the article's header
// picture in a figure, its video block (poster and play button) only when the video id is set, then the article text. The same picture
// also sits in the page's JSON-LD and a share meta, as a real page carries it. Nothing here is a real business, picture or template.
export const SITE = 'write-bench-printed.sites.example'
export const HEADER = 'images/tracy-content/1111aaaa.jpg'
export const POSTER = 'images/tracy-content/1111aaaa.jpg'
export const OTHER = 'images/tracy-content/2222bbbb.jpg'

const text = (id, role) => ({ id, type: 'text', role })

/** The kit: one kept page, its body block with a header frame and a video row (poster picture, video id). */
export const printedKit = () => ({
  pages: [
    {
      id: 'page-lessons',
      path: '/lessons/swim',
      blocks: { 1440: ['header', 'body-lessons'], 390: ['header', 'body-lessons'] }
    }
  ],
  blocks: [
    { id: 'header', slots: [text('block-1.1', 'editorial.button_label')], frames: [], lists: [] },
    {
      id: 'body-lessons',
      slots: [text('article-7.1', 'article.lead')],
      frames: [{ id: 'article-7.3', kind: 'photo' }],
      lists: [
        {
          id: 'article-7.video',
          rows: [
            {
              index: 0,
              slots: [
                { id: 'article-7.9', type: 'image', role: 'business.gallery_image' },
                text('article-7.10', 'business.video')
              ]
            }
          ]
        }
      ]
    }
  ]
})

export const keptPages = [{ id: 'page-lessons', path: '/lessons/swim' }]

const line = (slot, status, extra = {}) => ({
  slot,
  key: slot,
  owner: 'picture',
  status,
  reason: null,
  readBack: null,
  ...extra
})

/** The write report's lines: the plan keeps the poster and hides the video id. `videoId` set: the plan keeps the id too. */
export function printedLines({ poster = POSTER, videoId = null } = {}) {
  return [
    line('article-7.3', 'written', {
      part: 'picture',
      ordered: `${HEADER}#joomlaImage://local-images/x.jpg`
    }),
    line('article-7.9', 'written', { part: 'picture', ordered: poster }),
    videoId
      ? line('article-7.10', 'written', { owner: 'writer', ordered: videoId })
      : line('article-7.10', 'hidden', { owner: 'plan', reason: 'the plan hides this slot' }),
    line('article-7.1', 'written', {
      owner: 'writer',
      ordered: 'Swim lessons for <strong>every</strong> age'
    }),
    line('block-1.1', 'written', { owner: 'writer', ordered: 'Book a lesson' })
  ]
}

/** A site behind the door: article 7's row, read and written through content.get and content.update. */
export function printedSite({ fulltext = '<p>What a lesson looks like.</p>\n' } = {}) {
  const article = { id: 7, title: 'Swim lessons', fulltext, attribs: '{}' }
  const calls = []
  const site = {
    calls,
    article,
    video: { id: null, poster: POSTER, header: HEADER },
    updates: () => calls.filter((c) => c.action === 'content.update'),
    door: {
      async apply(call) {
        calls.push(call)
        if (call.action === 'content.get' && call.params.kind === 'article' && call.params.id === 7)
          return { ok: true, item: { ...article } }
        if (call.action === 'content.update' && call.params.id === 7) {
          Object.assign(article, call.params.fields)
          return { ok: true }
        }
        return { ok: false, error: 'not_found', message: `no ${call.params?.kind} ${call.params?.id}` }
      }
    },
    /** The page as the template prints it now. */
    async pageHtml(path) {
      if (path !== '/lessons/swim') return null
      const v = site.video
      const ld = JSON.stringify({ '@type': 'Article', image: v.poster, thumbnailUrl: v.header })
      return `<!doctype html><html><head><meta property="og:image" content="/${v.poster}">
<script type="application/ld+json">${ld}</script></head><body>
<header><a class="btn" href="/contact">Book a lesson</a></header>
<div class="bg-mask" data-src="/${v.poster}"></div>
<figure class="item-image"><img src="/${v.header}" itemprop="image"></figure>
<p class="lead">Swim lessons for <strong>every</strong> age</p>
<!-- VIDEO LEAD -->${v.id ? `<div class="media-lead"><img src="/${v.poster}"><a class="play" href="#${v.id}"></a></div>` : ''}<!-- // VIDEO LEAD -->
<div itemprop="articleBody">${article.fulltext}</div>
<script>var poster = '<img src="/${v.poster}">'</script>
</body></html>`
    }
  }
  return site
}
