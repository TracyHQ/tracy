import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildApp } from '../src/app.js'
import { readConfig } from '../src/config.js'
import { memoryIdentityStore } from '../src/identity/store.js'

/**
 * Regression test for the empty red alert banner on `/login`
 * (`.superpowers/sdd/2026-09-09-tracy-web-04-bar-ops-public/chrome-acceptance.md`, defect #3):
 * the markup carries a `hidden` attribute on the error block, but `.auth-card .alert{display:
 * flex}` in `lib/page-shell.js` has higher specificity (0-2-0) than the UA's own
 * `[hidden]{display:none}` (0-1-0), so it wins on specificity alone and the empty banner renders
 * as a solid bar.
 *
 * A test that only checks `html.includes(' hidden')` would have passed against that bug — the
 * attribute WAS always there, that was never what broke. What actually decides whether the
 * banner is visible is the CSS cascade, so this file evaluates it: it parses the real `<style>`
 * block the server ships next to the real markup it ships, resolves CSS specificity/`!important`
 * by hand (no DOM/CSSOM available in this test runner), and asserts the *computed* `display` for
 * the actual `#email-error`/`#code-error` elements — not just the attribute on them.
 */

// ── a tiny CSS engine — just enough of the cascade to answer "what wins for `display`?" ────────

function stripAtRules(css) {
  let out = ''
  let i = 0
  while (i < css.length) {
    if (css[i] === '@') {
      const open = css.indexOf('{', i)
      if (open === -1) break
      let depth = 1
      let k = open + 1
      while (k < css.length && depth > 0) {
        if (css[k] === '{') depth++
        else if (css[k] === '}') depth--
        k++
      }
      i = k
      continue
    }
    out += css[i]
    i++
  }
  return out
}

function parseRules(css) {
  const body = stripAtRules(css)
  const rules = []
  let i = 0
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i++
    if (i >= body.length) break
    const open = body.indexOf('{', i)
    if (open === -1) break
    const close = body.indexOf('}', open)
    if (close === -1) break
    const selectorText = body.slice(i, open).trim()
    const declText = body.slice(open + 1, close)
    if (selectorText) {
      rules.push({
        selectors: selectorText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        declText,
        order: rules.length
      })
    }
    i = close + 1
  }
  return rules
}

function findDeclaration(declText, prop) {
  for (const raw of declText.split(';')) {
    const idx = raw.indexOf(':')
    if (idx === -1) continue
    const name = raw.slice(0, idx).trim()
    if (name !== prop) continue
    let value = raw.slice(idx + 1).trim()
    const important = /!\s*important\s*$/i.test(value)
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim()
    return { value, important }
  }
  return null
}

// specificity as [ids, classesAttrsPseudoClasses, typesAndPseudoElements]
function compoundSpecificity(compound) {
  let ids = 0
  let classes = 0
  let types = 0
  let rest = compound
  rest = rest.replace(/::[a-zA-Z-]+/g, () => {
    types++
    return ''
  })
  rest = rest.replace(/#[\w-]+/g, () => {
    ids++
    return ''
  })
  rest = rest.replace(/\.[\w-]+/g, () => {
    classes++
    return ''
  })
  rest = rest.replace(/\[[^\]]+\]/g, () => {
    classes++
    return ''
  })
  rest = rest.replace(/:[a-zA-Z-]+(\([^)]*\))?/g, () => {
    classes++
    return ''
  })
  if (/^[a-zA-Z][\w-]*/.test(rest) && rest.trim() !== '*') types++
  return [ids, classes, types]
}

function selectorSpecificity(selector) {
  return selectorParts(selector).reduce(
    (acc, part) => {
      const [a, b, cc] = compoundSpecificity(part.compound)
      return [acc[0] + a, acc[1] + b, acc[2] + cc]
    },
    [0, 0, 0]
  )
}

/** Splits a selector into compounds plus the combinator that joins each to the one on its LEFT.
 * `.a .b>span` → [{compound:'.a'}, {compound:'.b', combinator:' '}, {compound:'span',
 * combinator:'>'}]. Splitting on bare whitespace (what this file did until 10/09) reads
 * `.alert>span` as ONE compound, which silently mis-scores specificity and — worse — makes a
 * child combinator indistinguishable from a descendant one, the exact difference the badge rule
 * below turns on. */
