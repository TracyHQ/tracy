#!/usr/bin/env node
// Brand-ready — the Phase 9/10 gate for Tracy's "Customize your site" (references/customize-your-site.md).
// A customer who builds a site from this template answers: business name, logo (light and dark),
// favicon, pages. Each answer lands in a place the TEMPLATE must provide, and a template built
// without them looks fine in every other review: the demo logo, the demo icon and the demo name are
// all there, so nothing is missing until a customer's answer has nowhere to go. Measured on the
// JoomlArt catalogue (TracyHQ/tch#1013): a dark-mode CSS that inverted or swapped the logo, a
// missing dark logo, a hard-coded copyright, a home page whose tab said "Home". Each row below is one
// of those, checked from the files (and, optionally, the demo database).
//
// Template rows (always): logo-pair · drawer-pair · logo-field · logo-strings · profile-keys ·
// pair-css · logo-height · logo-css · favicon. Database rows (with --data or --sql-cmd):
// home-title · copyright. `--fix` writes the three mechanical ones (field, strings, profile keys);
// everything else names its fix. Exit 0 = ready, 1 = a FAIL, 2 = an input could not be read.
//
// Usage: node brand-ready.mjs --template <template-dir> [--fix] [--json]
//        [--webroot <dir>] [--sql-cmd "<cmd>" | --data facts.json] [--prefix jos_]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i < 0 ? d : argv[i + 1]; };
const flag = (n) => argv.includes(n);
const TPL = opt('--template'); const WEBROOT = opt('--webroot'); const SQL = opt('--sql-cmd');
const DATA = opt('--data'); const PREFIX = opt('--prefix', 'jos_'); const FIX = flag('--fix'); const JSON_OUT = flag('--json');
const die = (m) => { console.error(`brand-ready: ${m}`); process.exit(2); };
if (!TPL || !existsSync(path.join(TPL, 'templateDetails.xml'))) die('--template must be a T4 template directory (no templateDetails.xml)');

const rows = [];
const row = (check, verdict, detail, fix = '') => rows.push({ check, verdict, detail, fix });
const read = (rel) => { const f = path.join(TPL, rel); return existsSync(f) ? readFileSync(f, 'utf8') : null; };
const walk = (rel, ext) => {
  const root = path.join(TPL, rel); if (!existsSync(root)) return [];
  const out = [];
  for (const e of readdirSync(root, { withFileTypes: true })) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) out.push(...walk(r, ext)); else if (ext.test(e.name)) out.push(r);
  }
  return out;
};
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
// Flat rules of compiled CSS: `selector { body }`, @media wrappers looked through.
const cssRules = (s) => [...stripCss(s).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));

// ── logo element and drawer: the light/dark pair ────────────────────────────────────────────────
const SHARED = 'install the shared layer (scripts/install-shared-layer.sh), which carries the pair';
const pairIn = (rel, check) => {
  const src = read(rel);
  if (src == null) return row(check, 'FAIL', `${rel} missing: T4's base draws site_logo alone, the same picture on a dark ground`, SHARED);
  const ok = /site_logo_dark/.test(src) && /d-light/.test(src) && /d-dark/.test(src);
  row(check, ok ? 'OK' : 'FAIL', ok ? `${rel} prints site_logo / site_logo_dark as .d-light / .d-dark` : `${rel} does not print site_logo_dark in .d-dark`, ok ? '' : SHARED);
};
pairIn('html/layouts/t4/element/logo.php', 'logo-pair');
pairIn('html/layouts/t4/layout/offcanvas.php', 'drawer-pair');

