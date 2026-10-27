/**
 * WHETHER A SITE WEARS A DESIGN SYSTEM THROUGH TRACY'S DESIGN-SYSTEM SLOT — read from the site itself
 * (`packages/design/tracy-ds-slot`, README there).
 *
 * 🔒 WHY FROM THE SITE AND NOT FROM THE DESIGN RECORD (measured 09–10/10/2026 on the three stand sites
 * dskeepem, dskeepwp, dskeepjo). The slot is written by `tracy-ds-slot`'s CLI and by no door that
 * records it: tracy-web's design record answered `{"design":null}`, no `docs/agents/design.json` was
 * written, so the site context said nothing and `tracy_design_check` answered "This site wears no
 * design system". The system survived every modify, but the agent changed the look as if it were the
 * template's own: on EmDash "make the hero button bigger and rounder" became `!rounded-full
 * !px-[34px] !py-[17px]` on a button the system had already made a pill, and the next system (2px
 * corners) never reached it. In Joomla the agent went looking (`docs/agents/look`, `design.json`, a
 * grep for `tracy-ds-slot`) and found nothing, because the slot lives in the database.
 *
 * WHAT EACH WRITER LEAVES, and the one read here for each (all three print the same marker,
 * `/* tracy-ds-slot: <id> …`, into the page):
 * - EmDash: `/app/data/ds-slot.css`, its first line `/* tracy-ds-slot: <id> (<name>) — generated…`
 *   (`emit.mjs`; the theme's `lib/ds-slot.ts` reads it per request and wears nothing without that
 *   header). Read by the container's node, as `look.set` reads `/app/` files.
 * - WordPress: the user global styles `tracy_apply_inspiration()` wrote from a `ds-<source>-<key>`
 *   variation (`wordpress.mjs`), whose `styles.css` starts with the marker; the theme records the
 *   variation in option `tracy_inspiration` and its name in `uploads/tracy/inspirations.json`. Read by
 *   wp-cli with no plugin and no theme code, as `look.set` reads the Additional CSS.
 * - Joomla: a published, assigned `mod_custom` ("Tracy design system", `joomla.mjs`) whose content is
 *   a Google Fonts link and `<style id="tracy-ds-slot">`. Read by the container's PHP from the site's
 *   own database, as `collect-site-facts.mjs` reads its addresses.
 *
 * Each read prints ONE line, `TRACY_DS_SLOT <base64 JSON>`, whatever else the runtime prints: no line
 * is a read that failed (unknown), `{ok:true, css:null}` is a site that wears no slot (known).
 */

/** How the cascade answer names the slot's own sheet on EmDash and Joomla (`look-style.mjs`). */
export const DS_SLOT_SHEET = '<style id="tracy-ds-slot">'

/** Where an EmDash site keeps its slot (the container's `/app/data`, `ds-slot.ts`). */
export const EMDASH_SLOT_FILE = '/app/data/ds-slot.css'

/** The marker every slot writer puts first: the system's id, and on EmDash its name. */
const MARKER = /\/\*\s*tracy-ds-slot:\s*([a-z0-9][a-z0-9:._-]{0,119})(?:\s+\(([^()*\n]{1,80})\))?/i

/** The answer line of every read. */
const LINE = 'TRACY_DS_SLOT '

/** The most slot text one read brings back (an EmDash slot is ~4 KB, a WordPress one ~12 KB). */
export const SLOT_TEXT_MAX = 64 * 1024

/**
 * The id and name of the system a slot's text carries, or null when it carries no marker.
 * @param {unknown} text
 * @returns {{ id: string, name: string | null } | null}
 */
export function slotMarkerOf(text) {
  const m = MARKER.exec(String(text ?? ''))
  if (m === null) return null
  const name = typeof m[2] === 'string' ? m[2].trim() : ''
  return { id: m[1], name: name === '' ? null : name }
}

/**
 * The style variation slug `tracy-ds-slot` gives a system on WordPress — the SAME function as
 * `packages/design/tracy-ds-slot/src/wordpress.mjs` `variationSlug` (a test holds them equal): the
 * theme's option names the variation by it, so a name is only believed for the system it belongs to.
 * @param {string} id
 */
export function wordpressSlotSlug(id) {
  const [source, key = ''] = String(id).split(':')
  return `ds-${source}-${key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 24)}`.replace(/-+$/, '')
}

// ── The reads, one per CMS (pure argv builders; `wornSlotReader` runs them) ─────────────────────

/**
 * 🔒 THE TEMPLATE'S OWN ROLES COME BACK WITH EVERY READ (Akemi, 20/10/2026). Each read below also answers
 * `roles` — the ruler of a site wearing no system, and the fallback a value written on a worn one keeps: every `var(--ds-<role>, <fallback>)` the template's own stylesheets write
 * (each occurrence, so the most frequent fallback wins) and the template's own custom properties a
 * fallback may read through — never a whole stylesheet (a JA WordPress theme carries megabytes of CSS).
 * `templateRolesOf` turns it into the ruler a site wearing nothing is judged by. Null when no file of
 * the template reads a role (a release from before the readiness round, an imported site).
 */
/** At most this many role reads, and separately this many of the template's own custom properties. */
const ROLE_READS_MAX = 5000
const OWN_PROPS_MAX = 3000

/** One role read with its fallback, which may hold two levels of parentheses (`color-mix(…, var(--x))`). */
const ROLE_READ_SRC = String.raw`var\(\s*--ds-[a-z0-9-]+\s*,(?:[^;{}()]|\((?:[^;{}()]|\([^;{}()]*\))*\))+?\)`
/**
 * A rule (or at-rule) for the template's dark side — `@media (prefers-color-scheme: dark)`, `.dark`,
 * `[data-theme="dark"]`, `html.t4-dark` — with its whole block: its role reads are the dark side's values,
 * kept apart so the light (default) look is what a role's value is (measured 20/10/2026: Tracy Business WP
 * writes the dark side's fallbacks more often than the light's, and `--ds-c-bg` came out #101214).
 */
// starting right after a `{`, `}`, `;` or the `"` a theme.json `css` string opens with (or at the start): a
// dark-mode media query, or selectors that are ALL the dark switch on the root (`html[data-theme="dark"]`,
// `.t4-dark …`, `body.is-dark-theme`) — never a `.btn-dark` or `.navbar-dark` (Bootstrap and T4 colour
// variants), never `:root:not(.dark)`, never a list that mixes a dark selector with a light one (reviews,
// 20/10/2026)
/** One selector whose first compound is the dark switch on the root, or any element under it. */
const DARK_SELECTOR = String.raw`(?:html|:root|body)?(?:\.(?:dark|t4-dark|is-dark|is-dark-theme|dark-mode|dark-theme|theme-dark|theme--dark|color-scheme-dark)(?![\w-])|\[data-(?:bs-)?(?:theme|mode|color-mode|color-scheme)=\\?["']?dark\\?["']?\])[^{},;"]*`
const DARK_OPEN_SRC = String.raw`(?<=^|[{};"])(?:\s|\\n)*(?:@media[^{};]*prefers-color-scheme\s*:\s*dark[^{};]*|${DARK_SELECTOR}(?:,(?:\s|\\n)*${DARK_SELECTOR})*)\{`

