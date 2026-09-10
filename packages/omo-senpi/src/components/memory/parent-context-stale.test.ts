import { describe, expect, test } from "bun:test"

import { readSession } from "./recall-session-read"
import {
  resolveParentCacheReusable,
  resolveParentContextTokens,
  resolveParentSessionFile,
} from "./session-context-resolver"

const STALE = "This extension ctx is stale after session replacement or reload."

function staleOn(key: string): unknown {
  return { get [key](): unknown { throw new Error(STALE) } }
}

const live = {
  sessionManager: {
    getSessionId: () => "ses_live",
    getBranch: () => [{ role: "user", content: "hi" }],
    getUsageTotals: () => ({ cacheRead: 12 }),
    getSessionFile: () => "/tmp/ses.jsonl",
  },
  getContextUsage: () => ({ tokens: 42 }),
}

describe("recall and parent-context readers against a stale extension context", () => {
  test("#given a stale sessionManager #when the recall session is read #then it degrades", () => {
    expect(() => readSession(staleOn("sessionManager"))).not.toThrow()
    expect(readSession(staleOn("sessionManager"))).toBeUndefined()
  })

  test("#given a stale sessionManager #when parent cache reuse is resolved #then it degrades", () => {
    expect(() => resolveParentCacheReusable(staleOn("sessionManager"))).not.toThrow()
    expect(resolveParentCacheReusable(staleOn("sessionManager"))).toBe(false)
  })

  test("#given a stale sessionManager #when the parent session file is resolved #then it degrades", () => {
    expect(() => resolveParentSessionFile(staleOn("sessionManager"))).not.toThrow()
    expect(resolveParentSessionFile(staleOn("sessionManager"))).toBeUndefined()
  })

  test("#given a stale getContextUsage #when parent tokens are resolved #then it degrades", () => {
    expect(() => resolveParentContextTokens(staleOn("getContextUsage"))).not.toThrow()
    expect(resolveParentContextTokens(staleOn("getContextUsage"))).toBeUndefined()
  })

  test("#given a healthy context #when the readers run #then they all resolve", () => {
    expect(readSession(live)?.id).toBe("ses_live")
    expect(resolveParentCacheReusable(live)).toBe(true)
    expect(resolveParentSessionFile(live)).toBe("/tmp/ses.jsonl")
    expect(resolveParentContextTokens(live)).toBe(42)
  })
})
