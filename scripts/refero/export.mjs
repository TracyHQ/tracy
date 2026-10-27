import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'

// Run only the captured pure export section; never initialize the site's UI or network code.
const [resultFile, outputDir, chunkFile] = process.argv.slice(2)
const source = readFileSync(chunkFile, 'utf8')
const start = source.indexOf('function nv(')
const end = source.lastIndexOf('}]);')
if (start < 0 || end <= start) throw new Error('Captured Refero exporter layout changed')
const exports = {}
const context = vm.createContext({
  e: {
    s(pairs) {
      for (let index = 0; index < pairs.length; index += 3) {
        exports[pairs[index]] = pairs[index + 2]
      }
    }
  }
})
vm.runInContext(source.slice(start, end), context, { timeout: 3000 })
const result = JSON.parse(readFileSync(resultFile, 'utf8'))
const formats = {
  'DESIGN.md': 'generateDesignMd',
  'tokens.css': 'generateCssVariables',
  'tailwind-v4.css': 'generateTailwindConfig',
  'design-tokens.json': 'generateTokensJson'
}
for (const variant of ['extended', 'compact']) {
  const directory = variant === 'extended' ? outputDir : path.join(outputDir, 'exports', variant)
  mkdirSync(directory, { recursive: true })
  for (const [filename, generator] of Object.entries(formats)) {
    if (typeof exports[generator] !== 'function') throw new Error(`Missing export: ${generator}`)
    context.input = result
    context.variant = variant
    context.generator = exports[generator]
    const value = vm.runInContext('generator(input, variant)', context, { timeout: 3000 })
    if (typeof value !== 'string' || value.length === 0) throw new Error(`Empty export: ${filename}`)
    if (filename.endsWith('.json')) JSON.parse(value)
    writeFileSync(path.join(directory, filename), value)
  }
}
