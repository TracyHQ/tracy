/**
 * The three writers of a seed run, and the graph they run in.
 *
 * THE SHAPE, and why it is not a straight line. The model half used to be eight round trips awaited
 * in order — the blog, then six covers one after another, then the words of the sections. Measured
 * on this machine 09/09: 70 s for the blog, 27 s for the covers, 40 s for the sections, 137 s in
 * all, inside the FOUR-MINUTE wall `tracy-site-build` puts around the seeder (`index.ts`,
 * `RUN_TIMEOUT_MS`). Two of those waits bought nothing:
 *
 *   - the sections turn reads `words` and the fragments. It never looks at a post.
 *   - each cover reads its own post's `imagePrompt`. It never looks at another cover.
 *
 * So the graph SHOULD have been `sections ‖ (posts → every cover at once)`. Only the covers fan
 * out, and what the four measured runs of 09/09 say is worth more than the arrangement itself.
 *
 * ⚠ THE COVERS ARE THE ONLY FAN-OUT THAT PAID. Six of them together landed in 10–12 s against
 * 27 s one after another, and that held across every run. They are short, uniform, and they
 * contend only with each other, which `limit` bounds.
 *
 * ⚠ THE TEXT TURNS ARE LEFT ALONE, on evidence that is suggestive rather than conclusive. Started
 * beside the blog, the sections turn went 40 s → 197 s and the run got slower than the straight
 * line it replaced. Started beside the six covers — a different model, the same key — it came back
 * as something the parser refused outright: `no JSON object of sections in the answer`. A slow
 * answer is a nuisance; a truncated one costs the customer every word on the page.
 *
 * ⚠ BUT THE TEXT MODEL'S OWN LATENCY SWINGS FAR MORE THAN ANY OF THAT. Across four runs the blog
 * took 19 s, 70 s, 70 s and 98 s, and the sections 40 s, 89 s, 104 s and 146 s — the last of those
 * running entirely alone. Four samples cannot separate contention from a provider having a bad
 * minute. What is claimed here is only this: overlapping the text turns was never observed to
 * help, and was twice observed alongside a worse outcome, so they are serialised and the one
 * fan-out that measured well is kept. Anyone with a better instrument should re-measure.
 *
 * 🔒 THE ONE REAL ORDER IS POSTS → COVERS, and it is a data dependency, not a preference: a cover
 * is drawn from the prompt the blog model wrote for that post. Everything else may overlap.
 *
 * 🔒 COVERS GO OUT UNDER A VALVE. Six image calls at once is untested against this key — the code
 * has only ever made one at a time, there is no 429 handling anywhere below `chat`, and a refused
 * cover today is simply a lost cover. `limit` keeps a few in flight and `retries` gives a refusal
 * a second chance, rather than trading a slow build for a build with four covers.
 *
 * 🔒 EACH COVER IS HANDED OVER THE MOMENT IT LANDS (`onCover`). The cache used to be written once,
 * after all eight calls returned: a run that died in the sections turn threw away six images it
 * had already paid for (~$0.03 each). The caller writes each file as it arrives.
 *
 * `chat` is a parameter, not an import, so every one of these is testable without a network.
 */
import {
  buildPostsPrompt,
  buildSectionsPrompt,
  parsePosts,
  parseSectionsCopy
} from '../../../design/tracy-design-inspiration/src/host/seed-copy.mjs'
import { fragmentSlots, stripBlocks } from '../../../design/tracy-design-inspiration/src/host/seed-dom.mjs'

/** How many covers may be in flight at once. */
const COVER_LIMIT = 3
/** How many times a refused cover is asked for again. */
const COVER_RETRIES = 1
/** How long to wait before asking again, doubled per attempt. */
const COVER_BACKOFF_MS = 1500

/** @typedef {{ url: string, key: string, textModel: string, imageModel: string | null }} Door */
/** @typedef {(door: Door, req: { model: string, messages: unknown[], images?: boolean }) => Promise<{ text: string, images: { mime: string, bytes: Buffer }[], model: string }>} Chat */

const reason = (error) => (error instanceof Error ? error.message : String(error))

/**
 * The blog: one turn for the whole set.
 *
 * ⚠ ONE TURN, NOT SIX. The prompt asks for five to seven posts in one answer and the parser refuses
 * the batch below five (`seed-copy.mjs`) — those two together are what keeps the posts from
 * repeating each other, since nothing in the prompt tells the model to make them different. Six
 * independent calls with the same brief would give six near-identical posts, and slug uniquing
 * happens inside ONE parse, so they could collide and overwrite each other's covers.
 * @param {{ door: Door, words: object, count?: number, chat: Chat, log?: (line: string) => void }} o
 * @returns {Promise<{ posts: object[], warnings: string[] }>}
 */
export async function writePosts({ door, words, count = 6, chat, log = () => {} }) {
  try {
    const answer = await chat(door, { model: door.textModel, messages: buildPostsPrompt({ words, count }) })
    const parsed = parsePosts(answer.text)
    if (!parsed.ok) return { posts: [], warnings: [`blog: ${parsed.error}`] }
    log(`blog: ${parsed.posts.length} posts (${answer.model})`)
    return { posts: parsed.posts, warnings: [] }
  } catch (error) {
    return { posts: [], warnings: [`blog: ${reason(error)}`] }
  }
}

