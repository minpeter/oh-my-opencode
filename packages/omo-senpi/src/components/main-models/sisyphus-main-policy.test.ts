import { describe, expect, mock, test } from "bun:test"
import { OmoConfigSchema } from "@oh-my-opencode/omo-config-core"
import { FakeExtensionAPI } from "../../../test-support/fake-extension-api"
import { createMainModelsComponent } from "./main-models"

function setup(input: unknown, env: NodeJS.ProcessEnv = {}) {
  let config = OmoConfigSchema.parse(input)
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
  return {
    pi, warn, error, setModelPolicy,
    replaceConfig: (input: unknown) => { config = OmoConfigSchema.parse(input) },
    eventCtx: { cwd: "/isolated/project", sessionSettings: { setModelPolicy } },
  }
}

describe("Senpi MAIN reads the Sisyphus agent policy", () => {
  test("#given agents.sisyphus.models #when startup fires #then that ordered chain becomes the MAIN policy", async () => {
    const h = setup({
      agents: { sisyphus: { models: ["test/first", { model: "test/second", reasoning: "high" }] } },
      profiles: {},
    })
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [
      { model: "test/first" },
      { model: "test/second", thinkingLevel: "high" },
    ] })
  })

  test("#given only the legacy model field #when startup fires #then it supplies a single-model policy", async () => {
    const h = setup({ agents: { sisyphus: { model: "test/legacy", reasoning: "low" } }, profiles: {} })
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [{ model: "test/legacy", thinkingLevel: "low" }] })
  })

  test("#given models alongside a legacy model #when startup fires #then models is authoritative", async () => {
    const h = setup({
      agents: { sisyphus: { model: "test/legacy", models: ["test/canonical"] } },
      profiles: {},
    })
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [{ model: "test/canonical" }] })
  })

  test.each([undefined, "test/legacy"])(
    "#given empty models with legacy %j #when startup fires #then leaves selection and input alone", async (model) => {
      const h = setup({ agents: { sisyphus: { models: [], model } } })
      await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
      expect(h.setModelPolicy).not.toHaveBeenCalled()
      expect(h.error).not.toHaveBeenCalled()
      expect(await h.pi.dispatch("input", {}, h.eventCtx)).toEqual([undefined])
      expect(h.pi.messages).toEqual([])
    },
  )

  test("#given a configured policy #when reloaded with empty models and legacy #then clears the declaration without blocking input", async () => {
    const h = setup({ agents: { sisyphus: { models: ["test/canonical"] } } })
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    h.replaceConfig({ agents: { sisyphus: { models: [], model: "test/legacy" } } })

    await h.pi.dispatch("session_start", { reason: "reload" }, h.eventCtx)

    expect(h.setModelPolicy.mock.calls).toEqual([
      [{ models: [{ model: "test/canonical" }] }],
      [undefined],
    ])
    expect(h.error).not.toHaveBeenCalled()
    expect(await h.pi.dispatch("input", {}, h.eventCtx)).toEqual([undefined])
    expect(h.pi.messages).toEqual([])
  })

  test("#given an older host and empty models with legacy #when startup fires #then does not lock input", async () => {
    const h = setup({ agents: { sisyphus: { models: [], model: "test/legacy" } } })
    await h.pi.dispatch("session_start", { reason: "startup" }, {})
    expect(h.error).not.toHaveBeenCalled()
    expect(await h.pi.dispatch("input", {})).toEqual([undefined])
    expect(h.pi.messages).toEqual([])
  })

  test("#given a different agent only #when startup fires #then MAIN is left unchanged", async () => {
    const h = setup({ agents: { reviewer: { models: ["test/reviewer"] } }, profiles: {} })
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).not.toHaveBeenCalled()
  })
})
