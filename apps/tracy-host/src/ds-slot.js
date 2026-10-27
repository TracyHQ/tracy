/**
 * `site-ds-slot` — a design system put on a running site, and taken off again, for the Design system
 * door (`apps/tracy-web/src/sites/design-system.js`, plan `tasks/ke-hoach-nut-design-system.md`).
 *
 * tracy-web computes the bytes a CMS wears a system with (`@tracy/ds-slot`'s emitters); this job only
 * puts them where the site's template reads them, inside the site's own web container
 * (`<label>-web-1`, ADR 0014), the same places `packages/design/tracy-ds-slot/scripts/flow.mjs`
 * measured 24/24 on each CMS (09/10/2026):
 *   - EmDash:    `/app/data/ds-slot.css`, read per request by the template (written beside, renamed over).
 *   - WordPress: the variation under `uploads/tracy/styles/<slug>.json` + its row in
 *                `uploads/tracy/inspirations.json`, then the theme's own `tracy_apply_inspiration()`
 *                (the function Claude Cowork's `theme.style` calls). The row carries the site's current
 *                `tracy_nav` / `tracy_hero`, so wearing a system never moves the menu or the hero.
 *   - Joomla:    one `mod_custom` "Tracy design system" (client 0) at the contract's position, on every
 *                page — what `content.update` kind `module` + `moduleAssignment` writes.
 *
 * Modes:
 *   - `read`  → `{ok, slot: {id, name} | null, stylesheet?, template?}` — what the site wears and, for
 *               WordPress / Joomla, the template it runs (the door picks the slot contract from it).
 *   - `apply` → reads the state the write changes, writes, reads it again, and keeps both on this host
 *               as one undo entry; answers `{ok, undoId, slot, files}` (no site bytes leave this
 *               host; `files`: the webroot-relative files it wrote, so Site changes knows the seal of
 *               them is this press's).
 *   - `clear` → takes the worn system off, back to the template's own look (the Template default card,
 *               15/10/2026), kept as one undo entry exactly like `apply`, so its undo puts the system back.
 *               EmDash deletes the sheet; Joomla unpublishes the module; WordPress writes back the global
 *               styles and `tracy_inspiration` from the newest entry whose `before` wore no system (the
 *               look the site had before the first system), keeping `tracy_nav` / `tracy_hero` as they
 *               are now. Nothing worn: `DS_NOTHING_WORN`; WordPress with no such entry on this host:
 *               `DS_NO_TEMPLATE_LOOK` — both write nothing.
 *   - `undo`  → puts the entry's `before` back only while the site still holds its `after` (otherwise
 *               `DS_CHANGED_SINCE`, nothing written), then marks the entry used (`DS_UNDO_USED` after).
 *
 * WHY THE UNDO ENTRY IS HERE AND NOT IN tracy-web: the state is the site's own bytes (a WordPress
 * global-styles document is tens of kilobytes); only this host can read them, and only a read and a
 * write in one run can say exactly what was there before. The store is `<privateRoot>/<label>/
 * ds-slot-undo/<id>/` — the private root is never bound into dsh, so no agent tool can rewrite what an
 * undo will put back (the look entries of `look-css.js` live in the site folder, which it can).
 *
 * 🔒 ONE SITE ONLY: the label is `SAFE_LABEL`-checked before this runs, an undo id is twelve hex digits
 * (no path), and every script runs in `<label>-web-1`, never another site's container.
 */
import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** The `kind` of `POST /_host/site` this module answers. */
export const DS_SLOT_KIND = 'site-ds-slot'
/** An undo entry's id. */
export const DS_UNDO_ID = /^[0-9a-f]{12}$/
/** Where a site's undo entries live under the private root. */
export const DS_UNDO_DIR = 'ds-slot-undo'
/** The answer line every script prints once. */
export const DS_LINE = 'TRACY_DS_JOB '
/** What a payload may weigh (a WordPress variation with its font faces is ~60 KB). */
export const DS_PAYLOAD_MAX = 512 * 1024
/**
 * How long one run in the site's container may take, by mode. Sized for a BUSY host, not an idle
 * one (idle: 0.1–1.2 s): a `wp eval` took 45 s on the stand while three sites were building
 * (11/10/2026). tracy-web waits a little longer than these (`design-system-fit.js` `DOOR_WAIT_MS`), so the
 * door always hears how a write ended instead of guessing from its own timeout.
 */
export const DS_TIMEOUT_MS = Object.freeze({ read: 45_000, apply: 120_000, clear: 120_000, undo: 120_000 })
/** The `system` an entry made by `clear` names: the template's own look (tracy-web's Template default card). */
export const DS_TEMPLATE_DEFAULT = 'template-default'
/** A raw template name a write may name in `templates` (a WordPress stylesheet, a Joomla element). */
const RAW_TEMPLATE = /^[A-Za-z0-9._-]{1,100}$/

const OUT_JS = `const o=(a)=>console.log(${JSON.stringify(DS_LINE)}+Buffer.from(JSON.stringify(a)).toString("base64"));`
const OUT_PHP = `$o=function($a){echo "\\n${DS_LINE}".base64_encode(json_encode($a,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE))."\\n";};`

/**
 * EmDash: `node -e` as root (the data folder is root's; the server reads the file as www-data, so it
 * is written 0644). `state` is the file's text or null, as JSON.
 */
