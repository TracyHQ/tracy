// Shared set-up of the revision run tests (#599): the invented JA Boxing florist (`fixtures/draft-write/boxing-site.mjs`)
// as an approved build draft, run through the real draft steps (kit, brand, plan, copy, pictures, icons, order, write) on
// a blank site in memory, with one fake build model whose writer is deterministic: each field's words are drawn from a
// hash of the field key and of everything its block shows, so a page whose writer request is unchanged gets the same
// copy, and a renamed service changes exactly the copy of the blocks that show it. The model counts its calls per page.
// Invented data only.
import { createHash } from 'node:crypto'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { boxingSite } from '../../../packages/wo/website-opportunities/test/fixtures/draft-write/boxing-site.mjs'
import {
  firstCandidate,
  iconLibrary
} from '../../../packages/wo/website-opportunities/test/fixtures/icon-fields/invented-yoga.mjs'
import { visionReply } from '../../../packages/wo/website-opportunities/test/fixtures/picture-policy/invented-pictures.mjs'
import { createDraftSteps } from '../src/step-chain-draft-steps.js'
import { memoryDoors } from 'website-opportunities/domain/write-order-memory-doors.mjs'
import { buildStoreOf } from './draft-revision-store.mjs'

export { buildStoreOf }

export const ACCOUNT = 'account-larkspur'
export const DRAFT = 'draft-larkspur-1'
export const site = await boxingSite()

const WORDS = [
  'fresh',
  'stems',
  'posy',
  'petal',
  'meadow',
  'bloom',
  'ribbon',
  'garden',
  'sprig',
  'basket',
  'fern',
  'leaf'
]
const WORDS_B = ['tied', 'picked', 'kept', 'loved', 'sent', 'grown', 'wrapped', 'chosen', 'sorted', 'given']
/** Words with no digit drawn from a hash: the same input always gives the same words. */
export function wordsOf(seed, limit = 60) {
  const hash = createHash('sha256').update(seed).digest()
  const out = []
  for (let i = 0; i < 6; i++)
    out.push(i % 2 ? WORDS_B[hash[i] % WORDS_B.length] : WORDS[hash[i] % WORDS.length])
  const text = `${out.join(' ')} ${hash
    .subarray(6, 10)
    .toString('hex')
    .replace(/[0-9]/g, (d) => 'abcdefghij'[d])}`
  const cut = text.slice(0, limit).trim()
  return cut.charAt(0).toUpperCase() + cut.slice(1)
}

/**
 * The fake build model of a revision run: the writer (by its prompt), the labelling (a call with images) and the icon
 * ranking. `calls`: every call; `pages`: the writer calls per page id. `leak(page, key)` returns a text the writer puts
 * before the words of that field (a writer that once named someone it was not given, for the held name case).
 * `cross`: a writer that, like a real model, quotes in a long paragraph the first item another block of the same page
 * shows (`Ask for our <label>.`), so a block's words depend on a value its own request does not carry. `seed(text)`:
 * how the words are drawn (the default is deterministic; a counter makes the writer give new words on every call).
 */
export function revisionModel({ leak, cross = false, seed = (text) => text } = {}) {
  const calls = []
  const pages = {}
  const rank = firstCandidate()
  const model = async (request) => {
    calls.push(request)
    if (Array.isArray(request.images) && request.images.length) {
      calls.at(-1).kind = 'vision'
      return JSON.stringify(visionReply(JSON.parse(request.user).pictures.map((p) => p.id)))
    }
    if (request.system === PAGE_WRITER_PROMPT) {
      const user = JSON.parse(request.user)
      calls.at(-1).kind = 'writer'
      pages[user.page.id] = (pages[user.page.id] ?? 0) + 1
      const fields = {}
      for (const block of user.blocks) {
        const { fields: asked, ...shown } = block
        for (const slot of asked) {
          const seedOf = JSON.stringify([
            slot.key,
            shown,
            user.business,
            user.page,
            user.rewrite ? 'again' : ''
          ])
          const tail = cross ? quoteOf(user.blocks, block, slot) : ''
          const text = `${wordsOf(seed(seedOf), (slot.limit ?? 60) - tail.length)}${tail}`
          const extra = leak?.(user.page.id, slot.key)
          fields[slot.key] = extra ? `${extra} ${text}`.slice(0, slot.limit ?? 200) : text
        }
      }
      return JSON.stringify({ fields })
    }
    calls.at(-1).kind = 'icons'
    return JSON.stringify(rank(request))
  }
  return Object.assign(model, { calls, pages })
}

