// The "check your Spam folder" tip card (spam hints D1, Akemi 05/10): on the sign-in code step and
// on the "Request sent" page, hidden until the script shows it, and gone for good in this browser
// once dismissed. Storage that throws must not stop the card from showing.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseHTML } from 'linkedom'

import { loginPage } from '../src/identity/pages.js'
import { en } from '../src/lib/i18n/strings.js'
import { SPAM_TIP_SCRIPT, spamTip } from '../src/lib/spam-tip.js'
import { joinPage } from '../src/seats/pages.js'

const t = (key) => en[key]

/** Runs the tip script over `html` with a storage the test holds; returns the document. */
function run(html, storage) {
  const { window, document } = parseHTML(html)
  const fn = new Function('window', 'document', SPAM_TIP_SCRIPT)
  fn({ localStorage: storage }, document)
  return { window, document }
}

const memory = (initial = {}) => {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v)
    }
  }
}

test('the code step carries the tip, hidden, with its text and the script', () => {
  const html = loginPage({ origin: 'https://tracy.test', step: 'code', email: 'a@lab3.example' })
  const { document } = parseHTML(html)
  const tip = document.querySelector('#code-step [data-spam-tip="spam-signin"]')
  assert.ok(tip, 'the tip sits inside the code step')
  assert.equal(tip.hasAttribute('hidden'), true)
  assert.equal(tip.querySelector('.spam-tip-text').textContent, en['login.spamTip'])
  assert.ok(!/noreply@tracy\.ai/.test(tip.textContent), 'no "add us to your contacts"')
  assert.ok(html.includes("'tracy.tip.' + tip.getAttribute('data-spam-tip')"))
})

test('the Request sent page carries the same tip', () => {
  const html = joinPage({
    siteKey: 'kinetic.vn',
    viewer: 'a@lab3.example',
    requested: true,
    sender: 'noreply@mail.test'
  })
  const { document } = parseHTML(html)
  const tip = document.querySelector('[data-spam-tip="spam-request"]')
  assert.ok(tip)
  // The sender is the deployment's own MAIL_FROM address, never a hostname written in code.
  assert.equal(
    tip.querySelector('.spam-tip-text').textContent,
    en['seats.requestedSpamTip'].replace('{sender}', 'noreply@mail.test')
  )
  assert.equal(tip.querySelector('.spam-tip-x').getAttribute('aria-label'), en['tip.dismiss'])
})

test('the script shows the tip, and a dismissal is remembered per tip', () => {
  const storage = memory()
  const html = `<body>${spamTip(t, 'spam-signin', 'Tip one')}${spamTip(t, 'spam-request', 'Tip two')}</body>`
  const first = run(html, storage)
  const [one, two] = first.document.querySelectorAll('[data-spam-tip]')
  assert.equal(one.hidden, false)
  assert.equal(two.hidden, false)
  one.querySelector('.spam-tip-x').dispatchEvent(new first.window.Event('click'))
  assert.equal(one.hidden, true)
  assert.equal(storage.data['tracy.tip.spam-signin'], '1')

  const again = run(html, storage)
  const [oneAgain, twoAgain] = again.document.querySelectorAll('[data-spam-tip]')
  assert.equal(oneAgain.hidden, true, 'dismissed stays dismissed in this browser')
  assert.equal(twoAgain.hidden, false, 'the other tip is untouched')
})

test('storage that throws still shows the tip', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    }
  }
  const { document, window } = run(`<body>${spamTip(t, 'spam-signin', 'Tip')}</body>`, broken)
  const tip = document.querySelector('[data-spam-tip]')
  assert.equal(tip.hidden, false)
  tip.querySelector('.spam-tip-x').dispatchEvent(new window.Event('click'))
  assert.equal(tip.hidden, true)
})

test('the tip text is escaped', () => {
  assert.ok(spamTip(t, 'x', '<b>hi</b>').includes('&lt;b&gt;hi&lt;/b&gt;'))
})
