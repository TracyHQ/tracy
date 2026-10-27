/** Approved import problems keep actionable steps, truthful diagnostics, and safe destinations. */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const reactRequire = createRequire(
  path.resolve(root, '../../../vendor/tracy/dsh-better-sidebar/package.json')
)
const scratch = mkdtempSync(path.join(tmpdir(), 'import-problem-test-'))
let lib
before(async () => {
  const outfile = path.join(scratch, 'render.cjs')
  await require('esbuild').build({
    stdin: {
      contents: `export { createElement } from 'react'; export { renderToStaticMarkup } from 'react-dom/server'; export * from './import-problems'; export * from './import-preflight'; export * from './import-problem-data'; export {en} from './strings'; export {ImportProgress} from './import-wizard'`,
      resolveDir: path.join(root, 'src/client'),
      loader: 'tsx'
    },
    plugins: [
      {
        name: 'single-host-react',
        setup(build) {
          build.onResolve({ filter: /^react(?:\/.*)?$/ }, (args) => ({
            path: reactRequire.resolve(args.path)
          }))
        }
      }
    ],
    nodePaths: [path.resolve(root, '../../../vendor/tracy/dsh-better-sidebar/node_modules')],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    jsx: 'automatic',
    loader: { '.css': 'empty' },
    outfile,
    logLevel: 'silent'
  })
  lib = require(outfile)
})
after(() => rmSync(scratch, { recursive: true, force: true }))
const t = (key, params = {}) =>
  (lib.en[key] ?? key).replace(/\{(\w+)\}/g, (whole, key) => (key in params ? String(params[key]) : whole))
const render = (problem, props = {}) =>
  lib.renderToStaticMarkup(
    lib.createElement(lib.ImportProblem, {
      problem,
      t,
      domain: 'customer.test',
      adminUrl: 'https://customer.test/sub/administrator/?secret=word',
      username: 'owner',
      ...props
    })
  )

test('sign-in, firewall, and install causes select only what the evidence establishes', () => {
  assert.equal(lib.importProblemCase('invalid_credential', { platform: 'joomla' }, 'owner'), 'p6')
  assert.equal(
    lib.importProblemCase('invalid_credential', { platform: 'joomla' }, 'owner@example.test'),
    'p7'
  )
  assert.equal(
    lib.importProblemCase(
      'invalid_credential',
      { platform: 'joomla', check: 'message_unread' },
      'owner@example.test'
    ),
    'p8'
  )
  assert.equal(lib.importProblemCase('blocked_by_firewall', { firewall: 'cloudflare' }), 'p16')
  assert.equal(lib.importProblemCase('blocked_by_firewall', { firewall: 'sucuri' }), 'firewall')
  assert.equal(lib.importProblemCase('install_failed', { check: 'not_installed' }), 'p26')
  assert.equal(lib.importProblemCase('site_resource_limit', { check: 'memory_exhausted' }), 'p34')
  // #1616: a site that stopped answering is not sent to its host about PHP limits.
  assert.equal(lib.importProblemCase('site_resource_limit'), 'p35')
  assert.equal(lib.importProblemCase('site_offline'), 'p55')
})

test('errors use a 12px regular status and open resolution; warnings fold only without actions', () => {
  const error = render('p13')
  assert.match(error, /role="alert"/)
  assert.match(error, /text-xs font-normal/)
  assert.match(error, /size-3\.5/)
  assert.match(error, /How to resolve/)
  assert.doesNotMatch(error, /data-slot="collapsible-trigger"/)
  assert.match(error, /Tracy cannot enter the code from your phone or app/)
  const warning = render('p42')
  assert.match(warning, /data-slot="collapsible-trigger"/)
  const open = render('p40', { actions: lib.createElement('button', null, 'retry') })
  assert.doesNotMatch(open, /data-slot="collapsible-trigger"/)
  assert.match(open, /<button>retry<\/button>/)
  assert.equal(render('pf1.green'), '')
})

test('the website timeout gives three bullet steps without an action inside its guidance', () => {
  const html = render('pf1.timeout')
  assert.match(html, /<ul\b[^>]*list-disc/)
  assert.equal((html.match(/<li\b/g) ?? []).length, 3)
  assert.doesNotMatch(html, /<ol\b/)
  assert.doesNotMatch(html, /<button\b/)
})

