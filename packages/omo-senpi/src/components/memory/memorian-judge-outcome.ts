import type { ChildSessionEvent, RunnerOutcome } from "@oh-my-opencode/senpi-task"

import { containsSecretLikeMaterial } from "@oh-my-opencode/memory-core"

import { GATE_REASON_MAX_CHARS } from "./memorian-notice"

export type JudgeTurnClassification =
  | { readonly status: "completed" }
  | { readonly status: "failed"; readonly cause: "child_failed"; readonly reason?: string }
  | { readonly status: "dropped"; readonly cause: "cancelled" }

export function classifyJudgeTurn(outcome: RunnerOutcome): JudgeTurnClassification {
  if (outcome.status === "completed") return { status: "completed" }
  if (outcome.status === "cancelled") return { status: "dropped", cause: "cancelled" }
  const reason = normalizeGateReason(outcome.failure.message)
  return reason === undefined
    ? { status: "failed", cause: "child_failed" }
    : { status: "failed", cause: "child_failed", reason }
}

/** Provider failures are emitted before a child turn settles while the provider retry loop runs. */
export function classifyJudgeEvent(event: ChildSessionEvent): { readonly reason: string } | undefined {
  if (event.type !== "message_end" || !isRecord(event.message)) return undefined
  const stopReason = event.message["stopReason"]
  const errorMessage = event.message["errorMessage"]
  if ((stopReason !== "error" && stopReason !== "aborted") || typeof errorMessage !== "string") return undefined
  return UPSTREAM_FAILURE_PATTERN.test(errorMessage) ? { reason: errorMessage } : undefined
}

const UPSTREAM_FAILURE_PATTERN = /\\b503\\b|auth[_ -]?unavailable|overloaded/iu

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function normalizeGateReason(message: string | undefined): string | undefined {
  if (message === undefined) return undefined
  const text = message.replace(/[\u0000-\u001F\u007F-\u009F]/gu, "").replace(/\s+/gu, " ").trim()
  if (text.length === 0) return undefined
  if (containsSecretLikeMaterial(text)) return "redacted"
  return text.length > GATE_REASON_MAX_CHARS
    ? `${text.slice(0, GATE_REASON_MAX_CHARS - 1)}…`
    : text
}
