/**
 * WO hand-off of menu items: the open app sends the brief's menu (never its posts) to Tracy, only the parts
 * Tracy announces; Tracy keeps size, price scale, photo, logo, colours, links and posts to the brief; a photo
 * becomes a dish's photo only as an accepted match (menu card or Tracy vision), never from words alone.
 * Needs TEST_DATABASE_URL (run.needs postgres).
 */
import { checks, nodeTest, testDatabaseUrl } from './lib.mjs'

testDatabaseUrl()
const c = checks()

const client = nodeTest(['test/tracy-request.test.mjs'], { cwd: 'packages/wo/website-opportunities' })
c.tapClean('S1', client)
for (const name of [
  'a post is never sent as a menu item: items come from the brief menu only',
  "a photo's caption is the caption it was published with, never its category",
  'a host that announces nothing gets the base request: the size in the name, no scale, and no price it would misread'
])
  c.passes('S1', client, name)

const host = nodeTest(['test/wo-public-demos.test.mjs'], { cwd: 'apps/tracy-web' })
c.tapClean('S2', host)
for (const name of [
  'options announce the hand-off parts this host takes all the way to the brief',
  'the hand-off parts are kept: item size, price scale and photo, the logo and colours, links and posts'
])
  c.passes('S2', host, name)

const matcher = nodeTest(['test/domain-dish-photos.test.mjs'], { cwd: 'packages/wo/website-opportunities' })
c.tapClean('S3', matcher)
for (const name of [
  'accents are compared: "Bánh bò" is not "Bánh bơ"',
  'the longest name wins and masks the shorter one inside it',
  'a post naming two dishes says nothing about its photo',
  'vision saying a menu board, a person or the room drops the candidate',
  'a photo the sender attached is a candidate until vision calls it a dish; an accepted text match beats it'
])
  c.passes('S3', matcher, name)

const handoff = nodeTest(['test/website-opportunities-handoff-pictures.test.mjs'], { cwd: 'apps/tracy-web' })
c.tapClean('S4', handoff)
c.passes(
  'S4',
  handoff,
  'an accepted dish photo is handed to the agent before the others, so the picture cap never cuts it'
)
c.done()