test('simultaneous Cloudflare and unknown platform warnings retain both resolution instructions', () => {
  const verdict = lib.sitePreflight(
    {
      detection: { reachable: true, secure: true, blocked: false, firewall: 'cloudflare', platform: null },
      ownership: { ownership: 'available' }
    },
    'joomla'
  )
  const html = render(verdict.problem, {
    actions: lib.createElement('button', null, 'Continue'),
    params: { platform: 'Joomla' },
    additionalProblems: verdict.rows.flatMap((row) =>
      row.problem && row.problem !== verdict.problem ? [row.problem] : []
    )
  })
  assert.match(html, /If it blocks the import/)
  assert.match(html, /Check that <strong[^>]*>Joomla<\/strong> is the right choice above, then continue/)
})

test('missing Joomla sign-in guidance links the platform admin path while unreachable keeps the typed address', () => {
  const context = { domain: 'customer.test', adminUrl: 'https://customer.test/', platform: 'joomla' }
  for (const problem of ['p12', 'pf2.noform']) {
    const html = render(problem, context)
    assert.match(html, /href="https:\/\/customer.test\/administrator"/)
    assert.match(html, />https:\/\/customer.test\/administrator<\/a>/)
  }
  const typed = 'https://customer.test/private/signin.php?secret=word#login'
  assert.match(
    render('pf2.unreachable', { ...context, adminUrl: typed }),
    /href="https:\/\/customer.test\/private\/signin.php\?secret=word#login"/
  )
})

test('missing admin guidance preserves the entered source origin and subfolder safely', () => {
  const { JSDOM } = reactRequire('jsdom')
  for (const [typed, expected] of [
    ['http://shop.example:8443/subsite/', 'http://shop.example:8443/subsite/administrator'],
    ['https://admin.shop.example/subsite', 'https://admin.shop.example/subsite/administrator'],
    [
      'https://shop.example/subsite/administrator/index.php?secret=word#login',
      'https://shop.example/subsite/administrator'
    ],
    ['https://shop.example/subsite/index.php', 'https://shop.example/subsite/administrator']
  ]) {
    const dom = new JSDOM(
      render('pf2.noform', { domain: 'shop.example', adminUrl: typed, platform: 'joomla' })
    )
    assert.equal(dom.window.document.querySelector('a').getAttribute('href'), expected)
    dom.window.close()
  }
  for (const unsafe of ['javascript:alert(1)', 'data:text/html,hello', 'http://[invalid']) {
    const dom = new JSDOM(
      render('pf2.noform', { domain: 'shop.example', adminUrl: unsafe, platform: 'joomla' })
    )
    const href = dom.window.document.querySelector('a').getAttribute('href')
    assert.equal(href, 'https://shop.example/administrator')
    dom.window.close()
  }
})

test('server-password guidance names the selected CMS account for both platforms', () => {
  for (const [platform, name] of [
    ['wordpress', 'WordPress'],
    ['joomla', 'Joomla']
  ]) {
    const html = render('p11', { platform, detail: { platform } })
    assert.match(html, new RegExp('not your ' + name + ' account'))
    assert.doesNotMatch(
      html,
      new RegExp('not your ' + (platform === 'wordpress' ? 'Joomla' : 'WordPress') + ' account')
    )
  }
})

test('an import already running explains the safeguard once without repeating the Follow it action', () => {
  const html = render('p52', { actions: lib.createElement('button', null, 'Follow it') })
  assert.match(html, /<p>Do not start a second import of the same site while this one runs\.<\/p>/)
  assert.doesNotMatch(html, /Press.*Follow it/)
  assert.doesNotMatch(html, /<(?:ol|ul|li)\b/)
  assert.equal((html.match(/<button>Follow it<\/button>/g) ?? []).length, 1)
})

