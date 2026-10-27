#!/usr/bin/env node
// detect-source.mjs — what IS this source, and which road should the skill take?
//
//   node scripts/ingest/detect-source.mjs <url-or-folder> [--json]
//
// WHY THIS EXISTS. A person asks for a site in one sentence: "turn http://… into an EmDash
// template". Everything the skill needs to know beyond that sentence — is it a CMS, can the
// content model be read instead of scraped, what should the package be called — is the SKILL's
// job to work out, not the person's. Before this file, a URL was treated as "kind: url" and the
// skill scraped rendered HTML, throwing away the very thing a CMS source has and a design folder
// does not: a content model with named fields.
//
// WHAT IT DOES NOT DO. It does not fetch the whole site, log in, or touch a database. One GET of
// the start page, one HEAD of /administrator/, and the evidence is reported — never inferred from
// a single weak signal, because "this looks like WordPress" and "this IS WordPress" lead to two
// different roads and only one of them is recoverable.

/** Signals that name a CMS. Each carries its own weight; one alone is never enough. */
const SIGNALS = {
  joomla: [
    [/<meta\s+name="generator"\s+content="Joomla[^"]*"/i, 3, 'meta generator says Joomla'],
    [/\/media\/system\/js\//i, 2, 'loads /media/system/js/'],
    [/\/media\/templates\/site\//i, 2, 'serves /media/templates/site/'],
    [/index\.php\?option=com_/i, 2, 'links carry option=com_'],
    [/\bjoomla-[a-z-]+\b/i, 1, 'joomla-* class or element'],
    [/\/media\/vendor\//i, 1, 'serves /media/vendor/']
  ],
  wordpress: [
    [/<meta\s+name="generator"\s+content="WordPress[^"]*"/i, 3, 'meta generator says WordPress'],
    [/\/wp-content\//i, 2, 'loads /wp-content/'],
    [/\/wp-includes\//i, 2, 'loads /wp-includes/'],
    [/\/wp-json\//i, 2, 'links /wp-json/'],
    [/\bwp-block-[a-z-]+\b/i, 1, 'wp-block-* class']
  ]
}

/**
 * A Joomla site may or may not run JoomlArt's T4, and the difference decides how much a contract
 * can carry: T4 keeps page sections as ACM modules with named fields, plain Joomla keeps articles
 * and modules only. Saying which one is in front of us is not a detail — it is the difference
 * between a content model and a pile of HTML.
 */
const T4_SIGNALS = [
  /\/t4\/|\bt4-[a-z]/i,
  /mod_ja_acm/i,
  /com_t4/i,
  /\/templates\/[a-z0-9_]+\/(?:css|js)\/t4/i
]

/** A CMS is named only when its evidence is strong AND clearly ahead of the runner-up. */
const CONFIDENT = 3

export function detectFromHtml(html = '') {
  const found = {}
  for (const [cms, signals] of Object.entries(SIGNALS)) {
    const hits = signals.filter(([re]) => re.test(html))
    found[cms] = {
      score: hits.reduce((n, [, weight]) => n + weight, 0),
      evidence: hits.map(([, , why]) => why)
    }
  }
  const ranked = Object.entries(found).sort((a, b) => b[1].score - a[1].score)
  const [topName, top] = ranked[0]
  const [, runnerUp] = ranked[1] ?? [null, { score: 0 }]
  const cms = top.score >= CONFIDENT && top.score > runnerUp.score ? topName : 'unknown'

  const t4 = T4_SIGNALS.some((re) => re.test(html))

  // A site's own name, if it says one. A <title> is NOT a name: a Joomla home page usually titles
  // itself after the menu item ("Home", "Terminal"), which would name the package after a page.
  const siteName =
    html.match(/<meta[^>]+property="og:site_name"[^>]+content="([^"]+)"/i)?.[1] ??
    html.match(/<meta[^>]+name="application-name"[^>]+content="([^"]+)"/i)?.[1] ??
    null
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null
  const lang = html.match(/<html[^>]*\blang="([a-z]{2})(?:-[A-Za-z]+)?"/i)?.[1]?.toLowerCase() ?? null

  return {
    cms,
    confidence: top.score,
    evidence: found[topName].evidence,
    t4,
    siteName,
    title,
    lang,
    scores: found
  }
}

/** Words a home page titles itself with that name a PAGE, not a site. */
const PAGE_WORDS = /^(home|homepage|trang ch[ủu]|welcome|index|main|start|accueil|inicio|startseite)$/i

/**
 * A package name a person would have picked — and an honest flag when we could not pick one.
 *
 * Order matters: the site's declared name, then the host, and only then the page title. A title
 * like "Home" or "Terminal" would name the package after whichever menu item happens to be first,
 * which is how a template ends up called `tracy-emdash-theme-home`. When nothing reliable is
 * found, say so (`needsName`) so intake asks one short question instead of guessing.
 */
export function suggestNames({ siteName = null, title = null, url = null } = {}) {
  const fromTitle = String(title ?? '')
    .split(/[·|—–]|\s+-\s+/)[0]
    .trim()
  const host = url && /^https?:\/\//i.test(url) ? new URL(url).hostname.replace(/^www\./, '') : null
  const fromHost = host && !/^(127\.|localhost|0\.0\.0\.0)/.test(host) ? host.split('.')[0] : null

  const picked = siteName ?? fromHost ?? (fromTitle && !PAGE_WORDS.test(fromTitle) ? fromTitle : null)
  const needsName = picked === null
  const label = picked ?? 'Site'
  const slug =
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'site'
  return { templateId: slug, label, packageDir: `packages/cms/tracy-emdash-theme-${slug}`, needsName }
}

/**
 * The road the skill should take — which depends on REACH, not only on which CMS it is.
 *
 * A Joomla site keeps a content model, but reading it needs the database or a backup. A public
 * demo on someone else's server gives neither, and then the honest road is the rendered one:
 * crawl what it serves, and record in DECISIONS.md that the content model was not available. The
 * failure this guards against is a skill that sees "joomla" and promises a contract it cannot
 * fetch, then quietly scrapes anyway.
 */
export function roadFor({ cms, reach = 'remote', t4 = false } = {}) {
  if (cms === 'joomla' && reach === 'local') {
    return {
      road: 'contract',
      why: `a Joomla site within reach keeps a content model${t4 ? ' (T4/ACM: page sections carry named fields)' : ' (articles, categories, menus, modules)'}; read it rather than scrape it`,
      how: 'dump the inventory tables, run the WordPress skill’s from-joomla.mjs to write site-model.json (references/site-model.md), then tools/compile-seed.mjs'
    }
  }
  if (cms === 'joomla') {
    return {
      road: 'rendered-ask',
      why: 'this Joomla site answers over HTTP only, so its field names are in a database we cannot reach — the design, which is what a template is made of, is in what it renders',
      how: 'ask ONE question: is there database access, a backup, or a quickstart package? If yes, take the contract road — it is cheaper and exact. If no, crawl the rendered pages (source.kind: url) and note in DECISIONS.md which fields had to be inferred from markup; a template can still be built'
    }
  }
  if (cms === 'wordpress') {
    return {
      road: 'contract-pending',
      why: 'a WordPress site keeps a content model too, but no adapter reads it yet in any of the three skills',
      how: 'either write from-wordpress.mjs emitting site-model.json, or take the rendered road and say so in DECISIONS.md'
    }
  }
  return {
    road: 'rendered',
    why: 'nothing here declares a CMS, so the source is what it renders',
    how: 'download the pages and run tools/inventory.mjs on that folder (references/source-inventory.md, source.kind: url)'
  }
}

/** Local means: this machine, or a host we were given a way into. */
export function reachOf(target) {
  if (!/^https?:\/\//i.test(target)) return 'local'
  const host = new URL(target).hostname
  return /^(127\.|localhost$|0\.0\.0\.0$|host\.docker\.internal$|\[::1\]$)/.test(host) ? 'local' : 'remote'
}

async function main(argv) {
  const target = argv.find((a) => !a.startsWith('--'))
  if (!target) {
    console.error('usage: detect-source.mjs <url-or-folder> [--json]')
    return 2
  }
  let html = ''
  let adminReachable = null
  if (/^https?:\/\//i.test(target)) {
    const response = await fetch(target, { redirect: 'follow' })
    html = await response.text()
    const base = new URL(target)
    for (const path of ['/administrator/', '/wp-login.php']) {
      try {
        const probe = await fetch(new URL(path, base), { method: 'HEAD', redirect: 'manual' })
        if (probe.status < 400) adminReachable = path
      } catch {
        // A closed admin door tells us nothing either way; the page markup already spoke.
      }
    }
  } else {
    const { readFileSync, existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    const index = ['index.html', 'index.htm'].map((f) => join(target, f)).find((f) => existsSync(f))
    if (!index) {
      console.error(`no index.html in ${target} — point at a folder of pages, or a URL`)
      return 2
    }
    html = readFileSync(index, 'utf8')
  }

  const detected = detectFromHtml(html)
  const names = suggestNames({ siteName: detected.siteName, title: detected.title, url: target })
  const reach = reachOf(target)
  const road = roadFor({ cms: detected.cms, reach, t4: detected.t4 })
  const result = {
    source: target,
    reach,
    ...detected,
    adminReachable,
    suggested: { ...names, locales: [detected.lang ?? 'en'] },
    ...road
  }

  if (argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(`source     : ${target}`)
    console.log(
      `CMS        : ${detected.cms}${detected.cms === 'unknown' ? '' : ` (score ${detected.confidence})`}`
    )
    for (const why of detected.evidence) console.log(`             · ${why}`)
    if (adminReachable) console.log(`             · admin door ${adminReachable} answered`)
    console.log(
      `T4/ACM     : ${detected.t4 ? 'yes — page sections are ACM modules with named fields' : 'not seen'}`
    )
    console.log(
      `reach      : ${reach}${reach === 'remote' ? ' (HTTP only — the database is out of reach)' : ''}`
    )
    console.log(
      names.needsName
        ? `name hint  : CANNOT be inferred — intake must ask one question (the site declares no og:site_name, the title is the page name)`
        : `name hint  : ${names.label} → ${names.packageDir}`
    )
    console.log(`languages  : ${result.suggested.locales.join(', ')}`)
    console.log(`road       : ${road.road} — ${road.why}`)
    console.log(`             ${road.how}`)
  }
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)))
