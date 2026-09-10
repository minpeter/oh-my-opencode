import { describe, expect, test } from "bun:test"

import { branchEntryCount, readContextProperty, readUi, sessionIdFrom } from "./wiring-context"

const STALE = "This extension ctx is stale after session replacement or reload."

/** The engine builds its extension context from getters that assert the ctx is still active. */
function staleOn(key: string): unknown {
  return {
    get [key](): unknown { throw new Error(STALE) },
  }
}

function liveCtx() {
  return {
    sessionManager: { getSessionId: () => "ses_live", getEntries: () => [1, 2, 3] },
    ui: { setStatus: () => {}, notify: () => {} },
  }
}

describe("safe extension-context reads", () => {
  test("#given a throwing getter #when the property is read #then undefined is returned", () => {
    expect(readContextProperty(staleOn("sessionManager"), "sessionManager")).toBeUndefined()
    expect(readContextProperty(staleOn("ui"), "ui")).toBeUndefined()
  })

  test("#given a healthy context #when the property is read #then the value is returned", () => {
    const ctx = liveCtx()
    expect(readContextProperty(ctx, "sessionManager")).toBe(ctx.sessionManager)
    expect(readContextProperty(undefined, "ui")).toBeUndefined()
  })

  test("#given a stale sessionManager #when the memory readers run #then they degrade instead of throwing", () => {
    const ctx = staleOn("sessionManager")
    expect(() => sessionIdFrom(ctx)).not.toThrow()
    expect(sessionIdFrom(ctx)).toBeUndefined()
    expect(() => branchEntryCount(ctx)).not.toThrow()
    expect(branchEntryCount(ctx)).toBe(0)
  })

  test("#given a stale ui #when readUi runs #then it degrades instead of throwing", () => {
    expect(() => readUi(staleOn("ui"))).not.toThrow()
    expect(readUi(staleOn("ui"))).toBeUndefined()
  })

  test("#given a healthy context #when the memory readers run #then they still resolve", () => {
    const ctx = liveCtx()
    expect(sessionIdFrom(ctx)).toBe("ses_live")
    expect(branchEntryCount(ctx)).toBe(3)
    expect(readUi(ctx)).toBeDefined()
  })
})
