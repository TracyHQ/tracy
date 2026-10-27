/**
 * The pure half of `dev-fleet.mjs`: the compose file a site runs from, which CMS a site folder
 * holds, and where a Joomla site's write door is. Kept apart from the server so a test can hold it
 * (`scripts/test/dev-fleet-site.test.mjs`); `dev-fleet.mjs` starts listening on import.
 *
 * TWO SHAPES ARE COPIED FROM THE FLEET DELIBERATELY, because the agent's own tools read them: the
 * compose project is named after the label, so the container is `<label>-web-1` — the name
 * `tracy-subprocess-docker` execs into — and the webroot is bind-mounted at `<sitesRoot>/<label>/
 * .webroot`, the path `siteFolder.mjs` gives a site on the fleet. The site folder itself is mounted
 * at `/site/<label>` inside the container for the same reason (containerRoot in that plugin).
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** The platforms this machine can build. EmDash has no local installer yet, and says so by name. */
export const PLATFORMS = ['wordpress', 'joomla']

/**
 * The compose file for one site.
 *
 * WordPress: the images the fleet's fresh-WordPress path uses, plus a `cli` service for the install.
 * Joomla: the image the fleet's fresh-Joomla path uses (`provision/platform/joomla.sh`), the `tr_`
 * prefix the post-up token read expects, and the cowork package on `JOOMLA_EXTENSIONS_URLS` so the
 * official image installs the write door right after Joomla itself — the same way the fleet does
 * it, so the site here takes the same `apply` calls the fleet's site would.
 *
 * @param {string} platform - `wordpress` | `joomla`.
 * @param {string} label - site label, which is also the compose project.
 * @param {number} port - loopback port for the site.
 * @param {string} sitesRoot - where site folders live on this machine (`/site` by default).
 * @param {{ extensions?: string }} extras - Joomla: space-separated `https` zip URLs the installer installs.
 * @returns {string} compose YAML.
 */
export function composeFor(platform, label, port, sitesRoot, extras) {
  const webroot = join(sitesRoot, label, '.webroot')
  const folder = join(sitesRoot, label)
  const mounts = `      - ${webroot}:/var/www/html
      # The site folder at the SAME path the harness names it. tracy-subprocess-docker maps a
      # cwd from host to container by that name (containerRoot, default /site), so without this
      # every agent command lands on a path the container does not have.
      - ${folder}:/site/${label}`

  if (platform === 'wordpress')
    return `name: ${label}
services:
  db:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: tracy-dev
      MARIADB_DATABASE: wp
    volumes:
      - db:/var/lib/mysql

  web:
    image: wordpress:apache
    depends_on: [db]
    ports:
      - "127.0.0.1:${String(port)}:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: root
      WORDPRESS_DB_PASSWORD: tracy-dev
      WORDPRESS_DB_NAME: wp
    volumes:
${mounts}

  cli:
    image: wordpress:cli
    depends_on: [db, web]
    user: "33:33"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: root
      WORDPRESS_DB_PASSWORD: tracy-dev
      WORDPRESS_DB_NAME: wp
    volumes:
      - ${webroot}:/var/www/html
    entrypoint: ["wp"]
    profiles: [tools]

volumes:
  db: {}
`

  if (platform === 'joomla')
    return `name: ${label}
services:
  db:
    image: mariadb:11
    environment:
      MARIADB_ROOT_PASSWORD: tracy-dev
      MARIADB_DATABASE: joomla
    volumes:
      - db:/var/lib/mysql

  web:
    image: joomla:6-apache
    depends_on: [db]
    ports:
      - "127.0.0.1:${String(port)}:80"
    environment:
      JOOMLA_DB_HOST: db
      JOOMLA_DB_USER: root
      JOOMLA_DB_PASSWORD: tracy-dev
      JOOMLA_DB_NAME: joomla
      # Deterministic, so the post-up token read knows which table to ask (same as the fleet).
      JOOMLA_DB_PREFIX: tr_
      JOOMLA_SITE_NAME: ${label}
      JOOMLA_ADMIN_USER: Tracy Agent
      JOOMLA_ADMIN_USERNAME: tracyagent
      JOOMLA_ADMIN_PASSWORD: tracy-dev-password-2026
      JOOMLA_ADMIN_EMAIL: tracy-agent@tracy.ai
      # The write door rides the installer: the image installs these right after Joomla itself.
      JOOMLA_EXTENSIONS_URLS: ${extras.extensions ?? ''}
    volumes:
${mounts}

volumes:
  db: {}
`

  throw new Error(`dev-fleet builds WordPress and Joomla, not ${platform}.`)
}

