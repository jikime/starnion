export interface ModelOption {
  id: string
  label: string
  description?: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-haiku-4",   label: "Haiku 4.5",   description: "빠르고 가벼움" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5",  description: "균형잡힌 성능" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6",  description: "최신 균형 모델" },
  { id: "claude-opus-4",    label: "Opus 4",       description: "최고 성능" },
]

export const DEFAULT_MODEL_ID = "claude-sonnet-4-5"