/**
 * The covers: one short turn per post, several at a time.
 *
 * ⚠ ONE PER CALL, NOT SIX IN ONE. Measured 07/09: asked for six posts and six covers in a single
 * answer, the image model wrote the posts and drew nothing. Asked for one cover on its own, it
 * draws. That measurement is why this is a loop at all.
 * @param {{
 *   door: Door, posts: object[], chat: Chat, log?: (line: string) => void,
 *   limit?: number, retries?: number, backoffMs?: number,
 *   onCover?: (slug: string, image: { mime: string, bytes: Buffer }) => void
 * }} o
 * @returns {Promise<{ images: Map<string, { mime: string, bytes: Buffer }>, warnings: string[] }>}
 */
export async function drawCovers({
  door,
  posts,
  chat,
  log = () => {},
  limit = COVER_LIMIT,
  retries = COVER_RETRIES,
  backoffMs = COVER_BACKOFF_MS,
  onCover
}) {
  /** @type {Map<string, { mime: string, bytes: Buffer }>} */
  const images = new Map()
  const warnings = []
  if (!door.imageModel)
    return { images, warnings: ['covers: this provider does not draw, so the posts go out without one'] }

  const wanted = posts.filter((p) => p?.imagePrompt)
  if (wanted.length === 0) return { images, warnings }

  let drawn = 0
  /** One cover, with a second chance: a refusal here is usually a rate limit, not a bad prompt. */
  const draw = async (post) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const answer = await chat(door, {
          model: door.imageModel,
          images: true,
          messages: [
            {
              role: 'user',
              content: `Generate one photographic cover image, landscape, no text or letters in the image: ${post.imagePrompt}`
            }
          ]
        })
        if (!answer.images[0]) {
          warnings.push(`cover of ${post.slug}: the model answered without an image`)
          return
        }
        images.set(post.slug, answer.images[0])
        onCover?.(post.slug, answer.images[0])
        drawn += 1
        log(`cover ${drawn} of ${wanted.length} (${post.slug})`)
        return
      } catch (error) {
        if (attempt >= retries) {
          warnings.push(`cover of ${post.slug}: ${reason(error)}`)
          return
        }
        await new Promise((done) => setTimeout(done, backoffMs * 2 ** attempt))
      }
    }
  }

  // The valve: `limit` workers pulling from one queue, so the burst never exceeds it and a slow
  // cover does not hold up the ones behind it.
  const queue = [...wanted]
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    for (;;) {
      const post = queue.shift()
      if (!post) return
      await draw(post)
    }
  })
  await Promise.all(workers)
  return { images, warnings }
}

/**
 * The words of the section library's landing, one text per slot. Reads `words` and the fragments,
 * nothing else — yet it still runs last and alone, for the provider-side reason in the header.
 * @param {{ door: Door, words: object, sections: Record<string, string> | null, chat: Chat, log?: (line: string) => void }} o
 * @returns {Promise<{ copy: object | null, warnings: string[] }>}
 */
export async function writeSections({ door, words, sections, chat, log = () => {} }) {
  if (!sections) return { copy: null, warnings: [] }
  try {
    const slots = Object.fromEntries(
      Object.entries(sections).map(([name, html]) => [name, fragmentSlots(stripBlocks(html))])
    )
    const answer = await chat(door, {
      model: door.textModel,
      messages: buildSectionsPrompt({ words, sections: slots })
    })
    const parsed = parseSectionsCopy(answer.text, slots)
    if (!parsed.ok) return { copy: null, warnings: [`sections: ${parsed.error}`] }
    log(
      `sections: ${Object.keys(parsed.copy).length} sections written, ${parsed.missing.length} slots left as drawn (${answer.model})`
    )
    return { copy: parsed.copy, warnings: [] }
  } catch (error) {
    return { copy: null, warnings: [`sections: ${reason(error)}`] }
  }
}

/**
 * The whole model half of a run, in its dependency graph.
 *
 * A failure of one branch never takes the other down: a blog the model refused still leaves a site
 * with written sections, and sections that failed still leave it with a blog. Every failure is a
 * warning the caller logs and records; none of them throws.
 * @param {{
 *   door: Door | null, words: object, sections: Record<string, string> | null, chat: Chat,
 *   count?: number, log?: (line: string) => void, limit?: number, retries?: number, backoffMs?: number,
 *   onPosts?: (posts: object[]) => void,
 *   onCover?: (slug: string, image: { mime: string, bytes: Buffer }) => void
 * }} o
 * @returns {Promise<{ posts: object[], images: Map<string, { mime: string, bytes: Buffer }>, sectionsCopy: object | null, warnings: string[] }>}
 */
export async function runWriters({
  door,
  words,
  sections,
  chat,
  count = 6,
  log = () => {},
  limit,
  retries,
  backoffMs,
  onPosts,
  onCover
}) {
  if (!door)
    return {
      posts: [],
      images: new Map(),
      sectionsCopy: null,
      warnings: [
        'no model key (OPENROUTER_API_KEY or DEEPSEEK_API_KEY): the blog is not written, the sections keep the library words'
      ]
    }

  // The blog goes first and alone: it and the sections share a provider, and two text turns at once
  // make both slower than either would be by itself (measured — see the header).
  const blog = await writePosts({ door, words, count, chat, log })
  // The posts are worth keeping the moment they exist, before six image calls have a chance to
  // fail or the wall to close: a rerun then reuses them instead of paying again.
  if (blog.posts.length > 0) onPosts?.(blog.posts)

  const covers =
    blog.posts.length > 0
      ? await drawCovers({ door, posts: blog.posts, chat, log, limit, retries, backoffMs, onCover })
      : { images: new Map(), warnings: [] }
  // Last, and alone. Overlapping this with the covers cost it a usable answer once already.
  const written = await writeSections({ door, words, sections, chat, log })

  return {
    posts: blog.posts,
    images: covers.images,
    sectionsCopy: written.copy,
    warnings: [...blog.warnings, ...covers.warnings, ...written.warnings]
  }
}