test('a single step is a paragraph while choices keep bullets and multiple steps keep numbers', () => {
  const { JSDOM } = reactRequire('jsdom')
  const singles = Object.entries(lib.IMPORT_PROBLEMS).filter(
    ([, data]) => data.fix?.length === 1 && !data.options
  )
  assert.ok(singles.length > 0, 'the rule must exercise real single-item guidance')
  for (const [problem] of singles) {
    const dom = new JSDOM(
      render(problem, {
        actions: lib.createElement('button', null, 'Retry'),
        detail: { have: '0.8.0', need: '0.9.0', php: '7.4', minimumPhp: '8.1', limitMb: '8', packageMb: '12' }
      })
    )
    const paragraph = dom.window.document.querySelector('p')
    assert.ok(paragraph, problem)
    const guidance = paragraph.parentElement
    assert.equal(guidance.querySelectorAll(':scope > ol, :scope > ul').length, 0, problem)
    assert.ok(guidance.querySelector(':scope > p'), problem)
    dom.window.close()
  }
  const bullet = render('p27')
  assert.match(bullet, /<ul\b[^>]*list-disc/)
  assert.equal((bullet.match(/<li\b/g) ?? []).length, 1)
  assert.doesNotMatch(bullet, /<ol\b/)
  const choices = render('p8')
  assert.match(choices, /<ul\b[^>]*list-disc/)
  assert.doesNotMatch(choices, /<ol\b/)
  const steps = render('p7')
  assert.match(steps, /<ol\b[^>]*list-decimal/)
  assert.doesNotMatch(steps, /<ul\b/)
})

test('admin links use the supplied subdirectory and preserve its secret query', () => {
  const html = render('p7')
  assert.match(
    html,
    /href="https:\/\/customer\.test\/sub\/administrator\/index\.php\?secret=word&amp;option=com_users&amp;view=users"/
  )
  assert.match(html, /target="_blank" rel="noopener"/)
  assert.doesNotMatch(html, /acme-dental/)
  const cf = render('p16')
  assert.match(cf, /href="https:\/\/dash.cloudflare.com"/)
  const support = render('p36')
  assert.match(support, /href="https:\/\/discord.gg\/BM9TMRcEBb"/)
})

test('sample versions and upload values never become customer diagnostics', () => {
  for (const problem of ['p29', 'p32', 'p33']) {
    const html = render(problem)
    assert.doesNotMatch(html, /1\.2\.0|1\.4\.0|7\.4|8\.1|8 MB|12 MB|PHP ,|Cowork \./)
  }
  assert.doesNotMatch(render('p33'), /at least MB/)
  assert.match(render('p33'), /Ask your hosting provider to raise the upload limit\./)
  const version = render('p29', {
    detail: { have: '0.8.0', need: '9.9.9' },
    extensionVersion: '0.9.0'
  })
  assert.match(version, /Claude Cowork 0\.8\.0/)
  assert.match(version, /version 0\.9\.0 or newer/)
  assert.doesNotMatch(version, /9\.9\.9/)
  assert.doesNotMatch(render('p29', { detail: { have: '0.8.0', need: '9.9.9' } }), /9\.9\.9/)
  const diagnosis = render('p46', { technicalDetails: 'database restore refused' })
  assert.match(diagnosis, /database restore refused/)
  assert.doesNotMatch(diagnosis, /ERROR 1067|mysql import exited 1/)
})

test('install refusals guide users to the manual panel before the manifest download', () => {
  for (const problem of ['p23', 'p24', 'p29']) {
    const html = render(problem, {
      downloadUrl: 'https://downloads.example/manifest-package.zip',
      onManual: () => {}
    })
    assert.match(html, /href="#install-myself"/, problem)
    assert.doesNotMatch(html, /manifest-package\.zip/, problem)
    assert.doesNotMatch(html, /Download Claude Cowork/, problem)
  }
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ImportProblemActions, {
      problem: 'p23',
      t,
      downloadUrl: 'https://downloads.example/manifest-package.zip',
      onAction: () => {}
    })
  )
  assert.doesNotMatch(html, /Download Claude Cowork|manifest-package\.zip/)
})

test('manual token guidance only links to the selected platform settings', () => {
  const joomla = render('p30', { detail: { platform: 'joomla' } })
  assert.match(joomla, /Components › Tracy Claude Cowork/)
  assert.doesNotMatch(joomla, /Settings › Claude Cowork|options-general\.php/)
  const wordpress = render('p30', {
    adminUrl: 'https://customer.test/sub/wp-admin/',
    detail: { platform: 'wordpress' }
  })
  assert.match(wordpress, /Settings › Claude Cowork/)
  assert.match(
    wordpress,
    /href="https:\/\/customer\.test\/sub\/wp-admin\/options-general.php\?page=claude-cowork"/
  )
  assert.doesNotMatch(wordpress, /Components › Tracy Claude Cowork|com_claudecowork/)
})

test('Joomla upgrades link to Joomla updates within the supplied admin address', () => {
  const html = render('p29', { detail: { platform: 'joomla' }, onManual: () => {} })
  assert.match(html, /System › Update › Extensions/)
  assert.match(
    html,
    /href="https:\/\/customer.test\/sub\/administrator\/index.php\?secret=word&amp;option=com_installer&amp;view=update"/
  )
  assert.doesNotMatch(html, /WordPress|plugins\.php/)
})

