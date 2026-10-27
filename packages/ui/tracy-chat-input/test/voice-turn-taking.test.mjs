// Turn-taking words (`src/client/voice-turn-taking.mjs`): what a person listening says, what a person
// thinking stops on, and what is a request, across the interface languages.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  asksPlanChange,
  confirmReply,
  endsAsQuestion,
  isBackchannel,
  isFillerOnly,
  isGoodbye,
  isPlanApproval,
  isStopCommand,
  isVoiceOff,
  PLAN_LOCALES,
  PLAN_VOICE_LOCALES,
  planChange,
  soundsUnfinished,
  stopsTracy,
  withoutSoundTags
} from '../src/client/voice-turn-taking.mjs'

test('hesitation alone, in any interface language, and nothing else', () => {
  // "Uuuh." is how the speech service wrote a Vietnamese "ừ ừ" on the stand (16/10/2026).
  for (const text of [
    'Um.',
    'Ừm…',
    'Ờ',
    'Euh...',
    'Ähm',
    'Ehm',
    '呃。',
    'Hmmm',
    'uh, um',
    'Uuuh.',
    'Hừm',
    'Mhm'
  ]) {
    assert.equal(isFillerOnly(text), true, text)
  }
  // "Ừ" says yes: it answers a question card, so it is never only hesitation.
  for (const text of [
    '',
    'Um, change the title.',
    'Ừm, đổi tiêu đề.',
    'Okay',
    'Stop',
    'Em.',
    'Ô.',
    'Ạ',
    'Ừ.',
    'Ừừ'
  ]) {
    assert.equal(isFillerOnly(text), false, text)
  }
})

test('the person listening: acknowledgements, alone or together, softened or not', () => {
  for (const text of [
    'Mm-hmm.',
    'Okay okay.',
    'Yeah, got it.',
    'Ừ.',
    'Ừ ừ',
    'Dạ vâng ạ.',
    'Ok em.',
    'Đúng rồi.',
    'Ja, genau.',
    "D'accord.",
    'Va bene.',
    'Vale, vale.',
    'Oké.',
    '好的。',
    '嗯嗯',
    'Um, okay.',
    'Uuuh.',
    'Ừừ.'
  ]) {
    assert.equal(isBackchannel(text), true, text)
  }
})

test('a request, a refusal or a stop is never taken for listening', () => {
  for (const text of [
    '',
    'Okay, but make it darker.',
    'Ừ nhưng để màu đỏ.',
    'Không.',
    'Stop.',
    'Dừng lại.',
    'Khoan đã.',
    'Wait.',
    'Ja, aber rot.',
    'Anh.',
    'Em ơi',
    '好的，改成红色。'
  ]) {
    assert.equal(isBackchannel(text), false, text)
  }
})

test('a phrase that stops where the sentence goes on, even with a full stop after it', () => {
  for (const text of [
    'Change the button and',
    'Đổi màu nút liên hệ và',
    'Đổi màu nút liên hệ và.',
    'Ich möchte den Titel ändern, weil',
    'Je veux changer le titre, mais',
    'Cambia il titolo e',
    'Quiero cambiar el título y',
    'Ik wil de titel en',
    '我想改标题，然后',
    'Make the header,',
    'Thêm ảnh…',
    'Đổi tiêu đề ừm'
  ]) {
    assert.equal(soundsUnfinished(text), true, text)
  }
  for (const text of [
    '',
    'Change the button.',
    'Đổi màu nút liên hệ sang xanh.',
    'Thêm logo vào đầu trang.',
    '改成红色。',
    // Vietnamese sentences end on these: never taken for hesitation.
    'Cảm ơn em.',
    'Làm giúp mình nhé ạ.',
    'Vậy à?'
  ]) {
    assert.equal(soundsUnfinished(text), false, text)
  }
})

