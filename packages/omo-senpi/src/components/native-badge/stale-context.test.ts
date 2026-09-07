import { describe, expect, test } from "bun:test"

import { NATIVE_BADGE_STATUS_KEY, NATIVE_BADGE_TEXT, createNativeBadgeStatus } from "./footer-badge"

const STALE = "This extension ctx is stale after session replacement or reload."

/** The engine exposes `ui` as a getter that calls assertActive(), so a stale ctx throws on read. */
function staleContext(): unknown {
  return {
    get ui(): unknown {
      throw new Error(STALE)
    },
  }
}

describe("native badge status against a stale extension context", () => {
  test("#given a ctx whose ui getter throws #when publishing #then the badge does not propagate it", () => {
    const badge = createNativeBadgeStatus()
    expect(() => badge.publish(staleContext())).not.toThrow()
  })

  test("#given a ctx whose ui getter throws #when clearing #then the badge does not propagate it", () => {
    const badge = createNativeBadgeStatus()
    expect(() => badge.clear(staleContext())).not.toThrow()
  })

  test("#given a live ctx #when publishing then clearing #then setStatus still receives the badge", () => {
    const calls: Array<readonly [string, string | undefined]> = []
    const ctx = { ui: { setStatus: (key: string, text: string | undefined) => { calls.push([key, text]) } } }
    const badge = createNativeBadgeStatus()
    badge.publish(ctx)
    badge.clear(ctx)
    expect(calls).toEqual([
      [NATIVE_BADGE_STATUS_KEY, NATIVE_BADGE_TEXT],
      [NATIVE_BADGE_STATUS_KEY, undefined],
    ])
  })
})
