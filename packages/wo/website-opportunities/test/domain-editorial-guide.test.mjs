import assert from 'node:assert/strict'
import test from 'node:test'
import {
  composePost,
  editorialGuideText,
  POST_TOPICS,
  isPlaceholderText,
  PLACEHOLDER_POST,
  postIssues,
  postTopics,
  splitTopics,
  thinResearch
} from '../domain/editorial-guide.mjs'
import { sourceSpan, sourceText } from '../domain/source-span.mjs'

const research = {
  posts: [{ text: 'Our terrace opens this Friday.' }],
  menu: [
    { name: 'Lobster Roll', description: 'Maine lobster, brown butter', price: '$32' },
    { name: 'Negroni', category: 'Cocktails', price: '$14' },
    { name: 'Clam Chowder', price: '$12' }
  ],
  reviews: [{ text: 'Best lobster roll in town.', author: 'Ana P.' }],
  profile: { description: 'A family seafood shack since 1998.', address: '1 Pier Rd' }
}
const sources = [
  { id: 'part:menu', body: sourceText(research.menu) },
  { id: 'part:reviews', body: sourceText(research.reviews) },
  { id: 'part:posts', body: sourceText(research.posts) },
  { id: 'part:profile', body: sourceText(research.profile) }
]

test('topics: own posts first, then the story, dishes, reviews and drinks in turn, then the place', () => {
  assert.deepEqual(
    postTopics(research).map((t) => t.topic),
    ['own-post', 'story', 'dish', 'review', 'drink', 'dish', 'place']
  )
  assert.deepEqual(postTopics({}), [])
})

// The Willow Nook local build 16 (25/10/2026): no menu, no review, no post; a bio, the hours, the address and the
// business's own website. The old topics were two (story, visiting) for 22 template posts.
const thin = {
  name: 'The Willow Nook',
  profile: {
    name: 'The Willow Nook',
    bio: "Cafe and cocktail bar in Copenhagen's Latin Quarter. A collection of rooms, sofas, vintage furniture and cosy corners.",
    hours: ['Monday 09:00-22:00', 'Friday,Saturday 09:00-01:00'],
    address: 'Søbjørnsstræde 17, Copenhagen'
  },
  pages: [
    {
      sourceId: 'source:website:0',
      title: 'Reservations | The Willow Nook',
      text: 'The Willow Nook Reservations Groups of 5–20 people can send an online reservation request. Groups of 6–20 people are assigned to the Moroccan Room. The normal reservation duration is two hours.'
    },
    { sourceId: 'source:website:0', title: 'The Willow Nook', text: 'The Willow Nook Welcome.' }
  ]
}

test('topics: the place, its hours and each page of its website are topics of their own', () => {
  const topics = postTopics(thin)
  assert.deepEqual(
    topics.map((t) => t.topic),
    ['story', 'place', 'hours', 'page']
  )
  const page = topics.find((t) => t.topic === 'page')
  assert.equal(page.head, 'Reservations', 'a page heading without the business name')
  assert.equal(page.lines.length, 3)
  assert.ok(
    page.lines.every((l) => !l.startsWith('The Willow Nook')),
    'the repeated site name is stripped'
  )
})

test('splitTopics: fewer topics than posts are split into narrower ones from the same facts, never invented', () => {
  const topics = postTopics(thin)
  const lines = topics.flatMap((t) => t.lines)
  const split = splitTopics(topics, 22)
  assert.equal(
    split.length,
    lines.length,
    'split until every topic holds one fact; no fact is repeated or made up'
  )
  assert.deepEqual(split.flatMap((t) => t.lines).sort(), [...lines].sort())
  assert.deepEqual(splitTopics(topics, 2), topics, 'enough topics: nothing is split')
  assert.deepEqual(splitTopics([], 5), [])
})

test('composePost: a title, body and excerpt from the facts, never "Coming soon"; a review is not copied', () => {
  for (const topic of splitTopics(postTopics(thin), 22)) {
    const post = composePost(topic)
    assert.ok(post.title.length > 0 && post.title.length <= 70, post.title)
    assert.ok(post.body.startsWith(post.excerpt))
    for (const key of ['title', 'body', 'excerpt'])
      assert.equal(isPlaceholderText(post[key]), false, post[key])
    assert.deepEqual(
      postIssues({ ...post, topic: topic.topic }).filter((i) => i.path !== 'post.claims'),
      []
    )
  }
  assert.equal(composePost({ topic: 'review', lines: ['Best lobster roll in town.'] }), null)
  assert.equal(composePost({ topic: 'story', lines: [] }), null)
})

test('the prompt text is generated from the guide: every topic, no fixed length', () => {
  const text = editorialGuideText()
  for (const topic of POST_TOPICS) assert.ok(text.includes(topic.id), topic.id)
  assert.doesNotMatch(text, /\b\d+\s*[–-]\s*\d+\s*words\b/)
  assert.match(text, /Coming soon/)
})

const good = {
  topic: 'review',
  title: 'What Ana says about our lobster roll',
  body: '<p>Ana P. wrote: "Best lobster roll in town."</p><p>Our Lobster Roll is Maine lobster, brown butter.</p>',
  excerpt: 'Ana P. wrote: "Best lobster roll in town."',
  claims: [
    {
      text: 'Ana P. wrote: "Best lobster roll in town."',
      sourceRefs: [
        { sourceId: 'part:reviews', quote: 'Best lobster roll in town.' },
        { sourceId: 'part:reviews', quote: 'Ana P.' }
      ]
    },
    {
      text: 'Our Lobster Roll is Maine lobster, brown butter.',
      sourceRefs: [{ sourceId: 'part:menu', quote: 'Maine lobster, brown butter' }]
    }
  ]
}

