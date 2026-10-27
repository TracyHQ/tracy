/**
 * The marketing artifacts speak for the same business as the website, so their copy is compiled
 * from `content/tracy-editorial/content-contract.json` instead of being written into the renderers.
 *
 * Light and dark are two outputs of one artifact, so they share one field set here: a divergence
 * between them would be a content defect that no theme check would report.
 */

/** The six artifacts, in the order the samples page lists them. */
export const ARTIFACTS = [
  {
    kind: 'newsletter',
    title: 'Newsletter',
    description: 'A studio digest: a lead story, three numbered services and one reading action.'
  },
  {
    kind: 'email',
    title: 'Email',
    description: 'A single announcement about the studio offer, with one next step.'
  },
  {
    kind: 'poster',
    title: 'Poster',
    description: 'A 3:4 campaign sheet stating what the studio does and where to start.'
  },
  {
    kind: 'deck',
    title: 'Deck',
    description: 'An eleven-slide studio introduction. Use the arrow keys or slide controls to explore.'
  },
  {
    kind: 'form',
    title: 'Form',
    description: 'A split-screen enquiry layout. It is a preview: nothing is sent.'
  },
  {
    kind: 'typography',
    title: 'Typography',
    description: 'Type specimens, colour roles and spacing, written in the studio voice.'
  }
]

export const THEMES = ['light', 'dark']

/** The surface id a built file answers to, and the id the content contract declares. */
export const surfaceId = (kind, theme) => `marketing/${kind}-${theme}.html`

export const MARKETING_SURFACES = ARTIFACTS.flatMap((artifact) =>
  THEMES.map((theme) => surfaceId(artifact.kind, theme))
)

const ref = (key) => ({ ref: key })
const copy = (template) => ({ template })

/**
 * Field sets. A name, price, service, person, destination or image is a reference; everything
 * else is editorial copy written for that medium. No field may introduce a business fact.
 */
