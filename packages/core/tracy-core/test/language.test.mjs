/**
 * Which language a person wrote a message in, and that language's English name.
 *
 * Bug 30/09 (stand, WordPress, `deepseek-flash`): the first two turns of a new conversation were
 * written in English, the comment blocks carried `lang="en"`, yet both answers came in Chinese.
 * Nothing on the turn NAMED the reply's language; "the customer's language" and "the language it was
 * written in" left the model to pick one. The site-tools turn rule now names it, from this reading.
 *
 * The chat input tags each comment block with the same reading (`lang="en"`, F4, stage-5 acceptance
 * 29/09: after one Vietnamese comment, three English comments in the same session were answered in
 * Vietnamese). Its own copy, `comment-language.mjs`, is gone (30/09); the cases below the first five
 * are that copy's tests, now held against the one reading.
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import { languageName, messageLanguage } from '../src/language/index.mjs'

test('an English request is English, even about a Russian or Chinese page', () => {
  assert.equal(messageLanguage('just answer in one sentence: what is this section? change nothing'), 'en')
  assert.equal(messageLanguage('Please change the heading to "Промышленное строительство"'), 'en')
  assert.equal(messageLanguage('Make this title shorter, it reads “关于我们的公司历史”'), 'en')
})

test('a Dutch request with English-overlapping words is Dutch', () => {
  assert.equal(
    messageLanguage('Wat is de titel van mijn homepagina en hoeveel items staan er in het hoofdmenu?'),
    'nl'
  )
  assert.equal(languageName('nl'), 'Dutch')
})

test('English requests with Dutch-looking words remain English', () => {
  assert.equal(messageLanguage('Change menu links on website'), 'en')
  assert.equal(messageLanguage('Please change this vandaag'), 'en')
})

test('Vietnamese, Russian, Chinese, Japanese are read from their own letters', () => {
  assert.equal(messageLanguage('Đổi tiêu đề này thành ngắn hơn nhé'), 'vi')
  assert.equal(messageLanguage('Сделайте этот заголовок короче'), 'ru')
  assert.equal(messageLanguage('把这个标题改短一点'), 'zh')
  assert.equal(messageLanguage('このタイトルを短くしてください'), 'ja')
})

test('mixed: the frame decides, not the words it quotes', () => {
  assert.equal(messageLanguage('Sửa tiêu đề thành "Four core service lines" giúp mình'), 'vi')
  assert.equal(messageLanguage('Change "Thành lập 2004" to "Founded in 2004"'), 'en')
})

test('too little to be sure is nothing, never a guess', () => {
  assert.equal(messageLanguage('ok'), '')
  assert.equal(messageLanguage(''), '')
  assert.equal(messageLanguage(undefined), '')
  assert.equal(messageLanguage('Ändere bitte die Überschrift'), '')
})

test('a code is named in English; a region is dropped; nonsense is nothing', () => {
  assert.equal(languageName('en'), 'English')
  assert.equal(languageName('vi'), 'Vietnamese')
  assert.equal(languageName('ru'), 'Russian')
  assert.equal(languageName('zh'), 'Chinese')
  assert.equal(languageName('en-US'), 'English')
  assert.equal(languageName('pt_BR'), 'Portuguese')
  assert.equal(languageName(''), '')
  assert.equal(languageName('not a code'), '')
  assert.equal(languageName(undefined), '')
})

test('comment corpus: the acceptance comments: English and Vietnamese are told apart', () => {
  assert.equal(messageLanguage('Change this label to: EST. ALPHA'), 'en')
  assert.equal(messageLanguage('No, make it: EST. BRAVO'), 'en')
  assert.equal(messageLanguage('I still want EST. ALPHA, keep it'), 'en')
  assert.equal(messageLanguage('Ask for a price BRAVO — go with that one'), 'en')
  assert.equal(messageLanguage('which font family is this? Answer only, change nothing.'), 'en')
  assert.equal(messageLanguage('Đổi chữ nút này thành: Nhận báo giá'), 'vi')
  assert.equal(messageLanguage('chữ này to hơn một chút'), 'vi')
})

test('comment corpus: words quoted from the page do not decide the language', () => {
  assert.equal(messageLanguage('Change this heading to "Thành lập năm 2004"'), 'en')
  assert.equal(messageLanguage('Đổi tiêu đề thành “Get a quote today”'), 'vi')
})

test('comment corpus: CJK, Hangul and Cyrillic scripts', () => {
  assert.equal(messageLanguage('把这个标题改成欢迎光临'), 'zh')
  assert.equal(messageLanguage('このボタンの文字を大きくしてください'), 'ja')
  assert.equal(messageLanguage('이 제목을 바꿔 주세요'), 'ko')
  assert.equal(messageLanguage('Сделайте этот заголовок больше'), 'ru')
  assert.equal(messageLanguage('Зробіть цей заголовок більшим'), 'uk')
})

test('comment corpus: not sure → no tag', () => {
  // Vietnamese typed without its marks, one English-looking word, other Latin languages.
  assert.equal(messageLanguage('doi chu nay thanh mau do'), '')
  assert.equal(messageLanguage('Bigger'), '')
  assert.equal(messageLanguage('Le bouton a une couleur trop forte'), '')
  assert.equal(messageLanguage('Mach den Text größer'), '')
  assert.equal(messageLanguage('Cambia el texto a azul'), '')
  // As much English as Vietnamese.
  assert.equal(messageLanguage('Change it: Thành lập năm'), '')
  // Cyrillic without a letter only Russian or Ukrainian has.
  assert.equal(messageLanguage('Добре'), '')
  assert.equal(messageLanguage(''), '')
  assert.equal(messageLanguage(undefined), '')
})

test('the reply language of a chat: its main language, unless the latest message is clearly another', async () => {
  const { chatReplyLanguage, languageScores } = await import('../src/language/index.mjs')
  // A Vietnamese chat: a request that switches to English half-way still gets a Vietnamese reply.
  assert.equal(
    chatReplyLanguage(
      'Đổi màu nền trang chủ sang xanh đậm and add a contact button under the headline.',
      'vi'
    ),
    'vi'
  )
  assert.equal(
    chatReplyLanguage('Please make the hero section darker. Và thêm nút liên hệ dưới tiêu đề.', 'vi'),
    'vi'
  )
  // A brand or a borrowed term does not switch it, nor does a message that reads as unsure.
  assert.equal(chatReplyLanguage('Thêm logo Tracy vào header và đổi font chữ sang Inter', 'vi'), 'vi')
  assert.equal(chatReplyLanguage('ok', 'vi'), 'vi')
  // A message plainly in another language is answered in it, for that turn.
  assert.equal(
    chatReplyLanguage('Make the hero section darker and add a contact button under the headline.', 'vi'),
    'en'
  )
  assert.equal(chatReplyLanguage('トップページの見出しを変更してください', 'vi'), 'ja')
  // Vietnamese is counted by its own letters only, so one such word keeps a half-Vietnamese request.
  assert.equal(chatReplyLanguage('Làm cho cái hero section to hơn, change the font to bold', 'vi'), 'vi')
  // A label quoted from the page is the page's words, not the person's.
  assert.equal(chatReplyLanguage('Change the heading to "Dịch vụ của chúng tôi" please', 'vi'), 'en')
  // An English chat keeps English for a mixed message, and has no main language before its first one.
  assert.equal(chatReplyLanguage('Make the header bigger, đổi màu sang xanh', 'en'), 'en')
  assert.equal(chatReplyLanguage('Thêm nút liên hệ ở cuối trang giúp mình', 'en'), 'vi')
  // English and Dutch share short words: a Dutch question with "is" and "items" in it is Dutch.
  assert.equal(
    chatReplyLanguage(
      'Wat is de titel van mijn homepagina en hoeveel items staan er in het hoofdmenu?',
      'en'
    ),
    'nl'
  )
  // Between Russian and Ukrainian, the letters that tell them apart decide.
  assert.equal(chatReplyLanguage('Змініть заголовок на головній сторінці', 'ru'), 'uk')
  // Kanji alone is Japanese too, in a Japanese chat.
  assert.equal(chatReplyLanguage('見出し変更', 'ja'), 'ja')
  assert.equal(chatReplyLanguage('Make it bigger please', ''), 'en')
  // The scores are the ones the reading decides on.
  assert.deepEqual((({ en, vi }) => ({ en, vi }))(languageScores('Đổi màu nền and add the button')), {
    en: 4,
    vi: 2
  })
})

// ── A language the reading does not know is never read as Dutch (22/10/2026) ─────────────────────────────
// A Norwegian customer's requests ("Kan du gjøre hovedmenyen horisontal?") were read as Dutch, the turn
// notice said "Reply in Dutch", and the customer reported the site had switched to Dutch. Dutch and the
// Nordic, German, French, Spanish, Portuguese and Italian languages share short words ("kan", "pagina"),
// so Dutch now wins only while its words outnumber the signs of another Latin language. Measured on these
// sentences before the change: 18 of 75 read as Dutch; after: 0. Nothing here asks the reading to NAME
// these languages: '' (or 'en', for a message with English words in it) is the right answer.
const UNSUPPORTED = {
  Norwegian: [
    'Kan du gjøre hovedmenyen horisontal?',
    'Menyen er ikke horisontal, kan du fikse det',
    'Kan du legge til en modul med bilde og tekst under toppen',
    'Jeg vil endre telefonnummeret i bunnteksten',
    'Hvordan bytter jeg denne til livesite?',
    'Det stemmer ikke, det endrer seg ikke',
    'Kan du endre fargen på knappen til grønn?',
    'Teksten under bildet er for liten, kan du gjøre den større',
    'Vi trenger en kontaktside med kart og åpningstider',
    'Jeg ser ikke endringen, kan du sjekke igjen',
    'Fjern banneret øverst på forsiden'
  ],
  Danish: [
    'Kan du gøre hovedmenuen vandret?',
    'Jeg vil gerne ændre telefonnummeret i bunden af siden',
    'Kan du tilføje et billede og noget tekst under overskriften',
    'Hvordan gør jeg siden live?',
    'Kan du ændre farven på knappen til grøn?',
    'Teksten under billedet er for lille, kan du gøre den større',
    'Vi har brug for en kontaktside med kort og åbningstider',
    'Jeg kan ikke se ændringen, kan du tjekke igen'
  ],
  Swedish: [
    'Kan du göra huvudmenyn horisontell?',
    'Jag vill ändra telefonnumret i sidfoten',
    'Kan du lägga till en bild och text under rubriken',
    'Hur gör jag sidan publik?',
    'Kan du ändra färgen på knappen till grön?',
    'Texten under bilden är för liten, kan du göra den större',
    'Vi behöver en kontaktsida med karta och öppettider',
    'Jag ser inte ändringen, kan du kontrollera igen'
  ],
  German: [
    'Kannst du das Hauptmenü waagerecht machen?',
    'Ich möchte die Telefonnummer in der Fußzeile ändern',
    'Kannst du ein Bild und einen Text unter der Überschrift hinzufügen',
    'Wie kann ich die Seite veröffentlichen?',
    'Kannst du die Farbe des Buttons auf Grün ändern?',
    'Der Text unter dem Bild ist zu klein, mach ihn bitte größer',
    'Wir brauchen eine Kontaktseite mit Karte und Öffnungszeiten',
    'Ich sehe die Änderung nicht, bitte prüfe es noch einmal'
  ],
  French: [
    "Peux-tu mettre le menu principal à l'horizontale ?",
    'Je voudrais changer le numéro de téléphone en bas de la page',
    'Peux-tu ajouter une image et du texte sous le titre ?',
    'Comment publier mon site ?',
    'Peux-tu changer la couleur du bouton en vert ?',
    "Le texte sous l'image est trop petit, peux-tu l'agrandir",
    "Nous avons besoin d'une page contact avec une carte et les horaires",
    'Je ne vois pas le changement, peux-tu vérifier encore'
  ],
  Spanish: [
    '¿Puedes poner el menú principal en horizontal?',
    'Quiero cambiar el número de teléfono del pie de página',
    '¿Puedes añadir una imagen y un texto debajo del título?',
    '¿Cómo publico mi sitio?',
    '¿Puedes cambiar el color del botón a verde?',
    'El texto debajo de la imagen es muy pequeño, ¿puedes hacerlo más grande?',
    'Necesitamos una página de contacto con mapa y horarios',
    'No veo el cambio, ¿puedes comprobarlo otra vez?'
  ],
  Italian: [
    'Puoi mettere il menu principale in orizzontale?',
    'Vorrei cambiare il numero di telefono nel piè di pagina',
    "Puoi aggiungere un'immagine e un testo sotto il titolo?",
    'Come pubblico il mio sito?',
    'Puoi cambiare il colore del pulsante in verde?',
    "Il testo sotto l'immagine è troppo piccolo, puoi ingrandirlo",
    'Abbiamo bisogno di una pagina contatti con mappa e orari',
    'Non vedo la modifica, puoi controllare di nuovo?'
  ],
  Portuguese: [
    'Pode colocar o menu principal na horizontal?',
    'Quero mudar o número de telefone no rodapé',
    'Pode adicionar uma imagem e um texto abaixo do título?',
    'Como publico o meu site?',
    'Pode mudar a cor do botão para verde?',
    'O texto abaixo da imagem está muito pequeno, pode aumentá-lo',
    'Precisamos de uma página de contacto com mapa e horários',
    'Não vejo a alteração, pode verificar outra vez?'
  ],
  Polish: ['Czy możesz zrobić menu główne poziomo?', 'Chcę zmienić numer telefonu w stopce'],
  Finnish: ['Voitko tehdä päävalikosta vaakasuuntaisen?', 'Haluan vaihtaa puhelinnumeron alatunnisteessa'],
  Turkish: ['Ana menüyü yatay yapabilir misin?', 'Alt bilgideki telefon numarasını değiştirmek istiyorum'],
  Indonesian: [
    'Bisakah kamu membuat menu utama menjadi horizontal?',
    'Saya ingin mengganti nomor telepon di bagian bawah halaman'
  ]
}

test('a sentence in a Latin language the reading does not know is never read as Dutch', () => {
  let counted = 0
  for (const [language, sentences] of Object.entries(UNSUPPORTED))
    for (const sentence of sentences) {
      counted += 1
      const read = messageLanguage(sentence)
      assert.ok(read === '' || read === 'en', `${language}: "${sentence}" was read as "${read}"`)
    }
  assert.equal(counted, 75)
})

test('Dutch with short words other languages also use still reads as Dutch', () => {
  // "je" (you), "les" (lesson), "pas" (just now), "mes" (knife), "los" (loose) are Dutch words that the
  // French, Spanish and Italian lists must never claim.
  assert.equal(messageLanguage('Waarom is het logo niet zichtbaar op de pagina?'), 'nl')
  assert.equal(messageLanguage('Ik zie de wijziging niet, kun je het nog een keer controleren'), 'nl')
  assert.equal(messageLanguage('Dit is pas de tweede les, maar het menu staat niet goed'), 'nl')
  assert.equal(messageLanguage('Het mes staat los op de pagina, kun je het weghalen?'), 'nl')
})

test('Dutch needs more words than the signs of another language, so a tie is not Dutch', () => {
  assert.equal(messageLanguage('Kan du gjøre hovedmenyen horisontal?'), '')
  assert.equal(messageLanguage('Hvordan bytter jeg denne til livesite?'), '')
})

test('a Vietnamese message is not touched by the other-language signs', () => {
  assert.equal(messageLanguage('Đổi số điện thoại ở chân trang nhé'), 'vi')
  assert.equal(messageLanguage('Làm cho menu chính nằm ngang'), 'vi')
})
