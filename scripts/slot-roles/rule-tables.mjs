#!/usr/bin/env node
/**
 * The slot role rule tables (ADR 0038): fixed tables from field names, keys and xpaths to a slot role and the card
 * (group) a slot belongs to, with no model. They propose; the packaging agent reviews every slot and binds what the
 * tables could not place; the contract check (`check.mjs`) validates the result.
 *
 * Used by:
 *   - a capture step, to write roles on a new content map: `proposeContentMapRoles(contentMap, {cms})` from Node
 *     (WordPress `capture-contract.mjs`), or the command line from any language (Joomla `capture-contract.py`):
 *
 *       node scripts/slot-roles/rule-tables.mjs <joomla|wordpress> [--vocabulary 2|3] < content-map.json > proposal.json
 *
 *     which prints `{contentMap, unplaced}`: the map with `role` and `group` on every slot the tables placed (slots that
 *     already had a role are kept as they are), and the keys of the text and image slots still without a role (after the fact tables, an editorial default from the slot's own signals, `editorial-defaults.mjs`);
 *   - `propose.mjs`, which writes the same proposal as a `slot-roles.json` sidecar draft (ADR 0037, until it retires).
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  customizeOfRole,
  DEFAULT_NEUTRAL_BY_ROLE,
  GROUP_KINDS,
  isRole,
  modeOfRole,
  pictureReplaceOfRole,
  ROLE_VOCABULARY_V3,
  ROLE_VOCABULARY_VERSION
} from 'website-opportunities/domain'
import { editorialRoleOf } from './editorial-defaults.mjs'
import { proposeButtonActions } from './button-actions.mjs'
import { languageButtonUses, sourceButtonUses, templateButtonUses } from './button-markup.mjs'
import { declareOfferingSummaries } from './offering-summaries.mjs'
import { FACT_FAMILY_ROLES, factFamilyPlacement } from './rule-tables-facts.mjs'
import { proposeMarkupBindings } from './rule-tables-markup.mjs'
import { proposeWordpressLinks } from './rule-tables-wordpress-links.mjs'

export { FACT_FAMILY_ROLES }

// The roles a sidecar draft lists as a group's `requiredRoles` when the group binds them. The content map check takes
// what a kind needs from the vocabulary (`GROUP_KINDS`) instead.
const SIDECAR_REQUIRED_ROLES = Object.freeze({
  business: ['business.name'],
  contact: ['contact.cta_label'],
  menu_item: ['offering.name'],
  service: ['offering.name'],
  package: ['package.name', 'package.price'],
  person: ['person.name'],
  stat_item: ['stat.value', 'stat.label'],
  step: ['step.index', 'step.title'],
  quote: ['quote.text'],
  claim: ['claim.entity_name'],
  faq: ['faq.question', 'faq.answer'],
  event: ['event.title']
})

function parseJoomlaJsonPath(jsonPath) {
  if (Array.isArray(jsonPath)) {
    const block = String(jsonPath[0] ?? '').toLowerCase()
    const raw = String(jsonPath[1] ?? '')
    const bracket = raw.match(/\[([^\]]+)\]$/)
    const field = (bracket ? bracket[1] : raw).toLowerCase()
    const index = Number.isInteger(jsonPath[2]) ? jsonPath[2] : Number(jsonPath[2] ?? 0)
    return { block, field, index }
  }
  if (typeof jsonPath === 'string') {
    const m = jsonPath.match(/^([^.]+)\.[^[]+\[([^\]]+)\]\[(\d+)\]$/)
    if (m) return { block: m[1].toLowerCase(), field: m[2].toLowerCase(), index: Number(m[3]) }
  }
  return null
}

const JOOMLA_ACM_REPEATED = Object.freeze({
  'tier-name': { family: 'tier', entityKind: 'package', role: 'package.name' },
  'tier-summary': { family: 'tier', entityKind: 'package', role: 'package.summary' },
  'tier-price': { family: 'tier', entityKind: 'package', role: 'package.price' },
  'tier-period': { family: 'tier', entityKind: 'package', role: 'package.period' },
  'tier-features': { family: 'tier', entityKind: 'package', role: 'package.features_list' },
  'tier-badge': { family: 'tier', entityKind: 'package', role: 'package.badge' },
  'tier-action-label': { family: 'tier', entityKind: 'package', role: 'package.cta_label' },
  'tier-action-link': { family: 'tier', entityKind: 'package', role: 'package.cta_url' },
  'figure-value': { family: 'stat', entityKind: 'stat_item', role: 'stat.value' },
  'figure-caption': { family: 'stat', entityKind: 'stat_item', role: 'stat.label' },
  quote: { family: 'quote', entityKind: 'quote', role: 'quote.text' },
  'quote-name': { family: 'quote', entityKind: 'quote', role: 'quote.author_name' },
  'quote-role': { family: 'quote', entityKind: 'quote', role: 'quote.author_context' },
  'quote-avatar': { family: 'quote', entityKind: 'quote', role: 'quote.author_image' },
  'mark-image': { family: 'client', entityKind: 'claim', role: 'claim.entity_logo' },
  'mark-name': { family: 'client', entityKind: 'claim', role: 'claim.entity_name' },
  'mark-link': { family: 'client', entityKind: 'claim', role: 'claim.entity_url' },
  'member-portrait': { family: 'member', entityKind: 'person', role: 'person.image' },
  'member-name': { family: 'member', entityKind: 'person', role: 'person.name' },
  'member-role': { family: 'member', entityKind: 'person', role: 'person.role' },
  'member-bio': { family: 'member', entityKind: 'person', role: 'person.bio' },
  'member-link': { family: 'member', entityKind: 'person', role: 'person.social_url' },
  'entry-question': { family: 'faq', entityKind: 'faq', role: 'faq.question' },
  'entry-answer': { family: 'faq', entityKind: 'faq', role: 'faq.answer' },
  'entry-marker': { family: 'event', entityKind: 'event', role: 'event.date_or_year' },
  'entry-title': { family: 'event', entityKind: 'event', role: 'event.title' },
  'entry-text': { family: 'event', entityKind: 'event', role: 'event.description' },
  'item-title': { family: 'item', entityKind: 'service', role: 'offering.name' },
  'item-text': { family: 'item', entityKind: 'service', role: 'offering.description' },
  'item-kicker': { family: 'item', entityKind: 'service', role: 'offering.category' },
  'item-link-label': { family: 'item', entityKind: 'service', role: 'offering.cta_label' },
  'item-link-url': { family: 'item', entityKind: 'service', role: 'offering.cta_url' },
  'slide-title': { family: 'slide', entityKind: 'service', role: 'offering.name' },
  'slide-text': { family: 'slide', entityKind: 'service', role: 'offering.description' },
  'slide-kicker': { family: 'slide', entityKind: 'service', role: 'offering.category' },
  'slide-image': { family: 'slide', entityKind: 'service', role: 'offering.image' },
  'slide-link-label': { family: 'slide', entityKind: 'service', role: 'offering.cta_label' },
  'slide-link-url': { family: 'slide', entityKind: 'service', role: 'offering.cta_url' },
  'tab-label': { family: 'tab', entityKind: 'service', role: 'offering.category' },
  'tab-title': { family: 'tab', entityKind: 'service', role: 'offering.name' },
  'tab-body': { family: 'tab', entityKind: 'service', role: 'offering.description' },
  'tab-image': { family: 'tab', entityKind: 'service', role: 'offering.image' },
  'social-url': { family: 'social', entityKind: 'contact', role: 'contact.social_url' },
  'social-label': { family: 'social', entityKind: 'contact', role: 'contact.social_label' }
})

const JOOMLA_ACM_SECTION = Object.freeze({
  // An eyebrow is the template's short kicker above a heading ("Our harbour yard"), words and not the business's
  // category: it is rewritten with the page, not filled from a fact.
  eyebrow: { editorial: true, role: 'editorial.heading' },
  heading: { entityKind: 'business', role: 'business.tagline' },
  intro: { entityKind: 'business', role: 'business.summary' },
  statement: { entityKind: 'business', role: 'business.tagline' },
  support: { entityKind: 'business', role: 'business.summary' },
  'btn-text': { entityKind: 'contact', role: 'contact.cta_label' },
  'btn-link': { entityKind: 'contact', role: 'contact.cta_url' },
  'link-text': { entityKind: 'offering', role: 'offering.cta_label' },
  'link-url': { entityKind: 'offering', role: 'offering.cta_url' },
  'link-label': { entityKind: 'contact', role: 'contact.cta_label' },
  email: { entityKind: 'contact', role: 'contact.email' },
  // The words printed beside an email address ("Write to us"). They were mapped to opening hours; they are copy.
  'email-label': { editorial: true, role: 'editorial.heading' },
  handle: { entityKind: 'contact', role: 'contact.social_label' },
  notice: { entityKind: 'claim', role: 'claim.notice' }
})

function buildGroupCollector() {
  const groupsById = new Map()
  const bindings = []
  const roleOnly = []
  const unplaced = []

  const addBinding = ({ slotKey, groupId, entityKind, itemIndex = 0, role, mode }) => {
    // A role with no card (an editorial slot no fact fills).
    if (groupId === null || groupId === undefined) {
      roleOnly.push({ slotKey, role })
      return
    }
    let g = groupsById.get(groupId)
    if (!g) {
      g = {
        id: groupId,
        groupId,
        entityKind,
        allowedKinds: [...(GROUP_KINDS[entityKind]?.allowedKinds ?? [entityKind])],
        itemIndex,
        rolesUsed: new Set()
      }
      groupsById.set(groupId, g)
    }
    g.rolesUsed.add(role)
    bindings.push({
      slotKey,
      groupId,
      role,
      mode: mode ?? modeOfRole(role)
    })
  }

  const addUnplaced = (slotKey, reason) => {
    unplaced.push({ slotKey, reason })
  }

  const finalize = () => {
    const groups = Array.from(groupsById.values()).map((g) => {
      const roles = Array.from(g.rolesUsed)
      const defaultReq = SIDECAR_REQUIRED_ROLES[g.entityKind] ?? []
      const req = defaultReq.filter((r) => g.rolesUsed.has(r))
      const requiredRoles = req.length > 0 ? req : roles.slice(0, 1)
      const neutral = {}
      for (const role of roles) {
        neutral[role] = DEFAULT_NEUTRAL_BY_ROLE[role] ?? { policy: 'empty' }
      }
      return {
        id: g.groupId,
        groupId: g.groupId,
        entityKind: g.entityKind,
        allowedKinds: g.allowedKinds,
        itemIndex: g.itemIndex,
        requiredRoles,
        neutral
      }
    })
    return { groups, bindings, roleOnly, unplaced }
  }

  return { addBinding, addUnplaced, finalize }
}

const NUMBERED_CTA_FIELD = /^(btn-text|btn-link|link-text|link-url|link-label)[-_]?(\d+)$/

export function proposeJoomla(slots, { vocabulary3 = false } = {}) {
  const collector = buildGroupCollector()
  const markup = proposeMarkupBindings(slots, { vocabulary3 })
  // The fields of each module, for a field that is a fact only beside another (a bare "label" beside a "value").
  const fieldsOfEntity = new Map()
  for (const slot of slots) {
    const parsed = slot.jsonPath ? parseJoomlaJsonPath(slot.jsonPath) : null
    if (!parsed?.field) continue
    const entity = String(slot.entity ?? String(slot.key).split('.')[0])
    if (!fieldsOfEntity.has(entity)) fieldsOfEntity.set(entity, new Set())
    fieldsOfEntity.get(entity).add(parsed.field)
  }

  const stepEntities = new Set()
  for (const slot of slots) {
    const parsed = slot.jsonPath ? parseJoomlaJsonPath(slot.jsonPath) : null
    if (parsed?.field === 'figure-value' && /^0\d+$/.test(String(slot.sample ?? '').trim())) {
      stepEntities.add(String(slot.entity ?? String(slot.key).split('.')[0]))
    }
  }

  for (const slot of slots) {
    const key = String(slot.key)
    const entity = String(slot.entity ?? key.split('.')[0])
    const label = String(slot.label ?? '').toLowerCase()
    const xpath = String(slot.xpath ?? '')

    // Links and list items of markup: their structure says more than the field the markup sits in.
    const fromMarkup = markup.get(key)
    if (fromMarkup) {
      collector.addBinding({ slotKey: key, ...fromMarkup })
      if (fromMarkup.groupId === null && slot.requiresEvidence)
        collector.addUnplaced(key, 'editorial slot: words, not a fact')
      continue
    }

    // A whole article's title: version 3 has a role for it; version 2 leaves it to the editorial default (a heading).
    if (vocabulary3 && entity.startsWith('article-') && slot.column === 'title' && !slot.jsonPath && !xpath) {
      collector.addBinding({
        slotKey: key,
        groupId: `${entity}.article.0`,
        entityKind: 'post',
        itemIndex: 0,
        role: 'article.title'
      })
      continue
    }

    if (slot.jsonPath) {
      const parsed = parseJoomlaJsonPath(slot.jsonPath)
      if (parsed) {
        if (
          stepEntities.has(entity) &&
          (parsed.field === 'figure-value' || parsed.field === 'figure-caption')
        ) {
          collector.addBinding({
            slotKey: key,
            groupId: `${entity}.step.${parsed.index}`,
            entityKind: 'step',
            itemIndex: parsed.index,
            role: parsed.field === 'figure-value' ? 'step.index' : 'step.title'
          })
          continue
        }
        const rep = JOOMLA_ACM_REPEATED[parsed.field]
        if (rep) {
          collector.addBinding({
            slotKey: key,
            groupId: `${entity}.${rep.family}.${parsed.index}`,
            entityKind: rep.entityKind,
            itemIndex: parsed.index,
            role: rep.role
          })
          continue
        }
        // A second button of a block: `btn-text-2` and `btn-link-2` are one card of their own.
        const numbered = NUMBERED_CTA_FIELD.exec(parsed.field)
        if (numbered && JOOMLA_ACM_SECTION[numbered[1]]?.entityKind) {
          const sec = JOOMLA_ACM_SECTION[numbered[1]]
          collector.addBinding({
            slotKey: key,
            groupId: `${entity}.cta.${numbered[2]}`,
            entityKind: sec.entityKind === 'offering' ? 'service' : sec.entityKind,
            itemIndex: parsed.index,
            role: sec.role
          })
          continue
        }
        const sec = JOOMLA_ACM_SECTION[parsed.field]
        if (sec?.editorial) {
          collector.addBinding({ slotKey: key, groupId: null, role: sec.role })
          if (slot.requiresEvidence) collector.addUnplaced(key, 'editorial slot: words, not a fact')
          continue
        }
        if (sec) {
          const entityKind = sec.entityKind === 'offering' ? 'service' : sec.entityKind
          collector.addBinding({
            slotKey: key,
            groupId: `${entity}.section.${parsed.index}`,
            entityKind,
            itemIndex: parsed.index,
            role: sec.role
          })
          continue
        }
        // Any other field the server's fact list calls a fact is placed by its family.
        const fact = factFamilyPlacement(parsed.field, fieldsOfEntity.get(entity) ?? new Set())
        if (fact) {
          collector.addBinding({
            slotKey: key,
            groupId: `${entity}.${fact.family}.${parsed.index}`,
            entityKind: fact.entityKind,
            itemIndex: parsed.index,
            role: fact.role
          })
          continue
        }
      }
    }

    // mod_custom deterministic xpath patterns
    if (!slot.jsonPath && xpath) {
      // Landing statistics: /html/body/div/section/div/div[N]/div[1|2]/text()
      const statMatch =
        label.includes('statistics') &&
        xpath.match(/^\/html\/body\/div\/section\/div\/div\[(\d+)\]\/div\[(1|2)\]\/text\(\)$/)
      if (statMatch) {
        const idx = Number(statMatch[1]) - 1
        const role = statMatch[2] === '1' ? 'stat.value' : 'stat.label'
        collector.addBinding({
          slotKey: key,
          groupId: `${entity}.stat.${idx}`,
          entityKind: 'stat_item',
          itemIndex: idx,
          role
        })
        continue
      }

      // FAQ details: /details[N]/summary/span[1]/text() or /details[N]/div/text()
      const faqMatch =
        label.includes('faq') && xpath.match(/\/details\[(\d+)\]\/(summary\/span\[1\]|div)\/text\(\)$/)
      if (faqMatch) {
        const idx = Number(faqMatch[1]) - 1
        const role = faqMatch[2].startsWith('summary') ? 'faq.question' : 'faq.answer'
        collector.addBinding({
          slotKey: key,
          groupId: `${entity}.faq.${idx}`,
          entityKind: 'faq',
          itemIndex: idx,
          role
        })
        continue
      }

      // Team articles in mod_custom: /article[N]/(img/@src|h3/text()|p[1]/text()|p[2]/text())
      const teamArticleMatch =
        label.includes('team') &&
        xpath.match(/\/article\[(\d+)\]\/(img\/@src|h3\/text\(\)|p\[1\]\/text\(\)|p\[2\]\/text\(\))$/)
      if (teamArticleMatch) {
        const idx = Number(teamArticleMatch[1]) - 1
        const tail = teamArticleMatch[2]
        const roleMap = {
          'img/@src': 'person.image',
          'h3/text()': 'person.name',
          'p[1]/text()': 'person.role',
          'p[2]/text()': 'person.bio'
        }
        collector.addBinding({
          slotKey: key,
          groupId: `${entity}.member.${idx}`,
          entityKind: 'person',
          itemIndex: idx,
          role: roleMap[tail]
        })
        continue
      }
    }

    // Article / menuItem slots with requiresEvidence
    if (slot.requiresEvidence) {
      // A title is words, whatever the page is called: an article's is `article.title` above (version 3) or a heading,
      // a menu entry's a menu label, both by the editorial default. They were `business.category_label`.
      if (slot.column === 'title' && (entity.startsWith('article-') || entity.startsWith('menuItem-'))) {
        collector.addUnplaced(key, 'editorial title: words, not a fact')
        continue
      }
      collector.addUnplaced(key, 'requiresEvidence slot could not be deterministically mapped')
    }
  }

  return collector.finalize()
}

const WP_REPEATED_FIELD_MAP = Object.freeze({
  'dish-name': { family: 'dish', entityKind: 'menu_item', role: 'offering.name' },
  'dish-price': { family: 'dish', entityKind: 'menu_item', role: 'offering.price' },
  'dish-description': { family: 'dish', entityKind: 'menu_item', role: 'offering.description' },
  'dish-image': { family: 'dish', entityKind: 'menu_item', role: 'offering.image' },
  'dish-extra-class': { family: 'dish', entityKind: 'menu_item', role: 'offering.variant_meta' },
  'member-name': { family: 'member', entityKind: 'person', role: 'person.name' },
  'member-position': { family: 'member', entityKind: 'person', role: 'person.role' },
  'member-desc': { family: 'member', entityKind: 'person', role: 'person.bio' },
  'member-image': { family: 'member', entityKind: 'person', role: 'person.image' },
  'stats-name': { family: 'stat', entityKind: 'stat_item', role: 'stat.label' },
  'stats-count': { family: 'stat', entityKind: 'stat_item', role: 'stat.value' },
  'testimonial-text': { family: 'quote', entityKind: 'quote', role: 'quote.text' },
  'author-img': { family: 'quote', entityKind: 'quote', role: 'quote.author_image' }
})

export function proposeWordpress(slots) {
  const collector = buildGroupCollector()

  for (const slot of slots) {
    const key = String(slot.key)
    if (key === 'site.name') {
      collector.addBinding({
        slotKey: key,
        groupId: 'site.identity.0',
        entityKind: 'business',
        itemIndex: 0,
        role: 'business.name'
      })
      continue
    }
    if (key === 'site.tagline') {
      collector.addBinding({
        slotKey: key,
        groupId: 'site.identity.0',
        entityKind: 'business',
        itemIndex: 0,
        role: 'business.tagline'
      })
      continue
    }

    const parts = key.split('.')
    if (parts.length === 4 && /^\d+$/.test(parts[3])) {
      const [page, section, field, rawIdx] = parts
      const idx = Number(rawIdx) - 1
      const direct = WP_REPEATED_FIELD_MAP[field]
      if (direct) {
        collector.addBinding({
          slotKey: key,
          groupId: `${page}.${section}.${direct.family}.${idx}`,
          entityKind: direct.entityKind,
          itemIndex: idx,
          role: direct.role
        })
        continue
      }

      if (section === 'timeline') {
        const timelineMap = {
          date: 'event.date_or_year',
          title: 'event.title',
          description: 'event.description',
          image: 'event.image'
        }
        if (timelineMap[field]) {
          collector.addBinding({
            slotKey: key,
            groupId: `${page}.${section}.event.${idx}`,
            entityKind: 'event',
            itemIndex: idx,
            role: timelineMap[field]
          })
          continue
        }
      }

      if (section === 'features-intro') {
        const featMap = {
          title: 'offering.name',
          'short-desc': 'offering.category',
          description: 'offering.description',
          'img-icon': 'offering.image'
        }
        if (featMap[field]) {
          collector.addBinding({
            slotKey: key,
            groupId: `${page}.${section}.item.${idx}`,
            entityKind: 'menu_item',
            itemIndex: idx,
            role: featMap[field]
          })
          continue
        }
      }
    }

    if (parts.length === 3) {
      const [page, section, field] = parts
      if (section === 'happyhours') {
        const hpMap = {
          'hp-title': 'event.title',
          'hp-desc': 'event.description',
          'hp-badge': 'package.badge',
          'hp-bg': 'event.image'
        }
        if (hpMap[field]) {
          collector.addBinding({
            slotKey: key,
            groupId: `${page}.${section}.promo.0`,
            entityKind: 'event',
            itemIndex: 0,
            role: hpMap[field]
          })
          continue
        }
      }
      if (section === 'contact-map' && field === 'map-title') {
        collector.addBinding({
          slotKey: key,
          groupId: `${page}.${section}.0`,
          entityKind: 'contact',
          itemIndex: 0,
          role: 'contact.map_label'
        })
        continue
      }
    }

    if (slot.requiresEvidence) {
      collector.addUnplaced(key, 'requiresEvidence slot could not be deterministically mapped')
    }
  }

  return collector.finalize()
}

const EMDASH_REPEATER_MAP = Object.freeze({
  pricing_tiers: {
    entityKind: 'package',
    roles: {
      name: 'package.name',
      badge: 'package.badge',
      summary: 'package.summary',
      price: 'package.price',
      period: 'package.period',
      features: 'package.features_list',
      cta_label: 'package.cta_label',
      cta_url: 'package.cta_url'
    }
  },
  stats: {
    entityKind: 'stat_item',
    roles: {
      value: 'stat.value',
      caption: 'stat.label'
    }
  },
  stats_figures: {
    entityKind: 'stat_item',
    roles: {
      value: 'stat.value',
      caption: 'stat.label'
    }
  },
  team_quotes: {
    entityKind: 'person',
    roles: {
      quote: 'person.bio',
      name: 'person.name',
      role: 'person.role'
    }
  },
  testimonials_quotes: {
    entityKind: 'quote',
    roles: {
      quote: 'quote.text',
      name: 'quote.author_name',
      role: 'quote.author_context'
    }
  },
  clients_marks: {
    entityKind: 'claim',
    roles: {
      image: 'claim.entity_logo',
      name: 'claim.entity_name',
      url: 'claim.entity_url'
    }
  },
  team_members: {
    entityKind: 'person',
    roles: {
      image: 'person.image',
      image_alt: 'person.role',
      name: 'person.name',
      role: 'person.role',
      text: 'person.bio',
      url: 'person.social_url'
    }
  },
  timeline_entries: {
    entityKind: 'event',
    roles: {
      marker: 'event.date_or_year',
      title: 'event.title',
      text: 'event.description'
    }
  },
  faq_items: {
    entityKind: 'faq',
    roles: {
      question: 'faq.question',
      answer: 'faq.answer'
    }
  },
  hero_notes: {
    entityKind: 'claim',
    roles: {
      text: 'claim.notice'
    }
  },
  services_items: {
    entityKind: 'service',
    roles: {
      title: 'offering.name',
      text: 'offering.summary'
    }
  }
})

const EMDASH_SCALAR_FACT_ROLES = Object.freeze({
  team_note: { entityKind: 'claim', role: 'claim.notice' },
  pricing_note: { entityKind: 'claim', role: 'claim.notice' },
  pricing_disclaimer: { entityKind: 'claim', role: 'claim.notice' },
  notice: { entityKind: 'claim', role: 'claim.notice' },
  footer_note: { entityKind: 'claim', role: 'claim.notice' },
  note: { entityKind: 'claim', role: 'claim.notice' },
  pricing_intro: { entityKind: 'package', role: 'package.summary' },
  timeline_intro: { entityKind: 'event', role: 'event.description' },
  name: { entityKind: 'person', role: 'person.name' },
  author: { entityKind: 'person', role: 'person.name' }
})

// A sample post's author is template copy: binding it to person.* would put a real staff name on it.
const EMDASH_POST_FIELD_ROLES = Object.freeze({
  author: { entityKind: 'post', role: 'post.author' }
})

export function proposeEmdash(inventory) {
  const collector = buildGroupCollector()
  const reqSet = new Set(inventory.requiresEvidenceSlots)

  const stepRepeaters = new Set()
  if (inventory.seedDir && existsSync(path.join(inventory.seedDir, 'seed.json'))) {
    try {
      const seed = JSON.parse(readFileSync(path.join(inventory.seedDir, 'seed.json'), 'utf8'))
      const defaultLocale = seed.defaultLocale ?? 'en'
      for (const [collection, rawEntries] of Object.entries(seed.content ?? {})) {
        const entries = Array.isArray(rawEntries)
          ? rawEntries.filter((e) => !e?.locale || e.locale === defaultLocale)
          : []
        for (const entry of entries) {
          const slug = entry?.slug
          if (!slug) continue
          for (const field of ['stats_figures', 'stats']) {
            const arr = entry?.data?.[field]
            if (
              Array.isArray(arr) &&
              arr.length > 0 &&
              arr.every((item) => /^0\d+$/.test(String(item?.value ?? '').trim()))
            ) {
              stepRepeaters.add(`${collection}.${slug}.${field}`)
            }
          }
        }
      }
    } catch {
      // ignore seed parse error
    }
  }

  // Always bind primary site identity slots when present in slotKeys
  const allSlots = new Set(inventory.slotKeys)
  for (const [slotKey, role, entityKind] of [
    ['settings.title', 'business.name', 'business'],
    ['settings.tagline', 'business.tagline', 'business'],
    ['site.site.brand_name', 'business.name', 'business'],
    ['site.site.brand_tagline', 'business.tagline', 'business'],
    ['onepage.onepage.nav_brand', 'business.name', 'business'],
    ['onepage.onepage.footer_brand', 'business.name', 'business'],
    ['contact.contact.email', 'contact.email', 'contact']
  ]) {
    if (allSlots.has(slotKey)) {
      collector.addBinding({
        slotKey,
        groupId: `${slotKey.split('.').slice(0, 2).join('.')}.identity.0`,
        entityKind,
        itemIndex: 0,
        role
      })
    }
  }

  for (const slotKey of inventory.slotKeys) {
    const repMatch = slotKey.match(/^([^.]+)\.([^.]+)\.([^.[]+)\[(\d+)\]\.([^.]+)$/)
    if (repMatch) {
      const [, collection, slug, field, rawIdx, subField] = repMatch
      const idx = Number(rawIdx)
      if (stepRepeaters.has(`${collection}.${slug}.${field}`)) {
        const stepRoles = { value: 'step.index', caption: 'step.title', description: 'step.description' }
        const stepRole = stepRoles[subField]
        if (stepRole) {
          collector.addBinding({
            slotKey,
            groupId: `${collection}.${slug}.${field}.${idx}`,
            entityKind: 'step',
            itemIndex: idx,
            role: stepRole
          })
          continue
        }
      }
      const spec = EMDASH_REPEATER_MAP[field]
      const role = spec?.roles?.[subField]
      if (spec && role) {
        collector.addBinding({
          slotKey,
          groupId: `${collection}.${slug}.${field}.${idx}`,
          entityKind: spec.entityKind,
          itemIndex: idx,
          role
        })
        continue
      }
      if (reqSet.has(slotKey)) {
        collector.addUnplaced(slotKey, `unmapped repeater subfield ${field}.${subField}`)
      }
      continue
    }

    if (reqSet.has(slotKey)) {
      const parts = slotKey.split('.')
      const field = parts[parts.length - 1]
      const prefix = parts.slice(0, 2).join('.')
      const scalarSpec =
        (parts[0] === 'posts' && EMDASH_POST_FIELD_ROLES[field]) || EMDASH_SCALAR_FACT_ROLES[field]
      if (scalarSpec) {
        collector.addBinding({
          slotKey,
          groupId: `${prefix}.${field}.0`,
          entityKind: scalarSpec.entityKind,
          itemIndex: 0,
          role: scalarSpec.role
        })
      } else {
        collector.addUnplaced(slotKey, `unmapped scalar fact ${slotKey}`)
      }
    }
  }

  return collector.finalize()
}

/** Slot types a capture binds a role to; a link slot may go without one. */
const ROLE_TYPES = new Set(['text', 'image'])

