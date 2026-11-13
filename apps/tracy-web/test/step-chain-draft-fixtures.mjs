// An invented florist's approved build draft (#597), for the assembled step chain tests: the needs profile with its
// business name held (a neutral site name stands in) and one reviewer kept off the site, the plan the real composer
// and rules gate made from it, the draft manifest of its pictures, and one fake build model that answers every call of
// the chain (the writer, the picture labelling, the icon ranking) and keeps every request. Nothing here is a real
// business, person, review, link or picture.
import { TRACY_LIBRARY } from 'website-opportunities/domain/library.mjs'
import { PAGE_WRITER_PROMPT } from 'website-opportunities/domain/page-writer.mjs'
import { composePlan, composerContextOf } from 'website-opportunities/domain/plan-composer.mjs'
import { withWithheld } from 'website-opportunities/domain/plan-withheld.mjs'
import { firstCandidate } from '../../../packages/wo/website-opportunities/test/fixtures/icon-fields/invented-yoga.mjs'
import { visionReply } from '../../../packages/wo/website-opportunities/test/fixtures/picture-policy/invented-pictures.mjs'
import { scriptedModel } from '../../../packages/wo/website-opportunities/test/fixtures/plan-composer/invented-club.mjs'
import {
  FLORIST_TEMPLATE,
  floristBlockStore,
  floristComposition,
  floristIcons,
  floristPageRecipes,
  floristProfile
} from '../../../packages/wo/website-opportunities/test/fixtures/write-order/invented-florist.mjs'

/** The business name the owner keeps off the site, the name the site shows instead, and the reviewer held. */
export const HELD_NAME = 'Example Larkspur Florist'
export const SITE_NAME = 'Meadowlight Flowers'
export const HELD_PERSON = 'Pellam Orrick'
export const DRAFT_ID = 'draft-meadowlight-1'
export const ACCOUNT_ID = 'account-meadowlight'

/** The template kit as `loadKit` answers it. */
export const floristKit = () => ({
  template: FLORIST_TEMPLATE,
  blockStore: floristBlockStore(),
  pageRecipes: floristPageRecipes(),
  mapping: null,
  library: TRACY_LIBRARY
})

const held = (value) => ({ value, sources: ['site'], confidence: 'single-source' })
/** A held fact and two held reviews, each with a portrait, as research would store them beside the plan. */
const HELD_FACT = 'business.story'
const HELD_ITEMS = [
  {
    id: 'quote-held-name',
    kind: 'quote',
    fields: {
      'quote.text': held(`${HELD_NAME} made the flowers for our wedding tables.`),
      'quote.author_name': held('Tamsin Vale'),
      'quote.author_image': held('https://larkspur-florist.example/img/review-tamsin.jpg')
    },
    sources: ['site']
  },
  {
    id: 'quote-held-person-portrait',
    kind: 'quote',
    fields: {
      'quote.text': held('A posy for every season, always fresh.'),
      'quote.author_name': held(HELD_PERSON),
      'quote.author_image': held('https://larkspur-florist.example/img/review-pellam.jpg')
    },
    sources: ['site']
  }
]

/**
 * The held business name and the held person in every form a stored profile has them: a fact naming the business, a
 * review quoting the name, reviews by the held person (the profile's own and one more with a portrait), and the
 * profile's `withheld` (`names`, `people`). With `inPlan`, the stored plan shows that held data too (a plan stored
 * before the owner held it): the chain must still keep it from every model call and from the write order.
 */
function holdEverywhere(needsProfile, plan, inPlan) {
  needsProfile.facts[HELD_FACT] = [held(`${HELD_NAME} has tied flowers in Ambermoor since 1998.`)]
  needsProfile.items.quote.push(...structuredClone(HELD_ITEMS))
  if (!inPlan) return plan
  const out = structuredClone(plan)
  const home = out.pages[0]
  const reviews = home.blocks.find((b) => b.block === 'tracy-reviews')
  const ownQuote = needsProfile.items.quote.find((q) => q.fields['quote.author_name']?.value === HELD_PERSON)
  reviews.data.push(ownQuote.id, ...HELD_ITEMS.map((i) => i.id))
  home.blocks.find((b) => b.block === 'masthead').data.push(HELD_FACT.replace('.', '-'))
  return out
}

