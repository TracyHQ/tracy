import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { checkContentMapRoles } from '../../packages/wo/website-opportunities/domain/content-map-roles.mjs'
import { buttonActionProblems } from '../../packages/wo/website-opportunities/domain/button-actions.mjs'
import { checkAllSlotRoles } from '../slot-roles/check.mjs'
import { proposeContentMapRoles } from '../slot-roles/rule-tables.mjs'
import { proposeButtonActions } from '../slot-roles/button-actions.mjs'
import { buttonUsesOfMarkup, sourceButtonUses } from '../slot-roles/button-markup.mjs'
import { withActionMetadata } from '../slot-roles/content-map-action-text.mjs'

test('metadata migration preserves compact arrays and all existing content declarations', () => {
  const before =
    '{\n  "slots": [\n    {\n      "key": "button",\n      "sample": "Go",\n      "jsonPath": ["card", "card[button]", 0]\n    }\n  ]\n}\n'
  const map = JSON.parse(before)
  map.slots[0].action = { kind: 'contact' }
  const after = withActionMetadata(before, map)
  assert.ok(after.includes('"jsonPath": ["card", "card[button]", 0]'))
  const stripped = JSON.parse(after)
  delete stripped.slots[0].action
  assert.deepEqual(stripped, JSON.parse(before))
  assert.equal(withActionMetadata(after, map), after)
})

test('template markup detects shared card and map-modal labels from their rendered jobs', () => {
  const markup = `<a class="btn btn-primary" href="<?php echo Route::_($item->link); ?>"><?php echo Text::_('TPL_TRY_ITEM'); ?></a>
    <button id="btn-map" data-bs-toggle="modal" data-bs-target="#modalMap"><?php echo Text::_('TPL_OPEN_MAP'); ?></button>
    <a href="/about"><?php echo Text::_('TPL_PLAIN_LINK'); ?></a>`
  const uses = buttonUsesOfMarkup(markup, 'acm/cards/tmpl/default.php')
  assert.equal(uses.get('TPL_TRY_ITEM')[0].kind, 'go-to-item')
  assert.equal(uses.get('TPL_OPEN_MAP')[0].kind, 'open-map')
  assert.equal(uses.has('TPL_PLAIN_LINK'), false)
})

test('header markup leaves logos and ordinary navigation alone while declaring its button', () => {
  const uses = buttonUsesOfMarkup(
    `<a class="logo" href="/">Home</a><a href="/contact"><?php echo Text::_('TPL_NAV_CONTACT'); ?></a><a class="btn" href="/book"><?php echo Text::_('TPL_BOOK'); ?></a>`,
    'header.php'
  )
  assert.equal(uses.has('TPL_NAV_CONTACT'), false)
  assert.equal(uses.get('TPL_BOOK')[0].kind, 'primary-cta')
})

test('header menu toggles and social buttons retain their actual jobs', () => {
  const uses = buttonUsesOfMarkup(
    `<button data-bs-toggle="collapse" data-bs-target="#navbarNav"><?php echo Text::_('TPL_MENU'); ?></button><a class="btn" href="https://instagram.com/fictional"><?php echo Text::_('TPL_PROFILE'); ?></a>`,
    'header.php'
  )
  assert.equal(uses.get('TPL_MENU')[0].kind, 'navigation')
  assert.equal(uses.get('TPL_PROFILE')[0].kind, 'external-profile')
})

test('equal button words bind to each exact source anchor instead of merging unrelated jobs', () => {
  const map = {
    entities: [
      {
        key: 'module-1',
        initial: { content: '<a class="btn" href="/contact">Go</a><a class="btn" href="#modalMap">Go</a>' }
      }
    ],
    slots: [
      {
        key: 'module-1.0',
        entity: 'module-1',
        column: 'content',
        type: 'text',
        xpath: '/html/body/div/a[1]/text()',
        sample: 'Go'
      },
      {
        key: 'module-1.1',
        entity: 'module-1',
        column: 'content',
        type: 'text',
        xpath: '/html/body/div/a[2]/text()',
        sample: 'Go'
      }
    ]
  }
  const uses = sourceButtonUses(map)
  assert.equal(uses.get('module-1.0').length, 1)
  assert.equal(uses.get('module-1.0')[0].kind, 'contact')
  assert.equal(uses.get('module-1.1').length, 1)
  assert.equal(uses.get('module-1.1')[0].kind, 'open-map')
})