export const EMDASH_DS_SCRIPT =
  'const fs=require("fs");const F="/app/data/ds-slot.css";' +
  OUT_JS +
  'let q;try{q=JSON.parse(fs.readFileSync(0,"utf8"))}catch(e){o({ok:false,error:"no request"});process.exit(0)}' +
  'const now=()=>fs.existsSync(F)?fs.readFileSync(F,"utf8"):null;' +
  'const state=()=>JSON.stringify({file:now()});' +
  'const slot=()=>{const t=now();const m=t&&/^\\/\\* tracy-ds-slot: (\\S+) \\((.*?)\\)/.exec(t);return m?{id:m[1],name:m[2]||null}:null};' +
  'const put=(t)=>{if(t===null){if(fs.existsSync(F))fs.unlinkSync(F);return}const tmp=F+".tracy-"+process.pid;fs.writeFileSync(tmp,t,{mode:0o644});fs.chmodSync(tmp,0o644);fs.renameSync(tmp,F)};' +
  'try{' +
  'if(q.mode==="read"){o({ok:true,slot:slot()})}' +
  'else if(q.mode==="apply"){if(typeof q.css!=="string"||!q.css.startsWith("/* tracy-ds-slot: ")){o({ok:false,error:"not a slot sheet"})}else{const b=state();const sb=slot();put(q.css);o({ok:true,before:b,after:state(),slotBefore:sb,slot:slot()})}}' +
  'else if(q.mode==="clear"){const sb=slot();if(!sb){o({ok:false,code:"DS_NOTHING_WORN"})}else{const b=state();put(null);o({ok:true,before:b,after:state(),slotBefore:sb,slot:slot()})}}' +
  'else if(q.mode==="restore"){if(state()!==q.expect){o({ok:false,conflict:true})}else{put(JSON.parse(q.before).file);o({ok:true,slot:slot()})}}' +
  'else{o({ok:false,error:"bad mode"})}' +
  '}catch(e){o({ok:false,error:String((e&&e.message)||e).slice(0,200)})}'

/**
 * WordPress `read`: `php -r` as www-data from the webroot with `SHORTINIT` — the database and the
 * options API, no plugins, no theme, no WP-CLI. A read decides nothing it writes, so it does not need
 * the full boot `apply` / `restore` take: measured on the stand 11/10/2026, ~100 ms against ~550 ms
 * for `wp eval` on an idle host, and the read is what the panel waits for on every opening (the
 * `wp eval` read once hit the 60 s job limit while three sites were building). It finds the theme's
 * user global-styles post the way `WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles()`
 * does (type `wp_global_styles`, published, its `wp_theme` term named after the stylesheet, newest
 * first) and the upload folder the way `wp_upload_dir()` does for a single site.
 */
export const WORDPRESS_READ_PHP =
  'define("SHORTINIT",true);' +
  OUT_PHP +
  'if(!is_file("wp-load.php")){$o(["ok"=>false,"error"=>"no wp-load.php"]);exit(0);}' +
  'require "wp-load.php";global $wpdb;' +
  '$ss=(string)get_option("stylesheet");' +
  // The running theme's Version header (what the door checks a contract's minVersion against).
  '$tf=WP_CONTENT_DIR."/themes/".$ss."/style.css";$tv=null;if(preg_match("/^[a-z0-9._-]+$/i",$ss)&&is_file($tf)){$h=(string)file_get_contents($tf,false,null,0,8192);if(preg_match("/^[ \\t\\/*#@]*Version:[ \\t]*([^\\r\\n]+)/mi",$h,$vm)){$tv=trim($vm[1]);}}' +
  "$c=$wpdb->get_var($wpdb->prepare(\"SELECT p.post_content FROM {$wpdb->posts} p JOIN {$wpdb->term_relationships} r ON r.object_id=p.ID JOIN {$wpdb->term_taxonomy} x ON x.term_taxonomy_id=r.term_taxonomy_id AND x.taxonomy='wp_theme' JOIN {$wpdb->terms} t ON t.term_id=x.term_id AND t.name=%s WHERE p.post_type='wp_global_styles' AND p.post_status='publish' ORDER BY p.post_date DESC,p.ID DESC LIMIT 1\",$ss));" +
  '$j=is_string($c)?json_decode($c,true):null;$css=(is_array($j)&&isset($j["styles"]["css"])&&is_string($j["styles"]["css"]))?$j["styles"]["css"]:"";' +
  'if(!preg_match("/tracy-ds-slot: ([A-Za-z0-9:._-]+)/",$css,$m)){$o(["ok"=>true,"stylesheet"=>$ss,"themeVersion"=>$tv,"slot"=>null]);exit(0);}' +
  '$up=trim((string)get_option("upload_path"));$base=($up===""||$up==="wp-content/uploads")?(defined("UPLOADS")?ABSPATH.UPLOADS:WP_CONTENT_DIR."/uploads"):(strpos($up,"/")===0?$up:ABSPATH.$up);' +
  '$idx=rtrim($base,"/")."/tracy/inspirations.json";$s=get_option("tracy_inspiration",null);$i=is_file($idx)?json_decode((string)file_get_contents($idx),true):null;' +
  '$n=(is_string($s)&&is_array($i)&&isset($i["systems"][$s]["name"])&&is_string($i["systems"][$s]["name"]))?$i["systems"][$s]["name"]:null;' +
  '$o(["ok"=>true,"stylesheet"=>$ss,"themeVersion"=>$tv,"slot"=>["id"=>$m[1],"name"=>$n]]);'

