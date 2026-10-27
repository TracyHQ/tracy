import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  matchDishPhotos,
  confirmDishPhoto,
  isDishVision,
  withAcceptedDishPhotos,
  DISH_PHOTOS_MATCHER
} from '../domain/dish-photos.mjs'
import { placeProfileFromResearch } from '../domain/place-profile-from-research.mjs'
import { validatePlaceProfile } from '../domain/place-profile.mjs'

const item = (name, extra = {}) => ({ name, ...extra })
const pic = (id, extra = {}) => ({
  id,
  kind: 'image',
  source: 'website',
  width: 800,
  height: 600,
  caption: null,
  alt: null,
  ...extra
})
const food = { vision: { key: 'k', labels: { subject: 'food' } } }
const pairs = (out) => out.map((m) => [m.itemIndex, m.mediaId, m.how, m.status])

test('the matcher names its version', () => {
  // test-quality: contract the matcher version is stored with every dish photo; changing it marks old matches
  assert.equal(DISH_PHOTOS_MATCHER, 'dish-photos/1')
})

test('a photo whose own caption names one dish is a candidate for it, with the quote', () => {
  const out = matchDishPhotos({
    menuItems: [item('Phở bò tái'), item('Bún chả Hà Nội')],
    media: [pic('m1', { caption: 'Bún chả Hà Nội nóng hổi' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[1, 'm1', 'caption', 'candidate']])
  assert.equal(out[0].evidence.quote, 'Bún chả Hà Nội nóng hổi')
})

test('Tracy vision calling it food, drink or dessert accepts the candidate', () => {
  const out = matchDishPhotos({
    menuItems: [item('Margherita pizza')],
    media: [pic('m1', { alt: 'Our margherita pizza', labels: food })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[0, 'm1', 'caption', 'accepted']])
})

test('vision saying a menu board, a person or the room drops the candidate', () => {
  for (const subject of ['menu-board', 'people', 'interior', 'poster']) {
    const out = matchDishPhotos({
      menuItems: [item('Margherita pizza')],
      media: [pic('m1', { alt: 'Margherita pizza', labels: { vision: { labels: { subject } } } })],
      posts: []
    })
    assert.deepEqual(out, [], subject)
  }
})

test('accents are compared: "Bánh bò" is not "Bánh bơ"', () => {
  const out = matchDishPhotos({
    menuItems: [item('Bánh bò nướng'), item('Bánh bơ nướng')],
    media: [pic('m1', { caption: 'Bánh bơ nướng mới ra lò' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[1, 'm1', 'caption', 'candidate']])
})

test('an unaccented text matches an accented name only when no other dish folds alike', () => {
  const unique = matchDishPhotos({
    menuItems: [item('Bún chả Hà Nội')],
    media: [pic('m1', { caption: 'bun cha ha noi ngon' })],
    posts: []
  })
  assert.deepEqual(pairs(unique), [[0, 'm1', 'caption', 'candidate']])
  const collide = matchDishPhotos({
    menuItems: [item('Cơm chay thập cẩm'), item('Cơm cháy thập cẩm')],
    media: [pic('m1', { caption: 'com chay thap cam' })],
    posts: []
  })
  assert.deepEqual(collide, [])
  // A text with any accent is read as written: no folding.
  const accented = matchDishPhotos({
    menuItems: [item('Bún chả Hà Nội')],
    media: [pic('m1', { caption: 'bun cha ha noi — món ngon' })],
    posts: []
  })
  assert.deepEqual(accented, [])
})

test('a name matches only as whole words, Unicode-aware', () => {
  const out = matchDishPhotos({
    menuItems: [item('Gà nướng muối ớt')],
    media: [pic('m1', { caption: 'Gà nướng muối ớtxanh' }), pic('m2', { caption: 'Gà nướng muối ớt!' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[0, 'm2', 'caption', 'candidate']])
})

test('the longest name wins and masks the shorter one inside it', () => {
  const out = matchDishPhotos({
    menuItems: [item('Phở bò'), item('Phở bò tái lăn')],
    media: [pic('m1', { caption: 'Phở bò tái lăn đặc biệt' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[1, 'm1', 'caption', 'candidate']])
})

test('generic and side names never match; a size note in brackets is ignored', () => {
  const out = matchDishPhotos({
    menuItems: [
      item('Món mới'),
      item('Combo 1'),
      item('Drinks'),
      item('Extra rice'),
      item('Bò kho (tô lớn)')
    ],
    media: [
      pic('m1', { caption: 'Món mới!' }),
      pic('m2', { caption: 'Combo 1 giá sốc' }),
      pic('m3', { caption: 'Drinks' }),
      pic('m4', { caption: 'extra rice' }),
      pic('m5', { caption: 'Bò kho nóng' })
    ],
    posts: []
  })
  assert.deepEqual(pairs(out), [[4, 'm5', 'caption', 'candidate']])
})

test('a short one-word name is too generic', () => {
  const out = matchDishPhotos({
    menuItems: [item('Pho'), item('Tacos')],
    media: [pic('m1', { caption: 'Pho' }), pic('m2', { caption: 'Tacos tonight' })],
    posts: []
  })
  assert.deepEqual(out, [])
})

test('a single-photo post that names exactly one dish makes its photo a candidate', () => {
  const posts = [
    { source: 'facebook', id: 'p1', url: 'https://fb.test/p1', caption: 'Hôm nay có Bún bò Huế!' }
  ]
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế'), item('Cơm tấm sườn')],
    media: [
      pic('m1', {
        source: 'facebook',
        postId: 'p1',
        caption: 'Hôm nay có Bún bò Huế!',
        sourceUrl: 'https://fb.test/p1',
        labels: food
      })
    ],
    posts
  })
  assert.deepEqual(pairs(out), [[0, 'm1', 'post-text', 'accepted']])
  assert.equal(out[0].evidence.postId, 'p1')
  assert.equal(out[0].evidence.sourceUrl, 'https://fb.test/p1')
})

test('a post naming two dishes says nothing about its photo', () => {
  const posts = [{ source: 'instagram', id: 'p1', caption: 'Bún bò Huế và Cơm tấm sườn' }]
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế'), item('Cơm tấm sườn')],
    media: [pic('m1', { source: 'instagram', postId: 'p1', caption: posts[0].caption, labels: food })],
    posts
  })
  assert.deepEqual(out, [])
})

test('a multi-photo post: each photo is a candidate, accepted only when it is the one dish photo of the post', () => {
  const posts = [{ source: 'facebook', id: 'p1', caption: 'Bún bò Huế chuẩn vị' }]
  const base = { source: 'facebook', postId: 'p1', caption: posts[0].caption }
  const room = { vision: { labels: { subject: 'interior' } } }
  const one = matchDishPhotos({
    menuItems: [item('Bún bò Huế')],
    media: [pic('m1', { ...base, labels: room }), pic('m2', { ...base, labels: food })],
    posts
  })
  assert.deepEqual(pairs(one), [[0, 'm2', 'post-text', 'accepted']])
  // Two food photos in one post: which is the dish is not known.
  const two = matchDishPhotos({
    menuItems: [item('Bún bò Huế')],
    media: [pic('m1', { ...base, labels: food }), pic('m2', { ...base, labels: food, width: 1200 })],
    posts
  })
  assert.deepEqual(pairs(two), [[0, 'm2', 'post-text', 'candidate']])
  // A sibling nobody looked at may be the dish.
  const unseen = matchDishPhotos({
    menuItems: [item('Bún bò Huế')],
    media: [pic('m1', { ...base }), pic('m2', { ...base, labels: food })],
    posts
  })
  assert.deepEqual(pairs(unseen), [[0, 'm2', 'post-text', 'candidate']])
})

test('caption and post naming different dishes is a conflict: dropped', () => {
  const posts = [{ source: 'facebook', id: 'p1', caption: 'Bún bò Huế ngon nhất phố' }]
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế'), item('Cơm tấm sườn')],
    media: [pic('m1', { source: 'facebook', postId: 'p1', caption: 'Cơm tấm sườn', labels: food })],
    posts
  })
  assert.deepEqual(out, [])
})

test('negation, comparison and combo words drop the evidence', () => {
  const menuItems = [item('Bún bò Huế'), item('Cơm tấm sườn')]
  for (const caption of [
    'Bún bò Huế hôm nay hết rồi',
    'Bún bò Huế sold out',
    'Not our Bún bò Huế',
    'Combo Bún bò Huế + trà đá',
    'Bún bò Huế so với phở?'
  ]) {
    const out = matchDishPhotos({ menuItems, media: [pic('m1', { caption })], posts: [] })
    assert.deepEqual(out, [], caption)
  }
})

test('each dish keeps one photo: caption before post text, then the larger one', () => {
  const posts = [{ source: 'facebook', id: 'p1', caption: 'Margherita pizza night' }]
  const out = matchDishPhotos({
    menuItems: [item('Margherita pizza')],
    media: [
      pic('big', { source: 'facebook', postId: 'p1', caption: posts[0].caption, width: 2000, height: 1500 }),
      pic('small', { alt: 'Margherita pizza', width: 640, height: 480 }),
      pic('mid', { alt: 'Margherita pizza', width: 1000, height: 800 })
    ],
    posts
  })
  assert.deepEqual(pairs(out), [[0, 'mid', 'caption', 'candidate']])
})

test('an accepted photo beats a candidate whatever its evidence', () => {
  const posts = [{ source: 'facebook', id: 'p1', caption: 'Margherita pizza night' }]
  const out = matchDishPhotos({
    menuItems: [item('Margherita pizza')],
    media: [
      pic('a', { source: 'facebook', postId: 'p1', caption: posts[0].caption, labels: food }),
      pic('b', { alt: 'Margherita pizza' })
    ],
    posts
  })
  assert.deepEqual(pairs(out), [[0, 'a', 'post-text', 'accepted']])
})

test('the same picture matched to two dishes (a copy in two sources) is dropped', () => {
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế'), item('Cơm tấm sườn')],
    media: [
      pic('m1', { sha256: 'x', caption: 'Bún bò Huế' }),
      pic('m2', { sha256: 'x', caption: 'Cơm tấm sườn' })
    ],
    posts: []
  })
  assert.deepEqual(out, [])
})

test('the same name twice on a menu (two sizes) is one dish: the first item takes the photo', () => {
  const out = matchDishPhotos({
    menuItems: [item('Pizza Margherita', { size: 'S' }), item('Pizza Margherita', { size: 'L' })],
    media: [pic('m1', { caption: 'Pizza Margherita' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[0, 'm1', 'caption', 'candidate']])
})

test('a guest photo of a review site is read by the words of its own review, never a caption', () => {
  const reviews = [
    {
      id: 'r1',
      source: 'tripadvisor',
      text: 'The Bún bò Huế was rich and spicy.',
      url: 'https://ta.test/r1'
    },
    { id: 'r2', source: 'google-maps', text: 'Lovely staff.', url: 'https://maps.test/r2' }
  ]
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế'), item('Phở bò')],
    media: [
      pic('ta', { source: 'tripadvisor', postId: 'r1', labels: food }),
      // Its review names no dish: the caption beside it is not the review's word.
      pic('gm', { source: 'google-maps', postId: 'r2', caption: 'Phở bò' })
    ],
    posts: [],
    reviews
  })
  assert.deepEqual(pairs(out), [[0, 'ta', 'post-text', 'accepted']])
  assert.equal(out[0].evidence.quote, 'The Bún bò Huế was rich and spicy.')
  assert.equal(out[0].evidence.sourceUrl, 'https://ta.test/r1')
  assert.equal(out[0].evidence.postId, 'r1')
  // A review of another site with the same id is not this photo's review.
  const other = [{ ...reviews[0], source: 'google-maps' }]
  assert.deepEqual(
    matchDishPhotos({
      menuItems: [item('Bún bò Huế')],
      media: [pic('ta', { source: 'tripadvisor', postId: 'r1' })],
      reviews: other
    }),
    []
  )
})

test('guest photos without their review, videos and file names are not evidence', () => {
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế')],
    media: [
      pic('ta', { source: 'tripadvisor', postId: 'r1', caption: 'Bún bò Huế' }),
      pic('gm', { source: 'google-maps', caption: 'Bún bò Huế' }),
      pic('v', { kind: 'video', caption: 'Bún bò Huế' }),
      pic('f', { sourceUrl: 'https://cdn.test/bun-bo-hue.jpg' })
    ],
    posts: []
  })
  assert.deepEqual(out, [])
})

test('Japanese: a name inside unspaced text matches, longest first', () => {
  const out = matchDishPhotos({
    menuItems: [item('味噌ラーメン'), item('特製味噌ラーメン')],
    media: [
      pic('m1', { caption: '本日の特製味噌ラーメンです' }),
      pic('m2', { caption: '味噌ラーメンが人気' })
    ],
    posts: []
  })
  assert.deepEqual(pairs(out), [
    [0, 'm2', 'caption', 'candidate'],
    [1, 'm1', 'caption', 'candidate']
  ])
})

test('Arabic: a name matches as whole words', () => {
  const out = matchDishPhotos({
    menuItems: [item('شاورما دجاج')],
    media: [pic('m1', { caption: 'جربوا شاورما دجاج اليوم' })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[0, 'm1', 'caption', 'candidate']])
})

test('a menu item already carrying a menu-card photo keeps it, accepted', () => {
  const out = matchDishPhotos({
    menuItems: [item('Bún bò Huế', { photo: { mediaId: 'm9', how: 'menu-card', status: 'accepted' } })],
    media: [pic('m9'), pic('m1', { caption: 'Bún bò Huế', labels: food })],
    posts: []
  })
  assert.deepEqual(pairs(out), [[0, 'm9', 'menu-card', 'accepted']])
})

test('isDishVision: food, drink or dessert, not a collage nor a flyer', () => {
  assert.equal(isDishVision({ subject: 'drink' }), true)
  assert.equal(isDishVision({ subject: 'food', isCollage: true }), false)
  assert.equal(isDishVision({ subject: 'food', hasTextOverlay: true }), false)
  assert.equal(isDishVision(null), false)
})

test('confirmDishPhoto upgrades a candidate when vision arrives later, with the same post rule', () => {
  const photo = { assetId: 'm2', status: 'candidate', how: 'post-text', evidence: { postId: 'p1' } }
  const pictures = [
    { id: 'm1', postId: 'p1', vision: { subject: 'interior' } },
    { id: 'm2', postId: 'p1', vision: { subject: 'food' } }
  ]
  assert.equal(confirmDishPhoto(photo, pictures), 'accepted')
  pictures[0].vision = { subject: 'food' }
  assert.equal(confirmDishPhoto(photo, pictures), 'candidate')
  assert.equal(confirmDishPhoto({ ...photo, status: 'accepted' }, []), 'accepted')
  assert.equal(confirmDishPhoto({ ...photo, assetId: 'gone' }, pictures), 'candidate')
})

test('a photo the sender attached is a candidate until vision calls it a dish; an accepted text match beats it', () => {
  const sent = {
    mediaId: 's1',
    how: 'sender',
    status: 'candidate',
    evidence: { sourceUrl: 'https://x.test/a.jpg' }
  }
  const alone = matchDishPhotos({
    menuItems: [item('Bún bò Huế', { photo: sent })],
    media: [pic('s1')],
    posts: []
  })
  assert.deepEqual(pairs(alone), [[0, 's1', 'sender', 'candidate']])
  const seen = matchDishPhotos({
    menuItems: [item('Bún bò Huế', { photo: sent })],
    media: [pic('s1', { labels: food })],
    posts: []
  })
  assert.deepEqual(pairs(seen), [[0, 's1', 'sender', 'accepted']])
  const better = matchDishPhotos({
    menuItems: [item('Bún bò Huế', { photo: sent })],
    media: [pic('s1'), pic('m1', { caption: 'Bún bò Huế', labels: food })],
    posts: []
  })
  assert.deepEqual(pairs(better), [[0, 'm1', 'caption', 'accepted']])
})

test("photos sharing one caption word for word carry a post's text, not each its own: the multi-photo rule holds", () => {
  const caption = 'Phở bò tái lăn của quán, ăn kèm gỏi cuốn và cà phê sữa đá'
  const media = [
    pic('m1', { source: 'website-opportunities', caption, labels: food }),
    pic('m2', { source: 'website-opportunities', caption, labels: food, width: 1600 }),
    pic('m3', { source: 'website-opportunities', caption, labels: food })
  ]
  const out = matchDishPhotos({ menuItems: [item('Phở bò tái lăn')], media, posts: [] })
  assert.deepEqual(pairs(out), [[0, 'm2', 'post-text', 'candidate']])
  assert.deepEqual(out[0].evidence.siblings, ['m1', 'm2', 'm3'])
  // Read again at build time with the same pictures: still not known which photo shows the dish.
  const pictures = media.map((m) => ({ id: m.id, postId: null, vision: food.vision }))
  const photo = { assetId: 'm2', how: out[0].how, status: out[0].status, evidence: out[0].evidence }
  assert.equal(confirmDishPhoto(photo, pictures), 'candidate')
})

test("a post photo's caption that is its post's text cut short is the post's word, not the photo's", () => {
  const text = `Phở bò tái lăn mới ra lò. ${'Nước dùng ninh suốt đêm với quế và hồi. '.repeat(30)}`
  const posts = [{ source: 'facebook', id: 'p1', caption: text.slice(0, 1000) }]
  const base = { source: 'facebook', postId: 'p1', caption: text.slice(0, 500) }
  const out = matchDishPhotos({
    menuItems: [item('Phở bò tái lăn')],
    media: [pic('m1', { ...base, labels: food }), pic('m2', { ...base, labels: food, width: 1600 })],
    posts
  })
  assert.deepEqual(pairs(out), [[0, 'm2', 'post-text', 'candidate']])
})

// withAcceptedDishPhotos: a profile frozen before vision looked at its pictures, read with this build's labels.
{
  const sha = (c) => c.repeat(64)
  const research = {
    identity: { provider: 'google', provider_id: 'p1', name: 'Quán Phở' },
    profile: {
      name: 'Quán Phở',
      menuItems: [
        { name: 'Phở bò tái', source: { kind: 'page', url: 'https://pho.vn/menu' } },
        { name: 'Bún chả Hà Nội', source: { kind: 'page', url: 'https://pho.vn/menu' } }
      ]
    },
    media: [
      { id: 'a', kind: 'image', status: 'stored', sha256: sha('a'), source: 'website' },
      { id: 'b', kind: 'image', status: 'stored', sha256: sha('b'), source: 'website' }
    ]
  }
  const profile = placeProfileFromResearch(research)
  const briefOf = (items) => ({
    assets: [
      { id: 'a', kind: 'image', sha256: sha('a') },
      { id: 'b', kind: 'image', sha256: sha('b') },
      { id: 'z', kind: 'image', sha256: sha('c') }
    ],
    sitemap: [{ sections: [{ menuItems: items }] }]
  })
  const candidate = (assetId) => ({ assetId, status: 'candidate', how: 'caption', evidence: { quote: 'x' } })
  const dish = (id) => ({ id, vision: { subject: 'food' } })
  const depicted = (p) =>
    p.media.flatMap((m) =>
      m.value.relations.map((r) => [
        m.value.sha256[0],
        p.offerings.find((o) => o.id === r.entityId)?.value.name
      ])
    )

  test('a candidate vision calls a dish depicts that dish in a copy; the profile is left as it is', () => {
    const before = structuredClone(profile)
    const out = withAcceptedDishPhotos(profile, {
      brief: briefOf([{ name: 'Bún chả Hà Nội', photo: candidate('b') }]),
      pictures: [dish('b')]
    })
    assert.deepEqual(depicted(out), [['b', 'Bún chả Hà Nội']])
    const ref = out.media.find((m) => m.value.sha256 === sha('b')).value.relations[0].evidenceRefs[0]
    assert.deepEqual(out.evidence.find((e) => e.id === ref).extraction, {
      method: 'dish-photos',
      version: DISH_PHOTOS_MATCHER
    })
    assert.equal(validatePlaceProfile(out).ok, true)
    assert.deepEqual(profile, before)
  })

  test('no photo is added without vision, outside the profile, or for two dishes at once', () => {
    const none = (items, pictures) =>
      depicted(withAcceptedDishPhotos(profile, { brief: briefOf(items), pictures }))
    assert.deepEqual(none([{ name: 'Phở bò tái', photo: candidate('a') }], []), [])
    assert.deepEqual(
      none([{ name: 'Phở bò tái', photo: candidate('z') }], [dish('z')]),
      [],
      'not in profile.media'
    )
    assert.deepEqual(
      none([{ name: 'Cơm tấm sườn', photo: candidate('a') }], [dish('a')]),
      [],
      'not a dish of the profile'
    )
    assert.deepEqual(
      none(
        [
          { name: 'Phở bò tái', photo: candidate('a') },
          { name: 'Bún chả Hà Nội', photo: candidate('a') }
        ],
        [dish('a')]
      ),
      [],
      'a photo two dishes claim is nobody’s'
    )
  })

  test('a photo the frozen profile already links keeps its one link', () => {
    const linked = placeProfileFromResearch({
      ...research,
      profile: {
        ...research.profile,
        menuItems: research.profile.menuItems.map((i, n) =>
          n === 0 ? { ...i, photo: { mediaId: 'a', status: 'accepted', how: 'menu-card' } } : i
        )
      }
    })
    const out = withAcceptedDishPhotos(linked, {
      brief: briefOf([{ name: 'Bún chả Hà Nội', photo: candidate('a') }]),
      pictures: [dish('a')]
    })
    assert.deepEqual(depicted(out), [['a', 'Phở bò tái']])
  })
}
