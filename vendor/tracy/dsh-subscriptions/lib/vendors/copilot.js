import { LlmError } from "@deepseek-ai/dsh-llm"
import { openaiMessages, openaiTools, modelCatalog } from "../messages.js"
import { fetchWithTimeout } from "../http.js"
import { openaiChatStream, readJson, httpError } from "../wire.js"

export const id = "copilot"

export const COPILOT_CLIENT_ID = "Iv1.b507a08c87ecfe98"
export const COPILOT_DEVICE_CODE_URL = "https://github.com/login/device/code"
export const COPILOT_DEVICE_TOKEN_URL = "https://github.com/login/oauth/access_token"
const COPILOT_TOKEN_URL = "https://api.github.com/copilot_internal/v2/token"
const COPILOT_API_URL = "https://api.githubcopilot.com/chat/completions"
const COPILOT_USER_URL = "https://api.github.com/user"

const COPILOT_MODELS = [
  {
    id: "claude-3.7-sonnet",
    name: "Claude 3.7 Sonnet (Copilot)",
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ["text", "image"],
    reasoning: { efforts: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] }
  },
  {
    id: "claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet (Copilot)",
    contextWindow: 200000,
    maxTokens: 64000,
    inputModalities: ["text", "image"]
  },
  {
    id: "gpt-4o",
    name: "GPT-4o (Copilot)",
    contextWindow: 128000,
    maxTokens: 16384,
    inputModalities: ["text", "image"]
  },
  {
    id: "o3-mini",
    name: "o3-mini (Copilot)",
    contextWindow: 200000,
    maxTokens: 65536,
    inputModalities: ["text"],
    reasoning: { efforts: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] }
  },
  {
    id: "o1",
    name: "o1 (Copilot)",
    contextWindow: 200000,
    maxTokens: 65536,
    inputModalities: ["text", "image"],
    reasoning: { efforts: [{ id: "low", name: "Low" }, { id: "medium", name: "Medium" }, { id: "high", name: "High" }] }
  }
]

export function providerInfo() {
  return { id, name: "GitHub Copilot" }
}

export function defaults() {
  return {
    apiBase: COPILOT_API_URL,
    models: COPILOT_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return "https://github.com/login/device"
}

export async function listModels(blob, cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const fallback = modelCatalog(id, (cfg && cfg.models) || COPILOT_MODELS)
  if (!blob) return fallback
  const githubToken = blob.refreshToken || blob.githubToken
  let copilotToken = blob.accessToken
  try {
    if ((!copilotToken || !blob.expiresAt || blob.expiresAt < Date.now() + 60000) && githubToken) {
      const exchange = await exchangeCopilotToken(githubToken, impl)
      if (exchange && exchange.token) {
        copilotToken = exchange.token
        blob.accessToken = exchange.token
        if (exchange.expires_at) blob.expiresAt = exchange.expires_at * 1000
      }
    }
    if (!copilotToken) return fallback
    const res = await fetchWithTimeout(impl, "https://api.githubcopilot.com/models", {
      headers: {
        Authorization: `Bearer ${copilotToken}`,
        Accept: "application/json",
        "User-Agent": "GitHubCopilotChat/0.24.0",
      },
    }, { timeoutMs: 15000 })
    if (!res.ok) return fallback
    const json = await readJson(res)
    const items = json && (json.data || json.models || json)
    if (!Array.isArray(items) || !items.length) return fallback
    const rows = []
    for (const item of items) {
      const modelId = item.id || item.name
      if (!modelId) continue
      if (item.capabilities && item.capabilities.type && item.capabilities.type !== "chat") continue
      rows.push({
        id: modelId,
        name: item.name || modelId,
        ...(item.capabilities && item.capabilities.limits && item.capabilities.limits.max_prompt_tokens ? { contextWindow: item.capabilities.limits.max_prompt_tokens } : {}),
        ...(item.capabilities && item.capabilities.supports && item.capabilities.supports.vision ? { inputModalities: ["text", "image"] } : {}),
      })
    }
    if (!rows.length) return fallback
    return modelCatalog(id, rows)
  } catch {
    return fallback
  }
}

export function getTelemetryHeaders(sessionId) {
  const sid = sessionId || "copilot-session-" + Math.random().toString(36).slice(2, 12)
  return {
    "vscode-sessionid": sid,
    "vscode-machineid": "dsh-sub-machine-" + sid.slice(0, 8),
    "editor-version": "vscode/1.98.0",
    "editor-plugin-version": "copilot-chat/0.24.0",
    "Openai-Organization": "github-copilot",
    "Copilot-Integration-Id": "vscode-chat"
  }
}

export async function requestDeviceCode(fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user"
    })
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function pollDeviceToken(deviceCode, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_DEVICE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}


