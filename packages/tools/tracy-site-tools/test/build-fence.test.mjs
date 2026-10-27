/**
 * The build fence (`build-fence.mjs`), pure: which writes of a build touch the template's own files, read on the
 * very commands local round 31 ran (25/10/2026, WordPress, JA Restaurant), and the refusals a build reads.
 *
 *   node --test packages/tools/tracy-site-tools/test/build-fence.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  appChangedSinceRebuild,
  BUILD_REBUILD_UNNEEDED,
  writesApp,
  buildApprovalRefusal,
  buildHide,
  buildHideRefusal,
  buildPictureRefusal,
  buildPictureWrite,
  buildQuestionRefusal,
  buildShellRefusal,
  buildTemplateRefusal,
  buildTemplateWrite,
  templateFileOf
} from '../src/host/build-fence.mjs'
import { shellConsequence } from '../src/host/shell-writes.mjs'

const siteRoot = '/site/lev'
const theme = `${siteRoot}/.webroot/wp-content/themes/wp-ja-restaurant`
const bash = (command, cwd = siteRoot) =>
  buildTemplateWrite({ name: 'bash', args: { command }, cwd, siteRoot })

test('the template files are WordPress themes and plugins and Joomla extension folders, not uploads, EmDash or T4 local styles', () => {
  for (const [file, want] of [
    [`${theme}/patterns/contact-form.php`, 'wp-content/themes/wp-ja-restaurant/patterns/contact-form.php'],
    [`${siteRoot}/.webroot/wp-content/plugins/acm/acm.php`, 'wp-content/plugins/acm/acm.php'],
    [
      `${siteRoot}/.webroot/templates/t4_bs5/html/com_content/article/default.php`,
      'templates/t4_bs5/html/com_content/article/default.php'
    ],
    [`${siteRoot}/.webroot/templates/t4_bs5/local/etc/site.json`, 'templates/t4_bs5/local/etc/site.json'],
    [`${siteRoot}/.webroot/modules/mod_menu/tmpl/default.php`, 'modules/mod_menu/tmpl/default.php'],
    [`${siteRoot}/.webroot/templates/t4_bs5/local/css/custom.css`, null],
    [`${siteRoot}/.webroot/wp-content/uploads/2026/10/hero.jpg`, null],
    [`${siteRoot}/.webroot/images/logo.png`, null],
    [`${siteRoot}/notes.md`, null],
    ['/app/src/pages/index.astro', null],
    ['/tmp/contact-form.php.bak', null]
  ])
    assert.equal(templateFileOf(file, siteRoot), want, file)
})

test('🔒 round 31: a Python heredoc rewriting a theme pattern from inside the theme folder is a template write', () => {
  const heredoc = [
    `cd ${theme}/patterns && cp contact-form.php /tmp/contact-form.php.bak && python3 - <<'EOF'`,
    'import re',
    "p='contact-form.php'",
    's=open(p).read()',
    "s=s.replace('048 594 5483','917.464.3782')",
    "open(p,'w').write(s)",
    'EOF'
  ].join('\n')
  assert.equal(bash(heredoc), 'wp-content/themes/wp-ja-restaurant/patterns')
  const sidebar = [
    `cd ${theme}/patterns && python3 - <<'EOF'`,
    "p='part-sidebar.php'",
    's=open(p).read().replace("\'Most Read\'","\'Popular stories\'")',
    "open(p,'w').write(s)",
    'EOF'
  ].join('\n')
  assert.equal(bash(sidebar), 'wp-content/themes/wp-ja-restaurant/patterns')
})

test('a script that names a theme file from the webroot, an in-place sed, a redirect and a file tool are template writes', () => {
  assert.equal(
    bash(`cd ${siteRoot}/.webroot && php -r "file_put_contents('wp-content/themes/t/functions.php', 'x');"`),
    'wp-content/themes/t/functions.php'
  )
  assert.equal(
    bash(`sed -i 's/Book a Table/Join/' ${theme}/patterns/blog-banner.php`),
    'wp-content/themes/wp-ja-restaurant/patterns/blog-banner.php'
  )
  assert.equal(bash(`echo x > ${theme}/style.css`), 'wp-content/themes/wp-ja-restaurant/style.css')
  // The web container's own document root is the same webroot (`render-compose.sh`).
  assert.equal(
    buildTemplateWrite({
      name: 'edit',
      args: { file_path: '/var/www/html/wp-content/plugins/acm/acm.php' },
      cwd: siteRoot,
      siteRoot
    }),
    'wp-content/plugins/acm/acm.php'
  )
  assert.equal(
    buildTemplateWrite({
      name: 'write',
      args: { file_path: '.webroot/templates/t4/index.php' },
      cwd: siteRoot,
      siteRoot
    }),
    'templates/t4/index.php'
  )
})

test('reads, writes elsewhere, EmDash /app and a T4 local stylesheet pass', () => {
  assert.equal(bash(`cd ${theme} && grep -rn "Most Read" --include=*.php . | head -3`), null)
  assert.equal(bash(`cd ${theme}/patterns && grep -o 'esc_html_e( .[^)]*' blog-banner.php | head -12`), null)
  assert.equal(bash(`cd ${siteRoot}/.webroot && wp post get 511 --field=post_content`), null)
  assert.equal(bash(`cd ${theme} && cat AGENTS.md | head -80`), null)
  assert.equal(bash(`cd ${siteRoot}/.webroot && python3 -c "open('/tmp/x.json','w').write('1')"`), null)
  assert.equal(bash(`cd /app && python3 - <<'EOF'\nopen('src/pages/index.astro','w').write('x')\nEOF`), null)
  assert.equal(
    buildTemplateWrite({
      name: 'edit',
      args: { file_path: `${siteRoot}/.webroot/templates/t4_bs5/local/css/custom.css` },
      cwd: siteRoot,
      siteRoot
    }),
    null
  )
  assert.equal(
    buildTemplateWrite({ name: 'read', args: { file_path: `${theme}/style.css` }, cwd: siteRoot, siteRoot }),
    null
  )
})

// Local round 35 (26/10/2026, Death & Co on JA Fresco T4): the logo is T4's Site settings, kept in `local/etc/site/`
// by T4's own admin; the build, fenced out of it, wrote its logo over the template's `logo.png`.
test("T4's site settings in local/etc/site are the site's; a picture written by hand outside tracy-content is refused", () => {
  const tpl = `${siteRoot}/.webroot/templates/ja_fresco`
  assert.equal(templateFileOf(`${tpl}/local/etc/site/default.json`, siteRoot), null)
  assert.equal(bash(`mkdir -p ${tpl}/local/etc/site`), null)
  assert.equal(bash(`cp ${tpl}/etc/site/default.json ${tpl}/local/etc/site/default.json`), null)
  assert.equal(
    templateFileOf(`${tpl}/etc/site/default.json`, siteRoot),
    'templates/ja_fresco/etc/site/default.json'
  )
  assert.equal(
    templateFileOf(`${tpl}/local/etc/layout/default.json`, siteRoot),
    'templates/ja_fresco/local/etc/layout/default.json'
  )
  const pic = (command) => buildPictureWrite({ name: 'bash', args: { command }, cwd: siteRoot, siteRoot })
  assert.equal(
    pic(
      `cd ${siteRoot} && php -r '$i=imagecreatefromjpeg(".webroot/images/tracy-content/e6.jpg"); imagepng($i,".webroot/images/joomlart/logo/logo.png");'`
    ),
    'images/joomlart/logo/logo.png'
  )
  assert.equal(
    pic(
      `cp ${siteRoot}/.webroot/images/tracy-content/e6.jpg ${siteRoot}/.webroot/images/joomlart/logo/logo.png`
    ),
    'images/joomlart/logo/logo.png'
  )
  assert.equal(pic(`cp /tmp/a.jpg ${siteRoot}/.webroot/wp-content/uploads/tracy-content/a.jpg`), null)
  assert.equal(pic(`ls -l ${siteRoot}/.webroot/images/joomlart/logo/`), null)
  assert.equal(pic(`cd ${siteRoot}/.webroot && cp images/x.css /tmp/x.css`), null)
  const refusal = buildPictureRefusal('bash', 'images/joomlart/logo/logo.png')
  assert.match(refusal, /media\.import/)
  assert.match(refusal, /local\/etc\/site/)
})

test('the refusals name the doors, ask nobody, and never read as a yes', () => {
  const template = buildTemplateRefusal('bash', 'wp-content/themes/t/patterns')
  assert.match(template, /content\.replace \{path:"<the page that shows them>"/)
  assert.match(template, /Reading these files is fine/)
  for (const confirm of [true, false]) {
    const q = buildQuestionRefusal(confirm)
    assert.match(q, /nobody answers during a build/)
    assert.match(q, /nothing is deleted or hidden/)
    assert.match(q, /nothing is installed, switched or rolled back/)
    assert.match(q, /final reply/)
  }
  assert.match(buildQuestionRefusal(true), /the change it asks about is not made/)
  // Round 31's own delete: refused with no card to show.
  const del = shellConsequence('bash', { command: 'cd /site/lev/.webroot && wp post delete 511 --force' })
  assert.equal(del?.reason, 'deletes')
  const shell = buildShellRefusal(/** @type {any} */ (del))
  assert.match(shell, /deletes nothing|deletes and hides nothing/)
  assert.doesNotMatch(shell, /ask_user_question \{/)
  const option = buildShellRefusal(
    /** @type {any} */ (shellConsequence('bash', { command: 'wp option update x y' }))
  )
  assert.match(option, /content\.update \{kind:"option"\}/)
  assert.match(buildApprovalRefusal('bash'), /approval nobody can give during a build/)
})

