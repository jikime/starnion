export interface ModelOption {
  id: string
  label: string
  descriptionKey?: string
}

export const AVAILABLE_MODELS: ModelOption[] = [
  { id: "claude-haiku-4",    label: "Haiku 4.5",   descriptionKey: "modelDescHaiku" },
  { id: "claude-sonnet-4-5", label: "Sonnet 4.5",  descriptionKey: "modelDescSonnet45" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6",  descriptionKey: "modelDescSonnet46" },
  { id: "claude-opus-4",     label: "Opus 4",      descriptionKey: "modelDescOpus" },
]

export const DEFAULT_MODEL_ID = "claude-sonnet-4-5"