const FIELDS = {
  newsletter: {
    'masthead.name': ref('company.name'),
    'masthead.issue': copy('Studio notes · Issue 01'),
    preheader: copy('Three parts of website work, and where each one starts.'),
    'lede.kicker': copy('In this issue'),
    'lede.headline': copy('Three parts of website work that decide how the next year reads'),
    'lede.blurb': ref('company.summary'),
    'cta.label': ref('cta.primary.label'),
    'cta.href': ref('cta.primary.href'),
    'story1.title': ref('services.strategy.name'),
    'story1.body': ref('services.strategy.description'),
    'story1.link': copy('How a page plan takes shape'),
    'story1.href': ref('services.strategy.href'),
    'story2.title': ref('services.design.name'),
    'story2.body': ref('services.design.description'),
    'story2.link': copy('See the design language in use'),
    'story2.href': ref('services.design.href'),
    'story3.title': ref('services.care.name'),
    'story3.body': ref('services.care.description'),
    'story3.link': copy('What a regular review covers'),
    'story3.href': ref('services.care.href'),
    closing: copy('That is the issue. {{company.name}} writes again next month.'),
    'footer.audience': ref('company.audience'),
    'footer.services.label': ref('cta.services.label'),
    'footer.services.href': ref('cta.services.href'),
    disclosure: ref('demo.disclosure')
  },

  email: {
    'masthead.name': ref('company.name'),
    preheader: copy('What changes when strategy, design and development sit at one table.'),
    kicker: copy('A note from the studio'),
    headline: copy('A website your team can keep moving'),
    lede: ref('company.summary'),
    greeting: copy('Hello,'),
    intro: copy('We wrote this for one group of readers. {{company.audience}}'),
    'point1.title': ref('services.development.name'),
    'point1.body': ref('services.development.description'),
    'point1.href': ref('services.development.href'),
    'point2.title': ref('services.content.name'),
    'point2.body': ref('services.content.description'),
    'point2.href': ref('services.content.href'),
    'point3.title': ref('services.care.name'),
    'point3.body': ref('services.care.description'),
    'point3.href': ref('services.care.href'),
    'product.title': ref('product.name'),
    'product.body': ref('product.summary'),
    'cta.label': ref('cta.primary.label'),
    'cta.href': ref('cta.primary.href'),
    signoff: copy('Reply to a real message and someone from the studio answers.'),
    'footer.name': ref('company.name'),
    'footer.note': copy('This is a sample message from the {{company.name}} demo website.'),
    disclosure: ref('demo.disclosure')
  },

  poster: {
    wordmark: ref('company.name'),
    kicker: copy('Website studio'),
    focal: copy('Strategy, design and development, on one website'),
    subhead: ref('company.summary'),
    'service1.name': ref('services.strategy.name'),
    'service2.name': ref('services.design.name'),
    'service3.name': ref('services.development.name'),
    'cta.label': ref('cta.primary.label'),
    'cta.href': ref('cta.primary.href'),
    'signature.name': ref('company.name'),
    'signature.note': ref('company.audience'),
    disclosure: ref('demo.disclosure')
  },

  deck: {
    'cover.kicker': copy('Studio introduction'),
    'cover.title': ref('company.name'),
    'cover.lede': ref('company.summary'),
    'audience.kicker': copy('Who we work with'),
    'audience.title': copy('The website has to help the people the business depends on'),
    'audience.body': ref('company.audience'),
    'offer.kicker': copy('The offer'),
    'offer.title': copy('Six ways the studio works on a website'),
    'offer.item1': ref('services.strategy.name'),
    'offer.item2': ref('services.design.name'),
    'offer.item3': ref('services.development.name'),
    'offer.item4': ref('services.content.name'),
    'offer.item5': ref('services.care.name'),
    'offer.item6': ref('services.campaign.name'),
    'service1.name': ref('services.strategy.name'),
    'service1.body': ref('services.strategy.description'),
    'service2.name': ref('services.design.name'),
    'service2.body': ref('services.design.description'),
    'service3.name': ref('services.development.name'),
    'service3.body': ref('services.development.description'),
    'service4.name': ref('services.content.name'),
    'service4.body': ref('services.content.description'),
    'service5.name': ref('services.care.name'),
    'service5.body': ref('services.care.description'),
    'service6.name': ref('services.campaign.name'),
    'service6.body': ref('services.campaign.description'),
    'product.kicker': copy('What the team keeps'),
    'product.title': ref('product.name'),
    'product.body': ref('product.summary'),
    'process.kicker': copy('How a project runs'),
    'process.title': copy('Four steps, in the same order every time'),
    'step1.name': ref('process.step-1.name'),
    'step1.body': ref('process.step-1.description'),
    'step2.name': ref('process.step-2.name'),
    'step2.body': ref('process.step-2.description'),
    'step3.name': ref('process.step-3.name'),
    'step3.body': ref('process.step-3.description'),
    'step4.name': ref('process.step-4.name'),
    'step4.body': ref('process.step-4.description'),
    'team.kicker': copy('The people on the work'),
    'team.title': copy('A small team, on the project from brief to handover'),
    'team1.name': ref('team.hale.name'),
    'team1.role': ref('team.hale.role'),
    'team1.bio': ref('team.hale.bio'),
    'team1.image': ref('team.hale.image'),
    'team1.image-alt': ref('team.hale.image-alt'),
    'team2.name': ref('team.lang.name'),
    'team2.role': ref('team.lang.role'),
    'team2.bio': ref('team.lang.bio'),
    'team2.image': ref('team.lang.image'),
    'team2.image-alt': ref('team.lang.image-alt'),
    'team3.name': ref('team.lindqvist.name'),
    'team3.role': ref('team.lindqvist.role'),
    'team3.bio': ref('team.lindqvist.bio'),
    'team3.image': ref('team.lindqvist.image'),
    'team3.image-alt': ref('team.lindqvist.image-alt'),
    'team4.name': ref('team.meyer.name'),
    'team4.role': ref('team.meyer.role'),
    'team4.bio': ref('team.meyer.bio'),
    'team4.image': ref('team.meyer.image'),
    'team4.image-alt': ref('team.meyer.image-alt'),
    'pricing.kicker': copy('Levels of support'),
    'pricing.title': copy('Three illustrative ways to work together'),
    'plan1.name': ref('pricing.starter.name'),
    'plan1.amount': ref('pricing.starter.amount'),
    'plan1.period': ref('pricing.starter.period'),
    'plan2.name': ref('pricing.studio.name'),
    'plan2.amount': ref('pricing.studio.amount'),
    'plan2.period': ref('pricing.studio.period'),
    'plan3.name': ref('pricing.foundry.name'),
    'plan3.amount': ref('pricing.foundry.amount'),
    'plan3.period': ref('pricing.foundry.period'),
    'pricing.notice': ref('pricing.notice'),
    'ask.kicker': copy('Next step'),
    'ask.title': copy('Tell us about the website you have now'),
    'ask.body': copy('Bring the current site, the brief or the question you are stuck on.'),
    'cta.label': ref('cta.primary.label'),
    'cta.href': ref('cta.primary.href'),
    'services.label': ref('cta.services.label'),
    'services.href': ref('cta.services.href'),
    'company.name': ref('company.name'),
    disclosure: ref('demo.disclosure')
  },

  form: {
    'panel.wordmark': ref('company.name'),
    'panel.title': copy('Tell us about the website you have now'),
    'panel.blurb': ref('company.summary'),
    'panel.reason1': copy('{{process.step-1.name}} — {{process.step-1.description}}'),
    'panel.reason2': copy('{{process.step-2.name}} — {{process.step-2.description}}'),
    'panel.reason3': copy('{{process.step-3.name}} — {{process.step-3.description}}'),
    'panel.audience': ref('company.audience'),
    'form.title': ref('contact.title'),
    'form.sub': copy('This layout is a design sample. The fields below are not connected.'),
    'field.name.label': copy('Your name'),
    'field.email.label': copy('Email address'),
    'field.topic.label': copy('What would you like to talk about?'),
    'field.topic.prompt': copy('Choose one…'),
    'field.topic.option1': ref('services.strategy.name'),
    'field.topic.option2': ref('services.design.name'),
    'field.topic.option3': ref('services.development.name'),
    'field.topic.option4': ref('services.care.name'),
    'field.message.label': copy('What should we know about the website?'),
    'submit.label': copy('Preview only — nothing is sent'),
    'notice.preview': copy(
      'Nothing was sent. This form has no recipient and the sample does not deliver messages.'
    ),
    'notice.recipient': ref('contact.notice'),
    'cta.label': ref('cta.primary.label'),
    'cta.href': ref('cta.primary.href'),
    disclosure: ref('demo.disclosure')
  },

  typography: {
    title: copy('Type and colour at {{company.name}}'),
    'company.name': ref('company.name'),
    summary: ref('company.summary'),
    // One sentence per role, each describing the role it is set in.
    'specimen.display': copy('Every {{company.name}} page starts with one clear sentence.'),
    'specimen.page': copy('A page title names the page, never the whole studio.'),
    'specimen.section': copy('Sections read as a sequence of assertions.'),
    'specimen.card': copy('Service cards, plan cards and dialogs share this size.'),
    'specimen.lead': copy('The lead paragraph sets the pace: one idea, said once, in the studio voice.'),
    'specimen.body': copy(
      'Body text carries the argument. It should read at arm’s length on a phone and stay calm on a wide screen, which is why the studio keeps a measure of about seventy characters.'
    ),
    'specimen.caption': copy(
      'Captions carry metadata, labels and helper lines, never anything the reader must not miss.'
    ),
    'voice.title': copy('How the studio writes'),
    'voice.rule1': copy('Plain, specific English about the audience, the work and the next action.'),
    'voice.rule2': copy(
      'Strategy, design, development, content and care are described as one offer: {{product.name}}.'
    ),
    'voice.rule3': copy('Plans, team profiles and imagery stay illustrative — never a customer endorsement.'),
    'services.summary': copy(
      '{{services.strategy.name}} · {{services.design.name}} · {{services.development.name}} · {{services.content.name}} · {{services.care.name}} · {{services.campaign.name}}'
    ),
    disclosure: ref('demo.disclosure')
  }
}

/** The compiled field map for one artifact kind. Light and dark share it by construction. */
export function fieldsFor(kind) {
  const fields = FIELDS[kind]
  if (!fields) throw new Error(`No content fields for artifact: ${kind}`)
  return fields
}

/**
 * Narrow a full-contract plan to the twelve artifact surfaces.
 *
 * `compileContentPlan` requires the plan to cover exactly the requested scope, so a 140-surface
 * plan cannot be compiled at artifact scope without this — and scoping is what lets the artifacts
 * rebuild without a live site to observe the other 128 surfaces on.
 */
export function scopeToMarketing(plan) {
  return { ...plan, surfaces: plan.surfaces.filter((surface) => MARKETING_SURFACES.includes(surface.id)) }
}

/** The whole plan document, ready for `compileContentPlan(contract, plan, MARKETING_SURFACES)`. */
export function marketingPlan(contract, hash) {
  return {
    contractId: contract.id,
    contractHash: hash,
    surfaces: ARTIFACTS.flatMap((artifact) =>
      THEMES.map((theme) => ({
        id: surfaceId(artifact.kind, theme),
        fields: fieldsFor(artifact.kind)
      }))
    )
  }
}
