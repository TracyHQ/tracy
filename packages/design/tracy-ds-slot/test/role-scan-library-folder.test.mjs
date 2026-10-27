// A third-party library carried in its own folder (JA Vital/Tour ship js/html5lightbox/ with pdf.js inside) is
// not the template's design: its files are skipped, and its viewer's dark body (#404040) never becomes the
// template's light page ground (batch 2, 16/10/2026: every #fff ground of JA Vital was sorted as the ink band).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scanTemplate } from '../src/role-scan/index.mjs'
import { writeFixture } from './role-scan-fixtures.mjs'

const T = {
  'templateDetails.xml':
    '<extension type="template"><name>ja_fixture</name><version>1.0.0</version></extension>\n',
  'css/template.css': 'body{color:#333;background-color:#fff}\n.card{background-color:#fff;color:#333}\n',
  'js/html5lightbox/html5lightbox.js': 'var a = { color: "#fff" };\n',
  'js/html5lightbox/pdfjs/web/viewer.css': 'body{background-color:#404040}\n.toolbar{color:#d9d9d9}\n'
}

test('a library folder is skipped and its body never sets the page ground', () => {
  const s = scanTemplate(writeFixture(T))
  assert.deepEqual(s.files, ['css/template.css'])
  const why = Object.fromEntries(s.skipped.map((x) => [x.file, x.reason]))
  assert.match(why['js/html5lightbox/pdfjs/web/viewer.css'], /third-party/)
  assert.match(why['js/html5lightbox/html5lightbox.js'], /third-party/)
  assert.equal(s.grounds.light, '#ffffff')
})
