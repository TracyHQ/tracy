/**
 * The gallery of the public Templates section (issue #1762 ticket 2): `/templates/` only. The CMS chips
 * are an in-page filter (product owner, 26/10/2026), not addresses: there are no `/templates/<platform>/`
 * pages. Pure functions like `templates-page-html.js`, whose shell, header, footer and card they reuse:
 * data in, a complete document out, every card a plain link. One small inline script (allowed by hash)
 * turns the chips on; without it every card shows and the chips stay hidden.
 */
import { createHash } from 'node:crypto'
import { escapeHtml } from '../lib/html.js'
import { platformIcon } from './templates-button-icons.js'
import { industryOf } from './templates-industry.js'
import {
  document,
  platformName,
  platformsOf,
  relatedCard,
  templatePath,
  heroImage,
  thumbUrl
} from './templates-page-html.js'
import { PLATFORM_NAMES, wordsFor } from './templates-words.js'

/** Cards drawn eagerly: the ones a first screen can show; the rest load as the visitor scrolls. */
const EAGER_CARDS = 3
const DESCRIPTION_MAX = 160

/** Shows the chips and filters the cards in place: no address change, no `?cms=`, no hash. */
const FILTER_BODY = `(function(){
var bar=document.getElementById("cmsfilter");if(!bar)return;
var cards=[].slice.call(document.querySelectorAll(".grid .tcard"));
var chips=[].slice.call(bar.querySelectorAll("button[data-cms]"));
var sel=document.getElementById("industry");
var none=document.getElementById("nomatch");
var cms="all",ind="all";
function has(c,k,v){return v==="all"||(c.getAttribute(k)||"").split("|").indexOf(v)>-1}
function ok(c,m,i){return has(c,"data-platforms",m)&&has(c,"data-industry",i)}
function count(m,i){var n=0;for(var x=0;x<cards.length;x++)if(ok(cards[x],m,i))n++;return n}
function render(){var shown=0;
for(var i=0;i<cards.length;i++){var v=ok(cards[i],cms,ind);cards[i].hidden=!v;if(v)shown++}
for(var j=0;j<chips.length;j++){var k=chips[j].getAttribute("data-cms");var on=k===cms;chips[j].classList.toggle("on",on);chips[j].setAttribute("aria-pressed",on?"true":"false");chips[j].querySelector("b").textContent=count(k,ind)}
if(sel)for(var o=0;o<sel.options.length;o++){var op=sel.options[o];op.textContent=op.getAttribute("data-name")+" ("+count(cms,op.value)+")"}
if(none)none.hidden=shown>0}
chips.forEach(function(b){b.addEventListener("click",function(){cms=b.getAttribute("data-cms");render()})});
if(sel)sel.addEventListener("change",function(){ind=sel.value;render()});
var reset=document.getElementById("resetfilter");
if(reset)reset.addEventListener("click",function(){cms="all";ind="all";if(sel)sel.value="all";render()});
bar.hidden=false;
})();`

export const FILTER_SCRIPT = `<script>${FILTER_BODY}</script>`
export const FILTER_SCRIPT_SOURCE = `'sha256-${createHash('sha256').update(FILTER_BODY).digest('base64')}'`

/** The platforms that have at least one template, in the fixed tab order, with their counts. */
export function platformCounts(all) {
  return Object.keys(PLATFORM_NAMES)
    .map((platform) => ({ platform, count: all.filter((t) => platformsOf(t).includes(platform)).length }))
    .filter((p) => p.count > 0)
}

/** The industries that have at least one template, biggest first (then by name), with their counts. */
export function industryCounts(all) {
  const counts = new Map()
  for (const t of all) counts.set(industryOf(t), (counts.get(industryOf(t)) ?? 0) + 1)
  return [...counts]
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count || a.industry.localeCompare(b.industry))
}

/**
 * @param {{all: any[], origin: string, year: number}} input `all` is every published template.
 */
export function galleryPage({ all, origin, appOrigin = origin, year, lang = 'en' }) {
  const w = wordsFor(lang)
  const canonical = `${origin}/templates/`
  const G = w.gallery
  const chip = (cms, label, count, on) =>
    `<button class="tab${on ? ' on' : ''}" type="button" data-cms="${escapeHtml(cms)}" aria-pressed="${on}">${cms === 'all' ? '' : platformIcon(cms)}${escapeHtml(label)} <b>${count}</b></button>`
  const tabs = [
    chip('all', G.all, all.length, true),
    ...platformCounts(all).map((p) => chip(p.platform, platformName(p.platform), p.count, false))
  ].join('')
  const option = (value, name, count) =>
    `<option value="${escapeHtml(value)}" data-name="${escapeHtml(name)}">${escapeHtml(name)} (${count})</option>`
  const industries = [
    option('all', G.allIndustries, all.length),
    ...industryCounts(all).map((i) => option(i.industry, i.industry, i.count))
  ].join('')
  const cards = all.map((t, i) => relatedCard(t, { lazy: i >= EAGER_CARDS, w })).join('')
  const body = `<main class="wrap wide"><header class="page-head">
<h1>${escapeHtml(G.heading)}</h1><p class="lead">${escapeHtml(G.intro)}</p>
<div class="filters" id="cmsfilter" hidden><div class="tabs" role="group" aria-label="${escapeHtml(G.filterLabel)}">${tabs}</div>
<label class="ind"><span class="sr">${escapeHtml(G.industryLabel)}</span><select id="industry">${industries}</select></label></div></header>
${cards ? `<div class="grid">${cards}</div><p class="lead nomatch" id="nomatch" hidden>${escapeHtml(G.noMatch)} <button class="linkbtn" type="button" id="resetfilter">${escapeHtml(G.reset)}</button></p>` : `<p class="lead">${escapeHtml(G.empty)}</p>`}
</main>`
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    numberOfItems: all.length,
    itemListElement: all.map((t, i) => {
      const image = heroImage(t)
      const blurb = typeof t.card?.blurb === 'string' ? t.card.blurb.trim() : ''
      return {
        '@type': 'ListItem',
        position: i + 1,
        url: `${origin}${templatePath(t.id)}`,
        name: typeof t.label === 'string' && t.label ? t.label : t.id,
        ...(blurb ? { description: blurb } : {}),
        keywords: [...platformsOf(t).map(platformName), industryOf(t)].join(', '),
        ...(image ? { image: thumbUrl(image, 960) } : {})
      }
    })
  }
  const ld = (v) =>
    `<script type="application/ld+json">${JSON.stringify(v).replace(/</g, '\\u003c')}</script>`
  const description = G.description
  return document({
    title: G.title,
    description:
      description.length <= DESCRIPTION_MAX ? description : `${description.slice(0, DESCRIPTION_MAX - 1)}…`,
    canonical,
    image: all.length ? thumbUrl(heroImage(all[0]), 960) : null,
    body,
    head: ld(itemList),
    tail: FILTER_SCRIPT,
    year,
    appOrigin,
    w
  })
}