test('a question asked, in either way of writing its mark', () => {
  assert.equal(endsAsQuestion('Trang chủ có mấy mục vậy?'), true)
  assert.equal(endsAsQuestion('这是什么？'), true)
  assert.equal(endsAsQuestion('Đổi tiêu đề.'), false)
})

test('what stops Tracy talking: two words or more, or one that asks it to stop — not a sound it cannot make out', () => {
  for (const text of [
    'Khoan',
    'Wait.',
    'Không.',
    'Thêm logo',
    'Đổi đi.',
    'Huân đã, trang chủ hiện có mấy mục vậy?',
    'Okay, but darker.',
    'Ja, aber rot.',
    '停',
    '改成红色'
  ]) {
    assert.equal(stopsTracy(text), true, text)
  }
  // "Dzuiii.", "Du. 2." and "Thưa..." are what the speech service wrote for a hummed "ừ ừ" and an "ừ" on the stand.
  for (const text of [
    '',
    'Dzuiii.',
    'Du. 2.',
    'Thưa...',
    'Ừ ừ.',
    'Okay.',
    'Dạ vâng ạ.',
    'Đẹp.',
    'Uuuh.',
    '好的'
  ]) {
    assert.equal(stopsTracy(text), false, text)
  }
})

test('a stop of the work, in any interface language — “khoan”, “wait” alone too; never a request with a stop in it', () => {
  for (const text of [
    'Dừng lại.',
    'Khoan đã.',
    'Đợi chút.',
    'Wait.',
    'Wait a second.',
    'Hold on.',
    'Warte mal.',
    'Aspetta un attimo.',
    '等一下',
    'Thôi, dừng lại đi.',
    'Stop.',
    'Please stop it now.',
    'Stopp!',
    'Arrête.',
    'Fermati.',
    'Para ya.',
    'Stoppen.',
    '停下来吧',
    'Hủy.'
  ]) {
    assert.equal(isStopCommand(text), true, text)
  }
  for (const text of [
    '',
    'Khoan đã, để màu đỏ thì hơn.',
    'Wait, make it red.',
    'Dừng lại ở trang chủ thôi, đừng sửa trang khác.',
    'Stop the slider on the home page.',
    'Ừ.',
    '停在首页'
  ]) {
    assert.equal(isStopCommand(text), false, text)
  }
})

test('laughter is not a request, and sound tags are taken out of what was said', () => {
  for (const text of ['Haha.', 'Hihi', 'Hì hì.', 'Kkk', 'Jajaja', '哈哈', 'Hehe, hmm']) {
    assert.equal(isFillerOnly(text), true, text)
  }
  for (const text of ['Ha Long', 'Hi there', 'Hà Nội']) {
    assert.equal(isFillerOnly(text), false, text)
  }
  assert.equal(withoutSoundTags('(laughs) Đổi tiêu đề [music] thôi.'), 'Đổi tiêu đề thôi.')
  assert.equal(withoutSoundTags('（笑）改成红色'), '改成红色')
  assert.equal(withoutSoundTags('Đổi tiêu đề.'), 'Đổi tiêu đề.')
})

test('“thôi” alone or again stops Tracy; beside a yes it only softens it; with more it is a correction', () => {
  assert.equal(stopsTracy('Thôi.'), true, 'it never stopped Tracy: taken for a softener first')
  assert.equal(stopsTracy('Thôi thôi.'), true)
  assert.equal(stopsTracy('Ok thôi.'), false)
  assert.equal(isBackchannel('Được thôi.'), true)
  assert.equal(stopsTracy('Thôi, đổi sang đỏ.'), true)
  assert.equal(isStopCommand('Thôi, đổi sang đỏ.'), false, 'a correction, steered in — not the work stopped')
  assert.equal(stopsTracy('nhé'), false)
})

