/**
 * Turn @tracy/ui's two CSS files into the token map dsh's theme service accepts.
 *
 * tokens.css declares every shadcn token as `var(<dsh alias>, <fallback>)` so components work
 * inside and outside dsh. dsh-bridge.css is the table saying which dsh alias each Tracy token
 * feeds. Handing dsh the fallbacks as LITERALS is the whole point: a `var()` on both sides is a
 * custom-property cycle, and CSS computes every variable in a cycle to nothing.
 */

/** Split one `{ ... }` body into `[name, value]` pairs of custom properties. */
function declarations(body) {
  const out = new Map()
  for (const raw of body.split(';')) {
    const line = raw.trim()
    const m = /^(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(line)
    if (m) out.set(m[1], m[2].trim())
  }
  return out
}

/** Strip CSS comments so a `;` or `{` inside prose cannot split a block. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** `var(--x, fallback)` → `fallback`; anything else → itself. */
export function fallbackOf(value) {
  const m = /^var\(\s*--[\w-]+\s*,\s*([\s\S]+)\)$/.exec(value.trim())
  return m ? m[1].trim() : value.trim()
}

/**
 * Read the light block (`:root, body`) and the dark block (`[data-ds-dark-theme], ...`) of
 * tokens.css. Returns maps of token → literal value (fallbacks resolved).
 */
export function parseTokenBlocks(css) {
  const clean = stripComments(css)
  const blocks = [...clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]])
  const find = (test) => blocks.find(([selector]) => test(selector))
  const lightBlock = find((s) => /^:root\s*,\s*body$/.test(s))
  const darkBlock = find((s) => s.startsWith('[data-ds-dark-theme]'))
  if (!lightBlock) throw new Error('tokens.css: no `:root, body` block')
  if (!darkBlock) throw new Error('tokens.css: no `[data-ds-dark-theme]` block')
  const resolve = (map) => new Map([...map].map(([k, v]) => [k, fallbackOf(v)]))
  return { light: resolve(declarations(lightBlock[1])), dark: resolve(declarations(darkBlock[1])) }
}

/** Read the bridge: dsh token → Tracy token it takes its value from. */
export function parseBridge(css) {
  const out = new Map()
  for (const [, body] of stripComments(css).matchAll(/\{([^{}]*)\}/g)) {
    for (const [name, value] of declarations(body)) {
      const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value)
      if (!m) throw new Error(`dsh-bridge.css: ${name} must be \`var(--tracy-token)\`, got \`${value}\``)
      out.set(name, m[1])
    }
  }
  return out
}

/**
 * The palette: dsh token → `{ light, dark }` literals. Dark falls back to light for tokens
 * tokens.css does not restate in its dark block (brand, ring, success, radius).
 */
export function generatePalette(tokensCss, bridgeCss) {
  const { light, dark } = parseTokenBlocks(tokensCss)
  const palette = {}
  for (const [alias, token] of parseBridge(bridgeCss)) {
    const lightValue = light.get(token)
    if (lightValue === undefined)
      throw new Error(`dsh-bridge.css: ${alias} reads ${token}, which tokens.css does not declare`)
    const darkValue = dark.get(token) ?? lightValue
    for (const v of [lightValue, darkValue]) {
      if (v.includes('var(')) throw new Error(`${alias}: value still references a variable: ${v}`)
    }
    palette[alias] = { light: lightValue, dark: darkValue }
  }
  return palette
}
