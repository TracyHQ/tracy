#!/usr/bin/env node
/**
 * The next version of every released JA Joomla quickstart whose stylesheets now follow a worn
 * system — built and verified HERE, published by a person, one command per step:
 *
 *   node scripts/release-batch.mjs build   --out <dir> [--rolling-as <x.y.z> --label <name>] <slug>...
 *                                          [--as <x.y.z>] [--contract-from <x.y.z>] [--from <x.y.z>]  (ONE slug: release-joomla.mjs)
 *                                                                 each release built (release-joomla.mjs) + its
 *                                                                 tracy_setting.json and README.md; the new
 *                                                                 contract copied into the tch tree
 *   node scripts/release-batch.mjs build   --out <dir> --overlay <dir> --sql <file> --replace <file> <slug>
 *                                                                 the same for ONE release that is broken as
 *                                                                 published, repaired in the build (release-joomla.mjs)
 *   node scripts/release-batch.mjs overlays --out <dir> --products <checkout> --base <ref> <slug>...
 *                                                                 each template's source files changed since <ref>
 *                                                                 (working tree included) copied to
 *                                                                 <dir>/overlay/<slug>/templates/<element>/…
 *   node scripts/release-batch.mjs build   --out <dir> --overlay <dir>/overlay/{slug} <slug>...
 *                                                                 every release with its own overlay, in one run
 *   node scripts/release-batch.mjs verify  --out <dir> [--baseline <release dir>] [--stand <name>] <slug>...
 *                                                                 each new version restored from its own archive:
 *                                                                 default page = the released one (computed roles,
 *                                                                 pixels), every menu page answers 200 →
 *                                                                 VERIFICATION.json. --baseline: compared with a
 *                                                                 local build (the repair alone, --no-tokenize)
 *                                                                 instead of a published version that never rendered
 *                                                                 --stand: the stands' name prefix (default: the slug)
 *   node scripts/release-batch.mjs commands --out <dir> <slug>...  the upload commands (files first, the switch
 *                                                                 tracy_setting.json last), printed, not run;
 *                                                                 design-system-roles.json among the files, and
 *                                                                 no command while it is missing or not clean
 *   node scripts/release-batch.mjs cowork --out <dir> --cowork <claude-cowork checkout> --version <x.y.z> <slug>...
 *                                                                 each new contract copied byte for byte into
 *                                                                 joomla/cowork/lib/contracts/ and the plugin's two
 *                                                                 version fields + update.json set (precedent
 *                                                                 422d70c); no commit, no build, no release
 *
 * Nothing here uploads or pushes.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselineAgainst } from '../src/release-baseline.mjs'
import { overlayOf, overlayProblem, sourceOverlay } from '../src/release-overlay.mjs'
import { compareFonts, fontReport, fontUrlsOf, stylesheetsOf } from '../src/release-fonts.mjs'
import { keepAssets } from '../src/release-kept-assets.mjs'
import { ROLE_SCAN_FILE, roleScanBlockers } from '../src/release-role-scan.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const CONTRACTS = join(ROOT, 'packages/cms/tracy-joomla-quickstart/contracts')
const args = process.argv.slice(2)
const cmd = args.shift()
const opt = (n) => {
  const i = args.indexOf(n)
  return i === -1 ? null : args.splice(i, 2)[1]
}
const OUT = opt('--out')
const COWORK = opt('--cowork')
const COWORK_VER = opt('--version')
const PORT = Number(opt('--port') ?? 52341)
const CDPP = opt('--cdp') ?? '9511'
// verify's stand names start with this (default: the slug), so a run beside other agents' stands is told apart
const STAND = opt('--stand')
// a rolling pre-release with no switch yet (JA Civica): the version its zip is read as, and the label
// its first switch carries (release-joomla.mjs --rolling-as)
const ROLLING_AS = opt('--rolling-as')
// the version to cut and the contract to start from, when the next patch is taken (release-joomla.mjs --as)
const AS = opt('--as')
const CONTRACT_FROM = opt('--contract-from')
// the version to cut from, when it is uploaded but its switch is not on yet (release-joomla.mjs --from)
const FROM = opt('--from')
const LABEL = opt('--label')
// a release broken as published (JA Intranet): files laid over its webroot and SQL run on its
// database in the build (release-joomla.mjs --overlay / --sql), or literal edits of its demo content
// in the database and the lock (--replace); verify compares against --baseline
const MOVE_ONLY = process.argv.includes('--move-only')
const OVERLAY = opt('--overlay')
const SQL = opt('--sql')
const REPLACE = opt('--replace')
const BASELINE = opt('--baseline')
// overlays: the ja-products checkout whose template sources were fixed, and the ref they changed since
const PRODUCTS = opt('--products')
const BASE = opt('--base')
const slugs = args.filter((a) => /^[a-z0-9][a-z0-9-]+$/.test(a))
if (!cmd || !OUT || !slugs.length) {
  console.error('usage: release-batch.mjs build|verify|commands --out <dir> <slug>...')
  process.exit(1)
}
// an overlay path with {slug} in it serves a whole batch, one folder per release (src/release-overlay.mjs)
const overlayError = overlayProblem(OVERLAY, slugs.length)
if (overlayError) {
  console.error(overlayError)
  process.exit(1)
}
if ((SQL || REPLACE || BASELINE || AS || CONTRACT_FROM || FROM) && slugs.length !== 1) {
  console.error(
    '--sql, --replace, --baseline, --as, --contract-from and --from repair or compare ONE release: name one slug'
  )
  process.exit(1)
}
const tagOf = (s) => (s.startsWith('tracy-') ? `${s}/j6` : `quickstart/${s}/j6`)
const contractOf = (slug) => {
  // a release served by another template's slot contract, which names it in minVersion (Tracy Apple:
  // joomla-tracy-base, the same template element `tracy`)
  if (!existsSync(join(HERE, '../templates', `joomla-${slug}.json`)))
    for (const f of readdirSync(join(HERE, '../templates')).filter((x) => /^joomla-.*\.json$/.test(x)))
      if (JSON.parse(readFileSync(join(HERE, '../templates', f), 'utf8')).minVersion?.[tagOf(slug)])
        return f.replace(/\.json$/, '')
  if (/^(ja|tracy)-/.test(slug) || existsSync(join(HERE, '../templates', `joomla-${slug}.json`)))
    return `joomla-${slug}`
  const sw = JSON.parse(
    execFileSync(
      'gh',
      [
        'release',
        'download',
        tagOf(slug),
        '-R',
        'JoomlArt-Products/ja-products',
        '-p',
        'tracy_setting.json',
        '-O',
        '-'
      ],
      { encoding: 'utf8' }
    )
  )
  return `joomla-${String(sw.template).toLowerCase().replace(/_/g, '-')}`
}
const node = (script, ...a) =>
  execFileSync(process.execPath, [join(HERE, script), ...a], { encoding: 'utf8', maxBuffer: 1 << 26 })
const last = (s) => JSON.parse(s.trim().split('\n').pop())

for (const slug of slugs) {
  const dir = join(OUT, slug)
  const rel = join(dir, 'release')
  if (cmd === 'overlays') {
    if (!PRODUCTS || !BASE) {
      console.error('overlays needs --products <ja-products checkout> --base <ref>')
      process.exit(1)
    }
    const element = slug.replace(/-/g, '_')
    const changed = execFileSync(
      'git',
      ['diff', '--name-only', BASE, '--', `products/*/${element}/source/*`],
      {
        cwd: PRODUCTS,
        encoding: 'utf8'
      }
    )
      .split('\n')
      .filter(Boolean)
    // a new source file not yet added to Git is invisible to `git diff`: refuse rather than build without it
    const untracked = execFileSync(
      'git',
      ['ls-files', '--others', '--exclude-standard', '--', `products/*/${element}/source/*`],
      {
        cwd: PRODUCTS,
        encoding: 'utf8'
      }
    )
      .split('\n')
      .filter(Boolean)
    if (untracked.length) {
      console.error(
        `overlays: ${slug} has untracked source files; git add them first:\n  ${untracked.join('\n  ')}`
      )
      process.exit(1)
    }
    const into = join(OUT, 'overlay', slug)
    rmSync(into, { recursive: true, force: true })
    const files = sourceOverlay(changed, element).filter(({ from }) => existsSync(join(PRODUCTS, from)))
    for (const { from, to } of files) {
      mkdirSync(dirname(join(into, to)), { recursive: true })
      cpSync(join(PRODUCTS, from), join(into, to))
    }
    console.log(JSON.stringify({ slug, overlay: into, files: files.map((f) => f.to) }))
    continue
  }
  if (cmd === 'build') {
    // --port: the stand a t4SiteCss build installs once to read what T4 writes (release-joomla.mjs)
    const r = last(
      node(
        'release-joomla.mjs',
        tagOf(slug),
        '--template',
        contractOf(slug),
        '--out',
        dir,
        '--port',
        String(PORT + 2),
        ...(ROLLING_AS ? ['--rolling-as', ROLLING_AS] : []),
        ...(AS ? ['--as', AS] : []),
        ...(CONTRACT_FROM ? ['--contract-from', CONTRACT_FROM] : []),
        ...(FROM ? ['--from', FROM] : []),
        ...(OVERLAY ? ['--overlay', overlayOf(OVERLAY, slug)] : []),
        ...(MOVE_ONLY ? ['--move-only'] : []),
        ...(SQL ? ['--sql', SQL] : []),
        ...(REPLACE ? ['--replace', REPLACE] : [])
      )
    )
    rmSync(join(dir, 'webroot'), { recursive: true, force: true })
    const m = JSON.parse(readFileSync(join(rel, 'manifest.json'), 'utf8'))
    const parts = m.parts
    // the switch: which files a site is built from (published last — it is what makes the card change)
    // the label as the release names it today
    let label = null
    try {
      execFileSync(
        'gh',
        [
          'release',
          'download',
          tagOf(slug),
          '-R',
          'JoomlArt-Products/ja-products',
          '-D',
          join(dir, 'from'),
          '-p',
          'tracy_setting.json',
          '--clobber'
        ],
        { stdio: 'ignore' }
      )
      label = JSON.parse(readFileSync(join(dir, 'from', 'tracy_setting.json'), 'utf8')).label
    } catch {}
    const setting = {
      schemaVersion: 'tracy-setting/v1',
      platform: 'joomla',
      label: label ?? LABEL ?? slug,
      version: m.version,
      // a runtime-quickstart manifest (Tracy Apple) names the Joomla it carries platformVersion
      cms: m.cms?.version ?? m.platformVersion,
      install: parts.installer
        ? { installer: { file: parts.installer.file, sha256: parts.installer.sha256 } }
        : {
            webroot: { file: parts.webroot.file, sha256: parts.webroot.sha256 },
            database: { file: parts.database.file, sha256: parts.database.sha256 }
          },
      template: m.template
    }
    writeFileSync(join(rel, 'tracy_setting.json'), `${JSON.stringify(setting, null, 2)}\n`)
    // the release-wide files a stylesheet build leaves as published (the site pages), so the checks run on this
    // folder see what a site will be built from; never among the upload commands
    keepAssets(
      (file, to) =>
        execFileSync(
          'gh',
          [
            'release',
            'download',
            tagOf(slug),
            '-R',
            'JoomlArt-Products/ja-products',
            '-D',
            to,
            '-p',
            file,
            '--clobber'
          ],
          { stdio: 'ignore' }
        ),
      rel
    )
    const rows = Object.values(parts).map((p) => `| \`${p.file}\` | ${p.bytes} | \`${p.sha256}\` |`)
    writeFileSync(
      join(rel, 'README.md'),
      [
        `# Quickstart: ${setting.label} / joomla ${m.cms?.version ?? m.platformVersion ?? ''}`,
        '',
        `Version ${m.version}, template \`${m.template}\`, built from ${m.builtFrom.from}: the same site with its stylesheets reading a`,
        "worn design system (`var(--ds-c-<role>, <the template's own colour>)`). With no system chosen it looks exactly as before.",
        ...(/repaired: /.test(m.builtFrom.change)
          ? ['', `Also ${m.builtFrom.change.split('; stylesheets')[0]}.`]
          : []),
        '',
        '| File | Bytes | SHA-256 |',
        '|---|---:|---|',
        ...rows,
        '',
        'Verification: VERIFICATION.json. Passwords are blanked, as in the version it was built from.',
        ''
      ].join('\n')
    )
    // the new contract into the tch tree (the PR carries it; the Claude Cowork plugin copies it)
    const cdir = join(dir, 'contract', m.product ?? slug, 'j6')
    if (existsSync(cdir))
      for (const f of readdirSync(cdir))
        cpSync(join(cdir, f), join(CONTRACTS, m.product ?? slug, 'j6', f), { recursive: true })
    console.log(
      JSON.stringify({
        slug,
        from: r.from,
        to: r.to,
        cssFiles: r.cssFiles,
        replaced: r.replaced,
        parts: Object.keys(parts),
        roleScan: r.roleScan
      })
    )
  } else if (cmd === 'verify') {
    const m = JSON.parse(readFileSync(join(rel, 'manifest.json'), 'utf8'))
    const { differences } = await import('../src/probe.mjs')
    const status = (site, h) =>
      spawnSync(
        'curl',
        ['-s', '--noproxy', '*', '-o', '/dev/null', '-w', '%{http_code}', '-m', '60', `${site}${h}`],
        { encoding: 'utf8' }
      ).stdout
    // One stand at a time (the Docker VM is shared): each version is restored, snapped with its
    // animations frozen BEFORE its pages are visited (a visit raises an article's hit count, which the
    // page shows), its menu pages asked for, and taken down before the other is raised.
    const measure = (name, port, upArgs, out, linksFrom) => {
      try {
        const st = last(
          node('stand.mjs', 'up', tagOf(slug), '--port', String(port), '--name', name, ...upArgs)
        )
        node(
          'flow.mjs',
          '--cms',
          'joomla',
          '--template',
          contractOf(slug),
          '--site',
          st.site,
          '--cdp',
          CDPP,
          '--out',
          join(dir, out),
          '--snap',
          '--freeze'
        )
        // every menu page of the home page
        const html = execFileSync('curl', ['-s', '--noproxy', '*', '-m', '60', `${st.site}/`], {
          encoding: 'utf8',
          maxBuffer: 1 << 26
        })
        const links =
          linksFrom ??
          [
            ...new Set(
              [...html.matchAll(/href="(\/[^"#?]*)"/g)]
                .map((x) => x[1])
                .filter((h) => !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?)$/.test(h))
            )
          ].slice(0, 120)
        // the fonts the home page serves (#1310): the sheets it links on this host, the font files they
        // load and whether each answers; judged against the released version below (compareFonts)
        const text = (u) =>
          spawnSync('curl', ['-s', '--noproxy', '*', '-m', '60', u], { encoding: 'utf8', maxBuffer: 1 << 26 })
            .stdout
        const sheetUrls = stylesheetsOf(html, `${st.site}/`).filter((u) => u.startsWith(st.site))
        const sheets = Object.fromEntries(sheetUrls.map((u) => [u, text(u)]))
        const fontUrls = [...new Set(sheetUrls.flatMap((u) => fontUrlsOf(sheets[u] ?? '', u)))]
        const fontStatus = Object.fromEntries(
          fontUrls.filter((u) => u.startsWith(st.site)).map((u) => [u, status('', u)])
        )
        const fonts = fontReport({ html, pageUrl: `${st.site}/`, sheets, fontStatus })
        return { links, status: Object.fromEntries(links.map((h) => [h, status(st.site, h)])), fonts }
      } finally {
        node('stand.mjs', 'down', '--name', name)
      }
    }
    // the released archives build already fetched into <dir>/from are restored as they are: no second download
    const hasReleasedCopy = (d, sl, ver) => existsSync(join(d, 'from', `${sl}-j6-webroot-${ver}.tar.gz`))
    const now = measure(`${STAND ?? slug}-next`.slice(0, 40), PORT, ['--from-dir', rel], 'verify', null)
    // the same links on the version as released: a page the release itself answers 404 for (a dead
    // link in its content) is the release's, not this version's
    const was = measure(
      `${STAND ?? slug}-was`.slice(0, 40),
      PORT + 1,
      // a repaired release is compared with the repair as laid out (--baseline); a rolling pre-release has
      // no version to fetch: its zip as release-joomla.mjs laid it out
      BASELINE
        ? ['--from-dir', BASELINE]
        : ROLLING_AS || hasReleasedCopy(dir, slug, m.builtFrom.from.split('@')[1])
          ? ['--from-dir', join(dir, 'from')]
          : ['--version', m.builtFrom.from.split('@')[1]],
      'verify-released',
      now.links
    )
    const pages = now.links.map((h) => ({ path: h, status: now.status[h], released: was.status[h] }))
    const wasSnap = JSON.parse(readFileSync(join(dir, 'verify-released', 'default.json'), 'utf8'))
    const nowSnap = JSON.parse(readFileSync(join(dir, 'verify', 'default.json'), 'utf8'))
    const same = (vw) =>
      readFileSync(join(dir, 'verify-released', `default-${vw}.png`)).equals(
        readFileSync(join(dir, 'verify', `default-${vw}.png`))
      )
    const v = {
      verified: true,
      at: new Date().toISOString(),
      version: m.version,
      by: 'tracy-ds-slot release-batch.mjs verify',
      restoredFrom: 'this release folder (stand.mjs --from-dir), not the source site',
      defaultLook: {
        against: BASELINE
          ? baselineAgainst(JSON.parse(readFileSync(join(BASELINE, 'manifest.json'), 'utf8')), tagOf(slug))
          : `${m.builtFrom.from} as released`,
        computedDifferences: {
          desktop: differences(wasSnap.desktop, nowSnap.desktop).length,
          phone: differences(wasSnap.phone, nowSnap.phone).length
        },
        samePixels: { desktop: same('desktop'), phone: same('phone') }
      },
      pages: {
        checked: pages.length,
        ok: pages.filter((p) => p.status === '200').length,
        sameAsReleased: pages.filter((p) => p.status === p.released).length,
        differ: pages.filter((p) => p.status !== p.released)
      },
      // the body font variable and every font file, against the version as released (#1310)
      fonts: compareFonts(was.fonts, now.fonts)
    }
    // what the template can change decides: every computed value and every page's answer. Pixels are
    // reported too; a page with live content (a JS slider, a hit counter) can differ by a few
    v.verified =
      v.defaultLook.computedDifferences.desktop === 0 &&
      v.defaultLook.computedDifferences.phone === 0 &&
      v.pages.differ.length === 0 &&
      v.fonts.ok
    writeFileSync(join(rel, 'VERIFICATION.json'), `${JSON.stringify(v, null, 2)}\n`)
    console.log(
      JSON.stringify({
        slug,
        verified: v.verified,
        ...v.defaultLook,
        pages: `${v.pages.ok}/${v.pages.checked} answer 200, ${v.pages.sameAsReleased}/${v.pages.checked} as released`,
        fonts: v.fonts.ok
          ? `ok (${v.fonts.fonts.now} files, body font variable ${v.fonts.bodyFontVar.now ? 'present' : 'absent'})`
          : v.fonts.problems.join('; ')
      })
    )
  } else if (cmd === 'commands') {
    const m = JSON.parse(readFileSync(join(rel, 'manifest.json'), 'utf8'))
    // the role scan travels with every release (rule VARS-1): no upload command for a folder whose
    // report is missing, of another version, or still holds something VARS-1 would fail
    const roles = existsSync(join(rel, ROLE_SCAN_FILE))
      ? JSON.parse(readFileSync(join(rel, ROLE_SCAN_FILE), 'utf8'))
      : null
    const roleProblem = !roles
      ? `no ${ROLE_SCAN_FILE}: build it again (release-joomla.mjs writes it)`
      : roles.version !== m.version
        ? `${ROLE_SCAN_FILE} is of version ${roles.version}, not ${m.version}: build it again`
        : roleScanBlockers(roles).length
          ? `${ROLE_SCAN_FILE} still holds ${roleScanBlockers(roles).length} item(s) VARS-1 would fail: ${roleScanBlockers(roles).slice(0, 5).join('; ')}`
          : null
    if (roleProblem) {
      console.error(`${slug}: ${roleProblem}`)
      process.exitCode = 1
      continue
    }
    const files = [
      ...Object.values(m.parts).map((p) => p.file),
      'manifest.json',
      'SHA256SUMS',
      'README.md',
      'VERIFICATION.json',
      ROLE_SCAN_FILE
    ]
    console.log(`# ${slug} ${m.builtFrom.from} → ${m.version}`)
    console.log(
      `(cd "${rel}" && shasum -a 256 -c SHA256SUMS && gh release upload "${tagOf(slug)}" -R JoomlArt-Products/ja-products --clobber ${files.join(' ')})`
    )
    console.log(
      `# the switch, after the Claude Cowork plugin carrying contract ${m.product ?? slug}/j6/${m.version} is released:`
    )
    console.log(
      `(cd "${rel}" && gh release upload "${tagOf(slug)}" -R JoomlArt-Products/ja-products --clobber tracy_setting.json)`
    )
  } else if (cmd === 'cowork') {
    if (!COWORK || !/^\d+\.\d+\.\d+$/.test(COWORK_VER ?? ''))
      throw new Error('cowork needs --cowork <checkout> --version <x.y.z>')
    const m = JSON.parse(readFileSync(join(rel, 'manifest.json'), 'utf8'))
    const id = m.product ?? slug
    const from = join(CONTRACTS, id, 'j6', m.version)
    const to = join(COWORK, 'joomla/cowork/lib/contracts', id, 'j6', m.version)
    mkdirSync(to, { recursive: true })
    for (const f of ['manifest.json', 'content-map.json', 'presentation-lock.json'])
      cpSync(join(from, f), join(to, f))
    console.log(JSON.stringify({ slug, contract: `${id}/j6/${m.version}`, into: to }))
  } else {
    console.error(`unknown command ${cmd}`)
    process.exit(1)
  }
}
if (cmd === 'cowork') {
  // one plugin version carries every contract above
  for (const f of ['joomla/cowork/pkg_claudecowork.xml', 'joomla/cowork/com_claudecowork/claudecowork.xml']) {
    const file = join(COWORK, f)
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(/<version>[^<]+<\/version>/, `<version>${COWORK_VER}</version>`)
    )
  }
  const uj = join(COWORK, 'joomla/update.json')
  const u = JSON.parse(readFileSync(uj, 'utf8'))
  u.version = COWORK_VER
  u.package = `https://github.com/TracyHQ/claude-cowork/releases/download/joomla-v${COWORK_VER}/pkg_claudecowork-${COWORK_VER}.zip`
  u.url = `https://github.com/TracyHQ/claude-cowork/releases/tag/joomla-v${COWORK_VER}`
  writeFileSync(uj, `${JSON.stringify(u, null, 2)}\n`)
  console.log(
    JSON.stringify({
      cowork: COWORK_VER,
      next:
        'add a <update> block to joomla/update.xml (copy the last one), ./build.sh, tests/run.php, PR, release joomla-v' +
        COWORK_VER
    })
  )
}
mkdirSync(OUT, { recursive: true })
