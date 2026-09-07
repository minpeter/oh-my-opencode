import { describe, expect, mock, test } from "bun:test"
import type { OmoConfig } from "@oh-my-opencode/omo-config-core"
import { FakeExtensionAPI } from "../../../test-support/fake-extension-api"
import { createMainModelsComponent } from "./main-models"

function setup(config: OmoConfig, env: NodeJS.ProcessEnv = {}) {
  const pi = new FakeExtensionAPI()
  const warn = mock(() => {})
  const error = mock(() => {})
  const setModelPolicy = mock(async (_policy: unknown) => {})
  const component = createMainModelsComponent({
    env,
    loadConfig: () => ({ config, diagnostics: [], layers: [], sources: [] }),
  })
  component.register(pi, {
    config: { getFlag: (name) => pi.getFlag(name) },
    logger: { debug() {}, info() {}, warn, error },
  })
  return { pi, warn, error, setModelPolicy, eventCtx: { cwd: "/isolated/project", sessionSettings: { setModelPolicy } } }
}

describe("main-models component", () => {
  test("#given no main config #when startup fires #then leaves engine defaults alone", async () => {
    const h = setup({})
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).not.toHaveBeenCalled()
    expect(h.warn).not.toHaveBeenCalled()
  })

  test("#given ordered model strings and objects #when startup fires #then forwards only that policy with reasoning", async () => {
    const h = setup({ agents: { sisyphus: { models: ["test/first:high", { model: "test/second", reasoning: "low" }] } }, profiles: {} } as OmoConfig)
    await h.pi.dispatch("session_start", { reason: "startup", initialModelProvenance: "cli" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [
      { model: "test/first", thinkingLevel: "high" },
      { model: "test/second", thinkingLevel: "low" },
    ] })
    await h.pi.dispatch("before_agent_start", {}, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledTimes(1)
  })

  test.each(["OMO_SENPI_TASK_RPC_CHILD", "SENPI_TASK_MEMBER_TASK_ID", "SENPI_MEMORY_REFLECTION", "SENPI_MEMORY_FACTS", "SENPI_MEMORY_MEMORIAN"])(
    "#given child marker %s #when startup fires #then does not install main policy", async (marker) => {
      const h = setup({ agents: { sisyphus: { models: ["test/main"] } }, profiles: {} } as OmoConfig, { [marker]: "1" })
      await h.pi.dispatch("session_start", {}, h.eventCtx)
      expect(h.setModelPolicy).not.toHaveBeenCalled()
    },
  )

  test("#given an older host #when main config exists #then errors and blocks input without persistent fallback writes", async () => {
    const h = setup({ agents: { sisyphus: { models: ["test/main"] } }, profiles: {} } as OmoConfig)
    const setFallbackChain = mock(() => {})
    await h.pi.dispatch("session_start", {}, { sessionSettings: { setFallbackChain } })
    expect(h.error).toHaveBeenCalledTimes(1)
    expect(setFallbackChain).not.toHaveBeenCalled()
    expect(await h.pi.dispatch("input", {}, h.eventCtx)).toEqual([{ action: "handled" }])
  })

  test("#given policy application failure #when input arrives #then blocks it until a successful reload", async () => {
    const h = setup({ agents: { sisyphus: { models: ["test/main"] } }, profiles: {} } as OmoConfig)
    h.setModelPolicy.mockRejectedValueOnce(new Error("unknown exact model"))
    await h.pi.dispatch("session_start", {}, h.eventCtx)
    expect(h.error).toHaveBeenCalledTimes(1)
    expect(await h.pi.dispatch("input", {}, h.eventCtx)).toEqual([{ action: "handled" }])
    await h.pi.dispatch("session_start", { reason: "reload" }, h.eventCtx)
    expect(await h.pi.dispatch("input", {}, h.eventCtx)).toEqual([undefined])
  })

  test.each([undefined, null, "invalid", { sessionSettings: { setModelPolicy: "invalid" } }])(
    "#given malformed context %j #when startup fires #then reports unavailable capability without throwing", async (eventCtx) => {
      const h = setup({ agents: { sisyphus: { models: ["test/main"] } }, profiles: {} } as OmoConfig)
      await h.pi.dispatch("session_start", null, eventCtx)
      expect(h.error).toHaveBeenCalledTimes(1)
    },
  )

  test("#given a removed config on reload #when startup fires #then clears the session override", async () => {
    const h = setup({})
    await h.pi.dispatch("session_start", { reason: "reload" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith(undefined)
  })
})
