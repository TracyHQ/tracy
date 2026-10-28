// REG-PR-57: the public Templates header lists Download app beside Get Started, in the bar and in the phone menu.
import assert from 'node:assert/strict'
import { header } from '../../../apps/tracy-web/src/public/templates-chrome-html.js'
import { WORDS } from '../../../apps/tracy-web/src/public/templates-words.js'

const nav = header('https://app.example', WORDS).replace(/<svg[\s\S]*?<\/svg>/g, '')
const links = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
  .map((m) => [m[1], m[2]])
  .filter(([, t]) => t)
assert.deepEqual(links, [
  ['/templates/', 'Free Templates'],
  ['https://tracy.ai/help/', 'Help Center'],
  ['https://tracy.ai/download/', 'Download app'],
  ['https://app.example/', 'Get Started'],
  ['https://tracy.ai/download/', 'Download app'],
  ['https://app.example/', 'Get Started']
])
assert.match(nav, /class="btn btn-ghost btn-sm nav-dl-drop"/)
assert.match(nav, /class="btn btn-ghost btn-sm nav-dl"/)
console.log('PASS: Download app sits before Get Started in the phone menu and in the bar')