/** One of the template's own custom properties — never a BEM `.btn--primary:hover`, which follows a name. */
const OWN_PROP_SRC = String.raw`(?<![\w-])--(?!ds-)[a-z0-9_-]+\s*:\s*[^;{}]{1,200}`

/**
 * `$roles([folders])` in PHP: the role reads and custom properties of every `.css` and `theme.json` under
 * them (never a style variation's `styles/*.json`: a variation is not the template's own look), comments
 * stripped, `node_modules` and dot folders never entered, symlinks never followed, and nothing that fails
 * (an unreadable folder, a broken link) can stop the slot read it rides on: it answers null instead.
 */
export const ROLES_PHP =
  '$roles=function($ds){$rs=[];$dc=[];try{foreach($ds as $d){if(!is_string($d)||$d===""||!is_dir($d))continue;' +
  '$it=new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(new RecursiveDirectoryIterator($d,FilesystemIterator::SKIP_DOTS),' +
  'function($f){$n=$f->getFilename();return !($f->isDir()&&($n==="node_modules"||$n[0]==="."));}),' +
  'RecursiveIteratorIterator::LEAVES_ONLY,RecursiveIteratorIterator::CATCH_GET_CHILD);' +
  'foreach($it as $fi){try{if($fi->isLink()||!$fi->isFile())continue;$bn=$fi->getFilename();' +
  `if(!preg_match(${JSON.stringify(String.raw`/\.css$/`)},$bn)&&$bn!=="theme.json")continue;if($fi->getSize()>4194304)continue;` +
  '$t=(string)@file_get_contents($fi->getPathname());}catch(\\Throwable $e){continue;}' +
  'if(strpos($t,"var(--ds-")===false)continue;' +
  `$t=(string)preg_replace(${JSON.stringify(String.raw`#/\*.*?\*/#s`)},"",$t);` +
  // the dark side's blocks, each whole by its braces (a recursive pattern ran out of backtracking on a
  // 30 KB theme.json and answered null, measured 20/10/2026); no match, or a pattern that fails: no split
  `$dk=[];$lt="";$at=0;$uc=0;if(preg_match_all(${JSON.stringify(`/${DARK_OPEN_SRC}/i`)},$t,$mm,PREG_OFFSET_CAPTURE)){foreach($mm[0] as $mx){$st=$mx[1];if($st<$at)continue;` +
  '$i=$st+strlen($mx[0]);$dp=1;$L=strlen($t);while($i<$L&&$dp>0){$c=$t[$i];if($c==="{")$dp++;elseif($c==="}")$dp--;$i++;}' +
  // a block that never closes (a cut file, a brace in a string) is not split; the next ones still are
  'if($dp>0){if(++$uc>5)break;continue;}$lt.=substr($t,$at,$st-$at);$dk[]=substr($t,$st,$i-$st);$at=$i;}}$lt.=substr($t,$at);' +
  `preg_match_all(${JSON.stringify(`/${ROLE_READ_SRC}/i`)},$lt,$m);foreach($m[0] as $x){if(count($rs)<${ROLE_READS_MAX})$rs[]=$x;}` +
  `preg_match_all(${JSON.stringify(`/${ROLE_READ_SRC}/i`)},implode("\\n",$dk),$m);foreach($m[0] as $x){if(count($rs)<${ROLE_READS_MAX})$rs[]="@dark ".$x;}` +
  // the template's own properties of its light side only: a dark block's restate the dark values
  `preg_match_all(${JSON.stringify(`/${OWN_PROP_SRC}/i`)},$lt,$m);foreach($m[0] as $x){if(count($dc)<${OWN_PROPS_MAX})$dc[]=$x;}` +
  `if(count($rs)>=${ROLE_READS_MAX})break 2;}}}catch(\\Throwable $e){}` +
  'return count($rs)===0?null:implode(";\\n",array_merge($rs,$dc)).";";};'

/** `roles(folder)` in node: the same, under one folder. */
export const ROLES_JS =
  `const roles=(d)=>{const rs=[],dc=[];const R=new RegExp(${JSON.stringify(ROLE_READ_SRC)},"gi"),D=new RegExp(${JSON.stringify(OWN_PROP_SRC)},"gi"),K=new RegExp(${JSON.stringify(DARK_OPEN_SRC)},"gi");` +
  // the dark side's blocks, whole (a brace count: no recursion in a JS regex), apart from the rest
  'const split=(t)=>{let light="",dark="",at=0,uc=0,m;K.lastIndex=0;while((m=K.exec(t))!==null){let i=m.index+m[0].length,depth=1;' +
  'while(i<t.length&&depth>0){const c=t[i];if(c==="{")depth++;else if(c==="}")depth--;i++}if(depth>0){if(++uc>5)break;K.lastIndex=m.index+m[0].length;continue}' +
  'light+=t.slice(at,m.index);dark+=t.slice(m.index,i)+"\\n";at=i;K.lastIndex=i}return[light+t.slice(at),dark]};' +
  'const walk=(x,depth)=>{if(depth>12)return;let es=[];try{es=fs.readdirSync(x,{withFileTypes:true})}catch{return}' +
  `for(const e of es){if(rs.length>=${ROLE_READS_MAX})return;if(e.name==="node_modules"||e.name.startsWith("."))continue;const p=path.join(x,e.name);` +
  'if(e.isDirectory()){walk(p,depth+1);continue}' +
  'if(!e.isFile()||!(/\\.css$/.test(e.name)||e.name==="theme.json"))continue;' +
  'let t="";try{t=fs.readFileSync(p,"utf8")}catch{continue}if(!t.includes("var(--ds-"))continue;' +
  't=t.replace(/\\/\\*[\\s\\S]*?\\*\\//g,"");' +
  'const[lt,dk]=split(t);' +
  `for(const m of lt.matchAll(R))if(rs.length<${ROLE_READS_MAX})rs.push(m[0]);` +
  `for(const m of dk.matchAll(R))if(rs.length<${ROLE_READS_MAX})rs.push("@dark "+m[0]);` +
  `for(const m of lt.matchAll(D))if(dc.length<${OWN_PROPS_MAX})dc.push(m[0])}};` +
  'try{walk(d,0)}catch{}return rs.length===0?null:[...rs,...dc].join(";\\n")+";"};'

/** The node script an EmDash container runs: `node -e SCRIPT <file>`. */
export const EMDASH_SLOT_SCRIPT =
  'const fs=require("fs"),path=require("path");const f=process.argv[1];' +
  ROLES_JS +
  `const o=(a)=>console.log(${JSON.stringify(LINE)}+Buffer.from(JSON.stringify(a)).toString("base64"));` +
  // the template's sources sit beside `data/`: `/app/src` for `/app/data/ds-slot.css`
  'const r=roles(path.join(path.dirname(path.dirname(f)),"src"));' +
  `try{if(!fs.existsSync(f)){o({ok:true,css:null,roles:r})}else{o({ok:true,css:fs.readFileSync(f).subarray(0,${SLOT_TEXT_MAX}).toString("utf8"),roles:r})}}` +
  'catch(e){o({ok:false,error:String((e&&e.message)||e).slice(0,200)})}'