test('Chinese “yes” said again and again in one run is listening, like “ừ ừ”; “好” with a request is the request', () => {
  for (const said of ['对对对。', '好好好。', '嗯嗯嗯。', '是的是的。', '好的好的'])
    assert.equal(stopsTracy(said), false, said)
  for (const said of ['对对对。', '好好好。', '是的是的。']) assert.equal(isBackchannel(said), true, said)
  assert.equal(stopsTracy('好，改成红色。'), true)
  assert.equal(isBackchannel('好，改成红色。'), false)
})

test('leaving Voice by voice: the whole phrase asks for it, in each of the eight languages', () => {
  for (const text of [
    'Tắt Voice.',
    'tắt giọng nói',
    'Tắt chế độ giọng nói đi.',
    'Thoát chế độ giọng nói nhé',
    'Turn off voice.',
    'Turn off voice mode, please.',
    'Exit voice mode',
    'Stop voice mode.',
    'Turn voice off, Tracy.',
    'Sprachmodus beenden.',
    'Schalte den Sprachmodus aus',
    'Voice-Modus ausschalten',
    'Désactiver le mode vocal.',
    'Quitte le mode vocal',
    'Disattiva la modalità vocale.',
    'Esci dalla modalità vocale',
    'Desactivar el modo de voz.',
    'Sal del modo de voz',
    'Spraakmodus uitzetten.',
    'Zet spraakmodus uit',
    '关闭语音模式。',
    '退出语音模式吧',
    // Natural forms missing until the council's review (20/10/2026, D4), formal ones too.
    'Schalten Sie den Sprachmodus aus.',
    'Beenden Sie den Sprachmodus, bitte.',
    'Spegni la modalità vocale.',
    'Spegnere la modalità vocale',
    'Schakel de spraakmodus uit.',
    'Spraakmodus uitschakelen',
    'Sors du mode vocal.',
    'Thoát khỏi chế độ giọng nói.',
    'Leave voice.',
    'Tracy, turn off voice mode, thank you.',
    'Tắt voice đi, cảm ơn.',
    // A typographic apostrophe is the plain one.
    'Désactive le mode vocal, s’il te plaît.'
  ])
    assert.equal(isVoiceOff(text), true, text)
  // Inside a longer sentence, or about something else, it is a request: never the way out.
  for (const text of [
    '',
    'Tracy',
    'Tắt',
    'Voice',
    'Tắt voice của nút phát nhạc trên trang chủ',
    'Turn off voice mode on the video section',
    'Can you turn off voice mode later?',
    'Đổi chữ tắt giọng nói thành bật giọng nói',
    'Stop',
    'Dừng lại',
    // The words around it are taken off its two edges only, never out of the middle.
    'Turn off Tracy voice.',
    'Tắt cảm ơn voice',
    'Schalten Sie bitte den Sprachmodus aus und dann weiter',
    // A negation is never taken off to make it fit.
    'Don’t turn off voice mode.',
    'Đừng tắt voice.'
  ])
    assert.equal(isVoiceOff(text), false, text)
})

test('a goodbye said alone ends Voice; inside a request, or "ciao", it does not', () => {
  for (const text of [
    'Tạm biệt.',
    'Tạm biệt nhé, cảm ơn.',
    'Chào tạm biệt Tracy',
    'Goodbye!',
    'Bye.',
    'Okay, bye bye.',
    'Bye-bye',
    'Thanks, goodbye.',
    '再见。',
    'Tschüss!',
    'Au revoir.',
    'Arrivederci',
    'Adiós.',
    'Tot ziens'
  ])
    assert.equal(isGoodbye(text), true, text)
  for (const text of [
    'Ciao',
    'Ciao Tracy',
    'Đổi chữ tạm biệt ở chân trang thành hẹn gặp lại',
    'Add a goodbye message to the footer',
    'Cảm ơn',
    'Okay',
    'Tắt voice'
  ])
    assert.equal(isGoodbye(text), false, text)
})