/**
 * WordPress `apply` / `restore`: `wp eval` as www-data with the theme loaded (its
 * `tracy_apply_inspiration()` is the write) and plugins skipped. `state` = the active theme's user
 * global-styles post (id + content) and the three options the theme's function writes. One run reads
 * the state, writes and reads it again — the undo entry's before and after — so a press costs one
 * WordPress boot.
 */
export const WORDPRESS_DS_PHP =
  OUT_PHP +
  '$q=json_decode(stream_get_contents(fopen("php://stdin","r")),true);' +
  'if(!is_array($q)||!isset($q["mode"])){$o(["ok"=>false,"error"=>"no request"]);return;}' +
  '$th=wp_get_theme();' +
  '$post=function()use($th){$p=WP_Theme_JSON_Resolver::get_user_data_from_wp_global_styles($th);return(is_array($p)&&!empty($p["ID"]))?$p:null;};' +
  '$opt=function($k){$v=get_option($k,null);return($v===null||$v===false)?null:(string)$v;};' +
  '$keys=["tracy_inspiration","tracy_nav","tracy_hero"];' +
  '$state=function()use($post,$opt,$keys){$p=$post();$os=[];foreach($keys as $k){$os[$k]=$opt($k);}return json_encode(["post"=>$p?["id"=>(int)$p["ID"],"content"=>(string)$p["post_content"]]:null,"options"=>$os],JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);};' +
  '$up=wp_upload_dir(null,false);$dir=rtrim((string)($up["basedir"]??""),"/")."/tracy";$idx=$dir."/inspirations.json";' +
  '$slot=function()use($post,$opt,$idx){$p=$post();$j=$p?json_decode((string)$p["post_content"],true):null;$css=(is_array($j)&&isset($j["styles"]["css"])&&is_string($j["styles"]["css"]))?$j["styles"]["css"]:"";' +
  'if(!preg_match("/tracy-ds-slot: ([A-Za-z0-9:._-]+)/",$css,$m)){return null;}$s=$opt("tracy_inspiration");$i=is_file($idx)?json_decode((string)file_get_contents($idx),true):null;' +
  '$n=($s!==null&&is_array($i)&&isset($i["systems"][$s]["name"])&&is_string($i["systems"][$s]["name"]))?$i["systems"][$s]["name"]:null;return["id"=>$m[1],"name"=>$n];};' +
  'if($q["mode"]==="apply"){' +
  // The templates the door chose the bytes for (`templates`): another one runs now → nothing written.
  '$tv=(string)$th->get("Version");$ex=$q["templates"]??null;$mt=$q["minTheme"]??null;$need=is_array($mt)?($mt[$th->get_stylesheet()]??null):null;' +
  '$xt=$q["maxTheme"]??null;$top=is_array($xt)?($xt[$th->get_stylesheet()]??null):null;' +
  // …and the theme releases it wears: older than the first (`minTheme`) or newer than the last one
  // confirmed to wear the slot (`maxTheme`), the theme writes nothing either.
  'if((is_array($ex)&&!in_array($th->get_stylesheet(),$ex,true))||(is_array($mt)&&(!is_string($need)||version_compare($tv,$need,"<")))||(is_array($xt)&&(!is_string($top)||version_compare($tv,$top,">")))){$o(["ok"=>false,"code"=>"DS_TEMPLATE_MOVED","stylesheet"=>$th->get_stylesheet(),"themeVersion"=>$tv,"slot"=>$slot()]);return;}' +
  'if(!function_exists("tracy_apply_inspiration")){$o(["ok"=>false,"code"=>"DS_THEME_CANNOT_WEAR","stylesheet"=>$th->get_stylesheet()]);return;}' +
  '$slug=(string)($q["slug"]??"");if(!preg_match("/^ds-[a-z0-9-]+$/",$slug)||!is_array($q["variation"]??null)){$o(["ok"=>false,"error"=>"bad request"]);return;}' +
  '$b=$state();$sb=$slot();' +
  'if(!wp_mkdir_p($dir."/styles")){$o(["ok"=>false,"error"=>"cannot create the styles folder"]);return;}' +
  'if(false===file_put_contents($dir."/styles/".$slug.".json",json_encode($q["variation"],JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES)."\\n")){$o(["ok"=>false,"error"=>"cannot write the variation"]);return;}' +
  '$i=is_file($idx)?json_decode((string)file_get_contents($idx),true):null;if(!is_array($i)){$i=[];}if(!isset($i["systems"])||!is_array($i["systems"])){$i["systems"]=[];}' +
  '$row=["name"=>(string)($q["name"]??$slug)];$nv=$opt("tracy_nav");$hr=$opt("tracy_hero");if($nv!==null){$row["nav"]=$nv;}if($hr!==null){$row["hero"]=$hr;}' +
  '$i["systems"][$slug]=$row;if(false===file_put_contents($idx,json_encode($i,JSON_UNESCAPED_SLASHES))){$o(["ok"=>false,"error"=>"cannot write the catalogue row"]);return;}' +
  'if(!tracy_apply_inspiration($slug)){$o(["ok"=>false,"error"=>"the theme did not wear the variation"]);return;}' +
  // The two files written, relative to the webroot (what its history seals them as): Site changes
  // folds that seal into this press's row instead of a "source unknown" one.
  '$rr=rtrim(ABSPATH,"/")."/";$fs=[];foreach([$dir."/styles/".$slug.".json",$idx] as $f){if(strpos($f,$rr)===0){$fs[]=substr($f,strlen($rr));}}' +
  '$o(["ok"=>true,"before"=>$b,"after"=>$state(),"slotBefore"=>$sb,"stylesheet"=>$th->get_stylesheet(),"themeVersion"=>$tv,"slot"=>$slot(),"files"=>$fs]);return;}' +
  // `clear`: the global styles and `tracy_inspiration` of `bare` (a state that wore no system), the
  // menu and hero options left as they are. The post is rewritten, never deleted, so the entry's undo
  // finds it again; a bare state with no post writes the empty user styles WordPress starts from.
  'if($q["mode"]==="clear"){' +
  '$sb=$slot();if($sb===null){$o(["ok"=>false,"code"=>"DS_NOTHING_WORN","stylesheet"=>$th->get_stylesheet(),"themeVersion"=>(string)$th->get("Version")]);return;}' +
  '$g=json_decode((string)($q["bare"]??""),true);if(!is_array($g)||!array_key_exists("post",$g)){$o(["ok"=>false,"error"=>"bad bare state"]);return;}' +
  '$b=$state();$p=$post();global $wpdb;if(!$p){$o(["ok"=>false,"error"=>"no global styles post"]);return;}' +
  '$nc=is_array($g["post"])?(string)$g["post"]["content"]:"{\\"version\\":3,\\"isGlobalStylesUserThemeJSON\\":true}";' +
  'if(false===$wpdb->update($wpdb->posts,["post_content"=>$nc],["ID"=>(int)$p["ID"]])){$o(["ok"=>false,"error"=>"the global styles post was not written"]);return;}clean_post_cache((int)$p["ID"]);' +
  '$iv=$g["options"]["tracy_inspiration"]??null;if($iv===null){delete_option("tracy_inspiration");}else{update_option("tracy_inspiration",$iv);}' +
  'if(function_exists("wp_clean_theme_json_cache")){wp_clean_theme_json_cache();}' +
  '$o(["ok"=>true,"before"=>$b,"after"=>$state(),"slotBefore"=>$sb,"stylesheet"=>$th->get_stylesheet(),"themeVersion"=>(string)$th->get("Version"),"slot"=>$slot()]);return;}' +
  'if($q["mode"]==="restore"){' +
  'if($state()!==(string)($q["expect"]??"")){$o(["ok"=>false,"conflict"=>true]);return;}' +
  '$b=json_decode((string)$q["before"],true);$p=$post();global $wpdb;' +
  'if(!is_array($b)){$o(["ok"=>false,"error"=>"bad entry"]);return;}' +
  'if($b["post"]===null){if($p&&!wp_delete_post((int)$p["ID"],true)){$o(["ok"=>false,"error"=>"the global styles post was not deleted"]);return;}}' +
  'else{$id=$p?(int)$p["ID"]:(int)$b["post"]["id"];if(false===$wpdb->update($wpdb->posts,["post_content"=>(string)$b["post"]["content"]],["ID"=>$id])){$o(["ok"=>false,"error"=>"the global styles post was not written"]);return;}clean_post_cache($id);}' +
  'foreach($keys as $k){$v=$b["options"][$k]??null;if($v===null){delete_option($k);}else{update_option($k,$v);}}' +
  'if(function_exists("wp_clean_theme_json_cache")){wp_clean_theme_json_cache();}' +
  '$o(["ok"=>true,"stylesheet"=>$th->get_stylesheet(),"themeVersion"=>(string)$th->get("Version"),"slot"=>$slot()]);return;}' +
  '$o(["ok"=>false,"error"=>"bad mode"]);'

