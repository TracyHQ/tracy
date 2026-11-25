// mega-hover.mjs must scroll a trigger into view before it moves the pointer to it: boundingBox() is in viewport coordinates, so a
// trigger below the first screen (an accordion or a tab strip lower on the page) used to get a click at y > viewport height, which hits
// nothing, and the state was reported "never opened" (JA Nova, 2026-11-25). The widget below sits 2400px down the page, with content after it.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, it } from 'node:test'

const execFileP = promisify(execFile)
const TOOLS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../tools')
const CONFIG = {
  qa: { theme: { selector: 'html', attribute: 'data-theme', values: { light: null, dark: 'dark' }, storageKey: 'fold-theme' } }
}
const PAGE = (spacer) => `<!doctype html><html lang="en"><body style="margin:0">
<div style="height:${spacer}px"></div>
<button id="trigger" type="button" aria-expanded="false">Open</button>
<div id="panel" hidden><a id="link" href="/next">Next</a></div>
<div style="height:1200px"></div>
<script>
  const t = document.getElementById('trigger'), p = document.getElementById('panel')
  const close = () => { p.hidden = true; t.setAttribute('aria-expanded', 'false') }
  t.addEventListener('click', () => { p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)) })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !p.hidden) { close(); t.focus() } })
  document.addEventListener('click', (e) => { if (!p.contains(e.target) && e.target !== t) close() })
</script></body></html>`

function serve(spacer) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      r.end(new URL(req.url, 'http://x').pathname === '/next' ? '<!doctype html><html lang="en"><body>next</body></html>' : PAGE(spacer))
    })
    srv.listen(0, '127.0.0.1', () =>
      res({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })
    )
  })
}
async function run(tool, args, cwd) {
  try {
    const r = await execFileP(process.execPath, [path.join(TOOLS, tool), ...args], { cwd, maxBuffer: 64 * 1024 * 1024 })
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

describe('mega-hover — a click widget below the first screen', () => {
  for (const [name, spacer] of [['on the first screen', 0], ['2400px down the page', 2400]]) {
    it(`opens, navigates, closes on Escape and returns focus: ${name}`, { timeout: 120000 }, async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'fold-'))
      writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
      const site = await serve(spacer)
      try {
        const r = await run(
          'mega-hover.mjs',
          [`${site.origin}/`, '--trigger', '#trigger', '--panel', '#panel', '--link', '#link', '--open', 'click'],
          root
        )
        assert.equal(r.code, 0, r.out)
        assert.match(r.out, /"opens":true/)
      } finally {
        await site.close()
      }
    })
  }
})