// ── the admin field, its strings, and the key in every profile ──────────────────────────────────
const FIELDSET = [
  '\t\t\t<!-- Dark-mode logos (appended to the "Logo" settings group; printed by html/layouts/t4/element/logo.php) -->',
  '\t\t\t<fieldset name="site-logo" subgroup="1">',
  '\t\t\t\t<field name="site_logo_dark" type="media" class="t4-input-media" default="" label="TPL_T4_SITE_DARK_LOGO" description="TPL_T4_SITE_LOGO_DARK_DESC" />',
  '\t\t\t\t<field name="site_logo_dark_small" type="media" class="t4-input-media" default="" label="TPL_T4_SITE_LOGO_DARK_SMALL" description="TPL_T4_SITE_LOGO_DARK_SMALL_DESC" />',
  '\t\t\t</fieldset>'
].join('\n');
let xml = read('templateDetails.xml');
const typelist = read('params/typelist-site.xml') ?? '';
if (/name="site_logo_dark"/.test(xml) || /name="site_logo_dark"/.test(typelist)) row('logo-field', 'OK', 'site_logo_dark is a field of the site settings');
else if (FIX && /<fields\s+name="typelist-site"\s*>/.test(xml)) {
  xml = xml.replace(/(<fields\s+name="typelist-site"\s*>)/, `$1\n${FIELDSET}`);
  writeFileSync(path.join(TPL, 'templateDetails.xml'), xml);
  row('logo-field', 'FIXED', 'templateDetails.xml: site_logo_dark + site_logo_dark_small added to <fields name="typelist-site">');
} else row('logo-field', 'FAIL', 'no site_logo_dark field: the admin has nowhere to set a dark logo, Tracy has nowhere to write one',
  /<fields\s+name="typelist-site"/.test(xml) ? 'run with --fix' : 'add <fields name="typelist-site"> to templateDetails.xml <config>, then --fix');

const STRINGS = {
  TPL_T4_SITE_DARK_LOGO: 'Logo Dark Image',
  TPL_T4_SITE_LOGO_DARK_DESC: 'Logo shown in dark mode. Empty: dark mode shows the site name.',
  TPL_T4_SITE_LOGO_DARK_SMALL: 'Logo Dark on mobile',
  TPL_T4_SITE_LOGO_DARK_SMALL_DESC: 'Logo shown in dark mode on phones. Empty: the Logo Dark Image.'
};
const iniRel = walk('language/en-GB', /^en-GB\.tpl_.*\.ini$/).find((f) => !f.endsWith('.sys.ini'));
if (!iniRel) row('logo-strings', 'FAIL', 'no language/en-GB/en-GB.tpl_<name>.ini', 'scaffold the template first');
else {
  const ini = read(iniRel);
  const missing = Object.keys(STRINGS).filter((k) => !new RegExp(`^${k}=`, 'm').test(ini));
  if (!missing.length) row('logo-strings', 'OK', `${iniRel} labels the dark-logo fields`);
  else if (FIX) {
    writeFileSync(path.join(TPL, iniRel), `${ini.replace(/\s*$/, '\n')}\n${missing.map((k) => `${k}="${STRINGS[k]}"`).join('\n')}\n`);
    row('logo-strings', 'FIXED', `${iniRel}: ${missing.join(', ')} added`);
  } else row('logo-strings', 'FAIL', `${iniRel} lacks ${missing.join(', ')}: the admin shows raw keys`, 'run with --fix');
}

const profiles = walk('etc/site', /\.json$/);
if (!profiles.length) row('profile-keys', 'FAIL', 'no etc/site/*.json profile', 'scaffold the template first');
else {
  const bad = [];
  for (const rel of profiles) {
    const raw = read(rel); let data;
    try { data = JSON.parse(raw); } catch { die(`${rel} is not JSON`); }
    if (typeof data.site_logo_dark === 'string') continue;
    if (!FIX) { bad.push(rel); continue; }
    // Textual insert: these files are one compact line with escaped slashes, and a re-serialise
    // would rewrite every byte of a file the contract hashes.
    const at = /"site_logo_small"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(raw) ?? /"site_logo"\s*:\s*"(?:[^"\\]|\\.)*"/.exec(raw);
    const next = at ? raw.slice(0, at.index + at[0].length) + ',"site_logo_dark":""' + raw.slice(at.index + at[0].length)
      : raw.replace(/\}\s*$/, (m) => `${Object.keys(data).length ? ',' : ''}"site_logo_dark":""${m}`);
    JSON.parse(next);
    writeFileSync(path.join(TPL, rel), next);
    bad.push(`${rel} (fixed)`);
  }
  const fixed = bad.filter((b) => b.endsWith('(fixed)'));
  if (!bad.length) row('profile-keys', 'OK', `${profiles.length} profile(s) carry site_logo_dark`);
  else if (fixed.length === bad.length) row('profile-keys', 'FIXED', `"site_logo_dark":"" added to ${fixed.join(', ')}`);
  else row('profile-keys', 'FAIL', `no site_logo_dark key in ${bad.join(', ')}: Tracy writes the dark logo only into a key the profile carries`, 'run with --fix');
}