test('a CTA section title and technical button settings are not button slots', () => {
  for (const field of [
    'cta[title]',
    'cta[block-intro]',
    'cta[cta-title]',
    'cta[cta-desc]',
    'cta[btn-type]',
    'cta[btn-icon]'
  ]) {
    const errors = buttonActionProblems({
      slots: [{ key: field, type: 'text', jsonPath: ['cta', field, 0] }]
    })
    assert.deepEqual(errors, [], field)
  }
})

test('unknown button destinations stay undeclared and reviewed declarations are idempotent', () => {
  const original = {
    slots: [
      {
        key: 'home.button.0',
        type: 'text',
        sample: 'A fictional caption',
        target: { block: 'home.button.0' }
      }
    ]
  }
  const first = proposeContentMapRoles(original, { cms: 'wordpress' }).contentMap
  assert.equal(first.slots[0].action, undefined)
  assert.ok(buttonActionProblems(first).length > 0)
  first.slots[0].action = { kind: 'contact' }
  const again = proposeContentMapRoles(first, { cms: 'wordpress' }).contentMap
  assert.deepEqual(again, first)
  assert.equal(again.slots[0].sample, original.slots[0].sample)
})

test('the contract validator refuses an undeclared button, including a map without editorial roles', () => {
  for (const slot of [
    { key: 'header.button', type: 'text', role: 'editorial.button_label' },
    { key: 'card.button', type: 'text', role: 'offering.cta_label' },
    { key: 'module-1.0', type: 'text', xpath: '/html/body/div/button/text()' },
    { key: 'home.button.0', type: 'text', target: { block: 'home.button.0' } }
  ]) {
    const errors = buttonActionProblems({ slots: [slot] })
    assert.ok(
      errors.some((error) => /action/.test(error)),
      errors.join('\n')
    )
  }
})

test('the packing check refuses an undeclared button while the build still reads a released map', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'button-gate-'))
  try {
    const contentMap = {
      roleVocabularyVersion: 'place-content-roles/2',
      slots: [
        {
          key: 'module-7.0',
          entity: 'module-7',
          type: 'text',
          sample: 'Order now',
          role: 'editorial.button_label'
        }
      ]
    }
    writeFileSync(path.join(root, 'content-map.json'), JSON.stringify(contentMap))
    // Build time: the roles stay usable, so a released map without declarations keeps its fill plan.
    assert.equal(checkContentMapRoles(contentMap).ok, true)
    // Packing a named contract: the undeclared button refuses it.
    const named = checkAllSlotRoles(root, [root])
    assert.equal(named.ok, false)
    assert.ok(
      named.errors.some((e) => /module-7\.0.*no action role/.test(e)),
      named.errors.join('\n')
    )
    assert.equal(named.buttons.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a header button keeps its content role and declares its primary action and own URL', () => {
  const map = {
    entities: [{ key: 'module-1', kind: 'module', identity: { position: 'header-r' } }],
    slots: [
      {
        key: 'module-1.0',
        entity: 'module-1',
        type: 'url',
        xpath: '/html/body/div/a/@href',
        sample: '/contact'
      },
      {
        key: 'module-1.1',
        entity: 'module-1',
        type: 'text',
        xpath: '/html/body/div/a/text()',
        sample: 'Contact us',
        role: 'editorial.button_label'
      }
    ]
  }
  const proposed = proposeContentMapRoles(map, { cms: 'joomla' }).contentMap
  assert.deepEqual(proposed.slots[1].action, { kind: 'primary-cta', urlKey: 'module-1.0' })
  assert.equal(proposed.slots[1].role, 'editorial.button_label')
})