/**
 * Joomla: `php -r` as www-data from the webroot, through the site's own `configuration.php`. `state`
 * = every `mod_custom` row of that title (client 0), each with its page assignments.
 */
export const JOOMLA_DS_PHP =
  OUT_PHP +
  '$q=json_decode(stream_get_contents(fopen("php://stdin","r")),true);' +
  'if(!is_array($q)||!isset($q["mode"])){$o(["ok"=>false,"error"=>"no request"]);exit(0);}' +
  'if(!is_file("configuration.php")){$o(["ok"=>false,"error"=>"no configuration.php"]);exit(0);}' +
  'require "configuration.php";$c=new JConfig();' +
  '$m=@new mysqli($c->host,$c->user,$c->password,$c->db,(int)($c->dbport??3306?:3306));' +
  'if($m->connect_errno){$o(["ok"=>false,"error"=>"the database did not answer"]);exit(0);}$m->set_charset("utf8mb4");' +
  '$p=$m->real_escape_string($c->dbprefix);$e=function($v)use($m){return $v===null?"NULL":"\'".$m->real_escape_string((string)$v)."\'";};' +
  '$T=(string)($q["title"]??"Tracy design system");' +
  '$cols="id,title,content,ordering,position,published,publish_up,publish_down,showtitle,params,language,access";' +
  '$rows=function()use($m,$p,$e,$T,$cols){$r=$m->query("SELECT $cols FROM {$p}modules WHERE module=\'mod_custom\' AND client_id=0 AND title=".$e($T)." ORDER BY id");$out=[];if(!$r){return null;}' +
  'while($x=$r->fetch_assoc()){$mm=$m->query("SELECT menuid FROM {$p}modules_menu WHERE moduleid=".(int)$x["id"]." ORDER BY menuid");$ms=[];while($mm&&($y=$mm->fetch_assoc())){$ms[]=(int)$y["menuid"];}$x["menus"]=$ms;$out[]=$x;}return $out;};' +
  '$state=function()use($rows){return json_encode($rows(),JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);};' +
  '$slot=function()use($rows){foreach((array)$rows() as $x){if((int)$x["published"]===1&&count($x["menus"])>0&&preg_match("/tracy-ds-slot: ([A-Za-z0-9:._-]+)/",(string)$x["content"],$g)){return["id"=>$g[1],"name"=>null];}}return null;};' +
  '$tpl=function()use($m,$p){$t=$m->query("SELECT template FROM {$p}template_styles WHERE client_id=0 AND home=\'1\' LIMIT 1");$x=$t?$t->fetch_assoc():null;return $x?(string)$x["template"]:null;};' +
  'if($q["mode"]==="read"){$o(["ok"=>true,"template"=>$tpl(),"slot"=>$slot()]);exit(0);}' +
  // `clear`: every module of the slot's title unpublished, kept (the entry's undo publishes it again).
  'if($q["mode"]==="clear"){$sb=$slot();if($sb===null){$o(["ok"=>false,"code"=>"DS_NOTHING_WORN","template"=>$tpl()]);exit(0);}$b=$state();' +
  'if(!$m->query("UPDATE {$p}modules SET published=0 WHERE module=\'mod_custom\' AND client_id=0 AND title=".$e($T))){$o(["ok"=>false,"error"=>"the module was not written"]);exit(0);}' +
  '$o(["ok"=>true,"before"=>$b,"after"=>$state(),"slotBefore"=>$sb,"template"=>$tpl(),"slot"=>$slot()]);exit(0);}' +
  // The templates the door chose the bytes for (`templates`): another one runs now → nothing written.
  '$ex=$q["templates"]??null;if($q["mode"]==="apply"&&is_array($ex)&&!in_array($tpl(),$ex,true)){$o(["ok"=>false,"code"=>"DS_TEMPLATE_MOVED","template"=>$tpl(),"slot"=>$slot()]);exit(0);}' +
  'if($q["mode"]==="apply"){' +
  '$h=(string)($q["html"]??"");$md=is_array($q["module"]??null)?$q["module"]:[];$pos=(string)($md["position"]??"");' +
  'if(strpos($h,"tracy-ds-slot:")===false||!preg_match("/^[A-Za-z0-9_-]+$/",$pos)){$o(["ok"=>false,"error"=>"bad request"]);exit(0);}' +
  '$b=$state();$sb=$slot();$ord=(int)($md["ordering"]??0);' +
  '$pr=json_encode(["prepare_content"=>"0","layout"=>"_:default","moduleclass_sfx"=>"","cache"=>"0","style"=>(string)($md["style"]??"System-none")]);' +
  '$cur=$rows();$id=(is_array($cur)&&count($cur)>0)?(int)$cur[0]["id"]:0;' +
  'if($id>0){$ok=$m->query("UPDATE {$p}modules SET content=".$e($h).",published=1,position=".$e($pos).",ordering=$ord,params=".$e($pr).",publish_up=NULL,publish_down=NULL WHERE id=$id");}' +
  'else{$ok=$m->query("INSERT INTO {$p}modules (asset_id,title,note,content,ordering,position,checked_out,publish_up,publish_down,published,module,access,showtitle,params,client_id,language) VALUES (0,".$e($T).",\'\',".$e($h).",$ord,".$e($pos).",NULL,NULL,NULL,1,\'mod_custom\',1,0,".$e($pr).",0,\'*\')");$id=(int)$m->insert_id;}' +
  'if(!$ok||$id<=0){$o(["ok"=>false,"error"=>"the module was not written"]);exit(0);}' +
  '$m->query("DELETE FROM {$p}modules_menu WHERE moduleid=$id");$m->query("INSERT INTO {$p}modules_menu (moduleid,menuid) VALUES ($id,0)");' +
  '$o(["ok"=>true,"before"=>$b,"after"=>$state(),"slotBefore"=>$sb,"template"=>$tpl(),"slot"=>$slot()]);exit(0);}' +
  'if($q["mode"]==="restore"){' +
  'if($state()!==(string)($q["expect"]??"")){$o(["ok"=>false,"conflict"=>true]);exit(0);}' +
  '$b=json_decode((string)$q["before"],true);if(!is_array($b)){$o(["ok"=>false,"error"=>"bad entry"]);exit(0);}' +
  '$keep=[];foreach($b as $x){$keep[(int)$x["id"]]=$x;}' +
  'foreach((array)$rows() as $x){$id=(int)$x["id"];if(!isset($keep[$id])){$m->query("DELETE FROM {$p}modules_menu WHERE moduleid=$id");$m->query("DELETE FROM {$p}modules WHERE id=$id");}}' +
  'foreach($keep as $id=>$x){$m->query("UPDATE {$p}modules SET title=".$e($x["title"]).",content=".$e($x["content"]).",ordering=".(int)$x["ordering"].",position=".$e($x["position"]).",published=".(int)$x["published"].",publish_up=".$e($x["publish_up"]).",publish_down=".$e($x["publish_down"]).",showtitle=".(int)$x["showtitle"].",params=".$e($x["params"]).",language=".$e($x["language"]).",access=".(int)$x["access"]." WHERE id=$id");' +
  '$m->query("DELETE FROM {$p}modules_menu WHERE moduleid=$id");foreach((array)$x["menus"] as $mi){$m->query("INSERT INTO {$p}modules_menu (moduleid,menuid) VALUES ($id,".(int)$mi.")");}}' +
  '$o(["ok"=>true,"template"=>$tpl(),"slot"=>$slot()]);exit(0);}' +
  '$o(["ok"=>false,"error"=>"bad mode"]);'

