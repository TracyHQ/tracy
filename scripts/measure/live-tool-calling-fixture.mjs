#!/usr/bin/env node
/** Create or remove an owned disposable WordPress benchmark fixture. Never edits the source site. */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
const args = process.argv.slice(2),
  arg = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const configPath = arg('--config', join(tmpdir(), 'tracy-tool-bench-owned.json'))
const run = (a, input) =>
  execFileSync('docker', a, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
if (args.includes('--cleanup')) {
  const c = JSON.parse(readFileSync(configPath, 'utf8'))
  if (
    !/^toolbench-\d+$/.test(c.name) ||
    c.wp !== c.name + '-wp' ||
    c.db !== c.name + '-db' ||
    c.network !== c.name + '-net'
  )
    throw new Error('Not an owned benchmark fixture')
  run(['rm', '-f', '-v', c.wp, c.db])
  run(['network', 'rm', c.network])
  rmSync(c.folder, { recursive: true, force: true })
  rmSync(configPath)
  console.log('Removed the owned benchmark fixture')
  process.exit(0)
}
const sourceContainer = arg('--plugin-container', null)
if (!sourceContainer)
  throw new Error('Pass --plugin-container <read-only source of the installed Claude Cowork plugin>')
const name = 'toolbench-' + Date.now(),
  network = name + '-net',
  db = name + '-db',
  wp = name + '-wp'
const folder = mkdtempSync(join(tmpdir(), 'tracy-live-toolbench-'))
const password = randomBytes(24).toString('hex'),
  token = randomBytes(24).toString('hex')
run(['network', 'create', network])
run([
  'run',
  '-d',
  '--name',
  db,
  '--network',
  network,
  '-e',
  'MARIADB_ROOT_PASSWORD=' + password,
  '-e',
  'MARIADB_DATABASE=wordpress',
  'mariadb:11'
])
run([
  'run',
  '-d',
  '--name',
  wp,
  '--network',
  network,
  '-p',
  '127.0.0.1::80',
  '-e',
  'WORDPRESS_DB_HOST=' + db + ':3306',
  '-e',
  'WORDPRESS_DB_USER=root',
  '-e',
  'WORDPRESS_DB_PASSWORD=' + password,
  '-e',
  'WORDPRESS_DB_NAME=wordpress',
  'wordpress:apache'
])
writeFileSync(configPath, JSON.stringify({ name, network, db, wp, folder, token }), { mode: 0o600 })
for (let i = 0; i < 60; i++) {
  try {
    run(['exec', db, 'mariadb-admin', 'ping', '-h', '127.0.0.1', '-uroot', '-p' + password])
    break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
for (let i = 0; i < 60; i++) {
  try {
    run(['exec', wp, 'test', '-f', '/var/www/html/wp-load.php'])
    break
  } catch {}
  await new Promise((r) => setTimeout(r, 500))
}
run([
  'cp',
  sourceContainer + ':/var/www/html/wp-content/plugins/claude-cowork',
  join(folder, 'claude-cowork')
])
run(['cp', join(folder, 'claude-cowork'), wp + ':/var/www/html/wp-content/plugins/claude-cowork'])
const port = run(['port', wp, '80/tcp']).split(':').at(-1),
  origin = 'http://127.0.0.1:' + port
const php = `<?php
define('WP_INSTALLING', true); require '/var/www/html/wp-load.php';
require_once ABSPATH.'wp-admin/includes/upgrade.php';
if(!is_blog_installed()) wp_install('Tool benchmark', 'bench', 'bench@example.test', true, '', bin2hex(random_bytes(24)));
require_once ABSPATH.'wp-admin/includes/plugin.php';
activate_plugin('claude-cowork/claude-cowork.php');
update_option('tracy_tool_benchmark_owned', true);
update_option('claude_cowork_token', getenv('BENCH_TOKEN'));
update_option('home',getenv('BENCH_ORIGIN'));update_option('siteurl',getenv('BENCH_ORIGIN'));
update_option('permalink_structure','');
foreach(get_posts(['post_type'=>'any','post_status'=>'any','numberposts'=>-1]) as $p) wp_delete_post($p->ID,true);
$theme=WP_CONTENT_DIR.'/themes/tool-benchmark';wp_mkdir_p($theme.'/templates');wp_mkdir_p($theme.'/parts');
file_put_contents($theme.'/style.css',"/*\\nTheme Name: Tool Benchmark\\nVersion: 1.0\\n*/");
file_put_contents($theme.'/theme.json','{"version":2}');
file_put_contents($theme.'/parts/header.html','<!-- wp:paragraph --><p>Benchmark header</p><!-- /wp:paragraph -->');
file_put_contents($theme.'/parts/footer.html','<!-- wp:paragraph --><p>Benchmark footer</p><!-- /wp:paragraph -->');
$template='<!-- wp:template-part {"slug":"header"} /--><main><!-- wp:post-content /--><!-- wp:paragraph --><p>Built with Tracy on WordPress</p><!-- /wp:paragraph --></main><!-- wp:template-part {"slug":"footer"} /-->';
file_put_contents($theme.'/templates/page.html',$template);file_put_contents($theme.'/templates/index.html',$template);switch_theme('tool-benchmark');
$id=wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_title'=>'Plain benchmark','post_name'=>'plain','post_content'=>'<!-- wp:paragraph --><p>Keep this short line.</p><!-- /wp:paragraph -->']);
$ids=[];
for($i=0;$i<400;$i++) $ids[]=wp_insert_post(['post_type'=>'page','post_status'=>'publish','post_title'=>sprintf('Inventory %03d: Reference material for the independent tool calling benchmark', $i),'post_name'=>sprintf('inventory-%03d',$i),'post_content'=>'<!-- wp:paragraph --><p>Inventory fixture.</p><!-- /wp:paragraph -->']);
echo json_encode(['pageId'=>$id,'targetId'=>end($ids),'targetTitle'=>'Inventory 399: Reference material for the independent tool calling benchmark','component'=>claude_cowork_version(),'wordpress'=>get_bloginfo('version')]);
`
const info = JSON.parse(
  run(['exec', '-i', '-e', 'BENCH_TOKEN=' + token, '-e', 'BENCH_ORIGIN=' + origin, wp, 'php'], php)
)
const identityResponse = await fetch(origin + '/wp-admin/admin-ajax.php?action=claude_cowork', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token, action: 'content.identity', params: {} })
})
if ((await identityResponse.json()).ok !== true) throw new Error('Fixture Content API identity setup failed')
const conf = { name, network, db, wp, folder, token, origin, ...info }
writeFileSync(configPath, JSON.stringify(conf), { mode: 0o600 })
console.log(JSON.stringify({ ...info, name, origin }))
