import type { ResolvedModelRecord } from "@oh-my-opencode/senpi-task"

import type { ReflectionModelResolution } from "./worker/resolve-model"

export type MemorianJudgeChain = {
  /** The bare primary selector: the key the child's runtime fallback chains are registered under. */
  readonly selectedModel: string
  /** The remaining in-category rungs, in order. Empty when the category resolves to one model. */
  readonly fallbackModels: readonly ResolvedModelRecord[]
}

/**
 * The judge carries the configured category chain INTO the child: an upstream failure on the
 * primary rung is then the child's retry/fallback machinery recovering, not a gate verdict. Only
 * the in-category chain rides along - the beyond-category ladder (registry_fallback /
 * session_inherit) is refused at resolution, before this conversion.
 */
export function memorianJudgeChain(
  resolution: Extract<ReflectionModelResolution, { readonly kind: "resolved" }>,
): MemorianJudgeChain {
  return {
    selectedModel: resolution.model,
    fallbackModels: resolution.fallbacks.map((candidate): ResolvedModelRecord => {
      const [provider, ...rest] = candidate.model.split("/")
      return {
        provider: provider ?? candidate.model,
        model_id: rest.join("/"),
        display: candidate.model,
        ...(candidate.thinking === undefined ? {} : { reasoning: candidate.thinking }),
        source: "category",
      }
    }),
  }
}
