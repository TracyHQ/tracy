/**
 * REG-PR-1402-tone-question-not-voice: the Tone question names a writing style, never a speaking voice.
 * S1: in the three standard questionnaires and their tracy-web mirrors, the `tone` question's English hint is the
 * writing-style sentence, its vi/de labels are "Văn phong"/"Schreibstil", and no label or hint carries a word for a
 * voice or a sound (`voice, giọng, Tonfall, voz, voce, głos, röst, โทนเสียง, น้ำเสียง, लहजा, Nada`).
 * S2: each mirror is byte-equal to its source. S3: the vi/de strings of Add site and the Build forms use the same
 * words. S4: the committed lib/client.js of both locale packages carries them (rebuilt, not stale).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT, checks } from './lib.mjs'

const c = checks()
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const CMS = ['emdash', 'joomla', 'wordpress']
const HINT_EN =
  'Sets the writing style Tracy uses for the text on your site.\nPlain is direct, Warm is friendly, Bold is confident.'
const VOICE = /\bvoices?\b|giọng|tonfall|\bvoz\b|\bvoce\b|głos|\brösten?\b|โทนเสียง|น้ำเสียง|लहजा|लहजे|^nada$/iu

for (const cms of CMS) {
  const src = `packages/site/tracy-site-build-${cms}/questions.json`
  const mirror = `apps/tracy-web/src/questions/${cms}.json`
  for (const file of [src, mirror]) {
    const tone = JSON.parse(read(file)).questions.find((q) => q.id === 'tone')
    c.eq(`S1: ${file} tone hint.en`, tone?.hint?.en, HINT_EN)
    c.eq(`S1: ${file} tone label.vi`, tone?.label?.vi, 'Văn phong')
    c.eq(`S1: ${file} tone label.de`, tone?.label?.de, 'Schreibstil')
    const voiced = [
      ...Object.entries(tone?.label ?? {}).map(([l, v]) => [`label.${l}`, v]),
      ...Object.entries(tone?.hint ?? {}).map(([l, v]) => [`hint.${l}`, v])
    ].filter(([, v]) => VOICE.test(v))
    c.eq(`S1: ${file} tone texts naming a voice`, voiced.map(([k]) => k).join(', '), '')
  }
  c.check(`S2: ${mirror} is byte-equal to ${src}`, read(mirror) === read(src))
}

const VI = 'packages/locale/tracy-locale-vi/vi'
const DE = 'packages/locale/tracy-locales/de'
c.eq('S3: vi summary_tone', JSON.parse(read(`${VI}/tracy-add-site.json`)).summary_tone, 'Văn phong {label}')
c.eq(
  'S3: de summary_tone',
  JSON.parse(read(`${DE}/tracy-add-site.json`)).summary_tone,
  'Schreibstil: {label}'
)
for (const cms of CMS) {
  for (const [dir, word, old] of [
    [VI, 'Văn phong', 'Giọng'],
    [DE, 'Schreibstil', 'Tonfall']
  ]) {
    const s = JSON.parse(read(`${dir}/tracy-site-build-${cms}.json`))
    c.eq(`S3: ${dir}/tracy-site-build-${cms} form.tone`, s['form.tone'], word)
    for (const key of ['msg.answered', 'msg.revised']) {
      c.check(
        `S3: ${dir}/tracy-site-build-${cms} ${key} says "${word}: {tone}" and not "${old}"`,
        s[key]?.includes(`${word}: {tone}`) && !s[key]?.includes(old),
        s[key]
      )
    }
  }
}

const count = (text, needle) => text.split(needle).length - 1
for (const [lib, word, old, summary] of [
  ['packages/locale/tracy-locale-vi/lib/client.js', 'Văn phong', 'Giọng', 'Văn phong {label}'],
  ['packages/locale/tracy-locales/lib/client.js', 'Schreibstil', 'Tonfall', 'Schreibstil: {label}']
]) {
  const text = read(lib)
  c.eq(`S4: ${lib} "summary_tone": "${summary}"`, count(text, `"summary_tone": "${summary}"`), 1)
  c.eq(`S4: ${lib} "form.tone": "${word}"`, count(text, `"form.tone": "${word}"`), 3)
  c.eq(`S4: ${lib} "${word}: {tone}"`, count(text, `${word}: {tone}`), 6)
  c.eq(
    `S4: ${lib} tone strings still saying "${old}"`,
    count(text, `"form.tone": "${old}"`) + count(text, `${old}: {tone}`),
    0
  )
}

c.done()