test('the full five-row progress survives failure at the measured step', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ImportProgress, {
      t,
      platform: 'joomla',
      failed: true,
      run: { step: 'reading_content', detail: { tables: 214 } }
    })
  )
  assert.equal((html.match(/data-import-step=/g) ?? []).length, 5)
  assert.match(html, /data-import-step="reading_content" data-state="failed"/)
  assert.match(html, /214 tables copied/)
  assert.match(html, /data-import-step="reading_files" data-state="pending"/)
})

test('every approved case has source copy without user-facing em or en dashes', () => {
  for (const [id, problem] of Object.entries(lib.IMPORT_PROBLEMS)) {
    for (const key of [problem.what, problem.why, ...(problem.fix ?? []), ...(problem.actions ?? [])].filter(
      Boolean
    )) {
      assert.equal(typeof lib.en[key], 'string', `${id}: ${key}`)
      assert.doesNotMatch(lib.en[key], /[—–]/, key)
    }
  }
})

test('site preflight stops at the first failure and never paints missing checks green', () => {
  assert.deepEqual(
    lib.sitePreflight({ detection: { reachable: false, error: 'ENOTFOUND' } }, 'joomla').rows,
    [{ key: 'online', state: 'error', problem: 'pf1.dns' }]
  )
  const tls = lib.sitePreflight({ detection: { reachable: true, secure: false } }, 'joomla')
  assert.deepEqual(
    tls.rows.map((r) => r.key),
    ['online', 'secure']
  )
  assert.equal(tls.blocked, true)
  const firewall = lib.sitePreflight(
    { detection: { reachable: true, secure: true, blocked: true, firewall: 'wordfence' } },
    'joomla'
  )
  assert.deepEqual(
    firewall.rows.map((r) => r.key),
    ['online', 'secure', 'firewall']
  )
  assert.equal(firewall.problem, 'pf1.wordfence')
  const old = lib.sitePreflight({ detection: { platform: 'joomla' } }, 'joomla')
  assert.deepEqual(old.rows, [{ key: 'platform', state: 'ok' }])
  assert.equal(old.blocked, false)
  const unknown = lib.sitePreflight(
    { detection: { reachable: true, secure: true, blocked: false, platform: null } },
    'joomla'
  )
  assert.equal(unknown.rows.at(-1).state, 'warning')
  assert.equal(unknown.blocked, false)
})

test('Cloudflare protection and a platform guess are warnings, while proven ownership blocks', () => {
  const detection = {
    reachable: true,
    secure: true,
    blocked: false,
    firewall: 'cloudflare',
    platform: 'wordpress'
  }
  const warning = lib.sitePreflight({ detection, ownership: { ownership: 'available' } }, 'joomla')
  assert.equal(warning.blocked, false)
  assert.equal(warning.rows.filter((r) => r.state === 'warning').length, 2)
  const taken = lib.sitePreflight(
    { detection, ownership: { ownership: 'other', joinPath: '/customer/join' } },
    'joomla'
  )
  assert.equal(taken.blocked, true)
  assert.equal(taken.rows.at(-1).problem, 'pf1.taken')
  const mine = lib.sitePreflight({ detection, ownership: { ownership: 'mine' } }, 'joomla')
  assert.equal(mine.mine, true)
  assert.equal(mine.rows.at(-1).state, 'info')
})

test('admin preflight never guesses captcha or two-step sign-in and opens the server-password fields', () => {
  const basic = lib.adminPreflight(
    {
      detection: {
        reachable: true,
        secure: true,
        admin: { signInFound: null, locked: false, basicAuthRequired: true }
      }
    },
    'joomla'
  )
  assert.equal(basic.basic, true)
  assert.equal(basic.blocked, false)
  assert.equal(basic.problem, 'pf2.basic')
  const unknown = lib.adminPreflight(
    { detection: { admin: { signInFound: null, locked: false, basicAuthRequired: false } } },
    'joomla'
  )
  assert.deepEqual(unknown.rows, [])
  const locked = lib.adminPreflight(
    { detection: { reachable: true, admin: { signInFound: false, locked: true, basicAuthRequired: false } } },
    'joomla'
  )
  assert.equal(locked.blocked, true)
  assert.equal(locked.problem, 'pf2.gate')
  assert.doesNotMatch(JSON.stringify(locked), /captcha|mfa/)
})

