/** The same pure token reader as the EmDash Build plugin, shipped as a leaf in the web image. */
import { existsSync } from 'node:fs'
import { designRecordProblem } from '../lib/site-design.js'

const IMAGE = new URL('../emdash-tool/template-tokens.mjs', import.meta.url)
const CHECKOUT = new URL(
  '../../../../packages/site/tracy-site-build-emdash/src/host/template-tokens.mjs',
  import.meta.url
)
const reader = import(existsSync(IMAGE) ? IMAGE.href : CHECKOUT.href)
const TOKENS_FROM = 'site:/app/src/styles/tokens.css'

/** Complete only the ruler of this exact provision's still-untouched EmDash name binding. */
export async function completeProvisionDesign(pool, siteKey, jobId, design) {
  if (!design || typeof design !== 'object') return false
  for (const key of ['tokensCss', 'fontsJson', 'html'])
    if (typeof design[key] !== 'string' || Buffer.byteLength(design[key]) > 64 * 1024) return false
  const { templateTokens, htmlAttributes } = await reader
  if (!/<html\b[^>]*>/i.test(design.html)) return false
  const attrs = htmlAttributes(design.html)
  // fonts.json alone is not evidence of a template token sheet.
  if (!templateTokens(design.tokensCss, '[]', attrs)) return false
  const tokens = templateTokens(design.tokensCss, design.fontsJson, attrs)
  if (!tokens || designRecordProblem({ id: null, source: 'catalog', platform: 'emdash', tokens }))
    return false
  const { rowCount } = await pool.query(
    `update site_design d set tokens = $3::jsonb, tokens_from = $4, updated_at = now()
     from site_creation c
     where d.site_key = $1 and d.platform = 'emdash' and d.source = 'catalog' and d.tokens is null
       and c.site_key = d.site_key and c.job_id = $2
       and d.wrote_by = 'provision:' || case when c.build_id = 'legacy:' || c.site_key then 'legacy' else c.build_id end`,
    [siteKey, jobId, JSON.stringify(tokens), TOKENS_FROM]
  )
  return rowCount === 1
}