function selectorParts(selector) {
  const tokens = selector
    .replace(/\s*>\s*/g, ' > ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const parts = []
  let combinator = null
  for (const token of tokens) {
    if (token === '>') {
      combinator = '>'
      continue
    }
    parts.push({ compound: token, combinator })
    combinator = ' '
  }
  return parts
}

function compareSpecificity(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

function matchesCompound(compound, el) {
  const tokenRe = /(\.[\w-]+)|(#[\w-]+)|(\[[^\]]+\])|(::?[a-zA-Z-]+(?:\([^)]*\))?)|([a-zA-Z][\w-]*)|(\*)/g
  let m
  let sawAny = false
  while ((m = tokenRe.exec(compound))) {
    sawAny = true
    const token = m[0]
    if (token.startsWith('.')) {
      if (!el.classes.has(token.slice(1))) return false
    } else if (token.startsWith('#')) {
      if (el.id !== token.slice(1)) return false
    } else if (token.startsWith('[')) {
      const name = token
        .slice(1, -1)
        .split(/[=~|^$*]/)[0]
        .trim()
        .toLowerCase()
      if (!el.attrs.has(name)) return false
    } else if (token === ':first-child') {
      // Modelled, unlike the pseudo-classes below, because the badge rule
      // (`.auth-card .alert>span:first-child`) is ONLY correct by virtue of it: both the badge
      // and the message are direct `span` children of the same `.alert`, so without
      // `:first-child` the two are indistinguishable and this engine would report the bug as
      // fixed while it was still there.
      if (!el.firstChild) return false
    } else if (token.startsWith(':')) {
      // Other pseudo-classes/elements are not modelled — none of the display-setting rules in
      // this stylesheet use them on a selector that also matches our target chain, so treating
      // them as always-matching does not change the outcome for the property under test.
      continue
    } else if (token === '*') {
      continue
    } else {
      if (el.tag !== token.toLowerCase()) return false
    }
  }
  return sawAny
}

// Right-to-left matching: the rightmost compound must match the element itself, then each
// compound to its left must match either SOME ancestor further up the chain (descendant
// combinator) or the IMMEDIATE parent (child combinator, `>`).
function matchesChain(selector, chain) {
  const parts = selectorParts(selector)
  let pi = parts.length - 1
  if (!matchesCompound(parts[pi].compound, chain[0])) return false
  let chainIdx = 1
  while (pi > 0) {
    const combinator = parts[pi].combinator
    pi--
    if (combinator === '>') {
      if (chainIdx >= chain.length) return false
      if (!matchesCompound(parts[pi].compound, chain[chainIdx])) return false
      chainIdx++
      continue
    }
    let matched = false
    while (chainIdx < chain.length) {
      if (matchesCompound(parts[pi].compound, chain[chainIdx])) {
        matched = true
        chainIdx++
        break
      }
      chainIdx++
    }
    if (!matched) return false
  }
  return true
}

/** Resolves the cascade for one CSS property on one element (given as an ancestor chain, target
 * first) against a parsed rule list — `!important` first, then specificity, then source order. */
function computeProperty(rules, chain, prop) {
  let winner = null
  for (const rule of rules) {
    const decl = findDeclaration(rule.declText, prop)
    if (!decl) continue
    for (const selector of rule.selectors) {
      if (!matchesChain(selector, chain)) continue
      const specificity = selectorSpecificity(selector)
      const candidate = { ...decl, specificity, order: rule.order }
      if (!winner) {
        winner = candidate
        continue
      }
      if (candidate.important !== winner.important) {
        if (candidate.important) winner = candidate
        continue
      }
      const cmp = compareSpecificity(candidate.specificity, winner.specificity)
      if (cmp > 0 || (cmp === 0 && candidate.order > winner.order)) winner = candidate
    }
  }
  return winner
}

// ── building a real ancestor chain from the real rendered HTML ──────────────────────────────

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

function parseAttrs(attrsText) {
  const classMatch = attrsText.match(/\bclass="([^"]*)"/)
  const classes = new Set(classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [])
  const idMatch = attrsText.match(/\bid="([^"]*)"/)
  const attrs = new Set()
  const attrRe = /([a-zA-Z_:][\w:-]*)(=("[^"]*"|'[^']*'|[^\s"'>]+))?/g
  let m
  while ((m = attrRe.exec(attrsText))) attrs.add(m[1].toLowerCase())
  return { classes, id: idMatch ? idMatch[1] : null, attrs }
}

/** Walks the real HTML with a small tag tokenizer and returns [target, parent, grandparent, ...]
 * for the first element the predicate accepts — the ancestor chain `computeProperty` needs, built
 * from the actual document instead of a hand-typed guess about its structure. `want(el, parent)`
 * so a caller can ask for something with no id of its own (the alert's badge span is one). */
function chainWhere(html, want) {
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^<>]*)?)(\/?)\s*>/g
  const stack = []
  let m
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith('<!--')) continue
    const [, closing, tagName, attrsText = '', selfClose] = m
    const tag = tagName.toLowerCase()
    if (closing) {
      for (let idx = stack.length - 1; idx >= 0; idx--) {
        if (stack[idx].tag === tag) {
          stack.length = idx
          break
        }
      }
      continue
    }
    const { classes, id, attrs } = parseAttrs(attrsText)
    // `firstChild` counts ELEMENT children only (what `:first-child` means) — text between two
    // spans does not reset it, which is why this is a counter on the parent rather than a look
    // at the raw bytes preceding the tag.
    const parent = stack[stack.length - 1]
    const el = { tag, classes, id, attrs, childCount: 0, firstChild: !parent || parent.childCount === 0 }
    if (parent) parent.childCount++
    const isVoid = VOID_TAGS.has(tag) || selfClose === '/'
    if (!isVoid) stack.push(el)
    if (want(el, parent))
      return isVoid ? [el, ...[...stack].reverse()] : [el, ...stack.slice(0, -1).reverse()]
  }
  return null
}

