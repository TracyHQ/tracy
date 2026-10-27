#!/usr/bin/env node
/**
 * THE ADDRESSES OF THIS SITE — the handful of ids an agent otherwise spends its first calls hunting.
 *
 * WHY THIS EXISTS. Decoded from four real sessions on 17/09/2026: of 213 tool calls, **53 (25%)**
 * were reads whose only purpose was finding WHICH RECORD holds a thing the customer pointed at —
 * which template style carries the brand (8 calls), which module draws the breadcrumb (11), which
 * languages exist at all (27), which menu item is the front page (7). None of those calls changed
 * anything. The per-turn context already told the agent the MECHANISM ("the breadcrumb's Home is the
 * breadcrumbs module's `homeText`") and it is a good sentence; what it could not say is `id 17`.
 *
 * 🔒 ADDRESSES, NEVER VALUES, AND THE DISTINCTION IS THE WHOLE DESIGN. A value — `homeText: ""`,
 * `siteTitle: "Acme"` — is wrong the moment the agent writes to it, and a stale value injected as
 * fact is worse than no fact: the agent acts on it without a reason to doubt it. An ADDRESS is
 * durable under every content edit this tool exists to make. Changing the breadcrumb's wording does
 * not renumber the module. So this file carries `id 17`, and the door answers what is in it.
 *
 * The one deliberate exception is `languages`, because "which languages exist" is not a value on a
 * record, it is the shape of the site, and 27 of the 53 calls were spent on it. It goes stale only
 * when a language is installed or published — rare, loud, and a `content.list` away. Its addresses
 * come with it (J4): `siteLanguage` (the edition `/` serves), `languagePrefixes` (each published
 * language's URL prefix, only while the language filter is on) and `defaultPrefixRemoved` (whether
 * `/` IS that edition or sends to its prefix). On a 44-language Business site an agent asked for "the
 * Russian version" otherwise asks the customer which one, or reads pages to find `/ru/`; and the
 * prefix is not the language code's first half everywhere (`pt-BR` is `/pt/`, `pt-PT` is `/pt-pt/`).
 *
 * WHERE IT IS WRITTEN, and why not in the site folder: `<sitesRoot>/.site-facts/<label>.json`, the
 * same shape and the same reasoning as `.content-contracts/<label>.json` — beside the site folders,
 * never inside one a seat can write. The agent's file tools are fenced to its own folder, so it
 * cannot edit what the host injects about it.
 *
 * 🔒 FAIL CLOSED. A key that could not be measured is ABSENT, never empty. On this platform an
 * unmeasured key and a genuinely empty one render identically — demojoomla's default template style
 * really does have `siteTitle: ""` — so an empty string that meant "the probe failed" would be read
 * as "the brand is deliberately unset, the template shows its shipped logo", which is a different
 * site. Absent keys make `siteContext` fall back to the prose for that layer, which is where we were.
 *
 * Usage:  node collect-site-facts.mjs <sitesRoot> <label> <platform>
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

/** How long one probe may take before the site is treated as unmeasurable. */
const PROBE_MS = 15_000

/**
 * One command inside the site's own web container.
 *
 * The site's credentials live in that container and nowhere else — the docker proxy allows exec into
 * `<label>-web-1` and denies `<label>-db-1` outright, so the database is reachable only through the
 * site, which is also the only reading that can be trusted to match what the site itself sees.
 *
 * @param {string} label
 * @param {string[]} argv
 * @returns {Promise<string | null>} stdout, or null when anything at all went wrong.
 */