/**
 * Which CMS a site folder holds, read off the file its installer wrote — the same test
 * `stages.mjs` applies to a lane (`wp-config.php` → WordPress, `configuration.php` → Joomla).
 * @param {string} dir - the site folder.
 * @returns {'wordpress' | 'joomla' | null} null while nothing is installed yet.
 */
export function platformOf(dir) {
  if (existsSync(join(dir, '.webroot', 'wp-config.php'))) return 'wordpress'
  if (existsSync(join(dir, '.webroot', 'configuration.php'))) return 'joomla'
  return null
}

/**
 * The loopback port a site answers on, read back from its own compose file — this process restarts
 * far more often than a site does, so the port cannot live in memory alone.
 * @param {string} yml - the compose file's text.
 * @returns {number | null}
 */
export function portOf(yml) {
  const m = /127\.0\.0\.1:(\d+):80/.exec(yml)
  return m === null ? null : Number(m[1])
}

/**
 * The Joomla write door: the cowork component's one endpoint, which takes `{ token, action, params }`
 * and answers the component's own shape — exactly what the seat registry relays to on the fleet
 * (`sites/route.js` in `apps/tracy-web`), so a build here meets the same answers.
 * @param {number} port - the site's loopback port.
 * @returns {string}
 */
export function componentDoor(port) {
  return `http://127.0.0.1:${String(port)}/index.php?option=com_claudecowork&task=api.exec&format=json`
}

/** A language as Tracy names it — `vi`, `vi-vn` or `pt-br` — and WordPress's spelling of a locale. */
const LANGUAGE_CODE = /^[a-z]{2}(-[a-z]{2})?$/i
const WORDPRESS_LOCALE = /^[a-z]{2,3}(_[A-Za-z0-9]+){0,2}$/

/** The two languages whose variants are two languages; the plugin's `AMBIGUOUS`. */
const VARIANT_LANGUAGES = new Set(['pt', 'zh'])

/**
 * The URL slug of a language code, as the plugin's `slugFor`: `vi-vn` is `vi`; only Portuguese and
 * Chinese keep the full code.
 * @param {string} code
 * @returns {string}
 */
function slugFor(code) {
  const lower = code.toLowerCase()
  const base = lower.slice(0, 2)
  return VARIANT_LANGUAGES.has(base) ? lower : base
}

/**
 * The stand-in for the WordPress plugin's `content.language`: the checks it makes in Node, and the
 * PHP `wp eval` runs for the rest. It copies the Claude Cowork plugin's language fix (claude-cowork
 * `wordpress/cowork/lib/Engine.php`, `content.language` + `newLanguage`) so a local run files
 * languages the way the fleet does:
 *
 *   - the slug is the short code (`vi-vn` → `vi`); only Portuguese and Chinese keep the full code;
 *   - a language already on the site is reused as it is;
 *   - a new one takes the `locale` sent; else a full code's own variant when Polylang knows it;
 *     else the default table; else Polylang's one row for the code; more than one row (`pt`, `zh`)
 *     and the call is refused naming the variants;
 *   - languages created in one call take the switcher places after the existing ones, in order;
 *   - every language is decided before anything is written, so a refusal writes nothing.
 *
 * ⚠ DECLARE THE LANGUAGE FIRST: a freshly activated Polylang carries no languages, and setting one
 * on a post then silently does nothing while the call still answers "done" (measured 08/09). Its
 * name and flag come from Polylang's own table — Polylang refuses a flag it does not ship.
 *
 * The PHP prints `OK`, `NO_POLYLANG`, `LANG_REFUSED:<why>` or `LANG_FAILED:<why>`.
 *
 * @param {Record<string, unknown>} params
 * @returns {{ refusal: string } | { php: string, id: number, slug: string }}
 */
