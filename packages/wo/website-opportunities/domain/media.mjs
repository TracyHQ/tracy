import { createHash } from 'node:crypto'

function startsWith(b, sig, offset = 0) {
  if (b.length < offset + sig.length) return false
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false
  return true
}
const asc = (s) => [...s].map((c) => c.charCodeAt(0))

const MP4_BRANDS = [
  'isom',
  'iso2',
  'iso4',
  'iso5',
  'iso6',
  'mp41',
  'mp42',
  'avc1',
  'M4V ',
  'dash',
  'qt  ',
  '3gp4',
  '3gp5'
]

export function sniffMime(bytes) {
  if (!bytes || typeof bytes.length !== 'number' || bytes.length < 3) return null
  const b = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes)
  if (startsWith(b, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(b, asc('GIF87a')) || startsWith(b, asc('GIF89a'))) return 'image/gif'
  if (startsWith(b, asc('RIFF')) && startsWith(b, asc('WEBP'), 8)) return 'image/webp'
  if (startsWith(b, asc('ftyp'), 4)) {
    const brand = String.fromCharCode(...b.subarray(8, 12))
    if (brand === 'avif' || brand === 'avis') return 'image/avif'
    if (MP4_BRANDS.includes(brand)) return 'video/mp4'
    return null
  }
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return 'video/webm'
  if (startsWith(b, asc('%PDF-'))) return 'application/pdf'
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(b.subarray(0, 512))
    .replace(/^﻿/, '')
    .trimStart()
    .toLowerCase()
  if (/^<(!doctype html|html|head|body|!--)/.test(head)) return 'text/html'
  return null
}

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

// Folded to ASCII (diacritics stripped), matched on word boundaries; first category to match wins.
const CATEGORY_WORDS = [
  [
    'event',
    [
      'event',
      'events',
      'live music',
      'music',
      'party',
      'festival',
      'concert',
      'celebration',
      'workshop',
      'night',
      'tonight',
      'su kien',
      'le hoi',
      'nhac song',
      'tiec',
      'khai truong'
    ]
  ],
  [
    'people',
    [
      'chef',
      'chefs',
      'team',
      'staff',
      'owner',
      'founder',
      'barista',
      'bartender',
      'waiter',
      'guests',
      'customers',
      'nhan vien',
      'dau bep',
      'chu quan'
    ]
  ],
  [
    'food',
    [
      'food',
      'dish',
      'dishes',
      'menu',
      'pho',
      'bun',
      'banh',
      'banh mi',
      'com',
      'mon',
      'coffee',
      'cafe',
      'ca phe',
      'tea',
      'tra',
      'drink',
      'drinks',
      'cocktail',
      'cocktails',
      'beer',
      'wine',
      'dessert',
      'cake',
      'pizza',
      'burger',
      'sushi',
      'noodle',
      'noodles',
      'soup',
      'salad',
      'steak',
      'seafood',
      'breakfast',
      'brunch',
      'lunch',
      'dinner',
      'do an',
      'mon an'
    ]
  ],
  [
    'space',
    [
      'interior',
      'space',
      'terrace',
      'rooftop',
      'garden',
      'room',
      'decor',
      'view',
      'seating',
      'dining room',
      'patio',
      'storefront',
      'facade',
      'khong gian',
      'san vuon',
      'phong'
    ]
  ]
]

function fold(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
}

export function classifyMedia({ caption, alt, url } = {}) {
  let path = ''
  try {
    path = url ? decodeURIComponent(new URL(url).pathname) : ''
  } catch {
    path = String(url ?? '')
  }
  const text = ` ${fold([caption, alt, path].filter(Boolean).join(' '))} `
  for (const [category, words] of CATEGORY_WORDS) {
    if (words.some((w) => text.includes(` ${w} `))) return category
  }
  return 'other'
}
