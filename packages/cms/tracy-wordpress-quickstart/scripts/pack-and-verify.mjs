#!/usr/bin/env node
// Pack the changed stand with the vendored method's own tools and prove the pack: pack.mjs →
// restore.mjs onto a second, clean stand → verify-parity.mjs between the two. All three are used,
// not modified. Nothing is uploaded; release.mjs is not run — publishing is a separate order.
//
// Routes compared: every language's home and its copies of the About, Services, News, Contact and
// Sitemap pages — the four pages the 1.1.0 parity walked, plus the two our changes touch.
//
// Usage: node pack-and-verify.mjs --stand <dir> --verify <dir outside the repo> --version <x.y.z>
//        [--project tracy-business-wp7-stand --port 8291]
//        [--verify-project tracy-business-wp7-verify --verify-port 8292] [--skip-styles]
// Needs: docker; `npm install` in the vendored skill (Playwright) unless --skip-styles.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { compose, methodParityArgs, restorePack, runnerFor, standEnv, wp } from './stand.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '../../../..')
const METHOD = path.join(
  REPO_ROOT,
  'vendor/wordpress/tracy-wordpress-theme/skills/tracy-wordpress-theme/scripts/quickstart'
)

const { values: o } = parseArgs({
  options: {
    stand: { type: 'string' },
    verify: { type: 'string' },
    version: { type: 'string' },
    release: { type: 'string', default: 'tracy-business/wp7' },
    project: { type: 'string', default: 'tracy-business-wp7-stand' },
    port: { type: 'string', default: '8291' },
    'verify-project': { type: 'string', default: 'tracy-business-wp7-verify' },
    'verify-port': { type: 'string', default: '8292' },
    'skip-styles': { type: 'boolean', default: false }
  }
})
if (!o.stand || !o.verify) throw new Error('--stand <dir> and --verify <dir> are required')
// No default: a default labels the pack with a version the stand may not hold.
if (!o.version) throw new Error('--version <x.y.z> is required: the version this pack is')
const stand = path.resolve(o.stand)
const verify = path.resolve(o.verify)
for (const dir of [stand, verify])
  if (dir.startsWith(REPO_ROOT + path.sep)) throw new Error(`${dir} must be outside the repo`)

const run = (script, args, env = process.env) => {
  const r = spawnSync(process.execPath, [path.join(METHOD, script), ...args], { stdio: 'inherit', env })
  if (r.status !== 0) throw new Error(`${script} failed (exit ${r.status})`)
}
const envA = standEnv({ stand, port: o.port })
// The verify stand serves the restore volume itself, as the fleet serves what it extracted: the
// method's access probe writes into the webroot as root and reads it back over HTTP.
const envB = standEnv({ stand: verify, port: o['verify-port'], served: 'restore' })
const siteA = `http://127.0.0.1:${o.port}`
const siteB = `http://127.0.0.1:${o['verify-port']}`
const out = path.join(stand, 'cut', o.version)
mkdirSync(out, { recursive: true })

// 1. Pack the changed stand. A stand made by a restore carries the WP_HOME / WP_SITEURL defines
// the method's restore.mjs wrote for its own address; a build stand has none, and pack.mjs keeps
// them, so its secret scan refuses the stand address in wp-config.php. They go first — the
// database's siteurl and home options hold the same address, so the stand keeps serving.
const config = path.join(stand, 'webroot', 'wp-config.php')
writeFileSync(
  config,
  readFileSync(config, 'utf8').replace(
    new RegExp(`^define\\('WP_(?:HOME|SITEURL)', '${siteA.replace(/[.]/g, '\\.')}'\\);\\r?\\n`, 'gm'),
    ''
  )
)
run(
  'pack.mjs',
  [
    '--webroot',
    path.join(stand, 'webroot'),
    '--wp',
    runnerFor(o.project),
    '--site-url',
    siteA,
    '--out',
    out,
    '--id',
    o.release,
    '--version',
    o.version
  ],
  envA
)

// 2. Restore the pack on a clean stand.
mkdirSync(path.join(verify, 'webroot'), { recursive: true })
const restoreReport = path.join(out, 'restore.json')
compose(o['verify-project'], envB, ['up', '-d', '--wait', 'db'])
// removed, not stopped: a stopped container still holds the volume restorePack recreates
compose(o['verify-project'], envB, ['rm', '-sf', 'web'])
restorePack({ project: o['verify-project'], env: envB, pack: out, siteUrl: siteB, report: restoreReport })
compose(o['verify-project'], envB, ['up', '-d', 'web'])

// 3. Parity between the changed stand and the restore.
const routes = wp(o.project, envA, [
  'eval',
  `$paths = array();
   if ( function_exists( 'pll_languages_list' ) ) {
     foreach ( pll_languages_list( array( 'fields' => 'slug' ) ) as $lang ) {
       $paths[] = wp_make_link_relative( pll_home_url( $lang ) );
       foreach ( array( 'about', 'services', 'news', 'contact', 'sitemap' ) as $slug ) {
         $page = get_page_by_path( $slug );
         $id   = $page ? pll_get_post( $page->ID, $lang ) : 0;
         if ( $id && 'publish' === get_post_status( $id ) ) $paths[] = wp_make_link_relative( get_permalink( $id ) );
       }
     }
   } else {
     // A single-language quickstart (Tracy Base, the JA ports) has no Polylang: the home and every
     // published page are the routes.
     $paths[] = '/';
     foreach ( get_pages( array( 'post_status' => 'publish' ) ) as $page ) $paths[] = wp_make_link_relative( get_permalink( $page ) );
   }
   echo wp_json_encode( array_values( array_unique( $paths ) ) );`
])
const routesFile = path.join(out, 'routes.json')
writeFileSync(routesFile, routes)
run(
  'verify-parity.mjs',
  methodParityArgs({
    a: { project: o.project, env: envA, siteUrl: siteA },
    b: { project: o['verify-project'], env: envB, siteUrl: siteB },
    routes: routesFile,
    pack: out,
    restoreReport,
    report: path.join(out, 'parity.json'),
    skipStyles: o['skip-styles']
  })
)
console.log(
  `packed ${o.release} ${o.version} → ${out}; restored on ${siteB}; parity in ${path.join(out, 'parity.json')}`
)
