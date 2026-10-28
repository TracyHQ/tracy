/**
 * tracy-web speaks the visitor's language (#753): which language a request resolves to, `<html
 * lang>`, one translated page per language, translated mails, and the doors that carry it. The
 * page and mail renderers are pure, so most of this needs no server.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { INTERFACE_LANGUAGES } from '../../../packages/core/tracy-core/src/interface-languages/index.mjs'
import { buildApp } from '../src/app.js'
import { noSitesPage } from '../src/bar/pages.js'
import { readConfig } from '../src/config.js'
import { deviceConfirmPage, loginPage } from '../src/identity/pages.js'
import { memoryIdentityStore } from '../src/identity/store.js'
import {
  htmlLang,
  matchLanguage,
  requestLanguage,
  resolveLanguage,
  translate,
  WEB_LANGUAGES
} from '../src/lib/i18n/index.js'
import { CODE_TTL_MS } from '../src/lib/policy.js'
import { betaMail, inviteMail, signInCodeMail, teamInviteMail } from '../src/mail/emails.js'
import { inviteLandingPage, joinPage } from '../src/seats/pages.js'
import { provisionRefusal } from '../src/sites/route.js'

/** Letter HTML as the reader sees it: the invisible joiners that stop autolinks taken out. */
const visible = (html) => String(html).replaceAll('&zwnj;', '')

const HTML_LANG = { en: 'en', vi: 'vi', de: 'de', it: 'it', fr: 'fr', nl: 'nl', zh: 'zh-CN', es: 'es' }

test('tracy-web lists exactly the shown interface languages, in the same order', () => {
  assert.deepEqual(
    [...WEB_LANGUAGES],
    INTERFACE_LANGUAGES.filter((l) => l.shown).map((l) => l.id)
  )
})

// ── resolution order: ?lang= > tracy_lang cookie > Accept-Language > English ──────────────────

test('an explicit ?lang= wins over the cookie and the browser', () => {
  assert.equal(resolveLanguage({ query: 'de', cookie: 'fr', acceptLanguage: 'es' }), 'de')
})

test('an invalid ?lang= falls through to the cookie', () => {
  assert.equal(resolveLanguage({ query: 'xx', cookie: 'fr', acceptLanguage: 'es' }), 'fr')
  assert.equal(resolveLanguage({ query: '<script>', cookie: 'nl' }), 'nl')
})

test('the cookie wins over the browser, and an invalid cookie falls through', () => {
  assert.equal(resolveLanguage({ cookie: 'it', acceptLanguage: 'es' }), 'it')
  assert.equal(resolveLanguage({ cookie: 'klingon', acceptLanguage: 'es' }), 'es')
})

test('Accept-Language: preference order, exact tag first, then primary subtag', () => {
  assert.equal(resolveLanguage({ acceptLanguage: 'de-AT,de;q=0.9,en;q=0.8' }), 'de')
  assert.equal(resolveLanguage({ acceptLanguage: 'ja,fr-CA;q=0.8,en;q=0.5' }), 'fr')
  assert.equal(resolveLanguage({ acceptLanguage: 'en;q=0.3, vi;q=0.9' }), 'vi')
  assert.equal(resolveLanguage({ acceptLanguage: 'pt-BR, *;q=0.5' }), 'en')
  assert.equal(resolveLanguage({ acceptLanguage: 'nl;q=0, es' }), 'es')
})