/**
 * The PHP `wp eval` runs in a WordPress container: the user global styles WordPress itself would
 * print (`get_user_data_from_wp_global_styles` — the newest post of the active theme), only when
 * their `styles.css` carries the marker; with them the palette and font families the variation
 * set (the slot's colours and fonts are `--wp--preset--*` there) and the variation's name.
 */
export const WORDPRESS_SLOT_PHP =
  `$o=function($a){echo "\\n${LINE}".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};` +
  ROLES_PHP +
  '$p=WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles(wp_get_theme());' +
  '$j=(is_array($p)&&isset($p["post_content"]))?json_decode((string)$p["post_content"],true):null;' +
  '$css=(is_array($j)&&isset($j["styles"]["css"])&&is_string($j["styles"]["css"]))?$j["styles"]["css"]:"";' +
  '$rs=$roles(array_unique([get_stylesheet_directory(),get_template_directory()]));' +
  'if(strpos($css,"tracy-ds-slot:")===false){$o(["ok"=>true,"css"=>null,"roles"=>$rs]);return;}' +
  '$l=$j["settings"]["color"]["palette"]??[];if(is_array($l)&&(isset($l["theme"])||isset($l["custom"]))){$l=array_merge((array)($l["theme"]??[]),(array)($l["custom"]??[]));}' +
  '$pal=[];foreach((array)$l as $c){if(is_array($c)&&isset($c["slug"],$c["color"])){$pal[]=["slug"=>(string)$c["slug"],"color"=>(string)$c["color"]];}}' +
  '$fl=$j["settings"]["typography"]["fontFamilies"]??[];if(is_array($fl)&&(isset($fl["theme"])||isset($fl["custom"]))){$fl=array_merge((array)($fl["theme"]??[]),(array)($fl["custom"]??[]));}' +
  '$ff=[];foreach((array)$fl as $f){if(is_array($f)&&isset($f["slug"],$f["fontFamily"])){$ff[]=["slug"=>(string)$f["slug"],"fontFamily"=>(string)$f["fontFamily"]];}}' +
  '$s=(string)get_option("tracy_inspiration","");$n=null;$u=wp_upload_dir(null,false);' +
  '$i=(is_array($u)&&isset($u["basedir"]))?json_decode((string)@file_get_contents($u["basedir"]."/tracy/inspirations.json"),true):null;' +
  'if($s!==""&&is_array($i)&&isset($i["systems"][$s]["name"])&&is_string($i["systems"][$s]["name"])){$n=$i["systems"][$s]["name"];}' +
  `$o(["ok"=>true,"css"=>substr($css,0,${SLOT_TEXT_MAX}),"palette"=>$pal,"fonts"=>$ff,"variation"=>$s,"name"=>$n,"roles"=>$rs]);`

/**
 * The PHP a Joomla container runs from its webroot (`php -r`): the first published module of the
 * site, placed in a position and assigned to some page, inside its publishing window, whose content
 * carries the marker — the one the page prints. Its title and id say where it lives.
 */
export const JOOMLA_SLOT_PHP =
  `$o=function($a){echo "\\n${LINE}".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};` +
  ROLES_PHP +
  'if(!is_file("configuration.php")){$o(["ok"=>false,"error"=>"no configuration.php"]);exit(0);}' +
  'require "configuration.php";$c=new JConfig();' +
  '$m=@new mysqli($c->host,$c->user,$c->password,$c->db,(int)($c->dbport?:3306));' +
  'if($m->connect_errno){$o(["ok"=>false,"error"=>"the database did not answer"]);exit(0);}' +
  '$p=$m->real_escape_string($c->dbprefix);$t=gmdate("Y-m-d H:i:s");' +
  "$r=$m->query(\"SELECT m.id,m.title,m.content FROM {$p}modules m WHERE m.module='mod_custom' AND m.client_id=0 AND m.published=1 AND m.position<>'' AND m.content LIKE '%tracy-ds-slot:%' AND (m.publish_up IS NULL OR m.publish_up<='$t') AND (m.publish_down IS NULL OR m.publish_down>'$t') AND EXISTS(SELECT 1 FROM {$p}modules_menu mm WHERE mm.moduleid=m.id) ORDER BY m.ordering,m.id LIMIT 1\");" +
  'if(!$r){$o(["ok"=>false,"error"=>"the module query failed"]);exit(0);}' +
  // the default site style's template, and its parent when it is a child template (Joomla 4.1+ `parent`)
  '$s=$m->query("SELECT * FROM {$p}template_styles WHERE client_id=0 AND home=\'1\' LIMIT 1");$y=$s?$s->fetch_assoc():null;$tf=[];' +
  'foreach(["template","parent"] as $k){$v=is_array($y)?preg_replace("/[^A-Za-z0-9_.-]/","",(string)($y[$k]??"")):"";if($v!==""){$tf[]="templates/".$v;$tf[]="media/templates/site/".$v;}}' +
  '$rs=count($tf)===0?null:$roles($tf);' +
  '$x=$r->fetch_assoc();if(!$x){$o(["ok"=>true,"css"=>null,"roles"=>$rs]);exit(0);}' +
  `$o(["ok"=>true,"css"=>substr((string)$x["content"],0,${SLOT_TEXT_MAX}),"module"=>["id"=>(int)$x["id"],"title"=>(string)$x["title"]],"roles"=>$rs]);`

/** A site web container's name, the only kind a read may enter. */
const WEB_CONTAINER = /^[a-z0-9][a-z0-9-]*-web-1$/

/**
 * The docker sub-argv that reads the slot of a site on `platform`, or null for a platform with no slot.
 * Every read runs as www-data, the non-credential user: it reads a public look, never a secret
 * beyond what the site itself reads to render it (Joomla's `configuration.php`).
 * @param {string} platform
 * @param {string} container
 * @returns {string[] | null}
 */
export function slotReadArgv(platform, container) {
  if (!WEB_CONTAINER.test(String(container))) throw new TypeError('slotReadArgv: not a site web container')
  if (platform === 'emdash')
    return ['exec', '-u', 'www-data', container, 'node', '-e', EMDASH_SLOT_SCRIPT, EMDASH_SLOT_FILE]
  if (platform === 'wordpress')
    return [
      'exec',
      '-u',
      'www-data',
      container,
      'wp',
      '--path=/var/www/html',
      '--skip-plugins',
      '--skip-themes',
      '--no-color',
      'eval',
      WORDPRESS_SLOT_PHP
    ]
  if (platform === 'joomla')
    return ['exec', '-u', 'www-data', '-w', '/var/www/html', container, 'php', '-r', JOOMLA_SLOT_PHP]
  return null
}

// ── What a read says ────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, name: string | null, platform: string, where: string, vars: string[],
 *   tokens: Record<string, string>, values?: Record<string, string> }} WornSlot
 * `where`: where the slot lives on this site, for the agent and the customer. `vars`: the custom
 * properties the slot sets, in its order (names only, for the context). `tokens`: the slot's colours
 * and font stacks as resolved values, keyed the way `paletteOf` reads them (fonts under `--font…`).
 */

