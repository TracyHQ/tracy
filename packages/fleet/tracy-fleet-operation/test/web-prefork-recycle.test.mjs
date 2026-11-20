import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const web = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8')
const conf = web('tracy-prefork.conf')
const value = /^\s*MaxConnectionsPerChild\s+(\d+)\s*$/m.exec(conf)?.[1]

test('the customer-site prefork file sets a finite MaxConnectionsPerChild', () => {
  assert.ok(value, 'MaxConnectionsPerChild missing')
  assert.ok(Number(value) > 0 && Number(value) <= 1000, `got ${value}`)
  assert.match(conf, /<IfModule mpm_prefork_module>[\s\S]*MaxConnectionsPerChild[\s\S]*<\/IfModule>/)
})

for (const name of ['joomla.Dockerfile', 'wordpress.Dockerfile']) {
  test(`${name} ships it into conf-enabled, ahead of the demo file`, () => {
    const m = /COPY .*tracy-prefork\.conf (\/etc\/apache2\/conf-enabled\/(\S+\.conf))/.exec(web(name))
    assert.ok(m, 'no COPY of tracy-prefork.conf into conf-enabled')
    // conf-enabled loads in name order; the demo mount is zz-tracy-demo-limits.conf
    assert.ok(m[2] < 'zz-tracy-demo-limits.conf')
  })
}

test('build.sh hashes the file for the images that copy it, so a changed value cannot keep its tag', () => {
  assert.match(web('build.sh'), /APACHE_FILES="tracy-prefork\.conf"/)
})

test('only the joomla and wordpress image hashes take tracy-prefork.conf; demos and emdash do not', () => {
  const src = web('build.sh')
  const web_files = /^WEB_FILES="([^"]*)"/m.exec(src)?.[1]
  assert.ok(web_files && !web_files.includes('tracy-prefork.conf'), 'shared WEB_FILES must not carry it')
  const arm =
    /\*\/joomla\.Dockerfile\|\*\/wordpress\.Dockerfile\) input_files="\$input_files \$APACHE_FILES[^"]*"/
  assert.match(src, arm)
  assert.match(src, /^APACHE_FILES="tracy-prefork\.conf"/m)
  assert.ok(!/demos\.Dockerfile\)[^;]*APACHE_FILES/.test(src))
  assert.ok(!/emdash\.Dockerfile\)[^;]*APACHE_FILES/.test(src))
})