test('a post whose every claim quotes the research passes', () => {
  assert.deepEqual(postIssues(good, sources), [])
})

test('a claim no research quote holds, an excerpt of its own, a review not kept: each refused', () => {
  const invented = structuredClone(good)
  invented.claims[1].sourceRefs[0].quote = 'Maine lobster, truffle butter'
  assert.deepEqual(
    postIssues(invented, sources).map((i) => i.path),
    ['post.claims[1].sourceRefs[0]']
  )
  const summary = { ...structuredClone(good), excerpt: 'A loved seafood spot.' }
  assert.deepEqual(
    postIssues(summary, sources).map((i) => i.path),
    ['post.excerpt']
  )
  const paraphrased = structuredClone(good)
  paraphrased.body = '<p>Ana P. loved it.</p><p>Our Lobster Roll is Maine lobster, brown butter.</p>'
  paraphrased.excerpt = 'Ana P. loved it.'
  paraphrased.claims[0].text = 'Ana P. loved it.'
  assert.ok(postIssues(paraphrased, sources).some((i) => i.path === 'post.body'))
  assert.ok(postIssues({ ...good, title: 'Coming soon' }, sources).some((i) => i.path === 'post.title'))
  assert.ok(postIssues({ ...good, claims: [] }, sources).some((i) => i.path === 'post.claims'))
})

test('a quote with bounds is held to them, as the quality dossier holds a fact', () => {
  const body = sources[1].body
  const start = body.indexOf('Ana P.')
  assert.equal(
    sourceSpan({ sourceId: 'part:reviews', quote: 'Ana P.', start, end: start + 6 }, sources).ok,
    true
  )
  assert.equal(
    sourceSpan({ sourceId: 'part:reviews', quote: 'Ana P.', start: start + 1, end: start + 7 }, sources).ok,
    false
  )
  // Without bounds the quote is found only when asked to locate it.
  assert.equal(sourceSpan({ sourceId: 'part:reviews', quote: 'Ana P.' }, sources).ok, false)
  assert.equal(sourceSpan({ sourceId: 'part:reviews', quote: 'Ana P.' }, sources, { locate: true }).ok, true)
})

test('thin research: a warning only when posts are left because the topics ran out', () => {
  assert.equal(thinResearch({ templatePosts: 22, written: 7, topics: 7 }).left, 15)
  assert.equal(thinResearch({ templatePosts: 22, written: 3, topics: 7 }), null)
  assert.equal(thinResearch({ templatePosts: 3, written: 3, topics: 7 }), null)
})

// The Willow Nook (lrsweep rig, 25/10/2026): twenty posts were TripAdvisor and Google reviews copied whole.
test('a post that copies a review is refused; one short attributed line in its own words passes', () => {
  const long =
    'We came for a quick coffee and stayed for three hours. The sofas are deep, the staff remember your name, and the cardamom buns are the best in Copenhagen.'
  const lr = [
    { id: 'part:reviews', body: sourceText([{ text: long, author: 'Ida V.' }]) },
    ...sources.slice(2)
  ]
  const copied = {
    topic: 'review',
    title: "Ida V.'s review",
    body: `<p>${long}</p><p>Ida V., Google</p>`,
    excerpt: long,
    claims: [{ text: long, sourceRefs: [{ sourceId: 'part:reviews', quote: long }] }]
  }
  const issues = postIssues(copied, lr).map((i) => i.path)
  assert.ok(issues.includes('post.body'), JSON.stringify(issues))
  assert.ok(issues.includes('post.claims'), JSON.stringify(issues))
  const line = 'the cardamom buns are the best in Copenhagen.'
  const own = {
    topic: 'review',
    title: 'Why guests stay all afternoon',
    body: `<p>Guests settle into our deep sofas and lose track of time. Ida V. wrote on Google: "${line}"</p>`,
    excerpt: 'Guests settle into our deep sofas and lose track of time.',
    claims: [
      { text: `Ida V. wrote on Google: "${line}"`, sourceRefs: [{ sourceId: 'part:reviews', quote: line }] }
    ]
  }
  assert.deepEqual(postIssues(own, lr), [])
  assert.match(editorialGuideText(), /never a review copied whole/)
})

test("the guide sends a post's words to its body field; the title is a row of its own", () => {
  const text = editorialGuideText()
  assert.doesNotMatch(text, /post_title\/post_content/)
  assert.match(text, /target its body field \(post_content on WordPress, introtext on Joomla\)/)
})

test('a post whose title or body is only a placeholder is refused, told to compose it from the research', () => {
  // The Willow Nook local build 15 (25/10/2026): 17 posts got "Coming soon" as title and body.
  for (const text of [
    'Coming soon',
    'Coming soon.',
    '<p>Coming soon</p><p>Coming soon.</p>',
    'TBD',
    'To be announced',
    'Details coming soon!'
  ])
    assert.equal(isPlaceholderText(text), true, text)
  for (const text of [
    '',
    'Our lobster roll is coming soon to the lunch menu.',
    'Lobster Roll — Market price'
  ])
    assert.equal(isPlaceholderText(text), false, text)
  for (const key of ['title', 'body']) {
    const issues = postIssues({ ...good, [key]: '<p>Coming soon.</p>' }, sources)
    const refused = issues.find((i) => i.path === `post.${key}`)
    assert.equal(refused?.message, PLACEHOLDER_POST)
    assert.match(PLACEHOLDER_POST, /composed from the research/)
  }
  assert.match(editorialGuideText(), /a post left showing only filler fails the check/)
})
