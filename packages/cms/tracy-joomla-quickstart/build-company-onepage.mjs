/** A company introduction composed from the same native OpenDesign blocks and existing demo imagery. */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseHTML } from 'linkedom'
import { studioContentHash, studioFact, studioRows } from './studio-content.mjs'

const [source, output] = process.argv.slice(2)
if (!source || !output)
  throw new Error('Usage: node build-company-onepage.mjs <landing-blocks.json> <output>')
const pack = JSON.parse(await readFile(source, 'utf8'))
const clone = (kind) =>
  parseHTML(pack.blocks.find((block) => block.kind === kind).html).document.documentElement
const normalize = (text) => text.replace(/\s+/g, ' ').trim()
const blocks = []
const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
function add(kind, html) {
  const section = typeof html === 'string' ? parseHTML(html).document.documentElement : html
  section.dataset.odBlock = kind
  for (const node of section.querySelectorAll('.clamp-2,.clamp-3'))
    node.classList.remove('clamp-2', 'clamp-3')
  for (const anchor of section.querySelectorAll('a[role=button]')) anchor.removeAttribute('role')
  blocks.push({
    kind,
    title: kind,
    html: section.outerHTML,
    sourceHeadings: [...section.querySelectorAll('h1,h2,h3')].map((node) => normalize(node.textContent)),
    svgCount: section.querySelectorAll('svg').length
  })
}
function heading(section, kicker, title, description) {
  section.querySelector('.section-head .kicker').textContent = kicker
  section.querySelector('.section-head h2').textContent = title
  const paragraph = section.querySelector('.section-head p')
  if (paragraph) paragraph.textContent = description
}
add(
  'hero',
  `<section id="introduction" class="section op-hero"><div class="wrap">
  <span class="kicker">Strategy. Identity. Digital experiences.</span>
  <h1>A thoughtful studio.<br>A stronger digital presence.</h1>
  <p class="op-lead">We bring strategy, brand design and development together to help businesses tell a clearer story — and build a website their teams can keep moving.</p>
  <div class="op-actions"><a class="op-button" href="#contact">Tell us about your project</a><a href="#services">Explore what we do ↓</a></div>
  <img class="op-hero-image" src="/images/tracy-demo/studio-workspace.png" alt="Illustrative design studio workspace with website concepts on desktop and laptop screens" width="1536" height="1024" fetchpriority="high">
</div></section>`
)
add(
  'about',
  `<section id="about" class="section op-about"><div class="wrap op-two-col">
  <div><span class="kicker">Meet the studio</span><h2>Good websites begin with understanding.</h2></div>
  <div><p class="op-lead">${escapeHtml(studioFact('company.name'))} is a demo of an independent website studio. Its approach starts with the people a business needs to reach, then connects every part of the experience around them.</p>
  <p>We work across the message, the visual identity and the build. Keeping those conversations together makes the work easier to review, easier to maintain and more useful after launch.</p>
  <div class="op-values"><span>Clear thinking</span><span>Considered design</span><span>Practical delivery</span></div></div>
</div></section>`
)
const services = clone('value')
services.id = 'services'
heading(
  services,
  'What we do',
  'One connected service. From idea to everyday use.',
  'Bring us a new idea, an existing website or a question about what comes next.'
)
const serviceCopy = studioRows(
  'services',
  ['strategy', 'design', 'development', 'content', 'care', 'campaign'],
  ['name', 'description']
)
const serviceGrid = services.querySelector('.pillars')
while (serviceGrid.children.length < serviceCopy.length)
  serviceGrid.append(serviceGrid.children[serviceGrid.children.length % 3].cloneNode(true))
