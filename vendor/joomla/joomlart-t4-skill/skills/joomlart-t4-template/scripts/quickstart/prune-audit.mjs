#!/usr/bin/env node
// Prune audit — the Phase 10 Q1a gate (packaging-quickstart.md). A site built ON a quickstart (not a
// blank) keeps the base's DEFINITIONS after every row that used them is gone: ACM block dirs no
// module names, layouts and profiles no style names, overrides for components with no menu item,
// the base template still installed beside the new one, and a manifest whose description, author
// and thumbnails are still the base's. Nothing in the docroot scrub (quickstart-gotchas) or the
// de-blank rebrand (gotchas #45) sees any of it: it is not junk at the docroot and it does not say
// "Blank". Found live on Northgate/tracy_business 2026-09-13: 18 ACM dirs, 8 layouts, 6 profiles,
// 5 overrides, 1 template, description "Tracy Base is…", JoomlArt author, base thumbnails.
//
// Data comes from the DB (through `--sql-cmd`, a shell command that runs SQL from stdin and prints
// tab-separated rows, e.g. `docker compose exec -T db sh -c 'mariadb -N -B -uroot -p… site'`) or
// from `--data facts.json` (the same facts, pre-collected — what the tests use). Every row is
// KEEP / PRUNE / UNKNOWN with the measurement that decided it; exit 1 while any PRUNE remains.
// `--apply` removes PRUNE files/dirs; extensions are never removed by this script — it prints the
// `extension:remove <id>` command for the operator.
//
// Usage: node prune-audit.mjs --webroot <dir> --template <name> [--prefix jos_] [--sql-cmd "<cmd>" | --data facts.json]
//        [--base <template>] [--base-dir <dir>] [--keep-ext "tracyaccess,com_claudecowork"] [--apply] [--json]
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); if (i < 0) return d; const v = argv[i + 1]; argv.splice(i, 2); return v; };
const flag = (n) => { const i = argv.indexOf(n); if (i < 0) return false; argv.splice(i, 1); return true; };
const webroot = opt('--webroot'); const tpl = opt('--template'); const prefix = opt('--prefix', 'jos_');
const sqlCmd = opt('--sql-cmd'); const dataFile = opt('--data'); const base = opt('--base'); const baseDir = opt('--base-dir');
const keepExt = (opt('--keep-ext', '') || '').split(',').map(s => s.trim()).filter(Boolean);
const apply = flag('--apply'); const asJson = flag('--json');
if (!webroot || !tpl || (!sqlCmd && !dataFile)) { console.error('usage: prune-audit.mjs --webroot <dir> --template <name> (--sql-cmd "<cmd>" | --data facts.json) [--prefix p_] [--base <tpl>] [--base-dir <dir>] [--keep-ext a,b] [--apply] [--json]'); process.exit(2); }
const T = path.join(webroot, 'templates', tpl);
const CORE_TEMPLATES = ['cassiopeia', 'atum', 'system', 'cassiopeia_extended'];
const CORE_EXT = /^(com_|mod_|plg_)?(ajax|admin|banners|cache|categories|checkin|config|contact|content|contenthistory|cpanel|fields|finder|guidedtours|installer|joomlaupdate|languages|login|mails|media|menus|messages|modules|newsfeeds|plugins|postinstall|privacy|redirect|scheduler|tags|templates|users|wrapper|workflow|actionlogs|associations|)$/;