/** The quote a cross quoting writer adds to a long paragraph: the first item another block of the page shows. */
function quoteOf(blocks, block, slot) {
  if ((slot.limit ?? 0) < 80 || slot.kind !== 'editorial.paragraph') return ''
  const seen = blocks
    .filter((b) => b.id !== block.id)
    .flatMap((b) => b.data ?? [])
    .find((d) => d?.fields && typeof d.label === 'string')
  return seen ? `. Ask for our ${seen.label}.` : ''
}

/** The approved draft of the florist at a plan revision: `{plan, profile}` as the build chat stores them. */
export function draftOf({ plan = site.build.approval.plan, profile = site.build.approval.profile } = {}) {
  const manifest = (profile.items.gallery ?? []).map((g, n) => ({
    id: `draft-picture-${n + 1}`,
    origin: 'draft',
    sha256: String(n + 1).repeat(64),
    mime: 'image/png',
    sourceUrl: g.fields['business.gallery_image'].value
  }))
  return {
    engine: { draftId: DRAFT, needsProfile: profile, research: { brief: {}, manifest }, fault: null },
    approved: { draftId: DRAFT, plan, lastEdit: null }
  }
}

/** A blank site in memory, `fail` and `crash` scripted by mutating call number. */
export const blankSite = (script = {}) =>
  memoryDoors({ lock: site.kit.lock, contentMap: site.kit.blankContract, ...script })

const kitOf = () => ({ ...site.aiq, template: { slug: 'ja-boxing', version: '1.0.11' } })

/**
 * The doors of the draft steps over a draft, a model, a memory site and the stores of builds and run records.
 * `builds`: a Map the steps keep each finished build in (`deps.builds`); `record`: the run record of the write;
 * `pictures`: `{stored, openStored}` in place of the stored pictures below (new bytes, other stored ids).
 */
export function depsOf({ draft, model, memory, builds = new Map(), record = {}, pictures = {} }) {
  return {
    readEngineDraft: async (accountId) => (accountId === ACCOUNT ? draft.engine : null),
    draftPlanForBuild: async (accountId) => (accountId === ACCOUNT ? draft.approved : null),
    loadAiqKit: (slug) => (slug === 'ja-boxing' ? kitOf() : null),
    buildModel: async () => model,
    openDraftPicture: async (id) => ({ id, bytes: Buffer.from(`picture ${id}`), mime: 'image/png' }),
    iconLibrary,
    builds: buildStoreOf(builds),
    draftWrite: {
      doors: async () => memory.doors,
      record: async () => record,
      stored: async (order) =>
        Object.fromEntries(
          [...order.pictures.map((p) => p.frame), ...order.icons.map((i) => i.id)].map((id) => [
            id,
            { id: `stored-${id}` }
          ])
        ),
      openStored: async (id) => ({ bytes: Buffer.from(`bytes of ${id}`), mime: 'image/jpeg' }),
      blankContract: () => site.kit.blankContract,
      ...pictures
    }
  }
}

/** The draft steps over `depsOf`. */
export const stepsOf = (input) => createDraftSteps(depsOf(input))

/** The steps in the frame's order, each once; `brief.rebuildFrom` makes it a revision run of that build. */
export async function runBuild({ steps, plan, runId = 'run-larkspur-1', rebuildFrom }) {
  const ctx = {
    runId,
    accountId: ACCOUNT,
    brief: {
      draftId: DRAFT,
      plan: { id: plan.id, revision: plan.revision },
      ...(rebuildFrom ? { rebuildFrom } : {})
    },
    signal: new AbortController().signal
  }
  const value = async (name, inputs) => (await steps[name](ctx, inputs, { signal: ctx.signal })).value
  const kit = await value('kit', {})
  const planned = await value('plan', { kit })
  const copy = await value('copy', { kit, plan: planned })
  const pictures = await value('pictures', { kit, plan: planned })
  const made = { kit, plan: planned, copy, pictures }
  const icons = await value('icons', made)
  const order = await value('order', { ...made, icons })
  const write = await value('write', { ...made, icons, order })
  return { kit, plan: planned, copy, pictures, icons, order, write, ctx }
}
