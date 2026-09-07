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

describe("Senpi MAIN reads the Sisyphus agent policy", () => {
  test("#given agents.sisyphus.models #when startup fires #then that ordered chain becomes the MAIN policy", async () => {
    const h = setup({
      agents: { sisyphus: { models: ["test/first", { model: "test/second", reasoning: "high" }] } },
      profiles: {},
    } as OmoConfig)
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [
      { model: "test/first" },
      { model: "test/second", thinkingLevel: "high" },
    ] })
  })

  test("#given only the legacy model field #when startup fires #then it supplies a single-model policy", async () => {
    const h = setup({ agents: { sisyphus: { model: "test/legacy", reasoning: "low" } }, profiles: {} } as OmoConfig)
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [{ model: "test/legacy", thinkingLevel: "low" }] })
  })

  test("#given models alongside a legacy model #when startup fires #then models is authoritative", async () => {
    const h = setup({
      agents: { sisyphus: { model: "test/legacy", models: ["test/canonical"] } },
      profiles: {},
    } as OmoConfig)
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).toHaveBeenCalledWith({ models: [{ model: "test/canonical" }] })
  })

  test("#given a different agent only #when startup fires #then MAIN is left unchanged", async () => {
    const h = setup({ agents: { reviewer: { models: ["test/reviewer"] } }, profiles: {} } as OmoConfig)
    await h.pi.dispatch("session_start", { reason: "startup" }, h.eventCtx)
    expect(h.setModelPolicy).not.toHaveBeenCalled()
  })
})