test('a shared button records every conflicting rendered job and validates the common navigation label', () => {
  const map = {
    slots: [
      {
        key: 'shared.button',
        type: 'text',
        role: 'editorial.button_label',
        action: {
          kind: 'navigation',
          uses: [
            { kind: 'go-to-item', selector: '.offering a', destination: '/lessons/one' },
            { kind: 'contact', selector: '.footer a', destination: '/contact' }
          ]
        }
      }
    ],
    roleVocabularyVersion: 'place-content-roles/2'
  }
  assert.deepEqual(buttonActionProblems(map), [])
  map.slots[0].action.uses[1].kind = 'invented'
  assert.ok(buttonActionProblems(map).some((error) => /unknown action/.test(error)))
})

test('a declared URL binding must name a real URL slot', () => {
  const map = {
    slots: [
      {
        key: 'header.button',
        type: 'text',
        role: 'editorial.button_label',
        action: { kind: 'primary-cta', urlKey: 'missing' }
      }
    ],
    roleVocabularyVersion: 'place-content-roles/2'
  }
  assert.ok(buttonActionProblems(map).some((error) => /urlKey/.test(error)))
})

test('a button linking a menu item resolves to that page as navigation, and a CTA role without a destination stays undeclared', () => {
  const map = {
    pages: [{ entity: 'menuItem-40', route: 'workshops' }],
    slots: [
      {
        key: 'module-3.0',
        entity: 'module-3',
        type: 'text',
        sample: 'See workshops',
        jsonPath: ['title-btn']
      },
      {
        key: 'module-3.1',
        entity: 'module-3',
        type: 'url',
        sample: 'index.php?Itemid=40',
        jsonPath: ['link-btn']
      },
      {
        key: 'module-4.0',
        entity: 'module-4',
        type: 'text',
        sample: 'Pick this plan',
        role: 'package.cta_label'
      },
      { key: 'module-4.1', entity: 'module-4', type: 'url', sample: '#', role: 'package.cta_url' }
    ]
  }
  const unresolved = proposeButtonActions(map)
  assert.equal(map.slots[0].action?.kind, 'navigation')
  assert.equal(map.slots[0].action?.urlKey, 'module-3.1')
  assert.equal(map.slots[2].action, undefined)
  assert.ok(unresolved.includes('module-4.0'))
})

test('a contact form send button declares the form job, never a contact or conversion label', () => {
  const uses = buttonUsesOfMarkup(
    `<button class="btn btn-primary validate" type="submit"><?php echo Text::_('TPL_SEND_FORM'); ?></button>`,
    'templates/fictional/html/com_contact/contact/default_form.php'
  )
  assert.equal(uses.get('TPL_SEND_FORM')[0].kind, 'submit-form')
})

test('a page control is a declared action, and the buttons of a demo-only style-guide page need none', () => {
  // A fictional pottery studio template: a style guide article of sample buttons beside a kept lessons article.
  const map = {
    entities: [
      { key: 'article-5', kind: 'article', sourceId: 5, demoOnly: true },
      { key: 'article-2', kind: 'article', sourceId: 2 }
    ],
    slots: [
      {
        key: 'languageString-1.0',
        type: 'text',
        role: 'editorial.button_label',
        action: { kind: 'page-control' }
      },
      {
        key: 'article-5.3',
        entity: 'article-5',
        type: 'text',
        role: 'editorial.button_label',
        sample: 'Primary'
      },
      {
        key: 'article-2.7',
        entity: 'article-2',
        type: 'text',
        role: 'editorial.button_label',
        sample: 'Book a wheel'
      }
    ],
    roleVocabularyVersion: 'place-content-roles/3'
  }
  assert.deepEqual(buttonActionProblems(map), ['slot "article-2.7" has no action role'])
  map.entities[0].demoOnly = false
  assert.equal(buttonActionProblems(map).length, 2)
})
