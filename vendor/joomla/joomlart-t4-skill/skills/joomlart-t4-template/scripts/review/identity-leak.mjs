#!/usr/bin/env node
// Does anything still carry the name of a template, brand or menu this build is no longer?
//
// Usage: node identity-leak.mjs --url=<site url> [--template=tracy] [--stale=tracy_apple,tracyapple]
//        node identity-leak.mjs --url=… --db="<shell command that runs SQL and prints rows>"
//
// WHY THIS IS A GATE AND NOT A GREP. FIVE of twenty-two defects in one session were an old name
// left behind by a rename, and not one of them was findable by grepping the source tree:
//
//   · `#__menu_types.menutype` still said `tracyapple` while the template's navigation profile said
//     `tracy` — T4 resolves the menu BY NAME, so the entire desktop navigation rendered empty, on
//     every page, with no error anywhere;
//   · `#__modules.params` held `"type": "tracy_apple:hero"` for nine ACM modules, so every band of
//     the home page rendered from the OLD template's block — its markup, its class prefix, its
//     stylesheet — inside a page wearing the new design system;
//   · article and module CONTENT still wrote `class="tracyapple-…"`, so rules renamed in the layer
//     matched nothing;
//   · `language/en-GB/en-GB.tpl_tracy_apple.ini` kept the old name, and Joomla loads that file BY
//     the template's name — so 231 perfectly good strings went unused and `T4_BACK_TO_TOP` printed
//     as text at the foot of every page;
//   · the logo's `<title>`, a colophon module and a JS global still named the first brand.
//
// The shape they share: a CMS stores the name of the template, the menu, the class prefix and the
// language file in its own tables and filenames, and a rename in the tree reaches none of them.
// Everything renders; it renders confidently, in another build's words.
//
// So this gate reads the SERVED PAGE (what a visitor sees) and, when given a way to query, the
// database. It never reads the source tree, because the source tree is the one place that is
// already correct.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (n, d) => { const h = argv.find((a) => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d; };
const URL_ = opt('url', null);
const TEMPLATE = opt('template', 'tracy');
const DB = opt('db', null);
const PAGES = (opt('pages', '/') || '/').split(',');

if (!URL_) { console.error('Usage: node identity-leak.mjs --url=<site> [--template=tracy] [--stale=a,b] [--db="<cmd>"]'); process.exit(2); }

// Names that are no longer this build's. Derived, so a build does not have to list them by hand:
// anything that looks like the template name with a suffix, plus whatever the caller adds.
// ⚠ `apple` and `airbnb` were two historical builds, hard-coded here. On a template named anything
// else they can never match, and on a template whose own name already carries an underscore the
// `${TEMPLATE}_` form cannot match either — so the derived list was, for most builds, three strings
// that describe nothing. Measured with `--template=tracy_apple`: the scan looked for
// `tracy_apple_`, `tracy_appleapple`, `tracy_appleairbnb` and found nothing, then printed OK.
// The derivation that survives is the SHAPE — this template's name with anything appended — and
// the rest is the caller's to name through `--stale`, which `run-all.sh` passes when `STALE_NAMES`
// is set. What is added here is the count, so "looked for 3 names, found 0" cannot be read as
// "this build carries nothing from a previous one".
const STALE = (opt('stale', '') ? opt('stale', '').split(',') : [])
  .concat([`${TEMPLATE}_`])
  .filter(Boolean);
const STALE_RE = new RegExp(`\\b${TEMPLATE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-z0-9]+`, 'i');

// Two strings belong to every website ever built and must never be renamed.
const ALLOW = [/-apple-system/, /apple-mobile-web-app/, /apple-touch-icon/];

const findings = [];

