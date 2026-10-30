/**
 * The Privacy Policy page of a Joomla brief build (spec TracyHQ/tracy#189, COO criterion 10.1, site build rule 6).
 *
 * 🔒 EVERY SITE HAS ONE, IN THE BUSINESS'S NAME. The page plan keeps the template's own terms or privacy page (its article is
 * rewritten here) or plans one for the build to create (`create`): a plain article in the template's own article layout and a
 * menu entry of its own in the menu no module shows (`joomla-article-routes.js`), so the footer link column lists it. Its words
 * come from `privacy-policy.mjs`: the brief's facts only. The footer link is written after this step by the footer navigation
 * writer, which lists every kept page.
 * 🔒 Debt: a template whose footer has no link column (the content map declares no navigation group) gets the page but no
 * footer link yet; the final check `privacy-policy` reports it.
 */
import {
  PRIVACY_PAGE_ID,
  PRIVACY_TITLE,
  privacyInputsOf,
  privacyPolicyHtml,
  privacyPolicyOf
} from 'website-opportunities/domain/privacy-policy.mjs'
import { menuPath } from 'website-opportunities/domain/main-menu.mjs'
import { listWhole } from './joomla-articles.js'
import { ROUTES_MENU, contentOf } from './joomla-article-routes.js'
import { readMenu, writeSteps } from './joomla-tidy.js'

const said = (/** @type {unknown} */ error) => (error instanceof Error ? error.message : String(error))
const live = (/** @type {any} */ row) => Number(row?.published) === 1
const rowPath = (/** @type {any} */ row) => (Number(row.home) === 1 ? '/' : menuPath(`/${row.path ?? ''}`))

/**
 * Write the Privacy Policy page of the plan. Throws when the site refuses a write or does not read it back.
 * @param {object} input
 * @param {(call: { siteKey: string, action: string, params: Record<string, unknown> }) => Promise<any>} input.apply
 * @param {string} input.siteKey
 * @param {any} input.sitePlan
 * @param {(note: string) => void} [input.note]
 * @returns {Promise<{ articleId: number, created: boolean, path: string } | null>}
 */
export async function writeJoomlaPrivacyPage({ apply, siteKey, sitePlan, note = () => {} }) {
  const page = (sitePlan?.pages ?? []).find(
    (/** @type {any} */ p) => p.role === 'privacy' && p.decision === 'keep'
  )
  if (!page) return null
  const { name, contact, collects } = privacyInputsOf(sitePlan)
  if (!name) {
    note('the Privacy Policy page was not written: the brief holds no business name')
    return null
  }
  const policy = privacyPolicyOf({ name, contact, collects })
  const fields = { title: PRIVACY_TITLE, introtext: privacyPolicyHtml(policy), fulltext: '', state: 1 }
  const applyId = `privacy-page-${Date.now().toString(36)}`
  const rows = await readMenu(apply, siteKey)
  const articles = await listWhole(apply, siteKey, 'article')
  const call = async (/** @type {string} */ action, /** @type {Record<string, unknown>} */ params) => {
    const answer = await apply({ siteKey, action, params: { ...params, apply_id: applyId } })
    if (answer?.ok === false) throw new Error(String(answer.message ?? answer.error ?? 'refused'))
    return answer
  }

  // The template's own legal page: the article its menu entry opens, rewritten in place.
  const own = page.create
    ? null
    : rows.find((/** @type {any} */ r) => live(r) && rowPath(r) === menuPath(page.path ?? `/${page.id}`))
  const ownArticle = own && contentOf(own)?.view === 'article' ? Number(contentOf(own)?.id) : null
  // A page an earlier pass of this build created is rewritten, never made twice.
  const earlier = articles.find((/** @type {any} */ a) => a.alias === PRIVACY_PAGE_ID)
  let articleId = ownArticle ?? (earlier ? Number(earlier.id) : 0)
  const created = articleId === 0
  try {
    if (created) {
      const categories = await listWhole(apply, siteKey, 'category')
      const category =
        categories.find((/** @type {any} */ c) => c.alias === 'uncategorised') ??
        categories.find((/** @type {any} */ c) => Number(c.id) > 1)
      const answer = await call('content.update', {
        kind: 'article',
        id: 0,
        fields: {
          ...fields,
          alias: PRIVACY_PAGE_ID,
          language: '*',
          access: 1,
          catid: Number(category?.id ?? 2)
        }
      })
      articleId = Number(answer?.id)
      if (!(articleId > 0)) throw new Error('the site did not answer with the new article')
    } else await call('content.update', { kind: 'article', id: articleId, fields })
    if (own)
      await call('content.update', { kind: 'menuItem', id: Number(own.id), fields: { title: PRIVACY_TITLE } })
    else if (
      !rows.some((/** @type {any} */ r) => live(r) && rowPath(r) === menuPath(`/${PRIVACY_PAGE_ID}`))
    ) {
      const steps = []
      if (!rows.some((/** @type {any} */ r) => r.menutype === ROUTES_MENU))
        steps.push({
          kind: 'menutype',
          id: 0,
          fields: {
            menutype: ROUTES_MENU,
            title: 'Article addresses',
            description: 'Addresses of articles no module lists. No module shows this menu.',
            client_id: 0
          }
        })
      steps.push({
        kind: 'menuItem',
        id: 0,
        fields: {
          menutype: ROUTES_MENU,
          title: PRIVACY_TITLE,
          alias: PRIVACY_PAGE_ID,
          link: `index.php?option=com_content&view=article&id=${articleId}`,
          type: 'component',
          parent_id: 1,
          published: 1,
          access: 1,
          language: '*',
          params: JSON.stringify({ menu_show: 0 })
        }
      })
      const result = await writeSteps({ apply, siteKey, applyId, steps })
      if (result.refused.length || result.skipped.length) throw new Error('the menu entry was refused')
    }
    const back = await apply({ siteKey, action: 'content.get', params: { kind: 'article', id: articleId } })
    if (back?.ok === false || back?.item?.title !== PRIVACY_TITLE || Number(back?.item?.state) !== 1)
      throw new Error('the article did not read back as written')
  } catch (error) {
    throw new Error(`PRIVACY_PAGE_WRITE_REFUSED: ${said(error)}`)
  }
  return { articleId, created, path: page.path ?? `/${PRIVACY_PAGE_ID}` }
}