/**
 * @typedef {{ vars: string[], tokens: Record<string, string>, values: Record<string, string>, also?: [string, string][] }} TemplateRoles
 * The roles a template's own stylesheets read (`vars`) and the value each falls back to: as written
 * (`values`, a radius or a face as the template spells it) and resolved as a slot's are (`tokens`,
 * colours and font stacks): the ruler of a site that wears no system.
 */

/**
 * What one read's output says: the slot the site wears, `null` when it wears none, `undefined` when
 * the read did not answer (no line, a line that does not parse, `ok:false`).
 * @param {string} platform
 * @param {string} stdout
 * @returns {WornSlot | null | undefined}
 */
export function parseSlotRead(platform, stdout) {
  const a = answerOf(stdout)
  if (a === undefined) return undefined
  if (typeof a.css !== 'string') return null
  return wornSlotOf(platform, a)
}

/**
 * The roles the site's template reads and its own value for each, from the same read (`roles`,
 * `templateRolesOf`) — what a site wearing NO system shows, and the fallback a value written on a worn
 * site keeps: null when its template reads none, `undefined` when the read did not answer.
 * @param {string} stdout
 * @returns {TemplateRoles | null | undefined}
 */
export function parseRolesRead(stdout) {
  const a = answerOf(stdout)
  if (a === undefined) return undefined
  return typeof a.roles === 'string' ? templateRolesOf(a.roles) : null
}

/**
 * The JSON of a read's one line, or undefined when it did not answer.
 * @param {string} stdout
 * @returns {any}
 */
function answerOf(stdout) {
  const line = String(stdout ?? '')
    .split('\n')
    .find((l) => l.startsWith(LINE))
  if (line === undefined) return undefined
  try {
    const a = JSON.parse(Buffer.from(line.slice(LINE.length).trim(), 'base64').toString('utf8'))
    return a !== null && typeof a === 'object' && a.ok === true ? a : undefined
  } catch {
    return undefined
  }
}

/**
 * The worn slot one successful read describes, or null when its text is not a slot the page wears.
 * @param {string} platform
 * @param {{ css: string, palette?: unknown, fonts?: unknown, variation?: unknown, name?: unknown,
 *   module?: { id?: unknown, title?: unknown } }} read
 * @returns {WornSlot | null}
 */
export function wornSlotOf(platform, read) {
  const text = read.css
  if (platform === 'emdash') {
    // The theme wears the file only with its generated header first, and never one carrying `</style`
    // (`ds-slot.ts`): a file it ignores is not a system the site wears.
    if (!text.startsWith('/* tracy-ds-slot: ') || /<\/style/i.test(text)) return null
    const marker = slotMarkerOf(text)
    if (marker === null) return null
    const decls = declarationsOf(text)
    return {
      ...marker,
      platform,
      where: '`/app/data/ds-slot.css`, read on every request (never edit it)',
      vars: [...decls.keys()],
      tokens: resolvedTokens(decls),
      values: Object.fromEntries(decls)
    }
  }
  if (platform === 'wordpress') {
    const marker = slotMarkerOf(text)
    if (marker === null) return null
    const variation = typeof read.variation === 'string' ? read.variation : ''
    const named =
      variation === wordpressSlotSlug(marker.id) && typeof read.name === 'string' ? read.name : null
    /** @type {Map<string, string>} */
    const decls = new Map()
    for (const c of Array.isArray(read.palette) ? read.palette : [])
      if (c && typeof c.slug === 'string' && typeof c.color === 'string')
        decls.set(`--wp--preset--color--${c.slug}`, c.color)
    for (const f of Array.isArray(read.fonts) ? read.fonts : [])
      if (f && typeof f.slug === 'string' && typeof f.fontFamily === 'string')
        decls.set(`--wp--preset--font-family--${f.slug}`, f.fontFamily)
    for (const [name, value] of declarationsOf(text)) if (!decls.has(name)) decls.set(name, value)
    return {
      id: marker.id,
      name: marker.name ?? named,
      platform,
      where: `the global styles, style variation \`${variation || wordpressSlotSlug(marker.id)}\` (never edit them: they replace the theme's own CSS)`,
      vars: [...decls.keys()],
      tokens: resolvedTokens(decls),
      values: Object.fromEntries(decls)
    }
  }
  if (platform === 'joomla') {
    const style = /<style id="tracy-ds-slot">([\s\S]*?)<\/style>/i.exec(text)
    const marker = style === null ? null : slotMarkerOf(style[1])
    if (style === null || marker === null) return null
    const id = Number(read.module?.id)
    const title = typeof read.module?.title === 'string' ? read.module.title.slice(0, 60) : ''
    const decls = declarationsOf(style[1])
    return {
      ...marker,
      platform,
      where: `module ${Number.isInteger(id) ? id : '?'}${title ? ` "${title}"` : ''} (a \`<style id="tracy-ds-slot">\` on every page; never edit it)`,
      vars: [...decls.keys()],
      tokens: resolvedTokens(decls),
      values: Object.fromEntries(decls)
    }
  }
  return null
}

/**
 * Every custom property a stylesheet declares, first declaration wins (the slot's `:root` block comes
 * first; a later one is a dark or narrow variant of the same name).
 * @param {string} css
 * @returns {Map<string, string>}
 */
export function declarationsOf(css) {
  /** @type {Map<string, string>} */
  const out = new Map()
  const text = String(css).replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of text.matchAll(/(--[a-z0-9_-]+)\s*:\s*([^;{}]+?)\s*(?:!important\s*)?(?=[;}])/gi))
    if (!out.has(m[1])) out.set(m[1], m[2].trim())
  return out
}

// ── The slot's values, for the design check ─────────────────────────────────────────────────────

/** A font stack, not a weight or a size: the names `paletteOf` reads as fonts. */
const FONT_NAME = /^--(?:ds-)?font-(?!weight|size|feature|variation)|^--wp--preset--font-family--/

/**
 * The slot's colours and font stacks as values the design check compares by: `var()` resolved
 * within the slot, `color-mix(in srgb, …)` mixed, anything else left out. Fonts are keyed under
 * `--font…`, which is how `paletteOf` tells a font from a colour.
 * @param {Map<string, string>} decls
 * @returns {Record<string, string>}
 */
