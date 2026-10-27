import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readClaudeCredentials } from './vendors/claude-cli.js'
import { normalizeExpiresAt } from './blob.js'
import { isGoogleClientId, extractGoogleClientIdFromJwt, emailFromToken } from './jwt.js'
import { DEFAULT_CLI_CLIENT_ID, DEFAULT_CLI_CLIENT_SECRET } from './vendors/antigravity.js'

// Test seam: a fixture root overrides the real home for the duration of a
// public call. Undefined (the default) keeps production behaviour.
let activeHome = null
let activeWindowsCredentialReader = null

export function setWindowsCredentialReaderForTest(fn) {
  activeWindowsCredentialReader = fn
}

export function readWindowsAntigravityCredential() {
  if (activeWindowsCredentialReader) {
    return activeWindowsCredentialReader()
  }
  if (process.platform !== 'win32') return null
  try {
    const ps = `Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredReadHelper {
    [DllImport("Advapi32.dll", SetLastError = true, EntryPoint = "CredReadW", CharSet = CharSet.Unicode)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr credentialPtr);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags, Type;
        public string TargetName, Comment;
        public long LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist, AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias, UserName;
    }
    public static string Read(string target) {
        IntPtr ptr;
        if (CredRead(target, 1, 0, out ptr)) {
            var cred = (CREDENTIAL)Marshal.PtrToStructure(ptr, typeof(CREDENTIAL));
            byte[] bytes = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, bytes, 0, cred.CredentialBlobSize);
            return System.Text.Encoding.UTF8.GetString(bytes);
        }
        return null;
    }
}
"@
[CredReadHelper]::Read('gemini:antigravity')`
    const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const text = String(out || '').trim()
    if (!text) return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

function homeFile(...parts) {
  return join(activeHome || homedir(), ...parts)
}

async function readJson(path) {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function discoverLocalCliSessions(options = {}) {
  const prevHome = activeHome
  activeHome = options && options.home ? String(options.home) : null
  try {
    return await discoverLocalCliSessionsInner()
  } finally {
    activeHome = prevHome
  }
}

async function discoverLocalCliSessionsInner() {
  const detected = {}

  // 1. Codex CLI
  const codex = await readJson(homeFile('.codex', 'auth.json'))
  if (codex && (codex.access_token || codex.accessToken || (codex.tokens && codex.tokens.access_token))) {
    const tok = codex.tokens || codex
    detected.codex = {
      provider: 'codex',
      source: 'file',
      path: homeFile('.codex', 'auth.json'),
      email: codex.email || codex.account || '',
      hasRefreshToken: !!(tok.refresh_token || tok.refreshToken),
    }
  }

  // 2. Grok CLI
  const grokPaths = [
    homeFile('.grok', 'auth.json'),
  ]
  for (const p of grokPaths) {
    const grok = await readJson(p)
    if (grok && (grok.access_token || grok.token || (grok.tokens && grok.tokens.access_token))) {
      detected.grok = {
        provider: 'grok',
        source: 'file',
        path: p,
        email: grok.email || grok.account || '',
        hasRefreshToken: !!(grok.refresh_token || (grok.tokens && grok.tokens.refresh_token)),
      }
      break
    }
  }

  // 3. Antigravity / Gemini CLI
  const agyPaths = [
    homeFile('.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    homeFile('.gemini', 'oauth_creds.json'),
    homeFile('.cli-proxy-api', 'antigravity.json'),
  ]
  for (const p of agyPaths) {
    const agy = await readJson(p)
    const tok = agy && agy.token ? agy.token : agy
    if (tok && (tok.access_token || tok.accessToken)) {
      const idToken = agy?.id_token || agy?.idToken || tok?.id_token || tok?.idToken || ''
      const email = agy?.email || tok?.account || (idToken ? emailFromToken(idToken) : '') || ''
      detected.antigravity = {
        provider: 'antigravity',
        source: 'file',
        path: p,
        email: email || 'Antigravity User',
        hasRefreshToken: !!(tok.refresh_token || tok.refreshToken),
      }
      break
    }
  }

  if (!detected.antigravity && (process.platform === 'win32' || activeWindowsCredentialReader)) {
    const winCred = readWindowsAntigravityCredential()
    const tok = winCred && winCred.token ? winCred.token : winCred
    if (tok && (tok.access_token || tok.accessToken)) {
      const idToken = winCred?.id_token || winCred?.idToken || tok?.id_token || tok?.idToken || ''
      const email = winCred?.email || tok?.account || (idToken ? emailFromToken(idToken) : '') || ''
      detected.antigravity = {
        provider: 'antigravity',
        source: 'credential-manager',
        path: 'Windows Credential Manager (gemini:antigravity)',
        email: email || 'Antigravity User',
        hasRefreshToken: !!(tok.refresh_token || tok.refreshToken),
      }
    }
  }

  // 4. Kimi Code Plan
  const kimi = await readJson(homeFile('.kimi-code', 'credentials', 'kimi-code.json'))
  if (kimi && (kimi.access_token || kimi.token)) {
    detected.kimi = {
      provider: 'kimi',
      source: 'file',
      path: homeFile('.kimi-code', 'credentials', 'kimi-code.json'),
      email: kimi.email || kimi.account || '',
      hasRefreshToken: !!(kimi.refresh_token || kimi.refreshToken),
    }
  }

  // 5. GLM ZCode
  const glmPaths = [
    homeFile('.zcode', 'v2', 'config.json'),
    homeFile('.zcode', 'cli', 'config.json'),
    homeFile('.zcode', 'config.json'),
  ]
  for (const p of glmPaths) {
    const glm = await readJson(p)
    if (glm && (glm.apiKey || glm.api_key || (glm.provider && glm.provider.apiKey))) {
      detected.glm = {
        provider: 'glm',
        source: 'file',
        path: p,
        email: 'ZCode CLI Account',
        hasRefreshToken: false,
      }
      break
    }
  }

  // 6. Cursor Token (CLI config, auth.json, or env)
  const cursorCliConfig = await readJson(homeFile('.cursor', 'cli-config.json'))
  const cursorAuthConfig = await readJson(homeFile('.cursor', 'auth.json'))
  if (cursorCliConfig && (cursorCliConfig.authInfo || cursorCliConfig.serverConfigCache)) {
    detected.cursor = {
      provider: 'cursor',
      source: 'file',
      path: homeFile('.cursor', 'cli-config.json'),
      email: (cursorCliConfig.authInfo && cursorCliConfig.authInfo.email) || 'Cursor CLI User',
      hasRefreshToken: false,
    }
  } else if (cursorAuthConfig && (cursorAuthConfig.accessToken || cursorAuthConfig.access_token || (cursorAuthConfig.authInfo && cursorAuthConfig.authInfo.authId))) {
    detected.cursor = {
      provider: 'cursor',
      source: 'file',
      path: homeFile('.cursor', 'auth.json'),
      email: (cursorAuthConfig.authInfo && cursorAuthConfig.authInfo.email) || cursorAuthConfig.email || 'Cursor User',
      hasRefreshToken: false,
    }
  } else if (process.env.CURSOR_ACCESS_TOKEN) {
    detected.cursor = {
      provider: 'cursor',
      source: 'env',
      path: 'CURSOR_ACCESS_TOKEN',
      email: 'Cursor IDE User',
      hasRefreshToken: false,
    }
  }

  // 7. AWS Kiro
  const kiroPaths = [
    homeFile('.kiro', 'credentials.json'),
    homeFile('.aws', 'sso', 'cache', 'kiro-auth-token.json'),
  ]
  for (const p of kiroPaths) {
    const k = await readJson(p)
    if (k && (k.accessToken || k.access_token || k.token)) {
      detected.kiro = {
        provider: 'kiro',
        source: 'file',
        path: p,
        email: k.email || k.account || 'AWS Kiro User',
        hasRefreshToken: !!(k.refreshToken || k.refresh_token),
      }
      break
    }
  }
  if (!detected.kiro && process.env.KIRO_API_KEY) {
    detected.kiro = {
      provider: 'kiro',
      source: 'env',
      path: 'KIRO_API_KEY',
      email: 'AWS Kiro API Key',
      hasRefreshToken: false,
    }
  }

  // 8. Claude CLI Direct Import
  const claudeCreds = await readClaudeCredentials(activeHome)
  if (claudeCreds) {
    const claudeEntry = {
      provider: 'claude',
      source: 'file',
      path: homeFile('.claude', 'credentials.json'),
      email: claudeCreds.email || 'Claude Code CLI User',
      hasRefreshToken: !!claudeCreds.refreshToken,
    }
    detected.claude = claudeEntry
    detected['claude-cli'] = claudeEntry
  }

  // 9. GitHub Copilot token
  const copilotPaths = [
    homeFile('.config', 'github-copilot', 'hosts.json'),
    homeFile('.config', 'github-copilot', 'apps.json'),
  ]
  for (const p of copilotPaths) {
    const cp = await readJson(p)
    if (cp) {
      const gh = cp['github.com'] || cp
      const tok = gh.oauth_token || gh.token || gh.access_token
      if (tok) {
        detected.copilot = {
          provider: 'copilot',
          source: 'file',
          path: p,
          email: gh.user || 'GitHub Copilot User',
          hasRefreshToken: false,
        }
        break
      }
    }
  }
  if (!detected.copilot && (process.env.GITHUB_COPILOT_TOKEN || process.env.GH_TOKEN)) {
    detected.copilot = {
      provider: 'copilot',
      source: 'env',
      path: process.env.GITHUB_COPILOT_TOKEN ? 'GITHUB_COPILOT_TOKEN' : 'GH_TOKEN',
      email: 'GitHub Copilot User',
      hasRefreshToken: false,
    }
  }

  return detected
}

export async function loadLocalCliBlob(provider, options = {}) {
  const canonical = (provider === 'claude-cli') ? 'claude' : provider
  const discovered = await discoverLocalCliSessions(options)
  const info = discovered[canonical] || discovered[provider]
  if (!info) throw new Error(`no local CLI session found for ${provider}`)

  if (canonical === 'claude') {
    const creds = await readClaudeCredentials(options && options.home)
    if (!creds) throw new Error('Claude CLI credentials not found')
    return {
      accessToken: creds.accessToken,
      refreshToken: creds.refreshToken || '',
      expiresAt: creds.expiresAt,
      email: creds.email || 'Claude Code CLI User',
    }
  }

  if (canonical === 'copilot') {
    let tok = process.env.GITHUB_COPILOT_TOKEN || process.env.GH_TOKEN || ''
    let email = 'GitHub Copilot User'
    if (info.source === 'file' && info.path) {
      const cp = await readJson(info.path)
      if (cp) {
        const gh = cp['github.com'] || cp
        tok = gh.oauth_token || gh.token || gh.access_token || tok
        email = gh.user || email
      }
    }
    if (!tok) throw new Error('no Copilot token found')
    return {
      accessToken: tok,
      refreshToken: tok,
      githubToken: tok,
      expiresAt: 0,
      email,
      label: email,
    }
  }

  if (canonical === 'cursor') {
    if (info.source === 'env' || !info.path || info.path.includes('env') || info.path === 'CURSOR_ACCESS_TOKEN') {
      const token = process.env.CURSOR_ACCESS_TOKEN
      if (!token) throw new Error('CURSOR_ACCESS_TOKEN environment variable not set')
      return {
        accessToken: token,
        refreshToken: '',
        expiresAt: Date.now() + 30 * 86400 * 1000,
        email: 'Cursor IDE User',
      }
    }
    const raw = await readJson(info.path)
    if (!raw) throw new Error(`failed to read local CLI file: ${info.path}`)
    const token = (raw && (raw.accessToken || raw.access_token || (raw.authInfo && raw.authInfo.authId))) || process.env.CURSOR_ACCESS_TOKEN || ''
    return {
      accessToken: token,
      refreshToken: '',
      expiresAt: Date.now() + 30 * 86400 * 1000,
      email: (raw && raw.authInfo && raw.authInfo.email) || raw.email || 'Cursor User',
    }
  }

  if (canonical === 'kiro') {
    if (info.source === 'env' || !info.path || info.path.includes('env') || info.path === 'KIRO_API_KEY') {
      const token = process.env.KIRO_API_KEY
      if (!token) throw new Error('KIRO_API_KEY environment variable not set')
      return {
        accessToken: token,
        refreshToken: '',
        expiresAt: Date.now() + 30 * 86400 * 1000,
        email: 'AWS Kiro API Key',
      }
    }
    const raw = await readJson(info.path)
    if (!raw) throw new Error(`failed to read local CLI file: ${info.path}`)
    const token = (raw && (raw.accessToken || raw.access_token || raw.token)) || process.env.KIRO_API_KEY || ''
    return {
      accessToken: token,
      refreshToken: (raw && (raw.refreshToken || raw.refresh_token)) || '',
      expiresAt: (raw && raw.expiresAt) || (Date.now() + 30 * 86400 * 1000),
      email: (raw && raw.email) || 'AWS Kiro User',
    }
  }

  let raw
  if (canonical === 'antigravity' && info.source === 'credential-manager') {
    raw = readWindowsAntigravityCredential()
  } else {
    raw = await readJson(info.path)
  }
  if (!raw) throw new Error(`failed to read local CLI file: ${info.path}`)

  if (canonical === 'codex') {
    const tok = raw.tokens || raw
    return {
      accessToken: tok.access_token || tok.accessToken || '',
      refreshToken: tok.refresh_token || tok.refreshToken || '',
      expiresAt: tok.expires_at || tok.expiresAt || (Date.now() + 3600 * 1000),
      email: raw.email || raw.account || '',
      accountId: raw.account_id || raw.accountId || '',
    }
  }

  if (canonical === 'grok') {
    const tok = raw.tokens || raw
    return {
      accessToken: tok.access_token || tok.token || '',
      refreshToken: tok.refresh_token || '',
      expiresAt: tok.expires_at || tok.expiresAt || (Date.now() + 3600 * 1000),
      email: raw.email || raw.account || '',
    }
  }

  if (canonical === 'antigravity') {
    const tok = raw.token || raw
    const idToken = raw.id_token || raw.idToken || tok.id_token || tok.idToken || ''

    const directClientId = raw.client_id || raw.clientId || tok.client_id || tok.clientId ||
      raw.installed?.client_id || raw.web?.client_id || ''
    let clientId = ''
    if (typeof directClientId === 'string' && isGoogleClientId(directClientId)) {
      clientId = directClientId.trim()
    } else if (idToken) {
      clientId = extractGoogleClientIdFromJwt(idToken)
    }

    const directSecret = raw.client_secret || raw.clientSecret || tok.client_secret || tok.clientSecret ||
      raw.installed?.client_secret || raw.web?.client_secret || ''
    let clientSecret = typeof directSecret === 'string' ? directSecret.trim() : ''

    if (!clientSecret && clientId === DEFAULT_CLI_CLIENT_ID) {
      clientSecret = DEFAULT_CLI_CLIENT_SECRET
    }

    const rawExpiry = tok.expiry ?? tok.expires_at ?? tok.expiresAt ?? tok.expiry_date ?? raw.expiry_date ?? raw.expiry ?? (tok.expires_in ? Date.now() + Number(tok.expires_in) * 1000 : 0)
    const expiresAt = normalizeExpiresAt(rawExpiry)

    const email = raw.email || tok.account || (idToken ? emailFromToken(idToken) : '') || ''

    return {
      accessToken: tok.access_token || tok.accessToken || '',
      refreshToken: tok.refresh_token || tok.refreshToken || '',
      expiresAt,
      email,
      projectId: raw.project_id || raw.projectId || tok.project_id || '',
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
      ...(idToken ? { idToken } : {}),
    }
  }

  if (canonical === 'kimi') {
    return {
      accessToken: raw.access_token || raw.token || '',
      refreshToken: raw.refresh_token || '',
      expiresAt: raw.expires_at || (Date.now() + 86400 * 1000),
      email: raw.email || raw.account || '',
    }
  }

  if (canonical === 'glm') {
    const apiKey = raw.apiKey || raw.api_key || (raw.provider && raw.provider.apiKey) || ''
    return {
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + 30 * 86400 * 1000,
      email: 'ZCode CLI',
    }
  }

  throw new Error(`unsupported local CLI import for provider ${provider}`)
}
