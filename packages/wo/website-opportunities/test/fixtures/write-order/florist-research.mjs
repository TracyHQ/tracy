// The research and the model's reading of an invented florist (ticket #597), in the input shape of `needsProfileOf`.
// Three bouquets with prices, four own shop photos, three social links (one on a network the icon library has no mark
// for), two Google reviews of five and four stars and one website testimonial. Nothing here is a real business, person,
// place, review or link: phone numbers are 555 numbers and every link is on an `.example` host.
const SITE = 'https://larkspur-florist.example/'
const photo = (id, name) => ({ id, ref: `${SITE}img/${name}.jpg`, alt: `Shop photo ${name}` })

export const floristResearch = () => ({
  research: {
    sources: [
      {
        id: 'site',
        origin: 'website',
        ref: SITE,
        language: 'en',
        text:
          'Example Larkspur Florist. Wild meadow bouquet $42. Seasonal posy $28. Wedding table set $180. ' +
          'Call +1 555 0100 214 or write to hello@larkspur-florist.example. 7 Wrenfield Row, Ambermoor. ' +
          'Open Tu-Sa 09:00-18:00. Order at https://larkspur-florist.example/order ' +
          'Follow us https://www.instagram.com/larkspur_florist_example https://www.facebook.com/larkspur.florist.example ' +
          'https://www.tiktok.com/@larkspur.florist.example "Lovely flowers" says a happy customer.',
        pictures: [
          photo('p1', 'counter'),
          photo('p2', 'buckets'),
          photo('p3', 'window'),
          photo('p4', 'workbench')
        ]
      },
      {
        id: 'gmaps',
        origin: 'google',
        ref: 'invented-place-larkspur',
        fields: {
          'business.name': 'Example Larkspur Florist',
          'contact.phone': '+1 555 0100 214',
          'contact.address': '7 Wrenfield Row, Ambermoor'
        },
        reviews: [
          { author: 'Pellam Orrick', text: 'The meadow bouquet lasted two weeks on our table.', rating: 5 },
          { author: 'Wenna Clout', text: 'Kind staff and a lovely little shop.', rating: 4 }
        ]
      }
    ]
  },
  reading: {
    languages: [
      { source: 'site', language: 'en' },
      { source: 'gmaps', language: 'en' }
    ],
    facts: [
      fact('business.name', 'Example Larkspur Florist', 'Example Larkspur Florist.'),
      fact('contact.phone', '+1 555 0100 214', 'Call +1 555 0100 214'),
      fact('contact.email', 'hello@larkspur-florist.example', 'write to hello@larkspur-florist.example'),
      fact('contact.address', '7 Wrenfield Row, Ambermoor', '7 Wrenfield Row, Ambermoor.'),
      fact('contact.hours', 'Tu-Sa 09:00-18:00', 'Open Tu-Sa 09:00-18:00'),
      fact(
        'contact.cta_url',
        'https://larkspur-florist.example/order',
        'Order at https://larkspur-florist.example/order'
      ),
      fact(
        'contact.social_url',
        'https://www.instagram.com/larkspur_florist_example',
        'https://www.instagram.com/larkspur_florist_example'
      ),
      fact(
        'contact.social_url',
        'https://www.facebook.com/larkspur.florist.example',
        'https://www.facebook.com/larkspur.florist.example'
      ),
      fact(
        'contact.social_url',
        'https://www.tiktok.com/@larkspur.florist.example',
        'https://www.tiktok.com/@larkspur.florist.example'
      )
    ],
    items: [
      service('Wild meadow bouquet', '$42'),
      service('Seasonal posy', '$28'),
      service('Wedding table set', '$180')
    ],
    pictures: []
  }
})

function fact(kind, value, evidence) {
  return { source: 'site', kind, value, evidence }
}

function service(name, price) {
  return {
    source: 'site',
    kind: 'service',
    fields: { 'offering.name': name, 'offering.price': price },
    evidence: `${name} ${price}.`
  }
}
