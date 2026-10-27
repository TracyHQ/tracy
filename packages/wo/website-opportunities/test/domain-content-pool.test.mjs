import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { contentPool } from '../domain/content-pool.mjs'

// Fictional captions in the shape the WO stand collects (19/10/2026), newest first, per source.
const POSTS = JSON.parse(readFileSync(new URL('./fixtures/content-pool-posts.json', import.meta.url), 'utf8'))
const NOW = '2026-10-19T00:00:00.000Z'
const FACTS = {
  'larch-house': { phone: '+84 235 000 0101', address: '14 Example Lane, Hoi An, Quang Nam' },
  tamarel: { phone: '+84 905 123 456', address: '27 Example Street, Hoi An' }
}
const poolOf = (place) => contentPool({ posts: POSTS[place], now: NOW, facts: FACTS[place] })

test('the footer a page repeats under its posts is cut from every body, and its links are kept as evidence', () => {
  const { items, links } = poolOf('larch-house')
  assert.ok(items.length >= 10)
  for (const it of items) {
    assert.doesNotMatch(it.body, /Reserve your table|Our Menu:|14 Example Lane|\+84 235/)
  }
  assert.ok(links.some((l) => l.url === 'https://www.thelarchhouse.example/menu' && l.kind === 'menu'))
  assert.ok(links.some((l) => /tablecheck\.com/.test(l.url) && l.kind === 'booking'))
})

test('a post published twice (the same words on one feed or on Facebook and Instagram) is one item naming both posts', () => {
  const { items } = poolOf('quillhaus')
  const jazz = items.filter((it) => /LADIES JAZZ NIGHT/.test(it.body))
  assert.equal(jazz.length, 1)
  assert.ok(jazz[0].posts.length >= 2)
  const wednesday = items.filter((it) => it.body.startsWith('Everyone’s talking about Wednesday nights'))
  assert.equal(wednesday.length, 1)
})

test('two posts alike in words but not in their date, price or place stay two items', () => {
  const posts = [
    {
      source: 'facebook',
      id: 'a',
      postedAt: '2026-09-01T00:00:00Z',
      caption: 'Sunday brunch with live music at the terrace, all you can eat.\n12 PM – 4 PM\nOnly AED 99'
    },
    {
      source: 'facebook',
      id: 'b',
      postedAt: '2026-10-01T00:00:00Z',
      caption: 'Sunday brunch with live music at the terrace, all you can eat.\n12 PM – 4 PM\nOnly AED 129'
    }
  ]
  assert.equal(contentPool({ posts, now: NOW }).items.length, 2)
})

test('a body keeps the post’s paragraphs and drops what speaks to the feed, not to a reader of a website', () => {
  const { items } = poolOf('les-ombrine')
  for (const it of items) {
    assert.doesNotMatch(
      it.body,
      /Tag (someone|the person)|in the comments|Save this|send it to someone|Dubai food • /i
    )
    assert.doesNotMatch(
      it.body,
      /ice cream Dubai, Dubai desserts|Dubai foodies, refreshing drinks/,
      'keyword list left in'
    )
  }
  const breakfast = items.find((it) => it.body.startsWith('Sundays just got a little more delicious'))
  assert.ok(breakfast.body.includes('\n\n'), 'paragraphs kept')
})

const find = (items, re) => items.find((it) => re.test(it.body) || re.test(it.title ?? ''))

test('each item says what it is about — dish, story, product, event, offer — and may be more than one', () => {
  const larch = poolOf('larch-house').items
  assert.ok(find(larch, /Eggs Benedict/).kinds.includes('dish'))
  assert.ok(find(larch, /first The Larch House opened its doors in 2011/).kinds.includes('story'))
  assert.ok(find(larch, /Magic Blend/).kinds.includes('product'))
  const quillhaus = poolOf('quillhaus').items
  const sushi = find(quillhaus, /^EVERY WEDNESDAY|Every Wednesday/)
  assert.ok(sushi.kinds.includes('event') && sushi.kinds.includes('offer'), JSON.stringify(sushi.kinds))
  const combo = find(poolOf('tamarel').items, /CHRISTMAS COMBO SPECIAL|Christmas Combo Special/)
  assert.ok(combo.kinds.includes('offer'))
})

test('a closure notice, a holiday greeting, a meme or a few words are never content', () => {
  const tamarel = poolOf('tamarel').items
  assert.equal(find(tamarel, /temporarily closed|official reopening/), undefined)
  assert.equal(find(tamarel, /Thank you for celebrating a warm Christmas/), undefined)
  assert.equal(find(poolOf('larch-house').items, /years of independence|Happy Reunification Day/), undefined)
  const emberOak = poolOf('ember-oak').items
  assert.equal(find(emberOak, /Pick me\. Choose me|Three hours of sleep/), undefined)
})

test('when an event or an offer runs is read from its words, never from the day it was posted', () => {
  const quillhaus = poolOf('quillhaus').items
  const show = find(quillhaus, /Table of Absence/)
  assert.deepEqual(
    { startsAt: show.temporal.startsAt, endsAt: show.temporal.endsAt, status: show.temporal.status },
    { startsAt: '2026-10-08', endsAt: '2026-10-29', status: 'active' }
  )
  const sushi = find(quillhaus, /^EVERY WEDNESDAY|Every Wednesday/)
  assert.equal(sushi.temporal.recurs, 'weekly')
  assert.equal(sushi.temporal.status, 'unknown', 'a weekly night posted weeks ago is not proof it still runs')
  const combo = find(poolOf('tamarel').items, /Christmas Combo/i)
  assert.equal(combo.temporal.status, 'past')
  assert.equal(find(poolOf('larch-house').items, /Eggs Benedict/).temporal, null)
})

