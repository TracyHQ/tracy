// node perf/probe.mjs <url> <width> '<selector>' ... : rect + a few computed styles of the first match of each selector
import { chromium } from 'playwright'
const [, , url, width, ...sels] = process.argv
const PROPS = [
  'display',
  'position',
  'color',
  'backgroundColor',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textTransform',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'marginTop',
  'marginBottom',
  'borderTopWidth',
  'borderBottomWidth',
  'borderTopColor',
  'borderBottomColor',
  'borderRadius',
  'opacity',
  'gap',
  'textAlign',
  'maxWidth',
  'objectFit'
]
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: +width, height: 900 } })
await p.goto(url, { waitUntil: 'load' })
await p.waitForTimeout(1200)
for (const s of sels) {
  const r = await p.evaluate(
    ([s, PROPS]) => {
      const e = document.querySelector(s)
      if (!e) return null
      const c = getComputedStyle(e),
        r = e.getBoundingClientRect(),
        o = {
          x: Math.round(r.x),
          y: Math.round(r.y + scrollY),
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10
        }
      const d = {
        display: 'block',
        position: 'static',
        opacity: '1',
        textTransform: 'none',
        letterSpacing: 'normal',
        borderTopWidth: '0px',
        borderBottomWidth: '0px',
        borderRadius: '0px',
        marginTop: '0px',
        marginBottom: '0px',
        paddingTop: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px',
        paddingRight: '0px',
        maxWidth: 'none',
        gap: 'normal',
        objectFit: 'fill'
      }
      for (const k of PROPS) {
        const v = c[k]
        if (v !== d[k] && v !== 'rgba(0, 0, 0, 0)') o[k] = v
      }
      return o
    },
    [s, PROPS]
  )
  console.log(s, JSON.stringify(r))
}
await b.close()
