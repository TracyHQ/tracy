/**
 * An EmDash site's look, named and measured (ADR 0023, item "EmDash has no contract", decided 29/09/2026).
 *
 * WHY FROM THE SITE AND NOT FROM A PROFILE. Joomla and WordPress quickstarts are sealed by a
 * contract profile, and the profile names what the site wears. EmDash quickstarts have none, and
 * they need none for this: every Tracy EmDash template keeps its whole look in one file,
 * `src/styles/tokens.css` (Tailwind's defaults switched off, colours and fonts declared as tokens,
 * ADR 0023), inside the site's own code at `/app`. Reading that file is reading what the site
 * wears NOW — after an agent edited a token and rebuilt, too — so there is no second copy to drift,
 * and no file per release version (sixteen across three releases on 29/09) to keep in step.
 *
 * The record says `source: 'quickstart'`, the same word the Tracy Business profiles use for "the
 * quickstart's own look": the look has a name (the template's label) and values, but it is in no
 * catalogue.
 */
import { readDesign, writeDesign, SCHEMA } from '@tracy/site-build-core/design-record'

/** Where a Tracy EmDash template keeps its look, inside the site's container. */
export const TOKENS_IN_SITE = '/app/src/styles/tokens.css'
/** The fonts Astro loads, each under a custom property the token sheet refers to. */
export const FONTS_IN_SITE = '/app/src/fonts.json'

import { htmlAttributes, templateTokens } from './template-tokens.mjs'
export { htmlAttributes, templateTokens } from './template-tokens.mjs'

/**
 * After a done `check` (and after `site.rebuild`): a record that says "the template's own look"
 * becomes that look, named and with values, read from the site. A catalogue or brand binding is
 * not touched, and a site that cannot be read keeps the record it had — the record is a
 * convenience for later readers and never fails a build.
 * @param {string} root the site folder
 * @param {{ template: { id: string, label: string, version: string } | null, read: (file: string) => Promise<string>, home?: () => Promise<string>, wroteBy: string }} how
 *   `home`: the site's home page as served, for the `<html>` attributes that pick the theme; none or
 *   unreadable = a bare `<html>`.
 * @returns {Promise<import('@tracy/site-build-core/design-record').DesignRecord | null>} the record written, or null
 */
export async function recordTemplateLook(root, { template, read, home, wroteBy }) {
  if (template === null) return null
  const before = readDesign(root)
  // `none` too: a site created straight from a quickstart whose card is hidden (Tracy SaaS on 30/09)
  // has no template workflow in its plan, so the build wrote "nothing we can name" — yet the
  // template sits beside the site and its look is readable. Only a catalogue or brand binding, or
  // another quickstart's look, is left alone.
  if (
    before === null ||
    !(
      before.source === 'template' ||
      before.source === 'none' ||
      (before.source === 'quickstart' && before.id === template.id)
    )
  )
    return null
  let tokens = null
  try {
    const css = await read(TOKENS_IN_SITE)
    const fonts = await read(FONTS_IN_SITE).catch(() => '[]')
    const html = home ? htmlAttributes(await home().catch(() => '')) : {}
    tokens = templateTokens(css, fonts, html)
  } catch {
    return null
  }
  if (tokens === null) return null
  /** @type {import('@tracy/site-build-core/design-record').DesignRecord} */
  const record = {
    schemaVersion: SCHEMA,
    id: template.id,
    source: 'quickstart',
    name: template.label,
    bound: true,
    platform: before.platform || 'emdash',
    manifestDesign: before.manifestDesign ?? null,
    tokens,
    tokensFrom: `site:${TOKENS_IN_SITE}`,
    ...(before.allow ? { allow: before.allow } : {}),
    writtenAt: new Date().toISOString(),
    wroteBy
  }
  writeDesign(root, record)
  return record
}