test('words the post credits to someone else are marked as not the page’s own', () => {
  const credited = contentPool({
    posts: [
      {
        source: 'facebook',
        id: 'x',
        postedAt: '2025-12-01T00:00:00Z',
        caption:
          'Hoi An is peaceful, the food is authentic! We loved every dish of our dinner by the beach tonight.\n\n📸: Shoreline.lens'
      }
    ],
    now: NOW
  }).items[0]
  assert.equal(credited.authorship, 'credited')
  assert.equal(find(poolOf('larch-house').items, /Eggs Benedict/).authorship, 'page')
})

test('a title is the post’s own heading line, in plain letters; otherwise its first sentence, cut at a word', () => {
  const larch = poolOf('larch-house').items
  const door = find(larch, /The Blue Door/)
  assert.equal(door.title, 'The Blue Door')
  assert.doesNotMatch(door.body, /^The Blue Door/)
  for (const it of [...larch, ...poolOf('quillhaus').items]) {
    assert.ok(it.title.length > 0 && it.title.length <= 71, it.title)
    // A sentence cut at a word says so; a whole sentence or a clause does not.
    const first = it.body.split('\n')[0].replace(/\s+/g, ' ')
    if (it.title.endsWith('…')) assert.ok(first.startsWith(it.title.slice(0, -1).trim()), it.title)
    assert.doesNotMatch(it.title, /^[^a-z]*[A-Z]{4,}[^a-z]*$/, `shouting title: ${it.title}`)
  }
})

test('a first sentence too long for a title is cut at a word and ends with an ellipsis', () => {
  const long = poolOf('larch-house').items.filter((it) => it.title.endsWith('…'))
  assert.ok(long.length > 0, 'the fixture has at least one long untitled post')
  for (const it of long) assert.doesNotMatch(it.title, /\s…$/)
})

test('a job advert, a giveaway or a contest is never content', () => {
  const larch = poolOf('larch-house').items
  assert.equal(find(larch, /tuyển dụng|Is Hiring|JOIN OUR TEAM/i), undefined)
  assert.equal(find(poolOf('les-ombrine').items, /Giveaway|up for grabs/i), undefined)
})

test('a feed written mostly in one language keeps that language: a post in another is left out', () => {
  const larch = poolOf('larch-house').items
  assert.ok(
    larch.every((it) => it.lang === 'en'),
    larch
      .filter((it) => it.lang !== 'en')
      .map((it) => it.title)
      .join(' | ')
  )
  const vi = contentPool({
    posts: [
      {
        source: 'facebook',
        id: '1',
        caption:
          'Phở bò tái chín của quán được nấu từ xương ống hầm suốt mười hai tiếng, nước dùng trong và ngọt thanh vị quế hồi.'
      },
      {
        source: 'facebook',
        id: '2',
        caption:
          'Bánh mì nướng giòn với pa tê gan nhà làm, chả lụa và rau thơm tươi mỗi sáng, mời cả nhà ghé ăn sáng nhé.'
      }
    ],
    now: NOW
  }).items
  assert.deepEqual(
    vi.map((it) => it.lang),
    ['vi', 'vi']
  )
})

test('a story is a post that tells where the place comes from, not any post that says "family" or "since"', () => {
  const quillhaus = poolOf('quillhaus').items
  const dad = find(quillhaus, /Dad deserves/)
  assert.ok(!dad || !dad.kinds.includes('story'))
  assert.ok(
    find(poolOf('larch-house').items, /first The Larch House opened its doors in 2011/).kinds.includes(
      'story'
    )
  )
})

test('a line that is only a handle is never a title', () => {
  for (const it of poolOf('quillhaus').items) assert.doesNotMatch(it.title, /^@[\w.]+$/)
})

// #1780: a coaching business's posts are about lessons, sessions and classes; the filter knew only events, offers, dishes
// and products, and kept 1 post of 12. Template text the owner pasted ("[Your Location]") never reaches a page.
test('posts about classes, lessons, sessions, coaching and memberships are kept as service posts', () => {
  const caption = (id, text) => ({ source: 'instagram', id, postedAt: '2026-01-10T00:00:00Z', caption: text })
  const { items } = contentPool({
    now: NOW,
    facts: {},
    posts: [
      caption(
        'a',
        'Join our padel sessions in Dubai! Fun, fitness and community, all in one. For all ages and levels.'
      ),
      caption(
        'b',
        'Start your tennis journey with us! Whether you are a beginner or pro, our lessons are tailored to help you grow.'
      ),
      caption(
        'c',
        'Tennis for all ages and levels, from first swing to future champion. Join our classes and discover the game!'
      ),
      caption(
        'd',
        'Our monthly membership gives you two coaching visits a week and open court time on weekends.'
      ),
      caption(
        'e',
        'Join our customized fitness lessons and achieve your goals with expert guidance!\nLocation: [Your Location]\nFlexible scheduling, DM to book your first session!'
      )
    ]
  })
  assert.equal(items.length, 5)
  for (const it of items) assert.ok(it.kinds.includes('service'), `${it.posts[0].id}: ${it.kinds}`)
  const fitness = items.find((it) => it.posts[0].id === 'e')
  assert.doesNotMatch(fitness.body, /\[Your Location\]/)
  assert.match(fitness.body, /customized fitness lessons/)
})
