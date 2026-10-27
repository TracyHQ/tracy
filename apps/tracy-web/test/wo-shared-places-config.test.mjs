// Settings of the shared place media bucket and the place ingest door (tasks/plan-wo-shared-places.md
// §6–7): all four bucket settings or none, never borrowed from the artifact store; the ingest secret
// is the master's alone.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ConfigError, readConfig } from '../src/config.js'

const ENV = {
  TRACY_ORIGIN: 'http://tracy.test:8080',
  SITE_DOMAIN: 'localhost',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 'local',
  HOST_local_ORIGIN: 'http://tracy-host.test',
  HOST_local_DSH_ORIGIN: 'http://dsh.test',
  HOST_local_SECRET: 'h',
  SEAT_local_SECRET: 'k'
}
const SHARD = {
  TRACY_ORIGIN: 'https://s2.tracy.ai',
  SITE_DOMAIN: 'tracy.ai',
  SESSION_DOMAIN: 'tracy.ai',
  SESSION_SECRET: 's'.repeat(32),
  HOSTS: 's2',
  HOST_NAME: 's2',
  HOST_s2_ORIGIN: 'http://host',
  HOST_s2_DSH_ORIGIN: 'http://dsh',
  HOST_s2_SECRET: 'h',
  SEAT_s2_SECRET: 'k',
  TRACY_DEPLOYMENT_ROLE: 'shard',
  MASTER_ORIGIN: 'https://cowork.tracy.ai',
  SHARD_SECRET: 'ab'.repeat(32),
  SESSION_COOKIE_NAME: 'tracy_sess_s2'
}
const BUCKET = {
  PLACE_MEDIA_S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com/',
  PLACE_MEDIA_S3_BUCKET: 'tracy-google-place-media',
  PLACE_MEDIA_S3_ACCESS_KEY: 'id',
  PLACE_MEDIA_S3_SECRET_KEY: 'secret'
}
const ARTIFACTS = {
  ARTIFACT_S3_ENDPOINT: 'http://minio:9000',
  ARTIFACT_S3_BUCKET: 'tracy-artifacts',
  ARTIFACT_S3_ACCESS_KEY: 'a',
  ARTIFACT_S3_SECRET_KEY: 'b'
}

test('the shared place media bucket needs its own four settings, with no fallback to the artifact store', () => {
  assert.deepEqual(readConfig({ ...ENV, ...BUCKET }).placeMediaStore, {
    endpoint: 'https://acct.r2.cloudflarestorage.com',
    bucket: 'tracy-google-place-media',
    accessKey: 'id',
    secretKey: 'secret'
  })
  assert.equal(readConfig({ ...ENV, ...ARTIFACTS }).placeMediaStore, null)
  const { PLACE_MEDIA_S3_ACCESS_KEY: _a, PLACE_MEDIA_S3_SECRET_KEY: _b, ...bucketOnly } = BUCKET
  assert.equal(readConfig({ ...ENV, ...ARTIFACTS, ...bucketOnly }).placeMediaStore, null)
})

test('the ingest secret is read on the master, refused when malformed, and refused on a shard', () => {
  assert.equal(readConfig(ENV).woPlacesIngest, null)
  const secret = 'x'.repeat(40)
  assert.deepEqual(readConfig({ ...ENV, WO_PLACES_INGEST_SECRET: secret }).woPlacesIngest, { secret })
  assert.throws(
    () => readConfig({ ...ENV, WO_PLACES_INGEST_SECRET: 'short' }),
    (e) => e instanceof ConfigError && /WO_PLACES_INGEST_SECRET/.test(e.message)
  )
  assert.equal(readConfig(SHARD).woPlacesIngest, null)
  assert.throws(
    () => readConfig({ ...SHARD, WO_PLACES_INGEST_SECRET: secret }),
    (e) => e instanceof ConfigError && /WO_PLACES_INGEST_SECRET/.test(e.message)
  )
})
