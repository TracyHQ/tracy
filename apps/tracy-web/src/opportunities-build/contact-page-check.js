// The Contact page rules judged on the served pages, for every CMS (spec TracyHQ/tracy#189 item 19, round 9, class D):
// every phone number a link, every channel of the site plan linked on the Contact page, "By appointment" said there when the
// brief says so, and no page of an appointment-only business inviting a walk-in. The rules live in the domain
// (`contact-page.mjs`); this file only finds the Contact page among the pages read.
import { contactPageFindings } from 'website-opportunities/domain/contact-page.mjs'

/** A page address without the CMS's index prefix (`/index.php/about-us/contact` → `/about-us/contact`). */
const bare = (/** @type {string} */ path) => String(path ?? '').replace(/^\/index\.php(?=\/|$)/, '') || '/'

/**
 * @param {{ pages: Array<{ path: string, status?: number, html: string }>, sitePlan: any }} input
 * @returns {Array<{ kind: string, path: string, severity: 'major' | 'minor', why: string, text?: string }>}
 */
export function checkContactPage({ pages, sitePlan }) {
  if (!sitePlan) return []
  const kept = (sitePlan.pages ?? []).find((p) => p?.role === 'contact' && p?.decision !== 'drop' && p?.path)
  const at = kept ? pages.find((p) => bare(p.path) === bare(kept.path)) : null
  return contactPageFindings({ pages, plan: sitePlan, contactPath: at ? at.path : null })
}
