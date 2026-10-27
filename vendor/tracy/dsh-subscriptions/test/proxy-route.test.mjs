
import { test } from "node:test"
import assert from "node:assert/strict"
import { isAllowed } from "../lib/subscriptions.js"

test("proxy route: allowed paths pass", () => {
  assert.equal(isAllowed("codex", "/responses"), true)
  assert.equal(isAllowed("codex", "/models"), true)
  assert.equal(isAllowed("grok", "/v1/billing"), true)
})

test("proxy route: disallowed paths rejected", () => {
  assert.equal(isAllowed("codex", "/evil"), false)
  assert.equal(isAllowed("unknown", "/responses"), false)
})

test("proxy route: full URL path extraction", () => {
  // simulate URL parsing like the proxy does
  const pathname = "/dsh-subscriptions/proxy/codex/responses"
  const parts = pathname.replace(/^\/dsh-subscriptions\/proxy\//, "").split("/").filter(Boolean)
  assert.equal(parts[0], "codex")
  assert.equal("/" + parts.slice(1).join("/"), "/responses")
})

test("proxy route: preserves query parameters (#446)", () => {
  const reqUrl = "/dsh-subscriptions/proxy/codex/models?client_version=0.157.1&limit=50"
  const url = new URL(reqUrl, "http://localhost")
  const parts = url.pathname.replace(/^\/dsh-subscriptions\/proxy\//, "").split("/").filter(Boolean)
  const restPath = "/" + parts.slice(1).join("/") + (url.search || "")
  assert.equal(restPath, "/models?client_version=0.157.1&limit=50")
  assert.equal(isAllowed("codex", restPath), true)
})
