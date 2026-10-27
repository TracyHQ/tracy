/**
 * The few words the THEME says itself, per locale. Everything else a visitor reads is content —
 * the `site/site/<locale>` entry carries the topbar, header, footer, search and 404 labels — so
 * this stays small on purpose: a language's own name, the date shape, the reading-time label,
 * two fallbacks the views use when a chrome field is empty, the accessible names of the pagination
 * arrows and the copy-link button, and the style guide sample's own labels (TCH #1013, LANG-2).
 *
 * The list of locales is `template.config.json`; a locale missing here reads as English rather
 * than crashing the page, and adding one is one object below plus its seed.
 */
export interface LocaleWords {
  /** The language's name in itself, for the switcher. */
  name: string
  /** Accessible name of the header's mobile menu button. */
  menu: string
  /** Placeholder of the language dialog's filter box (shown from 9 languages up). */
  languageFilter: string
  /** Shown in the language dialog when the filter matches nothing. */
  noLanguageMatch: string
  pages: string
  all: string
  /** Accessible names of the pagination's arrows. */
  previous: string
  next: string
  /** Accessible name of an article's copy-link button. */
  copyLink: string
  /** The style guide sample's own words (`KitStyleGuide.astro`): type roles, button kinds, the empty text area. */
  kit: {
    body: string
    eyebrow: string
    meta: string
    primary: string
    secondary: string
    outline: string
    textLink: string
    disabled: string
    textarea: string
    /** What the module position map says in brackets after `hero` and `component`. */
    banner: string
    mainContent: string
    /** The colour names of the swatches (the slides sample names the same four in its seed). */
    swatches: { ink: string; paper: string; forest: string; signal: string; line: string }
  }
  minRead: (minutes: number) => string
  date: (day: number, month: number, year: number) => string
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number): string => String(n).padStart(2, '0')

/**
 * The date shape of a locale this file does not spell out by hand: ICU already knows how each
 * language writes `12 Aug 2026`, and asking it is the only answer that stays right as locales are
 * added. The calendar is named on purpose — Thai defaults to the Buddhist era, and a news item
 * dated 2569 is a bug no one would look for.
 */
function intlDate(locale: string): (day: number, month: number, year: number) => string {
  const fmt = new Intl.DateTimeFormat(`${locale}-u-ca-gregory`, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  })
  return (day, month, year) => fmt.format(Date.UTC(year, month, day))
}

