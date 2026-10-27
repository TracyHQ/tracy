/**
 * The restaurant's own words for the site a Website Opportunities build made, as the brief engines read them (injected from
 * `app.js`: `sites/` never reads `wo_build`), and where what they wrote is kept (`wo_build.content`).
 *
 * 🔒 A SITE THAT NO OPPORTUNITY BUILT ANSWERS NOTHING, AT ONCE — and so does a build without a page plan or content items
 * (a build made before #1460): the engine carries on as before. Optional readers return null on failure; a WO setup's
 * strict read fails instead, so an unreadable source cannot be mistaken for nothing to write.
 * 🔒 A RECORD'S WORDS BEFORE ARE KEPT ONCE (`recordBefore`): a retry finds the template's own words, never the ones a
 * half-done run wrote, so a restore always puts back what the template shipped.
 */
import { websiteOpportunitiesDomain } from 'website-opportunities/src/domain-loader.js'
import { placeProfileOfRevision, socialFiguresOfRevision } from './place-profile-of-revision.js'
import { siteBuildOf } from './site-build.js'

/** @param {{pool: import('pg').Pool, log?: {warn: Function}}} deps */
export function createSiteContent({ pool, log = console }) {
  return {
    /** Only a server-frozen workflow version selects the new path; historical builds never opt in. */
    async quickstartFor({ siteKey, email }) {
      const build = await siteBuildOf(pool, siteKey, email)
      if (build?.brief?.quickstartWorkflow !== 'quickstart-first/1') return null
      return { ...build, socialFigures: socialFiguresOfRevision(await websiteOpportunitiesDomain(), build) }
    },
    /** Identity does not depend on posts, the page plan or the create response receipt. Read errors must reject. */
    async isOpportunity({ siteKey, email }) {
      return Boolean(await siteBuildOf(pool, siteKey, email))
    },
    /**
     * @param {{siteKey: string, email: string, strict?: boolean}} who
     * @returns {Promise<null | {buildId: string, items: any[], pagePlan: any, before: Record<string, any>,
     *   writes: Record<string, any>}>}
     */
    async forSite({ siteKey, email, strict = false }) {
      try {
        const build = await siteBuildOf(pool, siteKey, email)
        const pagePlan = build?.receipt?.pagePlan
        const items = build?.brief?.content?.items
        if (!pagePlan?.pages?.length || !Array.isArray(items) || !items.length) return null
        return {
          buildId: build.id,
          items,
          pagePlan,
          before: build.content?.before ?? {},
          writes: build.content?.writes ?? {}
        }
      } catch (error) {
        if (strict) throw error
        log.warn?.(`[content] ${siteKey}: the build's content could not be read (${error?.message ?? error})`)
        return null
      }
    },

    /**
     * The build's sourced words by slot role (`pinnedCopy`): a site no opportunity built answers null. Unlike
     * `forSite`, a build without a page plan or items still answers — its name and contact facts are sourced.
     * @param {{siteKey: string, email: string, lang?: string, cards?: number, dishes?: number, strict?: boolean,
     *   pictures?: any[]}} who - `pictures`: this build's (`realPictures.forSite`), whose vision may accept a dish photo
     * @returns {Promise<null | {buildId: string, pinned: Record<string, any>, before: Record<string, any>,
     *   writes: Record<string, any>, placeProfile: ReturnType<typeof placeProfileOfRevision>, itemKind: string}>}
     *   `placeProfile`: what a release with slot roles (content map or sidecar) fills its slots from (`planSlotFill`); `itemKind`:
     *   what the business offers (`tradeWords`), which the neutral name of an item with no source speaks of
     */
    async copyFor({ siteKey, email, lang = 'en', cards, dishes, strict = false, pictures = [] }) {
      try {
        const build = await siteBuildOf(pool, siteKey, email)
        if (!build?.brief) return null
        const domain = await websiteOpportunitiesDomain()
        return {
          buildId: build.id,
          pinned: domain.pinnedCopy(build.brief, { lang, cards, dishes }),
          before: build.content?.before ?? {},
          writes: build.content?.writes ?? {},
          placeProfile: placeProfileOfRevision(domain, build, { pictures }),
          itemKind: domain.tradeWords(build.brief?.business?.trade).itemKind
        }
      } catch (error) {
        if (strict) throw error
        log.warn?.(`[content] ${siteKey}: the build's copy could not be read (${error?.message ?? error})`)
        return null
      }
    },

    /** Keep a record's fields before its first write; answer the ones kept (these, or a run before's). */
    async recordBefore(buildId, key, fields) {
      const { rows } = await pool.query(
        `update wo_build set content = coalesce(content, '{}'::jsonb)
           || jsonb_build_object('before', coalesce(content->'before', '{}'::jsonb)
             || jsonb_build_object($2::text, coalesce(content->'before'->$2, $3::jsonb))),
           updated_at = now()
         where id = $1 returning content->'before'->$2 as held`,
        [buildId, key, JSON.stringify(fields)]
      )
      return rows[0]?.held ?? fields
    },

    /** A write's receipt for one record, beside the others. */
    async recordWrite(buildId, key, receipt) {
      await pool.query(
        `update wo_build set content = coalesce(content, '{}'::jsonb)
           || jsonb_build_object('writes', coalesce(content->'writes', '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)),
           updated_at = now()
         where id = $1`,
        [buildId, key, JSON.stringify({ ...receipt, at: new Date().toISOString() })]
      )
    },

    /**
     * The sections the site's build left on each page of the source edition, in order (`receipt.sections`): what the
     * hand-off lists and asks the agent to keep. Written after the build's sweep; the create door's receipt is long saved.
     */
    async recordSections(buildId, sections) {
      await pool.query(
        `update wo_build set receipt = coalesce(receipt, '{}'::jsonb) || jsonb_build_object('sections', $2::jsonb),
           updated_at = now()
         where id = $1`,
        [buildId, JSON.stringify(sections)]
      )
    }
  }
}

/** A retry shares the original build request; the latest action owns its current fence. */
export async function quickstartActionOpen(pool, { accountId, requestId, revisionId }) {
  const row = (
    await pool.query(
      `select status,revision_id from wo_demo_action where account_id=$1 and build_request_id=$2
     order by accepted_at desc, id desc limit 1`,
      [accountId, requestId]
    )
  ).rows[0]
  return !row || (row.status === 'queued' && row.revision_id === revisionId)
}
