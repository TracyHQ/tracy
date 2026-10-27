import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSocialUrl } from '../domain/social-stats/handles.mjs'

test('facebook: page slug, numeric page, profile.php and the new /p/ form', () => {
  assert.deepEqual(parseSocialUrl('https://www.facebook.com/TamarelHoiAn'), {
    network: 'facebook',
    pageSlug: 'TamarelHoiAn',
    url: 'https://www.facebook.com/TamarelHoiAn'
  })
  assert.deepEqual(parseSocialUrl('http://m.facebook.com/TamarelHoiAn/?ref=page_internal'), {
    network: 'facebook',
    pageSlug: 'TamarelHoiAn',
    url: 'https://www.facebook.com/TamarelHoiAn'
  })
  assert.deepEqual(parseSocialUrl('https://fb.com/moonlotus.hoian/about'), {
    network: 'facebook',
    pageSlug: 'moonlotus.hoian',
    url: 'https://www.facebook.com/moonlotus.hoian'
  })
  assert.deepEqual(parseSocialUrl('https://www.facebook.com/profile.php?id=156878528267439'), {
    network: 'facebook',
    pageId: '156878528267439',
    url: 'https://www.facebook.com/profile.php?id=156878528267439'
  })
  assert.deepEqual(parseSocialUrl('https://www.facebook.com/pages/Tamarel-Restaurant/156878528267439'), {
    network: 'facebook',
    pageId: '156878528267439',
    url: 'https://www.facebook.com/profile.php?id=156878528267439'
  })
  assert.deepEqual(parseSocialUrl('https://www.facebook.com/p/Tamarel-Restaurant-156878528267439/'), {
    network: 'facebook',
    pageId: '156878528267439',
    url: 'https://www.facebook.com/profile.php?id=156878528267439'
  })
})

test('facebook: share, photo, group and login links are not pages', () => {
  for (const u of [
    'https://www.facebook.com/sharer/sharer.php?u=x',
    'https://www.facebook.com/photo/?fbid=1',
    'https://www.facebook.com/groups/123',
    'https://www.facebook.com/reel/123',
    'https://www.facebook.com/login',
    'https://www.facebook.com/',
    'https://www.facebook.com/profile.php'
  ])
    assert.equal(parseSocialUrl(u), null, u)
})

test('instagram: username, lower-cased; posts and reels are not profiles', () => {
  assert.deepEqual(parseSocialUrl('https://www.instagram.com/Tamarel.HoiAn/'), {
    network: 'instagram',
    handle: 'tamarel.hoian',
    url: 'https://www.instagram.com/tamarel.hoian/'
  })
  assert.deepEqual(parseSocialUrl('instagram.com/brewletcoffeehoian?igsh=abc'), {
    network: 'instagram',
    handle: 'brewletcoffeehoian',
    url: 'https://www.instagram.com/brewletcoffeehoian/'
  })
  for (const u of [
    'https://www.instagram.com/p/C7QwnWDw9u8/',
    'https://www.instagram.com/reel/abc/',
    'https://www.instagram.com/explore/tags/x',
    'https://www.instagram.com/'
  ]) {
    assert.equal(parseSocialUrl(u), null, u)
  }
})

test('tiktok: @user only; short links and videos alone are not resolvable offline', () => {
  assert.deepEqual(parseSocialUrl('https://www.tiktok.com/@brewlet.coffee'), {
    network: 'tiktok',
    handle: 'brewlet.coffee',
    url: 'https://www.tiktok.com/@brewlet.coffee'
  })
  assert.deepEqual(
    parseSocialUrl('https://www.tiktok.com/@Brewlet.Coffee/video/7452287584697295140?lang=en'),
    {
      network: 'tiktok',
      handle: 'brewlet.coffee',
      url: 'https://www.tiktok.com/@brewlet.coffee'
    }
  )
  assert.equal(parseSocialUrl('https://vm.tiktok.com/ZMabc123/'), null)
  assert.equal(parseSocialUrl('https://www.tiktok.com/discover/hoi-an'), null)
})