// Plan "10/10" §7 S4 (26/10/2026): an EmDash rebuild (astro build + restart) is only for template code written.
test('a rebuild is needed only after a write under /app since the last one', () => {
  const call = (name, args) => ({ type: 'tool/call', data: { name, arguments: args } })
  const rebuild = call('tracy_site_build_emdash', { action: 'request', operation: 'site.rebuild' })
  const appEdit = call('bash', {
    command: "cd /app && python3 - <<'EOF'\nopen('src/views/Kit.astro','w').write('x')\nEOF"
  })
  const read = call('bash', { command: 'grep -rn Refurbishment /app/src' })
  const content = call('tracy_emdash', { tool: 'content_update', arguments: {} })
  assert.equal(appChangedSinceRebuild([read, content], siteRoot, siteRoot), false)
  assert.equal(appChangedSinceRebuild([read, appEdit], siteRoot, siteRoot), true)
  assert.equal(appChangedSinceRebuild([appEdit, rebuild, content], siteRoot, siteRoot), false)
  assert.equal(
    appChangedSinceRebuild(
      [appEdit, rebuild, call('edit', { file_path: '/app/src/x.astro' })],
      siteRoot,
      siteRoot
    ),
    true
  )
  assert.equal(
    writesApp({ name: 'bash', args: { command: 'sed -i s/a/b/ /app/src/x.astro' }, cwd: siteRoot, siteRoot }),
    true
  )
  assert.match(BUILD_REBUILD_UNNEEDED, /nothing under \/app changed/)
})

// Local round 36 (26/10/2026): a WordPress build hid the template's blog banner and "Most Read" with display:none.
test("a look value that hides something is a build's refusal; one that shows or colours is not", () => {
  const look = (props) => ({
    action: 'look.set',
    params: { path: '/blog/', target: { text: 'MOST READ' }, props, scope: 'page' }
  })
  assert.equal(buildHide(look({ display: 'none' })), 'display: none')
  assert.equal(buildHide(look({ visibility: 'hidden' })), 'visibility: hidden')
  assert.equal(buildHide(look({ opacity: '0' })), 'opacity: 0')
  assert.equal(buildHide(look({ 'max-height': '0px' })), 'max-height: 0px')
  assert.equal(buildHide(look({ color: 'transparent' })), 'color: transparent')
  assert.equal(buildHide(look({ display: 'block' })), null)
  assert.equal(buildHide(look({ opacity: '0.85', color: '#1f1a17' })), null)
  assert.equal(buildHide({ action: 'content.update', params: { props: { display: 'none' } } }), null)
  const refusal = buildHideRefusal('display: none')
  assert.match(refusal, /a build hides nothing/)
  assert.match(refusal, /content\.contract \{operation:"string"\}/)
})
