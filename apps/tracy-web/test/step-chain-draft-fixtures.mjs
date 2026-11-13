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

/** The approved draft: `{engine, approved}` as `readEngineDraft` and `draftPlanForBuild` answer them. */
export async function floristDraft() {
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
  const gallery = needsProfile.items.gallery
  // The two first photos came without a label: the pictures step labels them with one vision call.
  for (const g of gallery.slice(0, 2)) g.label = null
  // Two pictures stored by the draft research, one of them since pruned; the fourth is not a draft picture.
  const manifest = gallery.slice(0, 3).map((g, n) => ({
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
    approved: { draftId: DRAFT_ID, plan, lastEdit: null }
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
