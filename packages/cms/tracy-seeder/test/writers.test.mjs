/**
 * The three writers and the shape of their dependency graph.
 *
 * The model half of a seed run used to be one straight line: posts, then six covers one after
 * another, then the sections — eight round trips awaited in order, 137 seconds measured on this
 * machine, all of it inside the four-minute wall the build stage puts around the seeder. Two of
 * those waits were for nothing: the sections turn needs no post, and the six covers need only
 * their own post's prompt.
 *
 * So the graph is: sections ‖ (posts → every cover at once). What is pinned here is the SHAPE —
 * what may overlap, what may not, and what a failure of one unit does to the others. The model is
 * a fake throughout; `chat` is a parameter for exactly this reason.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { drawCovers, runWriters, writePosts, writeSections } from '../src/writers.mjs'

const DOOR = { url: 'https://door', key: 'k', textModel: 'text-model', imageModel: 'image-model' }
const WORDS = { site: { name: 'Tasklist' }, about: 'A small bakery in Hanoi, open since 2019.' }

const post = (n) => ({
  title: `Post ${n}`,
  slug: `post-${n}`,
  excerpt: 'One line.',
  paragraphs: ['a'.repeat(200), 'b'.repeat(200), 'c'.repeat(200)],
  imagePrompt: `a photograph for post ${n}`
})

/** Six posts as the model would answer them: one JSON array. */
const postsAnswer = (n = 6) => ({
  text: JSON.stringify(Array.from({ length: n }, (_, i) => post(i + 1))),
  images: [],
  model: 'text-model'
})

/** Every slot answered, which is what `parseSectionsCopy` needs to accept the turn. */
const sectionsAnswer = () => ({
  text: JSON.stringify({
    hero: Object.fromEntries(HERO_SLOTS.map((id) => [id, 'A written line for this slot.']))
  }),
  images: [],
  model: 'text-model'
})

const imageAnswer = () => ({
  text: '',
  images: [{ mime: 'image/png', bytes: Buffer.from('png') }],
  model: 'image-model'
})

/**
 * One section fragment, shaped as the library's really are: the slots are derived from the tags
 * themselves (`fragmentSlots` → `h1.0`, `p.0`), never from an attribute.
 */
const SECTIONS = {
  hero: '<section><h1>One desk for every site you run</h1><p>A short lead sentence here.</p></section>'
}

/** The slot ids that fragment produces, so the fake answers every one of them. */
const HERO_SLOTS = ['h1.0', 'p.0']

/**
 * A `chat` that records what it was asked, when, and how many calls were in flight — the only way
 * to tell "these ran together" from "these ran in order" without watching a clock.
 */
function fakeChat(answer, { delay = 0 } = {}) {
  const calls = []
  let live = 0
  let peak = 0
  const chat = async (door, req) => {
    const at = calls.length
    calls.push({ model: req.model, images: Boolean(req.images), content: req.messages.at(-1)?.content ?? '' })
    live += 1
    peak = Math.max(peak, live)
    try {
      if (delay > 0) await new Promise((done) => setTimeout(done, delay))
      const said = typeof answer === 'function' ? answer(req, at) : answer
      if (said instanceof Error) throw said
      return said
    } finally {
      live -= 1
    }
  }
  return { chat, calls, peak: () => peak }
}

describe('writePosts', () => {
  it('asks once for the whole blog and gives back what the parser accepts', async () => {
    const { chat, calls } = fakeChat(postsAnswer())
    const said = await writePosts({ door: DOOR, words: WORDS, chat })
    assert.equal(calls.length, 1)
    assert.equal(calls[0].model, 'text-model')
    assert.equal(calls[0].images, false)
    assert.equal(said.posts.length, 6)
    assert.deepEqual(said.warnings, [])
  })

  it('a blog the parser refuses is a warning and an empty list, never a throw', async () => {
    const { chat } = fakeChat({ text: 'not json at all', images: [], model: 'text-model' })
    const said = await writePosts({ door: DOOR, words: WORDS, chat })
    assert.deepEqual(said.posts, [])
    assert.equal(said.warnings.length, 1)
    assert.ok(said.warnings[0].startsWith('blog: '))
  })

  it('a model that throws is a warning too', async () => {
    const { chat } = fakeChat(new Error('HTTP 500'))
    const said = await writePosts({ door: DOOR, words: WORDS, chat })
    assert.deepEqual(said.posts, [])
    assert.match(said.warnings[0], /blog: HTTP 500/)
  })
})

