// The install code mail (19/10/2026, `sites/backup-export.js`): sent once after the first download of
// a WordPress or Joomla package, naming the six digits its installer asks for when the new host's
// database is on a different server, and where in Tracy to find them again.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { installCodeMail } from '../src/mail/emails.js'
import { WEB_LANGUAGES } from '../src/lib/i18n/index.js'

test('install code mail: the code in the body, never in the subject, in every interface language', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = installCodeMail({ code: '042917', site: 'lantern', version: 7, lang })
    assert.ok(!mail.subject.includes('042917'), `${lang}: the subject leaves the code out`)
    assert.match(mail.subject, /lantern/, `${lang}: the subject names the site`)
    assert.match(mail.text, /042917/, `${lang}: the text part holds the code`)
    assert.match(mail.html, />042917</, `${lang}: the HTML holds the code`)
    assert.match(mail.text, /\b7\b/, `${lang}: the backup is named`)
    for (const part of [mail.subject, mail.text, mail.html])
      assert.doesNotMatch(part, /\{[a-z]+\}|mail\.installCode/, `${lang}: every slot is filled`)
  }
})

test('install code mail: English says where the code is and when it is needed', () => {
  const mail = installCodeMail({ code: '042917', site: 'lantern', version: 7 })
  assert.equal(mail.subject, 'Install code for lantern')
  assert.match(mail.text, /Install code: 042917/)
  assert.match(mail.text, /only if the database of the new host is on a different server/)
  assert.match(mail.text, /My Sites, the … menu of the site, Export site as ZIP/)
  assert.match(mail.text, /Do not share it/)
})

test('install code mail: anything but six digits is refused, never mailed', () => {
  for (const code of ['42917', '0429170', 'abcdef', '', null, '04 2917'])
    assert.throws(() => installCodeMail({ code, site: 'lantern', version: 7 }), /six digits/, String(code))
})

test('install code mail: a site name that is not a plain name steps down to a plain phrase', () => {
  const mail = installCodeMail({ code: '042917', site: 'x\u0007y', version: 1 })
  assert.equal(mail.subject, 'Install code for your site')
})
