import { test } from "node:test"
import assert from "node:assert/strict"

test("background tick condition - expiry ahead check", () => {
  const now = 1000000
  const ahead = 5*60*1000
  const blobFresh = { expiresAt: now + ahead + 1000 }
  const blobNear = { expiresAt: now + ahead - 1000 }
  assert.equal(blobFresh.expiresAt - now > ahead, true)
  assert.equal(blobNear.expiresAt - now > ahead, false)
})

test("shouldSkipRefresh logic", () => {
  const failures = new Map()
  function shouldSkip(ref, now, retryMs) {
    const f = failures.get(ref)
    if (!f) return false
    return (Number(f.at) + Number(retryMs)) > Number(now)
  }
  failures.set("A", { at: 1000, error: "bad" })
  assert.equal(shouldSkip("A", 1000+5*60*1000, 10*60*1000), true)
  assert.equal(shouldSkip("A", 1000+11*60*1000, 10*60*1000), false)
  assert.equal(shouldSkip("B", 2000, 600000), false)
})

test("ensureFresh lock dedupes concurrent calls - concept", async () => {
  const locks = new Map()
  let calls = 0
  async function fakeRefresh() {
    calls++
    await new Promise(r => setTimeout(r, 10))
    return { accessToken: "new" }
  }
  async function ensureFresh(ref) {
    if (locks.has(ref)) return locks.get(ref)
    const p = (async () => {
      try { return await fakeRefresh() } finally { locks.delete(ref) }
    })()
    locks.set(ref, p)
    return p
  }
  const p1 = ensureFresh("X")
  const p2 = ensureFresh("X")
  const [a,b] = await Promise.all([p1,p2])
  assert.equal(a.accessToken, "new")
  assert.equal(b.accessToken, "new")
  assert.equal(calls, 1)
})