describe('drawCovers', () => {
  const six = Array.from({ length: 6 }, (_, i) => post(i + 1))

  it('draws every cover at once rather than one after another', async () => {
    const { chat, calls, peak } = fakeChat(imageAnswer(), { delay: 5 })
    const said = await drawCovers({ door: DOOR, posts: six, chat })
    assert.equal(calls.length, 6)
    assert.equal(said.images.size, 6)
    // The whole point: several in flight together. Serial would peak at 1.
    assert.ok(peak() > 1, `covers ran one at a time (peak ${peak()})`)
  })

  it('keeps no more than `limit` in flight, because a burst of six is untested against the provider', async () => {
    const { chat, peak } = fakeChat(imageAnswer(), { delay: 5 })
    await drawCovers({ door: DOOR, posts: six, chat, limit: 2 })
    assert.ok(peak() <= 2, `peak was ${peak()}, limit was 2`)
  })

  it('hands each cover over the moment it lands, so a run that dies keeps what it paid for', async () => {
    const kept = []
    const { chat } = fakeChat(imageAnswer(), { delay: 2 })
    await drawCovers({ door: DOOR, posts: six, chat, onCover: (slug, im) => kept.push([slug, im.mime]) })
    assert.equal(kept.length, 6)
    for (const [slug, mime] of kept) {
      assert.match(slug, /^post-\d$/)
      assert.equal(mime, 'image/png')
    }
  })

  it('one refused cover costs one cover, not the batch', async () => {
    const { chat } = fakeChat((req) =>
      req.messages.at(-1).content.includes('post 3') ? new Error('429') : imageAnswer()
    )
    const said = await drawCovers({ door: DOOR, posts: six, chat, retries: 0 })
    assert.equal(said.images.size, 5)
    assert.equal(said.images.has('post-3'), false)
    assert.equal(said.warnings.length, 1)
    assert.match(said.warnings[0], /cover of post-3: 429/)
  })

  it('an answer with no image in it says so, and is not counted as drawn', async () => {
    const { chat } = fakeChat({ text: 'here you go', images: [], model: 'image-model' })
    const said = await drawCovers({ door: DOOR, posts: [post(1)], chat, retries: 0 })
    assert.equal(said.images.size, 0)
    assert.match(said.warnings[0], /cover of post-1: the model answered without an image/)
  })

  it('retries a refusal before giving the cover up', async () => {
    let tries = 0
    const { chat } = fakeChat(() => {
      tries += 1
      return tries === 1 ? new Error('429 rate limited') : imageAnswer()
    })
    const said = await drawCovers({ door: DOOR, posts: [post(1)], chat, retries: 2, backoffMs: 1 })
    assert.equal(tries, 2)
    assert.equal(said.images.size, 1)
    assert.deepEqual(said.warnings, [])
  })

  it('a provider that cannot draw skips the whole step, and says why once', async () => {
    const { chat, calls } = fakeChat(imageAnswer())
    const said = await drawCovers({ door: { ...DOOR, imageModel: null }, posts: six, chat })
    assert.equal(calls.length, 0)
    assert.equal(said.images.size, 0)
    assert.equal(said.warnings.length, 1)
    assert.match(said.warnings[0], /covers: this provider does not draw/)
  })

  it('a post with no image prompt is passed over without a call', async () => {
    const { chat, calls } = fakeChat(imageAnswer())
    const said = await drawCovers({ door: DOOR, posts: [{ ...post(1), imagePrompt: '' }, post(2)], chat })
    assert.equal(calls.length, 1)
    assert.equal(said.images.size, 1)
    assert.ok(said.images.has('post-2'))
  })
})

describe('writeSections', () => {
  it('asks once and answers the copy the parser accepted', async () => {
    const { chat, calls } = fakeChat(sectionsAnswer())
    const said = await writeSections({ door: DOOR, words: WORDS, sections: SECTIONS, chat })
    assert.equal(calls.length, 1)
    assert.ok(said.copy)
    assert.deepEqual(said.warnings, [])
  })

  it('no sections to write is no call at all', async () => {
    const { chat, calls } = fakeChat(sectionsAnswer())
    const said = await writeSections({ door: DOOR, words: WORDS, sections: null, chat })
    assert.equal(calls.length, 0)
    assert.equal(said.copy, null)
  })
})

