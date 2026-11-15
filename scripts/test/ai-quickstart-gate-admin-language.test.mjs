// A plugin's site strings may live under `administrator/language/` (Joomla's page navigation plugin keeps its aria
// label there), so the resolver reads those files too (ticket #587 triage of run 4, g005). An invented archive: the
// page navigation label "Page Navigation" resolves to its own key, owned by the plugin, not to a core string that
// shares a word.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { filesOf, ownerOf, sourceResolver } from '../ai-quickstart/gate/sources.mjs'

test('g005: a plugin string under administrator/language is read, resolved and owned by the plugin', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gate-admin-lang-'))
  try {
    const put = (rel, text) => {
      mkdirSync(path.join(dir, 'tree', path.dirname(rel)), { recursive: true })
      writeFileSync(path.join(dir, 'tree', rel), text)
    }
    put('language/en-GB/joomla.ini', 'JLIB_HTML_PAGE_CURRENT="Page %s"\nJNEXT="Navigation"\n')
    put(
      'administrator/language/en-GB/plg_content_pagenavigation.ini',
      'PLG_PAGENAVIGATION_ARIA_LABEL="Page Navigation"\n'
    )
    // An administrator screen string is no source of a page's words.
    put('administrator/language/en-GB/com_content.ini', 'COM_CONTENT_SAVE_SUCCESS="Article saved."\n')
    const zip = path.join(dir, 'blank.zip')
    execFileSync('zip', ['-qr', zip, '.'], { cwd: path.join(dir, 'tree') })
    const archive = filesOf(zip)
    assert.ok(archive.files.has('administrator/language/en-GB/plg_content_pagenavigation.ini'))
    const s = sourceResolver(archive, { site: 'http://bakery.example' }).text('Page Navigation')
    assert.equal(s.class, 'language')
    assert.equal(s.key, 'PLG_PAGENAVIGATION_ARIA_LABEL')
    assert.notEqual(sourceResolver(archive, {}).text('Article saved.').class, 'language')
    assert.deepEqual(ownerOf('administrator/language/en-GB/plg_content_pagenavigation.ini'), {
      owner: 'extension',
      extension: 'plg_content_pagenavigation'
    })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
