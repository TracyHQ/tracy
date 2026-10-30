// The final check of the Privacy Policy rule (spec TracyHQ/tracy#189, COO criterion 10.1): on the served pages the policy page
// is there, is linked from the footer, names the business, keeps no demo text and mentions only channels the brief holds.
// Judged by what a visitor reads, on any CMS; a CMS whose writer does not make the page yet is not judged (debt).
import { PRIVACY_NOT_CREATED_FOR } from 'website-opportunities/domain/page-plan.mjs'
import { privacyInputsOf, privacyPolicyFindings } from 'website-opportunities/domain/privacy-policy.mjs'
import { renderedFooterLinks } from './footer-navigation-check.js'

/**
 * @param {{ pages: any[], sitePlan: any, brief?: any, origin?: string | null }} input
 * @returns {Array<{ kind: string, severity: string, path: string, why: string }>}
 */
export function checkPrivacyPolicy({ pages, sitePlan, brief = null, origin = null }) {
  if (!sitePlan) return []
  const row = (sitePlan.pages ?? []).find((p) => p.role === 'privacy' && p.decision === 'keep')
  if (!row) {
    if (PRIVACY_NOT_CREATED_FOR.has(String(brief?.cms ?? ''))) return []
    return [
      {
        kind: 'privacy-policy',
        severity: 'major',
        path: '/',
        why: 'the page plan has no Privacy Policy page'
      }
    ]
  }
  const { name, contact } = privacyInputsOf(sitePlan)
  return privacyPolicyFindings({
    pages,
    privacy: row,
    name,
    contact,
    footerLinks: (html) => renderedFooterLinks(html, origin).links.map((l) => l.href)
  })
}