test('WordPress install errors never offer Joomla-only menus', () => {
  const upload = render('p33', { detail: { platform: 'wordpress', limitMb: '8', packageMb: '12' } })
  assert.doesNotMatch(upload, /Install from URL/)
  assert.match(upload, /at least 16 MB/)
  const activate = render('p27', {
    adminUrl: 'https://customer.test/sub/wp-admin/',
    detail: { platform: 'wordpress' }
  })
  assert.match(activate, /Plugins › Installed Plugins/)
  assert.match(activate, /href="https:\/\/customer.test\/sub\/wp-admin\/plugins.php"/)
  assert.doesNotMatch(activate, /System › Manage/)
})

test('WordPress plugin-upload access refusals show WordPress install guidance', () => {
  // Real WordPress Editor and DISALLOW_FILE_MODS replies both refuse the upload page with 403.
  const detail = { platform: 'wordpress' }
  const problem = lib.importProblemCase('no_backend_access', detail)
  const html = render(problem, { adminUrl: 'https://customer.test/sub/wp-login.php', detail })
  assert.match(html, /WordPress does not let this account install plugins/)
  assert.match(html, /Administrator/)
  assert.match(html, /plugin installs turned off/)
  assert.match(html, /href="https:\/\/customer\.test\/sub\/wp-admin\/users\.php"/)
  assert.doesNotMatch(html, /Joomla|Super Users|Users › Manage/)
  assert.equal(problem, 'p23')
  for (const fallback of [{ platform: 'joomla' }, { platform: 'unknown' }, {}, null])
    assert.equal(lib.importProblemCase('no_backend_access', fallback), 'p9')
})

test('each measured row is revealed as pending then result, stopping at the failed row', () => {
  const measured = lib.sitePreflight(
    { detection: { reachable: true, secure: true, blocked: true, firewall: 'cloudflare' } },
    'joomla'
  )
  for (let completed = 0; completed < measured.rows.length; completed++) {
    const frame = lib.preflightFrame(measured, completed, false)
    assert.equal(frame.pending, true)
    assert.equal(frame.verdict.blocked, true)
    assert.equal(frame.verdict.rows.length, completed + 1)
    assert.equal(frame.verdict.rows.at(-1).state, 'pending')
    assert.equal(frame.verdict.problem, undefined)
  }
  const final = lib.preflightFrame(measured, measured.rows.length, false)
  assert.equal(final.pending, false)
  assert.equal(final.verdict.rows.at(-1).state, 'error')
  assert.equal(final.verdict.rows.at(-1).key, 'firewall')
  assert.equal(
    final.verdict.rows.some((row) => row.key === 'platform'),
    false
  )
})

test('WordPress default sign-in URLs resolve menus and password reset within the actual subfolder', () => {
  const context = { adminUrl: 'https://customer.test/sub/wp-login.php', detail: { platform: 'wordpress' } }
  const credentials = render('p6', context)
  assert.match(credentials, /href="https:\/\/customer.test\/sub\/wp-login.php\?action=lostpassword"/)
  const install = render('p23', context)
  assert.match(install, /href="https:\/\/customer.test\/sub\/wp-admin\/users.php"/)
  assert.doesNotMatch(install, /wp-login.php\//)
})

test('WordPress admin file addresses resolve menus from wp-admin and reset from the site root', () => {
  for (const entry of ['index.php', 'plugins.php']) {
    const context = {
      adminUrl: `https://customer.test/sub/wp-admin/${entry}?notice=old#plugins`,
      detail: { platform: 'wordpress' }
    }
    assert.match(render('p23', context), /href="https:\/\/customer.test\/sub\/wp-admin\/users.php"/)
    assert.match(
      render('p6', context),
      /href="https:\/\/customer.test\/sub\/wp-login.php\?action=lostpassword"/
    )
  }
})

test('Joomla admin index addresses preserve the supplied query and hash without doubling a slash', () => {
  const html = render('p9', {
    adminUrl: 'https://customer.test/sub/administrator/index.php?secret=word#accounts',
    detail: { platform: 'joomla' }
  })
  assert.match(
    html,
    /href="https:\/\/customer.test\/sub\/administrator\/index.php\?secret=word&amp;option=com_users&amp;view=users#accounts"/
  )
})

test('all resolution cases keep panel actions inside Tracy and web destinations in new tabs', () => {
  const context = {
    onMySites: () => {},
    onCreate: () => {},
    onManual: () => {},
    joinPath: '/customer/join',
    downloadUrl: 'https://downloads.example/extension.zip'
  }
  const seen = new Set()
  for (const problem of Object.keys(lib.IMPORT_PROBLEMS)) {
    const html = render(problem, context)
    for (const anchor of html.matchAll(/<a\b([^>]*)>/g)) {
      const attributes = anchor[1]
      const href = attributes.match(/href="([^"]*)"/)?.[1]
      seen.add(href)
      if (href?.startsWith('#')) {
        assert.ok(['#my-sites', '#create', '#install-myself'].includes(href), problem)
        assert.doesNotMatch(attributes, /target=/, `${problem}: ${href}`)
      } else {
        assert.match(attributes, /target="_blank"/, `${problem}: ${href}`)
      }
    }
  }
  for (const href of [
    '#my-sites',
    '#create',
    '#install-myself',
    '/customer/join',
    '/login',
    'https://dash.cloudflare.com',
    'https://discord.gg/BM9TMRcEBb'
  ])
    assert.ok(seen.has(href), `the case audit must exercise ${href}`)
})

