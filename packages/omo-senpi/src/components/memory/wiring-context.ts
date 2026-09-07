import type { StatusUi } from "./wiring-types"

/**
 * Reads one property off an unknown extension context.
 *
 * The engine builds its context from getters that assert the context is still active, so reading any
 * of them on a context invalidated by a session replacement or reload throws. Event handlers run on
 * paths that also fire while a model error is retried, so letting that escape surfaces an extension
 * stack instead of a session. A stale context simply carries no surface.
 */
export function readContextProperty(value: unknown, key: string): unknown {
  if (!isRecord(value)) return undefined
  try {
    return Reflect.get(value, key)
  } catch {
    return undefined
  }
}

function sessionManagerFrom(eventCtx: unknown): Record<string, unknown> | undefined {
  const manager = readContextProperty(eventCtx, "sessionManager")
  return isRecord(manager) ? manager : undefined
}

export function sessionIdFrom(eventCtx: unknown): string | undefined {
  const manager = sessionManagerFrom(eventCtx)
  const getter = manager?.getSessionId
  if (typeof getter !== "function") return undefined
  const id = Reflect.apply(getter, manager, [])
  return typeof id === "string" && id.length > 0 ? id : undefined
}

export function branchEntryCount(eventCtx: unknown): number {
  const manager = sessionManagerFrom(eventCtx)
  const getEntries = manager?.getEntries
  if (typeof getEntries !== "function") return 0
  const entries = Reflect.apply(getEntries, manager, [])
  return Array.isArray(entries) ? entries.length : 0
}

export function readUi(eventCtx: unknown): StatusUi | undefined {
  const ui = readContextProperty(eventCtx, "ui")
  if (!isRecord(ui)) return undefined
  if (typeof ui.setStatus !== "function" || typeof ui.notify !== "function") return undefined
  return {
    setStatus: (key, text) => Reflect.apply(ui.setStatus as (...args: unknown[]) => unknown, ui, [key, text]),
    notify: (message, level) => Reflect.apply(ui.notify as (...args: unknown[]) => unknown, ui, [message, level]),
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
