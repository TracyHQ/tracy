// Stand-in input files for a write step whose planner or writer produced nothing (#483; the product owner's rule that the
// write never leaves demo content). The write step needs a plan and a copy to map slots at all; when the step that makes one
// failed and left no output, the step chain hands it these instead:
//   - the plan keeps every page and block of the template kit, so every slot is a slot of a kept block;
//   - the copy fills nothing.
// The closing rule (closing-ladder.js) then treats every text and picture slot no other file fills as holding no customer
// content: it is emptied at its smallest unit, or said to keep its demo when the site cannot empty it. What the brand and
// picture steps made is still written over it. Nothing here is invented content: both files are empty of words.
import { createHash } from 'node:crypto'
import { COPY_VERSION } from '../lib/site-copy-view.js'

const each = (value) => (Array.isArray(value) ? value : [])
const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const keep = (block) => ({
  block,
  seen: 'seen',
  decision: 'keep',
  why: 'no plan was made; the closing rule decides'
})

/** The plan's kit line: the kit's own format line with the release it was cut for, as the planner writes it. */
const kitLine = (doc, ref) =>
  [...new Set([...String(doc?.kit ?? '').split(/\s+/), ref].filter(Boolean))].join(' ')

/**
 * A plan that keeps every page and block of the kit, with no words of its own.
 * @param {{ ref: string, doc: object }} kit
 */
export function standInPlan(kit) {
  const blocks = each(kit.doc?.blocks)
  const known = new Set(blocks.map((b) => b?.id))
  const shared = new Set(blocks.filter((b) => b?.shared).map((b) => b.id))
  const pages = each(kit.doc?.pages).map((page) => {
    const ids = new Set(Object.values(page?.blocks ?? {}).flatMap(each))
    return {
      id: page.id,
      decision: 'keep',
      why: 'no plan was made; the page stays as the template has it',
      blocks: [...ids].filter((id) => known.has(id) && !shared.has(id)).map(keep)
    }
  })
  return {
    version: 'site-plan/3',
    kit: kitLine(kit.doc, kit.ref),
    standIn: true,
    site: {},
    sharedBlocks: [...shared].map(keep),
    pages
  }
}

/**
 * A site copy that fills no slot, fingerprinted to the files it stands beside.
 * @param {{ ref: string, doc: object }} kit
 * @param {{ planText: string, briefText?: string }} made the bytes of the plan and brief files it stands beside
 */
export function standInCopy(kit, { planText, briefText = '' }) {
  return {
    version: COPY_VERSION,
    standIn: true,
    fingerprint: {
      kit: kitLine(kit.doc, kit.ref),
      planSha256: sha256(planText),
      briefSha256: sha256(briefText),
      promptSha256: sha256('')
    },
    slots: [],
    alts: [],
    seo: [],
    pages: [],
    notebook: [],
    returns: []
  }
}