// ---------------------------------------------------------------- facts
let F;
if (dataFile) { F = JSON.parse(readFileSync(dataFile, 'utf8')); }
else {
  const q = (sql) => execSync(sqlCmd, { input: sql.replaceAll('#__', prefix), encoding: 'utf8', maxBuffer: 64 << 20 }).split('\n').filter(Boolean).map(l => l.split('\t'));
  F = {
    moduleTypes: q(`SELECT DISTINCT REGEXP_SUBSTR(params, '${tpl}:[a-z0-9_-]+') FROM #__modules WHERE module='mod_ja_acm' AND params LIKE '%${tpl}:%'`).map(r => r[0].slice(tpl.length + 1)),
    moduleNames: q("SELECT DISTINCT module FROM #__modules WHERE client_id=0").map(r => r[0]),
    styleParams: q(`SELECT params FROM #__template_styles WHERE template='${tpl}'`).map(r => r[0]),
    menuOptions: q("SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(link,'option=',-1),'&',1) FROM #__menu WHERE client_id=0 AND link LIKE '%option=%'").map(r => r[0]),
    plugins: q("SELECT CONCAT('plg_', folder, '_', element) FROM #__extensions WHERE type='plugin' AND enabled=1").map(r => r[0]),
    templates: q("SELECT e.element, e.extension_id, IFNULL(s.n,0), IFNULL(s.home,0) FROM #__extensions e LEFT JOIN (SELECT template, COUNT(m.id) n, MAX(ts.home) home FROM #__template_styles ts LEFT JOIN #__menu m ON m.template_style_id=ts.id WHERE ts.client_id=0 GROUP BY template) s ON s.template=e.element WHERE e.type='template' AND e.client_id=0").map(r => ({ element: r[0], id: +r[1], menuItems: +r[2], home: +r[3] })),
    extensions: q("SELECT type, element, folder, extension_id, IFNULL(REPLACE(REPLACE(params, '\\n', ' '), '\\t', ' '), '') FROM #__extensions WHERE enabled=1 AND type IN ('component','plugin','module','package','template') AND NOT (type='module' AND client_id=1)").map(r => ({ type: r[0], element: r[1], folder: r[2], id: +r[3], params: r[4] })),
    manifest: JSON.parse((q(`SELECT manifest_cache FROM #__extensions WHERE type='template' AND element='${tpl}'`)[0] || ['{}'])[0] || '{}'),
    baseManifest: base ? JSON.parse((q(`SELECT manifest_cache FROM #__extensions WHERE type='template' AND element='${base}'`)[0] || ['null'])[0] || 'null') : null,
  };
}
const rows = []; const say = (area, item, verdict, why, removePath) => rows.push({ area, item, verdict, why, removePath });
const ls = (d, pred = () => true) => existsSync(d) ? readdirSync(d).filter(n => n !== 'index.html' && pred(path.join(d, n))) : [];
const styleParams = F.styleParams.map(p => { try { return JSON.parse(p); } catch { return {}; } });
const named = (key) => new Set(styleParams.map(p => p[key]).filter(Boolean));

