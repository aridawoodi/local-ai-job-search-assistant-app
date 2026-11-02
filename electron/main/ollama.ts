import type { OllamaStatus } from '../../src/shared/ollama'

export type { OllamaStatus }

/**
 * Soft dependency: Milestone 1 only needs a reachability indicator.
 * Does not start Ollama; just probes the local HTTP API.
 */
export async function checkOllama(url: string): Promise<OllamaStatus> {
  const base = url.replace(/\/$/, '') || 'http://127.0.0.1:11434'
  try {
    const versionRes = await fetch(`${base}/api/version`, {
      signal: AbortSignal.timeout(2500)
    })
    if (!versionRes.ok) {
      return {
        reachable: false,
        url: base,
        message: `Ollama responded ${versionRes.status} at ${base}`
      }
    }
    const versionJson = (await versionRes.json()) as { version?: string }

    let models: string[] = []
    try {
      const tagsRes = await fetch(`${base}/api/tags`, {
        signal: AbortSignal.timeout(2500)
      })
      if (tagsRes.ok) {
        const tags = (await tagsRes.json()) as {
          models?: Array<{ name?: string }>
        }
        models = (tags.models || []).map((m) => m.name || '').filter(Boolean)
      }
    } catch {
      // version worked; tags optional
    }

    return {
      reachable: true,
      url: base,
      version: versionJson.version,
      models,
      message: versionJson.version
        ? `Ollama ${versionJson.version} reachable`
        : 'Ollama reachable'
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return {
      reachable: false,
      url: base,
      message: `Ollama not reachable at ${base} (${detail})`
    }
  }
}