/**
 * The rule tables' proposal written on a content map: `role` and `group` on each slot they place (a slot that already
 * has a role keeps it, with its group), `roleVocabularyVersion` at the top. Pure: the input map is not changed.
 *
 * `vocabulary` is the version the map is written in (default: what capture writes today, version 2). In version 3 the
 * roles of version 2 that no longer exist (`editorial.decorative_image`) are proposed again, and every slot's `customize`
 * follows its role (the role alone decides keep or replace, ADR 0040).
 * @param {any} contentMap
 * @param {{cms: 'joomla' | 'wordpress', vocabulary?: string}} options
 * @returns {{contentMap: any, unplaced: string[]}} `unplaced`: text and image slots still without a role, for the agent
 */
export function proposeContentMapRoles(contentMap, { cms, vocabulary = ROLE_VOCABULARY_VERSION, webroot, template }) {
  if (cms !== 'joomla' && cms !== 'wordpress') throw new Error(`cms must be joomla or wordpress, got ${cms}`)
  if (vocabulary !== ROLE_VOCABULARY_VERSION && vocabulary !== ROLE_VOCABULARY_V3)
    throw new Error(
      `vocabulary must be ${ROLE_VOCABULARY_VERSION} or ${ROLE_VOCABULARY_V3}, got ${vocabulary}`
    )
  const vocabulary3 = vocabulary === ROLE_VOCABULARY_V3
  const out = structuredClone(contentMap ?? {})
  const slots = Array.isArray(out.slots) ? out.slots : []
  if (vocabulary3)
    for (const slot of slots) {
      // A role of version 2 that version 3 dropped is proposed again; its group goes with it.
      if (slot?.role !== undefined && !isRole(slot.role, ROLE_VOCABULARY_V3)) {
        slot.role = undefined
        slot.group = undefined
      }
    }
  const open = slots.filter((slot) => slot && slot.role === undefined)
  const {
    groups,
    bindings,
    roleOnly = []
  } = cms === 'wordpress' ? proposeWordpress(open) : proposeJoomla(open, { vocabulary3 })
  const roleOnlyBySlot = new Map(roleOnly.map((b) => [b.slotKey, b.role]))
  const groupOf = new Map(groups.map((g) => [g.groupId, g]))
  const bySlot = new Map(bindings.map((b) => [b.slotKey, b]))
  // A version 3 WordPress map labels its buttons, menu links and links inside a sentence (issue #43).
  if (cms === 'wordpress' && vocabulary3) {
    const placed = new Set([...bySlot.keys(), ...roleOnlyBySlot.keys()])
    const links = proposeWordpressLinks(open.filter((slot) => !placed.has(String(slot.key))))
    for (const [slotKey, b] of links) {
      if (b.groupId === null) {
        roleOnlyBySlot.set(slotKey, b.role)
        continue
      }
      groupOf.set(b.groupId, { groupId: b.groupId, itemIndex: b.itemIndex, entityKind: b.entityKind })
      bySlot.set(slotKey, { slotKey, ...b })
    }
  }
  for (const slot of open) {
    const binding = bySlot.get(String(slot.key))
    if (!binding) {
      if (roleOnlyBySlot.has(String(slot.key))) slot.role = roleOnlyBySlot.get(String(slot.key))
      continue
    }
    slot.role = binding.role
    const group = groupOf.get(binding.groupId)
    slot.group = { id: binding.groupId, item: group.itemIndex, kind: group.entityKind }
  }
  // What no fact table placed: a text or image slot takes an editorial role from its own signals (never over a fact role).
  for (const slot of open) {
    if (slot.role !== undefined || !ROLE_TYPES.has(slot.type)) continue
    const role = editorialRoleOf(slot, { vocabulary3 })
    if (role) slot.role = role
  }
  for (const slot of slots) {
    if (slot?.role === undefined) delete slot.role
    if (slot?.group === undefined) delete slot.group
  }
  declareOfferingSummaries(out)
  const uses = sourceButtonUses(out)
  if (webroot && template)
    for (const [key, found] of languageButtonUses(out, templateButtonUses(webroot, template)))
      uses.set(key, found)
  const unplacedActions = proposeButtonActions(out, { usesBySlot: uses })
  if (vocabulary3) for (const slot of slots) deriveKeep(slot)
  out.roleVocabularyVersion = vocabulary
  const unplaced = slots
    .filter((slot) => ROLE_TYPES.has(slot?.type) && slot.role === undefined)
    .map((slot) => String(slot.key))
  return { contentMap: out, unplaced, unplacedActions }
}