// 1. ACM block definitions vs modules (any state)
const used = new Set(F.moduleTypes);
for (const n of ls(path.join(T, 'acm'), p => statSync(p).isDirectory())) say('acm', n, used.has(n) ? 'KEEP' : 'PRUNE', used.has(n) ? 'a module of this type exists' : `no module of type ${tpl}:${n} in any state`, path.join(T, 'acm', n));
// 2. layouts vs style params
const layouts = new Set([...named('typelist-layout'), ...named('sub-layout')]);
for (const f of ls(path.join(T, 'etc/layout'), p => p.endsWith('.json'))) { const n = f.replace(/\.json$/, ''); say('layout', n, layouts.has(n) ? 'KEEP' : 'PRUNE', layouts.has(n) ? 'named by a style' : 'no style names it', path.join(T, 'etc/layout', f)); }
// 3. profiles vs style params
for (const kind of ['site', 'theme', 'navigation']) { const set = named('typelist-' + kind); for (const f of ls(path.join(T, 'etc', kind), p => p.endsWith('.json'))) { const n = f.replace(/\.json$/, ''); say('profile:' + kind, n, set.has(n) ? 'KEEP' : 'PRUNE', set.has(n) ? 'named by a style' : 'no style names it', path.join(T, 'etc', kind, f)); } }
if (existsSync(path.join(T, 'etc/presets'))) say('profile:presets', 'etc/presets', 'PRUNE', 'design presets are build-time input, not a shipped profile', path.join(T, 'etc/presets'));
// 4. overrides vs extension usage
const mods = new Set(F.moduleNames), opts = new Set(F.menuOptions), plgs = new Set(F.plugins);
for (const n of ls(path.join(T, 'html'), p => statSync(p).isDirectory())) {
  if (n === 'layouts') { say('override', n, 'KEEP', 'layout overrides (chromes, T4 blocks/elements)'); continue; }
  let ok, why;
  if (n.startsWith('com_')) { ok = opts.has(n) || n === 'com_content' || n === 'com_tags'; why = ok ? 'a menu item or content route uses it' : 'no menu item links to this component'; }
  else if (n.startsWith('mod_')) { ok = mods.has(n); why = ok ? 'a module of this type exists' : 'no module of this type'; }
  else if (n.startsWith('plg_')) { ok = plgs.has(n); why = ok ? 'plugin enabled' : 'plugin not enabled'; }
  else { ok = true; why = 'not an extension override'; }
  say('override', n, ok ? 'KEEP' : 'PRUNE', why, path.join(T, 'html', n));
}
// 5. other site templates
for (const t of F.templates) {
  if (t.element === tpl) { say('template', t.element, 'KEEP', 'the template being packaged'); continue; }
  if (CORE_TEMPLATES.includes(t.element)) { say('template', t.element, 'KEEP', 'Joomla core template'); continue; }
  const ok = t.menuItems > 0 || t.home > 0;
  say('template', t.element, ok ? 'KEEP' : 'PRUNE', ok ? `${t.menuItems} menu items / home=${t.home}` : `no menu item, not home — remove with: php cli/joomla.php extension:remove ${t.id}`);
}
// 6. non-core extensions: review list (never auto-pruned)
for (const e of F.extensions) {
  const el = e.element; if (e.type === 'template') continue;
  const coreish = CORE_EXT.test(el.replace(/^(com_|mod_|plg_)/, '')) || /^(plg_|mod_|com_)?(joomla|content|system|user|editors|fields|finder|privacy|sef|task|api-authentication|authentication|behaviour|captcha|extension|filesystem|installer|media-action|multifactorauth|quickicon|sampledata|schemaorg|webservices|workflow|actionlog)/.test(el) || ['mod_articles', 'mod_articles_categories', 'mod_articles_category', 'mod_breadcrumbs', 'mod_custom', 'mod_finder', 'mod_languages', 'mod_menu', 'mod_login', 'mod_syndicate', 'mod_tags_popular', 'mod_tags_similar', 'mod_users_latest', 'mod_whosonline', 'mod_wrapper', 'mod_banners', 'mod_feed', 'mod_footer', 'mod_random_image', 'mod_related_items', 'mod_stats', 'mod_articles_archive', 'mod_articles_latest', 'mod_articles_news', 'mod_articles_popular'].includes(el) || /^[a-z]{2}-[A-Z]{2}$/.test(el) || /^pkg_[a-z]{2}-[A-Z]{2}$/.test(el);
  if (coreish || e.type === 'plugin' && ['system', 'content', 'user', 'editors', 'editors-xtd', 'fields', 'finder', 'privacy', 'task', 'authentication', 'api-authentication', 'behaviour', 'captcha', 'extension', 'filesystem', 'installer', 'media-action', 'multifactorauth', 'quickicon', 'sampledata', 'schemaorg', 'webservices', 'workflow', 'actionlog'].includes(e.folder) && !/t4|ja|tracy|claude|akeeba/.test(el)) continue;
  // a token is a secret whatever the keep decision is: the provisioner sets it on the target site
  if (/"token"\s*:\s*"[^"]{8,}"/.test(e.params)) say('secret', el, 'PRUNE', 'extension params carry a token — clear it before the backup (the provisioner sets it)');
  // a content-contract profile names ONE published quickstart; a base's profile carried into a new template
  // would try to bind the customer's site to the wrong contract on a Tracy host
  const contract = (e.params.match(/"contract"\s*:\s*"([^"]*)"/) || [])[1];
  if (contract) { const own = new RegExp('^' + tpl.replace(/_/g, '[-_]') + '\\b'); say('contract', el, own.test(contract.replace(/\\\//g, '/')) ? 'KEEP' : 'PRUNE', own.test(contract.replace(/\\\//g, '/')) ? `contract ${contract}` : `contract "${contract.replace(/\\\//g, '/')}" names another quickstart — clear it (no contract) or capture this template's own`); }
  if (keepExt.some(k => el === k || (k.endsWith('*') && el.startsWith(k.slice(0, -1))))) { say('extension', el, 'KEEP', 'listed in --keep-ext'); continue; }
  say('extension', `${e.type}:${el}`, 'UNKNOWN', 'not core, not the template — decide: customer site needs it (keep) or build tooling (extension:remove ' + e.id + ')');
}
// 7. design-system css files vs the theme a style names
const themes = named('typelist-theme');
for (const f of ls(path.join(T, 'css/styles'), p => p.endsWith('.css'))) { const n = f.replace(/\.css$/, ''); say('css:styles', n, themes.has(n) ? 'KEEP' : 'PRUNE', themes.has(n) ? 'named by a style' : 'no style names this design system', path.join(T, 'css/styles', f)); }
// 8 + 9. identity vs the base template (manifest + images)
const sha = (p) => existsSync(p) ? createHash('sha256').update(readFileSync(p)).digest('hex') : null;
const bm = F.baseManifest;
if (!bm && !baseDir) say('identity', 'manifest', 'UNKNOWN', 'pass --base <template> (still installed) or --base-dir <its files> to compare description/author/copyright/dates/images with the base');
if (bm) {
  for (const k of ['description', 'author', 'authorUrl', 'authorEmail', 'copyright', 'creationDate', 'version']) {
    const same = bm[k] !== undefined && bm[k] !== '' && bm[k] === F.manifest[k];
    say('identity', k, same ? 'PRUNE' : 'KEEP', same ? `still the base's value: ${String(bm[k]).slice(0, 60)}` : `differs from the base (${String(F.manifest[k] ?? '').slice(0, 50)})`);
  }
}
if (baseDir) {
  for (const img of ['template_preview.png', 'template_thumbnail.png']) { const a = sha(path.join(T, img)), b = sha(path.join(baseDir, img)); say('identity', img, a && a === b ? 'PRUNE' : (a ? 'KEEP' : 'UNKNOWN'), a && a === b ? "byte-identical to the base's image" : (a ? 'differs from the base' : 'missing')); }
  for (const f of ['templateInfo.php']) { const a = sha(path.join(T, f)), b = sha(path.join(baseDir, f)); if (a && b) say('identity', f, a === b ? 'UNKNOWN' : 'KEEP', a === b ? "identical to the base's — check the prose it prints" : 'differs from the base'); }
}
// description KEY must resolve to template-specific text
const descKey = F.manifest.description || '';
if (/^TPL_/.test(descKey)) {
  const ini = ls(path.join(T, 'language/en-GB'), p => p.endsWith('.sys.ini')).map(f => readFileSync(path.join(T, 'language/en-GB', f), 'utf8')).join('\n');
  const m = ini.match(new RegExp('^' + descKey + '="([^"]*)"', 'm'));
  if (!m) say('identity', 'description text', 'PRUNE', `${descKey} is not defined in language/en-GB/*.sys.ini — admin shows the raw key`);
  else if (baseDir && bm && bm.description) {
    // the base's own description, resolved from ITS sys.ini: equal text = the admin still describes the base
    const bini = ls(path.join(baseDir, 'language/en-GB'), p => p.endsWith('.sys.ini')).map(f => readFileSync(path.join(baseDir, 'language/en-GB', f), 'utf8')).join('\n');
    const bmatch = bini.match(new RegExp('^' + bm.description + '="([^"]*)"', 'm'));
    const same = bmatch && bmatch[1].trim() === m[1].trim();
    say('identity', 'description text', same ? 'PRUNE' : 'KEEP', same ? `still the base's description: "${m[1].slice(0, 60)}…"` : `"${m[1].slice(0, 70)}…"`);
  }
  else say('identity', 'description text', 'UNKNOWN', `"${m[1].slice(0, 60)}…" — pass --base-dir to compare with the base's text`);
}

// ---------------------------------------------------------------- report / apply
const prune = rows.filter(r => r.verdict === 'PRUNE'), unknown = rows.filter(r => r.verdict === 'UNKNOWN');
if (apply) for (const r of prune) if (r.removePath && existsSync(r.removePath)) { rmSync(r.removePath, { recursive: true, force: true }); r.verdict = 'REMOVED'; }
if (asJson) console.log(JSON.stringify({ template: tpl, rows, prune: prune.length, unknown: unknown.length }, null, 1));
else {
  for (const r of rows) if (r.verdict !== 'KEEP') console.log(`${r.verdict.padEnd(8)} ${r.area.padEnd(16)} ${r.item.padEnd(28)} ${r.why}`);
  console.log(`\n${rows.length} checks — ${rows.filter(r => r.verdict === 'KEEP').length} keep, ${prune.length} prune${apply ? ' (files removed)' : ''}, ${unknown.length} to decide`);
}
process.exit(prune.length && !apply ? 1 : 0);
