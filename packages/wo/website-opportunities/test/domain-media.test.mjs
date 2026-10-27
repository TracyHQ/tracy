import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sniffMime, sha256Hex, classifyMedia } from '../domain/media.mjs'

const bytes = (...xs) => Uint8Array.from(xs)
const ascii = (s) => new TextEncoder().encode(s)
const concat = (...parts) => Uint8Array.from(parts.flatMap((p) => [...p]))

test('sniffMime recognises each supported format by its magic bytes', () => {
  assert.equal(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)), 'image/jpeg')
  assert.equal(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
  assert.equal(sniffMime(ascii('GIF89a......')), 'image/gif')
  assert.equal(sniffMime(concat(ascii('RIFF'), bytes(0, 0, 0, 0), ascii('WEBPVP8 '))), 'image/webp')
  assert.equal(sniffMime(concat(bytes(0, 0, 0, 0x1c), ascii('ftypavif'), bytes(0, 0, 0, 0))), 'image/avif')
  assert.equal(sniffMime(concat(bytes(0, 0, 0, 0x20), ascii('ftypisom'), bytes(0, 0, 0, 0))), 'video/mp4')
  assert.equal(sniffMime(concat(bytes(0, 0, 0, 0x20), ascii('ftypmp42'), bytes(0, 0, 0, 0))), 'video/mp4')
  assert.equal(sniffMime(bytes(0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3)), 'video/webm')
  assert.equal(sniffMime(ascii('%PDF-1.7\n')), 'application/pdf')
  assert.equal(sniffMime(ascii('﻿  <!DOCTYPE html><html>')), 'text/html')
  assert.equal(sniffMime(ascii('\n<html lang="vi">')), 'text/html')
})

test('sniffMime returns null for unknown or empty input and ignores a lying extension', () => {
  assert.equal(sniffMime(ascii('hello world')), null)
  assert.equal(sniffMime(new Uint8Array()), null)
  assert.equal(sniffMime(null), null)
})

test('sha256Hex hashes bytes (known vector)', () => {
  assert.equal(sha256Hex(ascii('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('classifyMedia sorts by caption, alt and URL keywords, English and Vietnamese', () => {
  assert.equal(classifyMedia({ caption: 'Our signature pho bo, freshly made' }), 'food')
  assert.equal(classifyMedia({ alt: 'Món bún chả Hà Nội' }), 'food')
  assert.equal(classifyMedia({ caption: 'Cozy rooftop terrace and interior' }), 'space')
  assert.equal(classifyMedia({ caption: 'Live music night this Friday!' }), 'event')
  assert.equal(classifyMedia({ caption: 'Meet our chef and team' }), 'people')
  assert.equal(classifyMedia({ url: 'https://x.test/img/menu-dessert.jpg' }), 'food')
  assert.equal(classifyMedia({ caption: '' }), 'other')
  assert.equal(classifyMedia({}), 'other')
})