test('approving a plan by voice: the whole phrase naming the plan, in each of the eight languages', () => {
  for (const text of [
    'Approve this plan.',
    'I approve the plan',
    'Please approve the plan.',
    'Plan approved.',
    'Duyệt kế hoạch này.',
    'Duyệt kế hoạch này nhé.',
    'Phê duyệt kế hoạch này ạ',
    'Tôi đồng ý với kế hoạch này.',
    'Ich genehmige den Plan.',
    'Ich genehmige diesen Plan.',
    'J’approuve ce plan.',
    'J‘approuve ce plan',
    'Approva questo piano.',
    'Approvo questo piano',
    'Apruebo este plan.',
    'Apruebo el plan',
    'Keur dit plan goed.',
    'Ik keur het plan goed',
    'Ik keur dit plan goed, alsjeblieft.',
    '批准这个计划。',
    '我同意这个计划',
    'Approve this plan, Tracy.'
  ])
    assert.equal(isPlanApproval(text), true, text)
  // Never a bare yes, never the word alone, never the phrase inside a longer sentence (council A6).
  for (const text of [
    '',
    'Ừ',
    'Ừ, làm đi.',
    'OK',
    'Yes.',
    'Được.',
    'Đồng ý.',
    'Duyệt',
    'Approve',
    'Approve it.',
    'Đừng duyệt kế hoạch này.',
    'Approve this plan but make it blue.',
    'Duyệt kế hoạch này rồi đổi màu nút sang đỏ',
    'Can you approve this plan later?',
    'Sửa kế hoạch, bỏ bước ba.',
    '好的',
    '批准',
    // The bare infinitive is left out until a native speaker says otherwise (council 20/10/2026, D4).
    'Plan genehmigen.',
    'Den Plan genehmigen',
    'Approuver ce plan',
    'Approuver le plan.',
    'Approvare il piano.',
    'Aprobar el plan.',
    'Aprobar este plan',
    'Het plan goedkeuren.',
    // An acknowledgement beside it is no politeness: "ok", "đi", "thôi" are not taken off a plan.
    'OK, approve the plan please.',
    'Ok, phê duyệt kế hoạch này đi',
    'Thôi, duyệt kế hoạch này.',
    // Negated, conditional, asked or reported: never an approval.
    'Tôi không duyệt kế hoạch này.',
    'Không duyệt kế hoạch này.',
    'Don’t approve the plan.',
    'I don’t approve this plan.',
    'Do not approve the plan',
    'Ich genehmige den Plan nicht.',
    'Je n’approuve pas ce plan.',
    'Non approvo questo piano.',
    'No apruebo este plan.',
    'Ik keur dit plan niet goed.',
    '我不同意这个计划',
    'If it is cheap, approve the plan.',
    'Approve the plan if it is cheap.',
    'Nếu ổn thì duyệt kế hoạch này.',
    'Wenn es passt, genehmige ich den Plan.',
    'Approve this plan?',
    'Duyệt kế hoạch này?',
    'He said approve the plan.'
  ])
    assert.equal(isPlanApproval(text), false, text)
})

test('plan phrases are read only in the locales given; none is verified yet, so none approves by voice', () => {
  // A locale joins only after a native speaker checked its phrases and a real speech run passed.
  // test-quality: contract none is verified yet (council 20/10/2026, D4); adding one is a reviewed change
  assert.deepEqual(PLAN_VOICE_LOCALES, [])
  assert.ok(Object.isFrozen(PLAN_VOICE_LOCALES))
  assert.deepEqual([...PLAN_LOCALES].sort(), ['de', 'en', 'es', 'fr', 'it', 'nl', 'vi', 'zh'])
  assert.equal(isPlanApproval('Duyệt kế hoạch này.', PLAN_VOICE_LOCALES), false)
  assert.equal(isPlanApproval('Duyệt kế hoạch này.', ['en']), false, 'Vietnamese words, English only')
  assert.equal(isPlanApproval('Duyệt kế hoạch này.', ['vi']), true)
  assert.equal(isPlanApproval('Approve this plan.', ['vi', 'en']), true)
  assert.equal(planChange('Sửa kế hoạch, bỏ bước ba.', ['en']), null)
  assert.equal(planChange('Sửa kế hoạch, bỏ bước ba.', ['vi']), 'feedback')
  assert.equal(asksPlanChange('Change the plan to keep the old logo.', []), false)
})

