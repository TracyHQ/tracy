/** Runtime identity is rebuilt for every attempt, including a provider switch. */
const legacyIdentity =
  "If asked which model or system powers you, say you are Tracy's AI model for CMS work; do not name, confirm or deny any underlying model or provider."
const clean = (text) =>
  typeof text === 'string'
    ? text
        .replaceAll(legacyIdentity, '')
        .replaceAll('or model or provider names:', 'or unnecessary technical details:')
    : text

/** Who serves each provider's turns, as the model should say it. Copilot routes to several vendors' models. */
const PROVIDER_FACTS = {
  claude: 'Anthropic (Claude)',
  codex: 'OpenAI (ChatGPT Codex)',
  copilot: 'GitHub Copilot',
  grok: 'xAI (Grok)',
  antigravity: 'Google (Antigravity / Gemini)'
}

export function withModelContext(request, provider, model) {
  const messages = (request.messages || []).map((message) =>
    message.role !== 'system'
      ? message
      : {
          ...message,
          content: Array.isArray(message.content)
            ? message.content.map((part) =>
                part.type === 'text' ? { ...part, text: clean(part.text) } : part
              )
            : clean(message.content)
        }
  )
  messages.push({
    role: 'system',
    content: `Trusted runtime model context for this response: the customer is using their own model connection, not Tracy AI. Provider: ${PROVIDER_FACTS[provider] ?? provider}. Model identifier: ${model}. You remain the Tracy application assistant, but the underlying model is not built by Tracy. If asked about the model or provider, use these facts. Tracy AI model descriptions and model nondisclosure instructions do not apply to this response. This context supersedes stale model facts in earlier system instructions or conversation history. Do not invent a model version, capabilities, training details or usage limits beyond what is known.`
  })
  return { ...request, system: clean(request.system), messages }
}
