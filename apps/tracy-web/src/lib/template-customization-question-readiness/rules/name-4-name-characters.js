/**
 * NAME-4: a customer who gave a business name sees it character for character, "&" and Vietnamese
 * marks included (spec `tasks/spec-template-customization-question-readiness.md`, NAME-4).
 *
 * - The contract's text samples are plain text: no HTML entity (`&amp;`, `&#NN;`, `&quot;`), since
 *   the model copies the way a sample is written. EmDash has no contract; its seed's name fields
 *   (brand, name, title, copyright) are held to the same.
 * - The template escapes the name once:
 *   - Joomla: no `htmlspecialchars` / `$this->escape` wrapped around another on a line printing the
 *     site name (`{site.name}`, which the identity plugin escapes once, passes).
 *   - WordPress: no `htmlspecialchars( get_bloginfo… )` or `htmlspecialchars( get_option… )`:
 *     WordPress stores `blogname` already escaped, and `htmlspecialchars` escapes it again.
 *   - EmDash: no `set:html` on a name field: Astro escapes `{…}` once by itself.
 *
 * Tracy decodes samples before the model reads them (`tracy-seeder/src/plain-text.mjs`, 08/10), so a
 * sample with an entity is a risk rather than a sure fault, and how a name with "&" finally reads (tab,
 * ©, text logo, og:site_name) is only seen on a built site: no such name has been built yet.
 */
import { releaseContract } from '../readers/release-contract.js'
import { UnreadableContent } from '../readers/release-content.js'
import { templateSource } from '../readers/template-source.js'

const ENTITY = /&amp;|&#\d+;|&#x[\da-f]+;|&quot;/i
const ESCAPE = String.raw`(?:htmlspecialchars|htmlentities|\$this->escape|escape)\s*\(`
const DOUBLE_ESCAPE = new RegExp(`${ESCAPE}\\s*${ESCAPE}`)
const LIVE_NOTE =
  'Only a built site shows how a name with "&" or Vietnamese marks finally reads in the tab, the © line and a text logo.'

/** Samples (or seed fields) written with an HTML entity, as "key = sample". */
async function entitySamples(/** @type {import('../index.js').RuleContext} */ context) {
  if (context.release.platform === 'emdash') {
    const model = await context.content.siteModel()
    const out = []
    for (const r of model.records ?? [])
      for (const [field, value] of Object.entries(r.values ?? {}))
        if (/name|brand|title|copyright/i.test(field) && typeof value === 'string' && ENTITY.test(value))
          out.push(`${r.type}/${r.slug}${r.locale ? `/${r.locale}` : ''} ${field} = "${value.slice(0, 60)}"`)
    return { where: 'seed/site-model.json', found: out }
  }
  const contract = releaseContract(context)
  if (!contract) return { where: null, found: [] }
  const found = contract
    .slots()
    .filter((s) => s.type === 'text' && ENTITY.test(String(s.sample ?? '')))
    .map((s) => `${s.key} = "${String(s.sample).slice(0, 60)}"`)
  return { where: `contract ${contract.id}`, found }
}

/** Places that escape the name twice, as "file:line". */
async function doubleEscapes(/** @type {import('../index.js').RuleContext} */ context) {
  const { platform } = context.release
  const out = []
  const files = await templateSource(context).texts((n) =>
    (platform === 'emdash' ? /^src\/.+\.astro$/ : /\.php$/).test(n)
  )
  for (const [file, text] of files)
    text.split('\n').forEach((line, i) => {
      const twice =
        platform === 'joomla'
          ? /sitename/i.test(line) && DOUBLE_ESCAPE.test(line)
          : platform === 'wordpress'
            ? /htmlspecialchars\s*\(\s*get_(?:bloginfo|option)\s*\(/.test(line) ||
              (/bloginfo|blogname/.test(line) && DOUBLE_ESCAPE.test(line))
            : /set:html\s*=\s*\{[^}]*(?:brand_name|brandName|siteTitle|copyright|site\.name)/.test(line)
      if (twice) out.push(`${file}:${i + 1}`)
    })
  return out
}

export const name4NameCharacters = {
  id: 'NAME-4',
  title: 'A customer who gave a business name sees it character for character',
  platforms: ['joomla', 'wordpress', 'emdash'],
  owner: /** @type {const} */ ('contract'),

  /** @param {import('../index.js').RuleContext} context */
  async run(context) {
    const { name } = context.release
    let samples
    let twice = []
    let unread = null
    try {
      samples = await entitySamples(context)
    } catch (e) {
      const status = e instanceof UnreadableContent ? e.status : 'fail'
      return {
        status,
        message: `${name}: the samples cannot be read: ${e instanceof Error ? e.message : e}.`
      }
    }
    try {
      twice = await doubleEscapes(context)
    } catch (e) {
      // The samples still speak when the template's files cannot be read.
      unread = e
    }
    if (unread && !samples.found.length) {
      const status = unread instanceof UnreadableContent ? unread.status : 'fail'
      return {
        status,
        message: `${name}: the template cannot be read: ${unread instanceof Error ? unread.message : unread}.`
      }
    }
    const problems = []
    if (samples.found.length)
      problems.push(
        `${samples.found.length === 1 ? '1 sample' : `${samples.found.length} samples`} of ${samples.where} ${samples.found.length === 1 ? 'holds' : 'hold'} an HTML entity (${samples.found.slice(0, 3).join('; ')})`
      )
    if (twice.length) problems.push(`the name is escaped twice at ${twice.join(', ')}`)
    if (problems.length)
      return {
        status: 'fail',
        message: `${name} fails NAME-4: ${problems.join('; ')}.`,
        fix: [
          samples.found.length
            ? context.release.platform === 'emdash'
              ? `Write the samples as plain text ("&", not "&amp;") in ${samples.where}, then cut a new release.`
              : `Write the samples as plain text ("&", not "&amp;") when the contract is captured (${samples.where}).`
            : null,
          twice.length
            ? 'Escape the site name once where the template prints it, and cut a new release.'
            : null
        ]
          .filter(Boolean)
          .join(' '),
        owner: samples.found.length
          ? context.release.platform === 'emdash'
            ? 'template'
            : 'contract'
          : 'template',
        details: [...samples.found, LIVE_NOTE]
      }
    return {
      status: 'pass',
      message: `${name}: the samples are plain text and the template escapes the name once.`,
      details: [
        samples.where ? `read ${samples.where}` : 'no contract seals the release, so no samples to read',
        LIVE_NOTE
      ]
    }
  }
}
