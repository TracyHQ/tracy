import { test } from "node:test"
import assert from "node:assert/strict"
import { usageWindows } from "../lib/usage.js"
import { serializeBlob, parseBlob } from "../lib/blob.js"

test("usageWindows extracts named windows (claude five_hour/seven_day)", () => {
  const json = {
    five_hour: { utilization: 39.4 },
    seven_day_oauth_apps: { utilization: 12 },
  }
  const wins = usageWindows(json)
  assert.equal(wins.length, 2)
  const byId = Object.fromEntries(wins.map((w) => [w.id, w]))
  assert.equal(byId.five_hour.usedPercent, 39.4)
  assert.equal(byId.five_hour.en, "5h")
  assert.equal(byId.five_hour.zh, "5小时")
  assert.equal(byId.seven_day_oauth_apps.en, "7d apps")
  assert.equal(byId.seven_day_oauth_apps.zh, "7天应用")
})

test("usageWindows reads remainingFraction as used", () => {
  const wins = usageWindows({ rate_limits: { primary: { remainingFraction: 0.61 } } })
  assert.ok(Math.abs(wins[0].usedPercent - 39) < 0.01)
  assert.equal(wins[0].id, "primary")
  assert.equal(wins[0].en, "primary")
  assert.equal(wins[0].zh, "主配额")
})

test("usageWindows returns null for silent vendors", () => {
  assert.equal(usageWindows({ foo: { bar: 1 } }), null)
  assert.equal(usageWindows(null), null)
})

test("blob round-trips persisted usage windows", () => {
  const raw = serializeBlob({
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: 1,
    usage: [{ id: "five_hour", en: "5h", zh: "5小时", usedPercent: 39 }],
    usageAt: 12345,
  })
  const parsed = parseBlob(raw)
  assert.equal(parsed.usage.length, 1)
  assert.equal(parsed.usage[0].usedPercent, 39)
  assert.equal(parsed.usageAt, 12345)
  // and without usage fields
  const plain = parseBlob(serializeBlob({ accessToken: "a", refreshToken: "b" }))
  assert.equal(plain.usage, undefined)
})

test("usageWindows ignores pure-numeric keys and resolves semantic modelId (#389 / GH #7)", () => {
  const payloadAllZero = {
    buckets: [
      { tokenType: "WTUS", modelId: "chat_20706", remainingFraction: 1 },
      { tokenType: "WTUS", modelId: "chat_23310", remainingFraction: 1 },
      { tokenType: "WTUS", modelId: "gemini-3.8-flash-tiered", remainingFraction: 1 },
    ],
  }
  // All zero usage -> should return null rather than 0% clutter
  assert.equal(usageWindows(payloadAllZero), null)

  const payloadWithUsage = {
    buckets: [
      { tokenType: "WTUS", modelId: "chat_20706", remainingFraction: 0.62 },
      { tokenType: "WTUS", modelId: "chat_23310", remainingFraction: 0.85 },
      { tokenType: "WTUS", modelId: "gemini-3.8-flash-tiered", remainingFraction: 1 },
    ],
  }
  const wins = usageWindows(payloadWithUsage)
  assert.ok(Array.isArray(wins))
  assert.equal(wins.length, 2)
  assert.equal(wins[0].id, "chat_20706")
  assert.equal(Math.round(wins[0].usedPercent), 38)
  assert.equal(wins[1].id, "chat_23310")
  assert.equal(Math.round(wins[1].usedPercent), 15)
})

test("usageWindows keeps standard named windows like primary_window / secondary_window (#389 / GH #7)", () => {
  const codexPayload = {
    rate_limits: {
      primary_window: { remainingFraction: 0.61 },
      secondary_window: { remainingFraction: 0.88 },
    },
  }
  const wins = usageWindows(codexPayload)
  assert.equal(wins.length, 2)
  assert.equal(wins[0].id, "primary_window")
  assert.equal(wins[0].en, "5h")
  assert.equal(wins[0].zh, "5小时")
  assert.equal(wins[1].id, "secondary_window")
  assert.equal(wins[1].en, "7d")
  assert.equal(wins[1].zh, "7天")
})

test("usageWindows captures and normalizes reset timestamps (ISO, epoch s, epoch ms) (#394)", () => {
  const jsonWithResets = {
    five_hour: {
      utilization: 45,
      resets_at: "2026-09-27T20:30:00.000Z",
    },
    rate_limits: {
      primary_window: {
        remainingFraction: 0.5,
        reset_at: 1790450947, // epoch seconds
      },
    },
  }
  const wins = usageWindows(jsonWithResets)
  assert.ok(Array.isArray(wins))
  assert.equal(wins.length, 2)

  const fiveHour = wins.find((w) => w.id === "five_hour")
  assert.equal(fiveHour.usedPercent, 45)
  assert.equal(fiveHour.resetAt, Date.parse("2026-09-27T20:30:00.000Z"))

  const primary = wins.find((w) => w.id === "primary_window")
  assert.equal(primary.usedPercent, 50)
  assert.equal(primary.resetAt, 1790450947000)
})
