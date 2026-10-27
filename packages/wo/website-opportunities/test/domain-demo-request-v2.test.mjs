import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validateDemoRequest } from '../domain/demo-request.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'

const valid = () => ({
  schema: 'website-opportunities/demo-request/v2',
  profile: placeProfileFromResearch({
    identity: { name: 'Town Gym', provider: 'google', providerId: 'gym' },
    profile: { googlePlace: { primaryType: 'gym' } },
    media: [{ kind: 'image', source: 'website', sourceUrl: 'https://img.example/gym.jpg' }]
  }),
  photos: [{ url: 'https://img.example/gym.jpg', alt: 'The studio' }],
  cms: 'joomla',
  template: { quickstart: 'tracy-base/j6' }
})

test('v2 preserves a valid profile and the photo fetch list', () => {
  const body = valid()
  const result = validateDemoRequest(body)
  assert.equal(result.ok, true, JSON.stringify(result.errors))
  assert.deepEqual(result.request, body)
})

test('v2 refuses unknown fields, missing media, invalid profile graphs and excess collections', () => {
  for (const [patch, path, code] of [
    [
      (r) => {
        delete r.photos
      },
      'photos',
      'REQUIRED'
    ],
    [
      (r) => {
        r.photos = null
      },
      'photos',
      'NOT_A_LIST'
    ],
    [
      (r) => {
        r.extra = true
      },
      'extra',
      'UNKNOWN_FIELD'
    ],
    [
      (r) => {
        r.profile.extra = true
      },
      'profile.extra',
      'ADDITIONAL_PROPERTY'
    ],
    [
      (r) => {
        r.photos = []
      },
      'profile.media[0].value.url',
      'PHOTO_NOT_IN_PHOTOS'
    ],
    [
      (r) => {
        r.profile.brand.logo = {
          id: 'logo',
          value: { mediaId: r.profile.media[0].id, url: 'https://img.example/other.jpg' },
          evidenceRefs: [r.profile.evidence[0].id]
        }
      },
      'profile.brand.logo.value.url',
      'PHOTO_NOT_IN_PHOTOS'
    ],
    [
      (r) => {
        r.profile.business.name.evidenceRefs = ['absent']
      },
      'profile.business.name.evidenceRefs[0]',
      'EVIDENCE_NOT_FOUND'
    ],
    [
      (r) => {
        r.profile.offerings = Array(201).fill({})
      },
      'profile.offerings',
      'TOO_MANY'
    ],
    [
      (r) => {
        r.profile.people = Array(51).fill({})
      },
      'profile.people',
      'TOO_MANY'
    ],
    [
      (r) => {
        r.profile.quotes = Array(101).fill({})
      },
      'profile.quotes',
      'TOO_MANY'
    ],
    [
      (r) => {
        r.photos = Array(25).fill(r.photos[0])
      },
      'photos',
      'TOO_MANY'
    ],
    [
      (r) => {
        r.photos[0].objectKey = 'private'
      },
      'photos.0.objectKey',
      'UNKNOWN_FIELD'
    ]
  ]) {
    const body = valid()
    patch(body)
    const result = validateDemoRequest(body)
    assert.equal(result.ok, false, path)
    assert.ok(
      result.errors.some((e) => e.path === path && e.code === code),
      JSON.stringify(result.errors)
    )
  }
})

test('v2 refuses assessment keys even inside arbitrary extension values or arrays', () => {
  for (const key of ['assessment', 'verified']) {
    const body = valid()
    body.profile.extensions['sender:extra'] = {
      id: 'extra',
      evidenceRefs: [],
      value: { nested: [{ [key]: false }] }
    }
    const result = validateDemoRequest(body)
    assert.equal(result.ok, false)
    assert.ok(result.errors.some((e) => e.code === 'SENDER_CANNOT_ASSESS' && e.path.endsWith(key)))
  }
})

test('v2 caps the complete serialized request at 512 KiB in UTF-8 bytes', () => {
  const body = valid()
  body.profile.extensions['sender:large'] = {
    id: 'large',
    evidenceRefs: [body.profile.evidence[0].id],
    value: ''
  }
  const bytes = Buffer.byteLength(JSON.stringify(body))
  body.profile.extensions['sender:large'].value = 'x'.repeat(512 * 1024 - bytes)
  assert.equal(validateDemoRequest(body).ok, true)
  body.profile.extensions['sender:large'].value += '☕'
  assert.deepEqual(validateDemoRequest(body), { ok: false, errors: [{ path: '', code: 'TOO_LARGE' }] })
})