test('zh means Simplified only: zh-CN/zh-SG/zh-Hans map to zh, zh-TW/HK/MO/Hant do not', () => {
  for (const tag of ['zh', 'zh-CN', 'zh-cn', 'zh-SG', 'zh-Hans', 'zh-Hans-CN'])
    assert.equal(matchLanguage(tag), 'zh', tag)
  for (const tag of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW'])
    assert.equal(matchLanguage(tag), null, tag)
  assert.equal(resolveLanguage({ acceptLanguage: 'zh-TW,zh;q=0.9' }), 'zh')
  assert.equal(resolveLanguage({ acceptLanguage: 'zh-TW,en;q=0.9' }), 'en')
})

test('nothing usable means English', () => {
  assert.equal(resolveLanguage({}), 'en')
  assert.equal(resolveLanguage({ acceptLanguage: 'x'.repeat(2000) }), 'en')
})

test('requestLanguage reads a Hono context and a plain Request the same way', () => {
  const headers = { cookie: 'a=1; tracy_lang=zh-CN', 'accept-language': 'de' }
  const c = { req: { query: () => undefined, header: (name) => headers[name] } }
  assert.equal(requestLanguage(c), 'zh')
  const request = new Request('http://tracy.test/x?lang=es', { headers })
  assert.equal(requestLanguage(request), 'es')
  assert.equal(
    requestLanguage(new Request('http://tracy.test/x', { headers: { 'accept-language': 'nl' } })),
    'nl'
  )
})

// ── pages ─────────────────────────────────────────────────────────────────────────────────────

test('loginPage: <html lang> and the copy follow the language, for every language', () => {
  for (const lang of WEB_LANGUAGES) {
    const html = loginPage({ origin: 'http://tracy.test', lang })
    assert.ok(html.startsWith(`<!doctype html><html lang="${HTML_LANG[lang]}">`), lang)
    assert.equal(htmlLang(lang), HTML_LANG[lang])
    for (const key of [
      'login.heroTitle',
      'login.pitchTitle',
      'login.emailMeCode',
      'login.verify',
      'login.resend'
    ]) {
      const text = translate(lang, key).replaceAll("'", '&#39;')
      assert.ok(html.includes(text), `${lang}: ${key}`)
    }
    assert.ok(html.includes(`<title>${translate(lang, 'login.title')}</title>`), lang)
    // The script's own messages are translated too, not left in English.
    assert.ok(html.includes(JSON.stringify(translate(lang, 'login.codeInvalid'))), lang)
  }
})

test('loginPage: the English title uses the new CMS positioning and the German title is translated', () => {
  const en = loginPage({ origin: 'http://tracy.test' })
  assert.match(en, /<html lang="en">/)
  assert.match(en, /Claude Design, but for CMS/)
  const de = loginPage({ origin: 'http://tracy.test', lang: 'de' })
  assert.match(de, /Claude Design, aber für CMS/)
})

test('loginPage: the code step keeps the address in its <strong> inside the translated sentence', () => {
  const html = loginPage({ origin: 'http://tracy.test', lang: 'fr', step: 'code', email: 'a<b@x.test' })
  assert.match(
    html,
    /Code de connexion pour <!--email_off--><strong id="code-step-email">a&lt;b@x\.test<\/strong><!--email_on-->\./
  )
  // The step names the address and does not say a letter left: this page cannot know one did (#811).
  assert.doesNotMatch(html, /Nous avons envoyé un e-mail/)
})

test('loginPage: an explicit ?lang= rides along on every door the page posts to', () => {
  const html = loginPage({ origin: 'http://tracy.test', lang: 'es', explicitLang: 'es' })
  assert.match(html, /<form id="email-form" method="post" action="\/login\?lang=es">/)
  assert.match(html, /<form id="code-form" method="post" action="\/verify\?lang=es">/)
  assert.match(html, /<form id="resend-form" class="resend" method="post" action="\/login\?lang=es">/)
  // Without one, the doors stay exactly as they were.
  assert.match(loginPage({ origin: 'http://tracy.test', lang: 'es' }), /action="\/login">/)
})

test('deviceConfirmPage: translated, with the address still escaped', () => {
  const html = deviceConfirmPage({ email: '<x>@y.test', nonce: 'n', lang: 'it' })
  assert.match(html, /<html lang="it">/)
  assert.match(html, /Approvare questo accesso\?/)
  assert.match(html, /&lt;x&gt;@y\.test/)
})

test('seats pages: joinPage and inviteLandingPage translated per language', () => {
  const join = joinPage({ siteKey: 'shop.example', viewer: 'a@b.test', lang: 'nl' })
  assert.match(join, /<html lang="nl">/)
  assert.match(join, /Vragen om lid te worden van shop\.example/)
  assert.match(join, /Aangemeld als <!--email_off--><strong>a@b\.test<\/strong><!--email_on-->/)
  const landed = inviteLandingPage({
    summary: 'accepted',
    role: 'editor',
    sites: [{ siteKey: 'a.example', outcome: 'accepted' }],
    email: 'a@b.test',
    lang: 'zh'
  })
  assert.match(landed, /<html lang="zh-CN">/)
  assert.match(landed, /您现在已加入 1 个 site/)
  assert.match(landed, /a\.example — 已接受/)
})

// ── #807: the words of docs/references/vocabulary.md, in every language ─────────────────────────

/** The noun each language's own sign-in copy uses for the code (`login.resend`, the mail subject). */
const CODE_WORD = {
  en: 'code',
  vi: 'mã',
  de: 'Code',
  it: 'codice',
  fr: 'code',
  nl: 'code',
  zh: '验证码',
  es: 'código'
}

/** Whether `text` uses the language's word for the code, at the start of a sentence or inside a compound. */
const namesTheCode = (text, lang) => text.toLowerCase().includes(CODE_WORD[lang].toLowerCase())

test('the verify button names the code, in every language', () => {
  assert.equal(translate('en', 'login.verify'), 'Verify code')
  for (const lang of WEB_LANGUAGES) {
    const text = translate(lang, 'login.verify')
    assert.ok(namesTheCode(text, lang), `${lang}: "${text}" does not name the code`)
    // The same noun the language's own "send a new code" uses, so the two buttons read as one step.
    assert.ok(namesTheCode(translate(lang, 'login.resend'), lang), `${lang}: login.resend`)
    assert.ok(
      loginPage({ origin: 'http://tracy.test', lang }).includes(`<button type="submit">${text}</button>`),
      lang
    )
  }
})

test('the plain sign-in subject says "code", never "OTP", in every language', () => {
  assert.equal(translate('en', 'mail.signInSubjectPlain'), 'Your sign-in code')
  for (const lang of WEB_LANGUAGES) {
    const subject = signInCodeMail('not a code', lang).subject
    assert.equal(subject, translate(lang, 'mail.signInSubjectPlain'), lang)
    assert.ok(namesTheCode(subject, lang), `${lang}: "${subject}"`)
    assert.doesNotMatch(subject, /OTP/i, lang)
  }
})

test('asking to join is one request, worded the same on the heading and the button, in every language', () => {
  assert.equal(translate('en', 'seats.askForAccess'), 'Request to join')
  assert.equal(translate('en', 'seats.joinHeading', { site: 'x.example' }), 'Request to join x.example')
  for (const lang of WEB_LANGUAGES) {
    const heading = translate(lang, 'seats.joinHeading', { site: 'x.example' })
    assert.ok(heading.includes('x.example'), `${lang}: the heading lost {site}`)
    assert.doesNotMatch(heading, /[{}]/, lang)
    const html = joinPage({ siteKey: 'x.example', viewer: 'a@b.c', lang })
    assert.ok(html.includes(`<button type="submit">${translate(lang, 'seats.askForAccess')}</button>`), lang)
  }
  // The button asks to JOIN, not for "access": the translations that said "access" say "join" now.
  const ACCESS = {
    vi: 'quyền truy cập',
    de: 'Zugang',
    it: 'accesso',
    fr: 'accès',
    nl: 'Toegang',
    zh: '访问权限',
    es: 'acceso'
  }
  for (const [lang, word] of Object.entries(ACCESS)) {
    assert.ok(!translate(lang, 'seats.askForAccess').includes(word), `${lang}: still asks for "${word}"`)
  }
})

/** What dsh titles the Team tab in `lang`: the name a person has to look for on the screen. */
function teamTabName(lang) {
  if (lang === 'en') return 'Team'
  const home = lang === 'vi' ? 'tracy-locale-vi' : 'tracy-locales'
  const file = new URL(`../../../packages/locale/${home}/${lang}/tracy-site-tabs.json`, import.meta.url)
  const name = JSON.parse(readFileSync(file, 'utf8'))['tab.team']
  assert.ok(
    typeof name === 'string' && name.trim() !== '',
    `${lang}: the Team tab has no title in ${file.pathname}`
  )
  return name
}

test('the page that says where inviting moved names the Team tab as dsh titles it, in every language', () => {
  assert.equal(translate('en', 'seats.teamMovedBody'), 'Inviting happens in Tracy now, in the Team tab.')
  for (const lang of WEB_LANGUAGES) {
    const text = translate(lang, 'seats.teamMovedBody')
    assert.ok(
      text.includes(teamTabName(lang)),
      `${lang}: "${text}" does not name the tab "${teamTabName(lang)}"`
    )
    assert.doesNotMatch(text, /My Sites/, lang)
  }
})

test('noSitesPage: translated, keeps its status', async () => {
  const res = noSitesPage('a@b.test', { signInHref: '/login', invites: [], lang: 'vi' })
  assert.equal(res.status, 404)
  const html = await res.text()
  assert.match(html, /<html lang="vi">/)
  assert.match(html, /Tài khoản này chưa có site nào/)
})

// ── mails ─────────────────────────────────────────────────────────────────────────────────────

test('signInCodeMail: subject, HTML and text in the language, code first in the subject', () => {
  for (const lang of WEB_LANGUAGES) {
    const mail = signInCodeMail('482913', lang)
    assert.ok(mail.subject.startsWith('482913'), `${lang}: ${mail.subject}`)
    assert.equal(mail.subject, translate(lang, 'mail.signInSubject', { code: '482913' }))
    assert.match(visible(mail.html), new RegExp(`<html lang="${HTML_LANG[lang]}">`))
    assert.match(visible(mail.html), /class="mail-code"[^>]*>482913</)
    assert.doesNotMatch(visible(mail.html), /\{\{[a-zA-Z:.]+\}\}/)
    assert.ok(mail.text.split('\n').includes('482913'), lang)
  }
  const de = signInCodeMail('482913', 'de')
  assert.match(visible(de.html), /Ihr Anmeldecode/)
  assert.match(visible(de.html), /Der Code ist 10 Minuten gültig\./)
  assert.doesNotMatch(de.html + de.text, /valid for 10 minutes/)
})

test('betaMail: the whitelist mail in Spanish keeps the link and translates the button', () => {
  const url = 'https://landing.example.com/whitelist/?email=a%40b.test&source=login'
  const mail = betaMail({ url, lang: 'es' })
  assert.equal(mail.subject, 'Sobre su inicio de sesión en Tracy')
  assert.match(visible(mail.html), /<html lang="es">/)
  assert.ok(mail.html.includes(`href="${url.replaceAll('&', '&amp;')}"`))
  assert.match(visible(mail.html), /Unirse a la lista de espera<\/a>/)
  // Spam audit 05/10/2026: joomlart.com is named, never linked, and kept from autolinking.
  assert.doesNotMatch(mail.html, /href="https:\/\/joomlart\.com/)
  assert.doesNotMatch(mail.html, /joomlart\.com/)
  assert.match(visible(mail.html), /<span style="color:#5c534e;">joomlart\.com<\/span>/)
  assert.doesNotMatch(visible(mail.html), /\{\{[a-zA-Z:.]+\}\}/)
  const unavailable = betaMail({ url, unavailable: true, lang: 'es' })
  assert.match(visible(unavailable.html), /No pudimos comprobar su suscripción a JoomlArt/)
})

test('teamInviteMail and inviteMail: translated, data kept as typed', () => {
  const team = teamInviteMail({
    inviterEmail: 'owner@x.test',
    role: 'editor',
    siteKeys: ['a.example', 'b.example'],
    acceptUrl: 'https://tracy.test/invite/t',
    lang: 'fr'
  })
  // No display name: the local part names the inviter (Akemi, 04/10).
  assert.equal(team.subject, 'owner vous a invité à rejoindre 2 sites web')
  assert.match(visible(team.html), />Accepter l’invitation<\/a>/)
  assert.match(visible(team.html), /lang="fr"/)
  assert.match(team.text, /En tant qu’Éditeur, vous pouvez modifier/)
  assert.match(team.text, /Accepter l’invitation: https:\/\/tracy\.test\/invite\/t/)
  const invite = inviteMail({
    inviterEmail: 'o@x.test',
    workspaceName: 'Acme',
    siteKeys: ['a.example'],
    lang: 'vi'
  })
  assert.equal(invite.subject, 'Bạn được mời tham gia Acme trên Tracy')
  assert.match(invite.text, /o \(o@x\.test\) đã mời bạn tham gia Acme trên Tracy\./)
})

// ── JSON refusals ─────────────────────────────────────────────────────────────────────────────

test('a refusal message follows the language; its code does not', () => {
  const answer = { body: { code: 'HOST_UPDATING' } }
  assert.equal(provisionRefusal(answer).message.startsWith('Tracy is updating.'), true)
  const de = provisionRefusal(answer, 'de')
  assert.equal(de.code, 'HOST_UPDATING')
  assert.match(de.message, /Tracy wird gerade aktualisiert/)
})

// ── through the real doors ────────────────────────────────────────────────────────────────────

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

function appWithMailbox() {
  const sent = []
  const app = buildApp({
    config: readConfig(env),
    identity: memoryIdentityStore(),
    mail: { send: async (message) => sent.push(message) },
    now: () => 1_700_000_000_000
  })
  return { app, sent }
}

test('GET /login: Accept-Language, then the cookie, then ?lang= decide the page', async () => {
  const { app } = appWithMailbox()
  const get = async (path, headers = {}) =>
    (await app.fetch(new Request(`http://tracy.test${path}`, { headers }))).text()
  assert.match(await get('/login'), /<html lang="en">/)
  assert.match(await get('/login', { 'accept-language': 'it-IT,it;q=0.9' }), /<html lang="it">/)
  assert.match(
    await get('/login', { 'accept-language': 'it-IT', cookie: 'tracy_lang=nl' }),
    /<html lang="nl">[\s\S]*Claude Design, maar dan voor CMS/
  )
  assert.match(await get('/login?lang=zh', { cookie: 'tracy_lang=nl' }), /<html lang="zh-CN">/)
})

test('POST /login: the code mail goes out in the language of the request that asked for it', async () => {
  const { app, sent } = appWithMailbox()
  const res = await app.fetch(
    new Request('http://tracy.test/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept-language': 'de-DE,de;q=0.9' },
      body: JSON.stringify({ email: 'visitor@example.com' })
    })
  )
  assert.equal(res.status, 200)
  assert.equal(sent.length, 1)
  assert.match(sent[0].subject, /^\d{6} ist Ihr Tracy-Anmeldecode$/)
  assert.match(visible(sent[0].html), /<html lang="de">/)
})