export const WORDS: Record<string, LocaleWords> = {
  en: {
    name: 'English',
    menu: 'Menu',
    languageFilter: 'Filter languages',
    noLanguageMatch: 'No matching results',
    pages: 'Pages',
    all: 'All',
    previous: 'Previous page',
    next: 'Next page',
    copyLink: 'Copy link',
    kit: {
      body: 'Body',
      eyebrow: 'Eyebrow',
      meta: 'Meta',
      primary: 'Primary',
      secondary: 'Secondary',
      outline: 'Outline',
      textLink: 'Text link',
      disabled: 'Disabled',
      textarea: 'Text area',
      banner: 'banner',
      mainContent: 'main content',
      swatches: { ink: 'Ink', paper: 'Paper', forest: 'Forest', signal: 'Signal', line: 'Line' }
    },
    minRead: (m) => `${m} min read`,
    date: (day, month, year) => `${day} ${MONTHS_EN[month]} ${year}`
  },
  ru: {
    name: 'Русский',
    menu: 'Меню',
    languageFilter: 'Фильтр языков',
    noLanguageMatch: 'Совпадений не найдено',
    pages: 'Страницы',
    all: 'Все',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    copyLink: 'Копировать ссылку',
    kit: {
      body: 'Основной текст',
      eyebrow: 'Надзаголовок',
      meta: 'Метаданные',
      primary: 'Основная',
      secondary: 'Вторичная',
      outline: 'Контурная',
      textLink: 'Текстовая ссылка',
      disabled: 'Неактивна',
      textarea: 'Многострочное поле',
      banner: 'баннер',
      mainContent: 'основное содержимое',
      swatches: { ink: 'Чернила', paper: 'Бумага', forest: 'Лес', signal: 'Сигнал', line: 'Линия' }
    },
    minRead: (m) => `${m} мин чтения`,
    date: (day, month, year) => `${two(day)}.${two(month + 1)}.${year}`
  },
  vi: {
    name: 'Tiếng Việt',
    menu: 'Menu',
    languageFilter: 'Lọc ngôn ngữ',
    noLanguageMatch: 'Không có kết quả phù hợp',
    pages: 'Trang',
    all: 'Tất cả',
    previous: 'Trang trước',
    next: 'Trang sau',
    copyLink: 'Sao chép liên kết',
    kit: {
      body: 'Văn bản',
      eyebrow: 'Tiêu đề phụ',
      meta: 'Thông tin phụ',
      primary: 'Chính',
      secondary: 'Phụ',
      outline: 'Viền',
      textLink: 'Liên kết chữ',
      disabled: 'Vô hiệu',
      textarea: 'Vùng văn bản',
      banner: 'biểu ngữ',
      mainContent: 'nội dung chính',
      swatches: { ink: 'Mực', paper: 'Giấy', forest: 'Rừng', signal: 'Tín hiệu', line: 'Đường kẻ' }
    },
    minRead: (m) => `${m} phút đọc`,
    date: (day, month, year) => `${two(day)}/${two(month + 1)}/${year}`
  },
  zh: {
    name: '中文',
    menu: '菜单',
    languageFilter: '筛选语言',
    noLanguageMatch: '没有匹配的结果',
    pages: '页面',
    all: '全部',
    previous: '上一页',
    next: '下一页',
    copyLink: '复制链接',
    kit: {
      body: '正文',
      eyebrow: '眉题',
      meta: '元信息',
      primary: '主要',
      secondary: '次要',
      outline: '描边',
      textLink: '文字链接',
      disabled: '已禁用',
      textarea: '多行文本框',
      banner: '横幅',
      mainContent: '主要内容',
      swatches: { ink: '墨色', paper: '纸色', forest: '森林', signal: '信号', line: '线条' }
    },
    minRead: (m) => `${m} 分钟阅读`,
    date: (day, month, year) => `${year}年${month + 1}月${day}日`
  },
  // ── The 36 locales added with the 1.2.0 seed ────────────────────────────────────────────────
  // Their own names and date shapes come from ICU; the six interface words were translated with
  // the seed and are edited here, not guessed at render time. Adding a locale is one object here,
  // its tag in template.config.json, and its rows in seed/seed.json — nothing else.
  af: {
    name: 'Afrikaans',
    menu: 'Kieslys',
    languageFilter: 'Filter tale',
    noLanguageMatch: 'Geen passende resultate nie',
    pages: 'Bladsye',
    all: 'Alle',
    previous: 'Vorige bladsy',
    next: 'Volgende bladsy',
    copyLink: 'Kopieer skakel',
    kit: {
      body: 'Hoofteks',
      eyebrow: 'Bo-opskrif',
      meta: 'Metadata',
      primary: 'Primêr',
      secondary: 'Sekondêr',
      outline: 'Omlyn',
      textLink: 'Teksskakel',
      disabled: 'Gedeaktiveer',
      textarea: 'Teksarea',
      banner: 'banier',
      mainContent: 'hoofinhoud',
      swatches: { ink: 'Ink', paper: 'Papier', forest: 'Woud', signal: 'Sein', line: 'Lyn' }
    },
    minRead: (m) => '{n} min leestyd'.replace('{n}', String(m)),
    date: intlDate('af')
  },
  be: {
    name: 'Беларуская',
    menu: 'Меню',
    languageFilter: 'Фільтр моў',
    noLanguageMatch: 'Няма супадзенняў',
    pages: 'Старонкі',
    all: 'Усе',
    previous: 'Папярэдняя старонка',
    next: 'Наступная старонка',
    copyLink: 'Скапіяваць спасылку',
    kit: {
      body: 'Асноўны тэкст',
      eyebrow: 'Надзагаловак',
      meta: 'Метаданыя',
      primary: 'Асноўная',
      secondary: 'Другасная',
      outline: 'Контурная',
      textLink: 'Тэкставая спасылка',
      disabled: 'Неактыўная',
      textarea: 'Тэкставае поле',
      banner: 'банер',
      mainContent: 'асноўнае змесціва',
      swatches: { ink: 'Чарніла', paper: 'Папера', forest: 'Лес', signal: 'Сігнальны', line: 'Лінія' }
    },
    minRead: (m) => '{n} хв чытання'.replace('{n}', String(m)),
    date: intlDate('be')
  },
  bg: {
    name: 'Български',
    menu: 'Меню',
    languageFilter: 'Филтриране на езици',
    noLanguageMatch: 'Няма съвпадащи резултати',
    pages: 'Страници',
    all: 'Всички',
    previous: 'Предишна страница',
    next: 'Следваща страница',
    copyLink: 'Копиране на връзката',
    kit: {
      body: 'Основен текст',
      eyebrow: 'Надзаглавие',
      meta: 'Метаданни',
      primary: 'Основен',
      secondary: 'Вторичен',
      outline: 'Контурен',
      textLink: 'Текстова връзка',
      disabled: 'Неактивен',
      textarea: 'Текстово поле',
      banner: 'банер',
      mainContent: 'основно съдържание',
      swatches: { ink: 'Мастило', paper: 'Хартия', forest: 'Гора', signal: 'Сигнал', line: 'Линия' }
    },
    minRead: (m) => '{n} мин. четене'.replace('{n}', String(m)),
    date: intlDate('bg')
  },
  ca: {
    name: 'Català',
    menu: 'Menú',
    languageFilter: 'Filtra llengües',
    noLanguageMatch: 'Sense resultats',
    pages: 'Pàgines',
    all: 'Totes',
    previous: 'Pàgina anterior',
    next: 'Pàgina següent',
    copyLink: 'Copia l’enllaç',
    kit: {
      body: 'Cos del text',
      eyebrow: 'Avantítol',
      meta: 'Metadades',
      primary: 'Principal',
      secondary: 'Secundari',
      outline: 'Contorn',
      textLink: 'Enllaç de text',
      disabled: 'Desactivat',
      textarea: 'Àrea de text',
      banner: 'bàner',
      mainContent: 'contingut principal',
      swatches: { ink: 'Tinta', paper: 'Paper', forest: 'Bosc', signal: 'Senyal', line: 'Línia' }
    },
    minRead: (m) => '{n} min de lectura'.replace('{n}', String(m)),
    date: intlDate('ca')
  },
  cs: {
    name: 'Čeština',
    menu: 'Menu',
    languageFilter: 'Filtrovat jazyky',
    noLanguageMatch: 'Žádné odpovídající výsledky',
    pages: 'Stránky',
    all: 'Vše',
    previous: 'Předchozí stránka',
    next: 'Další stránka',
    copyLink: 'Kopírovat odkaz',
    kit: {
      body: 'Základní text',
      eyebrow: 'Nadtitulek',
      meta: 'Metadata',
      primary: 'Primární',
      secondary: 'Sekundární',
      outline: 'Obrysové',
      textLink: 'Textový odkaz',
      disabled: 'Neaktivní',
      textarea: 'Textové pole',
      banner: 'banner',
      mainContent: 'hlavní obsah',
      swatches: { ink: 'Inkoust', paper: 'Papír', forest: 'Les', signal: 'Signální', line: 'Linka' }
    },
    minRead: (m) => '{n} min čtení'.replace('{n}', String(m)),
    date: intlDate('cs')
  },
  cy: {
    name: 'Cymraeg',
    menu: 'Dewislen',
    languageFilter: 'Hidlo ieithoedd',
    noLanguageMatch: 'Dim canlyniadau cyfatebol',
    pages: 'Tudalennau',
    all: 'Pob un',
    previous: 'Tudalen flaenorol',
    next: 'Tudalen nesaf',
    copyLink: 'Copïo’r ddolen',
    kit: {
      body: 'Corff y testun',
      eyebrow: 'Uwchbennawd',
      meta: 'Metadata',
      primary: 'Prif',
      secondary: 'Eilaidd',
      outline: 'Amlinell',
      textLink: 'Dolen testun',
      disabled: 'Wedi’i analluogi',
      textarea: 'Ardal testun',
      banner: 'baner',
      mainContent: 'prif gynnwys',
      swatches: { ink: 'Inc', paper: 'Papur', forest: 'Coedwig', signal: 'Arwydd', line: 'Llinell' }
    },
    minRead: (m) => '{n} munud o ddarllen'.replace('{n}', String(m)),
    date: intlDate('cy')
  },
  da: {
    name: 'Dansk',
    menu: 'Menu',
    languageFilter: 'Filtrer sprog',
    noLanguageMatch: 'Ingen matchende resultater',
    pages: 'Sider',
    all: 'Alle',
    previous: 'Forrige side',
    next: 'Næste side',
    copyLink: 'Kopiér link',
    kit: {
      body: 'Brødtekst',
      eyebrow: 'Overrubrik',
      meta: 'Metadata',
      primary: 'Primær',
      secondary: 'Sekundær',
      outline: 'Kontur',
      textLink: 'Tekstlink',
      disabled: 'Deaktiveret',
      textarea: 'Tekstfelt',
      banner: 'banner',
      mainContent: 'hovedindhold',
      swatches: { ink: 'Blæk', paper: 'Papir', forest: 'Skov', signal: 'Signal', line: 'Linje' }
    },
    minRead: (m) => '{n} min læsning'.replace('{n}', String(m)),
    date: intlDate('da')
  },
  de: {
    name: 'Deutsch',
    menu: 'Menü',
    languageFilter: 'Sprachen filtern',
    noLanguageMatch: 'Keine passenden Ergebnisse',
    pages: 'Seiten',
    all: 'Alle',
    previous: 'Vorherige Seite',
    next: 'Nächste Seite',
    copyLink: 'Link kopieren',
    kit: {
      body: 'Fließtext',
      eyebrow: 'Dachzeile',
      meta: 'Metadaten',
      primary: 'Primär',
      secondary: 'Sekundär',
      outline: 'Kontur',
      textLink: 'Textlink',
      disabled: 'Deaktiviert',
      textarea: 'Textbereich',
      banner: 'Banner',
      mainContent: 'Hauptinhalt',
      swatches: { ink: 'Tinte', paper: 'Papier', forest: 'Wald', signal: 'Signal', line: 'Linie' }
    },
    minRead: (m) => '{n} Min. Lesezeit'.replace('{n}', String(m)),
    date: intlDate('de')
  },
  el: {
    name: 'Ελληνικά',
    menu: 'Μενού',
    languageFilter: 'Φιλτράρισμα γλωσσών',
    noLanguageMatch: 'Δεν βρέθηκαν αποτελέσματα',
    pages: 'Σελίδες',
    all: 'Όλα',
    previous: 'Προηγούμενη σελίδα',
    next: 'Επόμενη σελίδα',
    copyLink: 'Αντιγραφή συνδέσμου',
    kit: {
      body: 'Κυρίως κείμενο',
      eyebrow: 'Υπέρτιτλος',
      meta: 'Μεταδεδομένα',
      primary: 'Κύριο',
      secondary: 'Δευτερεύον',
      outline: 'Περίγραμμα',
      textLink: 'Σύνδεσμος κειμένου',
      disabled: 'Απενεργοποιημένο',
      textarea: 'Περιοχή κειμένου',
      banner: 'μπάνερ',
      mainContent: 'κύριο περιεχόμενο',
      swatches: { ink: 'Μελάνι', paper: 'Χαρτί', forest: 'Δάσος', signal: 'Σήμα', line: 'Γραμμή' }
    },
    minRead: (m) => '{n} λεπτά ανάγνωση'.replace('{n}', String(m)),
    date: intlDate('el')
  },
  es: {
    name: 'Español',
    menu: 'Menú',
    languageFilter: 'Filtrar idiomas',
    noLanguageMatch: 'No hay resultados coincidentes',
    pages: 'Páginas',
    all: 'Todos',
    previous: 'Página anterior',
    next: 'Página siguiente',
    copyLink: 'Copiar enlace',
    kit: {
      body: 'Cuerpo de texto',
      eyebrow: 'Antetítulo',
      meta: 'Metadatos',
      primary: 'Principal',
      secondary: 'Secundario',
      outline: 'Contorno',
      textLink: 'Enlace de texto',
      disabled: 'Desactivado',
      textarea: 'Área de texto',
      banner: 'banner',
      mainContent: 'contenido principal',
      swatches: { ink: 'Tinta', paper: 'Papel', forest: 'Bosque', signal: 'Señal', line: 'Línea' }
    },
    minRead: (m) => '{n} min de lectura'.replace('{n}', String(m)),
    date: intlDate('es')
  },
  et: {
    name: 'Eesti',
    menu: 'Menüü',
    languageFilter: 'Filtreeri keeli',
    noLanguageMatch: 'Vasteid ei leitud',
    pages: 'Lehed',
    all: 'Kõik',
    previous: 'Eelmine leht',
    next: 'Järgmine leht',
    copyLink: 'Kopeeri link',
    kit: {
      body: 'Põhitekst',
      eyebrow: 'Ülapealkiri',
      meta: 'Metaandmed',
      primary: 'Esmane',
      secondary: 'Teisene',
      outline: 'Kontuur',
      textLink: 'Tekstilink',
      disabled: 'Keelatud',
      textarea: 'Tekstiala',
      banner: 'bänner',
      mainContent: 'põhisisu',
      swatches: { ink: 'Tint', paper: 'Paber', forest: 'Mets', signal: 'Signaal', line: 'Joon' }
    },
    minRead: (m) => '{n} min lugemist'.replace('{n}', String(m)),
    date: intlDate('et')
  },
  fi: {
    name: 'Suomi',
    menu: 'Valikko',
    languageFilter: 'Suodata kieliä',
    noLanguageMatch: 'Ei vastaavia tuloksia',
    pages: 'Sivut',
    all: 'Kaikki',
    previous: 'Edellinen sivu',
    next: 'Seuraava sivu',
    copyLink: 'Kopioi linkki',
    kit: {
      body: 'Leipäteksti',
      eyebrow: 'Yläotsikko',
      meta: 'Metatiedot',
      primary: 'Ensisijainen',
      secondary: 'Toissijainen',
      outline: 'Ääriviiva',
      textLink: 'Tekstilinkki',
      disabled: 'Ei käytössä',
      textarea: 'Tekstialue',
      banner: 'banneri',
      mainContent: 'pääsisältö',
      swatches: { ink: 'Muste', paper: 'Paperi', forest: 'Metsä', signal: 'Signaali', line: 'Viiva' }
    },
    minRead: (m) => '{n} min lukuaika'.replace('{n}', String(m)),
    date: intlDate('fi')
  },
  fr: {
    name: 'Français',
    menu: 'Menu',
    languageFilter: 'Filtrer les langues',
    noLanguageMatch: 'Aucun résultat',
    pages: 'Pages',
    all: 'Tous',
    previous: 'Page précédente',
    next: 'Page suivante',
    copyLink: 'Copier le lien',
    kit: {
      body: 'Corps de texte',
      eyebrow: 'Surtitre',
      meta: 'Métadonnées',
      primary: 'Principal',
      secondary: 'Secondaire',
      outline: 'Contour',
      textLink: 'Lien texte',
      disabled: 'Désactivé',
      textarea: 'Zone de texte',
      banner: 'bannière',
      mainContent: 'contenu principal',
      swatches: { ink: 'Encre', paper: 'Papier', forest: 'Forêt', signal: 'Signal', line: 'Ligne' }
    },
    minRead: (m) => '{n} min de lecture'.replace('{n}', String(m)),
    date: intlDate('fr')
  },
  ga: {
    name: 'Gaeilge',
    menu: 'Roghchlár',
    languageFilter: 'Scag teangacha',
    noLanguageMatch: 'Níl aon torthaí comhoiriúnacha',
    pages: 'Leathanaigh',
    all: 'Uile',
    previous: 'Leathanach roimhe seo',
    next: 'An chéad leathanach eile',
    copyLink: 'Cóipeáil an nasc',
    kit: {
      body: 'Corp an téacs',
      eyebrow: 'Forcheannteideal',
      meta: 'Meiteashonraí',
      primary: 'Príomhúil',
      secondary: 'Tánaisteach',
      outline: 'Imlíne',
      textLink: 'Nasc téacs',
      disabled: 'Díchumasaithe',
      textarea: 'Limistéar téacs',
      banner: 'meirge',
      mainContent: 'príomhábhar',
      swatches: { ink: 'Dúch', paper: 'Páipéar', forest: 'Foraois', signal: 'Comhartha', line: 'Líne' }
    },
    minRead: (m) => '{n} nóiméad léitheoireachta'.replace('{n}', String(m)),
    date: intlDate('ga')
  },
  hr: {
    name: 'Hrvatski',
    menu: 'Izbornik',
    languageFilter: 'Filtriraj jezike',
    noLanguageMatch: 'Nema odgovarajućih rezultata',
    pages: 'Stranice',
    all: 'Sve',
    previous: 'Prethodna stranica',
    next: 'Sljedeća stranica',
    copyLink: 'Kopiraj poveznicu',
    kit: {
      body: 'Osnovni tekst',
      eyebrow: 'Nadnaslov',
      meta: 'Metapodaci',
      primary: 'Primarni',
      secondary: 'Sekundarni',
      outline: 'Obrub',
      textLink: 'Tekstna poveznica',
      disabled: 'Onemogućeno',
      textarea: 'Tekstno polje',
      banner: 'banner',
      mainContent: 'glavni sadržaj',
      swatches: { ink: 'Tinta', paper: 'Papir', forest: 'Šuma', signal: 'Signalna', line: 'Linija' }
    },
    minRead: (m) => '{n} min čitanja'.replace('{n}', String(m)),
    date: intlDate('hr')
  },
  hu: {
    name: 'Magyar',
    menu: 'Menü',
    languageFilter: 'Nyelvek szűrése',
    noLanguageMatch: 'Nincs találat',
    pages: 'Oldalak',
    all: 'Összes',
    previous: 'Előző oldal',
    next: 'Következő oldal',
    copyLink: 'Hivatkozás másolása',
    kit: {
      body: 'Törzsszöveg',
      eyebrow: 'Felülcím',
      meta: 'Metaadatok',
      primary: 'Elsődleges',
      secondary: 'Másodlagos',
      outline: 'Körvonalas',
      textLink: 'Szöveges hivatkozás',
      disabled: 'Letiltva',
      textarea: 'Szövegmező',
      banner: 'banner',
      mainContent: 'fő tartalom',
      swatches: { ink: 'Tinta', paper: 'Papír', forest: 'Erdőzöld', signal: 'Jelzőszín', line: 'Vonal' }
    },
    minRead: (m) => '{n} perc olvasás'.replace('{n}', String(m)),
    date: intlDate('hu')
  },
  it: {
    name: 'Italiano',
    menu: 'Menu',
    languageFilter: 'Filtra lingue',
    noLanguageMatch: 'Nessun risultato corrispondente',
    pages: 'Pagine',
    all: 'Tutti',
    previous: 'Pagina precedente',
    next: 'Pagina successiva',
    copyLink: 'Copia link',
    kit: {
      body: 'Corpo del testo',
      eyebrow: 'Occhiello',
      meta: 'Metadati',
      primary: 'Primario',
      secondary: 'Secondario',
      outline: 'Contorno',
      textLink: 'Link testuale',
      disabled: 'Disattivato',
      textarea: 'Area di testo',
      banner: 'banner',
      mainContent: 'contenuto principale',
      swatches: { ink: 'Inchiostro', paper: 'Carta', forest: 'Foresta', signal: 'Segnale', line: 'Linea' }
    },
    minRead: (m) => '{n} min di lettura'.replace('{n}', String(m)),
    date: intlDate('it')
  },
  ja: {
    name: '日本語',
    menu: 'メニュー',
    languageFilter: '言語を絞り込む',
    noLanguageMatch: '一致する結果がありません',
    pages: 'ページ',
    all: 'すべて',
    previous: '前のページ',
    next: '次のページ',
    copyLink: 'リンクをコピー',
    kit: {
      body: '本文',
      eyebrow: 'アイブロウ',
      meta: 'メタ情報',
      primary: 'プライマリ',
      secondary: 'セカンダリ',
      outline: 'アウトライン',
      textLink: 'テキストリンク',
      disabled: '無効',
      textarea: 'テキストエリア',
      banner: 'バナー',
      mainContent: 'メインコンテンツ',
      swatches: { ink: 'インク', paper: 'ペーパー', forest: 'フォレスト', signal: 'シグナル', line: 'ライン' }
    },
    minRead: (m) => '{n}分で読めます'.replace('{n}', String(m)),
    date: intlDate('ja')
  },
  ka: {
    name: 'ქართული',
    menu: 'მენიუ',
    languageFilter: 'ენების გაფილტვრა',
    noLanguageMatch: 'შედეგები ვერ მოიძებნა',
    pages: 'გვერდები',
    all: 'ყველა',
    previous: 'წინა გვერდი',
    next: 'შემდეგი გვერდი',
    copyLink: 'ბმულის კოპირება',
    kit: {
      body: 'ძირითადი ტექსტი',
      eyebrow: 'ზესათაური',
      meta: 'მეტამონაცემები',
      primary: 'ძირითადი',
      secondary: 'მეორადი',
      outline: 'კონტური',
      textLink: 'ტექსტური ბმული',
      disabled: 'გამორთული',
      textarea: 'ტექსტის ველი',
      banner: 'ბანერი',
      mainContent: 'მთავარი შიგთავსი',
      swatches: { ink: 'მელანი', paper: 'ქაღალდი', forest: 'ტყე', signal: 'სიგნალი', line: 'ხაზი' }
    },
    minRead: (m) => '{n} წთ კითხვა'.replace('{n}', String(m)),
    date: intlDate('ka')
  },
  lo: {
    name: 'ລາວ',
    menu: 'ເມນູ',
    languageFilter: 'ກັ່ນຕອງພາສາ',
    noLanguageMatch: 'ບໍ່ພົບຜົນລັບທີ່ກົງກັນ',
    pages: 'ໜ້າ',
    all: 'ທັງໝົດ',
    previous: 'ໜ້າກ່ອນ',
    next: 'ໜ້າຕໍ່ໄປ',
    copyLink: 'ສຳເນົາລິ້ງ',
    kit: {
      body: 'ເນື້ອຫາ',
      eyebrow: 'ຫົວຂໍ້ນ້ອຍ',
      meta: 'ຂໍ້ມູນເມຕາ',
      primary: 'ຫຼັກ',
      secondary: 'ຮອງ',
      outline: 'ເສັ້ນຂອບ',
      textLink: 'ລິ້ງຂໍ້ຄວາມ',
      disabled: 'ປິດໃຊ້ງານ',
      textarea: 'ຊ່ອງຂໍ້ຄວາມ',
      banner: 'ປ້າຍ',
      mainContent: 'ເນື້ອຫາຫຼັກ',
      swatches: { ink: 'ໝຶກ', paper: 'ເຈ້ຍ', forest: 'ປ່າໄມ້', signal: 'ສັນຍານ', line: 'ເສັ້ນ' }
    },
    minRead: (m) => 'ອ່ານ {n} ນາທີ'.replace('{n}', String(m)),
    date: intlDate('lo')
  },
  lt: {
    name: 'Lietuvių',
    menu: 'Meniu',
    languageFilter: 'Filtruoti kalbas',
    noLanguageMatch: 'Atitikmenų nerasta',
    pages: 'Puslapiai',
    all: 'Visi',
    previous: 'Ankstesnis puslapis',
    next: 'Kitas puslapis',
    copyLink: 'Kopijuoti nuorodą',
    kit: {
      body: 'Pagrindinis tekstas',
      eyebrow: 'Antraštė virš pavadinimo',
      meta: 'Metaduomenys',
      primary: 'Pagrindinis',
      secondary: 'Antrinis',
      outline: 'Kontūrinis',
      textLink: 'Teksto nuoroda',
      disabled: 'Išjungta',
      textarea: 'Teksto laukas',
      banner: 'reklamjuostė',
      mainContent: 'pagrindinis turinys',
      swatches: { ink: 'Rašalas', paper: 'Popierius', forest: 'Miškas', signal: 'Signalas', line: 'Linija' }
    },
    minRead: (m) => '{n} min. skaitymo'.replace('{n}', String(m)),
    date: intlDate('lt')
  },
  lv: {
    name: 'Latviešu',
    menu: 'Izvēlne',
    languageFilter: 'Filtrēt valodas',
    noLanguageMatch: 'Nav atbilstošu rezultātu',
    pages: 'Lapas',
    all: 'Visi',
    previous: 'Iepriekšējā lapa',
    next: 'Nākamā lapa',
    copyLink: 'Kopēt saiti',
    kit: {
      body: 'Pamatteksts',
      eyebrow: 'Virsvirsraksts',
      meta: 'Metadati',
      primary: 'Primārā',
      secondary: 'Sekundārā',
      outline: 'Kontūra',
      textLink: 'Teksta saite',
      disabled: 'Atspējota',
      textarea: 'Teksta lauks',
      banner: 'baneris',
      mainContent: 'galvenais saturs',
      swatches: { ink: 'Tinte', paper: 'Papīrs', forest: 'Mežs', signal: 'Signāls', line: 'Līnija' }
    },
    minRead: (m) => '{n} min lasīšana'.replace('{n}', String(m)),
    date: intlDate('lv')
  },
  ms: {
    name: 'Melayu',
    menu: 'Menu',
    languageFilter: 'Tapis bahasa',
    noLanguageMatch: 'Tiada hasil yang sepadan',
    pages: 'Halaman',
    all: 'Semua',
    previous: 'Halaman sebelumnya',
    next: 'Halaman seterusnya',
    copyLink: 'Salin pautan',
    kit: {
      body: 'Teks utama',
      eyebrow: 'Tajuk kecil',
      meta: 'Metadata',
      primary: 'Utama',
      secondary: 'Sekunder',
      outline: 'Garis luar',
      textLink: 'Pautan teks',
      disabled: 'Dilumpuhkan',
      textarea: 'Kawasan teks',
      banner: 'sepanduk',
      mainContent: 'kandungan utama',
      swatches: { ink: 'Dakwat', paper: 'Kertas', forest: 'Hutan', signal: 'Isyarat', line: 'Garisan' }
    },
    minRead: (m) => '{n} min bacaan'.replace('{n}', String(m)),
    date: intlDate('ms')
  },
  nb: {
    name: 'Norsk bokmål',
    menu: 'Meny',
    languageFilter: 'Filtrer språk',
    noLanguageMatch: 'Ingen treff',
    pages: 'Sider',
    all: 'Alle',
    previous: 'Forrige side',
    next: 'Neste side',
    copyLink: 'Kopier lenke',
    kit: {
      body: 'Brødtekst',
      eyebrow: 'Stikktittel',
      meta: 'Metadata',
      primary: 'Primær',
      secondary: 'Sekundær',
      outline: 'Kontur',
      textLink: 'Tekstlenke',
      disabled: 'Deaktivert',
      textarea: 'Tekstfelt',
      banner: 'banner',
      mainContent: 'hovedinnhold',
      swatches: { ink: 'Blekk', paper: 'Papir', forest: 'Skog', signal: 'Signal', line: 'Linje' }
    },
    minRead: (m) => '{n} min lesing'.replace('{n}', String(m)),
    date: intlDate('nb')
  },
  nl: {
    name: 'Nederlands',
    menu: 'Menu',
    languageFilter: 'Talen filteren',
    noLanguageMatch: 'Geen overeenkomende resultaten',
    pages: "Pagina's",
    all: 'Alle',
    previous: 'Vorige pagina',
    next: 'Volgende pagina',
    copyLink: 'Link kopiëren',
    kit: {
      body: 'Broodtekst',
      eyebrow: 'Bovenkop',
      meta: 'Metagegevens',
      primary: 'Primair',
      secondary: 'Secundair',
      outline: 'Omlijnd',
      textLink: 'Tekstlink',
      disabled: 'Uitgeschakeld',
      textarea: 'Tekstvak',
      banner: 'banner',
      mainContent: 'hoofdinhoud',
      swatches: { ink: 'Inkt', paper: 'Papier', forest: 'Bos', signal: 'Signaal', line: 'Lijn' }
    },
    minRead: (m) => '{n} min leestijd'.replace('{n}', String(m)),
    date: intlDate('nl')
  },
  pl: {
    name: 'Polski',
    menu: 'Menu',
    languageFilter: 'Filtruj języki',
    noLanguageMatch: 'Brak pasujących wyników',
    pages: 'Strony',
    all: 'Wszystkie',
    previous: 'Poprzednia strona',
    next: 'Następna strona',
    copyLink: 'Kopiuj link',
    kit: {
      body: 'Tekst główny',
      eyebrow: 'Nadtytuł',
      meta: 'Metadane',
      primary: 'Główny',
      secondary: 'Drugorzędny',
      outline: 'Konturowy',
      textLink: 'Link tekstowy',
      disabled: 'Wyłączony',
      textarea: 'Pole tekstowe',
      banner: 'baner',
      mainContent: 'główna treść',
      swatches: { ink: 'Atrament', paper: 'Papier', forest: 'Las', signal: 'Sygnał', line: 'Linia' }
    },
    minRead: (m) => '{n} min czytania'.replace('{n}', String(m)),
    date: intlDate('pl')
  },
  pt: {
    name: 'Português',
    menu: 'Menu',
    languageFilter: 'Filtrar idiomas',
    noLanguageMatch: 'Nenhum resultado correspondente',
    pages: 'Páginas',
    all: 'Todos',
    previous: 'Página anterior',
    next: 'Página seguinte',
    copyLink: 'Copiar link',
    kit: {
      body: 'Corpo do texto',
      eyebrow: 'Antetítulo',
      meta: 'Metadados',
      primary: 'Primário',
      secondary: 'Secundário',
      outline: 'Contorno',
      textLink: 'Link de texto',
      disabled: 'Desativado',
      textarea: 'Área de texto',
      banner: 'banner',
      mainContent: 'conteúdo principal',
      swatches: { ink: 'Tinta', paper: 'Papel', forest: 'Floresta', signal: 'Sinalização', line: 'Linha' }
    },
    minRead: (m) => '{n} min de leitura'.replace('{n}', String(m)),
    date: intlDate('pt')
  },
  ro: {
    name: 'Română',
    menu: 'Meniu',
    languageFilter: 'Filtrează limbile',
    noLanguageMatch: 'Niciun rezultat',
    pages: 'Pagini',
    all: 'Toate',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    copyLink: 'Copiază linkul',
    kit: {
      body: 'Text principal',
      eyebrow: 'Supratitlu',
      meta: 'Metadate',
      primary: 'Principal',
      secondary: 'Secundar',
      outline: 'Contur',
      textLink: 'Link text',
      disabled: 'Dezactivat',
      textarea: 'Zonă de text',
      banner: 'banner',
      mainContent: 'conținut principal',
      swatches: { ink: 'Cerneală', paper: 'Hârtie', forest: 'Pădure', signal: 'Semnal', line: 'Linie' }
    },
    minRead: (m) => '{n} min de citit'.replace('{n}', String(m)),
    date: intlDate('ro')
  },
  sk: {
    name: 'Slovenčina',
    menu: 'Menu',
    languageFilter: 'Filtrovať jazyky',
    noLanguageMatch: 'Žiadne zodpovedajúce výsledky',
    pages: 'Stránky',
    all: 'Všetko',
    previous: 'Predchádzajúca strana',
    next: 'Ďalšia strana',
    copyLink: 'Kopírovať odkaz',
    kit: {
      body: 'Základný text',
      eyebrow: 'Nadtitulok',
      meta: 'Metadáta',
      primary: 'Primárne',
      secondary: 'Sekundárne',
      outline: 'Obrysové',
      textLink: 'Textový odkaz',
      disabled: 'Neaktívne',
      textarea: 'Textové pole',
      banner: 'banner',
      mainContent: 'hlavný obsah',
      swatches: { ink: 'Atrament', paper: 'Papier', forest: 'Les', signal: 'Signál', line: 'Čiara' }
    },
    minRead: (m) => '{n} min čítania'.replace('{n}', String(m)),
    date: intlDate('sk')
  },
  sl: {
    name: 'Slovenščina',
    menu: 'Meni',
    languageFilter: 'Filtriraj jezike',
    noLanguageMatch: 'Ni zadetkov',
    pages: 'Strani',
    all: 'Vse',
    previous: 'Prejšnja stran',
    next: 'Naslednja stran',
    copyLink: 'Kopiraj povezavo',
    kit: {
      body: 'Osnovno besedilo',
      eyebrow: 'Nadnaslov',
      meta: 'Metapodatki',
      primary: 'Primarni',
      secondary: 'Sekundarni',
      outline: 'Obroba',
      textLink: 'Besedilna povezava',
      disabled: 'Onemogočeno',
      textarea: 'Besedilno polje',
      banner: 'pasica',
      mainContent: 'glavna vsebina',
      swatches: { ink: 'Črnilo', paper: 'Papir', forest: 'Gozd', signal: 'Signalna', line: 'Črta' }
    },
    minRead: (m) => '{n} min branja'.replace('{n}', String(m)),
    date: intlDate('sl')
  },
  sr: {
    name: 'Српски',
    menu: 'Мени',
    languageFilter: 'Филтрирај језике',
    noLanguageMatch: 'Нема резултата',
    pages: 'Странице',
    all: 'Све',
    previous: 'Претходна страница',
    next: 'Следећа страница',
    copyLink: 'Копирај везу',
    kit: {
      body: 'Основни текст',
      eyebrow: 'Надналов',
      meta: 'Метаподаци',
      primary: 'Примарно',
      secondary: 'Секундарно',
      outline: 'Обрубљено',
      textLink: 'Текстуална веза',
      disabled: 'Онемогућено',
      textarea: 'Текстуално поље',
      banner: 'банер',
      mainContent: 'главни садржај',
      swatches: { ink: 'Мастило', paper: 'Папир', forest: 'Шума', signal: 'Сигнална', line: 'Линија' }
    },
    minRead: (m) => '{n} мин читања'.replace('{n}', String(m)),
    date: intlDate('sr')
  },
  sv: {
    name: 'Svenska',
    menu: 'Meny',
    languageFilter: 'Filtrera språk',
    noLanguageMatch: 'Inga matchande resultat',
    pages: 'Sidor',
    all: 'Alla',
    previous: 'Föregående sida',
    next: 'Nästa sida',
    copyLink: 'Kopiera länk',
    kit: {
      body: 'Brödtext',
      eyebrow: 'Överrubrik',
      meta: 'Metadata',
      primary: 'Primär',
      secondary: 'Sekundär',
      outline: 'Kontur',
      textLink: 'Textlänk',
      disabled: 'Inaktiverad',
      textarea: 'Textområde',
      banner: 'banner',
      mainContent: 'huvudinnehåll',
      swatches: { ink: 'Bläck', paper: 'Papper', forest: 'Skog', signal: 'Signal', line: 'Linje' }
    },
    minRead: (m) => '{n} min läsning'.replace('{n}', String(m)),
    date: intlDate('sv')
  },
  ta: {
    name: 'தமிழ்',
    menu: 'மெனு',
    languageFilter: 'மொழிகளை வடிகட்டு',
    noLanguageMatch: 'பொருந்தும் முடிவுகள் இல்லை',
    pages: 'பக்கங்கள்',
    all: 'அனைத்தும்',
    previous: 'முந்தைய பக்கம்',
    next: 'அடுத்த பக்கம்',
    copyLink: 'இணைப்பை நகலெடு',
    kit: {
      body: 'உரை',
      eyebrow: 'மேல் தலைப்பு',
      meta: 'மெட்டாதரவு',
      primary: 'முதன்மை',
      secondary: 'இரண்டாம் நிலை',
      outline: 'வெளிக்கோடு',
      textLink: 'உரை இணைப்பு',
      disabled: 'முடக்கப்பட்டது',
      textarea: 'உரைப் பகுதி',
      banner: 'பதாகை',
      mainContent: 'முதன்மை உள்ளடக்கம்',
      swatches: { ink: 'மை', paper: 'காகிதம்', forest: 'காடு', signal: 'சிக்னல்', line: 'கோடு' }
    },
    minRead: (m) => '{n} நிமிட வாசிப்பு'.replace('{n}', String(m)),
    date: intlDate('ta')
  },
  th: {
    name: 'ไทย',
    menu: 'เมนู',
    languageFilter: 'กรองภาษา',
    noLanguageMatch: 'ไม่พบผลลัพธ์ที่ตรงกัน',
    pages: 'หน้า',
    all: 'ทั้งหมด',
    previous: 'หน้าก่อนหน้า',
    next: 'หน้าถัดไป',
    copyLink: 'คัดลอกลิงก์',
    kit: {
      body: 'เนื้อหา',
      eyebrow: 'หัวเรื่องย่อย',
      meta: 'ข้อมูลเมตา',
      primary: 'หลัก',
      secondary: 'รอง',
      outline: 'เส้นขอบ',
      textLink: 'ลิงก์ข้อความ',
      disabled: 'ปิดใช้งาน',
      textarea: 'ช่องข้อความ',
      banner: 'แบนเนอร์',
      mainContent: 'เนื้อหาหลัก',
      swatches: { ink: 'หมึก', paper: 'กระดาษ', forest: 'ป่า', signal: 'สัญญาณ', line: 'เส้น' }
    },
    minRead: (m) => 'อ่าน {n} นาที'.replace('{n}', String(m)),
    date: intlDate('th')
  },
  tr: {
    name: 'Türkçe',
    menu: 'Menü',
    languageFilter: 'Dilleri filtrele',
    noLanguageMatch: 'Eşleşen sonuç yok',
    pages: 'Sayfalar',
    all: 'Tümü',
    previous: 'Önceki sayfa',
    next: 'Sonraki sayfa',
    copyLink: 'Bağlantıyı kopyala',
    kit: {
      body: 'Gövde metni',
      eyebrow: 'Üst başlık',
      meta: 'Meta bilgi',
      primary: 'Birincil',
      secondary: 'İkincil',
      outline: 'Çerçeveli',
      textLink: 'Metin bağlantısı',
      disabled: 'Devre dışı',
      textarea: 'Metin alanı',
      banner: 'banner',
      mainContent: 'ana içerik',
      swatches: { ink: 'Mürekkep', paper: 'Kağıt', forest: 'Orman', signal: 'Sinyal', line: 'Çizgi' }
    },
    minRead: (m) => '{n} dk okuma'.replace('{n}', String(m)),
    date: intlDate('tr')
  },
  uk: {
    name: 'Українська',
    menu: 'Меню',
    languageFilter: 'Фільтрувати мови',
    noLanguageMatch: 'Немає відповідних результатів',
    pages: 'Сторінки',
    all: 'Усі',
    previous: 'Попередня сторінка',
    next: 'Наступна сторінка',
    copyLink: 'Копіювати посилання',
    kit: {
      body: 'Основний текст',
      eyebrow: 'Надзаголовок',
      meta: 'Метадані',
      primary: 'Основна',
      secondary: 'Вторинна',
      outline: 'Контурна',
      textLink: 'Текстове посилання',
      disabled: 'Неактивна',
      textarea: 'Текстове поле',
      banner: 'банер',
      mainContent: 'основний вміст',
      swatches: { ink: 'Чорнило', paper: 'Папір', forest: 'Ліс', signal: 'Сигнальний', line: 'Лінія' }
    },
    minRead: (m) => '{n} хв читання'.replace('{n}', String(m)),
    date: intlDate('uk')
  }
}

export function wordsOf(locale: string): LocaleWords {
  return WORDS[locale] ?? WORDS.en
}
