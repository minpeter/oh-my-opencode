import { describe, expect, test } from "bun:test"

import { readSessionSurfaceForTest } from "./index"

const STALE = "This extension ctx is stale after session replacement or reload."

function staleOn(key: string): unknown {
  return {
    sessionManager: { getSessionId: () => "ses_live", getEntries: () => [{ type: "text" }, { type: "text" }] },
    get [key](): unknown { throw new Error(STALE) },
  }
}

describe("memory session surface against a stale extension context", () => {
  test("#given a stale ui getter #when the surface is read #then it degrades to no ui", () => {
    expect(() => readSessionSurfaceForTest(staleOn("ui"))).not.toThrow()
    const surface = readSessionSurfaceForTest(staleOn("ui"))
    expect(surface.ui).toBeUndefined()
    expect(surface.id).toBe("ses_live")
  })

  test("#given a stale sessionManager getter #when the surface is read #then it degrades to unknown-session", () => {
    const stale = { get sessionManager(): unknown { throw new Error(STALE) } }
    expect(() => readSessionSurfaceForTest(stale)).not.toThrow()
    expect(readSessionSurfaceForTest(stale).id).toBe("unknown-session")
  })

  test("#given a healthy context #when the surface is read #then id, entries and ui all resolve", () => {
    const notified: string[] = []
    const surface = readSessionSurfaceForTest({
      sessionManager: {
        getSessionId: () => "ses_ok",
        getEntries: () => [{ type: "text" }, { type: "text" }, { type: "text" }],
      },
      ui: { notify: (message: string) => { notified.push(message) } },
    })
    expect(surface.id).toBe("ses_ok")
    expect(surface.entries).toEqual([{ type: "text" }, { type: "text" }, { type: "text" }])
    surface.ui?.notify("hi", "warning")
    expect(notified).toEqual(["hi"])
  })
})