test('youtube: @handle, /channel/UC…, and the legacy /c/ and /user/ forms', () => {
  assert.deepEqual(parseSocialUrl('https://www.youtube.com/@ExampleCreator/videos'), {
    network: 'youtube',
    handle: 'examplecreator',
    url: 'https://www.youtube.com/@examplecreator'
  })
  assert.deepEqual(parseSocialUrl('https://m.youtube.com/channel/UCI3ZB0OvndmJYP3S5fBBfGL'), {
    network: 'youtube',
    channelId: 'UCI3ZB0OvndmJYP3S5fBBfGL',
    url: 'https://www.youtube.com/channel/UCI3ZB0OvndmJYP3S5fBBfGL'
  })
  assert.deepEqual(parseSocialUrl('https://www.youtube.com/c/ExampleDevelopers'), {
    network: 'youtube',
    legacy: 'c',
    name: 'ExampleDevelopers',
    url: 'https://www.youtube.com/c/ExampleDevelopers'
  })
  assert.deepEqual(parseSocialUrl('https://www.youtube.com/user/ExampleDevelopers/about'), {
    network: 'youtube',
    legacy: 'user',
    name: 'ExampleDevelopers',
    url: 'https://www.youtube.com/user/ExampleDevelopers'
  })
  for (const u of [
    'https://youtu.be/RP0_ARhOhsh',
    'https://www.youtube.com/watch?v=RP0_ARhOhsh',
    'https://www.youtube.com/channel/notanid',
    'https://www.youtube.com/'
  ]) {
    assert.equal(parseSocialUrl(u), null, u)
  }
})

test('a bare handle needs the network; junk and other hosts give null', () => {
  assert.deepEqual(parseSocialUrl('@brewlet.coffee', { network: 'tiktok' }), {
    network: 'tiktok',
    handle: 'brewlet.coffee',
    url: 'https://www.tiktok.com/@brewlet.coffee'
  })
  assert.deepEqual(parseSocialUrl('tamarel.hoian', { network: 'instagram' }), {
    network: 'instagram',
    handle: 'tamarel.hoian',
    url: 'https://www.instagram.com/tamarel.hoian/'
  })
  assert.equal(parseSocialUrl('@brewlet.coffee'), null)
  for (const v of [
    null,
    undefined,
    '',
    '   ',
    42,
    'not a url',
    'https://example.com/TamarelHoiAn',
    'javascript:alert(1)',
    'https://evil-facebook.com/x'
  ]) {
    assert.equal(parseSocialUrl(v), null, String(v))
  }
  // A network hint never overrides the URL's own host.
  assert.equal(parseSocialUrl('https://www.instagram.com/tamarel.hoian/', { network: 'tiktok' }), null)
})

test('facebook: account features (messages, settings, marketplace…) are not pages (dev round L4)', () => {
  for (const seg of [
    'messages',
    'messenger',
    'me',
    'friends',
    'settings',
    'notifications',
    'bookmarks',
    'marketplace',
    'groups',
    'events',
    'watch',
    'gaming'
  ]) {
    assert.equal(parseSocialUrl(`https://www.facebook.com/${seg}`), null, seg)
    assert.equal(
      parseSocialUrl(`https://www.facebook.com/${seg[0].toUpperCase()}${seg.slice(1)}/`),
      null,
      `${seg}, capitalised`
    )
    assert.equal(parseSocialUrl(seg, { network: 'facebook' }), null, `bare ${seg}`)
  }
  assert.equal(parseSocialUrl('https://www.facebook.com/messages/t/123456'), null)
  assert.equal(
    parseSocialUrl('https://www.facebook.com/messagesbistro')?.pageSlug,
    'messagesbistro',
    'only the whole segment is reserved'
  )
})
