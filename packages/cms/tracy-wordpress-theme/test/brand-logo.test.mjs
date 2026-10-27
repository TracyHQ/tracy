/**
 * inc/brand-logo.php (plan T27/T28, Q7): a dark-background Site Logo spot shows option `tracy_logo_dark`,
 * or the site name as text — never the light logo; a light spot that asks for it shows the name as text
 * when `site_logo` is empty; any other Site Logo block is left as core draws it; `{site.title}` and
 * `{year}` in a paragraph are the site's name and the year. Run with real PHP against the built theme
 * (src/tracy, the tree every target copies).
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { phpSupport, startPhp } from '../../../../scripts/test-support/php.mjs'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const PHP_SKIP = phpSupport().skip

let php
before(() => {
  if (!PHP_SKIP)
    php = startPhp({ files: { cwd: PKG, paths: ['src/tracy/inc', 'test/brand-logo-harness.php'] } })
})
after(() => php?.stop())

/** The rendered strings of `render` on a site named `name` with `options`. */
function draw({ name = 'Tamq Bakery', options = {}, images = [10, 20], render }) {
  const input = JSON.stringify({ theme: path.join(php.root, 'src', 'tracy'), name, options, images, render })
  const [out] = php.run([{ args: [path.join(php.root, 'test', 'brand-logo-harness.php')], input }])
  assert.equal(out.status, 0, `php failed: ${out.stderr}${out.stdout}`)
  return JSON.parse(out.stdout)
}

const block = (className) => ({ width: 162, className })

test('a dark spot shows the dark logo, not the light one', { skip: PHP_SKIP }, () => {
  for (const className of [
    'jn-logo jn-logo--dark',
    'jn-footer__logo tracy-logo-dark',
    'je-footer__logo je-footer__logo--dark'
  ]) {
    const [html, after] = draw({
      options: { site_logo: 10, tracy_logo_dark: 20 },
      render: [{ block: block(className) }]
    })
    assert.match(html, /data-attachment="20"/, className)
    assert.doesNotMatch(html, /data-attachment="10"/, className)
    assert.equal(after, '10', 'site_logo reads as the light logo again once the dark spot is drawn')
  }
})

test('a dark spot with no dark logo shows the site name as text, never the light logo (Q7)', {
  skip: PHP_SKIP
}, () => {
  for (const options of [
    { site_logo: 10 },
    { site_logo: 10, tracy_logo_dark: 0 },
    { site_logo: 10, tracy_logo_dark: 99 }
  ]) {
    const [html] = draw({ name: 'Tamq & Co', options, render: [{ block: block('jn-logo jn-logo--dark') }] })
    assert.doesNotMatch(html, /<img/)
    assert.match(
      html,
      /<a class="tracy-logo-text" href="https:\/\/example\.test\/" rel="home">Tamq &amp; Co<\/a>/
    )
    // the block's classes stay, so the theme's light/dark swap still hides and shows it
    assert.match(html, /class="wp-block-site-logo is-tracy-logo-text jn-logo jn-logo--dark"/)
  }
})

test('a light spot that asks for it shows the name as text when there is no logo', { skip: PHP_SKIP }, () => {
  const [light, , fallback, , plain] = draw({
    options: {},
    render: [
      { block: block('jn-logo jn-logo--light') },
      { block: block('jv-header__logo tracy-logo-fallback') },
      { block: block('tracy-header__logo') }
    ]
  })
  assert.match(light, /rel="home">Tamq Bakery</)
  assert.match(fallback, /rel="home">Tamq Bakery</)
  assert.equal(plain, '', 'a block that did not opt in is left as core drew it')
})

test('a light spot with a logo keeps core’s markup untouched', { skip: PHP_SKIP }, () => {
  const [html] = draw({
    options: { site_logo: 10, tracy_logo_dark: 20 },
    render: [{ block: block('jn-logo jn-logo--light') }]
  })
  assert.match(html, /data-attachment="10"/)
})

test('{site.title} and {year} in a paragraph are the site name and the year', { skip: PHP_SKIP }, () => {
  const [line, other] = draw({
    name: 'Tamq <Bakery>',
    render: [
      { paragraph: '<p class="jn-copyright">Copyright © {year} {site.title}. All Rights Reserved.</p>' },
      { paragraph: '<p>{site.name}</p>' }
    ]
  })
  assert.equal(line, '<p class="jn-copyright">Copyright © 2031 Tamq &lt;Bakery&gt;. All Rights Reserved.</p>')
  assert.equal(other, '<p>{site.name}</p>', 'identity tokens of Tracy Business are not this filter’s')
})

test('a bare spot stays empty instead of printing the name a second time', { skip: PHP_SKIP }, () => {
  const [dark, , light] = draw({
    options: { site_logo: 0 },
    render: [
      { block: block('tracy-logo tracy-logo-dark tracy-logo-bare') },
      { block: block('tracy-logo tracy-logo-light tracy-logo-bare') }
    ]
  })
  assert.equal(dark, '')
  assert.equal(light, '')
  const [shown] = draw({
    options: { site_logo: 10, tracy_logo_dark: 20 },
    render: [{ block: block('tracy-logo tracy-logo-dark tracy-logo-bare') }]
  })
  assert.match(shown, /data-attachment="20"/)
})