/**
 * The docker argv that runs one platform's script in a site's own web container. WordPress reads with
 * the light script ({@link WORDPRESS_READ_PHP}); every other run is the platform's one script.
 * @param {'emdash' | 'wordpress' | 'joomla'} platform
 * @param {string} container
 * @param {'read' | 'apply' | 'clear' | 'restore'} [mode]
 * @returns {string[]}
 */
export function dsSlotArgv(platform, container, mode = 'apply') {
  if (!/^[a-z0-9][a-z0-9._-]*-web-1$/i.test(container)) throw new TypeError('not a site web container')
  if (platform === 'emdash') return ['exec', '-i', '-u', '0', container, 'node', '-e', EMDASH_DS_SCRIPT]
  if (platform === 'wordpress' && mode === 'read')
    return ['exec', '-i', '-u', 'www-data', '-w', '/var/www/html', container, 'php', '-r', WORDPRESS_READ_PHP]
  if (platform === 'wordpress')
    return [
      'exec',
      '-i',
      '-u',
      'www-data',
      container,
      'wp',
      '--path=/var/www/html',
      '--skip-plugins',
      '--no-color',
      'eval',
      WORDPRESS_DS_PHP
    ]
  if (platform === 'joomla')
    return ['exec', '-i', '-u', 'www-data', '-w', '/var/www/html', container, 'php', '-r', JOOMLA_DS_PHP]
  throw new TypeError(`no design-system slot on ${platform}`)
}

