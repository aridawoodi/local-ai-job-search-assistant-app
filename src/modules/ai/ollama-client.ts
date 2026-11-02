/**
 * Direct Ollama HTTP client (desktop has no DNR Origin strip — localhost is fine).
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OllamaGenerateResult {
  ok: boolean
  text: string
  model: string
  message: string
  raw?: unknown
}

function baseUrl(url: string): string {
  return (url || 'http://127.0.0.1:11434').replace(/\/$/, '')
}

async function pickModel(url: string, preferred?: string): Promise<string> {
  if (preferred) return preferred
  try {
    const res = await fetch(`${baseUrl(url)}/api/tags`, {
      signal: AbortSignal.timeout(4000)
    })
    if (!res.ok) return 'qwen2.5:3b'
    const json = (await res.json()) as { models?: Array<{ name?: string }> }
    const names = (json.models || []).map((m) => m.name || '').filter(Boolean)
    return names[0] || 'qwen2.5:3b'
  } catch {
    return 'qwen2.5:3b'
  }
}

/** Non-streaming chat against /api/chat. */
export async function ollamaChat(
  url: string,
  messages: ChatMessage[],
  opts?: { model?: string; temperature?: number; timeoutMs?: number }
): Promise<OllamaGenerateResult> {
  const model = await pickModel(url, opts?.model)
  const timeoutMs = opts?.timeoutMs ?? 120_000
  try {
    const res = await fetch(`${baseUrl(url)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages,
        options: { temperature: opts?.temperature ?? 0.3 }
      }),
      signal: AbortSignal.timeout(timeoutMs)
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return {
        ok: false,
        text: '',
        model,
        message: `Ollama chat failed (${res.status}): ${body.slice(0, 200)}`
      }
    }
    const json = (await res.json()) as {
      message?: { content?: string }
      response?: string
    }
    const text = String(json.message?.content || json.response || '').trim()
    return {
      ok: Boolean(text),
      text,
      model,
      message: text ? 'OK' : 'Empty model response',
      raw: json
    }
  } catch (err) {
    return {
      ok: false,
      text: '',
      model,
      message: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Extract first JSON object from a model reply (fenced or raw). */
export function extractJsonObject<T = Record<string, unknown>>(text: string): T | null {
  const raw = String(text || '').trim()
  if (!raw) return null
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fence ? fence[1] : raw).trim()
  try {
    return JSON.parse(candidate) as T
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}