/**
 * The approved draft: `{engine, approved}` as `readEngineDraft` and `draftPlanForBuild` answer them.
 * @param {{heldInPlan?: boolean}} [options] `heldInPlan`: the stored plan shows the held data (`holdEverywhere`)
 */
export async function floristDraft({ heldInPlan = false } = {}) {
  const kit = floristKit()
  const withheld = { name: true, siteName: SITE_NAME, people: [HELD_PERSON] }
  const profile = withWithheld(floristProfile(), { withheld }, kit)
  const services = profile.items.service.map((s) => s.id)
  const photos = profile.items.gallery.map((g) => g.id)
  const input = {
    profile,
    answers: [{ schema: 'tracy-build-answer/v1', question: 'main-button', text: 'Order a bouquet today' }],
    blockStore: kit.blockStore,
    pageRecipes: kit.pageRecipes,
    library: kit.library,
    template: FLORIST_TEMPLATE,
    brand: { website: { colors: [{ hex: '#9C3D54', role: 'primary' }] } },
    allowTemplateLook: true,
    planId: 'plan-meadowlight'
  }
  const { plan } = await composePlan({
    ...input,
    model: scriptedModel(JSON.stringify(floristComposition(services, photos)))
  })
  const needsProfile = composerContextOf(input).profile
  const approvedPlan = holdEverywhere(needsProfile, plan, heldInPlan)
  const gallery = needsProfile.items.gallery
  // The two first photos came without a label: the pictures step labels them with one vision call.
  for (const g of gallery.slice(0, 2)) g.label = null
  // Every photo stored by the draft research, the third since pruned (the store answers nothing for it). A picture
  // with no stored one behind it is never placed from its web address (`withDraftPictures`).
  const manifest = gallery.map((g, n) => ({
    id: `draft-picture-${n + 1}`,
    origin: 'draft',
    sha256: String(n + 1).repeat(64),
    mime: 'image/png',
    sourceUrl: g.fields['business.gallery_image'].value
  }))
  return {
    kit,
    manifest,
    engine: {
      draftId: DRAFT_ID,
      needsProfile,
      research: { brief: {}, manifest, profile: needsProfile },
      fault: null
    },
    approved: { draftId: DRAFT_ID, plan: approvedPlan, lastEdit: null }
  }
}

/** What the fake writer writes, by field kind: the site name, never the held one. */
const WRITES = {
  'contact.cta_label': 'Order flowers',
  'business.tagline': 'Flowers cut this morning',
  'business.copyright': SITE_NAME,
  'editorial.heading': 'Our bouquets',
  'offering.description': 'Meadow flowers tied by hand.',
  'editorial.button_label': 'See all reviews'
}

/**
 * The fake build model: the writer's calls (by its prompt), the labelling (a call with images) and the icon ranking.
 * `label(id)` overrides a picture's label; `writer(slot, rewrite)` overrides what the writer writes.
 */
export function fakeBuildModel({ label = () => undefined, writer } = {}) {
  const requests = []
  const rank = firstCandidate()
  let rewrites = 0
  const model = async (request) => {
    requests.push(request)
    if (Array.isArray(request.images) && request.images.length) {
      const ids = JSON.parse(request.user).pictures.map((p) => p.id)
      const over = Object.fromEntries(
        ids.map((id) => [id, label(id)]).flatMap(([id, text]) => (text ? [[id, { label: text }]] : []))
      )
      return JSON.stringify(visionReply(ids, over))
    }
    if (request.system === PAGE_WRITER_PROMPT) {
      const user = JSON.parse(request.user)
      const fields = {}
      for (const block of user.blocks)
        for (const slot of block.fields) {
          const own = writer?.(slot, Boolean(user.rewrite))
          const text =
            own ??
            (user.rewrite ? `Fresh wording ${(rewrites += 1)}` : (WRITES[slot.kind] ?? 'Fresh flowers'))
          fields[slot.key] = text.slice(0, slot.limit ?? text.length)
        }
      return JSON.stringify({ fields })
    }
    return JSON.stringify(rank(request))
  }
  return Object.assign(model, { requests })
}

export { floristIcons }

/** Text folded to lower case words, so a held name is found in a slug (`pellam-orrick`) as in prose. */
export const folded = (text) =>
  ` ${String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `

/** The held texts found in `value` (any JSON), folded: none means nothing held is in it. */
export const heldIn = (value) =>
  [HELD_NAME, HELD_PERSON].filter((h) => folded(JSON.stringify(value)).includes(folded(h)))
