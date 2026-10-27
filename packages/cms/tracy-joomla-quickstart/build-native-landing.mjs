import { applyStudioHomeCopy } from './studio-home-copy.mjs'
/** Project every content section of the full OpenDesign landing into editable Joomla modules. */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseHTML } from 'linkedom'
import { buildBrandSystem, renderArtifact } from '../../../vendor/tracy/od-brand-engine/dist/index.js'
import {
  brandFromSystem,
  seedOverridesFromSystem
} from '../../design/tracy-design-inspiration/src/host/library-brand.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const [id = 'apple', output] = process.argv.slice(2)
if (!output) throw new Error('Usage: node build-native-landing.mjs <inspiration> <output>')
const library = path.join(root, 'vendor/tracy/od-design-system')
const catalog = JSON.parse(await readFile(path.join(library, 'catalog.json'), 'utf8'))
const row = catalog.systems.find((item) => item.id === id)
if (!row) throw new Error(`Unknown inspiration: ${id}`)
const tokensCss = await readFile(path.join(library, 'systems', id, 'tokens.css'), 'utf8')
const designMd = await readFile(path.join(library, 'systems', id, 'DESIGN.md'), 'utf8')
const brand = brandFromSystem({ id, name: row.name, category: row.category, tokensCss, designMd })
const system = buildBrandSystem(brand, { slug: id, seed: seedOverridesFromSystem({ tokensCss }) })
const original = renderArtifact('landing', brand, system.themes.default)
const { document } = parseHTML(original)
const dark = parseHTML(renderArtifact('landing', brand, system.themes.dark)).document
const main = document.querySelector('main')
const sections = [
  ...main.children,
  ...[...document.body.children].filter((node) => node.tagName === 'SECTION')
]
const kinds = [
  'hero',
  'social-proof',
  'problem',
  'value',
  'how',
  'inline-cta',
  'features',
  'statistics',
  'testimonials',
  'faq',
  'pricing',
  'final-cta'
]
if (sections.length !== kinds.length || sections.some((node) => node.tagName !== 'SECTION')) {
  throw new Error('OpenDesign landing structure changed. Reconcile every section before exporting.')
}
const normalize = (text) => text.replace(/\s+/g, ' ').trim()
const blocks = sections.map((section, index) => {
  const kind = kinds[index]
  const svgCount = section.querySelectorAll('svg').length
  section.dataset.odBlock = kind
  // Preserve native in-page navigation; remaining calls to action lead to the real contact page.
  for (const button of section.querySelectorAll('button, a[role=button]')) {
    const anchor = document.createElement('a')
    for (const { name, value } of button.attributes)
      if (name !== 'type' && name !== 'role') anchor.setAttribute(name, value)
    anchor.innerHTML = button.innerHTML
    const label = normalize(button.textContent)
    anchor.setAttribute(
      'href',
      label === 'See how it works' ? '#how' : label === 'Learn more' ? '/services' : '/resources/contact'
    )
    button.replaceWith(anchor)
  }
  for (const link of section.querySelectorAll('a[href="#"]')) link.setAttribute('href', '/resources/contact')
  // Keep the source's illustrative numbers and stories visibly identified as demo content.
  if (['social-proof', 'statistics', 'testimonials', 'pricing'].includes(kind)) {
    const note = document.createElement('p')
    note.className = 'od-demo-note'
    note.textContent = 'Design demo · figures, plans and client stories are illustrative.'
    section.append(note)
  }
  applyStudioHomeCopy(section, kind)
  return {
    kind,
    title: `Landing · ${kind.replaceAll('-', ' ')}`,
    sourceHeadings: [...section.querySelectorAll('h1,h2,h3')].map((node) => normalize(node.textContent)),
    svgCount,
    html: section.outerHTML
  }
})

// Native CSS nesting scopes the complete source stylesheet, including media queries, to these modules.
// The document-level root/body rules become the module wrapper, never the Joomla document itself.
const sourceCss = document.querySelector('style').textContent
const scoped = sourceCss
  .replaceAll(':root', '&')
  .replace(/html, body\s*\{/g, '& {')
  .replace(/\bbody\s*\{/g, '& {')
const darkVars = dark.querySelector('style').textContent.match(/:root\s*\{([^}]+)\}/)?.[1]
if (!darkVars) throw new Error('Dark token block is missing.')
const css = `/* Generated from the full OpenDesign landing; all rules are local to native modules. */
.tracy-native-landing.tracy-native-landing {
${scoped}
  & { width:100%; }
  a { cursor:pointer; }
  .od-demo-note { font-size:12px;line-height:1.5;opacity:.7;text-align:center;padding:20px 16px 0;margin:0; }
  [data-od-block=statistics] .od-demo-note { color:var(--brand-color-primary-contrast); }
  section[id] { scroll-margin-top:96px; }
}
html.t4-dark .tracy-native-landing, html[data-theme=dark] .tracy-native-landing {${darkVars}}
.t4-section.od-landing-row, .od-landing-row>.t4-section-inner, .od-landing-row .t4-row, .od-landing-row .t4-col, .od-landing-row .moduletable { padding:0;margin:0;max-width:none;width:100%; }
`
await mkdir(output, { recursive: true })
const siteTokens = await readFile(new URL('./native-site-tokens.css', import.meta.url), 'utf8')
await writeFile(path.join(output, 'native-landing.css'), css + '\n' + siteTokens)
await writeFile(path.join(output, 'source.html'), original)
await writeFile(
  path.join(output, 'blocks.json'),
  JSON.stringify(
    {
      inspiration: id,
      sourceSha256: createHash('sha256').update(original).digest('hex'),
      shell: 'Joomla T4 header and footer',
      blocks
    },
    null,
    2
  ) + '\n'
)
console.log(
  `Exported all ${blocks.length} native blocks; ${blocks.reduce((sum, block) => sum + block.svgCount, 0)} source SVGs preserved.`
)
