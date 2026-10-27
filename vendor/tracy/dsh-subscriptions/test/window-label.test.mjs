import { test } from "node:test"
import assert from "node:assert/strict"
import { windowLabel } from "../lib/usage.js"

test("windowLabel: known ids", () => {
  // claude/grok
  assert.equal(windowLabel("five_hour").en, "5h")
  assert.equal(windowLabel("five_hour").zh, "5小时")
  assert.equal(windowLabel("seven_day").en, "7d")
  assert.equal(windowLabel("seven_day").zh, "7天")
  // codex: primary_window/secondary_window -> 5h/7d
  assert.equal(windowLabel("primary_window").en, "5h")
  assert.equal(windowLabel("primary_window").zh, "5小时")
  assert.equal(windowLabel("secondary_window").en, "7d")
  assert.equal(windowLabel("secondary_window").zh, "7天")
})

test("windowLabel: unknown id returns {zh:id, en:id}", () => {
  const l = windowLabel("mystery_window_xyz")
  assert.equal(l.en, "mystery_window_xyz")
  assert.equal(l.zh, "mystery_window_xyz")
})
