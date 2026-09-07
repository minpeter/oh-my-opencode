import { describe, expect, test } from "bun:test"

const STALE = "This extension ctx is stale after session replacement or reload."

/** The engine builds its extension context from getters that assert the ctx is still active. */
function staleOn(key: string): unknown {
  return { get [key](): unknown { throw new Error(STALE) } }
}

/**
 * Every memory reader that extracts a surface off the RAW event context must degrade on a stale
 * context. These run on session_start / agent_settled / tool_call, and agent_settled is the event
 * whose stale-context crash was captured on the real TUI.
 */
describe("memory context readers against a stale extension context", () => {
  test("#given a stale sessionManager #when the journal branch surface is read #then it degrades", async () => {
    const mod = await import("./journal-wiring")
    const read = (mod as unknown as { readBranchSurfaceForTest?: (v: unknown) => unknown }).readBranchSurfaceForTest
    expect(typeof read).toBe("function")
    expect(() => read?.(staleOn("sessionManager"))).not.toThrow()
    expect(read?.(staleOn("sessionManager"))).toBeUndefined()
  })

  test("#given a stale sessionManager #when the guard reads the session id #then it degrades", async () => {
    const mod = await import("./guard")
    const read = (mod as unknown as { readSessionIdForTest?: (v: unknown) => string }).readSessionIdForTest
    expect(typeof read).toBe("function")
    expect(() => read?.(staleOn("sessionManager"))).not.toThrow()
    expect(read?.(staleOn("sessionManager"))).toBe("unknown-session")
  })

  test("#given a stale sessionManager #when the nudge reader runs #then it degrades", async () => {
    const mod = await import("./nudge-wiring")
    const read = (mod as unknown as { readSessionIdForTest?: (v: unknown) => string | undefined }).readSessionIdForTest
    expect(typeof read).toBe("function")
    expect(() => read?.(staleOn("sessionManager"))).not.toThrow()
    expect(read?.(staleOn("sessionManager"))).toBeUndefined()
  })

  test("#given a stale sessionManager #when the skills-scope reader runs #then it degrades", async () => {
    const mod = await import("./skills-scope")
    const read = (mod as unknown as { readSessionIdForTest?: (v: unknown) => string | undefined }).readSessionIdForTest
    expect(typeof read).toBe("function")
    expect(() => read?.(staleOn("sessionManager"))).not.toThrow()
    expect(read?.(staleOn("sessionManager"))).toBeUndefined()
  })
})
