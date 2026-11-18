// A made-up studio's research (every name, place and link invented), shared by the saved profile tests.
export const AT = '2026-11-01T10:00:00.000Z'
export const REVIEW = { text: 'Calm room, kind teachers.', author: 'Guest One', publishTime: AT }
export const OTHER_REVIEW = { text: 'Booked in a minute.', author: 'Guest Two', publishTime: AT }

export function research() {
  return {
    identity: { namespace: 'google', externalId: 'lumen-studio', name: 'Lumen Studio' },
    madeAt: AT,
    profile: {
      name: 'Lumen Studio',
      address: '12 Example Lane, Sampletown',
      phone: '+1 555 0100',
      bio: 'Yoga classes for every body. Coach Mira leads the mornings.',
      socials: { instagram: 'https://www.instagram.com/lumen.studio.example' },
      googlePlace: {
        placeId: 'lumen-studio',
        primaryType: 'yoga_studio',
        types: ['yoga_studio', 'gym'],
        openingHours: ['Monday: 7:00 AM to 8:00 PM', 'Tuesday: 7:00 AM to 8:00 PM'],
        amenities: { wheelchairAccessibleEntrance: true, freeParkingLot: false },
        reservable: true,
        summaries: { editorial: 'A light filled studio for daily yoga.', reviews: 'Guests praise the calm.' },
        rating: 4.8,
        userRatingCount: 40,
        reviews: [REVIEW, OTHER_REVIEW],
        fetchedAt: AT
      },
      businessReading: {
        method: 'model',
        version: 'test-reading',
        services: [
          {
            id: 'sv_yoga',
            label: 'Yoga classes',
            quote: 'Yoga classes',
            source: { kind: 'bio' },
            kind: 'class'
          }
        ],
        team: [{ id: 'tm_mira', label: 'Mira', role: 'Coach', quote: 'Coach Mira', source: { kind: 'bio' } }],
        audience: [],
        story: [],
        serviceAreas: [],
        facts: [],
        keyMessages: []
      }
    },
    sources: [
      { source: 'google-places', ref: 'lumen-studio', status: 'complete', collected_at: AT },
      {
        source: 'instagram',
        ref: 'https://www.instagram.com/lumen.studio.example',
        status: 'complete',
        collected_at: AT
      }
    ],
    media: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        status: 'stored',
        kind: 'image',
        source: 'instagram',
        source_url: 'https://cdn.example.test/room.jpg',
        sha256: 'a'.repeat(64)
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        status: 'stored',
        kind: 'image',
        source: 'instagram',
        source_url: 'https://cdn.example.test/mat.jpg',
        sha256: 'b'.repeat(64)
      }
    ]
  }
}
