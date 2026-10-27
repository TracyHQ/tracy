import { test } from "node:test"
import assert from "node:assert/strict"
import { startLoopback } from "../lib/loopback.js"

const PORT = 57599 // тестовый высокий порт, не вендорский

test("loopback: rejects non-loopback redirect", () => {
  assert.throws(
    () => startLoopback({ redirectUri: "https://console.anthropic.com/callback", onCode: async () => "" }),
    /loopback redirect requires localhost/,
  )
})

test("loopback: catches code/state and completes", async () => {
  let received = null
  const flow = startLoopback({
    redirectUri: `http://127.0.0.1:${PORT}/callback`,
    timeoutMs: 5000,
    onCode: async (params) => {
      received = { code: params.get("code"), state: params.get("state") }
      return "<html>ok</html>"
    },
  })
  await new Promise((r) => setTimeout(r, 200))
  const res = await fetch(`http://127.0.0.1:${PORT}/callback?code=abc&state=xyz`)
  const text = await res.text()
  assert.equal(res.status, 200)
  assert.ok(text.includes("ok"))
  assert.deepEqual(received, { code: "abc", state: "xyz" })
  // сервер должен закрыться после первого callback
  await new Promise((r) => setTimeout(r, 100))
  await assert.rejects(() => fetch(`http://127.0.0.1:${PORT}/callback`), /fetch failed|ECONNREFUSED/)
  await flow
})

test("loopback: onCode throw -> ERR_HTML, server closes", async () => {
  const flow = startLoopback({
    redirectUri: `http://localhost:${PORT + 1}/callback`,
    timeoutMs: 5000,
    onCode: async () => { throw new Error("boom") },
  })
  await new Promise((r) => setTimeout(r, 200))
  const res = await fetch(`http://localhost:${PORT + 1}/callback?code=bad`)
  const text = await res.text()
  assert.equal(res.status, 200)
  assert.ok(text.includes("Login failed"))
  await flow
})