const PLATFORMS = ['emdash', 'wordpress', 'joomla']

/**
 * `null` when `body` is a valid `site-ds-slot` instruction, else the refusal reason.
 * @param {Record<string, unknown>} body
 */
export function validateDsSlotBody(body) {
  for (const key of Object.keys(body)) {
    if (!['kind', 'label', 'mode', 'platform', 'payload', 'id'].includes(key)) return `refused ${key}`
  }
  if (!PLATFORMS.includes(String(body.platform))) return 'refused platform'
  if (body.mode === 'read') return body.payload === undefined && body.id === undefined ? null : 'refused read'
  if (body.mode === 'clear')
    return body.payload === undefined && body.id === undefined ? null : 'refused clear'
  if (body.mode === 'undo')
    return typeof body.id === 'string' && DS_UNDO_ID.test(body.id) && body.payload === undefined
      ? null
      : 'refused id'
  if (body.mode !== 'apply') return 'refused mode'
  if (body.id !== undefined) return 'refused id'
  const p = /** @type {Record<string, unknown> | null} */ (
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : null
  )
  if (!p) return 'refused payload'
  if (JSON.stringify(p).length > DS_PAYLOAD_MAX) return 'refused payload size'
  // `od:<id>` (OpenDesign) or `refero:<uuid>` (the curated Refero set tracy-web offers).
  if (
    typeof p.system !== 'string' ||
    !/^(od:[a-z0-9][a-z0-9-]{0,60}|refero:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/.test(
      p.system
    )
  )
    return 'refused system'
  if (
    p.templates !== undefined &&
    (body.platform === 'emdash' ||
      !Array.isArray(p.templates) ||
      p.templates.length < 1 ||
      p.templates.length > 4 ||
      !p.templates.every((t) => typeof t === 'string' && RAW_TEMPLATE.test(t)))
  )
    return 'refused templates'
  for (const field of ['minTheme', 'maxTheme']) {
    const v = /** @type {unknown} */ (p[field])
    if (
      v !== undefined &&
      (body.platform !== 'wordpress' ||
        !v ||
        typeof v !== 'object' ||
        Array.isArray(v) ||
        Object.keys(v).length > 4 ||
        !Object.entries(v).every(
          ([k, x]) =>
            RAW_TEMPLATE.test(k) && (x === null || (typeof x === 'string' && /^\d+(\.\d+){0,3}$/.test(x)))
        ))
    )
      return `refused ${field}`
  }
  if (body.platform === 'emdash')
    return typeof p.css === 'string' && p.css.startsWith('/* tracy-ds-slot: ') ? null : 'refused css'
  if (body.platform === 'wordpress')
    return typeof p.slug === 'string' &&
      /^ds-[a-z0-9-]+$/.test(p.slug) &&
      typeof p.name === 'string' &&
      p.variation &&
      typeof p.variation === 'object'
      ? null
      : 'refused variation'
  const m = /** @type {any} */ (p.module)
  return typeof p.html === 'string' &&
    p.html.includes('tracy-ds-slot:') &&
    m &&
    typeof m.position === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(m.position) &&
    typeof m.title === 'string'
    ? null
    : 'refused module'
}

/**
 * The one answer line of a script in a run's output, or null.
 * @param {string[]} tail
 */
export function parseDsLine(tail) {
  const line = [...tail].reverse().find((l) => l.startsWith(DS_LINE))
  if (line === undefined) return null
  try {
    const out = JSON.parse(Buffer.from(line.slice(DS_LINE.length).trim(), 'base64').toString('utf8'))
    return out && typeof out === 'object' && !Array.isArray(out) ? out : null
  } catch {
    return null
  }
}

/** SHA-256 of a state text (what tracy-web keeps: never the state itself). */
export const stateHash = (/** @type {string} */ s) => createHash('sha256').update(s, 'utf8').digest('hex')

/**
 * Run the platform's script once in the site's container.
 * @param {{ run: Function, label: string, platform: any, request: Record<string, unknown> }} input
 */
async function inSite({ run, label, platform, request }) {
  const mode = /** @type {'read' | 'apply' | 'clear' | 'restore'} */ (request.mode)
  const { code, tail } = await run({
    script: 'docker',
    args: dsSlotArgv(platform, `${label}-web-1`, mode),
    env: process.env,
    stdin: JSON.stringify(request),
    timeoutMs: DS_TIMEOUT_MS[mode === 'restore' ? 'undo' : mode]
  })
  const answer = parseDsLine(tail ?? [])
  if (answer !== null) return answer
  const said = (tail ?? []).map((l) => l.trim()).find((l) => l !== '')
  throw new Error(`${platform} in ${label}-web-1: ${(said ?? `exit ${code}`).slice(0, 200)}`)
}

/** A webroot-relative path a script may name: no leading slash, no `.` or `..` segment. */
const WEBROOT_FILE = /^(?!\/)(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._@+/-]{1,300}$/

/** The `files` a script said it wrote, kept only when each is a plain webroot-relative path. */
const webrootFilesOf = (/** @type {any} */ f) =>
  Array.isArray(f) ? f.filter((x) => typeof x === 'string' && WEBROOT_FILE.test(x)).slice(0, 8) : []

/** A slot as the scripts say it, or null. */
const slotOf = (/** @type {any} */ s) =>
  s && typeof s.id === 'string'
    ? { id: s.id.slice(0, 80), name: typeof s.name === 'string' ? s.name.slice(0, 120) : null }
    : null

/**
 * The template the site runs, as the script read it in the same run: what the door picks the slot
 * contract by (WordPress's stylesheet, Joomla's default site template; EmDash names none).
 * @param {string} platform
 * @param {any} r
 */
const templateOf = (platform, r) =>
  platform === 'wordpress'
    ? {
        stylesheet: typeof r.stylesheet === 'string' ? r.stylesheet : null,
        themeVersion: typeof r.themeVersion === 'string' ? r.themeVersion.slice(0, 40) : null
      }
    : platform === 'joomla'
      ? { template: typeof r.template === 'string' ? r.template : null }
      : {}

/**
 * Keep one write's undo entry (`before`, `after`, manifest) under `store`, and the id it is kept as.
 * @param {{ store: string, id: string, r: any, now: number, platform: string, system: string, title: string | null }} e
 */
async function keepEntry({ store, id, r, now, platform, system, title }) {
  const dir = path.join(store, id)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  await writeFile(path.join(dir, 'before'), r.before, { mode: 0o600 })
  await writeFile(path.join(dir, 'after'), r.after, { mode: 0o600 })
  await writeFile(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ v: 1, id, at: new Date(now).toISOString(), platform, system, title })}\n`,
    { mode: 0o600 }
  )
}

/**
 * The look a WordPress site had before it wore any system, as this host kept it: the `before` of the
 * newest entry whose global styles carry no slot marker (the first apply of the run of systems that
 * led to what the site wears now). Null when no entry has one.
 * @param {string} store
 * @returns {Promise<string | null>}
 */
export async function bareStateOf(store) {
  let ids
  try {
    ids = (await readdir(store)).filter((x) => DS_UNDO_ID.test(x))
  } catch {
    return null
  }
  const kept = []
  for (const id of ids) {
    try {
      const manifest = JSON.parse(await readFile(path.join(store, id, 'manifest.json'), 'utf8'))
      const before = await readFile(path.join(store, id, 'before'), 'utf8')
      if (manifest.platform === 'wordpress' && !before.includes('tracy-ds-slot:'))
        kept.push({ at: String(manifest.at ?? ''), before })
    } catch {
      // an entry that cannot be read names no look
    }
  }
  kept.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
  return kept[0]?.before ?? null
}

/**
 * The answer of one `site-ds-slot` instruction, already validated. Clean refusals are
 * `{ok: false, code}` and wrote nothing; a script with no readable answer throws (the job fails, and
 * the write may or may not have landed).
 * @param {{ body: any, config: { privateRoot: string }, run: Function, now?: number, newId?: () => string }} input
 */
export async function dsSlot({
  body,
  config,
  run,
  now = Date.now(),
  newId = () => randomBytes(6).toString('hex')
}) {
  const label = String(body.label)
  const platform = body.platform
  const store = path.join(config.privateRoot, label, DS_UNDO_DIR)
  if (body.mode === 'read') {
    const r = await inSite({ run, label, platform, request: { mode: 'read' } })
    if (r.ok !== true) throw new Error(String(r.error ?? 'no read').slice(0, 200))
    return { ok: true, slot: slotOf(r.slot), ...templateOf(platform, r) }
  }
  if (body.mode === 'apply') {
    const p = body.payload
    // `templates`: the template(s) the door made the bytes for; the script writes nothing when the
    // site runs another one now, and says which (`DS_TEMPLATE_MOVED`, with what it wears).
    const templates = Array.isArray(p.templates) ? { templates: p.templates } : {}
    const request =
      platform === 'emdash'
        ? { mode: 'apply', css: p.css }
        : platform === 'wordpress'
          ? {
              mode: 'apply',
              slug: p.slug,
              name: p.name,
              variation: p.variation,
              ...templates,
              ...(p.minTheme ? { minTheme: p.minTheme } : {}),
              ...(p.maxTheme ? { maxTheme: p.maxTheme } : {})
            }
          : { mode: 'apply', html: p.html, module: p.module, title: p.module.title, ...templates }
    const r = await inSite({ run, label, platform, request })
    if (r.ok !== true) {
      if (r.code === 'DS_TEMPLATE_MOVED')
        return { ok: false, code: r.code, slot: slotOf(r.slot), ...templateOf(platform, r) }
      if (typeof r.code === 'string') return { ok: false, code: r.code }
      throw new Error(String(r.error ?? 'not written').slice(0, 200))
    }
    if (typeof r.before !== 'string' || typeof r.after !== 'string') throw new Error('no state read back')
    const id = newId()
    await keepEntry({ store, id, r, now, platform, system: p.system, title: p.module?.title ?? null })
    return {
      ok: true,
      undoId: id,
      slot: slotOf(r.slot),
      // What the site wore just before, read in the same run (the door names it as the previous look).
      previous: slotOf(r.slotBefore),
      ...templateOf(platform, r),
      changed: r.before !== r.after,
      // The webroot files the write made or changed (WordPress: the variation and the catalogue under
      // `uploads/tracy/`). EmDash's `data/ds-slot.css` and Joomla's module row are not under the
      // webroot's history, so they name none.
      files: webrootFilesOf(r.files),
      before: stateHash(r.before),
      after: stateHash(r.after)
    }
  }
  if (body.mode === 'clear') {
    /** @type {Record<string, unknown>} */
    const request = { mode: 'clear' }
    if (platform === 'wordpress') {
      const bare = await bareStateOf(store)
      if (bare === null) return { ok: false, code: 'DS_NO_TEMPLATE_LOOK' }
      request.bare = bare
    }
    const r = await inSite({ run, label, platform, request })
    if (r.ok !== true) {
      if (typeof r.code === 'string') return { ok: false, code: r.code, ...templateOf(platform, r) }
      throw new Error(String(r.error ?? 'not taken off').slice(0, 200))
    }
    if (typeof r.before !== 'string' || typeof r.after !== 'string') throw new Error('no state read back')
    const id = newId()
    await keepEntry({ store, id, r, now, platform, system: DS_TEMPLATE_DEFAULT, title: null })
    return {
      ok: true,
      undoId: id,
      slot: slotOf(r.slot),
      previous: slotOf(r.slotBefore),
      ...templateOf(platform, r),
      changed: r.before !== r.after,
      // A clear writes no webroot file (EmDash's sheet is under data/, the others are database rows).
      files: [],
      before: stateHash(r.before),
      after: stateHash(r.after)
    }
  }
  // undo
  const dir = path.join(store, String(body.id))
  return undoOnce(dir, () => undoEntry({ dir, run, label, platform, now, id: body.id }))
}

/**
 * Undos of one entry, one after another in this process. Two undo jobs for the same id (a double
 * press) used to read the manifest, restore and write `manifest.json` at once; the second now finds
 * `reverted` and is refused instead of failing on a renamed-away temp file.
 * @type {Map<string, Promise<unknown>>}
 */
const undoChains = new Map()

/**
 * @template T
 * @param {string} dir
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function undoOnce(dir, task) {
  const previous = undoChains.get(dir) ?? Promise.resolve()
  const turn = previous.then(task, task)
  const settled = turn.catch(() => undefined)
  undoChains.set(dir, settled)
  void settled.then(() => {
    if (undoChains.get(dir) === settled) undoChains.delete(dir)
  })
  return turn
}

/** @param {{ dir: string, run: Function, label: string, platform: any, now: number, id: any }} input */
async function undoEntry({ dir, run, label, platform, now, id }) {
  let manifest
  let before
  let after
  try {
    manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
    before = await readFile(path.join(dir, 'before'), 'utf8')
    after = await readFile(path.join(dir, 'after'), 'utf8')
  } catch {
    return { ok: false, code: 'DS_UNDO_UNKNOWN' }
  }
  if (manifest.platform !== platform) return { ok: false, code: 'DS_UNDO_UNKNOWN' }
  if (manifest.reverted) return { ok: false, code: 'DS_UNDO_USED' }
  const r = await inSite({
    run,
    label,
    platform,
    request: { mode: 'restore', before, expect: after, title: manifest.title ?? undefined }
  })
  if (r.conflict === true) return { ok: false, code: 'DS_CHANGED_SINCE' }
  if (r.ok !== true) throw new Error(String(r.error ?? 'not put back').slice(0, 200))
  const file = path.join(dir, 'manifest.json')
  // A temp name of its own per write, like `jobs.js`.
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await writeFile(
      tmp,
      `${JSON.stringify({ ...manifest, reverted: { at: new Date(now).toISOString() } })}\n`,
      {
        mode: 0o600
      }
    )
    await rename(tmp, file)
  } catch (error) {
    await unlink(tmp).catch(() => undefined)
    throw error
  }
  return { ok: true, id, slot: slotOf(r.slot), ...templateOf(platform, r) }
}

/**
 * Run one instruction as a job: `output` is the answer as one JSON line.
 * @param {{ jobId: string, body: any, config: { privateRoot: string }, jobs: any, run: Function }} input
 */
export async function runDsSlotJob({ jobId, body, config, jobs, run }) {
  await jobs.put(jobId, { state: 'running', step: DS_SLOT_KIND, label: body.label })
  try {
    const answer = await dsSlot({ body, config, run })
    await jobs.put(jobId, { state: 'done', step: DS_SLOT_KIND, exitCode: 0, output: JSON.stringify(answer) })
  } catch (error) {
    await jobs.put(jobId, {
      state: 'failed',
      step: DS_SLOT_KIND,
      detail: String(/** @type {any} */ (error)?.message ?? error).slice(0, 200)
    })
  }
}
