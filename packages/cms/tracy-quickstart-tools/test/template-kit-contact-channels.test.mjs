// The channels a CMS contact page accepts: read from the contact's fields, the switches that print them and the
// template's own layout files. Fabricated site: a swim club with one contact.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joomlaAdapter } from '../template-kit/lib/site/adapters/joomla.mjs'
import { mergeSite } from '../template-kit/lib/kit-site.mjs'

const ADDRESS = `<?php if ($this->item->telephone && $this->params->get('show_telephone')) : ?>
<?php echo $this->item->telephone; ?><?php endif; ?>
<?php if ($this->item->mobile && $this->params->get('show_mobile')) : ?><?php echo $this->item->mobile; ?><?php endif; ?>
<?php if ($this->item->email_to && $this->params->get('show_email')) : ?><?php echo $this->item->email_to; ?><?php endif; ?>`
const MAIN = `<?php if ($this->item->address && $this->params->get('show_street_address')) : ?>
<?php echo nl2br($this->item->address); ?><?php endif; ?>
<?php echo $this->loadTemplate('address'); ?>
<?php if ($tparams->get('show_links')) : ?><?php echo $this->loadTemplate('links'); ?><?php endif; ?>`

function fakeSource({ showLinks = '0', linka = '' } = {}) {
  const files = {
    'templates/swim/html/com_contact/contact/default_address.php': ADDRESS,
    'templates/swim/html/com_contact/contact/default.php': MAIN
  }
  const rows = {
    'SHOW TABLES': [{ t: 'ab_extensions' }, { t: 'ab_menu' }, { t: 'ab_contact_details' }],
    template_styles: [{ template: 'swim' }],
    menu: [],
    contact_details: [
      {
        address: '12 Harbour Road',
        telephone: '(555) 010-2000',
        fax: '',
        mobile: '',
        email_to: 'hello@harbour-swim.test',
        webpage: '',
        params: JSON.stringify({ show_mobile: '', show_links: '', linka_name: linka ? 'Chat' : '', linka })
      }
    ],
    extensions: [
      {
        enabled: '1',
        params: JSON.stringify({
          show_street_address: '1',
          show_telephone: '1',
          show_mobile: '1',
          show_fax: '1',
          show_email: '1',
          show_webpage: '1',
          show_links: showLinks
        })
      }
    ]
  }
  return {
    readFile: (rel) => files[rel] ?? null,
    query: (sql) => rows[sql === 'SHOW TABLES' ? sql : /FROM ab_(\w+)/.exec(sql)?.[1]] ?? []
  }
}

test('a contact page accepts the fields its layout prints and its switches show, one value each', () => {
  const c = joomlaAdapter(fakeSource()).contactChannels('contact-3')
  const kinds = Object.fromEntries(c.fields.map((f) => [f.kind, f]))
  assert.deepEqual(
    c.fields.filter((f) => f.printed).map((f) => f.kind),
    ['address', 'phone', 'mobile', 'email'],
    'the layouts print no fax or website line; the address is printed by the main layout'
  )
  assert.equal(kinds.phone.filled, true)
  assert.equal(
    kinds.mobile.filled,
    false,
    'an empty field the page prints once filled: a second phone fits there'
  )
  assert.equal(kinds.mobile.max, 1)
  assert.equal(kinds.fax.printed, false)
  assert.equal(c.namedLinks.printed, false, 'named links are switched off')
  assert.equal(c.namedLinks.max, 5)
  assert.match(c.otherChannels, /^none/, 'a messaging app or social profile has nowhere to go: said so')
  assert.equal(c.repeatableRows, false)
})

test('with named links switched on, other channels go there, up to five', () => {
  const c = joomlaAdapter(
    fakeSource({ showLinks: '1', linka: 'https://chat.example/harbour' })
  ).contactChannels('contact-3')
  assert.equal(c.namedLinks.printed, true)
  assert.equal(c.namedLinks.filled, 1)
  assert.doesNotMatch(c.otherChannels, /^none/)
  assert.equal(
    joomlaAdapter(fakeSource()).contactChannels('module-4'),
    null,
    'only a CMS contact has channels'
  )
})

test('the kit says on the contact block what it accepts', () => {
  const accepts = joomlaAdapter(fakeSource()).contactChannels('contact-3')
  const kit = {
    blocks: [
      {
        id: 'body-contact',
        source: { entity: 'contact-3' },
        fixedText: [],
        links: [],
        lists: [],
        frames: []
      },
      { id: 'block-9', source: { entity: 'module-9' }, fixedText: [], links: [], lists: [], frames: [] }
    ],
    pages: [],
    errors: [],
    checks: {}
  }
  const site = {
    contactBlocks: [
      { block: 'body-contact', kinds: { phone: 1 } },
      { block: 'block-9', kinds: { phone: 1 } }
    ],
    contactChannels: { 'contact-3': accepts }
  }
  mergeSite(kit, { site, mainHeadings: [], errors: [] }, { slots: [], pages: [], entities: [] })
  const [own, other] = kit.site.contactBlocks
  assert.deepEqual(own.accepts, accepts)
  assert.equal(other.accepts, undefined, 'a block of its own words is not a CMS contact')
  assert.equal(kit.site.contactChannels, undefined, 'read once, said on the block')
})