function inContainer(label, argv) {
  return new Promise((resolve) => {
    execFile(
      'docker',
      ['exec', '-w', '/var/www/html', `${label}-web-1`, ...argv],
      { timeout: PROBE_MS, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => resolve(error ? null : String(stdout ?? ''))
    )
  })
}

/**
 * Joomla keeps every address in its own database, so one PHP round trip reads them all.
 *
 * Deliberately NOT `joomla.php` CLI: it boots the whole application, it is slower, and on a site
 * whose CLI is missing or broken this would report the site unmeasurable when the database is fine.
 */
const JOOMLA_PROBE = `
require "configuration.php"; $c = new JConfig();
$m = @new mysqli($c->host, $c->user, $c->password, $c->db, (int)($c->dbport ?: 3306));
if ($m->connect_errno) { exit(1); }
$p = $m->real_escape_string($c->dbprefix);
$out = [];
$style = $m->query("SELECT id, template FROM {$p}template_styles WHERE home=1 AND client_id=0 LIMIT 1");
if ($style && ($r = $style->fetch_assoc())) {
  $out["template"] = $r["template"];
  $out["templateStyleId"] = (int)$r["id"];
}
$b = $m->query("SELECT id FROM {$p}modules WHERE module='mod_breadcrumbs' AND client_id=0 AND published=1 LIMIT 1");
if ($b && ($r = $b->fetch_assoc())) { $out["breadcrumbsModuleId"] = (int)$r["id"]; }
$h = $m->query("SELECT id FROM {$p}menu WHERE home=1 AND client_id=0 AND published=1 LIMIT 1");
if ($h && ($r = $h->fetch_assoc())) { $out["homeMenuItemId"] = (int)$r["id"]; }
$ls = $m->query("SELECT lang_code, published FROM {$p}languages ORDER BY lang_code");
if ($ls) {
  $L = [];
  while ($r = $ls->fetch_assoc()) { $L[] = $r["lang_code"] . ((int)$r["published"] === 1 ? "" : " (unpublished)"); }
  if (count($L)) { $out["languages"] = $L; }
}
$cl = $m->query("SELECT params FROM {$p}extensions WHERE element='com_languages' AND type='component' LIMIT 1");
if ($cl && ($r = $cl->fetch_assoc())) {
  $cp = json_decode((string)$r["params"], true);
  if (is_array($cp) && is_string($cp["site"] ?? null) && $cp["site"] !== "") { $out["siteLanguage"] = $cp["site"]; }
}
$lf = $m->query("SELECT params FROM {$p}extensions WHERE element='languagefilter' AND folder='system' AND enabled=1 LIMIT 1");
if ($lf && ($r = $lf->fetch_assoc())) {
  $fp = json_decode((string)$r["params"], true);
  $out["defaultPrefixRemoved"] = is_array($fp) && (string)($fp["remove_default_prefix"] ?? "0") === "1";
  $sf = $m->query("SELECT lang_code, sef FROM {$p}languages WHERE published=1 ORDER BY lang_code");
  if ($sf) {
    $S = [];
    while ($r = $sf->fetch_assoc()) { if ((string)$r["sef"] !== "") { $S[$r["lang_code"]] = $r["sef"]; } }
    if (count($S)) { $out["languagePrefixes"] = $S; }
  }
}
echo json_encode($out);
`

/**
 * WordPress is asked to load ITSELF, and that is not a stylistic choice.
 *
 * 🔒 DO NOT PARSE `wp-config.php`. The first version of this read `define('DB_NAME', '…')` with a
 * regular expression and returned nothing on the very first real site it met: the official
 * `wordpress` image ships a `wp-config.php` whose every value is `getenv_docker('WORDPRESS_DB_NAME',
 * …)`, so there are no literals to match. Measured on demowordpress 17/09 — prefix NULL, DB_NAME
 * NULL, and the collector dutifully reported the site unmeasurable while the site was perfectly fine.
 *
 * `wp-load.php` is WordPress's own bootstrap: it resolves environment variables, constants and
 * drop-ins exactly as a page request would, and it hands back the answers WordPress itself would
 * give. `is_block_theme()` in particular is WordPress's own test — the earlier version guessed from
 * whether a `templates/` directory existed, and that guess decides which edit works, which is the
 * one thing Tracy's own guidance says to check before assuming.
 *
 * `WP_USE_THEMES=false` keeps it to a bootstrap: no template is rendered and nothing is written.
 */
const WORDPRESS_PROBE = `
define("WP_USE_THEMES", false);
require "wp-load.php";
$theme = wp_get_theme();
$out = [
  "tablePrefix" => $GLOBALS["table_prefix"],
  "theme" => get_stylesheet(),
  "themeKind" => (method_exists($theme, "is_block_theme") && $theme->is_block_theme()) ? "block" : "classic",
  "permalinks" => get_option("permalink_structure") ?: "plain",
  "activePlugins" => count((array) get_option("active_plugins")),
];
echo json_encode($out);
`

/**
 * Every address this platform can be asked for, or an empty object when nothing could be read.
 * @param {string} label @param {string} platform
 * @returns {Promise<Record<string, unknown>>}
 */
export async function probe(label, platform) {
  // Both probes are PHP, and EmDash has none — so there is no probe to run, not "no container to
  // run it in": its container execs fine, and its own tools answer better than a probe would.
  // Worth stating precisely, because the belief that EmDash has no `.webroot/` travelled through
  // four other files from comments exactly this loose (fixed 20/09).
  const script = platform === 'joomla' ? JOOMLA_PROBE : platform === 'wordpress' ? WORDPRESS_PROBE : null
  if (script === null) return {}
  const out = await inContainer(label, ['php', '-r', script])
  if (out === null) return {}
  try {
    const value = JSON.parse(out.trim())
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

/**
 * @param {string} sitesRoot @param {string} label @param {string} platform
 * @returns {Promise<{ file: string, facts: Record<string, unknown> }>}
 */
export async function collectSiteFacts(sitesRoot, label, platform) {
  const facts = await probe(label, platform)
  const file = path.join(sitesRoot, '.site-facts', `${label}.json`)
  await mkdir(path.dirname(file), { recursive: true })
  // `format` so a reader can refuse a shape it does not know rather than guess at one.
  await writeFile(file, `${JSON.stringify({ format: 1, label, platform, facts }, null, 2)}\n`, 'utf8')
  return { file, facts }
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)

if (invokedDirectly) {
  const [sitesRoot, label, platform] = process.argv.slice(2)
  if (!sitesRoot || !label || !platform) {
    console.error('use: collect-site-facts.mjs <sitesRoot> <label> <platform>')
    process.exit(2)
  }
  const { file, facts } = await collectSiteFacts(sitesRoot, label, platform)
  const names = Object.keys(facts)
  console.log(
    names.length === 0
      ? `collect-site-facts: nothing could be measured on ${label} — ${file} written empty, the agent keeps the prose`
      : `collect-site-facts: ${names.length} addresses for ${label} → ${file}`
  )
  for (const name of names) console.log(`  ${name} = ${JSON.stringify(facts[name])}`)
}
