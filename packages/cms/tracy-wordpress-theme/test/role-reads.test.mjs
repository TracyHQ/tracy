// Role reads of a target's root look (lib/role-reads.mjs) and the editors' plain palette
// (src/tracy/inc/role-reads.php): the front end reads the design-system role, the editors and an
// unworn site get the template's own value.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { roleReadsOf, withColourRole, withRoleReads } from '../lib/role-reads.mjs'
import { targetOf, TOKEN_NAMES } from '../scripts/build.mjs'

import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const support = phpSupport()
let runner
before(() => {
  if (!support.skip) runner = startPhp({ files: { cwd: PKG, paths: ['src/tracy/inc/role-reads.php'] } })
})
after(() => runner?.stop())

test('roleReads wraps each mapped token in its role with its own value as the fallback', () => {
  const map = roleReadsOf({ '--bg': '--ds-c-bg', '--elev-raised': { keep: 'shadow depth' } }, 'x')
  const out = withRoleReads(
    { '--bg': '#fff', '--elev-raised': '0 1px rgba(0,0,0,.1)', '--fg': '#111' },
    map,
    'x'
  )
  assert.equal(out['--bg'], 'var(--ds-c-bg, #fff)')
  assert.equal(out['--elev-raised'], '0 1px rgba(0,0,0,.1) /* ds-keep: shadow depth */')
  assert.equal(out['--fg'], '#111')
  assert.equal(withRoleReads({ '--bg': '#fff' }, null, 'x')['--bg'], '#fff')
})

test('roleReads refuses an unknown token, a name that is not a role, an empty keep and a second read', () => {
  assert.throws(() => roleReadsOf({ '--nope': '--ds-c-bg' }, 'cfg'), /cfg: roleReads names --nope/)
  assert.throws(() => roleReadsOf({ '--bg': '--ds-c-nope' }, 'cfg'), /not a standard role variable/)
  assert.throws(() => roleReadsOf({ '--bg': { keep: ' ' } }, 'cfg'), /keep needs one reason/)
  assert.throws(() => roleReadsOf({ '--bg': { keep: 'a */ b' } }, 'cfg'), /keep needs one reason/)
  assert.throws(() => roleReadsOf([], 'cfg'), /must be an object/)
  const map = roleReadsOf({ '--bg': '--ds-c-bg' }, 'cfg')
  assert.throws(() => withRoleReads({ '--bg': 'var(--ds-c-bg, #fff)' }, map, 't'), /already reads a role/)
})

test('a shadow or outline token reads the role in its colour only, the geometry stays', () => {
  const map = roleReadsOf({ '--focus-ring': { colour: '--ds-c-focus-ring' } }, 'x')
  const ring = (v) => withRoleReads({ '--focus-ring': v }, map, 'x')['--focus-ring']
  assert.equal(
    ring('0 0 0 4px color-mix(in oklab, var(--accent), transparent 65%)'),
    '0 0 0 4px var(--ds-c-focus-ring, color-mix(in oklab, var(--accent), transparent 65%))'
  )
  assert.equal(ring('0 0 0 2px var(--fg)'), '0 0 0 2px var(--ds-c-focus-ring, var(--fg))')
  assert.equal(withColourRole('2px solid #222', '--ds-c-x'), '2px solid var(--ds-c-x, #222)')
  assert.throws(() => ring('none'), /has no colour/)
  assert.throws(
    () => roleReadsOf({ '--focus-ring': { colour: '--nope' } }, 'cfg'),
    /colour needs one standard role/
  )
})

test('the published WordPress templates map only contract tokens to standard roles', () => {
  for (const slug of ['wp-tracy-business', 'wp-ja-kinetic', 'tracy-base']) {
    const { roleReads } = targetOf(slug, { pkgDir: PKG })
    assert.ok(roleReads, `${slug} declares roleReads`)
    for (const token of Object.keys(roleReads)) assert.ok(TOKEN_NAMES.includes(token), `${slug} ${token}`)
  }
})