test('POST /login form with a bad address: the error is in the page language', async () => {
  const { app } = appWithMailbox()
  const res = await app.fetch(
    new Request('http://tracy.test/login?lang=fr', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=nope'
    })
  )
  assert.equal(res.status, 400)
  const html = await res.text()
  assert.match(html, /<html lang="fr">/)
  assert.match(html, /Saisissez une adresse email valide\./)
  assert.match(html, /action="\/login\?lang=fr"/)
})

// #794: every page and mail that states how long a sign-in code lives fills `{minutes}` from the
// policy value. A translation that dropped the placeholder would print no number at all, and one
// that kept a literal would go on saying the old number after the policy changes.
test('a sign-in code lifetime is a filled {minutes} placeholder on every page and mail, in every language', () => {
  const minutes = CODE_TTL_MS / 60_000
  for (const lang of WEB_LANGUAGES) {
    for (const key of ['login.codeLifetime', 'login.localCode', 'mail.signInPreheader', 'mail.signInValid']) {
      assert.match(translate(lang, key), /\{minutes\}/, `${lang} ${key}`)
    }
    const page = loginPage({
      next: '/',
      email: 'a@x.test',
      origin: 'https://tracy.test',
      step: 'code',
      localPreview: true,
      localCode: '123456',
      lang
    })
    const mail = signInCodeMail('123456', lang)
    for (const [name, body] of [
      ['page', page],
      ['mail text', mail.text],
      ['mail html', mail.html]
    ]) {
      assert.doesNotMatch(body, /\{minutes\}/, `${lang} ${name}: unfilled`)
      assert.ok(
        body.includes(translate(lang, 'mail.signInValid', { minutes }).match(/\d+/)[0]),
        `${lang} ${name}`
      )
    }
  }
})

// ── the Settings section a subscription error points at (renamed 09/10/2026) ─────────────────

/** "AI accounts" in each language, as the Settings nav of `@tracy/dsh-model-plan` shows it. */
const AI_ACCOUNTS_SECTION = {
  en: 'AI accounts',
  vi: 'Tài khoản AI',
  de: 'KI-Konten',
  it: 'Account AI',
  fr: 'Comptes IA',
  nl: 'AI-accounts',
  zh: 'AI 账号',
  es: 'Cuentas de IA'
}

test('subscription errors send the visitor to Settings › AI accounts, never to the retired name', () => {
  for (const lang of WEB_LANGUAGES) {
    for (const key of ['subscription.disconnected', 'subscription.limit']) {
      const said = translate(lang, key)
      assert.ok(
        said.includes(`› ${AI_ACCOUNTS_SECTION[lang]}`),
        `${lang} ${key} should name the section "${AI_ACCOUNTS_SECTION[lang]}": ${said}`
      )
    }
    for (const key of ['subscription.unavailable', 'subscription.disabled', 'subscription.notOwner']) {
      assert.doesNotMatch(translate(lang, key), /model subscription/i, `${lang} ${key}`)
    }
  }
})
