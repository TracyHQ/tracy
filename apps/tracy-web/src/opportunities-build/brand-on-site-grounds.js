/**
 * The page grounds a demo's template paints (`ds-slot.js` `pageGroundsOf`), for the brand accent's link rule
 * (`brand-on-site.js` `siteAccentOf`). Kept apart so `brand-on-site.js` stays pure: the build's steps
 * (`agent-demo.js`) and the QA gate (`demo-qa.js`) read the grounds here, the same ones, so the link tokens the
 * build is told to write are exactly the ones the gate allows.
 */
import { pageGroundsOf } from '../lib/ds-slot.js'

/**
 * @param {any} revision a Website Opportunities revision (`cms`, `template.quickstart`)
 * @returns {string[]}
 */
export function pageGroundsOfRevision(revision) {
  return pageGroundsOf({ platform: revision?.cms, tag: revision?.template?.quickstart })
}