describe('runWriters — the graph', () => {
  /** A chat that answers by what it was asked for, and records the order things started. */
  function bench({ postsDelay = 20, sectionsDelay = 20, coverDelay = 5 } = {}) {
    const started = []
    const finished = []
    const chat = async (door, req) => {
      const kind = req.images
        ? 'cover'
        : req.messages[0].content.includes('sections of a landing page')
          ? 'sections'
          : 'posts'
      started.push(kind)
      const wait = kind === 'posts' ? postsDelay : kind === 'sections' ? sectionsDelay : coverDelay
      await new Promise((done) => setTimeout(done, wait))
      finished.push(kind)
      if (kind === 'cover') return imageAnswer()
      if (kind === 'posts') return postsAnswer()
      return sectionsAnswer()
    }
    return { chat, started, finished }
  }

  it('runs one text turn at a time: the blog, then the covers, then the sections', async () => {
    const { chat, started, finished } = bench({ postsDelay: 10, coverDelay: 5, sectionsDelay: 5 })
    await runWriters({ door: DOOR, words: WORDS, sections: SECTIONS, chat })
    // Overlapping the text turns was never observed to help and was twice observed alongside a
    // worse outcome (once a truncated answer the parser refused). The cover fan-out is the one
    // that measured well, every time. See the header of writers.mjs for all four runs.
    assert.equal(started[0], 'posts')
    assert.equal(started.at(-1), 'sections')
    assert.ok(finished.indexOf('posts') < started.indexOf('cover'), 'covers must wait for the blog')
    assert.equal(finished.filter((k) => k === 'cover').length, 6)
    assert.ok(
      finished.lastIndexOf('cover') < started.indexOf('sections'),
      'the sections turn must not overlap the covers'
    )
  })

  it('starts no cover before the blog is written, because a cover needs its post', async () => {
    const { chat, started, finished } = bench({ postsDelay: 30, coverDelay: 1 })
    await runWriters({ door: DOOR, words: WORDS, sections: SECTIONS, chat })
    const firstCover = started.indexOf('cover')
    assert.ok(firstCover >= 0, 'no cover was drawn')
    assert.ok(finished.includes('posts'), 'the blog never finished')
    assert.equal(finished.indexOf('posts') < firstCover ? true : finished[0] === 'posts', true)
  })

  it('gives back everything the three turns produced, in one shape', async () => {
    const { chat } = bench()
    const said = await runWriters({ door: DOOR, words: WORDS, sections: SECTIONS, chat })
    assert.equal(said.posts.length, 6)
    assert.equal(said.images.size, 6)
    assert.ok(said.sectionsCopy)
    assert.deepEqual(said.warnings, [])
  })

  it('no model key is one warning and no calls', async () => {
    const { chat, started } = bench()
    const said = await runWriters({ door: null, words: WORDS, sections: SECTIONS, chat })
    assert.equal(started.length, 0)
    assert.deepEqual(said.posts, [])
    assert.equal(said.warnings.length, 1)
    assert.match(said.warnings[0], /no model key/)
  })

  it('a blog that fails still lets the sections through', async () => {
    const chat = async (door, req) => {
      if (req.images) return imageAnswer()
      if (req.messages[0].content.includes('sections of a landing page')) return sectionsAnswer()
      throw new Error('the blog model is down')
    }
    const said = await runWriters({ door: DOOR, words: WORDS, sections: SECTIONS, chat })
    assert.deepEqual(said.posts, [])
    assert.equal(said.images.size, 0)
    assert.ok(said.sectionsCopy, 'the sections must survive a failed blog')
    assert.match(said.warnings.join(' '), /the blog model is down/)
  })

  it('reports each unit as it settles, not one summary at the end', async () => {
    const lines = []
    const { chat } = bench()
    await runWriters({ door: DOOR, words: WORDS, sections: SECTIONS, chat, log: (l) => lines.push(l) })
    assert.ok(lines.some((l) => l.startsWith('blog: 6 posts')))
    assert.ok(lines.some((l) => l.startsWith('sections: ')))
    // Per-cover lines are what a customer watching the task list needs; one summary tells them
    // nothing while six calls are in flight.
    assert.equal(lines.filter((l) => l.startsWith('cover ')).length, 6)
    assert.ok(lines.some((l) => l.startsWith('cover 6 of 6')))
  })
})
