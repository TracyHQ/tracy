// Regenerates the three canvas-min pages from one template so they differ exactly like a real
// Claude Design canvas export does: <title>, state.page, `get lang()`, LANG_HREF and the asset
// prefix (./ at the root, ../ under RU/). Run: node make.mjs (from this directory).
import { writeFileSync } from 'node:fs'

const template = (rel) => `<x-dc>
<helmet>
<style>
  body { margin:0; background:#F5F3EE; color:#14171A; font-family:'Archivo',system-ui,sans-serif; }
  a { color:#14483A; text-decoration:none; }
  a:hover { color:#DA5A2A; }
  html[data-theme="dark"] body { background:#101214; color:#ECEAE4; }
  html[data-theme="dark"] a { color:#7FBFA6; }
</style>
</helmet>
<div style="min-height:100vh;background:#F5F3EE">
  <sc-if value="{{ showTopbar }}" hint-placeholder-val="{{ true }}">
    <div style="background:#14483A;color:#CFE0D8;font-size:13px;padding:9px 0">
      <span>{{ t.top.phone }}</span>
      <a href="#" onClick="{{ setRu }}">RU</a>
      <a href="#" onClick="{{ setEn }}">EN</a>
    </div>
  </sc-if>
  <header style="background:#F5F3EE;border-bottom:1px solid #DCD7CC">
    <div style="display:flex;align-items:center;gap:14px">
      <div style="font-size:20px;font-weight:700">NORTHGATE</div>
      <div style="font-size:9px;text-transform:uppercase">{{ t.brandSub }}</div>
    </div>
    <nav>
      <sc-for list="{{ nav }}" as="n" hint-placeholder-count="2">
        <sc-if value="{{ n.active }}" hint-placeholder-val="{{ true }}">
          <a href="#" onClick="{{ n.onClick }}" style="font-weight:600;border-bottom:2px solid #DA5A2A">{{ n.label }}</a>
        </sc-if>
        <sc-if value="{{ n.inactive }}">
          <a href="#" onClick="{{ n.onClick }}" style="font-weight:500">{{ n.label }}</a>
        </sc-if>
      </sc-for>
      <a href="#" onClick="{{ toggleMega }}">{{ t.more }}</a>
      <sc-if value="{{ megaOpen }}">
        <div>
          <a href="#" onClick="{{ goAbout }}">{{ t.megaAbout }}</a>
        </div>
      </sc-if>
    </nav>
    <a href="#" onClick="{{ goAbout }}" style="display:inline-block;background:#14483A;color:#fff;font-size:14px;font-weight:600;padding:11px 20px">{{ t.quote }}</a>
  </header>

  <sc-if value="{{ isHome }}" hint-placeholder-val="{{ true }}">
    <main>
      <section style="background:#14171A;color:#F5F3EE">
        <h1 style="font-family:'Newsreader',serif;font-size:64px;line-height:1.02;font-weight:400">{{ t.hero.h1a }} <em>{{ t.hero.h1b }}</em></h1>
        <p style="font-size:18px">{{ t.hero.p }}</p>
        <a href="#" onClick="{{ goAbout }}" style="background:#DA5A2A;color:#fff;padding:15px 28px">{{ t.hero.cta }}</a>
        <image-slot id="tp-hero" shape="rect" src="${rel}img/hero.png" placeholder="{{ t.slots.hero }}"></image-slot>
        <div>
          <sc-for list="{{ t.stats }}" as="s" hint-placeholder-count="3">
            <div><div style="font-size:38px">{{ s.v }}</div><div style="font-size:13px">{{ s.l }}</div></div>
          </sc-for>
        </div>
      </section>
      <section id="sec-services" style="max-width:1240px;margin:0 auto;padding:88px 32px">
        <div style="text-transform:uppercase;letter-spacing:.18em;font-size:11px">{{ t.svc.eyebrow }}</div>
        <h2 style="font-size:40px">{{ t.svc.h2 }}</h2>
        <div>
          <sc-for list="{{ t.svc.items }}" as="it" hint-placeholder-count="2">
            <article><div>{{ it.n }}</div><h3>{{ it.t }}</h3><p>{{ it.d }}</p></article>
          </sc-for>
        </div>
      </section>
      <section style="background:#14483A;color:#F5F3EE;padding:56px 32px">
        <h2>{{ t.band.h2 }}</h2>
        <a href="#" onClick="{{ goAbout }}">{{ t.band.btn }}</a>
      </section>
      <section style="padding:72px 32px">
        <h2>{{ t.news.h2 }}</h2>
        <sc-for list="{{ t.news.items }}" as="n" hint-placeholder-count="2">
          <article>
            <image-slot shape="rect" src="{{ n.img }}" placeholder="{{ t.slots.news }}"></image-slot>
            <div style="text-transform:uppercase;letter-spacing:.14em;font-size:12px">{{ n.kind }}</div><h3>{{ n.title }}</h3><p>{{ n.desc }}</p><div>{{ n.meta }}</div>
          </article>
        </sc-for>
      </section>
    </main>
  </sc-if>

  <sc-if value="{{ isAbout }}">
    <main>
      <div style="padding:56px 32px">
        <h1 style="font-size:48px">{{ ab.h1 }}</h1>
        <p>{{ ab.p }}</p>
        <ul>
          <sc-for list="{{ ab.facts }}" as="f" hint-placeholder-count="2"><li>{{ f }}</li></sc-for>
        </ul>
        <a href="${rel}decks/deck.pdf">{{ ab.deck }}</a>
        <p>{{ ab.missing }}</p>
      </div>
    </main>
  </sc-if>

  <footer style="background:#14171A;color:#B9B5AC">
    <div style="display:grid">
      <div><p>{{ t.ft.desc }}</p></div>
      <div>
        <div style="text-transform:uppercase;font-weight:700">{{ t.ft.c2T }}</div>
        <sc-for list="{{ ftCompany }}" as="l" hint-placeholder-count="2">
          <a href="#" onClick="{{ l.onClick }}">{{ l.label }}</a>
        </sc-for>
      </div>
      <div>
        <span>sales@example.test</span>
        <span>+7 495 000-00-00</span>
      </div>
    </div>
  </footer>
</div>
</x-dc>`