test('a change to the plan, with what to change, is feedback; the lead alone, or an approval, is not', () => {
  for (const text of [
    'Sửa kế hoạch, bỏ bước ba.',
    'Đổi kế hoạch thành chỉ sửa trang chủ.',
    'Change the plan to keep the old logo.',
    'Please revise the plan: no red.',
    'Ändere den Plan: kein Rot.',
    'Modifie le plan pour garder le logo.',
    'Modifica il piano senza rosso.',
    'Cambia el plan: sin rojo.',
    'Pas het plan aan: geen rood.',
    '修改计划，把按钮改成红色'
  ])
    assert.equal(asksPlanChange(text), true, text)
  for (const text of [
    '',
    'Sửa kế hoạch',
    'Change the plan.',
    'Duyệt kế hoạch này.',
    'Đổi màu nút sang đỏ.',
    'Ừ'
  ])
    assert.equal(asksPlanChange(text), false, text)
})

test('a change to the plan with nothing to change, or only a joining word, asks what to change', () => {
  // Found by the council (20/10/2026, D4): "to" and "aan" were taken for the change.
  for (const text of [
    'Sửa kế hoạch.',
    'Sửa kế hoạch này là',
    'Change the plan.',
    'Change the plan to',
    'Please change the plan so',
    'Ändere den Plan.',
    'Passe den Plan an.',
    'Modifie le plan.',
    'Modifica il piano',
    'Cambia el plan.',
    'Pas het plan aan.',
    'Pas het plan aan zodat',
    '修改计划。'
  ]) {
    assert.equal(planChange(text), 'what', text)
    assert.equal(asksPlanChange(text), false, text)
  }
  assert.equal(planChange('Pas het plan aan: geen rood.'), 'feedback')
  assert.equal(planChange('Passe den Plan an, kein Rot.'), 'feedback')
  assert.equal(planChange('Change the plan to keep the old logo.'), 'feedback')
  for (const text of ['', 'Duyệt kế hoạch này.', 'Đổi màu nút sang đỏ.', 'Ừ', 'OK'])
    assert.equal(planChange(text), null, text)
})

test('a clear yes or a clear no to Tracy’s confirmation card, in each of the eight languages', () => {
  for (const text of [
    'Đồng ý.',
    'Có.',
    'Vâng.',
    'Dạ có ạ.',
    'Vâng, đồng ý.',
    'Tôi đồng ý.',
    'Yes.',
    'Yes, go ahead.',
    'Go ahead.',
    'Yes please.',
    'Ja.',
    'Ja, bitte.',
    'Einverstanden.',
    'Oui.',
    'Oui, vas-y.',
    'D’accord.',
    'Sì.',
    'Sì, procedi.',
    'Sí.',
    'Sí, por favor.',
    'De acuerdo.',
    'Ja graag.',
    'Doe maar.',
    'Akkoord.',
    '是的。',
    '确定',
    '同意'
  ])
    assert.equal(confirmReply(text), 'yes', text)
  for (const text of [
    'Không.',
    'Không, giữ lại.',
    'Không đồng ý.',
    'Dạ không ạ.',
    'Đừng.',
    'No.',
    'No, keep it.',
    'Keep it.',
    'No thanks.',
    'Nein.',
    'Nein danke.',
    'Non.',
    'Non merci.',
    'No, grazie.',
    'No, déjalo.',
    'Nee.',
    'Nee, laat maar.',
    '不。',
    '不要',
    '不，保留。',
    // A cancel word is a no to such a card, as a press on "Huỷ" is (#1430).
    'Huỷ.',
    'Hủy.',
    'Cancel.',
    'No, cancel.',
    'Abbrechen.',
    'Annuler.',
    'Annulla.',
    'Cancelar.',
    'Annuleer.',
    '取消。'
  ])
    assert.equal(confirmReply(text), 'no', text)
  // Listening, a yes beside a no, a negation or condition, a question, or more words: neither.
  for (const text of [
    '',
    'Ừ.',
    'Uh.',
    'Ok.',
    'Okay.',
    '好的',
    'Ok thôi.',
    'Thôi.',
    'Dạ.',
    'Yes, no.',
    'Có, không.',
    'Không giữ lại.',
    'Don’t keep it.',
    'If so, yes.',
    'Đồng ý?',
    'Yes?',
    'Yes, but change the title first.',
    'Đồng ý nhưng đổi tiêu đề trước',
    'Delete the other one instead'
  ])
    assert.equal(confirmReply(text), null, text)
})

