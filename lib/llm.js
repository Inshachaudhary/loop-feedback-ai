/**
 * LOOP — LLM helpers (server-only).
 *
 * All calls route through the Emergent Universal LLM proxy which exposes an
 * OpenAI-compatible /v1/chat/completions surface. Anthropic Claude Sonnet 4.5
 * is used as the reasoning model. Embeddings are not exposed by this key, so
 * Ask LOOP performs deterministic lexical retrieval in Postgres and lets
 * Claude generate the final grounded answer from the retrieved passages.
 */

const BASE_URL = process.env.EMERGENT_LLM_BASE_URL || 'https://integrations.emergentagent.com/llm/v1'
const API_KEY = process.env.EMERGENT_LLM_KEY
const CHAT_MODEL = process.env.LLM_CHAT_MODEL || 'claude-sonnet-4-5-20250929'

export const isLLMEnabled = () => Boolean(API_KEY)

async function withTimeout(promise, ms = 45000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  try {
    return await promise(controller.signal)
  } finally {
    clearTimeout(timeout)
  }
}

async function chat({ system, user, temperature = 0.2, maxTokens = 1200, jsonOnly = false }) {
  if (!API_KEY) throw new Error('EMERGENT_LLM_KEY is not configured')
  const messages = []
  if (system) messages.push({ role: 'system', content: system })
  messages.push({ role: 'user', content: user })
  const body = { model: CHAT_MODEL, messages, temperature, max_tokens: maxTokens }
  const response = await withTimeout(
    (signal) => fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify(body),
      signal,
    }),
    45000,
  )
  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`LLM request failed (${response.status}): ${errorText.slice(0, 400)}`)
  }
  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('LLM response contained no content')
  if (!jsonOnly) return content
  // Extract a JSON object from the response even if the model wrapped it in fences.
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content]
  const raw = (match[1] || content).trim()
  try {
    return JSON.parse(raw)
  } catch (error) {
    // As a last resort, find the first {...} block in the text.
    const fallback = raw.match(/\{[\s\S]*\}/)
    if (fallback) return JSON.parse(fallback[0])
    throw new Error(`Failed to parse LLM JSON: ${error.message}`)
  }
}

/**
 * Classify a single feedback item. Returns strict JSON validated by the caller.
 */
export async function classifyFeedback({ content, knownThemes = [] }) {
  const themesHint = knownThemes.length
    ? `Existing workspace themes (prefer reusing these names when applicable): ${knownThemes.map((t) => t.name).join(', ')}.`
    : 'This workspace has no themes yet — feel free to propose 1-3 concise new ones.'
  const system = `You are LOOP, a senior customer research analyst. You classify a single customer feedback message and return STRICT JSON only, no prose, no code fences.
Return this schema:
{
  "sentiment": "POS" | "NEU" | "NEG",
  "sentimentScore": number between -1 and 1,
  "themes": string[] (1-3 short Title Case theme names, e.g. "Onboarding", "Pricing", "Reliability"),
  "featureArea": string (short, e.g. "Billing", "Mobile App", "Search", "API"),
  "rationale": string (one concise sentence explaining the classification)
}
${themesHint}`
  const user = `Feedback:\n"""${content.slice(0, 2000)}"""\n\nRespond with JSON only.`
  const result = await chat({ system, user, jsonOnly: true, maxTokens: 400 })
  return result
}

/**
 * Ask LOOP — grounded question answering. Consumes an already-retrieved set of
 * feedback passages (workspace-scoped) and asks Claude to answer strictly from
 * them, citing evidence by numeric index.
 */
export async function askLoop({ question, passages }) {
  if (!passages.length) {
    return {
      answer: "There isn't enough feedback in the workspace yet to answer that. Try ingesting more customer feedback first.",
      evidenceIds: [],
    }
  }
  const grounded = passages
    .map((p, index) => `[${index + 1}] (${p.sentiment}, ${p.channel}${p.customerLabel ? `, ${p.customerLabel}` : ''}) "${p.content.slice(0, 500)}"`)
    .join('\n')
  const system = `You are LOOP, an evidence-grounded customer feedback analyst. You answer the user's question STRICTLY from the numbered feedback passages provided. Never invent quotes or claims that are not supported. If the passages do not answer the question, say so plainly.
Return STRICT JSON only:
{
  "answer": string (3-6 sentences, plain text, no markdown headers),
  "evidenceIndices": number[] (1-based indices from the passages you actually relied on, ordered by importance),
  "confidence": "low" | "medium" | "high"
}`
  const user = `Question: ${question}\n\nAvailable feedback:\n${grounded}\n\nAnswer strictly from these passages. Respond with JSON only.`
  const result = await chat({ system, user, jsonOnly: true, maxTokens: 700, temperature: 0.15 })
  return result
}

/**
 * Generate a Voice-of-Customer narrative from real, pre-computed statistics.
 * The caller provides the numbers; Claude only writes the prose.
 */
export async function generateVoiceOfCustomer({ periodLabel, stats, topThemes, quotes, sentimentShift }) {
  const system = `You are LOOP, a customer intelligence writer. You are given real workspace statistics, top themes, quotes, and a sentiment shift number. Write a concise Voice-of-Customer report. Do NOT invent numbers or quotes. Return STRICT JSON only:
{
  "executiveSummary": string (2-3 sentences, plain text),
  "sentimentNarrative": string (2 sentences describing the sentiment picture),
  "themeInsights": [ { "theme": string, "insight": string (1-2 sentences) } ] (one per input theme, same theme names),
  "recommendedActions": string[] (3-5 short, imperative actions, no numbering)
}`
  const user = `Period: ${periodLabel}
Stats: ${JSON.stringify(stats)}
Sentiment shift vs previous period (percentage points on % negative): ${sentimentShift}
Top themes (with counts): ${JSON.stringify(topThemes)}
Notable customer quotes: ${JSON.stringify(quotes)}
Respond with JSON only.`
  const result = await chat({ system, user, jsonOnly: true, maxTokens: 900, temperature: 0.3 })
  return result
}