const script = ({ page, lang, langHref, rel }) => `<script type="text/x-dc" data-dc-script data-props="{&quot;lang&quot;:{&quot;editor&quot;:&quot;enum&quot;,&quot;options&quot;:[&quot;ru&quot;,&quot;en&quot;],&quot;default&quot;:&quot;ru&quot;},&quot;showTopbar&quot;:{&quot;editor&quot;:&quot;boolean&quot;,&quot;default&quot;:true}}">
const RU = {
  brandSub: 'Промышленная инфраструктура',
  quote: 'Запросить смету',
  more: 'Ещё',
  megaAbout: 'О нас (мега)',
  top: { phone: 'Горячая линия: 8 800 550-67-89' },
  nav: ['Главная', 'О компании'],
  slots: { hero: 'Фото стройплощадки', news: 'Фото к новости' },
  hero: { h1a: 'Строим основание для', h1b: 'заводов', p: 'Генподряд под ключ.', cta: 'Наши компетенции' },
  stats: [ { v: '380+', l: 'Объектов' }, { v: '22 года', l: 'Опыта' }, { v: '0', l: 'Происшествий' } ],
  svc: { eyebrow: 'Чем мы занимаемся', h2: 'Два направления', items: [ { n: '01', t: 'Инфраструктура', d: 'Дороги и сети.' }, { n: '02', t: 'Корпуса', d: 'Стальные каркасы.' } ] },
  band: { h2: 'Нужна смета?', btn: 'Связаться' },
  news: { h2: 'Новости', items: [ { img: '${rel}img/news-1.png', kind: 'Главное · Раскрытие', meta: '12.08.2026', title: 'Выиграли конкурс', desc: 'Контракт подписан.' }, { img: '${rel}img/news-2.png', kind: 'Инженерия', meta: '28.07.2026', title: 'Ошибки в фундаментах', desc: 'Заметки с заводов.' } ] },
  ft: { desc: 'АО «Норткейт Индастриал».', c2T: 'Компания', c2: ['О компании', 'Главная'] }
};
const EN = {
  brandSub: 'Industrial infrastructure',
  quote: 'Request a quote',
  more: 'More',
  megaAbout: 'About (mega)',
  top: { phone: 'Hotline: 8 800 550-67-89' },
  nav: ['Home', 'About'],
  slots: { hero: 'Site photo', news: 'News photo' },
  hero: { h1a: 'Building the ground for', h1b: 'factories', cta: 'Our capabilities', p: 'Design-build main contractor.' },
  stats: [ { v: '380+', l: 'Projects delivered' }, { v: '22 years', l: 'In the industry' }, { v: '0', l: 'Lost-time incidents' } ],
  svc: { eyebrow: 'What we do', h2: 'Two core services', items: [ { n: '01', t: 'Infrastructure', d: 'Roads and utilities.' }, { n: '02', t: 'Buildings', d: 'Steel frames.' } ] },
  band: { h2: 'Need a budget estimate?', btn: 'Talk to sales' },
  news: { h2: 'News', items: [ { img: '${rel}img/news-1.png', kind: 'Featured · Disclosure', meta: '12.08.2026', title: 'Tender won', desc: 'Contract signed.' }, { img: '${rel}img/news-2.png', kind: 'Engineering', meta: '28.07.2026', title: 'Foundation mistakes', desc: 'Notes from plants.' } ] },
  ft: { desc: 'Northgate Industrial JSC.', c2T: 'Company', c2: ['About us', 'Home'] }
};
const AB_RU = { h1: 'О компании', p: 'Мы строим с 2004 года.', facts: ['380 объектов', '14 регионов'], deck: 'Скачать презентацию (PDF)', missing: 'x' };
const AB_EN = { h1: 'About us', p: 'Building since 2004.', facts: ['380 projects', '14 regions'], deck: 'Download the deck (PDF)', missing: 'x' };
const COMPUTED = someCall();

class Component extends DCLogic {
  state = { page: '${page}', mega: false, dark: false };

  get lang() { return '${lang}'; }

  mark(list, activeIndex) {
    return list.map((label, i) => ({ label, active: i === activeIndex, inactive: i !== activeIndex }));
  }

  renderVals() {
    const lang = this.lang;
    const t = lang === 'en' ? EN : RU;
    const ab = lang === 'en' ? AB_EN : AB_RU;
    const page = this.state.page;
    const PAGE_FILES = ${lang === 'ru' ? '{"home":"Home_ru.html","about":"About_ru.html"}' : '{"home":"Home.html","about":"About.html"}'};
    const LANG_HREF = ${JSON.stringify(langHref)};
    const go = (id) => (e) => {
      if (e && e.preventDefault) e.preventDefault();
      const f = PAGE_FILES[id];
      if (!f) return;
      window.location.href = './' + f;
    };
    const navTargets = [['home', null], ['about', null]];
    const navActive = { home: 0, about: 1 };
    const setLang = (l) => (e) => { if (e && e.preventDefault) e.preventDefault(); window.location.href = LANG_HREF[l]; };
    return {
      t,
      ab,
      nav: t.nav.map((label, i) => ({ label, active: navActive[page] === i, inactive: navActive[page] !== i, onClick: go(navTargets[i][0]) })),
      ftCompany: t.ft.c2.map((label, i) => ({ label, onClick: [go('about'), go('home')][i] })),
      goAbout: go('about'),
      setRu: setLang('ru'), setEn: setLang('en'),
      megaOpen: this.state.mega,
      toggleMega: (e) => { if (e && e.preventDefault) e.preventDefault(); this.setState((st) => ({ mega: !st.mega })); },
      isHome: page === 'home', isAbout: page === 'about',
      showTopbar: this.props.showTopbar ?? true
    };
  }
}
</script>`

const pageHtml = ({ title, rel, page, lang, langHref }) => `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="${rel}support.js"></script>
</head>
<body>
${template(rel)}
${script({ page, lang, langHref, rel })}
</body>
</html>
`

writeFileSync(
  'Home.html',
  pageHtml({ title: 'Northgate Industrial — Home', rel: './', page: 'home', lang: 'en', langHref: { en: './Home.html', ru: './RU/Home_ru.html' } })
)
writeFileSync(
  'About.html',
  pageHtml({ title: 'Northgate Industrial — About', rel: './', page: 'about', lang: 'en', langHref: { en: './About.html', ru: './RU/About_ru.html' } })
)
writeFileSync(
  'RU/Home_ru.html',
  pageHtml({ title: 'Northgate Industrial — Home (RU)', rel: '../', page: 'home', lang: 'ru', langHref: { en: '../Home.html', ru: './Home_ru.html' } })
)
console.log('wrote Home.html About.html RU/Home_ru.html')
