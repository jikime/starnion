export interface Skill {
  id: string
  display_name: string
  description: string
  category: string
  emoji: string
  enabled: boolean
  requires_api_key: boolean
  api_key_provider: string | null
  api_key_type: string | null
  api_key_label: string | null
  api_key_label_1: string | null
  api_key_label_2: string | null
  has_api_key: boolean
  masked_key: string | null
  uses_provider: boolean
  oauth_connected: boolean
  oauth_expires_at: string | null
}

export const CATEGORY_KEYS: Record<string, string> = {
  personal: "categoryPersonal",
  finance: "categoryFinance",
  productivity: "categoryProductivity",
  utility: "categoryUtility",
  search: "categorySearch",
  creative: "categoryCreative",
}

export const CATEGORY_DOT: Record<string, string> = {
  personal: "bg-pink-400",
  finance: "bg-emerald-400",
  productivity: "bg-blue-400",
  utility: "bg-zinc-400",
  search: "bg-sky-400",
  creative: "bg-violet-400",
}

export function isOAuthExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt) < new Date()
}