/** In a version 3 map the role alone decides keep or replace: `customize` and a measured picture's `replace` follow it. */
function deriveKeep(slot) {
  if (!slot || slot.role === undefined) return
  if (customizeOfRole(slot.role) === 'keep') slot.customize = 'keep'
  else delete slot.customize
  if (slot.type === 'image' && slot.fit && Object.hasOwn(slot.fit, 'replace'))
    slot.fit.replace = pictureReplaceOfRole(slot.role)
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isMain) {
  const cms = process.argv[2]
  const flag = process.argv.indexOf('--vocabulary')
  const version = flag > 0 ? process.argv[flag + 1] : undefined
  const value = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : undefined }
  if ((cms !== 'joomla' && cms !== 'wordpress') || (version !== undefined && !['2', '3'].includes(version))) {
    process.stderr.write(
      'Usage: node scripts/slot-roles/rule-tables.mjs <joomla|wordpress> [--vocabulary 2|3] < content-map.json\n'
    )
    process.exit(2)
  }
  try {
    const contentMap = JSON.parse(readFileSync(0, 'utf8'))
    const vocabulary = version === '3' ? ROLE_VOCABULARY_V3 : ROLE_VOCABULARY_VERSION
    process.stdout.write(
      `${JSON.stringify(proposeContentMapRoles(contentMap, { cms, vocabulary, webroot: value('--webroot'), template: value('--template') }), null, 2)}\n`
    )
  } catch (error) {
    process.stderr.write(`rule-tables: ${error instanceof Error ? error.message : error}\n`)
    process.exit(1)
  }
}