const ancestorChainOf = (html, targetId) => chainWhere(html, (el) => el.id === targetId)

function extractStyle(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/)
  assert.ok(m, 'expected a <style> block in the shared shell')
  return m[1]
}

// ── the actual test: real /login markup + real stylesheet, cascade resolved by hand ────────────

function harness() {
  const env = {
    TRACY_ORIGIN: 'http://tracy.test',
    SITE_DOMAIN: 'tracy.test',
    SESSION_SECRET: 's'.repeat(32),
    HOSTS: 'local',
    HOST_local_ORIGIN: 'http://host',
    HOST_local_DSH_ORIGIN: 'http://dsh',
    HOST_local_SECRET: 'h',
    SEAT_local_SECRET: 'k'
  }
  const mail = { send: async () => {} }
  return buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail,
    now: () => 1_700_000_000_000
  })
}

test('GET /login with no error: both alert banners compute to display:none, not just carry `hidden`', async () => {
  const app = harness()
  const res = await app.fetch(new Request('http://tracy.test/login'))
  assert.equal(res.status, 200)
  const html = await res.text()
  const rules = parseRules(extractStyle(html))

  for (const id of ['email-error', 'code-error']) {
    const chain = ancestorChainOf(html, id)
    assert.ok(chain, `expected an element with id="${id}"`)
    assert.ok(chain[0].attrs.has('hidden'), `#${id} should carry the hidden attribute when there is no error`)
    const winner = computeProperty(rules, chain, 'display')
    assert.ok(winner, `expected some rule to set display for #${id}`)
    assert.equal(
      winner.value,
      'none',
      `#${id} carries hidden, but the cascade still computes display:${winner.value} — ` +
        `.auth-card .alert{display:flex} (specificity 0-2-0) is outranking [hidden] unless it is !important`
    )
  }
})

test('POST /login with a bad email: the SAME error block, now carrying a real message, still computes to display:flex', async () => {
  const app = harness()
  const res = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ step: 'email', email: 'not-an-email' }).toString()
    })
  )
  assert.equal(res.status, 400)
  const html = await res.text()
  assert.match(html, /Enter a valid email address\./)
  const rules = parseRules(extractStyle(html))

  const chain = ancestorChainOf(html, 'email-error')
  assert.ok(chain, 'expected an element with id="email-error"')
  assert.ok(
    !chain[0].attrs.has('hidden'),
    'a real error must NOT carry hidden — the fix must not hide it too'
  )
  const winner = computeProperty(rules, chain, 'display')
  assert.equal(winner?.value, 'flex', 'a visible error must still render as the styled alert, not disappear')
})

// ── the second way an alert fails: it renders, and nobody can read it ──────────────────────────
//
// Chrome pass 2 (`chrome-pass2-identity.md`, defect #2) found the message text of a wrong-OTP
// error present in the DOM and in the accessibility tree, and invisible on screen: the badge rule
// was written `.auth-card .alert span`, a bare descendant selector, so it also matched the SECOND
// span — the one holding the message — and squashed it into a 14x14px circle of white text on a
// pale red ground. Both tests above would have passed against that: the block's computed
// `display` was `flex`, exactly as they assert.
//
// So these assert on the message span itself. They are written against the two declarations that
// did the damage (`width`, which clips it, and `color`, which erases the contrast) rather than
// against the selector text, because the selector is the thing allowed to change — what must not
// change is which element the badge's paint lands on.

test('POST /login with a bad email: the badge rule paints the badge and NOT the message text', async () => {
  const app = harness()
  const res = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ step: 'email', email: 'not-an-email' }).toString()
    })
  )
  assert.equal(res.status, 400)
  const html = await res.text()
  const rules = parseRules(extractStyle(html))

  // The message span: the alert's own text, which must inherit the alert's colour and be free to
  // take the width it needs.
  const messageChain = ancestorChainOf(html, 'email-error-text')
  assert.ok(messageChain, 'expected an element with id="email-error-text" carrying the message')
  assert.equal(messageChain[0].tag, 'span')
  for (const prop of ['width', 'height', 'color', 'font-size']) {
    const winner = computeProperty(rules, messageChain, prop)
    assert.equal(
      winner,
      null,
      `#email-error-text should inherit ${prop} from the alert, but a rule sets it to ` +
        `${winner?.value} — a badge rule that also matches the message span makes the error ` +
        `unreadable while leaving it in the DOM (chrome-pass2-identity.md defect #2)`
    )
  }

  // The badge itself: still painted. A fix that scoped the rule to nothing would pass the loop
  // above and quietly drop the `!` mark.
  const badgeChain = chainWhere(
    html,
    (el, parent) => el.tag === 'span' && el.firstChild && parent?.id === 'email-error'
  )
  assert.ok(badgeChain, 'expected the alert to still open with its badge span')
  assert.equal(
    computeProperty(rules, badgeChain, 'width')?.value,
    '0.875rem',
    'the badge span lost its own rule — scoping the selector must not scope it to nothing'
  )
})
