/**
 * REG-PR-999-wp-theme-display-name: the five WordPress themes ported from JoomlArt templates are named "WP <Name>".
 * S1: style.css, readme.txt and the pattern category label of the overlay and of the built theme,
 * and themeName of the overlay's config, read "WP <Name>". S2: none of them still reads "JA <Name>".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks } from './lib.mjs'

const c = checks()
const THEME = 'packages/cms/tracy-wordpress-theme'
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const NAMES = { nova: 'Nova', vega: 'Vega', morgan: 'Morgan', kinetic: 'Kinetic', impact: 'Impact' }

for (const [key, name] of Object.entries(NAMES)) {
  const slug = `wp-ja-${key}`
  const wp = `WP ${name}`
  const ja = `JA ${name}`
  c.eq(
    `S1: ${slug} theme.config.json themeName`,
    JSON.parse(read(`${THEME}/overlays/${slug}/theme.config.json`)).themeName,
    wp
  )
  for (const tree of ['overlays', 'src']) {
    const dir = `${THEME}/${tree}/${slug}`
    const style = read(`${dir}/style.css`)
    const readme = read(`${dir}/readme.txt`)
    const extra = read(`${dir}/inc/extra.php`)
    const label = extra.match(
      /register_block_pattern_category\(\s*'[^']+',\s*array\(\s*'label'\s*=>\s*__\(\s*'([^']+)'/
    )
    c.eq(`S1: ${tree}/${slug} Theme Name`, style.match(/^Theme Name: (.+)$/m)?.[1], wp)
    c.eq(`S1: ${tree}/${slug} readme title`, readme.split('\n')[0], `=== ${wp} ===`)
    c.eq(`S1: ${tree}/${slug} pattern category label`, label?.[1], wp)
    c.eq(
      `S2: ${tree}/${slug} places still reading "${ja}"`,
      [style.includes(`Theme Name: ${ja}`), readme.startsWith(`=== ${ja}`), label?.[1] === ja].filter(Boolean)
        .length,
      0
    )
  }
}

c.done()
