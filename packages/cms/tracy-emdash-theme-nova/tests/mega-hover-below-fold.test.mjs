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
  qa: {
    theme: {
      selector: 'html',
      attribute: 'data-theme',
      values: { light: null, dark: 'dark' },
      storageKey: 'fold-theme'
    }
  }
}
const PAGE = (spacer, outside = true, tall = false) => `<!doctype html><html lang="en"><body style="margin:0">
<div style="height:${spacer}px"></div>
<button id="trigger" type="button" aria-expanded="false">Open</button>
<div id="panel" hidden>${tall ? '<div style="height:1400px"></div>' : ''}<a id="link" href="/next">Next</a></div>
<div style="height:1200px"></div>
<script>
  const t = document.getElementById('trigger'), p = document.getElementById('panel')
  const close = () => { p.hidden = true; t.setAttribute('aria-expanded', 'false') }
  t.addEventListener('click', () => { p.hidden = !p.hidden; t.setAttribute('aria-expanded', String(!p.hidden)) })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !p.hidden) { close(); t.focus() } })
  ${outside ? "document.addEventListener('click', (e) => { if (!p.contains(e.target) && e.target !== t) close() })" : ''}
</script></body></html>`

function serve(spacer, outside = true, tall = false) {
  return new Promise((res) => {
    const srv = http.createServer((req, r) => {
      r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      r.end(
        new URL(req.url, 'http://x').pathname === '/next'
          ? '<!doctype html><html lang="en"><body>next</body></html>'
          : PAGE(spacer, outside, tall)
      )
    })
    srv.listen(0, '127.0.0.1', () =>
      res({ origin: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise((r) => srv.close(r)) })
    )
  })
}
async function run(tool, args, cwd) {
  try {
    const r = await execFileP(process.execPath, [path.join(TOOLS, tool), ...args], {
      cwd,
      maxBuffer: 64 * 1024 * 1024
    })
    return { code: 0, out: r.stdout + r.stderr }
  } catch (e) {
    return { code: e.code, out: (e.stdout ?? '') + (e.stderr ?? '') }
  }
}

describe('mega-hover — a click widget below the first screen', () => {
  for (const [name, spacer] of [
    ['on the first screen', 0],
    ['2400px down the page', 2400]
  ]) {
    it(`opens, navigates, closes on Escape and returns focus: ${name}`, { timeout: 120000 }, async () => {
      const root = mkdtempSync(path.join(tmpdir(), 'fold-'))
      writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
      const site = await serve(spacer)
      try {
        const r = await run(
          'mega-hover.mjs',
          [
            `${site.origin}/`,
            '--trigger',
            '#trigger',
            '--panel',
            '#panel',
            '--link',
            '#link',
            '--open',
            'click'
          ],
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

describe('mega-hover — a disclosure (accordion, tab) that stays open on an outside click', () => {
  it('fails as a popup panel, passes with `--persistent` (and the contract field `persistent`)', {
    timeout: 120000
  }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'persist-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    const site = await serve(0, false)
    const args = [
      `${site.origin}/`,
      '--trigger',
      '#trigger',
      '--panel',
      '#panel',
      '--link',
      '#link',
      '--open',
      'click'
    ]
    try {
      let r = await run('mega-hover.mjs', args, root)
      assert.equal(r.code, 1, r.out)
      r = await run('mega-hover.mjs', [...args, '--persistent'], root)
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /"outsideClickKeepsOpen":true/)
    } finally {
      await site.close()
    }
  })
})

describe('mega-hover — a panel so tall that its link is below the first screen', () => {
  it('scrolls the link into view and the click navigates', { timeout: 120000 }, async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'tall-'))
    writeFileSync(path.join(root, 'template.config.json'), JSON.stringify(CONFIG))
    const site = await serve(0, false, true)
    try {
      const r = await run(
        'mega-hover.mjs',
        [
          `${site.origin}/`,
          '--trigger',
          '#trigger',
          '--panel',
          '#panel',
          '--link',
          '#link',
          '--open',
          'click',
          '--persistent'
        ],
        root
      )
      assert.equal(r.code, 0, r.out)
      assert.match(r.out, /"clickNavigates":true/)
    } finally {
      await site.close()
    }
  })
})