for (const [index, card] of [...services.querySelector('.pillars').children].entries()) {
  card.querySelector('h3').textContent = serviceCopy[index][0]
  card.querySelector('p').textContent = serviceCopy[index][1]
}
add('services', services)
const product = clone('features')
product.id = 'product'
heading(
  product,
  'The website toolkit',
  'A website your team can keep moving.',
  'The result is more than a launch-day design: a shared foundation for the work that comes after it.'
)
const productCopy = [
  [
    'A consistent design system',
    'Shared colour, type and layout rules help every service page, article and campaign feel like part of the same business.'
  ],
  [
    'Content that stays editable',
    'Reusable page sections give the team a clear place to update a service, introduce a colleague or publish the next story.'
  ],
  [
    'A clear way to keep improving',
    'Use the handover, review checklist and content plan to decide what to change next, without starting the whole site again.'
  ]
]
for (const [index, zig] of [...product.querySelectorAll('.zig')].entries()) {
  zig.querySelector('h3').textContent = productCopy[index][0]
  zig.querySelector('p').textContent = productCopy[index][1]
  zig.querySelector('.kicker').textContent = `Part ${String(index + 1).padStart(2, '0')}`
  for (const link of zig.querySelectorAll('a')) {
    link.href = '#contact'
    link.textContent = 'Discuss your website'
  }
}
add('product', product)
const processSection = clone('how')
processSection.id = 'process'
heading(
  processSection,
  'How we work',
  'Four steps, one shared direction.',
  'A clear brief, visible decisions and a handover that leaves the team ready to work.'
)
const processCopy = studioRows('process', ['step-1', 'step-2', 'step-3', 'step-4'], ['name', 'description'])
const firstStep = processSection.querySelector('h3').parentElement.parentElement.parentElement
firstStep.parentElement.append(firstStep.cloneNode(true))
for (const [index, h3] of [...processSection.querySelectorAll('h3')].entries()) {
  h3.textContent = processCopy[index][0]
  h3.previousElementSibling.textContent = String(index + 1)
  h3.parentElement.parentElement.querySelector('p').textContent = processCopy[index][1]
}
add('process', processSection)
const people = studioRows(
  'team',
  ['hale', 'lang', 'lindqvist', 'meyer'],
  ['name', 'role', 'bio', 'image', 'image-alt']
).map((row) => row.map(escapeHtml))
add(
  'team',
  `<section id="team" class="section"><div class="wrap"><div class="section-head"><span class="kicker">People behind the work</span><h2>Different skills. A shared standard.</h2><p>Illustrative team profiles for this studio demo.</p></div><div class="op-team">${people.map(([name, role, bio, image, alt]) => `<article><img src="${image}" alt="${alt}" width="400" height="500" loading="lazy"><h3>${name}</h3><p class="op-role">${role}</p><p>${bio}</p></article>`).join('')}</div></div></section>`
)
const faq = clone('faq')
heading(faq, 'Before we begin', 'A few useful answers.', '')
const answers = [
  [
    'What can a project include?',
    'A project can connect website strategy, content planning, identity, interface design and development. The brief defines which parts the business needs.'
  ],
  [
    'Can we start with an existing website?',
    'Yes. Start by reviewing the content, page structure and customer journeys. That review helps separate what is useful from what needs to change.'
  ],
  [
    'Will our team be able to edit the content?',
    'The demo uses native Joomla content and modules. A handover can explain where the different sections live and how to keep them current.'
  ],
  [
    'How do we decide the scope?',
    'Bring the existing site, the goals and the questions you have. The first step is to agree priorities, deliverables and responsibilities.'
  ],
  [
    'What happens after launch?',
    'Keep a list of customer questions and content changes. Regular reviews help the website follow the business as it grows and changes.'
  ]
]
for (const [index, details] of [...faq.querySelectorAll('details')].entries()) {
  details.querySelector('summary span').textContent = answers[index][0]
  details.querySelector('div').textContent = answers[index][1]
}
add('faq', faq)
add(
  'contact',
  `<section id="contact" class="section"><div class="wrap op-contact"><span class="kicker">Start a conversation</span><h2>What should your next website make possible?</h2><p class="op-lead">Tell us about the business, the people you serve and the change you want to make. You do not need to arrive with every answer.</p><div class="op-actions"><a class="op-button" href="/resources/contact">Open the contact page</a><a href="#introduction">Back to the introduction ↑</a></div></div></section>`
)
add(
  'footer',
  `<footer class="op-footer"><div class="wrap"><a class="op-wordmark" href="#introduction">${escapeHtml(studioFact('company.name'))}</a><nav aria-label="Onepage footer"><a href="#about">The studio</a><a href="#services">Services</a><a href="#product">Product</a><a href="#team">Our team</a><a href="#contact">Contact</a></nav><p>A company introduction demo. Team profiles and studio details are illustrative.</p><p>Designed by Tracy · Inspired by Apple.</p></div></footer>`
)
await mkdir(output, { recursive: true })
await writeFile(
  path.join(output, 'blocks.json'),
  JSON.stringify(
    {
      variant: 'onepage',
      contentContractHash: studioContentHash,
      inspiration: pack.inspiration,
      shell: 'Native onepage header and footer with section anchors',
      blocks
    },
    null,
    2
  ) + '\n'
)
console.log(`Built company Onepage with ${blocks.length} native blocks.`)