export function wordpressLanguageCall(params) {
  const id = Math.max(0, Math.trunc(Number(params.id ?? 0)) || 0)
  if (id === 0) return { refusal: 'id required' }
  const lang = typeof params.lang === 'string' ? params.lang.trim() : ''
  if (!LANGUAGE_CODE.test(lang)) return { refusal: 'lang must be a language code' }
  const slug = slugFor(lang)
  const locale = typeof params.locale === 'string' ? params.locale.trim() : ''
  if (locale !== '' && !WORDPRESS_LOCALE.test(locale))
    return { refusal: 'locale must be a WordPress locale, e.g. vi, pt_BR, de_DE_formal' }
  /** @type {Record<string, number>} */
  const translations = {}
  // Each code as sent, its slug and its locale: the full code still picks the locale of a new language.
  /** @type {Array<[string, string, string]>} */
  const codes = [[lang.toLowerCase(), slug, locale]]
  const given = params.translations && typeof params.translations === 'object' ? params.translations : {}
  for (const [code, postId] of Object.entries(/** @type {Record<string, unknown>} */ (given))) {
    if (!LANGUAGE_CODE.test(code)) return { refusal: 'translations must be keyed by language code' }
    if (Number(postId) > 0) {
      translations[slugFor(code)] = Math.trunc(Number(postId))
      codes.push([code.toLowerCase(), slugFor(code), ''])
    }
  }
  // Every value below passed one of the patterns above, so the JSON carries no quote PHP could see.
  const input = JSON.stringify({ id, slug, codes, translations })
  const php = `$in = json_decode('${input}', true); $t = (array) $in['translations'];
if (!function_exists('pll_set_post_language')) { echo 'NO_POLYLANG'; return; }
$pll = function_exists('PLL') && PLL() && isset(PLL()->model);
$have = function_exists('pll_languages_list') ? (array) pll_languages_list() : [];
$pre = class_exists('PLL_Settings') && method_exists('PLL_Settings', 'get_predefined_languages') ? (array) PLL_Settings::get_predefined_languages() : [];
$defaults = ['en' => 'en_US', 'fr' => 'fr_FR', 'de' => 'de_DE', 'es' => 'es_ES', 'it' => 'it_IT', 'nl' => 'nl_NL', 'ja' => 'ja', 'ko' => 'ko_KR', 'ru' => 'ru_RU', 'vi' => 'vi'];
$ambiguous = ['pt' => ['pt-br', 'pt-pt'], 'zh' => ['zh-cn', 'zh-tw']];
$adds = [];
foreach ($in['codes'] as [$code, $slug, $loc]) {
  if (!$pll || in_array($slug, $have, true) || isset($adds[$slug])) { continue; }
  $base = substr($code, 0, 2);
  if ($loc === '' && strlen($code) > 2) { $v = $base . '_' . strtoupper(substr($code, 3)); if ($pre === [] || isset($pre[$v])) { $loc = $v; } }
  if ($loc === '') {
    $variants = $ambiguous[$base] ?? [];
    if (isset($defaults[$base])) { $loc = $defaults[$base]; }
    elseif ($variants === []) {
      $rows = []; foreach ($pre as $c => $r) { if (($r['code'] ?? '') === $base) { $rows[] = (string) $c; } }
      if (count($rows) === 1) { $loc = $rows[0]; }
      elseif ($rows === []) { $loc = $base . '_' . strtoupper($base); }
      else { $variants = array_map(function ($c) { return strtolower(str_replace('_', '-', $c)); }, $rows); }
    }
    if ($loc === '') { echo 'LANG_REFUSED:"' . $code . '" names more than one language (' . implode(', ', $variants) . '): ask which one is meant and send the full code'; return; }
  }
  $row = isset($pre[$loc]) && is_array($pre[$loc]) ? $pre[$loc] : [];
  $adds[$slug] = ['name' => isset($row['name']) ? (string) $row['name'] : $slug, 'slug' => $slug, 'locale' => $loc, 'rtl' => 0, 'term_group' => count($have) + count($adds), 'flag' => isset($row['flag']) ? (string) $row['flag'] : ''];
}
foreach ($adds as $a) {
  $m = PLL()->model;
  if (isset($m->languages) && method_exists($m->languages, 'add')) { $done = $m->languages->add($a); }
  elseif (method_exists($m, 'add_language')) { $done = $m->add_language($a); }
  else { echo 'LANG_FAILED:this Polylang has no way to add a language'; return; }
  if (is_wp_error($done)) { echo 'LANG_FAILED:Polylang refused the language ' . $a['slug'] . ': ' . $done->get_error_message(); return; }
}
pll_set_post_language($in['id'], $in['slug']);
if (count($t) > 1 && function_exists('pll_save_post_translations')) { pll_save_post_translations($t); }
echo 'OK';`
  return { php, id, slug }
}