// ── 1. What the visitor is served ───────────────────────────────────────────
const browser = await chromium.launch();
for (const path of PAGES) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const res = await page.goto(URL_.replace(/\/$/, '') + path, { waitUntil: 'load', timeout: 60000 });
  // A page that did not serve carries no names, and "no names found" on a 404 reads exactly like a
  // clean page. The status was fetched into `res` and never looked at.
  const status = res?.status() ?? 0;
  if (status >= 400) { findings.push({ where: `page ${path}`, what: `served ${status} — nothing could be scanned here`, count: 1 }); await page.context().close(); continue; }
  const html = await page.content();
  // Scripts carry Joomla's own translation payload, where a KEY beside its translation is normal.
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const name of STALE) {
    const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const hits = [...visible.matchAll(re)].filter((m) => {
      const around = visible.slice(Math.max(0, m.index - 24), m.index + 24);
      return !ALLOW.some((a) => a.test(around));
    });
    if (hits.length) findings.push({ where: `page ${path}`, what: name, count: hits.length });
  }
  // A raw language key is the symptom of a language FILE named for another template.
  // The SHAPE scan: this template's name with anything appended. The named list above can only
  // find names someone thought to name; this finds the ones nobody did. Page scan only — the
  // database half runs through LOCATE, which has no pattern language (see the note below).
  const shape = [...new Set((visible.match(new RegExp(STALE_RE.source, 'gi')) || []))]
    .filter((n) => n.toLowerCase() !== TEMPLATE.toLowerCase())
    .filter((n) => !STALE.some((s) => n.toLowerCase().startsWith(s.toLowerCase())));
  for (const n of shape) findings.push({ where: `page ${path}`, what: `${n} (matched by shape, not by name)`, count: 1 });
  const keys = [...new Set((visible.match(/\b(T4|TPL|JGLOBAL|COM|MOD)_[A-Z0-9_]{4,}/g) || []))];
  if (keys.length) findings.push({ where: `page ${path}`, what: `untranslated key(s): ${keys.slice(0, 3).join(', ')}`, count: keys.length });
  await page.close();
}
await browser.close();

// ── 2. What the database stores ─────────────────────────────────────────────
// The caller supplies the command because a gate has no business holding credentials. It should
// print one row per hit; anything it prints is a finding.
if (DB) {
  const q = (sql) => {
    try { return execSync(`${DB} ${JSON.stringify(sql)}`, { encoding: 'utf8' }).trim(); }
    catch (e) { return `ERR ${String(e.message).slice(0, 60)}`; }
  };
  // LOCATE, not LIKE. `_` and `%` are wildcards in LIKE, so `'%tracy_%'` matched `Tracy A` and the
  // gate reported every correctly-named module on the site as stale. Escaping them through SQL, a
  // shell and JSON is three chances to get it wrong; LOCATE has no pattern language at all.
  const hit = (col) => STALE.map((n) => `LOCATE('${n.replace(/'/g, "''")}', ${col}) > 0`).join(' OR ');
  const checks = [
    ['menu type vs template profile', `SELECT CONCAT('menutype=', menutype) FROM #__menu_types`],
    ['ACM modules naming a template', `SELECT CONCAT(id, ' ', title) FROM #__modules WHERE ${hit('params')}`],
    ['content carrying an old prefix', `SELECT CONCAT('article ', id) FROM #__content WHERE ${hit('introtext')}`],
    ['modules carrying an old prefix', `SELECT CONCAT('module ', id) FROM #__modules WHERE ${hit('content')}`],
  ];

  for (const [label, sql] of checks) {
    const out = q(sql.replace(/#__/g, opt('db-prefix', 'tr_')));
    if (!out) continue;
    if (label.startsWith('menu type')) {
      // Reported for the operator to compare against etc/navigation/<profile>.json — the mismatch
      // that empties a navigation bar without an error.
      console.log(`  note: ${out.split('\n').join(' · ')}   (compare with etc/navigation/*.json)`);
      continue;
    }
    for (const row of out.split('\n').filter(Boolean)) findings.push({ where: label, what: row, count: 1 });
  }
}

console.log(`# identity-leak  ${URL_}  template=${TEMPLATE}`);
console.log(`  stale names looked for: ${STALE.join(', ')} (+ on served pages, anything matching /${STALE_RE.source}/)`);
if (!findings.length) {
  console.log('OK — nothing served or stored carries a name this build has left behind');
  process.exit(0);
}
console.log('');
for (const f of findings) console.log(`  ✗ ${f.where}: ${f.what}${f.count > 1 ? `  ×${f.count}` : ''}`);
console.log('');
console.log('A CMS stores the template name, the menu type, the class prefix and the language file');
console.log('name in its own tables and filenames. A rename in the source tree reaches none of them,');
console.log('and every one of them fails by rendering confidently in the previous build\'s words.');
process.exit(1);