test('Tracy Base reads the roles in its root look and in its Airbnb style variation alike', () => {
  for (const file of ['theme.json', 'styles/apple.json', 'styles/airbnb.json']) {
    const json = JSON.parse(readFileSync(path.join(PKG, 'src/tracy-base', file), 'utf8'))
    const bg = json.settings.color.palette.find((e) => e.slug === 'bg').color
    assert.match(bg, /^var\(--ds-c-bg, #/, file)
  }
})

const php = (code) => {
  const [result] = runner.run([
    {
      args: [
        '-r',
        `define('ABSPATH', '/'); require ${JSON.stringify(path.join(runner.root, 'src/tracy/inc/role-reads.php'))}; ${code}`
      ]
    }
  ])
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('the editors get the fallback of every palette role read, nested reads included, anything else as given', {
  skip: support.skip
}, () => {
  const out = JSON.parse(
    php(`echo json_encode( tracy_editor_palette( array(
      array( 'slug' => 'bg', 'color' => 'var(--ds-c-bg, #f5f3ee)' ),
      array( 'slug' => 'fg', 'color' => 'var(--ds-c-fg, var(--ds-c-ink, #14171a))' ),
      array( 'slug' => 'ld', 'color' => 'var(--ds-c-accent, light-dark(#4d7c0f, #a3e635))' ),
      array( 'slug' => 'wp', 'color' => 'var(--wp--preset--color--bg, #fff)' ),
      array( 'slug' => 'hex', 'color' => '#abcdef' )
    ) ) );`)
  )
  assert.deepEqual(
    out.map((e) => e.color),
    ['#f5f3ee', '#14171a', 'light-dark(#4d7c0f, #a3e635)', 'var(--wp--preset--color--bg, #fff)', '#abcdef']
  )
})

test('Tracy Business: the subscribe button wears the accent pair turned on its accent card, the orange without a system', () => {
  // The card's green reads --ds-c-accent and so did the submit: the button vanished into the card (Figma, 15/10/2026).
  const css = readFileSync(path.join(PKG, 'src/wp-tracy-business/assets/css/wp-tracy-business.css'), 'utf8')
  const body = (sel) => {
    const at = css.indexOf(`${sel} {`)
    assert.ok(at >= 0, sel)
    return css.slice(at, css.indexOf('}', at))
  }
  assert.match(
    css,
    /\.tracy \.tracy-aside__subscribe \.wpcf7-form \{\s*--tas-submit: var\(--ds-c-accent-on\);/
  )
  const rest = body(".tracy .tracy-aside__subscribe .wpcf7-form input[type='submit']:where(:not(:disabled))")
  assert.ok(rest.includes('background: var(--tas-submit, var(--ds-c-accent, var(--wtb-orange)));'), rest)
  assert.ok(rest.includes('color: var(--ds-c-accent, var(--wp--preset--color--accent-on));'), rest)
})

test('Tracy Business: the subscribe field wears the system field pair, the brand constants without a system', () => {
  // The field's green-deep fill became the accent's pressed shade and its paper-on-green placeholder read
  // 1.3:1 on it (Moxie dark, 15/10/2026). Each role read falls back to the exact value the field had.
  const css = readFileSync(path.join(PKG, 'src/wp-tracy-business/assets/css/wp-tracy-business.css'), 'utf8')
  const body = (sel) => {
    const at = css.indexOf(`${sel} {`)
    assert.ok(at >= 0, sel)
    return css.slice(at, css.indexOf('}', at))
  }
  const field = body(
    ".tracy .tracy-aside__subscribe .wpcf7-form input:not([type='submit']):not([type='checkbox']):not([type='radio']):not([type='file'])"
  )
  assert.ok(
    field.includes('border-color: var(--ds-c-border, var(--wp--custom--tracy--brand--green-rule));'),
    field
  )
  assert.ok(
    field.includes('background: var(--ds-c-surface, var(--wp--custom--tracy--brand--green-deep));'),
    field
  )
  assert.ok(field.includes('color: var(--ds-c-fg, var(--wp--preset--color--accent-on));'), field)
  const placeholder = body('.tracy .tracy-aside__subscribe .wpcf7-form input::placeholder')
  assert.ok(
    placeholder.includes(
      'color: var(--ds-c-muted, color-mix(in srgb, var(--wp--custom--tracy--brand--paper) 60%, var(--wp--custom--tracy--brand--green)));'
    ),
    placeholder
  )
})

test('Tracy Business: a disabled submit reads the disabled roles, the rest face without a system', () => {
  // /contact's Send request before the consent tick: the slot keeps the pair 3:1 on its fill, the page and the card
  const css = readFileSync(path.join(PKG, 'src/wp-tracy-business/assets/css/sections.css'), 'utf8')
  const sel = ".tracy .wpcf7-form input[type='submit']:where(:disabled) {"
  const at = css.indexOf(sel)
  assert.ok(at >= 0, sel)
  const rule = css.slice(at, css.indexOf('}', at))
  assert.ok(
    rule.includes('background: var(--ds-c-disabled-bg, var(--ds-c-accent, var(--wtb-orange)));'),
    rule
  )
  assert.ok(rule.includes('color: var(--ds-c-disabled-fg, var(--wp--preset--color--accent-on));'), rule)
})