// ── compiled CSS: the pair is switched, the logo is capped, nothing repaints it ─────────────────
const cssFiles = walk('css', /\.css$/);
if (!cssFiles.length) row('pair-css', 'FAIL', 'no compiled css/*.css', 'compile the SCSS first (scripts/compile-scss.sh)');
else {
  const rules = cssFiles.flatMap((f) => cssRules(read(f)).map((r) => ({ ...r, file: f })));
  const hides = rules.some((r) => /\.navbar-brand\s+\.d-dark/.test(r.sel) && /display\s*:\s*none/.test(r.body));
  const shows = rules.some((r) => /\[data-theme=["']?dark["']?\]|\.t4-dark|data-bs-theme=["']?dark/.test(r.sel) && /\.navbar-brand\s+\.d-light/.test(r.sel) && /display\s*:\s*none/.test(r.body));
  row('pair-css', hides && shows ? 'OK' : 'FAIL', hides && shows ? '.d-dark hidden in light, .d-light hidden in dark' : 'the .d-light/.d-dark pair is not switched by the dark hook: both logos show, or the wrong one',
    hides && shows ? '' : 'compile the shared layer scss/_chrome.scss into template.css');
  const capped = rules.some((r) => /logo-img/.test(r.sel) && /max-height\s*:/.test(r.body));
  row('logo-height', capped ? 'OK' : 'FAIL', capped ? 'img.logo-img has a max-height' : 'no max-height on img.logo-img: a 500px upload renders 500px tall',
    capped ? '' : 'set --tracy-logo-height to the design\'s logo height (scss/_chrome.scss caps by it)');
  // The site's own logo boxes only: a partner-logo strip (`.logo-strip img { filter: grayscale(1) }`)
  // is content, not the brand, and stays out of this row.
  const LOGO = /navbar-brand|t4-off-canvas-header|\.(?:logo|t4-logo|tracy-logo|logo-img|logo-img-sm|logo-image|site-logo)(?![\w-])/i;
  const repaint = rules.filter((r) => LOGO.test(r.sel) && (/(^|;|\s)filter\s*:\s*(?!none\b)[^;]+/i.test(r.body) || /content\s*:\s*url\(/i.test(r.body)));
  row('logo-css', repaint.length ? 'FAIL' : 'OK', repaint.length
    ? `CSS repaints or swaps the logo: ${repaint.slice(0, 5).map((r) => `${r.file} "${r.sel.slice(0, 80)}"`).join('; ')}${repaint.length > 5 ? ` (+${repaint.length - 5})` : ''}`
    : `no filter / content:url() on a logo selector in ${cssFiles.length} css file(s)`,
    repaint.length ? 'delete the rule: a dark logo is site data (site_logo_dark), never a stylesheet' : '');
}

// ── favicon: only through T4's other_faviconFile ────────────────────────────────────────────────
const php = [...readdirSync(TPL).filter((f) => f.endsWith('.php')), ...walk('html', /\.php$/)];
const ICON = /rel\s*=\s*["'](?:shortcut\s+)?icon["']|addFavicon\s*\(|addHeadLink\s*\([^)]*['"](?:shortcut\s+)?icon['"]/i;
// The standalone entry points (error, offline, component) render without T4, which is why they may link
// the template's icon by hand: there is no customer choice there to compete with. That is a NOTE (the
// customer's icon does not reach an error page), never a FAIL; a link in index.php or html/** is.
const STANDALONE = /^(?:error[\w-]*|offline|component)\.php$/;
const linked = php.filter((f) => ICON.test(read(f)));
const hard = linked.filter((f) => !STANDALONE.test(f));
const alone = linked.filter((f) => STANDALONE.test(f));
const typelistOk = !typelist || /name="other_faviconFile"/.test(typelist);
row('favicon', !hard.length && typelistOk ? 'OK' : 'FAIL',
  hard.length ? `hard-coded favicon in ${hard.join(', ')}: the customer's icon is a second candidate the browser may ignore`
    : typelistOk ? 'the favicon is T4\'s other_faviconFile (empty keeps the template icon)' : 'params/typelist-site.xml drops other_faviconFile: the admin and Tracy lose the favicon field',
  hard.length ? 'remove the <link rel="icon">; set the demo icon in other_faviconFile or ship favicon.ico' : typelistOk ? '' : 'add the site-other fieldset with other_faviconFile (recurring-defects.md)');
if (alone.length) row('favicon', 'NOTE', `${alone.join(', ')} link the template's own icon (T4 does not render there): error and offline pages keep it after the customer sets theirs`,
  'optional: read other_faviconFile from the active profile there, falling back to favicon.ico');

// ── demo database: the home page title and the copyright line ───────────────────────────────────
let facts = null;
if (DATA) { try { facts = JSON.parse(readFileSync(DATA, 'utf8')); } catch (e) { die(`--data: ${e.message}`); } }
else if (SQL) {
  const q = (sql) => execSync(SQL, { input: sql.replaceAll('#__', PREFIX), encoding: 'utf8' }).split('\n').filter(Boolean).map((l) => l.split('\t'));
  const unesc = (s) => (s ?? '').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
  try {
    facts = {
      homeItems: q('SELECT id, language, params FROM #__menu WHERE home = 1 AND client_id = 0 AND published = 1;').map(([id, language, params]) => ({ id: +id, language, params: unesc(params) })),
      modules: q("SELECT id, module, title, content FROM #__modules WHERE client_id = 0 AND published = 1 AND module IN ('mod_custom', 'mod_footer');").map(([id, module, title, content]) => ({ id: +id, module, title, content: unesc(content) }))
    };
  } catch (e) { die(`--sql-cmd failed: ${e.message}`); }
}
if (facts && WEBROOT && facts.sitenamePagetitles == null) {
  const conf = existsSync(path.join(WEBROOT, 'configuration.php')) ? readFileSync(path.join(WEBROOT, 'configuration.php'), 'utf8') : '';
  const m = /\$sitename_pagetitles\s*=\s*'?(\d)/.exec(conf);
  if (m) facts.sitenamePagetitles = +m[1];
}
if (facts) {
  const homes = facts.homeItems ?? [];
  const named = (facts.sitenamePagetitles ?? 0) > 0;
  const untitled = homes.filter((h) => { try { return !String(JSON.parse(h.params || '{}').page_title ?? '').trim(); } catch { return true; } });
  if (!homes.length) row('home-title', 'FAIL', 'no published home menu item', 'set a Home in the Main Menu');
  else if (named || !untitled.length) row('home-title', 'OK', named ? 'Site Name in Page Titles is on' : `${homes.length} home item(s) set a Browser Page Title`);
  else row('home-title', 'FAIL', `home item(s) ${untitled.map((h) => `${h.id} (${h.language})`).join(', ')} have no Browser Page Title: the tab says "Home", never the customer's name`,
    'set the home item\'s Page Display › Browser Page Title, or Global Configuration › Site Name in Page Titles');
  const mods = facts.modules ?? [];
  const COPY = /©|&copy;|copyright/i;
  const custom = mods.filter((m) => m.module === 'mod_custom' && COPY.test(m.content ?? ''));
  const footer = mods.some((m) => m.module === 'mod_footer');
  row('copyright', custom.length ? 'FAIL' : 'OK', custom.length
    ? `copyright typed into custom module(s) ${custom.map((m) => `${m.id} "${m.title}"`).join(', ')}: it keeps the demo's name on the customer's site`
    : footer ? 'the copyright is core mod_footer (year + Global Configuration › Site Name)' : 'no copyright line in the demo',
    custom.length ? 'use the core Footer module (mod_footer), which prints the year and the site name' : '');
}

// ── report ──────────────────────────────────────────────────────────────────────────────────────
const fail = rows.some((r) => r.verdict === 'FAIL');
if (JSON_OUT) console.log(JSON.stringify({ template: TPL, ready: !fail, rows }, null, 2));
else {
  for (const r of rows) console.log(`${r.verdict.padEnd(5)} ${r.check.padEnd(12)} ${r.detail}${r.fix ? `\n${' '.repeat(19)}fix: ${r.fix}` : ''}`);
  if (!facts) console.log('NOTE  database rows (home-title, copyright) not checked: pass --data or --sql-cmd');
  console.log(fail ? 'brand-ready: NOT READY' : 'brand-ready: READY for Customize your site');
}
process.exit(fail ? 1 : 0);