export function resolvedTokens(decls) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const [name, value] of decls) {
    if (FONT_NAME.test(name)) {
      const stack = resolveVar(value, decls, 0)
      if (stack !== null && /[a-z]/i.test(stack) && !/var\(|\(/.test(stack))
        out[name.startsWith('--font') ? name : `--font-${name.slice(2)}`] = stack
      continue
    }
    const hex = colourOf(value, decls, 0)
    if (hex !== null) out[name] = hex
  }
  return out
}

/** @param {string} value @param {Map<string, string>} decls @param {number} depth @returns {string | null} */
function resolveVar(value, decls, depth) {
  const v = String(value).trim()
  const m = /^var\(\s*(--[a-z0-9_-]+)\s*(?:,\s*([\s\S]+))?\)$/i.exec(v)
  if (m === null) return v
  if (depth > 6) return null
  const own = decls.get(m[1])
  if (own !== undefined) return resolveVar(own, decls, depth + 1)
  return m[2] === undefined ? null : resolveVar(m[2], decls, depth + 1)
}

/**
 * One colour value as `#rrggbb`, or null: hex, `rgb()`, `var()` within the slot, and
 * `color-mix(in srgb, A p%, B)` — how the slot derives its tints and lines.
 * @param {string} value @param {Map<string, string>} decls @param {number} depth @returns {string | null}
 */
function colourOf(value, decls, depth) {
  if (depth > 6) return null
  const v = resolveVar(value, decls, depth)
  if (v === null) return null
  const mix = /^color-mix\(\s*in\s+srgb\s*,([\s\S]+)\)$/i.exec(v)
  if (mix !== null) {
    const parts = splitTop(mix[1])
    if (parts.length !== 2) return null
    const [a, b] = parts.map((p) => {
      const pm = /^([\s\S]*?)\s+(\d+(?:\.\d+)?)%$/.exec(p.trim())
      return pm === null ? { c: p.trim(), w: null } : { c: pm[1], w: Number(pm[2]) / 100 }
    })
    const wa = a.w ?? (b.w === null ? 0.5 : 1 - b.w)
    const wb = b.w ?? 1 - wa
    if (a.c === 'transparent' || b.c === 'transparent') return null
    const ca = rgbOf(colourOf(a.c, decls, depth + 1))
    const cb = rgbOf(colourOf(b.c, decls, depth + 1))
    if (ca === null || cb === null || wa + wb <= 0) return null
    const k = (/** @type {number} */ x, /** @type {number} */ y) => Math.round((x * wa + y * wb) / (wa + wb))
    return hexOf(k(ca[0], cb[0]), k(ca[1], cb[1]), k(ca[2], cb[2]))
  }
  const rgb = rgbOf(v)
  return rgb === null ? null : hexOf(...rgb)
}

/** Split at commas outside parentheses. @param {string} s */
function splitTop(s) {
  const out = []
  let depth = 0
  let at = 0
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1
    else if (s[i] === ')') depth -= 1
    else if (s[i] === ',' && depth === 0) {
      out.push(s.slice(at, i))
      at = i + 1
    }
  }
  out.push(s.slice(at))
  return out
}

/** An opaque `#rgb`/`#rrggbb`/`rgb()` as channels, or null. @param {string | null} v @returns {[number, number, number] | null} */
function rgbOf(v) {
  if (v === null) return null
  const s = v.trim().toLowerCase()
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s)
  if (m !== null) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
    return /** @type {[number, number, number]} */ (
      [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16))
    )
  }
  m = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/.exec(s)
  return m === null ? null : /** @type {[number, number, number]} */ ([1, 2, 3].map((i) => Number(m[i])))
}

/** @param {number} r @param {number} g @param {number} b */
const hexOf = (r, g, b) =>
  `#${[r, g, b].map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')).join('')}`

// ── A role read the agent writes: its fallback (review of #1513, 21/10/2026) ─────────────────────

/**
 * What a replacement says where the template's own value for a role is not known (a template that does
 * not read it, a read that did not answer): the agent is told so, never handed a value that was invented
 * or copied off the worn system.
 */
export const UNKNOWN_TEMPLATE_VALUE = "<the template's value>"

/**
 * A role's value in a ruler (a worn slot or the template's roles): a face as written (its quotes and
 * stack), anything else as resolved (a colour as `#rrggbb`), else as written; null when it sets none.
 * @param {{ tokens?: Record<string, string>, values?: Record<string, string> } | null | undefined} ruler
 * @param {string} role
 * @returns {string | null}
 */
export function roleValueOf(ruler, role) {
  if (!ruler) return null
  const tokens = ruler.tokens ?? {}
  const values = ruler.values ?? {}
  const resolved = tokens[role] ?? tokens[`--font-${role.slice(2)}`]
  const written = values[role]
  return (role.startsWith('--ds-font-') ? (written ?? resolved) : (resolved ?? written)) ?? null
}

/**
 * Whether two values of one role are the same value: colours by their channels, anything else by its
 * text with case, spacing and quote style set aside.
 * @param {string} a
 * @param {string} b
 */
