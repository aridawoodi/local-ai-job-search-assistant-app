export interface OllamaStatus {
  reachable: boolean
  url: string
  version?: string
  models?: string[]
  message: string
}