export async function deviceStart(cfg, fetchImpl) {
  const json = await requestDeviceCode(fetchImpl)
  if (!json || !json.user_code || !json.device_code) {
    throw httpError(502, "GitHub device code response is incomplete", "DEVICE")
  }
  return {
    userCode: json.user_code,
    deviceAuthId: json.device_code,
    intervalMs: Math.max(parseInt(json.interval, 10) || 5, 1) * 1000,
    authUrl: json.verification_uri || "https://github.com/login/device",
  }
}

export async function devicePoll(cfg, session, fetchImpl) {
  const impl = fetchImpl || fetch
  let json
  try {
    json = await pollDeviceToken(session.deviceAuthId, impl)
  } catch (err) {
    throw httpError(502, String(err && err.message || err), "DEVICE")
  }
  if (json.error === "authorization_pending" || json.error === "slow_down") {
    return { status: "pending" }
  }
  if (json.error) {
    throw httpError(400, json.error_description || json.error, "DEVICE")
  }
  if (!json.access_token) {
    return { status: "pending" }
  }
  const githubToken = json.access_token
  const exchange = await exchangeCopilotToken(githubToken, impl)
  const copilotToken = exchange && exchange.token
  const expiresAt = exchange && exchange.expires_at ? exchange.expires_at * 1000 : Date.now() + 30 * 60 * 1000

  let label = "copilot"
  let email = ""
  try {
    const userRes = await impl(COPILOT_USER_URL, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "GitHubCopilotChat/0.24.0",
      },
    })
    if (userRes.ok) {
      const user = await readJson(userRes)
      if (user && user.login) {
        label = user.login
        if (user.email) email = user.email
      }
    }
  } catch { /* best-effort */ }

  return {
    status: "authorized",
    blob: {
      accessToken: copilotToken || githubToken,
      refreshToken: githubToken,
      githubToken,
      expiresAt,
      label,
      email,
    },
  }
}

export async function refresh(cfg, blob, fetchImpl) {
  const impl = fetchImpl || fetch
  const githubToken = blob && (blob.refreshToken || blob.githubToken)
  if (!githubToken) return blob
  const exchange = await exchangeCopilotToken(githubToken, impl)
  return {
    ...blob,
    accessToken: exchange.token || blob.accessToken,
    expiresAt: exchange.expires_at ? exchange.expires_at * 1000 : Date.now() + 30 * 60 * 1000,
  }
}

async function exchangeCopilotToken(githubToken, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(COPILOT_TOKEN_URL, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${githubToken}`,
      "Accept": "application/json",
      "User-Agent": "GitHubCopilotChat/0.24.0"
    }
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  return readJson(res)
}

export async function usage(blob, config, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const githubToken = blob && (blob.refreshToken || blob.githubToken || blob.accessToken)
    if (!githubToken) return null
    const res = await impl(COPILOT_USER_URL, {
      headers: {
        "Authorization": `Bearer ${githubToken}`,
        "User-Agent": "GitHubCopilotChat/0.24.0"
      }
    })
    if (!res.ok) return null
    const user = await readJson(res)
    const usedPercent = user && typeof user.used_percent === "number" && Number.isFinite(user.used_percent)
      ? user.used_percent
      : null
    return {
      usedPercent,
      plan: user && user.plan ? (user.plan.name || String(user.plan)) : "Copilot",
      timestamp: Date.now(),
    }
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  let copilotToken = blob && blob.accessToken
  const githubToken = blob && (blob.refreshToken || blob.githubToken)

  if ((!copilotToken || (blob.expiresAt && blob.expiresAt < Date.now() + 60000)) && githubToken) {
    const exchange = await exchangeCopilotToken(githubToken, impl)
    if (exchange && exchange.token) {
      copilotToken = exchange.token
      blob.accessToken = exchange.token
      if (exchange.expires_at) blob.expiresAt = exchange.expires_at * 1000
    }
  }

  if (!copilotToken) throw new LlmError("GitHub Copilot not authenticated", "AUTH")

  /** @type {Record<string, any>} */
  const body = {
    model: options.model || "claude-3.7-sonnet",
    messages: openaiMessages(options),
    stream: true,
    ...(options.maxTokens != null ? { max_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {})
  }

  const tools = openaiTools(options)
  if (tools && tools.length) body.tools = tools

  const telemetry = getTelemetryHeaders(options.sessionId)
  const url = (config && config.apiBase) || COPILOT_API_URL

  const res = await impl(url, {
    method: "POST",
    headers: {
      ...telemetry,
      ...headers,
      "Authorization": `Bearer ${copilotToken}`,
      "Content-Type": "application/json",
      "User-Agent": "GitHubCopilotChat/0.24.0"
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
