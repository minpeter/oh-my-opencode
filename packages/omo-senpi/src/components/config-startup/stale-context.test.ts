import { describe, expect, test } from "bun:test"

import { FakeExtensionAPI } from "../../../test-support/fake-extension-api"
import type { ComponentContext } from "../../extension/types"
import { createConfigStartupComponent } from "./index"

const STALE = "This extension ctx is stale after session replacement or reload."

function harness() {
  const pi = new FakeExtensionAPI()
  const warned: string[] = []
  const context = {
    config: { getFlag: () => undefined },
    logger: { debug() {}, info() {}, warn: (message: string) => { warned.push(message) }, error() {} },
  } as unknown as ComponentContext
  createConfigStartupComponent({
    loadConfig: () => ({
      config: {},
      diagnostics: [{ kind: "validation", message: "boom", path: "/project/.omo/omo.jsonc" }],
      layers: [],
      sources: [],
    }) as never,
    resolveCwd: () => "/project",
    runMigration: () => ({ journalResumed: false, migratedFrom: [], results: [] }),
  }).register(pi, context)
  return { pi, warned }
}

/** The engine context exposes `ui` as a getter that asserts the context is still active. */
function staleUiContext(): unknown {
  return {
    get ui(): unknown { throw new Error(STALE) },
  }
}

describe("config-startup against a stale extension context", () => {
  test("#given a ctx whose ui getter throws #when session_start fires #then it does not propagate", async () => {
    const h = harness()
    await expect(h.pi.dispatch("session_start", {}, staleUiContext())).resolves.toBeDefined()
  })

  test("#given a ctx whose ui getter throws #when session_start fires #then the notice falls back to the logger", async () => {
    const h = harness()
    await h.pi.dispatch("session_start", {}, staleUiContext()).catch(() => undefined)
    expect(h.warned).toEqual(["omo-senpi: configuration diagnostics: boom"])
  })
})