test('every translation of how to answer a plan quotes phrases the matchers accept, in its own language', () => {
  const quoted = (line) => [...line.matchAll(/[“„«]\s?([^”“»]+?)\s?[”“»]/gu)].map((m) => m[1].trim())
  const files = {
    en: null,
    vi: '../../../locale/tracy-locale-vi/vi/tracy-chat-input.json',
    de: '../../../locale/tracy-locales/de/tracy-chat-input.json',
    fr: '../../../locale/tracy-locales/fr/tracy-chat-input.json',
    it: '../../../locale/tracy-locales/it/tracy-chat-input.json',
    es: '../../../locale/tracy-locales/es/tracy-chat-input.json',
    nl: '../../../locale/tracy-locales/nl/tracy-chat-input.json',
    zh: '../../../locale/tracy-locales/zh/tracy-chat-input.json'
  }
  const english = readFileSync(new URL('../src/client/strings.ts', import.meta.url), 'utf8')
  for (const [lang, file] of Object.entries(files)) {
    const dict = file === null ? null : JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))
    for (const key of ['voiceMode.say.planAsk', 'voiceMode.bar.plan']) {
      const line =
        dict === null
          ? (new RegExp(`'${key.replace(/\./g, '\\.')}':\\s*'([^']+)'`, 'u').exec(english)?.[1] ?? '')
          : dict[key]
      const [approve, change] = quoted(line)
      assert.equal(isPlanApproval(approve ?? ''), true, `${lang} ${key}: “${approve}” approves`)
      assert.equal(asksPlanChange(`${change ?? ''} x`), true, `${lang} ${key}: “${change}” opens a change`)
    }
  }
})

test('every translation of the line asking for a yes or a no names a yes and a no the card takes', () => {
  const files = {
    en: null,
    vi: '../../../locale/tracy-locale-vi/vi/tracy-chat-input.json',
    de: '../../../locale/tracy-locales/de/tracy-chat-input.json',
    fr: '../../../locale/tracy-locales/fr/tracy-chat-input.json',
    it: '../../../locale/tracy-locales/it/tracy-chat-input.json',
    es: '../../../locale/tracy-locales/es/tracy-chat-input.json',
    nl: '../../../locale/tracy-locales/nl/tracy-chat-input.json',
    zh: '../../../locale/tracy-locales/zh/tracy-chat-input.json'
  }
  const english = readFileSync(new URL('../src/client/strings.ts', import.meta.url), 'utf8')
  for (const [lang, file] of Object.entries(files)) {
    const line =
      file === null
        ? (/'voiceMode\.say\.yesOrNo':\s*'([^']+)'/u.exec(english)?.[1] ?? '')
        : JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'))['voiceMode.say.yesOrNo']
    const words = String(line).split(/[\s,.;:!?“”"«»„。，、]+/u)
    assert.ok(
      words.some((word) => confirmReply(word) === 'yes'),
      `${lang}: “${line}” names a yes`
    )
    assert.ok(
      words.some((word) => confirmReply(word) === 'no'),
      `${lang}: “${line}” names a no`
    )
  }
})