test('every interface locale preserves each guidance destination independently of translated wording', () => {
  const { JSDOM } = reactRequire('jsdom')
  const context = {
    onMySites: () => {},
    onCreate: () => {},
    onManual: () => {},
    joinPath: '/customer/join',
    detail: { have: '0.8.0', php: '7.4', minimumPhp: '8.1', limitMb: '8', packageMb: '12' },
    extensionVersion: '0.9.0'
  }
  const links = (html) => {
    const dom = new JSDOM(html)
    const result = [...dom.window.document.querySelectorAll('a')].map((a) => ({
      href: a.getAttribute('href'),
      target: a.getAttribute('target'),
      signIn: a.hasAttribute('data-tracy-sign-in')
    }))
    dom.window.close()
    return result
  }
  for (const locale of ['vi', 'de', 'fr', 'it', 'nl', 'zh', 'es']) {
    const file =
      locale === 'vi'
        ? '../../locale/tracy-locale-vi/vi/tracy-add-site.json'
        : '../../locale/tracy-locales/' + locale + '/tracy-add-site.json'
    const dictionary = JSON.parse(readFileSync(path.resolve(root, file), 'utf8'))
    const translated = (key, params = {}) =>
      (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (whole, name) =>
        name in params ? String(params[name]) : whole
      )
    const cases = Object.keys(lib.IMPORT_PROBLEMS).map((problem) => ({ problem, props: context }))
    for (const platform of ['wordpress', 'joomla'])
      for (const problem of ['p6', 'p25', 'p27', 'p29', 'p30', 'p33'])
        cases.push({
          problem,
          props: {
            ...context,
            adminUrl:
              platform === 'wordpress'
                ? 'https://customer.test/sub/wp-login.php'
                : 'https://customer.test/sub/administrator/?secret=word',
            detail: { ...context.detail, platform }
          }
        })
    for (const { problem, props } of cases)
      assert.deepEqual(
        links(render(problem, { ...props, t: translated })),
        links(render(problem, props)),
        locale + ': ' + problem + ': ' + (props.detail.platform ?? 'default')
      )
  }
})

test('semantic links resolve only known destinations and never trust translated URL attributes', () => {
  const html = lib.renderToStaticMarkup(
    lib.createElement(lib.ImportRichText, {
      text: '<a data-import-link="join" href="javascript:alert(1)">translated label</a> <a data-import-link="unknown" href="https://attacker.test">plain</a>',
      context: { joinPath: '/actual/join' }
    })
  )
  assert.match(html, /href="\/actual\/join"/)
  assert.doesNotMatch(html, /javascript:|attacker.test|data-import-link/)
  assert.match(html, />translated label<\/a>/)
})

test('join guidance uses only safe local paths and stays text while no join destination exists', () => {
  for (const joinPath of [
    undefined,
    '',
    'javascript:alert(1)',
    '//attacker.test/join',
    '/\\attacker.test/join',
    '/\n/attacker.test'
  ]) {
    const html = render('pf1.taken', { joinPath })
    assert.doesNotMatch(html, /href="[^"]*join/)
    assert.match(html, /request to join it/)
    assert.doesNotMatch(html, /acme-dental/)
  }
})