export function sameRoleValue(a, b) {
  const ca = rgbOf(colourOf(a, new Map(), 0))
  const cb = rgbOf(colourOf(b, new Map(), 0))
  if (ca !== null && cb !== null) return ca.every((c, i) => c === cb[i])
  const norm = (/** @type {string} */ s) =>
    String(s)
      .trim()
      .toLowerCase()
      .replace(/'/g, '"')
      .replace(/\s*,\s*/g, ',')
      .replace(/\s+/g, ' ')
  return norm(a) === norm(b)
}

/**
 * Every `var(--ds-<role>[, <fallback>])` in a text, by its balanced parentheses: where it starts and
 * ends, the role, and its fallback (null: none, or an empty one). A read whose parentheses do not close
 * in the text is left out: it is not judged.
 * @param {string} text
 * @returns {{ index: number, end: number, role: string, fallback: string | null }[]}
 */
export function roleReadsIn(text) {
  /** @type {{ index: number, end: number, role: string, fallback: string | null }[]} */
  const out = []
  for (const m of String(text).matchAll(/var\(\s*(--ds-[a-z0-9-]+)\s*/gi)) {
    const index = m.index ?? 0
    let depth = 1
    let comma = -1
    let end = -1
    for (let i = index + m[0].length; i < text.length; i += 1) {
      const c = text[i]
      if (c === '(') depth += 1
      else if (c === ')') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      } else if (c === ',' && depth === 1 && comma < 0) comma = i
    }
    if (end < 0) continue
    const fallback = comma < 0 ? '' : text.slice(comma + 1, end).trim()
    out.push({ index, end: end + 1, role: m[1].toLowerCase(), fallback: fallback === '' ? null : fallback })
  }
  return out
}

/**
 * 🔒 A ROLE READ IS JUDGED TOO, NOT ONLY A LITERAL (review of #1513, 21/10/2026). Written through a role,
 * a value passed every check, whatever its fallback: `var(--ds-c-accent)` with none paints nothing (the
 * colour unset, the corner square) wherever no system sets the role — on a site wearing none, and the
 * moment a worn one is taken off; `var(--ds-c-accent, <the worn system's colour>)` copied off the page
 * keeps that system's look after it is taken off, the template never coming back. Each such read is
 * named with the TEMPLATE's own value as its fallback, or `UNKNOWN_TEMPLATE_VALUE` when that is not
 * known. A fallback of the agent's own on a site wearing nothing is its look today, and stands.
 * @param {string} text - one declaration's value, or one class (`tailwind`: `_` is a space there).
 * @param {{ ruler: { tokens?: Record<string, string>, values?: Record<string, string> },
 *   template?: { tokens?: Record<string, string>, values?: Record<string, string> } | null,
 *   worn: boolean, tailwind?: boolean }} by - `ruler`: the worn slot, or (wearing none) the template's
 *   roles; `template`: the template's roles beside a worn slot.
 * @returns {{ use: string, why: string } | null} - the text with each such read rewritten, and why.
 */
export function judgeRoleReads(text, { ruler, template = null, worn, tailwind = false }) {
  // a Tailwind class spells a space `_`: read as CSS, rewritten in the class's own spelling
  const css = tailwind ? text.replaceAll('_', ' ') : text
  /** @type {{ index: number, end: number, fixed: string }[]} */
  const edits = []
  /** @type {string[]} */
  const said = []
  let unknown = false
  for (const read of roleReadsIn(css)) {
    // a read inside one already rewritten goes with it
    if (edits.some((e) => read.index >= e.index && read.index < e.end)) continue
    const own = roleValueOf(worn ? template : ruler, read.role)
    let why = null
    if (read.fallback === null)
      why = `\`var(${read.role})\` has no fallback: it paints nothing wherever no design system sets it${worn ? ', so taking this one off leaves it empty' : ', which is this site now'}`
    else if (worn && own !== null) {
      const wornValue = roleValueOf(ruler, read.role)
      if (wornValue !== null && sameRoleValue(read.fallback, wornValue) && !sameRoleValue(read.fallback, own))
        why = `the fallback of ${read.role} is the worn system's value, not the template's: taking the system off would keep the system's look`
    }
    if (why === null) continue
    if (own === null) unknown = true
    const value = own === null ? UNKNOWN_TEMPLATE_VALUE : tailwind ? own.replaceAll(' ', '_') : own
    edits.push({
      index: read.index,
      end: read.end,
      fixed: `var(${read.role}${tailwind ? ',' : ', '}${value})`
    })
    said.push(why)
  }
  if (edits.length === 0) return null
  let use = text
  for (const e of [...edits].sort((a, b) => b.index - a.index))
    use = `${use.slice(0, e.index)}${e.fixed}${use.slice(e.end)}`
  return {
    use,
    why:
      said.join('; ') +
      (unknown
        ? `; the template's own value for it is not known here: take it from the template's stylesheet (grep "var(--ds-")`
        : '')
  }
}

// ── page.look: a literal that pins one of the slot's values ─────────────────────────────────────

/**
 * The slot's colour variable nearest a colour (`#rgb`, `#rrggbb`, `rgb()`), or null when the slot sets
 * none — for `page.look`'s pin notes here and the EmDash rebuild's (`slot-pins.mjs`).
 * @param {string} hex
 * @param {Record<string, string>} tokens
 */
export function nearestSlotColour(hex, tokens) {
  const want = rgbOf(hex)
  if (want === null) return null
  let best = null
  let gap = Number.POSITIVE_INFINITY
  for (const [name, value] of Object.entries(tokens)) {
    if (!name.startsWith('--ds-c-')) continue
    const have = rgbOf(value)
    if (have === null) continue
    const d = Math.max(...have.map((c, i) => Math.abs(c - want[i])))
    if (d < gap) {
      gap = d
      best = name
    }
  }
  return best
}

// ── A site wearing NO system: the roles its template reads (Akemi, 20/10/2026) ──────────────────

/** One `var(--ds-<role>, <fallback>)` of a template stylesheet; the fallback may hold one `var()` of its own. */
const ROLE_READ = /var\(\s*(--ds-[a-z0-9-]+)\s*,\s*((?:[^;{}()]|\((?:[^;{}()]|\([^;{}()]*\))*\))+?)\s*\)/gi

/**
 * The design-system roles a template's own stylesheets read and the value each falls back to — what a
 * site wearing NO system shows for that role (every Tracy template reads `var(--ds-c-bg, #faf7f2)`, VARS-1,
 * and nothing sets `--ds-*` until a system is worn). Shaped as a worn slot is (`vars`, `tokens`), so the
 * same pin checks judge a site wearing nothing: a literal written for a role pins the template's value,
 * and the system applied later never reaches it.
 *
 * A role read with several fallbacks (a light and a dark band) keeps the one the stylesheet writes most
 * often, the first on a tie; a fallback through the template's own variable (`var(--k-primary)`) is
 * resolved within the same text. Null when the text reads no role (a template from before the readiness
 * round, an imported site): then nothing is judged.
 * @param {string} css - the template's stylesheets, as one text (or the role reads a slot read sent back).
 * @returns {TemplateRoles | null}
 */
export function templateRolesOf(css) {
  const raw = String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '')
  // a slot read sends the dark side's reads marked `@dark `; a stylesheet given whole is split here, the same way
  const marked = raw.includes('@dark var(')
  const [light, dark] = marked
    ? [
        raw.replace(/@dark var\([^;]*;?/g, ''),
        [...raw.matchAll(/@dark (var\([^;]*)/g)].map((m) => m[1]).join(';\n')
      ]
    : splitDark(raw)
  const count = (/** @type {string} */ text) => {
    /** @type {Map<string, Map<string, number>>} */
    const seen = new Map()
    for (const m of text.matchAll(ROLE_READ)) {
      const counts = seen.get(m[1]) ?? new Map()
      // a theme.json value spells its quotes escaped (`\"Inter\"`): the same value as the stylesheet's
      const value = m[2].trim().replace(/\\"/g, '"')
      counts.set(value, (counts.get(value) ?? 0) + 1)
      seen.set(m[1], counts)
    }
    return seen
  }
  const most = (/** @type {Map<string, number>} */ counts) => {
    let best = ''
    let n = 0
    for (const [value, k] of counts)
      if (k > n) {
        best = value
        n = k
      }
    return best
  }
  const lightSeen = count(light)
  const darkSeen = count(dark)
  if (lightSeen.size === 0 && darkSeen.size === 0) return null
  // the template's own declarations resolve a fallback written through them; a `--ds-*` one never does
  const own = [...declarationsOf(light)].filter(([name]) => !name.startsWith('--ds-'))
  const decls = new Map(own)
  /** @type {Record<string, string>} */
  const values = {}
  // the light (default) side is a role's value; a role read only on the dark side takes the dark value
  for (const role of new Set([...lightSeen.keys(), ...darkSeen.keys()])) {
    const value = most(lightSeen.get(role) ?? darkSeen.get(role) ?? new Map())
    decls.set(role, value)
    values[role] = value
  }
  const tokens = Object.fromEntries(
    Object.entries(resolvedTokens(decls)).filter(
      ([name]) => name.startsWith('--ds-') || name.startsWith('--font-ds-')
    )
  )
  // every other value a role takes on the dark side, a colour a literal may also be (`nearestRoles`)
  /** @type {[string, string][]} */
  const also = []
  for (const [role, counts] of darkSeen)
    for (const value of counts.keys()) {
      const hex = resolvedTokens(new Map([...own, [role, value]]))[role]
      if (typeof hex === 'string' && hex !== tokens[role]) also.push([role, hex])
    }
  return { vars: [...new Set([...lightSeen.keys(), ...darkSeen.keys()])], tokens, values, also }
}

/**
 * A stylesheet's text apart from its dark side's blocks, and those blocks (`DARK_OPEN_SRC`, each block whole
 * by its braces), as the in-container reads split it.
 * @param {string} text
 * @returns {[string, string]}
 */
export function splitDark(text) {
  const open = new RegExp(DARK_OPEN_SRC, 'gi')
  let light = ''
  let dark = ''
  let at = 0
  let unclosed = 0
  /** @type {RegExpExecArray | null} */
  let m
  while ((m = open.exec(text)) !== null) {
    let i = m.index + m[0].length
    let depth = 1
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1
      else if (text[i] === '}') depth -= 1
      i += 1
    }
    // a block that never closes is not split; the next ones still are — up to five such, then the rest of
    // the text is left as it is (each one counts braces to the end: many would be quadratic)
    if (depth > 0) {
      unclosed += 1
      if (unclosed > 5) break
      open.lastIndex = m.index + m[0].length
      continue
    }
    light += text.slice(at, m.index)
    dark += `${text.slice(m.index, i)}\n`
    at = i
    open.lastIndex = i
  }
  return [light + text.slice(at), dark]
}

/** The colour roles a property paints with, so a literal is named by what it paints before how near it is. */
const ROLES_BY_PAINT = Object.freeze({
  bg: /^--ds-c-(?:bg|surface(?:-warm)?|ink|accent(?:-hover|-active|-band)?|[a-z]+-bg|success|warn|danger|info)$/,
  // the accent is the brand's one colour, painted as text and lines as often as as a ground
  text: /^--ds-c-(?:fg(?:-2)?|heading|muted|meta|on-[a-z-]+|accent(?:-hover)?|accent-(?:text|on)(?:-hover)?|accent-on-ink|[a-z]+-text|disabled-fg)$/,
  border: /^--ds-c-(?:border(?:-soft)?|focus-ring|accent)$/
})

/**
 * How far (largest channel difference, 0–255) a literal may sit from a role's value and still be that role
 * — the design check's own "near" band (`BANDS`, build-core `design-check.mjs`). Farther is a colour of no
 * role (a sale badge's red, a value the customer named): it is not given one.
 */
export const ROLE_NEAR = 48

/**
 * The colour roles a literal is: every role whose value it IS (the same colour, whatever it paints, so an
 * accent written as text stays the accent); else the nearest within `ROLE_NEAR` among the roles of what it
 * paints (`bg`, `text`, `border`) — among all only when none paints that; else none. Two roles at the same distance (`fg` and
 * `heading`, both #1d1d1f) are both named — which one the element plays is the template's, never a guess.
 * @param {string} hex
 * @param {Record<string, string>} tokens
 * @param {'bg' | 'text' | 'border' | null} paint - null: not known (a custom property named for no paint).
 * @param {[string, string][]} [also] - other values a role takes (the template's dark side, `templateRolesOf`).
 * @returns {string[]}
 */
export function nearestRoles(hex, tokens, paint, also = []) {
  const want = rgbOf(hex)
  if (want === null) return []
  const gapOf = (/** @type {[string, string][]} */ entries) => {
    /** @type {Map<string, number>} */
    const byRole = new Map()
    for (const [name, value] of entries) {
      if (!name.startsWith('--ds-c-')) continue
      const have = rgbOf(value)
      if (have === null) continue
      const d = Math.max(...have.map((c, i) => Math.abs(c - want[i])))
      byRole.set(name, Math.min(byRole.get(name) ?? Number.POSITIVE_INFINITY, d))
    }
    return [...byRole].map(([name, d]) => ({ name, d }))
  }
  const closest = (/** @type {{ name: string, d: number }[]} */ set) => {
    const gap = Math.min(...set.map((r) => r.d))
    return set.filter((r) => r.d === gap).map((r) => r.name)
  }
  const paints = (/** @type {{ name: string, d: number }[]} */ set) =>
    paint === null ? set : set.filter((r) => ROLES_BY_PAINT[paint].test(r.name))
  const light = gapOf(Object.entries(tokens))
  // 🔒 THE LIGHT SIDE FIRST, THE DARK SIDE NEVER ACROSS PAINTS (reviews, 20/10/2026): a dark ground #111111
  // is no text ink, and a light band's #eeeeee heading is its on-ink role, not the dark side's text — so a
  // light exact, then a light near match of the paint, before any dark value of the same paint; with the
  // paint not known (a custom property), the dark side is not read at all
  const exact = light.filter((r) => r.d <= 2)
  if (exact.length > 0) {
    const painted = paints(exact)
    return closest(painted.length > 0 ? painted : exact)
  }
  // near, a role of what it paints only: a black panel is no text ink; across paints only when the system
  // or template names no role for this paint at all
  const own = paints(light)
  const near = (own.length > 0 ? own : light).filter((r) => r.d <= ROLE_NEAR)
  if (near.length > 0) return closest(near)
  if (paint === null) return []
  const dark = paints(gapOf(also)).filter((r) => r.d <= ROLE_NEAR)
  return dark.length > 0 ? closest(dark) : []
}

/**
 * `page.look {style}` on a site wearing a design-system slot: each row whose winning declaration is a
 * LITERAL for a value the slot sets a variable for — a corner radius, a button's padding, a colour, a
 * heading's size — gets a `pin` naming that variable and the `var()` to write, the literal kept as its
 * fallback.
 *
 * 🔒 WHY ON THE READING (stand, images from 8323b61f7, 10/10/2026): the hero button's `border-radius` row
 * read `border-radius: 2147483647px !important · .\!rounded-full`, a plain fact, and the agent edited the
 * same class list and left it. Named as a pin over `--ds-btn-radius`, the reading itself says why it
 * stops the next system. A row set through a variable, or one the slot has no variable for, is left as
 * it is.
 *
 * A site wearing NO system is read the same way against the roles its template's own stylesheets read
 * (`over: 'template'`, `templateRolesOf`; Akemi, 20/10/2026): a literal there matches the template now and
 * keeps its value under the first system the customer applies.
 * @param {Record<string, any>} answer - `styleAnswer`'s answer.
 * @param {{ vars: string[], tokens: Record<string, string> }} slot
 * @param {'slot' | 'template'} [whose] - whose values `slot` holds: the worn slot's, or the template's roles.
 * @returns {Record<string, any>} the same answer, rows annotated.
 */
export function slotPinNotes(answer, slot, whose = 'slot') {
  if (!answer || answer.ok !== true || !answer.style || typeof answer.style !== 'object' || !slot)
    return answer
  const vars = new Set(Array.isArray(slot.vars) ? slot.vars : [])
  const el = String(answer.el ?? '')
  const button = /^<button\b|[.<]btn\b|\bbtn-/i.test(el)
  const heading = /^<h1\b/i.test(el)
    ? '--ds-size-display'
    : /^<h2\b/i.test(el)
      ? '--ds-size-heading'
      : /^<h3\b/i.test(el)
        ? '--ds-size-card'
        : null
  const pick = (/** @type {string[]} */ names) => names.find((name) => vars.has(name)) ?? null
  let pins = 0
  for (const [prop, row] of Object.entries(answer.style)) {
    if (!row || typeof row !== 'object') continue
    const set = typeof row.set === 'string' ? row.set : ''
    // set through a variable, or read through a token chain: it already follows the system
    if (set === '' || /var\(/.test(set) || Array.isArray(row.tokens)) continue
    const literal = set
      .replace(/^[^:]*:\s*/, '')
      .replace(/\s*!important\s*$/i, '')
      .trim()
    /** @type {string | null} */
    let use = null
    /** @type {string | null} */
    let over = null
    if (/radius/.test(prop)) {
      over = pick(button ? ['--ds-btn-radius', '--radius-pill'] : ['--ds-card-radius', '--radius-md'])
      if (over !== null) use = `var(${over}, ${literal})`
    } else if (prop.startsWith('padding') && button) {
      const y = vars.has('--ds-btn-pad-y')
      const x = vars.has('--ds-btn-pad-x')
      if (/top|bottom|block/.test(prop) && y)
        [over, use] = ['--ds-btn-pad-y', `var(--ds-btn-pad-y, ${literal})`]
      else if (/left|right|inline/.test(prop) && x)
        [over, use] = ['--ds-btn-pad-x', `var(--ds-btn-pad-x, ${literal})`]
      else if (prop === 'padding' && x && y) {
        const [py, px = py] = literal.split(/\s+/)
        over = '--ds-btn-pad-y and --ds-btn-pad-x'
        use = `var(--ds-btn-pad-y, ${py}) var(--ds-btn-pad-x, ${px})`
      }
    } else if (prop.endsWith('color') && typeof row.hex === 'string') {
      if (whose === 'template') {
        // two roles sharing a value are both named: which one the element plays is the template's
        const paint = /background/.test(prop) ? 'bg' : /border|outline/.test(prop) ? 'border' : 'text'
        const roles = nearestRoles(row.hex, slot.tokens ?? {}, paint, /** @type {any} */ (slot).also ?? [])
        if (roles.length > 0) {
          over = roles.join(' or ')
          use = roles.map((r) => `var(${r}, ${literal})`).join(' or ')
        }
      } else {
        over = nearestSlotColour(row.hex, slot.tokens ?? {})
        if (over !== null) use = `var(${over}, ${literal})`
      }
    } else if (prop === 'font-size' && heading !== null && vars.has(heading)) {
      over = heading
      use = `var(${heading}, ${literal})`
    }
    if (over === null || use === null) continue
    row.pin =
      whose === 'template'
        ? `a literal over the template's role ${over}: a design system applied later will not reach it — write ${use}`
        : `a literal over the slot's ${over}: the next system will not reach it — write ${use}`
    pins += 1
  }
  if (pins > 0)
    answer.next =
      `${answer.next ?? ''} A row with \`pin\` is a literal over ${whose === 'template' ? "one of the template's design-system roles" : "the design system's variable"}: write the var() it names (the literal stays as the fallback, so it looks the same today), never the literal again.`.trim()
  return answer
}

// ── The reader the host keeps ───────────────────────────────────────────────────────────────────

/** How long a read is believed before the next turn reads again. */
export const SLOT_FRESH_MS = 60_000

/** How long one read may run inside the container (wp-cli boots WordPress: the slowest of the three). */
export const SLOT_READ_TIMEOUT_MS = 15_000

/**
 * How long a step waits for a read before it goes on with what was known: the design pull's own bound
 * (`pullDesign`, ≤ 2.5 s), which it runs beside, so a read that answers in time costs the step nothing.
 */
export const SLOT_WAIT_MS = 2_500

/**
 * The slot each site wears, read at most once per `freshMs` per site, and KEPT when a read fails:
 * the site context quoting it must stay byte-stable while the site stands still, and a container that
 * did not answer once has not changed what it wears. `undefined` only until a first read answers.
 *
 * A caller that may not wait (a step) passes `waitMs`: it gets what was known when the read is slower,
 * and the read goes on and is kept for the next step — so a slow container shows its slot one turn
 * late rather than holding every turn up. A read already on its way is joined, never started twice.
 * @param {{ run: (input: { argv: readonly string[], stdin?: string, timeoutMs: number, maxBuffer: number }) =>
 *   Promise<{ code: number | null, stdout: string, stderr: string }>, now?: () => number, freshMs?: number }} deps
 */
export function wornSlotReader({ run, now = Date.now, freshMs = SLOT_FRESH_MS }) {
  /** @type {Map<string, { at: number, slot: WornSlot | null, roles: TemplateRoles | null, platform: string }>} */
  const known = new Map()
  /** @type {Map<string, Promise<WornSlot | null | undefined>>} */
  const running = new Map()
  /** @param {string} label @param {string} platform */
  const keptOf = (label, platform) => {
    const had = known.get(label)
    return had !== undefined && had.platform === platform ? had : undefined
  }
  /**
   * @param {string} label
   * @param {string} platform
   * @param {{ fresh?: boolean, waitMs?: number }} [opts] - `fresh`: read now, whatever was read
   *   before. `waitMs`: wait at most this long, else answer what was known.
   * @returns {Promise<WornSlot | null | undefined>}
   */
  async function read(label, platform, opts = {}) {
    const kept = keptOf(label, platform)
    if (kept !== undefined && opts.fresh !== true && now() - kept.at < freshMs) return kept.slot
    let argv = null
    try {
      argv = slotReadArgv(platform, `${label}-web-1`)
    } catch {
      argv = null
    }
    if (argv === null) return null
    const key = `${label}|${platform}`
    let work = running.get(key)
    if (work === undefined) {
      work = (async () => {
        let got
        /** @type {TemplateRoles | null} */
        let roles = null
        try {
          // `stdin: ''` closes the pipe at once: none of the three reads takes input, and a docker
          // client whose stdin stays open can hold the exec well past its answer (Docker Desktop,
          // measured 10/10/2026: 19 s for a 1 s read).
          const result = await run({
            argv,
            stdin: '',
            timeoutMs: SLOT_READ_TIMEOUT_MS,
            maxBuffer: 4 * 1024 * 1024
          })
          got = parseSlotRead(platform, result.stdout)
          roles = parseRolesRead(result.stdout) ?? null
        } catch {
          got = undefined
        }
        if (got !== undefined) known.set(label, { at: now(), slot: got, roles, platform })
        return got === undefined ? keptOf(label, platform)?.slot : got
      })().finally(() => running.delete(key))
      running.set(key, work)
    }
    if (opts.waitMs === undefined) return work
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer
    // Not unref'd: it is cleared as soon as the read answers, and a step waiting on it must not find
    // the event loop gone under it.
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve(LATE), opts.waitMs)
    })
    const got = await Promise.race([work, late])
    clearTimeout(timer)
    return got === LATE ? kept?.slot : /** @type {WornSlot | null | undefined} */ (got)
  }
  return {
    read,
    /**
     * The roles the last read found in the site's template (`templateRolesOf`), or null: known only after
     * `read` answered for that site, never read on its own.
     * @param {string} label
     * @param {string} platform
     * @returns {TemplateRoles | null}
     */
    rolesOf: (label, platform) => keptOf(label, platform)?.roles ?? null,
    forget: (/** @type {string} */ label) => void known.delete(label)
  }
}

/** What a bounded wait answers when the read was slower. */
const LATE = Symbol('late')
