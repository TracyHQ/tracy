/**
 * A Joomla Claude Cowork package of the release's own shape, small: `pkg_claudecowork.xml`, its
 * `script.php`, `packages/com_claudecowork.zip` (the engine, the plugin-wide JSON beside it, and
 * `administrator/lib/contracts/<slug>/j6/<version>/…`) and a plugin. Each contract is laid out as a
 * release's: a `manifest.json` naming its Joomla template and the contract its quickstart names, and
 * a `presentation-lock.json` whose `files` are path → sha256, padded with incompressible bytes.
 * Built and read with Python's `zipfile`, a zip writer that is not the code under test.
 */
import { execFileSync } from 'node:child_process'

const BUILD = `
import io, os, sys, zipfile
import base64, json
contract = int(sys.argv[1])
contracts = json.loads(sys.argv[2])
component = io.BytesIO()
with zipfile.ZipFile(component, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('claudecowork.xml', '<extension type="component"><files><folder>lib</folder></files></extension>')
    z.writestr('administrator/lib/Engine.php', '<?php // engine\\n' * 200)
    z.writestr('administrator/lib/language-packs.json', '{"packs": []}')
    z.writestr('administrator/lib/link-layouts.json', '{}')
    for c in contracts:
        cid = f"{c['slug']}/j6/{c['version']}"
        base = f'administrator/lib/contracts/{cid}/'
        quickstart = {'contract': c.get('names', cid)}
        z.writestr(base + 'manifest.json', json.dumps({'id': cid, 'template': c['slug'].replace('-', '_'), 'quickstart': quickstart}))
        pad = base64.b64encode(os.urandom(contract // 2)).decode()
        z.writestr(base + 'presentation-lock.json', json.dumps({'files': c.get('files', {}), 'pad': pad}))
    z.writestr('site/src/Controller/ApiController.php', '<?php // api')
plugin = io.BytesIO()
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('claudecoworkapi.php', '<?php // plugin')
out = io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('pkg_claudecowork.xml', '<extension type="package"></extension>')
    z.writestr('script.php', '<?php // script')
    z.writestr('packages/com_claudecowork.zip', component.getvalue())
    z.writestr('packages/plg_system_claudecoworkapi.zip', plugin.getvalue())
sys.stdout.buffer.write(out.getvalue())
`

const LIST = `
import io, sys, zipfile
outer = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert outer.testzip() is None
name = sys.argv[1]
z = zipfile.ZipFile(io.BytesIO(outer.read(name))) if name else outer
assert z.testzip() is None
print('\\n'.join(z.namelist()))
`

/** The release's two contracts unless a test names others: `{ slug, version, files?, names? }`. */
export const TWO_CONTRACTS = [
  { slug: 'tracy-business', version: '1.2.6' },
  { slug: 'ja-resume', version: '1.0.6' }
]

/** The package's bytes, each contract's lock about `contractBytes / 2` once compressed. */
export function makePackage({ contractBytes = 1024 * 1024, contracts = TWO_CONTRACTS } = {}) {
  return execFileSync('python3', ['-c', BUILD, String(contractBytes), JSON.stringify(contracts)], {
    maxBuffer: 1 << 28
  })
}

/**
 * The entry names of `zip`, or of the archive `nested` inside it; both archives' CRCs are checked
 * (`testzip`), so a broken rewrite throws here.
 */
export function entriesOf(zip, nested = '') {
  return execFileSync('python3', ['-c', LIST, nested], { input: zip, encoding: 'utf8', maxBuffer: 1 << 28 })
    .split('\n')
    .filter(Boolean)
}

const BUILD_SLIM = `
import io, os, sys, zipfile
import base64, hashlib, json
contract = int(sys.argv[1])
contracts = json.loads(sys.argv[2])
assets = {}
index = {}
for c in contracts:
    cid = c.get('id', f"{c['slug']}/j6/{c['version']}")
    template = c['slug'].replace('-', '_')
    names = c.get('names', cid)
    asset = io.BytesIO()
    with zipfile.ZipFile(asset, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('manifest.json', json.dumps({'id': cid, 'template': template, 'quickstart': {'contract': names}}))
        pad = base64.b64encode(os.urandom(contract // 2)).decode()
        z.writestr('presentation-lock.json', json.dumps({'files': c.get('files', {}), 'pad': pad}))
        z.writestr('content-map.json', '{}')
        for k, v in c.get('extra', {}).items():
            z.writestr(k, v)
    data = asset.getvalue()
    name = c.get('asset', cid.replace('/', '--') + '.zip')
    assets[name] = base64.b64encode(data).decode()
    row = {'asset': name, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'template': template}
    if names != cid:
        row['names'] = names
    index[cid] = row
component = io.BytesIO()
with zipfile.ZipFile(component, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('claudecowork.xml', '<extension type="component"><files><folder>lib</folder></files></extension>')
    z.writestr('administrator/lib/Engine.php', '<?php // engine\\n' * 200)
    z.writestr('administrator/lib/language-packs.json', '{"packs": []}')
    z.writestr('administrator/lib/contracts.json', json.dumps({'contracts': index}))
    z.writestr('site/src/Controller/ApiController.php', '<?php // api')
plugin = io.BytesIO()
with zipfile.ZipFile(plugin, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('claudecoworkapi.php', '<?php // plugin')
out = io.BytesIO()
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('pkg_claudecowork.xml', '<extension type="package"></extension>')
    z.writestr('script.php', '<?php // script')
    z.writestr('packages/com_claudecowork.zip', component.getvalue())
    z.writestr('packages/plg_system_claudecoworkapi.zip', plugin.getvalue())
print(json.dumps({'pkg': base64.b64encode(out.getvalue()).decode(), 'assets': assets}))
`

/**
 * A SLIM Joomla Claude Cowork package (the release shape after 0.24.53): its component holds
 * `administrator/lib/contracts.json` and no contract folder, and each contract is its own asset,
 * `<id with "/" → "--">.zip` with `manifest.json`, `presentation-lock.json` and `content-map.json`
 * at its root. A contract may override its `id` and `asset` name and add `extra` entries (name →
 * text) to its asset, to build a hostile index. Returns `{ pkg, assets }`, `assets` file name → bytes.
 */
export function makeSlimPackage({ contractBytes = 64 * 1024, contracts = TWO_CONTRACTS } = {}) {
  const out = JSON.parse(
    execFileSync('python3', ['-c', BUILD_SLIM, String(contractBytes), JSON.stringify(contracts)], {
      encoding: 'utf8',
      maxBuffer: 1 << 28
    })
  )
  return {
    pkg: Buffer.from(out.pkg, 'base64'),
    assets: Object.fromEntries(Object.entries(out.assets).map(([k, v]) => [k, Buffer.from(v, 'base64')]))
  }
}

const READ = `
import io, sys, zipfile
outer = zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
z = zipfile.ZipFile(io.BytesIO(outer.read(sys.argv[1])))
sys.stdout.buffer.write(z.read(sys.argv[2]))
`

/** The bytes of `member` in the archive `nested` inside `zip`, read by Python's `zipfile`. */
export function memberOf(zip, nested, member) {
  return execFileSync('python3', ['-c', READ, nested, member], { input: zip, maxBuffer: 1 << 28 })
}
